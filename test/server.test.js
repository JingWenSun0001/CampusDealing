const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'river-easy-test-'));
let child;
let baseUrl;

function startServer() {
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, ['server.js'], {
      cwd: root,
      env: { ...process.env, PORT: '0', HOST: '127.0.0.1', DATA_DIR: dataDir, NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    const timer = setTimeout(() => reject(new Error('后端启动超时\n' + output)), 10000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/127\.0\.0\.1:(\d+)/);
      if (match) {
        clearTimeout(timer);
        baseUrl = `http://127.0.0.1:${match[1]}/api`;
        resolve();
      }
    });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('exit', code => {
      if (!baseUrl) {
        clearTimeout(timer);
        reject(new Error('后端提前退出，代码 ' + code + '\n' + output));
      }
    });
  });
}

async function request(pathname, options = {}) {
  const response = await fetch(baseUrl + pathname, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const body = await response.json();
  return { status: response.status, body };
}

test.before(async () => { await startServer(); });
test.after(async () => {
  if (child && child.exitCode == null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 2000))]);
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
      break;
    } catch (error) {
      if (attempt === 4) throw error;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
});

test('后端健康检查和完整任务流程', async t => {
  await t.test('健康检查', async () => {
    const result = await request('/health');
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.environment, 'test');
  });

  let seededPost;
  await t.test('读取首页种子数据', async () => {
    const result = await request('/posts');
    assert.equal(result.status, 200);
    assert.ok(result.body.length >= 8);
    seededPost = result.body.find(post => !post.isOwner);
    assert.ok(seededPost);
  });

  await t.test('拒绝无效发布', async () => {
    const result = await request('/posts', { method: 'POST', body: JSON.stringify({ title: '缺少字段' }) });
    assert.equal(result.status, 400);
  });

  let ownPostId;
  await t.test('发布并读取自己的单', async () => {
    const created = await request('/posts', {
      method: 'POST',
      body: JSON.stringify({ category: '同楼互助', subcategory: '取快递', intent: 'seek', title: '测试取件', detail: '请送到楼下', place: '东门', time: '今天18:00', contact: 'wx-test' })
    });
    assert.equal(created.status, 201);
    ownPostId = created.body.id;
    const detail = await request('/posts/' + ownPostId);
    assert.equal(detail.body.isOwner, true);
    assert.equal(detail.body.status, 'active');
  });

  await t.test('不能参与自己发布的单', async () => {
    const result = await request('/posts/' + ownPostId + '/claim', { method: 'POST' });
    assert.equal(result.status, 400);
  });

  await t.test('参与他人的单并出现在我参与的列表', async () => {
    const claimed = await request('/posts/' + seededPost.id + '/claim', { method: 'POST' });
    assert.equal(claimed.status, 200);
    const joined = await request('/posts?joined=1');
    assert.ok(joined.body.some(post => post.id === seededPost.id && post.claimedByMe));
  });

  await t.test('完成自己发布的单', async () => {
    const completed = await request('/posts/' + ownPostId + '/complete', { method: 'POST' });
    assert.equal(completed.status, 200);
    const detail = await request('/posts/' + ownPostId);
    assert.equal(detail.body.status, 'completed');
  });

  await t.test('软删除自己的单', async () => {
    const created = await request('/posts', {
      method: 'POST',
      body: JSON.stringify({ category: '免费送', subcategory: '书籍', intent: 'offer', title: '测试书籍', place: '图书馆', time: '今天', contact: 'wx-test' })
    });
    const removed = await request('/posts/' + created.body.id, { method: 'DELETE' });
    assert.equal(removed.status, 200);
    const detail = await request('/posts/' + created.body.id);
    assert.equal(detail.body.status, 'cancelled');
  });

  await t.test('保存个人资料并更新统计', async () => {
    const updated = await request('/profile', { method: 'PUT', body: JSON.stringify({ name: '河小易测试员', studentId: '20260001', building: '3号楼', room: '521' }) });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.name, '河小易测试员');
    const me = await request('/me');
    assert.ok(me.body.stats.published >= 1);
    assert.ok(me.body.stats.joined >= 1);
  });

  await t.test('不同设备的数据和权限相互隔离', async () => {
    const userA = { 'x-user-id': 'device-user-a' };
    const userB = { 'x-user-id': 'device-user-b' };
    const created = await request('/posts', {
      method: 'POST',
      headers: userA,
      body: JSON.stringify({ category: '服务', subcategory: '找书', intent: 'seek', title: '多用户测试', place: '图书馆', time: '明天', contact: 'wx-a' })
    });
    assert.equal(created.status, 201);
    const viewedByB = await request('/posts/' + created.body.id, { headers: userB });
    assert.equal(viewedByB.body.isOwner, false);
    assert.equal(viewedByB.body.contact, '');
    const claimedByB = await request('/posts/' + created.body.id + '/claim', { method: 'POST', headers: userB });
    assert.equal(claimedByB.status, 200);
    const detailA = await request('/posts/' + created.body.id, { headers: userA });
    const detailB = await request('/posts/' + created.body.id, { headers: userB });
    assert.equal(detailA.body.claimedByMe, false);
    assert.equal(detailB.body.claimedByMe, true);
    assert.equal(detailB.body.contact, 'wx-a');
    const forbidden = await request('/posts/' + created.body.id + '/complete', { method: 'POST', headers: userB });
    assert.equal(forbidden.status, 403);
  });
});
