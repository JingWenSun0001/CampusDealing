const api = require('../../utils/api');
const { normalizePost } = require('../../utils/post');
const { materializeQr } = require('../../utils/qr');
const { categories } = require('../../utils/catalog');
const { promptReport } = require('../../utils/report');
const { requireLogin } = require('../../utils/auth');
const carpoolDestinations = (categories.find(item => item.category === '拼车搭子') || { subitems: [] }).subitems;
const genderOptions = ['男生', '女生', '不限性别'];
function localDateString(date) { return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'); }
Page({
  data: { post: null, loading: true, operating: false, error: '', editing: false, dateStart: localDateString(new Date()), editForm: { subcategory: '', destination: '', place: '', date: '', time: '', gender: '不限性别' }, destinationOptions: carpoolDestinations, placeOptions: ['西门', '南门'], genderOptions },
  onLoad(options) { this.id = options.id; this.load(); },
  onShow() { if (this.loadedOnce) this.load(); else this.loadedOnce = true; },
  load() {
    const requestId = this.requestId = (this.requestId || 0) + 1;
    this.setData({ loading: true, error: '' });
    return api.getPost(this.id).then(post => {
      if (requestId !== this.requestId) return;
      const normalized = normalizePost(post);
      const qr = normalized.contactQr;
      return materializeQr(qr, normalized.id).then(qrPath => {
        if (qrPath) normalized.contactQr = qrPath;
        this.setData({ post: normalized, loading: false });
      });
    }).catch(err => { if (requestId === this.requestId) this.setData({ post: null, loading: false, error: err.statusCode === 404 ? '信息已隐藏、删除或你无权查看' : '加载失败，请重试' }); });
  },
  retry() { return this.load(); },
  claim() {
    if (!requireLogin('/pages/detail/detail?id=' + encodeURIComponent(this.id))) return;
    if (this.data.operating || !this.data.post || this.data.post.actionDisabled) return;
    this.setData({ operating: true });
    api.claimPost(this.id).then(() => { wx.showToast({ title: '参与成功', icon: 'success' }); return this.load(); })
      .catch(err => {
        if (err.statusCode === 400 && err.message === '请先完善基本资料后再加入') {
          return wx.showModal({ title: '先完善基本资料', content: '请填写学号、宿舍楼和宿舍号后再加入互助。', confirmText: '去填写', success: result => {
            if (result.confirm) wx.navigateTo({ url: '/pages/profile-edit/profile-edit' });
          } });
        }
        wx.showToast({ title: err.message || '操作失败', icon: 'none' });
        if (err.statusCode === 409 || err.statusCode === 404) this.load();
      })
      .finally(() => this.setData({ operating: false }));
  },
  confirmAction(title, content, operation) {
    if (this.data.operating) return;
    wx.showModal({ title, content, confirmColor: '#2877dc', success: result => {
      if (!result.confirm || this.data.operating) return;
      this.setData({ operating: true });
      operation().catch(err => wx.showToast({ title: err.message || '操作失败', icon: 'none' })).finally(() => this.setData({ operating: false }));
    } });
  },
  cancelClaim() {
    if (!requireLogin('/pages/detail/detail?id=' + encodeURIComponent(this.id))) return;
    if (['completed', 'cancelled'].includes(this.data.post?.status)) return;
    this.confirmAction('取消参与', '取消后名额将重新开放给其他同学。', () => api.cancelClaim(this.id).then(() => { wx.showToast({ title: '已取消参与', icon: 'success' }); return this.load(); }));
  },
  close() {
    if (!requireLogin('/pages/detail/detail?id=' + encodeURIComponent(this.id))) return;
    this.confirmAction('确认结单', '结单后所有人只能查看行程，不能再加入、退出或修改。', () => api.closePost(this.id).then(() => { wx.showToast({ title: '已结单', icon: 'success' }); return this.load(); }));
  },
  reopen() {
    if (!requireLogin('/pages/detail/detail?id=' + encodeURIComponent(this.id))) return;
    this.confirmAction('重新开放', '当前参与记录会清除，信息将重新出现在公共列表。', () => api.reopenPost(this.id).then(() => { wx.showToast({ title: '已重新开放', icon: 'success' }); return this.load(); }));
  },
  complete() {
    if (!requireLogin('/pages/detail/detail?id=' + encodeURIComponent(this.id))) return;
    this.confirmAction('结束本次互助', '确认已经完成交接？结束后不再接受新的参与。', () => api.completePost(this.id).then(() => { wx.showToast({ title: '已结束', icon: 'success' }); return this.load(); }));
  },
  remove() {
    if (!requireLogin('/pages/detail/detail?id=' + encodeURIComponent(this.id))) return;
    this.confirmAction('删除帖子', '删除后将停止展示，无法恢复。', () => api.deletePost(this.id).then(() => { wx.showToast({ title: '已删除', icon: 'success' }); wx.reLaunch({ url: '/pages/profile/profile' }); }));
  },
  report() {
    promptReport(this.id, Boolean(this.data.post?.isOwner));
  },
  onPageScroll() {
    if (!this.activeEditSelect) return;
    const component = this.selectComponent('#edit-' + this.activeEditSelect);
    if (component) component.syncPosition();
  },
  closeEditSelects(e) {
    const current = e?.currentTarget?.dataset?.select || '';
    this.activeEditSelect = current;
    ['subcategory', 'place', 'date', 'time', 'gender'].forEach(key => {
      if (key === current) return;
      const component = this.selectComponent('#edit-' + key);
      if (component) component.close();
    });
  },
  editSelectChange(e) {
    const key = e.currentTarget.dataset.select;
    const post = this.data.post;
    if (!post) return;
    this.activeEditSelect = '';
    if (key === 'subcategory') {
      const subcategory = this.data.destinationOptions[Number(e.detail.index)];
      const placeOptions = subcategory === '回学校' ? ['新乡东', '新乡站', '宝龙', '校本部'] : ['西门', '南门'];
      this.setData({ 'editForm.subcategory': subcategory, 'editForm.destination': '', 'editForm.place': '', placeOptions, error: '' });
      return;
    }
    if (key === 'place') this.setData({ 'editForm.place': this.data.placeOptions[Number(e.detail.index)], error: '' });
    if (key === 'gender') this.setData({ 'editForm.gender': this.data.genderOptions[Number(e.detail.index)], error: '' });
    if (key === 'date' || key === 'time') this.setData({ ['editForm.' + key]: e.detail.value, error: '' });
  },
  editInput(e) { this.setData({ ['editForm.' + e.currentTarget.dataset.key]: e.detail.value, error: '' }); },
  edit() {
    if (!requireLogin('/pages/detail/detail?id=' + encodeURIComponent(this.id))) return;
    const post = this.data.post;
    if (!post?.isCarpool) return;
    const departure = Number(post.extra?.departureAt);
    const date = Number.isFinite(departure) && departure > 0 ? localDateString(new Date(departure)) : localDateString(new Date());
    const known = this.data.destinationOptions.includes(post.subcategory);
    const subcategory = known ? post.subcategory : '其他';
    const placeOptions = subcategory === '回学校' ? ['新乡东', '新乡站', '宝龙', '校本部'] : ['西门', '南门'];
    this.setData({ editing: true, error: '', placeOptions, editForm: { subcategory, destination: subcategory === '其他' ? String(post.extra?.destination || post.subcategory) : '', place: post.place || '', date, time: post.time || '', gender: post.extra?.gender || '不限性别' } });
  },
  cancelEdit() { this.closeEditSelects(); this.setData({ editing: false, error: '' }); },
  saveEdit() {
    const post = this.data.post, form = this.data.editForm;
    if (!post?.isCarpool || this.data.operating) return;
    const fail = error => this.setData({ error });
    if (!form.subcategory) return fail('请选择目的地');
    if (form.subcategory === '其他' && !form.destination.trim()) return fail('请填写具体目的地');
    if (!form.place) return fail('请选择集合地点');
    if (!form.date || !form.time) return fail('请选择出发日期和时间');
    const departureAt = new Date(form.date + 'T' + form.time + ':00').getTime();
    if (!Number.isFinite(departureAt) || departureAt <= Date.now()) return fail('出发时间必须晚于现在');
    const destination = form.subcategory === '其他' ? form.destination.trim() : form.subcategory;
    const title = form.subcategory === '回学校' ? '回学校，找同路搭子' : '去' + destination + '，找同路搭子';
    this.setData({ operating: true, error: '' });
    api.updatePost(this.id, { subcategory: form.subcategory, title, place: form.place, time: form.time, extra: { people: post.participantLimit, gender: form.gender, departureAt, destination: form.subcategory === '其他' ? destination : '' } })
      .then(() => { wx.showToast({ title: '行程已更新', icon: 'success' }); this.setData({ editing: false }); return this.load(); })
      .catch(err => this.setData({ error: err.message || '保存失败' }))
      .finally(() => this.setData({ operating: false }));
  },
  previewImage(e) { wx.previewImage({ current: this.data.post.images[Number(e.currentTarget.dataset.index)], urls: this.data.post.images }); },
  previewQr() { const qr = this.data.post?.contactQr; if (qr) wx.previewImage({ current: qr, urls: [qr] }); },
  copyContact() { if (this.data.post?.contact) wx.setClipboardData({ data: this.data.post.contact }); }
});
