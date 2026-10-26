const api = require('../../utils/api');
const { canonicalSubcategory } = require('../../utils/catalog');
const { normalizePost, boardGroups } = require('../../utils/post');
const HISTORY_KEY = 'school_exchanger_search_history';
Page({
  data: { keyword: '', posts: [], searched: false, loading: false, history: [], selectedCategory: '', title: '搜索', error: '' },
  onLoad(options = {}) {
    const history = wx.getStorageSync(HISTORY_KEY);
    this.scope = options.scope || '';
    this.sub = options.sub || '';
    const titles = { now: '现在可参与', upcoming: '即将出发', goods: '好物专区' };
    this.setData({ history: Array.isArray(history) ? history : [], selectedCategory: options.category || '', title: titles[this.scope] || '搜索' });
    if (this.scope || options.category) this.submit(false);
  },
  onShow() { if (this.loadedOnce && this.data.searched) this.submit(false); else this.loadedOnce = true; },
  submit(recordHistory = true) {
    const keyword = this.data.keyword.trim();
    const requestId = this.requestId = (this.requestId || 0) + 1;
    this.setData({ loading: true, searched: true, error: '' });
    return api.getPosts({ q: keyword, category: this.data.selectedCategory }).then(posts => {
      if (requestId !== this.requestId) return;
      if (recordHistory !== false && keyword) this.saveHistory(keyword);
      let result = posts.map(normalizePost);
      if (this.scope) result = (boardGroups(result).find(group => group.key === this.scope) || { posts: result }).posts;
      if (this.sub) result = result.filter(post => canonicalSubcategory(post.subcategory) === this.sub);
      this.setData({ posts: result, loading: false });
    }).catch(() => { if (requestId === this.requestId) this.setData({ loading: false, error: '加载失败，点击重试' }); });
  },
  inputChange(e) { this.setData({ keyword: e.detail.value }); },
  clearSearch() { this.setData({ keyword: '' }, () => this.submit(false)); },
  saveHistory(keyword) {
    const history = [keyword, ...this.data.history.filter(item => item !== keyword)].slice(0, 20);
    wx.setStorageSync(HISTORY_KEY, history); this.setData({ history });
  },
  useHistory(e) { this.setData({ keyword: e.currentTarget.dataset.keyword }, () => this.submit()); },
  clearHistory() { wx.removeStorageSync(HISTORY_KEY); this.setData({ history: [] }); },
  retry() { return this.submit(false); },
  openDetail(e) { wx.navigateTo({ url: '/pages/detail/detail?id=' + encodeURIComponent(e.currentTarget.dataset.id) }); }
});
