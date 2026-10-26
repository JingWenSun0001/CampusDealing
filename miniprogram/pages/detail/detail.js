const api = require('../../utils/api');
const { normalizePost } = require('../../utils/post');
const { materializeQr } = require('../../utils/qr');
Page({
  data: { post: null, loading: true, operating: false, error: '', progressStep: 0 },
  onLoad(options) { this.id = options.id; this.load(); },
  onShow() { if (this.loadedOnce) this.load(); else this.loadedOnce = true; },
  load() {
    const requestId = this.requestId = (this.requestId || 0) + 1;
    this.setData({ loading: true, error: '' });
    return api.getPost(this.id).then(post => {
      if (requestId !== this.requestId) return;
      const normalized = normalizePost(post);
      return materializeQr(normalized.extra?.contactQr, normalized.id).then(qrPath => {
        if (qrPath) normalized.extra.contactQr = qrPath;
        this.setData({ post: normalized, loading: false, progressStep: post.status === 'completed' ? 2 : post.claimed ? 1 : 0 });
      });
    }).catch(err => { if (requestId === this.requestId) this.setData({ post: null, loading: false, error: err.statusCode === 404 ? '信息已隐藏、删除或你无权查看' : '加载失败，请重试' }); });
  },
  retry() { return this.load(); },
  claim() {
    if (this.data.operating || !this.data.post || this.data.post.actionDisabled) return;
    this.setData({ operating: true });
    api.claimPost(this.id).then(() => { wx.showToast({ title: '参与成功', icon: 'success' }); return this.load(); })
      .catch(err => { wx.showToast({ title: err.message || '操作失败', icon: 'none' }); if (err.statusCode === 409 || err.statusCode === 404) this.load(); })
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
    if (['completed', 'cancelled'].includes(this.data.post?.status)) return;
    this.confirmAction('取消参与', '取消后名额将重新开放给其他同学。', () => api.cancelClaim(this.id).then(() => { wx.showToast({ title: '已取消参与', icon: 'success' }); wx.reLaunch({ url: '/pages/profile/profile' }); }));
  },
  close() {
    this.confirmAction('确认结单', '结单后所有人只能查看行程，不能再加入、退出或修改。', () => api.closePost(this.id).then(() => { wx.showToast({ title: '已结单', icon: 'success' }); return this.load(); }));
  },
  reopen() {
    this.confirmAction('重新开放', '当前参与记录会清除，信息将重新出现在公共列表。', () => api.reopenPost(this.id).then(() => { wx.showToast({ title: '已重新开放', icon: 'success' }); return this.load(); }));
  },
  complete() {
    this.confirmAction('结束本次互助', '确认已经完成交接？结束后不再接受新的参与。', () => api.completePost(this.id).then(() => { wx.showToast({ title: '已结束', icon: 'success' }); return this.load(); }));
  },
  remove() {
    const isCarpool = this.data.post?.isCarpool;
    this.confirmAction(isCarpool ? '取消本次行程' : '删除这条信息', isCarpool ? '取消后行程会停止展示，已加入成员会收到小程序提醒，所有名额将释放。' : '删除后将停止展示。已有参与者仍可查看历史记录。', () => api.deletePost(this.id).then(() => { wx.showToast({ title: isCarpool ? '行程已取消' : '已删除', icon: 'success' }); wx.reLaunch({ url: '/pages/profile/profile' }); }));
  },
  edit() { if (this.data.post?.isCarpool) wx.navigateTo({ url: '/pages/publish/publish?id=' + encodeURIComponent(this.id) }); },
  previewImage(e) { wx.previewImage({ current: this.data.post.images[Number(e.currentTarget.dataset.index)], urls: this.data.post.images }); },
  previewQr() { if (this.data.post?.extra?.contactQr) wx.previewImage({ current: this.data.post.extra.contactQr, urls: [this.data.post.extra.contactQr] }); },
  copyContact() { if (this.data.post?.contact) wx.setClipboardData({ data: this.data.post.contact }); }
});
