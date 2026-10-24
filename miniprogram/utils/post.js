const categoryAliases = {
  拼车: '拼车搭子',
  租借: '出租',
  捎物: '代取',
  同楼互助: '代取',
  代买: '代购',
  票券: '二手好物'
};

function actionText(post) {
  if (post.category === '拼车搭子') return '加入';
  if (post.category === '免费送') return '送给我';
  if (post.category === '出租') return post.intent === 'offer' ? '租用' : '联系';
  return post.intent === 'offer' ? '联系' : '抢单';
}

function normalizePost(post) {
  const normalized = { ...post, category: categoryAliases[post.category] || post.category };
  const actionLabel = actionText(normalized);
  let actionButtonLabel = actionLabel;
  if (normalized.isOwner) actionButtonLabel = '我的单';
  else if (normalized.status === 'completed') actionButtonLabel = '已完成';
  else if (normalized.status === 'cancelled') actionButtonLabel = '已删除';
  else if (normalized.category === '免费送' && normalized.availableQuantity <= 0) actionButtonLabel = '已领完';
  else if (normalized.category === '免费送' && normalized.claimedByMe) actionButtonLabel = '已预定';
  else if (normalized.claimedByMe) actionButtonLabel = '我已参与';
  else if (normalized.claimed) actionButtonLabel = '已被接下';
  return {
    ...normalized,
    actionLabel,
    actionButtonLabel,
    actionDisabled: normalized.status !== 'active' || normalized.isOwner || (normalized.category === '免费送' ? (normalized.claimedByMe || normalized.availableQuantity <= 0) : normalized.claimed)
  };
}

module.exports = { actionText, normalizePost };
