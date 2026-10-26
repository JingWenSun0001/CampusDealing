const api = require('../../utils/api');
const { normalizePost } = require('../../utils/post');
Page({
  data: { profile: {}, stats: { published: 0, joined: 0, completed: 0 }, activeTab: 'published', list: [], mine: [], joined: [], notifications: [], avatar: '/assets/river-easy-avatar.png', loading: true, error: '', listTitle: '我发布的' },
  onLoad() { this.load(); },
  onShow() { if (this.loadedOnce) this.load(); else this.loadedOnce = true; },
  load() {
    const requestId = this.requestId = (this.requestId || 0) + 1;
    this.setData({ loading: true, error: '' });
    const notificationsRequest = api.getNotifications ? api.getNotifications() : Promise.resolve([]);
    return Promise.all([api.getMe(), api.getPosts({ mine: 1 }), api.getPosts({ joined: 1 }), notificationsRequest]).then(([profile, mine, joined, notifications]) => {
      if (requestId !== this.requestId) return;
      this.setData({ profile, mine: mine.map(normalizePost), joined: joined.map(normalizePost), notifications: (notifications || []).slice(0, 3), avatar: wx.getStorageSync('profileAvatar') || profile.avatar || '/assets/river-easy-avatar.png', loading: false }, () => this.updateList());
    }).catch(() => { if (requestId === this.requestId) this.setData({ loading: false, error: '加载失败，点击重试' }); });
  },
  updateList() {
    const { activeTab, mine, joined } = this.data;
    const ongoing = post => post.status !== 'completed' && post.status !== 'cancelled';
    const lists = {
      published: mine.filter(ongoing),
      joined: joined.filter(ongoing),
      completed: [...mine, ...joined].filter((post, index, all) => post.status === 'completed' && all.findIndex(item => item.id === post.id) === index)
    };
    const titles = { published: '我发布的', joined: '我参与的', completed: '已完成' };
    this.setData({ list: lists[activeTab], listTitle: titles[activeTab], stats: { published: lists.published.length, joined: lists.joined.length, completed: lists.completed.length } });
  },
  retry() { return this.load(); },
  tabChange(e) { const activeTab = e.currentTarget.dataset.tab; if (['published', 'joined', 'completed'].includes(activeTab)) this.setData({ activeTab }, () => this.updateList()); },
  readNotification(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!id || !api.markNotificationRead) return;
    api.markNotificationRead(id).then(() => this.setData({ notifications: this.data.notifications.map(item => item.id === id ? { ...item, readAt: Date.now() } : item) }));
  },
  openDetail(e) { wx.navigateTo({ url: '/pages/detail/detail?id=' + encodeURIComponent(e.currentTarget.dataset.id) }); },
  chooseAvatar() {
    wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], success: res => wx.saveFile({
      tempFilePath: res.tempFiles[0].tempFilePath,
      success: saved => { wx.setStorageSync('profileAvatar', saved.savedFilePath); this.setData({ avatar: saved.savedFilePath }); },
      fail: () => wx.showToast({ title: '头像保存失败', icon: 'none' })
    }) });
  },
  editProfile() { wx.navigateTo({ url: '/pages/profile-edit/profile-edit' }); }
});
