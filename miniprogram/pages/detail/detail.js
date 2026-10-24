const api = require('../../utils/api');
const { normalizePost } = require('../../utils/post');
Page({
  data: { post: null, action: '抢单', priceText: '', loading: true, operating: false },
  onLoad(options) { this.id = options.id; this.load(); },
  onShow() { if (this.loadedOnce) this.load(); else this.loadedOnce = true; },
  load() {
    const requestId = (this.requestId || 0) + 1;
    this.requestId = requestId;
    this.setData({ loading: true });
    return api.getPost(this.id).then(post => {
      if (requestId !== this.requestId) return;
      const normalized = normalizePost(post);
      this.setData({ post: normalized, action: normalized.actionLabel, priceText: this.priceText(normalized), loading: false });
    }).catch(err => {
      if (requestId !== this.requestId) return;
      this.setData({ post: null, loading: false });
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
    });
  },
  back() { wx.navigateBack(); },
  priceText(post) { if (!post.price || post.category === '拼车搭子' || post.category === '免费送') return ''; if (post.category === '出租') return '租金 ' + post.price; return post.category === '二手好物' ? '价格 ' + post.price : '酬金 ' + post.price; },
  claim() {
    const post = this.data.post;
    if (this.data.operating || !post || post.actionDisabled) return;
    this.setData({ operating: true });
    api.claimPost(this.id).then(() => {
      wx.showToast({ title: '参与成功', icon: 'success' });
      return this.load();
    }).catch(err => {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
      if (err.statusCode === 409) this.load();
    }).finally(() => this.setData({ operating: false }));
  },
  complete() {
    if (this.data.operating) return;
    wx.showModal({ title: '确认完成', content: '确认双方已经完成交接？', success: res => {
      if (!res.confirm) return;
      this.setData({ operating: true });
      api.completePost(this.id).then(() => { wx.showToast({ title: '已完成', icon: 'success' }); return this.load(); })
        .catch(err => wx.showToast({ title: err.message || '操作失败', icon: 'none' }))
        .finally(() => this.setData({ operating: false }));
    } });
  },
  remove() {
    if (this.data.operating) return;
    const hasParticipant = this.data.post && this.data.post.claimed;
    wx.showModal({ title: '删除这个单', content: hasParticipant ? '已有同学参与，删除后对方将无法继续查看交接信息。确定删除？' : '删除后不会再出现在首页和“我发布的”列表，是否继续？', confirmColor: '#ff3b30', success: res => {
      if (!res.confirm) return;
      this.setData({ operating: true });
      api.deletePost(this.id).then(() => { wx.showToast({ title: '已删除', icon: 'success' }); setTimeout(() => wx.reLaunch({ url: '/pages/profile/profile' }), 400); })
        .catch(err => { this.setData({ operating: false }); wx.showToast({ title: err.message || '操作失败', icon: 'none' }); });
    } });
  }
});
