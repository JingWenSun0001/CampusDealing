const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '..', 'miniprogram', 'components', 'floating-select', 'floating-select.js');

function componentInstance(properties = {}, queryRects = []) {
  let definition;
  const events = [];
  let queryCount = 0;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Component: value => { definition = value; },
    wx: { getWindowInfo: () => ({ windowWidth: 375, windowHeight: 667 }) }
  }, { filename: file });
  const defaults = Object.fromEntries(Object.entries(definition.properties).map(([key, property]) => [key, property.value]));
  const instance = {
    ...definition.methods,
    data: JSON.parse(JSON.stringify({ ...defaults, ...definition.data, ...properties })),
    setData(changes) { Object.assign(this.data, changes); },
    triggerEvent(name, detail) { events.push({ name, detail: detail && JSON.parse(JSON.stringify(detail)) }); },
    createSelectorQuery() {
      queryCount += 1;
      return {
        select() { return this; },
        boundingClientRect(callback) {
          callback(queryRects[queryCount - 1] || { left: 22, top: 150, bottom: 194, width: 170, height: 44 });
          return this;
        },
        exec() {}
      };
    }
  };
  return { instance, events, changes: () => events.filter(event => event.name === 'change'), queryCount: () => queryCount };
}

const valueEvent = value => ({ currentTarget: { dataset: { value } } });

test('页面滚动时展开菜单会跟随触发字段重新定位', () => {
  const { instance, queryCount } = componentInstance(
    { options: ['新乡东', '新乡站'] },
    [
      { left: 22, top: 150, bottom: 194, width: 170, height: 44 },
      { left: 22, top: 90, bottom: 134, width: 170, height: 44 },
      { left: 22, top: -80, bottom: -36, width: 170, height: 44 }
    ]
  );
  instance.open();
  assert.match(instance.data.panelStyle, /top:201px/);
  instance.syncPosition();
  assert.match(instance.data.panelStyle, /top:141px/);
  assert.equal(queryCount(), 2);
  instance.syncPosition();
  assert.equal(instance.data.opened, false, '字段完全离开屏幕后关闭菜单');
});

test('日期下限会校正初始值，禁用早于下限的日期和月份', () => {
  const { instance, changes } = componentInstance({ mode: 'date', value: '2028-02-01', start: '2028-02-15' });
  instance.open();
  assert.equal(instance.data.opened, true);
  assert.equal(instance.data.draftDate, '2028-02-15');
  assert.equal(instance.data.prevDisabled, true);
  assert.equal(instance.data.days.find(day => day.value === '2028-02-14').disabled, true);
  instance.chooseDate(valueEvent('2028-02-14'));
  instance.previousMonth();
  assert.equal(instance.data.draftDate, '2028-02-15');
  assert.equal(instance.data.monthTitle, '2028 年 2 月');
  instance.chooseDate(valueEvent('2028-02-16'));
  assert.equal(changes().length, 0, '选中日期只修改草稿');
  instance.confirm();
  assert.deepEqual(changes(), [{ name: 'change', detail: { value: '2028-02-16' } }]);
  assert.equal(instance.data.opened, false);
});

test('跨月日历支持闰年二月二十九日和跨年导航', () => {
  const { instance, changes } = componentInstance({ mode: 'date', value: '2028-01-31', start: '2027-01-01' });
  instance.open();
  instance.nextMonth();
  assert.equal(instance.data.monthTitle, '2028 年 2 月');
  assert.equal(instance.data.days.filter(day => day.value).length, 29);
  instance.chooseDate(valueEvent('2028-02-29'));
  instance.nextMonth();
  instance.previousMonth();
  assert.equal(instance.data.days.find(day => day.value === '2028-02-29').selected, true);
  instance.confirm();
  assert.equal(changes()[0].detail.value, '2028-02-29');
  instance.data.value = '2028-01-31';
  instance.open();
  instance.previousMonth();
  assert.equal(instance.data.monthTitle, '2027 年 12 月');
  instance.nextMonth();
  assert.equal(instance.data.monthTitle, '2028 年 1 月');
});

test('平年二月和日期上限不会生成可选的无效日期', () => {
  const { instance } = componentInstance({ mode: 'date', value: '2027-02-10', end: '2027-02-20' });
  instance.open();
  assert.equal(instance.data.days.filter(day => day.value).length, 28);
  assert.equal(instance.data.days.some(day => day.value === '2027-02-29'), false);
  assert.equal(instance.data.days.find(day => day.value === '2027-02-21').disabled, true);
  instance.chooseDate(valueEvent('2027-02-21'));
  instance.nextMonth();
  assert.equal(instance.data.draftDate, '2027-02-10');
  assert.equal(instance.data.monthTitle, '2027 年 2 月');
});

test('修改时间小时和分钟会保留另一列，确认后才提交', () => {
  const { instance, changes } = componentInstance({ mode: 'time', value: '17:43' });
  instance.open();
  assert.equal(instance.data.timeSummary, '17:43');
  instance.chooseMinute(valueEvent(58));
  instance.chooseHour(valueEvent(18));
  assert.equal(instance.data.timeSummary, '18:58');
  assert.equal(instance.data.draftMinute, 58);
  assert.equal(changes().length, 0);
  instance.chooseMinute(valueEvent(7));
  assert.equal(instance.data.timeSummary, '18:07');
  assert.equal(instance.data.draftHour, 18);
  instance.confirm();
  assert.deepEqual(changes(), [{ name: 'change', detail: { value: '18:07' } }]);
  assert.equal(instance.data.opened, false);
});

test('23:55 上限约束初始时间及跨小时选择，不能选到越界分钟', () => {
  const { instance, changes } = componentInstance({ mode: 'time', value: '23:59', end: '23:55' });
  instance.open();
  assert.equal(instance.data.timeSummary, '23:55');
  instance.chooseMinute(valueEvent(56));
  assert.equal(instance.data.timeSummary, '23:55');
  instance.chooseHour(valueEvent(22));
  instance.chooseMinute(valueEvent(59));
  assert.equal(instance.data.timeSummary, '22:59');
  instance.chooseHour(valueEvent(23));
  assert.equal(instance.data.timeSummary, '23:55');
  instance.confirm();
  assert.equal(changes()[0].detail.value, '23:55');
});

test('拼车时间只显示五点到二十三点并按五分钟取值', () => {
  const { instance } = componentInstance({ mode: 'time', value: '14:41', start: '05:00', end: '23:55', minuteStep: 5 });
  instance.open();
  assert.deepEqual([...instance.data.hours].map(item => item.value), Array.from({ length: 19 }, (_, index) => index + 5));
  assert.deepEqual([...instance.data.minutes].map(item => item.value), [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  assert.equal(instance.data.timeSummary, '14:40');
  instance.chooseMinute(valueEvent(41));
  assert.equal(instance.data.timeSummary, '14:40');
  instance.chooseMinute(valueEvent(45));
  assert.equal(instance.data.timeSummary, '14:45');
});

test('选择器只用高亮表示选中且人数不显示单位', () => {
  const markup = fs.readFileSync(path.join(path.dirname(file), 'floating-select.wxml'), 'utf8');
  const publish = fs.readFileSync(path.join(__dirname, '..', 'miniprogram', 'pages', 'publish', 'publish.wxml'), 'utf8');
  assert.doesNotMatch(markup, /✓|fs-check/);
  assert.doesNotMatch(publish, /suffix=" 人"/);
});

test('其他选项可显示调用方提供的辅助说明', () => {
  const markup = fs.readFileSync(path.join(path.dirname(file), 'floating-select.wxml'), 'utf8');
  assert.match(markup, /otherHint/);
  assert.match(markup, /fs-option-hint/);
});

test('取消日期或时间不会提交，重新打开恢复已保存的值', () => {
  for (const mode of ['date', 'time']) {
    const value = mode === 'date' ? '2028-03-10' : '16:20';
    const { instance, changes } = componentInstance({ mode, value });
    instance.open();
    if (mode === 'date') instance.chooseDate(valueEvent('2028-03-12'));
    else instance.chooseMinute(valueEvent(35));
    instance.close();
    assert.equal(changes().length, 0);
    assert.equal(instance.data.opened, false);
    instance.open();
    assert.equal(mode === 'date' ? instance.data.draftDate : instance.data.timeSummary, value);
  }
});

test('已固定人数的禁用选择器不打开，也不触发打开事件', () => {
  const { instance, events, queryCount } = componentInstance({ options: ['1', '2', '3'], value: '3', disabled: true });
  instance.open();
  assert.equal(instance.data.opened, false);
  assert.deepEqual(events, []);
  assert.equal(queryCount(), 0);
});

test('普通选项点击一次即提交对应值与索引并关闭悬浮菜单', () => {
  const { instance, changes } = componentInstance({ options: ['西门', '南门'], value: '西门' });
  instance.open();
  instance.chooseOption({ currentTarget: { dataset: { index: '1' } } });
  assert.deepEqual(changes(), [{ name: 'change', detail: { value: '南门', index: 1 } }]);
  assert.equal(instance.data.opened, false);
});
