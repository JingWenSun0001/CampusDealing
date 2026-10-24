const api = require('../../utils/api');
const { normalizePost } = require('../../utils/post');
const HISTORY_KEY = 'school_exchanger_search_history';

Page({
  data: { keyword: '', posts: [], searched: false, loading: false, history: [], pendingClaimId: null },
  onLoad() { const history = wx.getStorageSync(HISTORY_KEY); this.setData({ history: Array.isArray(history) ? history : [] }); },
  onShow() { if (this.loadedOnce && this.data.searched && this.data.keyword.trim()) this.submit(false); else this.loadedOnce = true; },
  submit(recordHistory = true) {
    const keyword = this.data.keyword.trim();
    if (!keyword) return wx.showToast({ title: '请输入搜索内容', icon: 'none' });
    const requestId = (this.requestId || 0) + 1;
    this.requestId = requestId;
    this.setData({ loading: true, searched: true });
    return api.getPosts({ q: keyword }).then(posts => {
      if (requestId !== this.requestId) return;
      if (recordHistory) this.saveHistory(keyword);
      this.setData({ posts: posts.map(normalizePost), loading: false });
    }).catch(() => {
      if (requestId !== this.requestId) return;
      this.setData({ posts: [], loading: false });
      wx.showToast({ title: '搜索失败，请稍后重试', icon: 'none' });
    });
  },
  inputChange(e) { this.setData({ keyword: e.detail.value }); },
  clearSearch() { this.requestId = (this.requestId || 0) + 1; this.setData({ keyword: '', posts: [], searched: false, loading: false }); },
  saveHistory(keyword) {
    const history = [keyword, ...this.data.history.filter(item => item !== keyword)].slice(0, 20);
    wx.setStorageSync(HISTORY_KEY, history);
    this.setData({ history });
  },
  useHistory(e) { this.setData({ keyword: e.currentTarget.dataset.keyword }, () => this.submit()); },
  clearHistory() { wx.removeStorageSync(HISTORY_KEY); this.setData({ history: [] }); },
  back() { wx.navigateBack(); },
  openDetail(e) { const id = e.currentTarget.dataset.id; if (id) wx.navigateTo({ url: '/pages/detail/detail?id=' + encodeURIComponent(id) }); },
  claim(e) {
    const id = Number(e.currentTarget.dataset.id);
    const post = this.data.posts.find(item => item.id === id);
    if (!id || !post || post.actionDisabled || this.data.pendingClaimId !== null) return;
    this.setData({ pendingClaimId: id });
    api.claimPost(id).then(() => {
      wx.showToast({ title: '参与成功', icon: 'success' });
      return this.submit(false);
    }).catch(err => {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
      if (err.statusCode === 409) this.submit(false);
    }).finally(() => {
      if (this.data.pendingClaimId === id) this.setData({ pendingClaimId: null });
    });
  }
});
