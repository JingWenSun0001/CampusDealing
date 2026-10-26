const api = require('../../utils/api');
const { categories, canonicalSubcategory } = require('../../utils/catalog');
const { normalizePost, boardGroups } = require('../../utils/post');
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
      const sections = boardGroups(filtered).map(section => ({ ...section, total: section.posts.length, posts: section.posts.slice(0, 3) })).filter(section => section.total);
      this.setData({ posts: filtered, sections, loading: false });
    }).catch(() => {
      if (requestId === this.requestId) this.setData({ loading: false, error: '暂时无法加载，点击重试' });
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
  openSection(e) {
    const params = ['scope=' + encodeURIComponent(e.currentTarget.dataset.scope)];
    if (this.data.selectedCategory) params.push('category=' + encodeURIComponent(this.data.selectedCategory));
    if (this.data.selectedSub) params.push('sub=' + encodeURIComponent(this.data.selectedSub));
    wx.navigateTo({ url: '/pages/search/search?' + params.join('&') });
  },
  openDetail(e) { if (e.currentTarget.dataset.id) wx.navigateTo({ url: '/pages/detail/detail?id=' + encodeURIComponent(e.currentTarget.dataset.id) }); }
});
