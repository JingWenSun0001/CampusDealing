const api = require('../../utils/api');
const { categories, canonicalSubcategory } = require('../../utils/catalog');
const { normalizePost, boardGroups } = require('../../utils/post');
const { promptReport } = require('../../utils/report');
const { requireLogin } = require('../../utils/auth');
Page({
  data: { quickDefs: categories, posts: [], sections: [], subitems: [], selectedCategory: '', selectedSub: '', loading: true, error: '' },
  onLoad() { this.loadPosts(); },
  onShow() { if (this.loadedOnce) this.loadPosts(); else this.loadedOnce = true; },
  onPullDownRefresh() { this.loadPosts().finally(() => wx.stopPullDownRefresh()); },
  loadPosts() {
    const requestId = this.requestId = (this.requestId || 0) + 1;
    const { selectedCategory, selectedSub } = this.data;
    this.setData({ loading: true, error: '' });
    return api.getPosts(selectedCategory ? { category: selectedCategory } : {}).then(posts => {
      if (requestId !== this.requestId) return;
      const filtered = posts.map(normalizePost).filter(post => !selectedSub || canonicalSubcategory(post.subcategory) === selectedSub);
      const sections = selectedCategory ? [] : boardGroups(filtered).map(section => ({ ...section, total: section.posts.length, posts: section.posts.slice(0, 3) })).filter(section => section.total);
      this.setData({ posts: filtered, sections, loading: false });
    }).catch(err => {
      if (requestId !== this.requestId) return;
      const message = err?.message || '';
      const error = message.indexOf('网络连接失败') >= 0
        ? '网络连接失败，请检查后端和本地网络'
        : err?.statusCode === 401 ? '登录状态已失效，请重新登录'
          : '暂时无法加载，点击重试';
      console.error('[首页加载失败]', err);
      this.setData({ loading: false, error });
    });
  },
  retry() { return this.loadPosts(); },
  openCategory(e) {
    const item = categories.find(item => item.category === e.currentTarget.dataset.category);
    if (!item) return;
    const reset = this.data.selectedCategory === item.category;
    this.setData({ selectedCategory: reset ? '' : item.category, subitems: reset ? [] : item.subitems, selectedSub: '', posts: [], sections: [] }, () => this.loadPosts());
  },
  selectSub(e) { this.setData({ selectedSub: e.currentTarget.dataset.sub || '', posts: [], sections: [] }, () => this.loadPosts()); },
  openSearch() { wx.navigateTo({ url: '/pages/search/search' }); },
  openPublish() {
    const category = this.data.selectedCategory;
    const target = '/pages/publish/publish' + (category ? '?category=' + encodeURIComponent(category) : '');
    if (!requireLogin(target)) return;
    wx.navigateTo({ url: target });
  },
  openSection(e) {
    const params = ['scope=' + encodeURIComponent(e.currentTarget.dataset.scope)];
    if (this.data.selectedCategory) params.push('category=' + encodeURIComponent(this.data.selectedCategory));
    if (this.data.selectedSub) params.push('sub=' + encodeURIComponent(this.data.selectedSub));
    wx.navigateTo({ url: '/pages/search/search?' + params.join('&') });
  },
  openDetail(e) { if (e.currentTarget.dataset.id) wx.navigateTo({ url: '/pages/detail/detail?id=' + encodeURIComponent(e.currentTarget.dataset.id) }); }
  ,report(e) {
    const id = Number(e.currentTarget.dataset.id);
    const post = this.data.posts.find(item => Number(item.id) === id) || this.data.sections.flatMap(section => section.posts).find(item => Number(item.id) === id);
    promptReport(id, Boolean(post?.isOwner));
  }
});
