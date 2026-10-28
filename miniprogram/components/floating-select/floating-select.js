const pad = value => String(value).padStart(2, '0');

function dateString(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return dateString(date) === value ? date : null;
}

function parseTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '');
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

Component({
  properties: {
    mode: { type: String, value: 'selector' },
    options: { type: Array, value: [] },
    value: { type: String, value: '' },
    placeholder: { type: String, value: '请选择' },
    disabled: { type: Boolean, value: false },
    start: { type: String, value: '' },
    end: { type: String, value: '23:55' },
    minuteStep: { type: Number, value: 1 },
    label: { type: String, value: '' },
    otherHint: { type: String, value: '' },
    suffix: { type: String, value: '' }
  },

  data: {
    opened: false,
    panelStyle: '',
    opensUp: false,
    listHeight: 0,
    bodyHeight: 0,
    timeColumnHeight: 0,
    monthTitle: '',
    days: [],
    weekdays: ['一', '二', '三', '四', '五', '六', '日'],
    prevDisabled: false,
    nextDisabled: false,
    draftDate: '',
    draftHour: 0,
    draftMinute: 0,
    hours: [],
    minutes: [],
    hourAnchor: '',
    minuteAnchor: '',
    timeSummary: ''
  },

  observers: {
    'value, start, end, mode, minuteStep': function () {
      if (this.data.opened) this.prepareDraft();
    },
    disabled: function (value) {
      if (value) this.close();
    }
  },

  lifetimes: {
    detached() {
      this._openingToken = (this._openingToken || 0) + 1;
    }
  },

  methods: {
    noop() {},

    close() {
      this._openingToken = (this._openingToken || 0) + 1;
      if (this.data.opened) this.setData({ opened: false });
    },

    open() {
      if (this.data.disabled) return;
      if (this.data.opened) return this.close();
      const token = (this._openingToken || 0) + 1;
      this._openingToken = token;
      this.triggerEvent('open');
      this.prepareDraft();
      this.positionPanel(token);
    },

    syncPosition() {
      if (!this.data.opened) return;
      this.positionPanel(this._openingToken);
    },

    positionPanel(token) {
      const info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const windowWidth = info.windowWidth || 375;
      const windowHeight = info.windowHeight || 667;
      this.createSelectorQuery().select('.fs-trigger').boundingClientRect(rect => {
        if (!rect || token !== this._openingToken) return;
        if (rect.bottom < 0 || rect.top > windowHeight) return this.close();
        const scale = windowWidth / 750;
        const wide = this.data.mode === 'date' || this.data.mode === 'time';
        const width = Math.min(windowWidth - 24, wide ? Math.max(280, rect.width) : Math.max(174, rect.width));
        const desiredHeight = wide ? (this.data.mode === 'date' ? 656 : 558) * scale : Math.min(360, Math.max(1, this.data.options.length) * 88 * scale + 20 * scale);
        const gap = 7;
        const below = windowHeight - rect.bottom - gap - 12;
        const above = rect.top - gap - 12;
        const opensUp = below < desiredHeight && above > below;
        const available = Math.max(100, opensUp ? above : below);
        const height = Math.min(desiredHeight, available, windowHeight - 24);
        const left = Math.max(12, Math.min(rect.left, windowWidth - width - 12));
        const top = Math.max(12, Math.min(opensUp ? rect.top - gap - height : rect.bottom + gap, windowHeight - height - 12));
        const listHeight = Math.max(44, height - 22 * scale);
        const bodyHeight = Math.max(24, listHeight - 92 * scale);
        this.setData({
          opened: true,
          opensUp,
          listHeight,
          bodyHeight,
          timeColumnHeight: Math.max(44, bodyHeight - 119 * scale),
          panelStyle: 'left:' + left + 'px;top:' + top + 'px;width:' + width + 'px;max-height:' + height + 'px;'
        });
      }).exec();
    },

    prepareDraft() {
      if (this.data.mode === 'date') {
        let selected = parseDate(this.data.value) || new Date();
        const min = parseDate(this.data.start);
        const max = parseDate(this.data.end);
        if (min && selected < min) selected = min;
        if (max && selected > max) selected = max;
        this._calendarYear = selected.getFullYear();
        this._calendarMonth = selected.getMonth();
        this.setData({ draftDate: dateString(selected) });
        this.buildCalendar();
      } else if (this.data.mode === 'time') {
        const now = new Date();
        const max = parseTime(this.data.end) || { hour: 23, minute: 55 };
        const min = parseTime(this.data.start) || { hour: 0, minute: 0 };
        let selected = parseTime(this.data.value) || { hour: now.getHours(), minute: now.getMinutes() };
        if (selected.hour * 60 + selected.minute > max.hour * 60 + max.minute) selected = max;
        if (selected.hour * 60 + selected.minute < min.hour * 60 + min.minute) selected = min;
        this._timeMin = min;
        this._timeMax = max;
        this.buildTime(selected.hour, selected.minute);
      }
    },

    chooseOption(event) {
      const index = Number(event.currentTarget.dataset.index);
      if (!Number.isInteger(index) || index < 0 || index >= this.data.options.length) return;
      this.triggerEvent('change', { value: String(this.data.options[index]), index });
      this.close();
    },

    buildCalendar() {
      const year = this._calendarYear;
      const month = this._calendarMonth;
      const first = new Date(year, month, 1);
      const offset = (first.getDay() + 6) % 7;
      const count = new Date(year, month + 1, 0).getDate();
      const min = parseDate(this.data.start);
      const max = parseDate(this.data.end);
      const today = dateString(new Date());
      const days = Array.from({ length: 42 }, (_, index) => {
        const day = index - offset + 1;
        if (day < 1 || day > count) return { id: 'empty-' + index, day: '', value: '', disabled: true };
        const date = new Date(year, month, day);
        const value = dateString(date);
        return { id: value, day, value, disabled: Boolean((min && date < min) || (max && date > max)), selected: value === this.data.draftDate, today: value === today };
      });
      this.setData({
        monthTitle: year + ' 年 ' + (month + 1) + ' 月',
        days,
        prevDisabled: Boolean(min && new Date(year, month, 0) < min),
        nextDisabled: Boolean(max && new Date(year, month + 1, 1) > max)
      });
    },

    previousMonth() {
      if (this.data.prevDisabled) return;
      const date = new Date(this._calendarYear, this._calendarMonth - 1, 1);
      this._calendarYear = date.getFullYear();
      this._calendarMonth = date.getMonth();
      this.buildCalendar();
    },

    nextMonth() {
      if (this.data.nextDisabled) return;
      const date = new Date(this._calendarYear, this._calendarMonth + 1, 1);
      this._calendarYear = date.getFullYear();
      this._calendarMonth = date.getMonth();
      this.buildCalendar();
    },

    chooseDate(event) {
      const value = event.currentTarget.dataset.value;
      const cell = this.data.days.find(day => day.value === value);
      if (!cell || cell.disabled || !cell.value) return;
      this.setData({ draftDate: value });
      this.buildCalendar();
    },

    buildTime(hour, minute) {
      const min = this._timeMin;
      const max = this._timeMax;
      const step = Math.max(1, Math.min(30, Math.floor(Number(this.data.minuteStep) || 1)));
      const hours = Array.from({ length: max.hour - min.hour + 1 }, (_, index) => {
        const value = min.hour + index;
        return { value, label: pad(value), selected: value === hour };
      });
      const minuteValues = [];
      for (let value = 0; value < 60; value += step) {
        if (hour === min.hour && value < min.minute) continue;
        if (hour === max.hour && value > max.minute) continue;
        minuteValues.push(value);
      }
      if (!minuteValues.length) return;
      const normalizedMinute = minuteValues.reduce((nearest, value) => Math.abs(value - minute) < Math.abs(nearest - minute) ? value : nearest, minuteValues[0]);
      const minutes = minuteValues.map(value => ({ value, label: pad(value), selected: value === normalizedMinute }));
      this.setData({
        draftHour: hour, draftMinute: normalizedMinute, hours, minutes,
        hourAnchor: 'fs-hour-' + Math.max(0, hour - 1),
        minuteAnchor: 'fs-minute-' + Math.max(0, normalizedMinute - step),
        timeSummary: pad(hour) + ':' + pad(normalizedMinute)
      });
    },

    chooseHour(event) {
      const hour = Number(event.currentTarget.dataset.value);
      if (!this.data.hours.some(item => item.value === hour)) return;
      let minute = this.data.draftMinute;
      if (hour === this._timeMax.hour) minute = Math.min(minute, this._timeMax.minute);
      if (hour === this._timeMin.hour) minute = Math.max(minute, this._timeMin.minute);
      this.buildTime(hour, minute);
    },

    chooseMinute(event) {
      const minute = Number(event.currentTarget.dataset.value);
      if (!this.data.minutes.some(item => item.value === minute)) return;
      this.buildTime(this.data.draftHour, minute);
    },

    confirm() {
      const value = this.data.mode === 'date' ? this.data.draftDate : this.data.timeSummary;
      if (!value) return;
      this.triggerEvent('change', { value });
      this.close();
    }
  }
});
