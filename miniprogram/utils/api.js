const app = getApp();

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const headers = { 'content-type': 'application/json' };
    if (app.globalData.userId) headers['x-user-id'] = app.globalData.userId;
    if (app.globalData.authToken) headers.authorization = 'Bearer ' + app.globalData.authToken;
    wx.request({
      url: (app.globalData.apiBase || '') + path,
      method: options.method || 'GET',
      data: options.data || {},
      timeout: 10000,
      header: headers,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(res.data);
        const error = new Error((res.data && res.data.error) || '请求失败，请稍后重试');
        error.statusCode = res.statusCode;
        reject(error);
      },
      fail() { reject(new Error('网络连接失败，请检查后端是否已启动')); }
    });
  });
}

module.exports = {
  loginWithWechat(data) { return request('/auth/wechat', { method: 'POST', data }); },
  getPosts(params) {
    const query = Object.keys(params || {}).filter(k => params[k] !== '' && params[k] != null)
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
    return request('/posts' + (query ? '?' + query : ''));
  },
  getPost(id) { return request('/posts/' + encodeURIComponent(id)); },
  createPost(data) { return request('/posts', { method: 'POST', data }); },
  claimPost(id) { return request('/posts/' + encodeURIComponent(id) + '/claim', { method: 'POST', data: {} }); },
  cancelClaim(id) { return request('/posts/' + encodeURIComponent(id) + '/claim', { method: 'DELETE' }); },
  closePost(id) { return request('/posts/' + encodeURIComponent(id) + '/close', { method: 'POST', data: {} }); },
  reopenPost(id) { return request('/posts/' + encodeURIComponent(id) + '/reopen', { method: 'POST', data: {} }); },
  completePost(id) { return request('/posts/' + encodeURIComponent(id) + '/complete', { method: 'POST', data: {} }); },
  updatePost(id, data) { return request('/posts/' + encodeURIComponent(id), { method: 'PUT', data }); },
  deletePost(id) { return request('/posts/' + encodeURIComponent(id), { method: 'DELETE' }); },
  reportPost(id, data) { return request('/posts/' + encodeURIComponent(id) + '/reports', { method: 'POST', data }); },
  getNotifications() { return request('/notifications'); },
  markNotificationRead(id) { return request('/notifications/' + encodeURIComponent(id) + '/read', { method: 'POST', data: {} }); },
  getMe() { return request('/me'); },
  getProfile() { return request('/profile'); },
  updateProfile(data) { return request('/profile', { method: 'PUT', data }); }
};
