const { categories, canonicalCategory, canonicalSubcategory } = require('./catalog');

function actionText(post) {
  if (post.category === '拼车搭子') return '加入同行';
  if (post.category === '免费送') return '我想要';
  if (post.category === '出租') return post.intent === 'offer' ? '申请租用' : '联系对方';
  if (post.category === '二手好物') return '我想要';
  if (post.category === '代购') return post.intent === 'offer' ? '联系对方' : '帮忙代购';
  return post.intent === 'offer' ? '联系对方' : '我来帮忙';
}

function normalizePost(post) {
  const category = canonicalCategory(post.category);
  const definition = categories.find(item => item.category === category) || categories[2];
  const isCarpool = category === '拼车搭子';
  const isRental = category === '出租';
  const isFreeGive = category === '免费送';
  const isUsedGoods = category === '二手好物';
  const isGoods = isFreeGive || category === '二手好物';
  const participantCount = Math.max(0, Number(post.participantCount || 0));
  const participantLimit = Math.max(1, Number(post.participantLimit || post.extra?.people || 1));
  const availableQuantity = post.availableQuantity == null ? 1 : post.availableQuantity;
  const images = Array.isArray(post.extra?.images) ? post.extra.images.filter(url => typeof url === 'string' && url) : [];
  let stateLabel = post.intent === 'offer' ? '可提供' : '等待帮助';
  if (isCarpool) stateLabel = '正在找人';
  if (isGoods) stateLabel = isFreeGive ? '免费领取' : '可面交';
  if (post.claimed) stateLabel = post.status === 'active' ? '继续招募' : '进行中';
  if (isCarpool && post.status === 'closed') stateLabel = '已结束招募';
  if (post.status === 'completed') stateLabel = '已结束';
  if (post.status === 'cancelled') stateLabel = '已删除';
  const normalized = { ...post, category, participantCount, participantLimit, availableQuantity };
  const actionLabel = actionText(normalized);
  let actionButtonLabel = actionLabel;
  if (post.isOwner) actionButtonLabel = '管理信息';
  else if (post.status === 'completed') actionButtonLabel = '已结束';
  else if (post.status === 'closed') actionButtonLabel = '已结束招募';
  else if (post.status === 'cancelled') actionButtonLabel = '已删除';
  else if (post.claimedByMe) actionButtonLabel = isFreeGive ? '已预留' : '已参与';
  else if (post.status === 'matched') actionButtonLabel = '已匹配';
  else if (isFreeGive && availableQuantity <= 0) actionButtonLabel = '已领完';
  const disabledByCapacity = isCarpool ? participantCount >= participantLimit : isFreeGive ? availableQuantity <= 0 : post.claimed;
  return {
    ...normalized,
    subcategory: canonicalSubcategory(post.subcategory),
    displaySubcategory: isCarpool && post.subcategory === '其他' && post.extra?.destination ? post.extra.destination : isRental && post.subcategory === '其他' && post.extra?.rentalItem ? post.extra.rentalItem : category === '代购' && post.subcategory === '其他' && post.extra?.shoppingPlace ? post.extra.shoppingPlace : canonicalSubcategory(post.subcategory),
    categoryKey: definition.key, categoryIcon: definition.icon,
    cover: (isRental || isUsedGoods || category === '服务') ? images[0] || '' : '', images,
    isCarpool, isRental, isFreeGive, isUsedGoods, isGoods, stateLabel,
    stateTone: post.status === 'completed' || post.status === 'cancelled' || post.status === 'closed' ? 'muted' : isGoods ? 'warm' : post.claimed ? 'blue' : 'green',
    countText: isCarpool ? participantCount + '/' + participantLimit + ' 人' : isFreeGive ? '余 ' + availableQuantity + ' 份' : '',
    priceLabel: isFreeGive ? '免费' : !isCarpool && post.price ? (/^\d/.test(post.price) ? '¥' : '') + post.price : '',
    timeLabel: post.time || '', placeLabel: post.place || '',
    actionLabel, actionButtonLabel,
    actionDisabled: post.status !== 'active' || Boolean(post.isOwner || post.claimedByMe || disabledByCapacity)
  };
}

function boardGroups(posts) {
  return [
    { key: 'upcoming', title: '即将出发', tone: 'upcoming', mark: 'clock', posts: posts.filter(item => item.isCarpool) },
    { key: 'now', title: '同学在帮', tone: 'help', mark: 'bar', posts: posts.filter(item => !item.isCarpool && !item.isGoods) },
    { key: 'goods', title: '好物专区', tone: 'goods', mark: 'leaf', posts: posts.filter(item => item.isGoods) }
  ];
}
module.exports = { actionText, normalizePost, boardGroups };
