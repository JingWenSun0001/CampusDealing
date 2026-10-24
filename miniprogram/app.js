App({
  onLaunch() {
    let userId = wx.getStorageSync('localUserId');
    if (!userId) {
      userId = 'wx_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      wx.setStorageSync('localUserId', userId);
    }
    this.globalData.userId = userId;
  },
  globalData: {
    apiBase: 'http://127.0.0.1:8000/api',
    userId: ''
  }
});
