const api = require('../../utils/api');
const { requireLogin } = require('../../utils/auth');

Page({
  data: { avatar: '', profile: null, loading: true, saving: false },

  onLoad() {
    if (!requireLogin('/pages/avatar/avatar')) return;
    api.getProfile().then(profile => {
      this.setData({ profile, avatar: profile.avatar || '', loading: false });
    }).catch(() => {
      this.setData({ avatar: '', loading: false });
      wx.showToast({ title: '头像加载失败', icon: 'none' });
    });
  },

  changeAvatar() {
    if (this.data.saving || !this.data.profile) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: result => {
        const file = result.tempFiles[0];
        if (!file || Number(file.size || 0) > 2 * 1024 * 1024) {
          wx.showToast({ title: '头像图片不能超过2MB', icon: 'none' });
          return;
        }
        return this.readImage(file.tempFilePath)
        .then(avatar => {
          this.setData({ saving: true });
          return api.updateProfile({ ...this.data.profile, avatar, contactQr: this.data.profile.contactQr || '' });
        })
        .then(profile => {
          wx.setStorageSync('profileAvatar', profile.avatar);
          this.setData({ profile, avatar: profile.avatar, saving: false });
          wx.showToast({ title: '头像已更换', icon: 'success' });
        })
        .catch(error => {
          this.setData({ saving: false });
          wx.showToast({ title: error.message || '头像更换失败', icon: 'none' });
        });
      }
    });
  },

  readImage(filePath) {
    const manager = wx.getFileSystemManager && wx.getFileSystemManager();
    if (!manager) return Promise.reject(new Error('无法读取头像图片'));
    return new Promise((resolve, reject) => manager.readFile({
      filePath,
      encoding: 'base64',
      success: result => {
        const path = String(filePath).toLowerCase();
        const mime = path.indexOf('.png') >= 0 ? 'image/png' : (path.indexOf('.webp') >= 0 ? 'image/webp' : 'image/jpeg');
        resolve('data:' + mime + ';base64,' + result.data);
      },
      fail: reject
    }));
  }
});
