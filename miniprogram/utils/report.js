function promptReport(postId, isOwner) {
  if (!postId || isOwner) return;
  const { requireLogin } = require('./auth');
  if (!requireLogin()) return;
  const api = require('./api');
  const reasons = ['诈骗或引流', '色情低俗', '违法违禁', '虚假信息', '其他'];
  wx.showActionSheet({ itemList: reasons, success: result => {
    const reason = reasons[result.tapIndex];
    wx.showModal({ title: '举报信息', content: `确认举报“${reason}”吗？`, confirmColor: '#2877dc', success: confirm => {
      if (!confirm.confirm) return;
      api.reportPost(postId, { reason }).then(() => {
        wx.showToast({ title: '已提交举报', icon: 'success' });
      }).catch(error => {
        wx.showToast({ title: error.message || '举报失败', icon: 'none' });
      });
    }});
  }});
}

module.exports = { promptReport };
