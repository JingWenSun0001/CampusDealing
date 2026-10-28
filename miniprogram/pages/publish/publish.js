const api = require('../../utils/api');
const { categories } = require('../../utils/catalog');
const { requireLogin } = require('../../utils/auth');
function localDateString(date = new Date()) { return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'); }
const defaults = { intent: 'seek', title: '', destination: '', rentalItem: '', shoppingPlace: '', place: '', time: '', date: localDateString(), price: '', detail: '', contact: '', quantity: '1', remainingPeople: '1', gender: '不限性别' };
const metadata = {
  拼车搭子: { subLabel: '目的地', titleLabel: '行程说明', placeLabel: '集合地点', placePlaceholder: '选择集合地点', timeLabel: '出发时间' },
  出租: { subLabel: '物品类别', seekLabel: '我要租借', offerLabel: '我可提供' },
  服务: { subLabel: '服务类型', titleLabel: '服务内容', titlePlaceholder: '填写服务内容', detailPlaceholder: '简单介绍自己的服务能力和经历', seekLabel: '我需要服务', offerLabel: '我提供服务' },
  代购: { subLabel: '购买地点', seekLabel: '我需要代购', offerLabel: '我可以代购' },
  免费送: { titleLabel: '想送点什么', titlePlaceholder: '例如：台灯、衣物或教材', placeLabel: '领取地点', placePlaceholder: '例如：3号宿舍楼下' },
  二手好物: { subLabel: '物品分类', titleLabel: '物品信息', titlePlaceholder: '例如：九成新台灯，功能正常' }
};
Page({
  data: { categories, categoryIndex: -1, selectedCategory: '', selectedSubcategory: '', subitems: [], subcategoryIndex: -1, placeOptions: ['西门', '南门'], placeIndex: -1, peopleOptions: ['1', '2', '3'], peopleIndex: 0, genderOptions: ['男生', '女生', '不限性别'], genderIndex: 2, dateStart: localDateString(), meta: {}, form: { ...defaults }, images: [], defaultContactQr: '', editingId: '', flags: {}, error: '', submitting: false },
  onLoad(options = {}) {
    const query = Object.keys(options).map(key => encodeURIComponent(key) + '=' + encodeURIComponent(options[key])).join('&');
    const target = '/pages/publish/publish' + (query ? '?' + query : '');
    if (!requireLogin(target)) return;
    this.loadDefaultContact();
    if (options.id) this.loadForEdit(options.id); else if (options.category) this.selectCategory(options.category);
  },
  loadDefaultContact() { return api.getProfile().then(profile => this.setData({ defaultContactQr: profile.contactQr || '' })).catch(() => {}); },
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
      const knownDestination = this.data.subitems.includes(post.subcategory);
      const selectedSubcategory = knownDestination ? post.subcategory : '其他';
      const subcategoryIndex = this.data.subitems.indexOf(selectedSubcategory);
      const people = String(post.extra?.people || post.participantLimit || 1);
      const peopleIndex = Math.max(0, this.data.peopleOptions.indexOf(people));
      const genderIndex = Math.max(0, this.data.genderOptions.indexOf(post.extra?.gender || '不限性别'));
      const placeOptions = selectedSubcategory === '回学校' ? ['新乡东', '新乡站', '宝龙', '校本部'] : ['西门', '南门'];
      const departureDate = Number(post.extra?.departureAt) ? new Date(Number(post.extra.departureAt)) : new Date();
      const destination = selectedSubcategory === '其他' ? String(post.extra?.destination || (knownDestination ? '' : post.subcategory)) : '';
      this.setData({ selectedSubcategory, subcategoryIndex, placeOptions, placeIndex: placeOptions.indexOf(post.place), peopleIndex, genderIndex, form: { ...this.data.form, title: post.title, destination, place: post.place, date: localDateString(departureDate), time: post.time, remainingPeople: people, gender: post.extra?.gender || '不限性别', detail: post.detail || '' } });
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
      showIntent: c === '出租' || c === '服务' || c === '代购',
      showTitle: c !== '拼车搭子' && c !== '出租' && c !== '代购' && !(c === '服务' && intent === 'offer'),
      showPlace: c === '免费送', showTime: false,
      showImages: (c === '出租' && intent === 'offer') || (c === '服务' && intent === 'offer') || c === '二手好物',
      showDetail: c === '服务' && intent === 'offer'
    } });
  },
  subcategoryChange(e) {
    const subcategoryIndex = Number(e.detail.value);
    const selectedSubcategory = this.data.subitems[subcategoryIndex];
    this.setData({ subcategoryIndex, selectedSubcategory, placeOptions: selectedSubcategory === '回学校' ? ['新乡东', '新乡站', '宝龙', '校本部'] : ['西门', '南门'], placeIndex: -1, 'form.destination': '', 'form.rentalItem': '', 'form.shoppingPlace': '', 'form.place': this.data.flags.carpool ? '' : this.data.form.place, error: '' });
  },
  placeChange(e) { const placeIndex = Number(e.detail.value); this.setData({ placeIndex, 'form.place': this.data.placeOptions[placeIndex], error: '' }); },
  dateChange(e) { this.setData({ 'form.date': e.detail.value, error: '' }); },
  peopleChange(e) { if (this.data.editingId) return; const peopleIndex = Number(e.detail.value); const remainingPeople = this.data.peopleOptions[peopleIndex]; this.setData({ peopleIndex, 'form.remainingPeople': remainingPeople }); },
  genderChange(e) { const genderIndex = Number(e.detail.value); this.setData({ genderIndex, 'form.gender': this.data.genderOptions[genderIndex] }); },
  timeChange(e) { this.setData({ 'form.time': e.detail.value, error: '' }); },
  intentChange(e) { this.setData({ 'form.intent': e.currentTarget.dataset.value, error: '' }, () => this.updateFlags()); },
  inputChange(e) { this.setData({ ['form.' + e.currentTarget.dataset.key]: e.detail.value, error: '' }); },
  goProfileContact() { wx.navigateTo({ url: '/pages/profile-edit/profile-edit' }); },
  chooseImages() {
    wx.chooseMedia({ count: 9 - this.data.images.length, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'], success: res => {
      const accepted = res.tempFiles.filter(item => Number(item.size || 0) <= 512 * 1024);
      if (accepted.length !== res.tempFiles.length) wx.showToast({ title: '单张图片不能超过512KB', icon: 'none' });
      this.setData({ images: this.data.images.concat(accepted.map(item => item.tempFilePath)).slice(0, 9) });
    } });
  },
  removeImage(e) { this.setData({ images: this.data.images.filter((_, index) => index !== Number(e.currentTarget.dataset.index)) }); },
  readImagesData() {
    if (!this.data.images.length) return [];
    const manager = wx.getFileSystemManager && wx.getFileSystemManager();
    if (!manager) return Promise.reject(new Error('无法读取图片'));
    return Promise.all(this.data.images.map(filePath => new Promise((resolve, reject) => manager.readFile({ filePath, encoding: 'base64', success: result => {
      const lower = filePath.toLowerCase();
      const mime = lower.indexOf('.png') >= 0 ? 'image/png' : lower.indexOf('.webp') >= 0 ? 'image/webp' : 'image/jpeg';
      resolve('data:' + mime + ';base64,' + result.data);
    }, fail: reject }))));
  },
  submit() {
    if (this.data.submitting) return;
    const { selectedCategory: c, selectedSubcategory: sub, flags, form: f } = this.data;
    const fail = error => this.setData({ error });
    if (!c) return fail('请选择发布类型');
    if (!flags.giveaway && !sub) return fail('请选择具体项目');
    if (flags.carpool && sub === '其他' && !f.destination.trim()) return fail('请填写具体目的地');
    if (flags.rental && sub === '其他' && !f.rentalItem.trim()) return fail('请填写具体' + (f.intent === 'seek' ? '租借' : '出租') + '什么');
    if (c === '代购' && sub === '其他' && !f.shoppingPlace.trim()) return fail('请填写具体代购地点或店名');
    if (flags.showTitle && !f.title.trim()) return fail('请填写' + this.data.meta.titleLabel);
    if ((flags.carpool || flags.showPlace) && !f.place.trim()) return fail('请填写' + this.data.meta.placeLabel);
    if ((flags.carpool || flags.showTime) && !f.time.trim()) return fail('请填写' + this.data.meta.timeLabel);
    if (flags.carpool && !f.date.trim()) return fail('请选择出发日期');
    if (!this.data.defaultContactQr) return fail('请先在我的资料上传默认微信好友码');
    const goodsPrice = String(f.price || '').trim();
    if (flags.goods && !goodsPrice) return fail('请填写价格');
    if (flags.goods && !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(goodsPrice)) return fail('价格仅支持数字，最多保留两位小数');
    if (flags.goods && Number(goodsPrice) > 9999.99) return fail('价格不能超过9999.99元');
    if (flags.giveaway && (!/^\d+$/.test(f.quantity) || Number(f.quantity) < 1 || Number(f.quantity) > 9999)) return fail('数量需为1到9999之间的整数');
    const destination = flags.carpool && sub === '其他' ? f.destination.trim() : sub;
    const rentalItem = flags.rental && sub === '其他' ? f.rentalItem.trim() : sub;
    const shoppingPlace = c === '代购' && sub === '其他' ? f.shoppingPlace.trim() : sub;
    const isFreeGoods = flags.goods && Number(goodsPrice) === 0;
    const title = flags.carpool ? (sub === '回学校' ? '回学校，找同路搭子' : '去' + destination + '，找同路搭子') : flags.rental ? sub + '出租' : c === '代购' ? shoppingPlace + '代购' : (flags.service && f.intent === 'offer') ? sub + '服务' : f.title.trim();
    const departureAt = flags.carpool ? new Date(f.date + 'T' + f.time + ':00').getTime() : 0;
    if (flags.carpool && (!Number.isFinite(departureAt) || departureAt <= Date.now())) return fail('出发时间必须晚于现在');
    const payload = { category: isFreeGoods ? '免费送' : c, subcategory: sub, ...f, title: flags.rental ? rentalItem + (f.intent === 'offer' ? '出租' : '租借') : title, quantity: isFreeGoods ? 1 : flags.giveaway ? Number(f.quantity) : 1, detail: flags.showDetail ? f.detail : '', price: flags.goods && !isFreeGoods ? goodsPrice : '', extra: { images: this.data.images, ...(flags.carpool ? { people: f.remainingPeople, gender: f.gender, departureAt, destination: sub === '其他' ? destination : '', useProfileContact: true } : {}), ...(flags.rental ? { rentalItem: sub === '其他' ? rentalItem : '' } : {}), ...(c === '代购' ? { shoppingPlace: sub === '其他' ? shoppingPlace : '' } : {}) } };
    this.setData({ submitting: true, error: '' });
    const save = images => {
      payload.extra.images = images;
      return this.data.editingId ? api.updatePost(this.data.editingId, payload) : api.createPost(payload);
    };
    const imageResult = this.readImagesData();
    const request = Array.isArray(imageResult) ? save(imageResult) : imageResult.then(images => save(images));
    request.then(() => { wx.showToast({ title: this.data.editingId ? '已保存修改' : '发布成功', icon: 'success' }); setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 400); })
      .catch(err => this.setData({ error: err.message || '发布失败，请稍后重试', submitting: false }));
  }
});
