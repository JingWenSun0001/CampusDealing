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

test('WXML 不调用页面实例方法且首页按新顺序展示三大模块', () => {
  const index = fs.readFileSync(path.join(root, 'pages', 'index', 'index.wxml'), 'utf8');
  const display = fs.readFileSync(path.join(root, 'utils', 'post.js'), 'utf8');
  assert.doesNotMatch(index, /\{\{[^}]*\w+\([^}]*\)[^}]*\}\}/);
  assert.match(index, /board-section/);
  assert.match(display, /同学在帮/);
  assert.match(display, /即将出发/);
  assert.match(display, /好物专区/);
  assert.ok(display.indexOf('即将出发') < display.indexOf('同学在帮'));
  assert.ok(display.indexOf('同学在帮') < display.indexOf('好物专区'));
  assert.doesNotMatch(index, /board-brand|board-slogan|campus-chip|board-section-note/);
  assert.doesNotMatch(index, /map|地图|campus-map/i);
  const indexScript = fs.readFileSync(path.join(root, 'pages', 'index', 'index.js'), 'utf8');
  assert.doesNotMatch(indexScript, /mapPins|openMapPin|campus-map/i);
});

test('搜索页不显示分类筛选栏', () => {
  const search = fs.readFileSync(path.join(root, 'pages', 'search', 'search.wxml'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'pages', 'search', 'search.js'), 'utf8');
  assert.doesNotMatch(search, /search-filters|filterChange|filters/);
  assert.doesNotMatch(script, /filterChange|filters:/);
});

test('清空普通搜索词后回到搜索历史，不展示全部帖子', async () => {
  let requests = 0;
  const page = pageInstance('search', { getPosts: () => { requests += 1; return Promise.resolve([]); } });
  page.data = { ...page.data, keyword: '新乡', posts: [{ id: 1 }], searched: true, loading: false, error: '' };
  page.inputChange({ detail: { value: '' } });
  assert.equal(page.data.searched, false);
  assert.equal(page.data.posts.length, 0);
  await page.submit(false);
  assert.equal(requests, 0);
  assert.equal(page.data.searched, false);
});

test('首页和发布页使用六个核心服务分类', () => {
  const expected = ['拼车搭子', '出租', '服务', '代购', '免费送', '二手好物'];
  const { categories } = require('../miniprogram/utils/catalog');
  assert.deepEqual(categories.map(item => item.category), expected);
  assert.deepEqual(categories.find(item => item.category === '拼车搭子').subitems, ['新乡东', '新乡站', '宝龙', '校本部', '回学校', '其他']);
  assert.ok(!categories.find(item => item.category === '拼车搭子').subitems.includes('考点'));
  const publishMarkup = fs.readFileSync(path.join(root, 'pages', 'publish', 'publish.wxml'), 'utf8');
  assert.match(publishMarkup, /默认从学校出发/);
  assert.deepEqual(categories.find(item => item.category === '出租').subitems, ['电动车', '大疆', 'iPhone', '其他']);
  assert.deepEqual(categories.find(item => item.category === '服务').subitems, ['妆造', '陪练', '摄像', '其他']);
  assert.deepEqual(categories.find(item => item.category === '代购').subitems, ['宝龙', '胖东来', '其他']);
  assert.deepEqual(categories.find(item => item.category === '二手好物').subitems, ['水果', '零食', '生活用品', '教材', '其他']);
  const indexScript = fs.readFileSync(path.join(root, 'pages', 'index', 'index.js'), 'utf8');
  const publishScript = fs.readFileSync(path.join(root, 'pages', 'publish', 'publish.js'), 'utf8');
  assert.match(indexScript, /utils\/catalog/);
  assert.match(publishScript, /utils\/catalog/);
  for (const category of expected) {
    const definition = categories.find(item => item.category === category);
    assert.ok(fs.existsSync(path.join(root, definition.icon)));
  }
});

function pageInstance(name, api = {}) {
  let page;
  const file = path.join(root, 'pages', name, name + '.js');
  const localRequire = require('node:module').createRequire(file);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    require: value => value.endsWith('/api') ? api : localRequire(value),
    Page: definition => { page = definition; },
    wx: { showToast() {}, reLaunch() {} }, setTimeout() {}
  }, { filename: file });
  page.data = JSON.parse(JSON.stringify(page.data));
  page.setData = (changes, callback) => {
    for (const [key, value] of Object.entries(changes)) {
      const parts = key.split('.'); let target = page.data;
      while (parts.length > 1) target = target[parts.shift()];
      target[parts[0]] = value;
    }
    callback?.();
  };
  return page;
}

test('服务发布仅保留服务内容，并使用默认好友码联系', async () => {
  let payload;
  const page = pageInstance('publish', { createPost: value => { payload = value; return Promise.resolve({ id: 1 }); } });
  page.data.defaultContactQr = 'data:image/png;base64,YQ==';
  page.selectCategory('服务');
  page.subcategoryChange({ detail: { value: 0 } });
  page.submit();
  assert.equal(page.data.error, '请填写服务内容');
  page.data.form = { ...page.data.form, title: '打印课程资料' };
  page.submit();
  assert.equal(payload.category, '服务');
  assert.equal(payload.title, '打印课程资料');
  assert.equal(payload.detail, '');
});

test('提供服务可选填能力介绍和图片，不要求服务内容', () => {
  let payload;
  const page = pageInstance('publish', { createPost: value => { payload = value; return Promise.resolve({ id: 1 }); } });
  page.data.defaultContactQr = 'data:image/png;base64,YQ==';
  page.selectCategory('服务');
  page.intentChange({ currentTarget: { dataset: { value: 'offer' } } });
  page.subcategoryChange({ detail: { value: 0 } });
  assert.equal(page.data.flags.showTitle, false);
  assert.equal(page.data.flags.showDetail, true);
  assert.equal(page.data.flags.showImages, true);
  page.data.form.detail = '有两年校园摄影经验，可提供拍摄与修图。';
  page.data.images = ['demo-image'];
  page.readImagesData = () => ['demo-image'];
  page.submit();
  assert.equal(payload.title, '妆造服务');
  assert.equal(payload.detail, '有两年校园摄影经验，可提供拍摄与修图。');
  assert.deepEqual(payload.extra.images, ['demo-image']);
});

test('代购只保留购买地点和供需选择', () => {
  let payload;
  const page = pageInstance('publish', { createPost: value => { payload = value; return Promise.resolve({ id: 1 }); } });
  page.data.defaultContactQr = 'data:image/png;base64,YQ==';
  page.selectCategory('代购');
  page.subcategoryChange({ detail: { value: 0 } });
  assert.equal(page.data.flags.showTitle, false);
  assert.equal(page.data.flags.showDetail, false);
  page.submit();
  assert.equal(payload.title, '宝龙代购');
  assert.equal(payload.detail, '');
});

test('代购选择其他时必须填写具体地点或店名', () => {
  let payload;
  const page = pageInstance('publish', { createPost: value => { payload = value; return Promise.resolve({ id: 1 }); } });
  page.data.defaultContactQr = 'data:image/png;base64,YQ==';
  page.selectCategory('代购');
  page.subcategoryChange({ detail: { value: page.data.subitems.indexOf('其他') } });
  page.submit();
  assert.equal(page.data.error, '请填写具体代购地点或店名');
  page.inputChange({ currentTarget: { dataset: { key: 'shoppingPlace' } }, detail: { value: '校外水果店' } });
  page.submit();
  assert.equal(payload.title, '校外水果店代购');
  assert.equal(payload.extra.shoppingPlace, '校外水果店');
});

test('二手好物价格必填，零元自动按免费送发布', () => {
  let payload;
  const page = pageInstance('publish', { createPost: value => { payload = value; return Promise.resolve({ id: 1 }); } });
  page.data.defaultContactQr = 'data:image/png;base64,YQ==';
  page.selectCategory('二手好物');
  page.subcategoryChange({ detail: { value: 0 } });
  page.data.form.title = '九成新台灯';
  page.submit();
  assert.equal(page.data.error, '请填写价格');
  page.data.form.price = '0';
  page.submit();
  assert.equal(payload.category, '免费送');
  assert.equal(payload.quantity, 1);
});

test('默认好友码用于非拼车发布，单人拼车引用个人好友码', () => {
  let payload;
  const page = pageInstance('publish', { createPost: value => { payload = value; return Promise.resolve({ id: 1 }); } });
  page.selectCategory('服务');
  page.subcategoryChange({ detail: { value: 0 } });
  page.data.form = { ...page.data.form, title: '打印课程资料', place: '图书馆', time: '今天18点' };
  page.submit();
  assert.equal(page.data.error, '请先在我的资料上传默认微信好友码');
  page.data.defaultContactQr = 'data:image/png;base64,YQ==';
  page.submit();
  assert.equal(payload.category, '服务');
  const carpool = pageInstance('publish', { createPost: value => { payload = value; return Promise.resolve({ id: 2 }); } });
  carpool.data.defaultContactQr = 'data:image/png;base64,YQ==';
  carpool.selectCategory('拼车搭子');
  carpool.subcategoryChange({ detail: { value: 0 } });
  carpool.data.form = { ...carpool.data.form, place: '西门', date: '2099-01-01', time: '07:45', remainingPeople: '1' };
  carpool.submit();
  assert.equal(payload.extra.useProfileContact, true);
  assert.equal(payload.extra.contactQr, undefined);
});

test('供给类发布默认方向与界面一致', () => {
  const page = pageInstance('publish');
  for (const category of ['出租', '免费送', '二手好物']) {
    page.selectCategory(category);
    assert.equal(page.data.form.intent, 'offer');
  }
});

test('悬浮选择回填发布表单并保留拼车地点联动和人数锁定', () => {
  const page = pageInstance('publish');
  const select = (key, value, index) => page.selectValue({ currentTarget: { dataset: { select: key } }, detail: { value, index } });
  page.selectCategory('拼车搭子');
  select('subcategory', '回学校', 4);
  assert.equal(page.data.selectedSubcategory, '回学校');
  assert.equal(page.data.form.place, '');
  select('place', '新乡东', 0);
  assert.equal(page.data.form.place, '新乡东');
  select('date', '2099-02-01');
  select('time', '07:43');
  assert.equal(page.data.form.date, '2099-02-01');
  assert.equal(page.data.form.time, '07:43');
  select('people', '3', 2);
  select('gender', '女生', 1);
  assert.equal(page.data.form.remainingPeople, '3');
  assert.equal(page.data.form.gender, '女生');
  page.data.editingId = '123';
  select('people', '1', 0);
  assert.equal(page.data.form.remainingPeople, '3');
});

test('拼车选择其他后必须填写具体目的地', () => {
  let payload;
  const page = pageInstance('publish', { createPost: value => { payload = value; return Promise.resolve({ id: 1 }); } });
  page.data.defaultContactQr = 'data:image/png;base64,YQ==';
  page.selectCategory('拼车搭子');
  const otherIndex = page.data.subitems.indexOf('其他');
  page.subcategoryChange({ detail: { value: otherIndex } });
  page.data.form = { ...page.data.form, place: '西门', date: '2099-01-01', time: '07:45' };
  page.data.qrData = page.data.qrPreview = 'data:image/png;base64,YQ==';
  page.submit();
  assert.equal(page.data.error, '请填写具体目的地');
  page.inputChange({ currentTarget: { dataset: { key: 'destination' } }, detail: { value: '郑州东站' } });
  page.submit();
  assert.equal(payload.subcategory, '其他');
  assert.equal(payload.extra.destination, '郑州东站');
  assert.equal(payload.title, '去郑州东站，找同路搭子');
  page.subcategoryChange({ detail: { value: 0 } });
  assert.equal(page.data.form.destination, '');
});

test('出租支持供需选择，其他物品必须填写具体内容且不显示补充介绍', () => {
  let payload;
  const page = pageInstance('publish', { createPost: value => { payload = value; return Promise.resolve({ id: 1 }); } });
  page.data.defaultContactQr = 'data:image/png;base64,YQ==';
  page.selectCategory('出租');
  assert.equal(page.data.flags.showIntent, true);
  assert.equal(page.data.flags.showDetail, false);
  assert.equal(page.data.meta.seekLabel, '我要租借');
  assert.equal(page.data.meta.offerLabel, '我可提供');
  page.intentChange({ currentTarget: { dataset: { value: 'seek' } } });
  assert.equal(page.data.flags.showImages, false);
  page.subcategoryChange({ detail: { value: page.data.subitems.indexOf('其他') } });
  page.submit();
  assert.equal(page.data.error, '请填写具体租借什么');
  page.inputChange({ currentTarget: { dataset: { key: 'rentalItem' } }, detail: { value: '露营帐篷' } });
  page.intentChange({ currentTarget: { dataset: { value: 'offer' } } });
  assert.equal(page.data.flags.showImages, true);
  page.submit();
  assert.equal(payload.subcategory, '其他');
  assert.equal(payload.extra.rentalItem, '露营帐篷');
  assert.equal(payload.title, '露营帐篷出租');
  page.subcategoryChange({ detail: { value: 0 } });
  assert.equal(page.data.form.rentalItem, '');
});

test('六种类型都能从各自表单生成有效发布内容', () => {
  for (const category of ['拼车搭子', '出租', '服务', '代购', '免费送', '二手好物']) {
    let payload;
    const page = pageInstance('publish', { createPost: value => { payload = value; return Promise.resolve({ id: 1 }); } });
    page.data.defaultContactQr = 'data:image/png;base64,YQ==';
    page.selectCategory(category);
    if (category !== '免费送') page.subcategoryChange({ detail: { value: 0 } });
    page.data.form = { ...page.data.form, title: '测试内容', place: '西门', time: '18:30', date: '2099-01-01', contact: 'wx-test', remainingPeople: '3', price: category === '二手好物' ? '10' : '' };
    if (category === '拼车搭子') page.data.qrData = page.data.qrPreview = 'data:image/png;base64,YQ==';
    page.submit();
    assert.ok(payload, category + '未能发布');
    assert.equal(payload.category, category);
    assert.ok(payload.title);
    if (category === '拼车搭子') assert.equal(payload.extra.people, '3');
    if (category === '免费送') assert.equal(payload.quantity, 1);
  }
});

test('多人拼车仍可加入，预留份数不被当作完成', () => {
  const { normalizePost } = require('../miniprogram/utils/post');
  const post = normalizePost({ category: '拼车搭子', status: 'active', claimed: true, participantCount: 1, participantLimit: 3 });
  assert.equal(post.actionDisabled, false);
  assert.equal(post.actionButtonLabel, '加入同行');
  assert.equal(normalizePost({ category: '拼车搭子', subcategory: '其他', extra: { destination: '郑州东站' } }).displaySubcategory, '郑州东站');
  assert.equal(normalizePost({ category: '出租', subcategory: '其他', extra: { rentalItem: '露营帐篷' } }).displaySubcategory, '露营帐篷');
  assert.equal(normalizePost({ category: '代购', subcategory: '其他', extra: { shoppingPlace: '校外水果店' } }).displaySubcategory, '校外水果店');
  assert.equal(normalizePost({ category: '代取', status: 'active' }).category, '服务');
  const profile = pageInstance('profile');
  profile.data.mine = [{ id: 1, category: '免费送', availableQuantity: 0, status: 'matched' }];
  profile.updateList();
  assert.equal(profile.data.stats.completed, 0);
  assert.equal(profile.data.stats.published, 1);
});

test('头像资源存在且大小适合小程序包', () => {
  const file = path.join(root, 'assets', 'river-easy-avatar.png');
  assert.ok(fs.existsSync(file));
  assert.ok(fs.statSync(file).size < 3 * 1024 * 1024, 'river-easy-avatar.png 体积过大');
  assert.ok(!fs.existsSync(path.join(root, 'assets', 'campus-map-clean.png')));
});
