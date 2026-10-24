const api = require('../../utils/api');
const { normalizePost } = require('../../utils/post');
const defs = [
  ['拼车搭子', '🚗', '找同路', ['新乡东站', '新乡站', '宝龙', '校本部', '回学校', '其他']],
  ['出租', '🔑', '临时租用', ['电动车', '大疆', 'iPhone', '账号', '其他']],
  ['代取', '📦', '省时省力', ['取快递', '代送物品', '帮打印', '外卖', '其他']],
  ['代购', '🛒', '顺路带回', ['小吃街', '学子超市', '宝龙', '胖东来', '其他']],
  ['免费送', '🎁', '闲置共享', ['书籍', '生活用品', '衣物', '其他']],
  ['二手好物', '♻️', '低价好物', ['数码', '教材', '生活用品', '家具', '其他']]
].map(x => ({ category: x[0], icon: x[1], hint: x[2], subitems: x[3] }));

Page({
  data: { quickDefs: defs, posts: [], subitems: [], selectedCategory: '', selectedSub: '', keyword: '', loading: true, pendingClaimId: null },
  onLoad() { this.loadPosts(); },
  onShow() { if (this.loadedOnce) this.loadPosts(); else this.loadedOnce = true; },
  onPullDownRefresh() { this.loadPosts().finally(() => wx.stopPullDownRefresh()); },
  loadPosts() {
    const requestId = (this.requestId || 0) + 1;
    this.requestId = requestId;
    const { selectedCategory, selectedSub, keyword } = this.data;
    const params = {};
    if (selectedCategory) params.category = selectedCategory;
    if (keyword.trim()) params.q = keyword.trim();
    this.setData({ loading: true });
    return api.getPosts(params).then(posts => {
      if (requestId !== this.requestId) return;
      const filtered = selectedSub ? posts.filter(post => post.subcategory === selectedSub) : posts;
      this.setData({ posts: filtered.map(normalizePost), loading: false });
    }).catch(() => {
      if (requestId !== this.requestId) return;
      this.setData({ posts: [], loading: false });
      wx.showToast({ title: '后端暂时不可用', icon: 'none' });
    });
  },
  openCategory(e) { const item = defs.find(x => x.category === e.currentTarget.dataset.category); if (!item) return; const reset = this.data.selectedCategory === item.category; this.setData({ selectedCategory: reset ? '' : item.category, subitems: reset ? [] : item.subitems, selectedSub: '' }, () => this.loadPosts()); },
  selectSub(e) { this.setData({ selectedSub: e.currentTarget.dataset.sub || '' }, () => this.loadPosts()); },
  searchInput(e) { this.setData({ keyword: e.detail.value }); },
  searchSubmit() { this.loadPosts(); },
  clearSearch() { this.setData({ keyword: '' }, () => this.loadPosts()); },
  clearFilter() { this.setData({ selectedCategory: '', selectedSub: '', subitems: [] }, () => this.loadPosts()); },
  openSearch() { wx.navigateTo({ url: '/pages/search/search' }); },
  openDetail(e) { const id = e.currentTarget.dataset.id; if (id) wx.navigateTo({ url: '/pages/detail/detail?id=' + encodeURIComponent(id) }); },
  claim(e) {
    const id = Number(e.currentTarget.dataset.id);
    const post = this.data.posts.find(item => item.id === id);
    if (!id || !post || post.actionDisabled || this.data.pendingClaimId !== null) return;
    this.setData({ pendingClaimId: id });
    api.claimPost(id).then(() => {
      wx.showToast({ title: '参与成功', icon: 'success' });
      return this.loadPosts();
    }).catch(err => {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
      if (err.statusCode === 409) this.loadPosts();
    }).finally(() => {
      if (this.data.pendingClaimId === id) this.setData({ pendingClaimId: null });
    });
  }
});
