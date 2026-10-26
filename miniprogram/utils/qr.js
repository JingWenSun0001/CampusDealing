function materializeQr(qr, id) {
  if (typeof qr !== 'string' || qr.indexOf('data:image/') !== 0) return Promise.resolve(qr || '');
  const match = qr.match(/^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/);
  if (!match || !wx.getFileSystemManager || !wx.env || !wx.env.USER_DATA_PATH) return Promise.resolve(qr);
  const extension = match[1] === 'png' ? 'png' : 'jpg';
  const filePath = wx.env.USER_DATA_PATH + '/carpool-qr-' + String(id) + '.' + extension;
  return new Promise(resolve => wx.getFileSystemManager().writeFile({
    filePath, data: match[2], encoding: 'base64', success: () => resolve(filePath), fail: () => resolve(qr)
  }));
}

module.exports = { materializeQr };
