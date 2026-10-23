const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
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
    post_id INTEGER NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'claimed',
    created_at INTEGER NOT NULL,
    FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

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
const demoPosts = [
  ['代取', '快递', 'seek', '帮我取一下快递（急）', '东区快递站 → 3号宿舍楼', '3', '约 9 分钟', '东区快递站取件，送到3号宿舍楼下', {}],
  ['拼车', '新乡东站', 'seek', '今晚去新乡东站，找同路', '学校东门 → 新乡东站', '', '今晚 18:30', '还需2人，东门集合', { people: '2', gender: '不限' }],
  ['代买', '宝龙', 'seek', '帮带一杯奶茶', '宝龙奶茶店 → 5号宿舍楼', '2', '约 20 分钟', '少冰三分糖，送到宿舍楼下', { stall: '宝龙奶茶店', brand: '益禾堂' }],
  ['租借', '电动车', 'offer', '九成新电动车出租', '东门车棚', '8/小时', '今天18:00后', '电量充足，适合校内短途出行', { action: 'offer' }],
  ['租借', '大疆', 'seek', '借用大疆运动相机拍毕业照', '图书馆门口', '面议', '本周六全天', '拍摄结束后当天归还', { action: 'seek' }],
  ['拼车', '新乡站', 'seek', '周末回新乡站，求顺路', '南门 → 新乡站', '', '周六 09:00', '可在南门集合，还需3人', { people: '3', gender: '不限' }],
  ['拼车', '宝龙', 'seek', '宝龙购物拼车（周六下午）', '东区校门 → 宝龙广场', '', '周六 14:00', '买完东西一起返校', { people: '3', gender: '不限' }],
  ['拼车', '校本部', 'seek', '回校本部上课，找同路', '西门 → 校本部', '', '明天 07:30', '早八课程，西门集合', { people: '2', gender: '不限' }],
  ['拼车', '大胖/二胖/三胖', 'seek', '去大胖聚餐，找同路', '学校东门 → 大胖', '', '周五 18:00', '还需3人，到店后各自消费', { people: '3', gender: '不限' }],
  ['拼车', '回学校', 'seek', '宝龙回学校，找2位同学', '宝龙广场 → 东区校门', '', '周六 18:30', '宝龙北门集合，行李不多即可', { people: '2', gender: '不限' }],
  ['拼车', '其他', 'seek', '去高铁南站，找同路', '学校南门 → 高铁南站', '', '周日 08:00', '还需2人，可提前十分钟集合', { people: '2', gender: '不限' }],
  ['代取', '外卖', 'seek', '帮取一份黄焖鸡', '南门外卖柜 → 6号宿舍楼', '2', '约 12 分钟', '订单尾号 3816，送到6号楼下', { order: '订单尾号 3816' }],
  ['代取', '帮打印', 'offer', '顺路帮送打印资料', '教学楼A → 图书馆', '1', '今天 17:00 前', '文件已装袋，不怕淋雨', { order: '资料袋' }],
  ['代买', '小吃街', 'seek', '代买一盒感冒药', '小吃街药店 → 2号宿舍楼', '3', '今晚 20:00 前', '帮忙购买常见感冒药即可', { stall: '人民路药店' }],
  ['代买', '学子超市', 'offer', '下课顺路去超市，可帮带', '学子超市 → 宿舍楼下', '1', '今天 19:00', '日用品、小零食都可以', { stall: '学子超市' }],
  ['票券', '奶茶', 'offer', '低价出一张奶茶券', '5号宿舍楼下', '4', '有效期至本周日', '益禾堂大杯券，扫码转让', {}],
  ['票券', '健身房', 'seek', '求购健身房体验券', '体育馆门口', '面议', '周末使用', '有闲置体验券请联系', {}],
  ['服务', '洗衣', 'offer', '帮忙代洗羽绒服', '东区洗衣房', '15', '今天 18:00 后', '可取送，洗好拍照确认', {}],
  ['服务', '找书', 'seek', '帮找一本考研资料', '图书馆 → 3号宿舍楼', '2', '明天中午前', '《英语真题精讲》，电子版也可以', {}],
  ['捎物', '文件', 'seek', '求帮捎一份打印资料', '图书馆 → 1号宿舍楼', '1', '今天 16:30 前', 'A4资料一小沓，已付款', {}],
  ['捎物', '充电器', 'seek', '求帮捎一个Type-C充电器', '3号宿舍楼 → 教学楼A', '2', '今天 14:00 前', '充电器已装袋，送到教学楼门口即可', {}],
  ['信息差', '电话 / 微信', 'seek', '求问四六级报名入口', '线上回复', '面议', '今晚 22:00 前', '知道报名入口的同学麻烦告知一下', {}],
  ['信息差', '考试信息', 'offer', '分享期末考试安排', '教学楼公告栏', '0', '本周内', '整理了各专业考试时间，欢迎互相补充', {}],
  ['免费送', '书籍', 'offer', '高数教材免费送', '校本部 → 3号宿舍楼', '', '今天 18:00 前', '教材保存完好，需要的同学直接联系领取', {}]
];

db.prepare("UPDATE posts SET user_id = ? WHERE user_id = ? AND extra_json LIKE '%demo-v2%'").run(DEMO_FEED_USER_ID, DEMO_USER_ID);
db.prepare("UPDATE posts SET subcategory = '宝龙' WHERE category = '代买' AND subcategory = '奶茶' AND extra_json LIKE '%demo-v2%'").run();
db.prepare("UPDATE posts SET subcategory = '帮打印' WHERE category = '代取' AND subcategory IN ('文件', '印务') AND extra_json LIKE '%demo-v2%'").run();
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
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS'
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

function postFromRow(row) {
  return {
    id: row.id,
    category: row.category,
    subcategory: row.subcategory,
    intent: row.intent,
    title: row.title,
    detail: row.detail,
    price: row.price,
    place: row.place,
    time: row.time_text,
    contact: row.contact,
    extra: parseExtra(row.extra_json),
    status: row.status,
    createdAt: row.created_at,
    claimed: Boolean(row.claimed),
    ownerName: row.owner_name || ''
  };
}

function profileFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    studentId: row.student_id,
    building: row.building,
    room: row.room
  };
}

function getPosts(url) {
  const category = url.searchParams.get('category') || '';
  const keyword = (url.searchParams.get('q') || '').trim();
  const mine = url.searchParams.get('mine') === '1';
  const where = ["p.status = 'active'"];
  const params = [];
  if (mine) { where.push('p.user_id = ?'); params.push(DEMO_USER_ID); }
  if (category && category !== '全部') {
    where.push('p.category = ?');
    params.push(category === '求信息' ? '信息差' : category);
  }
  if (keyword) {
    where.push('(p.title LIKE ? OR p.category LIKE ? OR p.subcategory LIKE ? OR p.place LIKE ? OR p.detail LIKE ?)');
    const like = '%' + keyword + '%';
    params.push(like, like, like, like, like);
  }
  const rows = db.prepare(`
    SELECT p.*, u.name AS owner_name,
           EXISTS(SELECT 1 FROM claims c WHERE c.post_id = p.id) AS claimed
    FROM posts p JOIN users u ON u.id = p.user_id
    WHERE ${where.join(' AND ')}
    ORDER BY p.created_at DESC
  `).all(...params);
  return rows.map(postFromRow);
}

function getPost(id) {
  const row = db.prepare(`
    SELECT p.*, u.name AS owner_name,
           EXISTS(SELECT 1 FROM claims c WHERE c.post_id = p.id) AS claimed
    FROM posts p JOIN users u ON u.id = p.user_id
    WHERE p.id = ?
  `).get(Number(id));
  return row ? postFromRow(row) : null;
}

function getMe() {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(DEMO_USER_ID);
  const selling = db.prepare("SELECT COUNT(*) AS count FROM posts WHERE user_id = ? AND intent = 'offer'").get(DEMO_USER_ID).count;
  const seeking = db.prepare("SELECT COUNT(*) AS count FROM posts WHERE user_id = ? AND intent = 'seek'").get(DEMO_USER_ID).count;
  const completed = db.prepare('SELECT COUNT(*) AS count FROM claims WHERE user_id = ?').get(DEMO_USER_ID).count;
  return { ...profileFromRow(user), stats: { selling, seeking, completed } };
}

async function api(req, res, url) {
  const pathname = url.pathname;
  if (req.method === 'OPTIONS') return json(res, 200, { ok: true });

  if (req.method === 'GET' && pathname === '/api/health') {
    return json(res, 200, { ok: true, database: path.basename(DB_PATH), environment: process.env.NODE_ENV || 'development' });
  }
  if (req.method === 'GET' && pathname === '/api/posts') {
    return json(res, 200, getPosts(url));
  }
  if (req.method === 'GET' && /^\/api\/posts\/\d+$/.test(pathname)) {
    const post = getPost(pathname.split('/').pop());
    return post ? json(res, 200, post) : error(res, 404, '任务不存在');
  }
  if (req.method === 'POST' && pathname === '/api/posts') {
    const payload = await readBody(req);
    for (const key of ['category', 'subcategory', 'intent', 'title']) {
      if (!String(payload[key] || '').trim()) return error(res, 400, '类型、项目、目的和标题不能为空');
    }
    const extra = payload.extra && typeof payload.extra === 'object' ? payload.extra : {};
    const result = db.prepare(`
      INSERT INTO posts
      (user_id, category, subcategory, intent, title, detail, price, place,
       time_text, contact, extra_json, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(
      DEMO_USER_ID,
      String(payload.category).trim(),
      String(payload.subcategory).trim(),
      String(payload.intent).trim(),
      String(payload.title).trim(),
      String(payload.detail || '').trim(),
      String(payload.price || '').trim(),
      String(payload.place || '').trim(),
      String(payload.time || '').trim(),
      String(payload.contact || '').trim(),
      JSON.stringify(extra),
      Date.now()
    );
    return json(res, 201, { id: Number(result.lastInsertRowid) });
  }
  const claimMatch = pathname.match(/^\/api\/posts\/(\d+)\/claim$/);
  if (req.method === 'POST' && claimMatch) {
    const postId = Number(claimMatch[1]);
    if (!getPost(postId)) return error(res, 404, '任务不存在');
    db.prepare(`
      INSERT OR IGNORE INTO claims (post_id, user_id, status, created_at)
      VALUES (?, ?, 'claimed', ?)
    `).run(postId, DEMO_USER_ID, Date.now());
    return json(res, 200, { ok: true, postId, claimed: true });
  }
  if (req.method === 'GET' && pathname === '/api/me') {
    return json(res, 200, getMe());
  }
  if (req.method === 'GET' && pathname === '/api/profile') {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(DEMO_USER_ID);
    return json(res, 200, profileFromRow(user));
  }
  if (req.method === 'PUT' && pathname === '/api/profile') {
    const payload = await readBody(req);
    const name = String(payload.name || '').trim();
    if (!name) return error(res, 400, '姓名不能为空');
    db.prepare(`
      UPDATE users
      SET name = ?, student_id = ?, building = ?, room = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name,
      String(payload.studentId || '').trim(),
      String(payload.building || '').trim(),
      String(payload.room || '').trim(),
      Date.now(),
      DEMO_USER_ID
    );
    return json(res, 200, profileFromRow(db.prepare('SELECT * FROM users WHERE id = ?').get(DEMO_USER_ID)));
  }
  return error(res, 404, '接口不存在');
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
};

function staticFile(res, pathname) {
  const requested = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
  const file = path.resolve(DIST, requested);
  if (file !== DIST && !file.startsWith(DIST + path.sep)) return error(res, 404, '文件不存在');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return error(res, 404, '文件不存在');
  const body = fs.readFileSync(file);
  res.writeHead(200, { 'Content-Type': contentTypes[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': body.length });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://' + (req.headers.host || '127.0.0.1'));
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else if (req.method === 'GET') staticFile(res, url.pathname);
    else error(res, 405, '方法不允许');
  } catch (err) {
    console.error(err);
    error(res, 500, '服务器处理失败');
  }
});

server.listen(PORT, HOST, () => {
  console.log('校小易后端已启动：http://' + HOST + ':' + PORT);
  console.log('SQLite 数据库：' + DB_PATH);
});

