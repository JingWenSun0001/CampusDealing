const api = require('../../utils/api');
const app = getApp();

function decodeRedirect(value) {
  try { return decodeURIComponent(value || '/pages/index/index'); } catch { return '/pages/index/index'; }
}

Page({
  data: { loading: false, error: '' },
  onLoad(options = {}) {
    this.redirect = decodeRedirect(options.redirect);
    if (app.globalData.authToken) this.finish();
  },
  authorize() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: '' });
    wx.login({
      success: loginResult => {
        if (!loginResult.code) return this.fail('微信登录凭证为空，请重试');
        const submit = userInfo => api.loginWithWechat({ code: loginResult.code, userInfo: userInfo || {} })
          .then(session => {
            app.setSession(session);
            wx.showToast({ title: '登录成功', icon: 'success' });
            setTimeout(() => this.finish(), 350);
          })
          .catch(error => this.fail(error.message || '登录失败，请稍后重试'));
        const getProfile = () => {
          if (typeof wx.getUserProfile === 'function') {
            return wx.getUserProfile({
              desc: '用于展示你的昵称和头像',
              success: result => submit(result.userInfo),
              fail: () => {
                if (typeof wx.getUserInfo === 'function') wx.getUserInfo({ success: result => submit(result.userInfo), fail: () => submit(null) });
                else submit(null);
              }
            });
          }
          if (typeof wx.getUserInfo === 'function') return wx.getUserInfo({ success: result => submit(result.userInfo), fail: () => submit(null) });
          submit(null);
        };
        getProfile();
      },
      fail: () => this.fail('微信登录未完成，请重试')
    });
  },
  fail(error) { this.setData({ loading: false, error }); },
  finish() {
    const target = this.redirect || '/pages/index/index';
    if (target.indexOf('/pages/login/login') === 0) return wx.redirectTo({ url: '/pages/index/index' });
    wx.redirectTo({ url: target });
  },
  cancel() {
    if (getCurrentPages().length > 1) wx.navigateBack();
    else wx.reLaunch({ url: '/pages/index/index' });
  }
});
