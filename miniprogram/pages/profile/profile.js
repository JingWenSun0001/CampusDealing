const api = require('../../utils/api');
const { normalizePost } = require('../../utils/post');
Page({
  data: { profile: {}, stats: { published: 0, seeking: 0, joined: 0, completed: 0 }, activeTab: 'seeking', list: [], mine: [], joined: [], avatar: '/assets/river-easy-avatar.png', loading: true },
  onLoad() { this.load(); },
  onShow() { if (this.loadedOnce) this.load(); else this.loadedOnce = true; },
  load() {
    const requestId = (this.requestId || 0) + 1;
    this.requestId = requestId;
    this.setData({ loading: true });
    return Promise.all([api.getMe(), api.getPosts({ mine: 1 }), api.getPosts({ joined: 1 })]).then(([me, mine, joined]) => {
      if (requestId !== this.requestId) return;
      const avatar = wx.getStorageSync('profileAvatar') || me.avatar || '/assets/river-easy-avatar.png';
      this.setData({ profile: me, stats: me.stats || {}, mine: mine.map(normalizePost), joined: joined.map(normalizePost), avatar, loading: false }, () => this.updateList());
    }).catch(() => {
      if (requestId !== this.requestId) return;
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },
  updateList() { const { activeTab, mine, joined } = this.data; const list = activeTab === 'joined' ? joined : activeTab === 'completed' ? mine.filter(x => x.status === 'completed' || (x.category === '免费送' && x.availableQuantity === 0)) : mine.filter(x => x.intent === 'seek'); this.setData({ list }); },
  tabChange(e) { const tab = e.currentTarget.dataset.tab; if (!['seeking', 'joined', 'completed'].includes(tab)) return; this.setData({ activeTab: tab }, () => this.updateList()); },
  chooseAvatar() { wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], success: res => { const tempFilePath = res.tempFiles[0].tempFilePath; wx.saveFile({ tempFilePath, success: saved => { wx.setStorageSync('profileAvatar', saved.savedFilePath); this.setData({ avatar: saved.savedFilePath }); }, fail: () => wx.showToast({ title: '头像保存失败，请重试', icon: 'none' }) }); } }); },
  editProfile() { wx.navigateTo({ url: '/pages/profile-edit/profile-edit' }); }
});
