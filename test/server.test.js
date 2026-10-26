const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

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
    seededPost = result.body.find(post => !post.isOwner);
    if (!seededPost) {
      const created = await request('/posts', {
        method: 'POST',
        headers: { 'x-user-id': 'test-feed-user' },
        body: JSON.stringify({ category: '代取', subcategory: '快递', intent: 'seek', title: '测试公开信息', place: '东门', time: '今天', contact: 'wx-feed' })
      });
      const detail = await request('/posts/' + created.body.id);
      seededPost = detail.body;
    }
    assert.ok(seededPost && !seededPost.isOwner);
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
      body: JSON.stringify({ category: '免费送', subcategory: '书籍', intent: 'offer', title: '测试书籍', quantity: 1, place: '图书馆', time: '今天', contact: 'wx-test' })
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
    const userC = { 'x-user-id': 'device-user-c' };
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
    assert.equal(claimedByB.body.status, 'matched');
    const publicAfterClaim = await request('/posts', { headers: userC });
    assert.ok(!publicAfterClaim.body.some(post => post.id === created.body.id));
    const detailA = await request('/posts/' + created.body.id, { headers: userA });
    const detailB = await request('/posts/' + created.body.id, { headers: userB });
    const detailC = await request('/posts/' + created.body.id, { headers: userC });
    assert.equal(detailA.body.claimedByMe, false);
    assert.equal(detailB.body.claimedByMe, true);
    assert.equal(detailB.body.contact, 'wx-a');
    assert.equal(detailC.status, 404);
    const forbidden = await request('/posts/' + created.body.id + '/complete', { method: 'POST', headers: userB });
    assert.equal(forbidden.status, 403);
    const cancelled = await request('/posts/' + created.body.id + '/claim', { method: 'DELETE', headers: userB });
    assert.equal(cancelled.status, 200);
    const publicAfterCancel = await request('/posts', { headers: userC });
    assert.ok(publicAfterCancel.body.some(post => post.id === created.body.id));
    await request('/posts/' + created.body.id + '/claim', { method: 'POST', headers: userB });
    const reopened = await request('/posts/' + created.body.id + '/reopen', { method: 'POST', headers: userA });
    assert.equal(reopened.status, 200);
    const publicAfterReopen = await request('/posts', { headers: userC });
    assert.ok(publicAfterReopen.body.some(post => post.id === created.body.id));
  });

  await t.test('拼车达到所需人数后才退出公共列表', async () => {
    const owner = { 'x-user-id': 'carpool-owner' };
    const userA = { 'x-user-id': 'carpool-user-a' };
    const userB = { 'x-user-id': 'carpool-user-b' };
    const outsider = { 'x-user-id': 'carpool-outsider' };
    const created = await request('/posts', {
      method: 'POST',
      headers: owner,
      body: JSON.stringify({ category: '拼车搭子', subcategory: '新乡东', intent: 'seek', title: '两人同行测试', place: '东门', time: '18:30', extra: { people: '2', gender: '不限', departureAt: Date.now() + 60 * 60 * 1000, contactQr: 'data:image/png;base64,YQ==' } })
    });
    const first = await request('/posts/' + created.body.id + '/claim', { method: 'POST', headers: userA });
    assert.equal(first.body.status, 'active');
    const visible = await request('/posts', { headers: outsider });
    assert.ok(visible.body.some(post => post.id === created.body.id));
    const second = await request('/posts/' + created.body.id + '/claim', { method: 'POST', headers: userB });
    assert.equal(second.body.status, 'matched');
    const hidden = await request('/posts', { headers: outsider });
    assert.ok(!hidden.body.some(post => post.id === created.body.id));
    assert.equal((await request('/posts/' + created.body.id, { headers: userA })).status, 200);
    assert.equal((await request('/posts/' + created.body.id, { headers: userB })).status, 200);
    assert.equal((await request('/posts/' + created.body.id, { headers: outsider })).status, 404);
    const exited = await request('/posts/' + created.body.id + '/claim', { method: 'DELETE', headers: userB });
    assert.equal(exited.body.status, 'active');
    const reopened = await request('/posts?q=' + encodeURIComponent('两人同行测试'), { headers: outsider });
    assert.ok(reopened.body.some(post => post.id === created.body.id));
    assert.equal(reopened.body.find(post => post.id === created.body.id).extra.contactQr, undefined);
    assert.equal((await request('/posts/' + created.body.id, { headers: userA })).body.extra.contactQr, 'data:image/png;base64,YQ==');
  });

  await t.test('拼车手动或提前十分钟自动结单后保留记录并锁定操作', async () => {
    const owner = { 'x-user-id': 'close-owner' };
    const member = { 'x-user-id': 'close-member' };
    const outsider = { 'x-user-id': 'close-outsider' };
    for (const mode of ['manual', 'automatic']) {
      for (const people of [1, 3]) {
        const payload = { category: '拼车搭子', subcategory: '新乡东', intent: 'seek', title: '拼车结单验证' + mode + people, place: '西门', time: '18:30', extra: { people, departureAt: Date.now() + 60 * 60 * 1000, contactQr: 'data:image/png;base64,YQ==' } };
        const created = await request('/posts', { method: 'POST', headers: owner, body: JSON.stringify(payload) });
        assert.equal(created.status, 201);
        const id = created.body.id;
        const joined = await request('/posts/' + id + '/claim', { method: 'POST', headers: member });
        assert.equal(joined.status, 200);
        const resized = await request('/posts/' + id, { method: 'PUT', headers: owner, body: JSON.stringify({ extra: { people: people === 1 ? 2 : 1 } }) });
        assert.equal(resized.status, 400, '不能修改发布后的所需人数');
        if (mode === 'manual') {
          const closed = await request('/posts/' + id + '/close', { method: 'POST', headers: owner });
          assert.equal(closed.body.status, 'completed');
        } else {
          const fixtureDb = new DatabaseSync(path.join(dataDir, 'campus.db'));
          try {
            payload.extra.departureAt = Date.now() + 9 * 60 * 1000;
            fixtureDb.prepare('UPDATE posts SET extra_json = ? WHERE id = ?').run(JSON.stringify(payload.extra), id);
          } finally { fixtureDb.close(); }
        }
        const detail = await request('/posts/' + id, { headers: member });
        assert.equal(detail.body.status, 'completed');
        assert.equal(detail.body.claimedByMe, true);
        assert.equal(detail.body.extra.contactQr, payload.extra.contactQr);
        assert.equal((await request('/posts/' + id + '/claim', { method: 'DELETE', headers: member })).status, 409);
        assert.equal((await request('/posts/' + id, { method: 'PUT', headers: owner, body: JSON.stringify({ place: '南门' }) })).status, 409);
        assert.equal((await request('/posts/' + id, { method: 'DELETE', headers: owner })).status, 409);
        assert.equal((await request('/posts/' + id + '/reopen', { method: 'POST', headers: owner })).status, 409);
        assert.equal((await request('/posts/' + id, { headers: outsider })).status, 404);
        const publicList = await request('/posts?q=' + encodeURIComponent(payload.title), { headers: outsider });
        assert.ok(!publicList.body.some(post => post.id === id));
        const history = await request('/posts?joined=1', { headers: member });
        assert.ok(history.body.some(post => post.id === id));
        const notifications = await request('/notifications', { headers: member });
        assert.equal(notifications.body.filter(item => item.postId === id).length, 1, '结单提醒只能发送一次');
      }
    }
  });
});
