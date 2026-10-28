const app = typeof getApp === 'function' ? getApp() : { globalData: {} };

function isLoggedIn() {
  return Boolean(app.globalData.authToken);
}

function currentPageUrl() {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
  const page = pages[pages.length - 1];
  if (!page || !page.route) return '/pages/index/index';
  const options = page.options || {};
  const query = Object.keys(options)
    .filter(key => options[key] !== '' && options[key] != null)
    .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(options[key]))
    .join('&');
  return '/' + page.route + (query ? '?' + query : '');
}

function loginUrl(redirect) {
  return '/pages/login/login?redirect=' + encodeURIComponent(redirect || currentPageUrl());
}

function requireLogin(redirect) {
  if (isLoggedIn()) return true;
  const url = loginUrl(redirect);
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
  if (pages[pages.length - 1]?.route === 'pages/login/login') return false;
  wx.navigateTo({ url });
  return false;
}

module.exports = { isLoggedIn, currentPageUrl, requireLogin };
