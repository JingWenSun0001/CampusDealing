App({
  onLaunch() {
    // PC 端真机预览时不要显示 vConsole 调试浮层。
    // 部分基础库不提供此接口，因此保持兼容，不影响小程序正常运行。
    try {
      if (typeof wx.setEnableDebug === 'function') wx.setEnableDebug({ enableDebug: false });
    } catch (e) {}
    let userId = wx.getStorageSync('localUserId');
    if (!userId) {
      userId = 'wx_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      wx.setStorageSync('localUserId', userId);
    }
    this.globalData.userId = userId;
    const session = wx.getStorageSync('authSession');
    if (session && session.token && Number(session.expiresAt) > Date.now()) {
      this.setSession(session);
    } else if (session) {
      wx.removeStorageSync('authSession');
    }
  },
  setSession(session) {
    this.globalData.authToken = session?.token || '';
    this.globalData.authUser = session?.user || null;
    if (session?.token) wx.setStorageSync('authSession', session);
  },
  clearSession() {
    this.globalData.authToken = '';
    this.globalData.authUser = null;
    wx.removeStorageSync('authSession');
  },
  globalData: {
    apiBase: 'http://172.20.10.6:8000/api',
    userId: '',
    authToken: '',
    authUser: null
  }
});
