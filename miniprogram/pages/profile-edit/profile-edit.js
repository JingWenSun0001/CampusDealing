const api = require('../../utils/api');

Page({
  data: {
    form: { name: '', studentId: '', building: '', room: '', avatar: '' },
    loading: true,
    saving: false,
    error: ''
  },
  onLoad() {
    api.getProfile().then(profile => this.setData({ form: profile, loading: false }))
      .catch(() => { this.setData({ loading: false, error: '资料加载失败' }); });
  },
  inputChange(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.key]: e.detail.value, error: '' });
  },
  back() { wx.navigateBack(); },
  save() {
    if (this.data.saving) return;
    const form = this.data.form;
    if (!String(form.name || '').trim()) return this.setData({ error: '请填写姓名或昵称' });
    this.setData({ saving: true, error: '' });
    api.updateProfile(form).then(() => {
      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 350);
    }).catch(err => this.setData({ saving: false, error: err.message || '保存失败' }));
  }
});
