const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'campus.db');
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 8000);
const DEMO_USER_ID = 'demo-user';
const DEMO_FEED_USER_ID = 'demo-feed';

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    student_id TEXT NOT NULL DEFAULT '',
    building TEXT NOT NULL DEFAULT '',
    room TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT NOT NULL,
    intent TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    price TEXT NOT NULL DEFAULT '',
    place TEXT NOT NULL DEFAULT '',
    time_text TEXT NOT NULL DEFAULT '',
    contact TEXT NOT NULL DEFAULT '',
    extra_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'claimed',
    created_at INTEGER NOT NULL,
    UNIQUE(post_id, user_id),
    FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS free_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'reserved',
    created_at INTEGER NOT NULL,
    UNIQUE(post_id, user_id),
    FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    post_id INTEGER,
    type TEXT NOT NULL DEFAULT 'info',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    read_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_posts_user_status ON posts(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_posts_category_status ON posts(category, status);
  CREATE INDEX IF NOT EXISTS idx_claims_user ON claims(user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at);
`);

const claimsTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'claims'").get()?.sql || '';
if (/post_id\s+INTEGER\s+NOT\s+NULL\s+UNIQUE/i.test(claimsTableSql)) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`
    BEGIN;
    CREATE TABLE claims_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'claimed',
      created_at INTEGER NOT NULL,
      UNIQUE(post_id, user_id),
      FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    INSERT INTO claims_v2 (id, post_id, user_id, status, created_at)
      SELECT id, post_id, user_id, status, created_at FROM claims;
    DROP TABLE claims;
    ALTER TABLE claims_v2 RENAME TO claims;
    COMMIT;
  `);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('CREATE INDEX IF NOT EXISTS idx_claims_user ON claims(user_id)');
}

const userColumns = db.prepare('PRAGMA table_info(users)').all().map(column => column.name);
if (!userColumns.includes('avatar')) db.exec("ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT ''");
const postColumns = db.prepare('PRAGMA table_info(posts)').all().map(column => column.name);
if (!postColumns.includes('quantity')) db.exec("ALTER TABLE posts ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1");
if (!postColumns.includes('available_quantity')) db.exec("ALTER TABLE posts ADD COLUMN available_quantity INTEGER NOT NULL DEFAULT 1");
// Bring records created by older versions into the private matched state.
db.prepare("UPDATE posts SET status = 'matched' WHERE status = 'active' AND category NOT IN ('免费送', '拼车', '拼车搭子') AND EXISTS (SELECT 1 FROM claims c WHERE c.post_id = posts.id)").run();
db.prepare("UPDATE posts SET status = 'matched' WHERE status = 'active' AND category = '免费送' AND available_quantity <= 0").run();

const now = Date.now();
db.prepare(`
  INSERT OR IGNORE INTO users
  (id, name, student_id, building, room, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(DEMO_USER_ID, '林同学', '20****018', '3号楼', '521', now, now);

db.prepare(`
  INSERT OR IGNORE INTO users
  (id, name, student_id, building, room, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(DEMO_FEED_USER_ID, '校园助手', '', '', '', now, now);

const DEMO_SEED = 'demo-v2';
const CATEGORY_ALIASES = {
  '拼车搭子': ['拼车搭子', '拼车'],
  '出租': ['出租', '租借'],
  '服务': ['服务', '代取', '捎物', '同楼互助'],
  '代购': ['代购', '代买'],
  '免费送': ['免费送'],
  '二手好物': ['二手好物', '票券']
};
const demoPosts = [
  ['服务', '妆造', 'seek', '周末拍照需要校园妆造搭子', '艺术楼化妆间', '面议', '周六 14:00 前', '基础妆面即可，可提前沟通风格和时间', {}],
  ['出租', '电动车', 'offer', '电动车空闲半天，可校内短租', '西区生活区', '8/小时', '今天 14:00 后', '电量充足，归还时停回原位即可', {}],
  ['代购', '学子超市', 'seek', '求顺路带两瓶矿泉水和一盒牛奶', '学子超市 → 3号宿舍楼', '3', '今天 16:00 前', '品牌不限，送到楼下即可', {}],
  ['拼车搭子', '新乡东', 'seek', '今天 12:20 去新乡东站，找同路', '东门集合 → 新乡东站', '', '今天 12:20', '行李不多，准时出发', { people: '4', gender: '不限' }],
  ['拼车搭子', '宝龙', 'seek', '今天 15:00 去宝龙，返程可商量', '西门集合 → 宝龙广场', '', '今天 15:00', '还需两位同学', { people: '3', gender: '不限' }],
  ['拼车搭子', '回学校', 'seek', '今晚从高铁站回学校，找搭子', '新乡东站 → 学校东门', '', '今天 20:30', '到站后一起叫车', { people: '3', gender: '不限' }],
  ['二手好物', '教材', 'offer', '高数教材上下册，笔记很少', '校本部图书馆', '20', '今天可面交', '书页完整，无缺页', {}],
  ['免费送', '', 'offer', '台灯功能完好，宿舍楼下自取', '西区 6 号宿舍楼', '', '今天可领取', '暖光台灯一盏，先到先得', { quantity: 1 }],
  ['二手好物', '生活用品', 'offer', '九成新收纳用品，毕业闲置转让', '东区食堂门口', '35', '明天下午', '保存完好，可现场查看', {}]
];

// Seed a small, stable set of examples so the action-board layout is visible on first launch.
db.prepare("DELETE FROM posts WHERE extra_json LIKE '%demo-v2%'").run();
db.prepare("UPDATE posts SET user_id = ? WHERE user_id = ? AND extra_json LIKE '%demo-v2%'").run(DEMO_FEED_USER_ID, DEMO_USER_ID);
db.prepare("UPDATE posts SET subcategory = '宝龙' WHERE category = '代买' AND subcategory = '奶茶' AND extra_json LIKE '%demo-v2%'").run();
db.prepare("UPDATE posts SET subcategory = '小吃街' WHERE category = '代买' AND subcategory = '校外' AND extra_json LIKE '%demo-v2%'").run();
db.prepare("UPDATE posts SET subcategory = '学子超市' WHERE category = '代买' AND subcategory = '超市' AND extra_json LIKE '%demo-v2%'").run();
const findExistingDemo = db.prepare(`
  SELECT id FROM posts
  WHERE user_id = ? AND category = ? AND subcategory = ? AND extra_json LIKE '%demo-v2%'
  LIMIT 1
`);
const updateDemo = db.prepare(`
  UPDATE posts
  SET intent = ?, title = ?, detail = ?, price = ?, place = ?, time_text = ?, extra_json = ?, status = 'active'
  WHERE id = ?
`);
const insertDemo = db.prepare(`
  INSERT INTO posts
  (user_id, category, subcategory, intent, title, detail, price, place,
   time_text, contact, extra_json, status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, 'active', ?)
`);
demoPosts.forEach((item, index) => {
  const extra = { ...item[8], demoSeed: DEMO_SEED };
  const extraJson = JSON.stringify(extra);
  const existing = findExistingDemo.get(DEMO_FEED_USER_ID, item[0], item[1]);
  if (existing) updateDemo.run(item[2], item[3], item[7], item[5], item[4], item[6], extraJson, existing.id);
  else insertDemo.run(
    DEMO_FEED_USER_ID, item[0], item[1], item[2], item[3], item[7], item[5], item[4], item[6],
    extraJson, now - index * 60000
  );
});

function json(res, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(body);
}

function error(res, status, message) {
  json(res, status, { error: message });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('请求内容过大'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('请求 JSON 格式不正确')); }
    });
    req.on('error', reject);
  });
}

function parseExtra(raw) {
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

function postFromRow(row, userId) {
  const category = ['代取', '捎物', '同楼互助'].includes(row.category) ? '服务' : row.category;
  const isOwner = row.user_id === userId;
  const claimedByMe = Boolean(row.claimed_by_me);
  const extra = parseExtra(row.extra_json);
  if (!isOwner && !claimedByMe) delete extra.contactQr;
  return {
    id: row.id,
    category,
    subcategory: row.subcategory,
    intent: row.intent,
    title: row.title,
    detail: row.detail,
    price: row.price,
    place: row.place,
    time: row.time_text,
    contact: isOwner || claimedByMe ? row.contact : '',
    extra,
    status: row.status,
    createdAt: row.created_at,
    claimed: Boolean(row.claimed),
    claimedByMe,
    isOwner,
    ownerName: row.owner_name || '',
    quantity: row.quantity || 1,
    availableQuantity: row.available_quantity == null ? 1 : row.available_quantity,
    participantCount: Number(row.participant_count || 0),
    participantLimit: Number(extra.people || 1)
  };
}

function profileFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    studentId: row.student_id,
    building: row.building,
    room: row.room,
    avatar: row.avatar || ''
  };
}

function getPosts(url, userId) {
  const category = url.searchParams.get('category') || '';
  const keyword = (url.searchParams.get('q') || '').trim();
  const mine = url.searchParams.get('mine') === '1';
  const joined = url.searchParams.get('joined') === '1';
  const where = [];
  const params = [];
  if (mine) {
    where.push('p.user_id = ?');
    params.push(userId);
  } else if (joined) {
    where.push('(EXISTS(SELECT 1 FROM claims mine_claim WHERE mine_claim.post_id = p.id AND mine_claim.user_id = ? AND mine_claim.status IN (\'claimed\', \'completed\')) OR EXISTS(SELECT 1 FROM free_claims mine_free_claim WHERE mine_free_claim.post_id = p.id AND mine_free_claim.user_id = ?))');
    params.push(userId, userId);
  } else {
    // Public discovery only contains posts that are still accepting participants.
    where.push("p.status = 'active' AND (p.category IN ('免费送', '拼车', '拼车搭子') OR NOT EXISTS (SELECT 1 FROM claims public_claim WHERE public_claim.post_id = p.id)) AND (p.category != '免费送' OR p.available_quantity > 0)");
  }
  if (category && category !== '全部') {
    const queryCategory = category === '求信息' ? '信息差' : category;
    const categories = CATEGORY_ALIASES[queryCategory] || [queryCategory];
    where.push(`p.category IN (${categories.map(() => '?').join(', ')})`);
    params.push(...categories);
  }
  if (keyword) {
    where.push('(p.title LIKE ? OR p.category LIKE ? OR p.subcategory LIKE ? OR p.place LIKE ? OR p.detail LIKE ?)');
    const like = '%' + keyword + '%';
    params.push(like, like, like, like, like);
  }
  const rows = db.prepare(`
    SELECT p.*, u.name AS owner_name,
           (EXISTS(SELECT 1 FROM claims c WHERE c.post_id = p.id AND c.status IN ('claimed', 'completed')) OR EXISTS(SELECT 1 FROM free_claims fc WHERE fc.post_id = p.id)) AS claimed,
           (SELECT COUNT(*) FROM claims pc WHERE pc.post_id = p.id AND pc.status IN ('claimed', 'completed')) AS participant_count,
           (EXISTS(SELECT 1 FROM claims c WHERE c.post_id = p.id AND c.user_id = ? AND c.status IN ('claimed', 'completed')) OR EXISTS(SELECT 1 FROM free_claims fc WHERE fc.post_id = p.id AND fc.user_id = ?)) AS claimed_by_me
    FROM posts p JOIN users u ON u.id = p.user_id
    WHERE ${where.join(' AND ')}
    ORDER BY p.created_at DESC
  `).all(userId, userId, ...params);
  return rows.map(row => {
    const post = postFromRow(row, userId);
    // QR codes are only needed on the detail page after a successful join.
    delete post.extra.contactQr;
    return post;
  });
}

function getPost(id, userId) {
  const row = db.prepare(`
    SELECT p.*, u.name AS owner_name,
           (EXISTS(SELECT 1 FROM claims c WHERE c.post_id = p.id AND c.status IN ('claimed', 'completed')) OR EXISTS(SELECT 1 FROM free_claims fc WHERE fc.post_id = p.id)) AS claimed,
           (SELECT COUNT(*) FROM claims pc WHERE pc.post_id = p.id AND pc.status IN ('claimed', 'completed')) AS participant_count,
           (EXISTS(SELECT 1 FROM claims c WHERE c.post_id = p.id AND c.user_id = ? AND c.status IN ('claimed', 'completed')) OR EXISTS(SELECT 1 FROM free_claims fc WHERE fc.post_id = p.id AND fc.user_id = ?)) AS claimed_by_me
    FROM posts p JOIN users u ON u.id = p.user_id
    WHERE p.id = ?
  `).get(userId, userId, Number(id));
  if (!row) return null;
  const canViewPrivatePost = row.user_id === userId || Boolean(row.claimed_by_me);
  if (row.status !== 'active' && !canViewPrivatePost) return null;
  return postFromRow(row, userId);
}

function getMe(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const published = db.prepare("SELECT COUNT(*) AS count FROM posts WHERE user_id = ? AND status != 'cancelled'").get(userId).count;
  const seeking = db.prepare("SELECT COUNT(*) AS count FROM posts WHERE user_id = ? AND intent = 'seek' AND status != 'cancelled'").get(userId).count;
  const joined = db.prepare("SELECT (SELECT COUNT(*) FROM claims WHERE user_id = ? AND status IN ('claimed', 'completed')) + (SELECT COUNT(*) FROM free_claims WHERE user_id = ?) AS count").get(userId, userId).count;
  const completed = db.prepare("SELECT COUNT(*) AS count FROM posts WHERE user_id = ? AND (status = 'completed' OR (category = '免费送' AND available_quantity = 0))").get(userId).count;
  return { ...profileFromRow(user), stats: { published, seeking, joined, completed } };
}

function getNotifications(userId) {
  return db.prepare(`
    SELECT id, post_id AS postId, type, title, message, read_at AS readAt, created_at AS createdAt
    FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(userId);
}

function notifyParticipants(postId, title, message) {
  const members = db.prepare("SELECT user_id FROM claims WHERE post_id = ? AND status = 'claimed'").all(postId);
  const insert = db.prepare(`INSERT INTO notifications (user_id, post_id, type, title, message, created_at) VALUES (?, ?, 'carpool', ?, ?, ?)`);
  const createdAt = Date.now();
  members.forEach(member => insert.run(member.user_id, postId, title, message, createdAt));
}

function refreshCarpoolStatuses() {
  const timestamp = Date.now();
  const rows = db.prepare("SELECT id, status, extra_json FROM posts WHERE category IN ('拼车搭子', '拼车') AND status IN ('active', 'matched', 'closed')").all();
  rows.forEach(row => {
    const departureAt = Number(parseExtra(row.extra_json).departureAt || 0);
    if (!departureAt) return;
    if (row.status === 'closed' || timestamp >= departureAt - 10 * 60 * 1000) {
      notifyParticipants(row.id, '拼车已自动结单', '已到出发前 10 分钟，本次拼车已结单，仅可查看行程，不能再退出或修改。');
      db.prepare("UPDATE posts SET status = 'completed' WHERE id = ? AND status IN ('active', 'matched', 'closed')").run(row.id);
      db.prepare("UPDATE claims SET status = 'completed' WHERE post_id = ? AND status = 'claimed'").run(row.id);
    }
  });
}

function getUserId(req) {
  const value = String(req.headers['x-user-id'] || '').trim();
  return /^[A-Za-z0-9_-]{6,64}$/.test(value) ? value : DEMO_USER_ID;
}

function ensureUser(userId) {
  const timestamp = Date.now();
  db.prepare(`
    INSERT OR IGNORE INTO users
    (id, name, student_id, building, room, created_at, updated_at)
    VALUES (?, '新同学', '', '', '', ?, ?)
  `).run(userId, timestamp, timestamp);
}

function validatePostPayload(payload) {
  for (const key of ['category', 'intent', 'title']) {
    if (!String(payload[key] || '').trim()) return '类型、项目、目的和标题不能为空';
  }
  if (String(payload.category).trim() !== '免费送' && !String(payload.subcategory || '').trim()) return '请填写具体项目';
  if (String(payload.category).trim() === '免费送') {
    const quantity = Number(payload.quantity || payload.extra?.quantity || 0);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) return '免费送份数需为1到9999之间的整数';
  }
  if (!['seek', 'offer'].includes(String(payload.intent))) return '发布目的不正确';
  if (String(payload.title).trim().length > 60) return '标题不能超过60个字';
  if (String(payload.detail || '').trim().length > 500) return '详细说明不能超过500个字';
  if (String(payload.contact || '').trim().length > 80) return '联系方式不能超过80个字';
  if (String(payload.category).trim() === '拼车搭子') {
    const extra = payload.extra && typeof payload.extra === 'object' ? payload.extra : {};
    const people = Number(extra.people || 0);
    if (!Number.isInteger(people) || people < 1 || people > 3) return '拼车人数需为1到3人';
    if (typeof extra.contactQr !== 'string' || !/^data:image\/(png|jpeg|jpg);base64,[A-Za-z0-9+/=]+$/.test(extra.contactQr) || extra.contactQr.length > 900000) return '请上传有效的微信二维码';
    if (!Number.isFinite(Number(extra.departureAt)) || Number(extra.departureAt) <= 0) return '请选择出发日期和时间';
  }
  return '';
}

async function api(req, res, url) {
  const pathname = url.pathname;
  if (req.method === 'OPTIONS') return json(res, 200, { ok: true });
  const userId = getUserId(req);
  ensureUser(userId);
  refreshCarpoolStatuses();

  if (req.method === 'GET' && pathname === '/api/health') {
    return json(res, 200, { ok: true, database: path.basename(DB_PATH), environment: process.env.NODE_ENV || 'development' });
  }
  if (req.method === 'GET' && pathname === '/api/posts') {
    return json(res, 200, getPosts(url, userId));
  }
  if (req.method === 'GET' && /^\/api\/posts\/\d+$/.test(pathname)) {
    const post = getPost(pathname.split('/').pop(), userId);
    return post ? json(res, 200, post) : error(res, 404, '任务不存在');
  }
  if (req.method === 'POST' && pathname === '/api/posts') {
    const payload = await readBody(req);
    const validationError = validatePostPayload(payload);
    if (validationError) return error(res, 400, validationError);
    const extra = payload.extra && typeof payload.extra === 'object' ? payload.extra : {};
    const quantity = String(payload.category).trim() === '免费送' ? Number(payload.quantity || extra.quantity) : 1;
    const result = db.prepare(`
      INSERT INTO posts
      (user_id, category, subcategory, intent, title, detail, price, place,
      time_text, contact, extra_json, status, quantity, available_quantity, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `).run(
      userId,
      String(payload.category).trim(),
      String(payload.subcategory).trim(),
      String(payload.intent).trim(),
      String(payload.title).trim(),
      String(payload.detail || '').trim(),
      String(payload.price || '').trim(),
      String(payload.place || '').trim(),
      String(payload.time || '').trim(),
      String(payload.contact || '').trim(),
      JSON.stringify({ ...extra, quantity: String(payload.category).trim() === '免费送' ? quantity : extra.quantity }),
      quantity,
      quantity,
      Date.now()
    );
    return json(res, 201, { id: Number(result.lastInsertRowid) });
  }
  const updateMatch = pathname.match(/^\/api\/posts\/(\d+)$/);
  if (req.method === 'PUT' && updateMatch) {
    const postId = Number(updateMatch[1]);
    const rawPost = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
    if (!rawPost) return error(res, 404, '信息不存在');
    if (rawPost.user_id !== userId) return error(res, 403, '只能修改自己发布的信息');
    if (!['拼车搭子', '拼车'].includes(rawPost.category)) return error(res, 400, '只有拼车行程支持修改');
    if (['completed', 'cancelled'].includes(rawPost.status)) return error(res, 409, '已结束的信息不能修改');
    const payload = await readBody(req);
    const oldExtra = parseExtra(rawPost.extra_json);
    const nextExtra = { ...oldExtra, ...(payload.extra && typeof payload.extra === 'object' ? payload.extra : {}) };
    const participantCount = db.prepare("SELECT COUNT(*) AS count FROM claims WHERE post_id = ? AND status = 'claimed'").get(postId).count;
    const nextPeople = Number(nextExtra.people || 0);
    if (nextPeople !== Number(oldExtra.people || 1)) return error(res, 400, '拼车人数发布后不能修改');
    if (!Number.isInteger(nextPeople) || nextPeople < participantCount || nextPeople > 3) return error(res, 400, `所需人数不能少于已加入人数（${participantCount}人）`);
    const nextPayload = {
      category: '拼车搭子', intent: 'seek', title: String(payload.title || rawPost.title).trim(),
      subcategory: String(payload.subcategory || rawPost.subcategory).trim(),
      place: String(payload.place == null ? rawPost.place : payload.place).trim(),
      time: String(payload.time == null ? rawPost.time_text : payload.time).trim(),
      detail: String(payload.detail == null ? rawPost.detail : payload.detail).trim(),
      extra: nextExtra
    };
    const validationError = validatePostPayload(nextPayload);
    if (validationError) return error(res, 400, validationError);
    const nextStatus = participantCount >= nextPeople ? 'matched' : 'active';
    db.prepare(`UPDATE posts SET subcategory = ?, title = ?, detail = ?, place = ?, time_text = ?, extra_json = ?, status = ? WHERE id = ?`)
      .run(nextPayload.subcategory, nextPayload.title, nextPayload.detail, nextPayload.place, nextPayload.time, JSON.stringify(nextExtra), nextStatus, postId);
    if (participantCount) notifyParticipants(postId, '拼车行程已更新', `发起人更新了行程：${nextPayload.place}，${nextPayload.time}。请打开小程序重新确认。`);
    return json(res, 200, { ok: true, postId, status: nextStatus, participantCount, participantLimit: nextPeople });
  }
  const claimMatch = pathname.match(/^\/api\/posts\/(\d+)\/claim$/);
  if (req.method === 'POST' && claimMatch) {
    const postId = Number(claimMatch[1]);
    const post = getPost(postId, userId);
    if (!post) return error(res, 404, '任务不存在');
    if (post.status !== 'active') return error(res, 409, '这条信息已结束或已匹配');
    if (post.isOwner) return error(res, 400, '不能参与自己发布的单');
    if (post.category === '免费送') {
      const existingFree = db.prepare('SELECT id FROM free_claims WHERE post_id = ? AND user_id = ?').get(postId, userId);
      if (existingFree) return json(res, 200, { ok: true, postId, claimed: true, reserved: true, availableQuantity: post.availableQuantity });
      db.exec('BEGIN IMMEDIATE');
      try {
        const changed = db.prepare("UPDATE posts SET available_quantity = available_quantity - 1 WHERE id = ? AND status = 'active' AND available_quantity > 0").run(postId);
        if (!changed.changes) { db.exec('ROLLBACK'); return error(res, 409, '这个物品已经领完了'); }
        db.prepare("INSERT INTO free_claims (post_id, user_id, status, created_at) VALUES (?, ?, 'reserved', ?)").run(postId, userId, Date.now());
        db.exec('COMMIT');
        const updated = db.prepare('SELECT available_quantity FROM posts WHERE id = ?').get(postId);
        if (updated.available_quantity === 0) db.prepare("UPDATE posts SET status = 'matched' WHERE id = ?").run(postId);
        return json(res, 200, { ok: true, postId, claimed: true, reserved: true, availableQuantity: updated.available_quantity });
      } catch (claimError) { db.exec('ROLLBACK'); throw claimError; }
    }
    const isCarpool = ['拼车搭子', '拼车'].includes(post.category);
    const existing = db.prepare('SELECT user_id FROM claims WHERE post_id = ? AND user_id = ?').get(postId, userId);
    if (existing) return json(res, 200, { ok: true, postId, claimed: true, status: post.status });
    if (!isCarpool && post.claimed) return error(res, 409, '这条信息已被其他同学接下');
    db.prepare(`INSERT OR IGNORE INTO claims (post_id, user_id, status, created_at) VALUES (?, ?, 'claimed', ?)`)
      .run(postId, userId, Date.now());
    const participantCount = db.prepare("SELECT COUNT(*) AS count FROM claims WHERE post_id = ? AND status = 'claimed'").get(postId).count;
    const participantLimit = isCarpool ? Math.max(1, Number(post.extra.people || 1)) : 1;
    const nextStatus = participantCount >= participantLimit ? 'matched' : 'active';
    db.prepare('UPDATE posts SET status = ? WHERE id = ?').run(nextStatus, postId);
    return json(res, 200, { ok: true, postId, claimed: true, status: nextStatus, participantCount, participantLimit });
  }
  const cancelClaimMatch = pathname.match(/^\/api\/posts\/(\d+)\/claim$/);
  if (req.method === 'DELETE' && cancelClaimMatch) {
    const postId = Number(cancelClaimMatch[1]);
    const rawPost = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
    if (!rawPost) return error(res, 404, '信息不存在');
    if (rawPost.status === 'completed' || rawPost.status === 'cancelled') return error(res, 409, '已经结束的信息不能取消参与');
    if (rawPost.category === '免费送') {
      const removed = db.prepare('DELETE FROM free_claims WHERE post_id = ? AND user_id = ?').run(postId, userId);
      if (!removed.changes) return error(res, 403, '你没有参与这条信息');
      db.prepare("UPDATE posts SET available_quantity = MIN(quantity, available_quantity + 1), status = 'active' WHERE id = ? AND status != 'completed'").run(postId);
    } else {
      const removed = db.prepare('DELETE FROM claims WHERE post_id = ? AND user_id = ?').run(postId, userId);
      if (!removed.changes) return error(res, 403, '你没有参与这条信息');
      db.prepare("UPDATE posts SET status = 'active' WHERE id = ? AND status IN ('matched', 'closed') AND category NOT IN ('拼车搭子', '拼车')").run(postId);
      db.prepare("UPDATE posts SET status = 'active' WHERE id = ? AND status = 'matched' AND category IN ('拼车搭子', '拼车')").run(postId);
    }
    const status = ['拼车搭子', '拼车'].includes(rawPost.category) ? rawPost.status === 'closed' ? 'closed' : 'active' : 'active';
    return json(res, 200, { ok: true, postId, status });
  }
  const closeMatch = pathname.match(/^\/api\/posts\/(\d+)\/close$/);
  if (req.method === 'POST' && closeMatch) {
    const postId = Number(closeMatch[1]);
    const post = getPost(postId, userId);
    if (!post) return error(res, 404, '信息不存在');
    if (!post.isOwner) return error(res, 403, '只能由发起人结单');
    if (!['拼车搭子', '拼车'].includes(post.category)) return error(res, 400, '只有拼车行程支持结单');
    if (post.status === 'completed' || post.status === 'cancelled') return error(res, 409, '这条行程已经彻底结束');
    notifyParticipants(postId, '拼车已结单', '发起人已手动结单，仅可查看行程，不能再退出或修改。');
    db.prepare("UPDATE posts SET status = 'completed' WHERE id = ? AND status IN ('active', 'matched')").run(postId);
    db.prepare("UPDATE claims SET status = 'completed' WHERE post_id = ? AND status = 'claimed'").run(postId);
    return json(res, 200, { ok: true, postId, status: 'completed' });
  }
  const reopenMatch = pathname.match(/^\/api\/posts\/(\d+)\/reopen$/);
  if (req.method === 'POST' && reopenMatch) {
    const postId = Number(reopenMatch[1]);
    const post = getPost(postId, userId);
    if (!post) return error(res, 404, '信息不存在');
    if (!post.isOwner) return error(res, 403, '只能重新开放自己发布的信息');
    if (['拼车搭子', '拼车'].includes(post.category)) return error(res, 409, '取消的拼车行程不能重新开放，请重新发布');
    if (post.status === 'completed' || post.status === 'cancelled') return error(res, 409, '这条信息已经结束');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM claims WHERE post_id = ?').run(postId);
      db.prepare('DELETE FROM free_claims WHERE post_id = ?').run(postId);
      db.prepare("UPDATE posts SET status = 'active', available_quantity = quantity WHERE id = ?").run(postId);
      db.exec('COMMIT');
    } catch (reopenError) { db.exec('ROLLBACK'); throw reopenError; }
    return json(res, 200, { ok: true, postId, status: 'active' });
  }
  const completeMatch = pathname.match(/^\/api\/posts\/(\d+)\/complete$/);
  if (req.method === 'POST' && completeMatch) {
    const postId = Number(completeMatch[1]);
    const post = getPost(postId, userId);
    if (!post) return error(res, 404, '任务不存在');
    if (!post.isOwner) return error(res, 403, '只能完成自己发布的单');
    if (!['active', 'matched'].includes(post.status)) return error(res, 409, '这条信息已经结束');
    db.prepare("UPDATE posts SET status = 'completed' WHERE id = ?").run(postId);
    db.prepare("UPDATE claims SET status = 'completed' WHERE post_id = ?").run(postId);
    db.prepare("UPDATE free_claims SET status = 'completed' WHERE post_id = ?").run(postId);
    return json(res, 200, { ok: true, postId, status: 'completed' });
  }
  const deleteMatch = pathname.match(/^\/api\/posts\/(\d+)$/);
  if (req.method === 'DELETE' && deleteMatch) {
    const postId = Number(deleteMatch[1]);
    const post = getPost(postId, userId);
    if (!post) return error(res, 404, '任务不存在');
    if (!post.isOwner) return error(res, 403, '只能删除自己发布的单');
    if (post.status === 'cancelled') return json(res, 200, { ok: true, postId, status: 'cancelled' });
    if (['拼车搭子', '拼车'].includes(post.category)) {
      if (post.status === 'completed') return error(res, 409, '已结单的拼车只能查看');
      notifyParticipants(postId, '拼车行程已取消', '发起人取消了本次行程，你的参与名额已释放。');
      db.prepare("UPDATE claims SET status = 'cancelled' WHERE post_id = ? AND status = 'claimed'").run(postId);
    }
    db.prepare("UPDATE posts SET status = 'cancelled' WHERE id = ?").run(postId);
    return json(res, 200, { ok: true, postId, status: 'cancelled' });
  }
  if (req.method === 'GET' && pathname === '/api/me') {
    return json(res, 200, getMe(userId));
  }
  if (req.method === 'GET' && pathname === '/api/notifications') {
    return json(res, 200, getNotifications(userId));
  }
  const notificationReadMatch = pathname.match(/^\/api\/notifications\/(\d+)\/read$/);
  if (req.method === 'POST' && notificationReadMatch) {
    const result = db.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?').run(Date.now(), Number(notificationReadMatch[1]), userId);
    if (!result.changes) return error(res, 404, '提醒不存在');
    return json(res, 200, { ok: true });
  }
  if (req.method === 'GET' && pathname === '/api/profile') {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    return json(res, 200, profileFromRow(user));
  }
  if (req.method === 'PUT' && pathname === '/api/profile') {
    const payload = await readBody(req);
    const name = String(payload.name || '').trim();
    if (!name) return error(res, 400, '姓名不能为空');
    db.prepare(`
      UPDATE users
      SET name = ?, student_id = ?, building = ?, room = ?, avatar = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name,
      String(payload.studentId || '').trim(),
      String(payload.building || '').trim(),
      String(payload.room || '').trim(),
      String(payload.avatar || '').trim(),
      Date.now(),
      userId
    );
    return json(res, 200, profileFromRow(db.prepare('SELECT * FROM users WHERE id = ?').get(userId)));
  }
  return error(res, 404, '接口不存在');
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://' + (req.headers.host || '127.0.0.1'));
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else if (req.method === 'GET') error(res, 404, '请使用微信小程序客户端访问接口');
    else error(res, 405, '方法不允许');
  } catch (err) {
    console.error(err);
    error(res, 500, '服务器处理失败');
  }
});

server.listen(PORT, HOST, () => {
  const address = server.address();
  const actualPort = address && typeof address === 'object' ? address.port : PORT;
  console.log('河小易后端已启动：http://' + HOST + ':' + actualPort);
  console.log('SQLite 数据库：' + DB_PATH);
});

const carpoolRefreshTimer = setInterval(refreshCarpoolStatuses, 60 * 1000);
carpoolRefreshTimer.unref?.();

