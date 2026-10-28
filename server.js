const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
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
    openid TEXT UNIQUE,
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
  CREATE TABLE IF NOT EXISTS moderation_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    reporter_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL,
    reviewed_at INTEGER,
    UNIQUE(post_id, reporter_id),
    FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY(reporter_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_posts_user_status ON posts(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_posts_category_status ON posts(category, status);
  CREATE INDEX IF NOT EXISTS idx_claims_user ON claims(user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at);
  CREATE INDEX IF NOT EXISTS idx_moderation_reports_post ON moderation_reports(post_id, status, created_at);
  CREATE TABLE IF NOT EXISTS auth_sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);
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
if (!userColumns.includes('openid')) db.exec("ALTER TABLE users ADD COLUMN openid TEXT");
if (!userColumns.includes('avatar')) db.exec("ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT ''");
if (!userColumns.includes('contact_qr')) db.exec("ALTER TABLE users ADD COLUMN contact_qr TEXT NOT NULL DEFAULT ''");
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_openid ON users(openid) WHERE openid IS NOT NULL');
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

const DEMO_SEED = 'demo-v3';
const CATEGORY_ALIASES = {
  '拼车搭子': ['拼车搭子', '拼车'],
  '出租': ['出租', '租借'],
  '服务': ['服务', '代取', '捎物', '同楼互助'],
  '代购': ['代购', '代买'],
  '免费送': ['免费送'],
  '二手好物': ['二手好物', '票券']
};
const demoPosts = [
  ['服务', '摄像', 'offer', '摄像服务', '', '', '', '有校园活动拍摄经验，可提供基础修图。', {}],
  ['出租', '电动车', 'offer', '电动车出租', '', '', '', '', {}],
  ['代购', '宝龙', 'seek', '宝龙代购', '', '', '', '', { shoppingPlace: '' }],
  ['拼车搭子', '新乡东', 'seek', '去新乡东，找同路搭子', '西门', '', '08:00', '', { people: '2', gender: '不限性别', departureAt: now + 24 * 60 * 60 * 1000 }],
  ['拼车搭子', '新乡站', 'seek', '去新乡站，找同路搭子', '西门', '', '09:00', '', { people: '2', gender: '不限性别', departureAt: now + 26 * 60 * 60 * 1000 }],
  ['拼车搭子', '宝龙', 'seek', '去宝龙广场，找同路搭子', '北门', '', '18:30', '', { people: '3', gender: '不限性别', departureAt: now + 30 * 60 * 60 * 1000 }],
  ['免费送', '', 'offer', '闲置收纳盒', '', '', '', '', { quantity: 1 }],
  ['免费送', '生活用品', 'offer', '闲置台灯', '', '', '', '', { quantity: 1 }],
  ['二手好物', '教材', 'offer', '九成新高数教材', '', '20', '', '', {}]
];

// Seed a small, stable set of examples so the action-board layout is visible on first launch.
db.prepare("DELETE FROM posts WHERE extra_json LIKE '%demo-v2%' OR extra_json LIKE '%demo-v3%'").run();
const findExistingDemo = db.prepare(`
  SELECT id FROM posts
  WHERE user_id = ? AND category = ? AND subcategory = ? AND extra_json LIKE '%demo-v3%'
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
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-Admin-Key',
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
      if (raw.length > 8 * 1024 * 1024) {
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
  const canViewContact = isOwner || claimedByMe;
  // 所有类型统一使用发布者个人好友码；旧版本的临时码仅作为迁移期兜底。
  const contactQr = canViewContact ? (row.owner_contact_qr || extra.contactQr || '') : '';
  if (!canViewContact) delete extra.contactQr;
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
    contactQr,
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
    avatar: row.avatar || '',
    contactQr: row.contact_qr || ''
  };
}

function hasCompleteBasicProfile(userId) {
  const user = db.prepare('SELECT name, student_id, building, room FROM users WHERE id = ?').get(userId);
  return Boolean(
    user && String(user.name || '').trim() && String(user.student_id || '').trim() &&
    /^([1-9])号楼$/.test(String(user.building || '').trim()) && /^\d{3}$/.test(String(user.room || '').trim())
  );
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
    SELECT p.*, u.name AS owner_name, u.contact_qr AS owner_contact_qr,
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
    delete post.contactQr;
    return post;
  });
}

function getPost(id, userId) {
  const row = db.prepare(`
    SELECT p.*, u.name AS owner_name, u.contact_qr AS owner_contact_qr,
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

function bearerToken(req) {
  const value = String(req.headers.authorization || '').trim();
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function getSessionUserId(req) {
  const token = bearerToken(req);
  if (!token || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) return '';
  const session = db.prepare('SELECT user_id FROM auth_sessions WHERE token = ? AND expires_at > ?').get(token, Date.now());
  return session?.user_id || '';
}

function getUserId(req) {
  const sessionUserId = getSessionUserId(req);
  if (sessionUserId) return sessionUserId;
  // The header is retained for local automated tests and the offline demo only.
  // Production requests must use a server-issued WeChat session token.
  const value = String(req.headers['x-user-id'] || '').trim();
  if (process.env.NODE_ENV !== 'production' && /^[A-Za-z0-9_-]{6,64}$/.test(value)) return value;
  return process.env.NODE_ENV === 'production' ? '' : DEMO_USER_ID;
}

function requireUser(userId, res) {
  if (userId) return true;
  error(res, 401, '请先完成微信登录');
  return false;
}

async function exchangeWechatCode(code) {
  const appId = String(process.env.WX_APP_ID || '').trim();
  const appSecret = String(process.env.WX_APP_SECRET || '').trim();
  if (!appId || !appSecret) {
    if (process.env.NODE_ENV === 'production') throw Object.assign(new Error('后端尚未配置微信小程序 AppID 和 AppSecret'), { statusCode: 503 });
    const digest = crypto.createHash('sha256').update(code).digest('hex').slice(0, 32);
    return { openid: 'dev_' + digest, sessionKey: '' };
  }
  const endpoint = new URL('https://api.weixin.qq.com/sns/jscode2session');
  endpoint.searchParams.set('appid', appId);
  endpoint.searchParams.set('secret', appSecret);
  endpoint.searchParams.set('js_code', code);
  endpoint.searchParams.set('grant_type', 'authorization_code');
  const response = await fetch(endpoint);
  if (!response.ok) throw Object.assign(new Error('微信登录服务暂时不可用'), { statusCode: 502 });
  const result = await response.json();
  if (!result.openid) throw Object.assign(new Error(result.errmsg || '微信登录失败，请重试'), { statusCode: 401 });
  return { openid: result.openid, sessionKey: result.session_key || '', unionid: result.unionid || '' };
}

function createAuthSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const createdAt = Date.now();
  const expiresAt = createdAt + 30 * 24 * 60 * 60 * 1000;
  db.prepare('INSERT INTO auth_sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, createdAt, expiresAt);
  return { token, expiresAt };
}

function isAdminRequest(req) {
  const expected = String(process.env.MODERATION_ADMIN_KEY || '').trim();
  return Boolean(expected) && String(req.headers['x-admin-key'] || '') === expected;
}

function ensureUser(userId) {
  if (!userId) return;
  const timestamp = Date.now();
  db.prepare(`
    INSERT OR IGNORE INTO users
    (id, name, student_id, building, room, created_at, updated_at)
    VALUES (?, '新同学', '', '', '', ?, ?)
  `).run(userId, timestamp, timestamp);
}

function isSafeImage(value, maxBytes = 512 * 1024) {
  if (typeof value !== 'string') return false;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) return false;
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > maxBytes) return false;
  const mime = match[1];
  const isPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp = bytes.length >= 12 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  return (mime === 'png' && isPng) || (mime === 'jpeg' && isJpeg) || (mime === 'webp' && isWebp);
}

function isValidQr(value) {
  return isSafeImage(value, 700 * 1024);
}

const BANNED_CONTENT = [
  '裸聊', '色情服务', '招嫖', '约炮', '赌博', '博彩', '下注', '代考', '代写',
  '办证', '假证', '毒品', '大麻', '冰毒', '枪支', '管制刀具', '刷单', '收款码', '二维码付款'
];

function normalizeForModeration(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, '');
}

function hasBannedContent(value) {
  const normalized = normalizeForModeration(value);
  return BANNED_CONTENT.some(word => normalized.includes(normalizeForModeration(word)));
}

function hasUnsafeContact(value) {
  const text = String(value || '');
  return /https?:\/\/|www\.|(?:\+?86[-\s]?)?1[3-9]\d{9}|微信[号號]|wxid[_-]|加微|扫码支付|收款码/i.test(text);
}

function validateText(value, label, min, max) {
  const text = String(value || '').trim();
  if (text.length < min || text.length > max) return `${label}需为${min}到${max}个字符`;
  if (hasUnsafeContact(text)) return `${label}不能包含链接、手机号或站外联系方式`;
  if (hasBannedContent(text)) return `${label}包含不支持发布的信息`;
  return '';
}

function validatePostPayload(payload, userId = '', enforceProfileContact = false) {
  for (const key of ['category', 'intent', 'title']) {
    if (!String(payload[key] || '').trim()) return '类型、项目、目的和标题不能为空';
  }
  if (String(payload.category).trim() !== '免费送' && !String(payload.subcategory || '').trim()) return '请填写具体项目';
  if (String(payload.category).trim() === '免费送') {
    const quantity = Number(payload.quantity || payload.extra?.quantity || 0);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) return '免费送份数需为1到9999之间的整数';
  }
  if (!['seek', 'offer'].includes(String(payload.intent))) return '发布目的不正确';
  const titleError = validateText(payload.title, '标题', 2, 60);
  if (titleError) return titleError;
  if (String(payload.detail || '').trim().length > 500) return '详细说明不能超过500个字';
  if (hasUnsafeContact(payload.detail)) return '详细说明不能包含链接、手机号或站外联系方式';
  if (hasBannedContent(payload.detail)) return '详细说明包含不支持发布的信息';
  if (String(payload.contact || '').trim().length > 80) return '联系方式不能超过80个字';
  if (String(payload.category).trim() === '拼车搭子') {
    const extra = payload.extra && typeof payload.extra === 'object' ? payload.extra : {};
    const people = Number(extra.people || 0);
    if (String(payload.subcategory).trim() === '其他' && !String(extra.destination || '').trim()) return '请填写具体目的地';
    if (String(extra.destination || '').trim().length > 60) return '具体目的地不能超过60个字';
    if (!Number.isInteger(people) || people < 1 || people > 3) return '拼车人数需为1到3人';
    if (enforceProfileContact && !isValidQr(db.prepare('SELECT contact_qr FROM users WHERE id = ?').get(userId)?.contact_qr)) return '请先在我的资料上传默认微信好友码';
    if (!Number.isFinite(Number(extra.departureAt)) || Number(extra.departureAt) <= 0) return '请选择出发日期和时间';
  }
  if (String(payload.category).trim() === '代购') {
    const extra = payload.extra && typeof payload.extra === 'object' ? payload.extra : {};
    if (String(payload.subcategory).trim() === '其他' && !String(extra.shoppingPlace || '').trim()) return '请填写具体代购地点或店名';
    if (String(extra.shoppingPlace || '').trim().length > 60) return '具体代购地点或店名不能超过60个字';
  }
  if (String(payload.category).trim() === '出租') {
    const extra = payload.extra && typeof payload.extra === 'object' ? payload.extra : {};
    if (String(payload.subcategory).trim() === '其他' && !String(extra.rentalItem || '').trim()) return '请填写具体' + (String(payload.intent).trim() === 'seek' ? '租借' : '出租') + '什么';
    if (String(extra.rentalItem || '').trim().length > 60) return '具体出租什么不能超过60个字';
  }
  if (String(payload.category).trim() === '二手好物') {
    const price = String(payload.price || '').trim();
    if (!price) return '请填写价格';
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(price)) return '价格最多保留两位小数';
    if (Number(price) > 9999.99) return '价格不能超过9999.99元';
  }
  const extra = payload.extra && typeof payload.extra === 'object' ? payload.extra : {};
  const images = extra.images == null ? [] : extra.images;
  if (!Array.isArray(images) || images.length > 9) return '图片最多上传9张';
  if (images.length && !['出租', '二手好物', '服务'].includes(String(payload.category).trim())) return '该类型不能上传图片';
  if (images.some(image => !isSafeImage(image))) return '图片仅支持不超过512KB的PNG、JPEG或WebP格式';
  return '';
}

async function api(req, res, url) {
  const pathname = url.pathname;
  if (req.method === 'OPTIONS') return json(res, 200, { ok: true });
  const userId = getUserId(req);
  ensureUser(userId);
  refreshCarpoolStatuses();

  if (req.method === 'POST' && pathname === '/api/auth/wechat') {
    const payload = await readBody(req);
    const code = String(payload.code || '').trim();
    if (!code || code.length > 256) return error(res, 400, '微信登录凭证无效');
    let identity;
    try {
      identity = await exchangeWechatCode(code);
    } catch (authError) {
      return error(res, authError.statusCode || 502, authError.message || '微信登录失败，请重试');
    }
    const userInfo = payload.userInfo && typeof payload.userInfo === 'object' ? payload.userInfo : {};
    let user = db.prepare('SELECT * FROM users WHERE openid = ?').get(identity.openid);
    if (!user) {
      const newUserId = 'wx_' + crypto.randomBytes(16).toString('hex');
      const name = String(userInfo.nickName || '新同学').trim().slice(0, 20) || '新同学';
      const avatar = String(userInfo.avatarUrl || '').trim().slice(0, 500);
      const timestamp = Date.now();
      db.prepare(`
        INSERT INTO users (id, openid, name, student_id, building, room, avatar, contact_qr, created_at, updated_at)
        VALUES (?, ?, ?, '', '', '', ?, '', ?, ?)
      `).run(newUserId, identity.openid, name, avatar, timestamp, timestamp);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(newUserId);
    } else if (userInfo.nickName || userInfo.avatarUrl) {
      const nextName = String(userInfo.nickName || user.name || '新同学').trim().slice(0, 20) || user.name || '新同学';
      const nextAvatar = String(userInfo.avatarUrl || user.avatar || '').trim().slice(0, 500);
      db.prepare('UPDATE users SET name = ?, avatar = ?, updated_at = ? WHERE id = ?').run(nextName, nextAvatar, Date.now(), user.id);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    }
    db.prepare('DELETE FROM auth_sessions WHERE user_id = ? OR expires_at <= ?').run(user.id, Date.now());
    const session = createAuthSession(user.id);
    return json(res, 200, { ...session, user: profileFromRow(user) });
  }

  if (req.method === 'GET' && pathname === '/api/health') {
    return json(res, 200, { ok: true, database: path.basename(DB_PATH), environment: process.env.NODE_ENV || 'development' });
  }
  const publicPosts = req.method === 'GET' && pathname === '/api/posts' && !url.searchParams.has('mine') && !url.searchParams.has('joined');
  const publicPostDetail = req.method === 'GET' && /^\/api\/posts\/\d+$/.test(pathname);
  const publicModeration = isAdminRequest(req) && (pathname === '/api/moderation/reports' || /^\/api\/moderation\/reports\/\d+$/.test(pathname));
  if (!userId && !publicPosts && !publicPostDetail && !publicModeration) return error(res, 401, '请先完成微信登录');
  if (req.method === 'GET' && pathname === '/api/posts') {
    return json(res, 200, getPosts(url, userId));
  }
  if (req.method === 'GET' && /^\/api\/posts\/\d+$/.test(pathname)) {
    const post = getPost(pathname.split('/').pop(), userId);
    return post ? json(res, 200, post) : error(res, 404, '任务不存在');
  }
  if (req.method === 'POST' && pathname === '/api/posts') {
    let payload = await readBody(req);
    const submittedPrice = String(payload.price || '').trim();
    if (String(payload.category).trim() === '二手好物' && /^(?:0|0\.0{1,2})$/.test(submittedPrice)) {
      payload = { ...payload, category: '免费送', quantity: 1, price: '' };
    }
    const validationError = validatePostPayload(payload, userId, Boolean(getSessionUserId(req)));
    if (validationError) return error(res, 400, validationError);
    const hourAgo = Date.now() - 60 * 60 * 1000;
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const hourlyPosts = db.prepare('SELECT COUNT(*) AS count FROM posts WHERE user_id = ? AND created_at >= ?').get(userId, hourAgo).count;
    const dailyPosts = db.prepare('SELECT COUNT(*) AS count FROM posts WHERE user_id = ? AND created_at >= ?').get(userId, dayAgo).count;
    if (hourlyPosts >= 10) return error(res, 429, '发布过于频繁，每小时最多发布10条');
    if (dailyPosts >= 30) return error(res, 429, '今日发布已达上限，每天最多发布30条');
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
    const validationError = validatePostPayload(nextPayload, userId, Boolean(getSessionUserId(req)));
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
    if (getSessionUserId(req) && !hasCompleteBasicProfile(userId)) return error(res, 400, '请先完善基本资料后再加入');
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
      notifyParticipants(postId, '拼车行程已取消', '发起人取消了本次行程，你的参与名额已释放。');
      db.prepare("UPDATE claims SET status = 'cancelled' WHERE post_id = ? AND status = 'claimed'").run(postId);
    }
    db.prepare("UPDATE posts SET status = 'cancelled' WHERE id = ?").run(postId);
    return json(res, 200, { ok: true, postId, status: 'cancelled' });
  }
  const reportMatch = pathname.match(/^\/api\/posts\/(\d+)\/reports$/);
  if (req.method === 'POST' && reportMatch) {
    const postId = Number(reportMatch[1]);
    const rawPost = db.prepare('SELECT id, user_id, status FROM posts WHERE id = ?').get(postId);
    if (!rawPost) return error(res, 404, '信息不存在');
    if (rawPost.user_id === userId) return error(res, 400, '不能举报自己发布的信息');
    const payload = await readBody(req);
    const allowedReasons = ['诈骗或引流', '色情低俗', '违法违禁', '虚假信息', '其他'];
    const reason = String(payload.reason || '').trim();
    const detail = String(payload.detail || '').trim();
    if (!allowedReasons.includes(reason)) return error(res, 400, '请选择举报原因');
    if (detail.length > 120) return error(res, 400, '举报说明不能超过120个字');
    try {
      db.prepare(`INSERT INTO moderation_reports (post_id, reporter_id, reason, detail, created_at)
        VALUES (?, ?, ?, ?, ?)`).run(postId, userId, reason, detail, Date.now());
    } catch (reportError) {
      if (String(reportError.message).includes('UNIQUE')) return error(res, 409, '你已经举报过这条信息');
      throw reportError;
    }
    const reportCount = db.prepare("SELECT COUNT(*) AS count FROM moderation_reports WHERE post_id = ? AND status = 'open'").get(postId).count;
    let hidden = false;
    if (reportCount >= 3 && ['active', 'matched'].includes(rawPost.status)) {
      db.prepare("UPDATE posts SET status = 'hidden' WHERE id = ? AND status IN ('active', 'matched')").run(postId);
      db.prepare(`INSERT INTO notifications (user_id, post_id, type, title, message, created_at)
        VALUES (?, ?, 'moderation', '帖子进入审核', '已有多位同学举报该信息，现已暂时隐藏，等待人工审核。', ?)`)
        .run(rawPost.user_id, postId, Date.now());
      hidden = true;
    }
    return json(res, 201, { ok: true, postId, reportCount, hidden });
  }
  if (req.method === 'GET' && pathname === '/api/moderation/reports') {
    if (!isAdminRequest(req)) return error(res, 403, '无审核权限');
    const reports = db.prepare(`
      SELECT r.id, r.post_id AS postId, r.reporter_id AS reporterId, r.reason, r.detail, r.status,
             r.created_at AS createdAt, r.reviewed_at AS reviewedAt, p.title, p.category, p.status AS postStatus
      FROM moderation_reports r JOIN posts p ON p.id = r.post_id
      ORDER BY CASE r.status WHEN 'open' THEN 0 ELSE 1 END, r.created_at DESC
      LIMIT 100
    `).all();
    return json(res, 200, reports);
  }
  const reviewMatch = pathname.match(/^\/api\/moderation\/reports\/(\d+)$/);
  if (req.method === 'PUT' && reviewMatch) {
    if (!isAdminRequest(req)) return error(res, 403, '无审核权限');
    const payload = await readBody(req);
    const decision = String(payload.decision || '');
    if (!['confirm', 'dismiss'].includes(decision)) return error(res, 400, '审核结果不正确');
    const report = db.prepare('SELECT * FROM moderation_reports WHERE id = ?').get(Number(reviewMatch[1]));
    if (!report) return error(res, 404, '举报记录不存在');
    db.prepare('UPDATE moderation_reports SET status = ?, reviewed_at = ? WHERE id = ?')
      .run(decision === 'confirm' ? 'confirmed' : 'dismissed', Date.now(), report.id);
    if (decision === 'confirm') {
      db.prepare("UPDATE posts SET status = 'cancelled' WHERE id = ? AND status = 'hidden'").run(report.post_id);
    } else {
      const pending = db.prepare("SELECT COUNT(*) AS count FROM moderation_reports WHERE post_id = ? AND status = 'open'").get(report.post_id).count;
      if (!pending) db.prepare("UPDATE posts SET status = 'active' WHERE id = ? AND status = 'hidden'").run(report.post_id);
    }
    return json(res, 200, { ok: true, postId: report.post_id, decision });
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
    const currentUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const name = String(payload.name || '').trim();
    const studentId = String(payload.studentId || '').trim();
    const building = String(payload.building || '').trim();
    const room = String(payload.room || '').trim();
    const nameError = validateText(name, '昵称', 2, 20);
    if (nameError) return error(res, 400, nameError);
    if (!studentId) return error(res, 400, '学号不能为空');
    if (!/^([1-9])号楼$/.test(building)) return error(res, 400, '请选择1到9号宿舍楼');
    if (!/^\d{3}$/.test(room)) return error(res, 400, '宿舍号需为3位数字');
    const contactQr = String(payload.contactQr || '').trim();
    if (!isValidQr(contactQr)) return error(res, 400, '请上传有效的微信好友码');
    const avatar = payload.avatar == null ? String(currentUser.avatar || '') : String(payload.avatar || '').trim();
    if (payload.avatar != null && avatar && !isSafeImage(avatar, 2 * 1024 * 1024) && !/^https:\/\/(?:thirdwx|wx)\.qlogo\.cn\//i.test(avatar)) return error(res, 400, '头像仅支持微信头像或不超过2MB的PNG、JPEG、WebP图片');
    db.prepare(`
      UPDATE users
      SET name = ?, student_id = ?, building = ?, room = ?, avatar = ?, contact_qr = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name,
      studentId,
      building,
      room,
      avatar,
      contactQr,
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

