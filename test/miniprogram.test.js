const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', 'miniprogram');

test('小程序页面和配置完整', () => {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  assert.equal(app.window.navigationBarTitleText, '河小易');
  assert.ok(app.pages.length >= 5);
  for (const page of app.pages) {
    for (const extension of ['.js', '.json', '.wxml']) {
      const file = path.join(root, page + extension);
      assert.ok(fs.existsSync(file), `缺少页面文件：${page + extension}`);
    }
  }
});

test('小程序 JavaScript 均可解析', () => {
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  }
  visit(root);
  for (const file of files) {
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }));
  }
});

test('WXML 不调用页面实例方法且首页不再包含地图', () => {
  const index = fs.readFileSync(path.join(root, 'pages', 'index', 'index.wxml'), 'utf8');
  assert.doesNotMatch(index, /\{\{[^}]*\w+\([^}]*\)[^}]*\}\}/);
  assert.match(index, /item\.actionLabel/);
  assert.doesNotMatch(index, /map|地图|campus-map/i);
  const indexScript = fs.readFileSync(path.join(root, 'pages', 'index', 'index.js'), 'utf8');
  assert.doesNotMatch(indexScript, /mapPins|openMapPin|campus-map/i);
});

test('首页和发布页使用六个核心服务分类', () => {
  const expected = ['拼车搭子', '出租', '代取', '代购', '免费送', '二手好物'];
  const indexScript = fs.readFileSync(path.join(root, 'pages', 'index', 'index.js'), 'utf8');
  const publishScript = fs.readFileSync(path.join(root, 'pages', 'publish', 'publish.js'), 'utf8');
  for (const category of expected) {
    assert.match(indexScript, new RegExp(category));
    assert.match(publishScript, new RegExp(category));
  }
});

test('头像资源存在且大小适合小程序包', () => {
  const file = path.join(root, 'assets', 'river-easy-avatar.png');
  assert.ok(fs.existsSync(file));
  assert.ok(fs.statSync(file).size < 3 * 1024 * 1024, 'river-easy-avatar.png 体积过大');
  assert.ok(!fs.existsSync(path.join(root, 'assets', 'campus-map-clean.png')));
});
