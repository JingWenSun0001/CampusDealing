const api = require('../../utils/api');
const { categories } = require('../../utils/catalog');
const { materializeQr } = require('../../utils/qr');
function localDateString(date = new Date()) { return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'); }
const defaults = { intent: 'seek', title: '', place: '', time: '', date: localDateString(), price: '', detail: '', contact: '', quantity: '1', remainingPeople: '1', gender: '不限性别' };
const metadata = {
  拼车搭子: { subLabel: '目的地', titleLabel: '行程说明', placeLabel: '集合地点', placePlaceholder: '选择集合地点', timeLabel: '出发时间' },
  出租: { subLabel: '物品类别', titleLabel: '物品信息', detailPlaceholder: '品牌、型号、使用情况或归还方式' },
  服务: { subLabel: '服务类型', titleLabel: '需要做什么', titlePlaceholder: '例如：为同学完成妆造、陪练或拍摄', placeLabel: '服务地点', placePlaceholder: '例如：图书馆、教学楼A', timeLabel: '希望完成时间', detailPlaceholder: '补充具体要求或交接方式', seekLabel: '我需要帮助', offerLabel: '我可以帮忙' },
  代购: { subLabel: '购买地点', titleLabel: '要买什么', titlePlaceholder: '例如：帮带一杯少冰奶茶', detailPlaceholder: '数量、规格和备注', seekLabel: '我需要代购', offerLabel: '我可以代购' },
  免费送: { titleLabel: '想送点什么', titlePlaceholder: '例如：台灯、衣物或教材', placeLabel: '领取地点', placePlaceholder: '例如：3号宿舍楼下' },
  二手好物: { subLabel: '物品分类', titleLabel: '物品信息', titlePlaceholder: '例如：九成新台灯，功能正常' }
};
Page({
  data: { categories, categoryIndex: -1, selectedCategory: '', selectedSubcategory: '', subitems: [], subcategoryIndex: -1, placeOptions: ['西门', '南门'], placeIndex: -1, peopleOptions: ['1', '2', '3'], peopleIndex: 0, genderOptions: ['男生', '女生', '不限性别'], genderIndex: 2, dateStart: localDateString(), meta: {}, form: { ...defaults }, images: [], qrPreview: '', qrData: '', editingId: '', flags: {}, error: '', submitting: false },
  onLoad(options = {}) { if (options.id) this.loadForEdit(options.id); else if (options.category) this.selectCategory(options.category); },
  onHide() { this.closeSelects(); },
  onPageScroll() {
    if (!this.activeSelect || !this.selectComponent) return;
    const component = this.selectComponent('#select-' + this.activeSelect);
    if (component) component.syncPosition();
  },
  closeSelects(e) {
    if (!this.selectComponent) return;
    const current = e?.currentTarget?.dataset?.select;
    this.activeSelect = current || '';
    ['subcategory', 'place', 'date', 'time', 'people', 'gender'].forEach(key => {
      if (key === current) return;
      const component = this.selectComponent('#select-' + key);
      if (component) component.close();
    });
  },
  selectValue(e) {
    const key = e.currentTarget.dataset.select;
    this.activeSelect = '';
    const handlers = { subcategory: 'subcategoryChange', place: 'placeChange', people: 'peopleChange', gender: 'genderChange', date: 'dateChange', time: 'timeChange' };
    if (!handlers[key]) return;
    this[handlers[key]]({ detail: { value: key === 'date' || key === 'time' ? e.detail.value : e.detail.index } });
  },
  loadForEdit(id) {
    this.setData({ editingId: id, error: '' });
    api.getPost(id).then(post => {
      if (post.category !== '拼车搭子') throw new Error('只有拼车行程支持修改');
      this.selectCategory('拼车搭子');
      const subcategoryIndex = this.data.subitems.indexOf(post.subcategory);
      const people = String(post.extra?.people || post.participantLimit || 1);
      const peopleIndex = Math.max(0, this.data.peopleOptions.indexOf(people));
      const genderIndex = Math.max(0, this.data.genderOptions.indexOf(post.extra?.gender || '不限性别'));
      const placeOptions = post.subcategory === '回学校' ? ['新乡东', '新乡站', '宝龙', '校本部', '考点'] : ['西门', '南门'];
      const departureDate = Number(post.extra?.departureAt) ? new Date(Number(post.extra.departureAt)) : new Date();
      return materializeQr(post.extra?.contactQr, post.id).then(qrPreview => this.setData({ selectedSubcategory: post.subcategory, subcategoryIndex, placeOptions, placeIndex: placeOptions.indexOf(post.place), peopleIndex, genderIndex, qrData: post.extra?.contactQr || '', qrPreview, form: { ...this.data.form, title: post.title, place: post.place, date: localDateString(departureDate), time: post.time, remainingPeople: people, gender: post.extra?.gender || '不限性别', detail: post.detail || '' } }));
    }).catch(err => this.setData({ error: err.message || '加载行程失败' }));
  },
  categorySelect(e) { this.selectCategory(e.currentTarget.dataset.category); },
  selectCategory(category) {
    const categoryIndex = categories.findIndex(item => item.category === category);
    if (categoryIndex < 0) return;
    this.closeSelects();
    const form = { ...defaults, intent: ['出租', '免费送', '二手好物'].includes(category) ? 'offer' : 'seek' };
    this.setData({ selectedCategory: category, categoryIndex, subitems: categories[categoryIndex].subitems, subcategoryIndex: -1, selectedSubcategory: '', form: { ...form, date: localDateString() }, images: [], meta: metadata[category], placeIndex: -1, peopleIndex: 0, genderIndex: 2, error: '' }, () => this.updateFlags());
  },
  updateFlags() {
    const c = this.data.selectedCategory, intent = this.data.form.intent;
    this.setData({ flags: {
      carpool: c === '拼车搭子', rental: c === '出租', service: c === '服务', giveaway: c === '免费送', goods: c === '二手好物',
      showIntent: c === '服务' || c === '代购',
      showTitle: c !== '拼车搭子' && c !== '出租' && !(c === '代购' && intent === 'offer'),
      showPlace: c === '服务' || c === '免费送', showTime: c === '服务', showContact: c === '服务',
      showImages: c === '出租' || c === '二手好物',
      showDetail: c === '出租' || c === '服务' || (c === '代购' && intent === 'seek')
    } });
  },
  subcategoryChange(e) {
    const subcategoryIndex = Number(e.detail.value);
    const selectedSubcategory = this.data.subitems[subcategoryIndex];
    this.setData({ subcategoryIndex, selectedSubcategory, placeOptions: selectedSubcategory === '回学校' ? ['新乡东', '新乡站', '宝龙', '校本部', '考点'] : ['西门', '南门'], placeIndex: -1, 'form.place': this.data.flags.carpool ? '' : this.data.form.place });
  },
  placeChange(e) { const placeIndex = Number(e.detail.value); this.setData({ placeIndex, 'form.place': this.data.placeOptions[placeIndex], error: '' }); },
  dateChange(e) { this.setData({ 'form.date': e.detail.value, error: '' }); },
  peopleChange(e) { if (this.data.editingId) return; const peopleIndex = Number(e.detail.value); const remainingPeople = this.data.peopleOptions[peopleIndex]; const changedQrMode = this.data.form.remainingPeople !== remainingPeople; this.setData({ peopleIndex, 'form.remainingPeople': remainingPeople, ...(changedQrMode ? { qrPreview: '', qrData: '' } : {}) }); },
  genderChange(e) { const genderIndex = Number(e.detail.value); this.setData({ genderIndex, 'form.gender': this.data.genderOptions[genderIndex] }); },
  timeChange(e) { this.setData({ 'form.time': e.detail.value, error: '' }); },
  intentChange(e) { this.setData({ 'form.intent': e.currentTarget.dataset.value, error: '' }, () => this.updateFlags()); },
  inputChange(e) { this.setData({ ['form.' + e.currentTarget.dataset.key]: e.detail.value, error: '' }); },
  chooseImages() {
    wx.chooseMedia({ count: 9 - this.data.images.length, mediaType: ['image'], sourceType: ['album', 'camera'], success: res => this.setData({ images: this.data.images.concat(res.tempFiles.map(item => item.tempFilePath)).slice(0, 9) }) });
  },
  removeImage(e) { this.setData({ images: this.data.images.filter((_, index) => index !== Number(e.currentTarget.dataset.index)) }); },
  chooseQr() {
    wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], success: res => {
      const file = res.tempFiles[0];
      this.setData({ qrPreview: file.tempFilePath, error: '' });
    } });
  },
  removeQr() { this.setData({ qrPreview: '', qrData: '', error: '' }); },
  readQrData() {
    if (this.data.qrData && this.data.qrData.indexOf('data:image/') === 0 && this.data.qrPreview === this.data.qrData) return this.data.qrData;
    if (!this.data.qrPreview) return '';
    return new Promise((resolve, reject) => {
      const manager = wx.getFileSystemManager && wx.getFileSystemManager();
      if (!manager) return reject(new Error('无法读取二维码图片'));
      manager.readFile({ filePath: this.data.qrPreview, encoding: 'base64', success: result => {
        const lower = this.data.qrPreview.toLowerCase();
        const mime = lower.indexOf('.png') >= 0 ? 'image/png' : 'image/jpeg';
        resolve('data:' + mime + ';base64,' + result.data);
      }, fail: reject });
    });
  },
  submit() {
    if (this.data.submitting) return;
    const { selectedCategory: c, selectedSubcategory: sub, flags, form: f } = this.data;
    const fail = error => this.setData({ error });
    if (!c) return fail('请选择发布类型');
    if (!flags.giveaway && !sub) return fail('请选择具体项目');
    if (flags.showTitle && !f.title.trim()) return fail('请填写' + this.data.meta.titleLabel);
    if ((flags.carpool || flags.showPlace) && !f.place.trim()) return fail('请填写' + this.data.meta.placeLabel);
    if ((flags.carpool || flags.showTime) && !f.time.trim()) return fail('请填写' + this.data.meta.timeLabel);
    if (flags.carpool && !f.date.trim()) return fail('请选择出发日期');
    if (flags.showContact && !f.contact.trim()) return fail('请填写联系方式');
    if (flags.carpool && !this.data.qrPreview) return fail(f.remainingPeople === '1' ? '请上传微信加好友码' : '请上传临时微信群二维码');
    if (flags.giveaway && (!/^\d+$/.test(f.quantity) || Number(f.quantity) < 1 || Number(f.quantity) > 9999)) return fail('数量需为1到9999之间的整数');
    const title = flags.carpool ? (sub === '回学校' ? '回学校，找同路搭子' : '去' + sub + '，找同路搭子') : flags.rental ? sub + '出租' : (c === '代购' && f.intent === 'offer') ? sub + '代购服务' : f.title.trim();
    const departureAt = flags.carpool ? new Date(f.date + 'T' + f.time + ':00').getTime() : 0;
    if (flags.carpool && (!Number.isFinite(departureAt) || departureAt <= Date.now())) return fail('出发时间必须晚于现在');
    const payload = { category: c, subcategory: sub, ...f, title, quantity: flags.giveaway ? Number(f.quantity) : 1, detail: flags.showDetail ? f.detail : '', price: flags.goods ? f.price : '', extra: { images: this.data.images, ...(flags.carpool ? { people: f.remainingPeople, gender: f.gender, departureAt } : {}) } };
    this.setData({ submitting: true, error: '' });
    const save = qrData => {
      if (flags.carpool) payload.extra.contactQr = qrData;
      return this.data.editingId ? api.updatePost(this.data.editingId, payload) : api.createPost(payload);
    };
    const qrResult = flags.carpool ? this.readQrData() : '';
    const request = typeof qrResult === 'string' ? save(qrResult) : qrResult.then(save);
    request.then(() => { wx.showToast({ title: this.data.editingId ? '已保存修改' : '发布成功', icon: 'success' }); setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 400); })
      .catch(err => this.setData({ error: err.message || '发布失败，请稍后重试', submitting: false }));
  }
});
