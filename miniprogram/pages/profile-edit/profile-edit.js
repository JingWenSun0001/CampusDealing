const api = require('../../utils/api');
const { requireLogin } = require('../../utils/auth');
const buildingOptions = Array.from({ length: 9 }, (_, index) => (index + 1) + '号楼');

Page({
  data: {
    form: { name: '', studentId: '', building: '', room: '', avatar: '', contactQr: '' },
    buildingOptions,
    qrPreview: '',
    loading: true,
    saving: false,
    error: ''
  },
  onLoad() {
    if (!requireLogin('/pages/profile-edit/profile-edit')) return;
    api.getProfile().then(profile => this.setData({ form: profile, qrPreview: profile.contactQr || '', loading: false }))
      .catch(() => { this.setData({ loading: false, error: '资料加载失败' }); });
  },
  inputChange(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.key]: e.detail.value, error: '' });
  },
  buildingChange(e) {
    this.setData({ 'form.building': e.detail.value, error: '' });
  },
  onPageScroll() {
    const component = this.selectComponent('#select-building');
    if (component) component.syncPosition();
  },
  chooseContactQr() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      sizeType: ['compressed'],
      success: res => {
        const file = res.tempFiles[0];
        if (!file || Number(file.size || 0) > 700 * 1024) {
          wx.showToast({ title: '好友码图片不能超过700KB', icon: 'none' });
          return;
        }
        this.setData({ qrPreview: file.tempFilePath, error: '' });
      }
    });
  },
  removeContactQr() { this.setData({ qrPreview: '', 'form.contactQr': '', error: '' }); },
  readContactQr() {
    if (this.data.form.contactQr && this.data.qrPreview === this.data.form.contactQr) return this.data.form.contactQr;
    if (!this.data.qrPreview) return '';
    const manager = wx.getFileSystemManager && wx.getFileSystemManager();
    if (!manager) return Promise.reject(new Error('无法读取好友码图片'));
    return new Promise((resolve, reject) => manager.readFile({ filePath: this.data.qrPreview, encoding: 'base64', success: result => {
      const filePath = this.data.qrPreview.toLowerCase();
      const mime = filePath.indexOf('.png') >= 0 ? 'image/png' : (filePath.indexOf('.webp') >= 0 ? 'image/webp' : 'image/jpeg');
      resolve('data:' + mime + ';base64,' + result.data);
    }, fail: reject }));
  },
  back() { wx.navigateBack(); },
  save() {
    if (this.data.saving) return;
    const form = this.data.form;
    if (!String(form.name || '').trim()) return this.setData({ error: '请填写昵称' });
    if (!String(form.studentId || '').trim()) return this.setData({ error: '请填写学号' });
    if (!String(form.building || '').trim()) return this.setData({ error: '请选择宿舍楼' });
    if (!/^\d{3}$/.test(String(form.room || '').trim())) return this.setData({ error: '宿舍号需为3位数字' });
    if (!String(this.data.qrPreview || '').trim() && !String(form.contactQr || '').trim()) return this.setData({ error: '请上传微信好友码' });
    this.setData({ saving: true, error: '' });
    const qr = this.readContactQr();
    const request = typeof qr === 'string' ? api.updateProfile({ ...form, contactQr: qr }) : qr.then(contactQr => api.updateProfile({ ...form, contactQr }));
    request.then(() => {
      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 350);
    }).catch(err => this.setData({ saving: false, error: err.message || '保存失败' }));
  }
});
