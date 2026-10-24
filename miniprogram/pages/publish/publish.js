const api = require('../../utils/api');
const defs = [['拼车搭子',['新乡东','新乡站','宝龙','校本部','回学校','考点']],['出租',['电动车','大疆','iPhone','其他']],['代取',['快递','外卖','物品','文件','其他']],['代购',['小吃街','学子超市','宝龙','胖东来','其他']],['免费送',['书籍','生活用品','衣物','其他']],['二手好物',['水果','零食','护肤品','生活用品','数码','其他']]];
const carpoolDestinations = ['新乡东','新乡站','宝龙','校本部','考点'];
const carpoolGates = ['西门','南门'];
const genderOptions = ['男生','女生','不限性别'];
const deliveryOptions = ['1号楼','2号楼','3号楼','4号楼','5号楼','6号楼','7号楼','8号楼','9号楼','其他'];
const quantityOptions = Array.from({ length: 20 }, (_, index) => String(index + 1));
const peopleOptions = ['1', '2', '3'];
const timeHours = Array.from({ length: 19 }, (_, index) => String(index + 5).padStart(2, '0'));
const timeMinutes = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'));
const meta = {
  '出租': { intentLabel: '发布目的', seekLabel: '我要借用', offerLabel: '我要出租', titleLabel: '物品信息', titlePlaceholder: '例如：九成新电动车，电量足', placeLabel: '交接地点', placePlaceholder: '例如：东门车棚', timeLabel: '可用时间', timePlaceholder: '例如：今天18:00后', detailPlaceholder: '补充成色、押金和归还方式' },
  '拼车搭子': { intentLabel: '出行方式', seekLabel: '找人同行', offerLabel: '我有空位', titleLabel: '行程说明', titlePlaceholder: '例如：今晚去新乡东，找同路', placeLabel: '约见地点', placePlaceholder: '选一个约见地点吧', subcategoryPlaceholder: '选一个目的地吧', timeLabel: '出发时间', timePlaceholder: '例如：今天18:30', detailPlaceholder: '补充集合点、人数和行李情况' },
  '代取': { intentLabel: '需求方向', seekLabel: '我需要代取', offerLabel: '我可以代取', titleLabel: '要取什么', titlePlaceholder: '例如：帮我取一下快递', placeLabel: '取货 / 送达地点', placePlaceholder: '例如：快递站 → 3号楼', timeLabel: '完成时间', timePlaceholder: '例如：今天18:00前', detailPlaceholder: '补充单号、规格和交接方式' },
  '代购': { intentLabel: '需求方向', seekLabel: '我需要代购', offerLabel: '我可以代购', titleLabel: '要买什么', titlePlaceholder: '例如：帮带一杯少冰奶茶', placeLabel: '购买 / 送达地点', placePlaceholder: '例如：宝龙 → 5号楼', timeLabel: '送达时间', timePlaceholder: '例如：今晚20:00前', detailPlaceholder: '补充店铺、规格和预算' },
  '免费送': { intentLabel: '发布目的', seekLabel: '我想领取', offerLabel: '我来送出', titleLabel: '物品信息', titlePlaceholder: '例如：台灯、衣物或教材', placeLabel: '领取地点', placePlaceholder: '例如：3号宿舍楼下' },
  '二手好物': { intentLabel: '发布目的', seekLabel: '我想购买', offerLabel: '我想出售', titleLabel: '物品信息', titlePlaceholder: '例如：九成新台灯，功能正常', placeLabel: '交接地点', placePlaceholder: '例如：3号宿舍楼下', timeLabel: '可交接时间', timePlaceholder: '例如：今天18:00后', detailPlaceholder: '补充成色、规格和交易要求' }
};
const defaultMeta = { intentLabel: '需求方向', seekLabel: '我需要帮助', offerLabel: '我可以帮忙', titleLabel: '要做什么', titlePlaceholder: '写清楚你要做什么', placeLabel: '地点 / 交接', placePlaceholder: '例如：东门、3号宿舍楼下', subcategoryPlaceholder: '选一个具体项目吧', timeLabel: '时间', timePlaceholder: '例如：今天18:00', detailPlaceholder: '补充交接方式、规格和临时变更' };
Page({
  data: { categories: defs.map(x => x[0]), subitems: [], categoryIndex: -1, subcategoryIndex: -1, selectedCategory: '', selectedSubcategory: '', subcategoryPlaceholder: defaultMeta.subcategoryPlaceholder, placeOptions: [], deliveryOptions, quantityOptions, peopleOptions, genderOptions, deliverySelection: '', timeHours, timeMinutes, timeDraftHour: '05', timeDraftMinute: '00', timeStage: 'hour', images: [], isFreeGive: false, showCategoryPicker: false, showSubPicker: false, showPlacePicker: false, showDeliveryPicker: false, showQuantityPicker: false, showPeoplePicker: false, showTimePicker: false, showGenderPicker: false, meta: defaultMeta, error: '', submitting: false, form: { intent: 'seek', title: '', place: '', deliveryRoom: '', time: '', price: '', detail: '', contact: '', quantity: '1', remainingPeople: '', gender: '' } },
  openCategoryPicker() { this.setData({ showCategoryPicker: true }); },
  closePickers() { this.setData({ showCategoryPicker: false, showSubPicker: false, showPlacePicker: false, showDeliveryPicker: false, showQuantityPicker: false, showPeoplePicker: false, showTimePicker: false, showGenderPicker: false }); },
  categorySelect(e) { const i = defs.findIndex(x => x[0] === e.currentTarget.dataset.category); if (i < 0) return; const nextMeta = { ...defaultMeta, ...(meta[defs[i][0]] || {}) }; const isFreeGive = defs[i][0] === '免费送'; this.setData({ categoryIndex: i, selectedCategory: defs[i][0], selectedSubcategory: '', subitems: defs[i][1], subcategoryIndex: -1, placeOptions: [], deliverySelection: '', images: [], isFreeGive, showCategoryPicker: false, showSubPicker: !isFreeGive, showPlacePicker: false, showDeliveryPicker: false, showQuantityPicker: false, showPeoplePicker: false, showTimePicker: false, showGenderPicker: false, subcategoryPlaceholder: nextMeta.subcategoryPlaceholder, meta: nextMeta, 'form.title': '', 'form.place': '', 'form.deliveryRoom': '', 'form.time': '', 'form.price': '', 'form.detail': '', 'form.contact': '', 'form.quantity': '1', 'form.remainingPeople': '', 'form.gender': '' }); },
  categoryChange(e) { const i = Number(e.detail.value); this.categorySelect({ currentTarget: { dataset: { category: defs[i][0] } } }); },
  openSubPicker() { if (this.data.categoryIndex < 0 || this.data.isFreeGive) return; this.setData({ showSubPicker: true }); },
  subcategoryChange(e) { const i = Number(e.currentTarget.dataset.index); if (Number.isNaN(i)) return; const selectedSubcategory = this.data.subitems[i]; const placeOptions = this.data.selectedCategory === '拼车搭子' ? (selectedSubcategory === '回学校' ? carpoolDestinations : carpoolGates) : []; this.setData({ subcategoryIndex: i, selectedSubcategory, placeOptions, showSubPicker: false, showPlacePicker: false, 'form.title': '', 'form.place': '', 'form.time': '', 'form.price': '', 'form.detail': '' }); },
  openPlacePicker() { if (this.data.selectedCategory !== '拼车搭子' || !this.data.placeOptions.length) return; this.setData({ showPlacePicker: true }); },
  placeSelect(e) { const i = Number(e.currentTarget.dataset.index); if (Number.isNaN(i)) return; this.setData({ 'form.place': this.data.placeOptions[i], showPlacePicker: false, error: '' }); },
  openTimePicker() { if (this.data.selectedCategory !== '拼车搭子') return; const [hour, minute] = (this.data.form.time || '05:00').split(':'); this.setData({ showTimePicker: true, timeStage: 'hour', timeDraftHour: timeHours.includes(hour) ? hour : '05', timeDraftMinute: timeMinutes.includes(minute) ? minute : '00' }); },
  timeHourSelect(e) { this.setData({ timeDraftHour: e.currentTarget.dataset.value, timeStage: 'minute' }); },
  timeMinuteSelect(e) { this.setData({ timeDraftMinute: e.currentTarget.dataset.value, 'form.time': `${this.data.timeDraftHour}:${e.currentTarget.dataset.value}`, showTimePicker: false, error: '' }); },
  timeBackToHour() { this.setData({ timeStage: 'hour' }); },
  openGenderPicker() { if (this.data.selectedCategory !== '拼车搭子') return; this.setData({ showGenderPicker: true }); },
  genderSelect(e) { this.setData({ 'form.gender': e.currentTarget.dataset.value, showGenderPicker: false, error: '' }); },
  intentChange(e) { const intent = e.currentTarget.dataset.value; this.setData({ 'form.intent': intent, images: intent === 'seek' ? this.data.images : [], 'form.place': intent === 'seek' ? this.data.form.place : '' }); },
  inputChange(e) { this.setData({ ['form.' + e.currentTarget.dataset.key]: e.detail.value, error: '' }); },
  chooseImages() { const remaining = 9 - this.data.images.length; if (remaining <= 0) return; wx.chooseMedia({ count: remaining, mediaType: ['image'], sourceType: ['album', 'camera'], success: res => { const selected = res.tempFiles.map(file => file.tempFilePath); this.setData({ images: this.data.images.concat(selected).slice(0, 9), error: '' }); } }); },
  removeImage(e) { const index = Number(e.currentTarget.dataset.index); if (Number.isNaN(index)) return; const images = this.data.images.slice(); images.splice(index, 1); this.setData({ images }); },
  openDeliveryPicker() { if (this.data.selectedCategory !== '代取' || this.data.form.intent !== 'seek') return; this.setData({ showDeliveryPicker: true }); },
  deliverySelect(e) { const index = Number(e.currentTarget.dataset.index); if (Number.isNaN(index)) return; const selection = this.data.deliveryOptions[index]; this.setData({ deliverySelection: selection, 'form.place': selection === '其他' ? '' : selection, 'form.deliveryRoom': '', showDeliveryPicker: false, error: '' }); },
  openQuantityPicker() { if (!this.data.isFreeGive) return; this.setData({ showQuantityPicker: true }); },
  quantitySelect(e) { const index = Number(e.currentTarget.dataset.index); if (Number.isNaN(index)) return; this.setData({ 'form.quantity': this.data.quantityOptions[index], showQuantityPicker: false, error: '' }); },
  openPeoplePicker() { if (this.data.selectedCategory !== '拼车搭子') return; this.setData({ showPeoplePicker: true }); },
  peopleSelect(e) { const index = Number(e.currentTarget.dataset.index); if (Number.isNaN(index)) return; this.setData({ 'form.remainingPeople': this.data.peopleOptions[index], showPeoplePicker: false, error: '' }); },
  back() { wx.navigateBack(); },
  submit() {
    if (this.data.submitting) return;
    const f = this.data.form;
    const isSimpleServiceOffer = this.data.selectedCategory === '代取' && f.intent === 'offer';
    const isShoppingRequest = this.data.selectedCategory === '代购' && f.intent === 'seek';
    const isSimpleShoppingOffer = this.data.selectedCategory === '代购' && f.intent === 'offer';
    const isSecondhandPost = this.data.selectedCategory === '二手好物';
    if (this.data.categoryIndex < 0) return this.setData({ error: '请先选择发布类型' });
    if (!this.data.isFreeGive && this.data.subcategoryIndex < 0) return this.setData({ error: '先选一个具体项目吧' });
    if (!isSimpleShoppingOffer && this.data.selectedCategory !== '拼车搭子' && this.data.selectedCategory !== '出租' && this.data.selectedCategory !== '代取' && !f.title.trim()) return this.setData({ error: '请填写事项标题' });
    if (!isSimpleServiceOffer && !isSimpleShoppingOffer && !isShoppingRequest && !isSecondhandPost && this.data.selectedCategory !== '出租' && this.data.selectedCategory !== '代取' && !f.place.trim()) return this.setData({ error: '请填写交接地点' });
    if (this.data.isFreeGive && (!/^\d+$/.test(String(f.quantity).trim()) || Number(f.quantity) < 1)) return this.setData({ error: '请填写有效的物品份数' });
    if (!isSimpleServiceOffer && !isSimpleShoppingOffer && !isShoppingRequest && !isSecondhandPost && this.data.selectedCategory !== '代取' && !this.data.isFreeGive && this.data.selectedCategory !== '出租' && !f.time.trim()) return this.setData({ error: '请填写可交接时间' });
    if (!isSimpleServiceOffer && !isSimpleShoppingOffer && !isShoppingRequest && !isSecondhandPost && !this.data.isFreeGive && this.data.selectedCategory !== '拼车搭子' && this.data.selectedCategory !== '出租' && !f.contact.trim()) return this.setData({ error: '请填写一种联系方式' });
    const title = this.data.selectedCategory === '拼车搭子' ? (f.title.trim() || `去${this.data.selectedSubcategory}的拼车搭子`) : (this.data.selectedCategory === '出租' ? `${this.data.selectedSubcategory || '物品'}出租` : (this.data.selectedCategory === '代取' ? `${this.data.selectedSubcategory || '代取'}需求` : (this.data.selectedCategory === '代购' && isSimpleShoppingOffer ? `${this.data.selectedSubcategory || '代购'}服务` : f.title)));
    const extra = this.data.selectedCategory === '拼车搭子' ? { gender: f.gender || '不限性别' } : {};
    const payload = { category: this.data.categories[this.data.categoryIndex], subcategory: this.data.isFreeGive ? '' : this.data.subitems[this.data.subcategoryIndex], ...f, title, place: f.place, quantity: this.data.isFreeGive ? Number(f.quantity) : 1, time: this.data.isFreeGive ? '' : f.time, price: this.data.isFreeGive ? '' : f.price, detail: this.data.isFreeGive || this.data.selectedCategory === '拼车搭子' ? '' : f.detail, extra: { ...extra, images: this.data.images } };
    this.setData({ submitting: true, error: '' });
    api.createPost(payload).then(() => {
      wx.showToast({ title: '发布成功', icon: 'success' });
      setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 500);
    }).catch(err => this.setData({ error: err.message || '发布失败，请检查后端地址', submitting: false }));
  }
});
