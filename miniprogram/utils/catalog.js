// Shared by discovery, publishing and display normalization.
const categories = [
  { category: '拼车搭子', key: 'carpool', subitems: ['新乡东', '新乡站', '宝龙', '校本部', '回学校', '考点', '其他'] },
  { category: '出租', key: 'rental', subitems: ['电动车', '大疆', 'iPhone', '其他'] },
  { category: '服务', key: 'service', subitems: ['妆造', '陪练', '摄像', '其他'] },
  { category: '代购', key: 'shopping', subitems: ['小吃街', '学子超市', '宝龙', '胖东来', '其他'] },
  { category: '免费送', key: 'giveaway', subitems: [] },
  { category: '二手好物', key: 'goods', subitems: ['水果', '零食', '生活用品', '教材', '其他'] }
].map(item => ({ ...item, icon: '/assets/ui/' + item.key + '.png' }));

const categoryAliases = { 拼车: '拼车搭子', 租借: '出租', 代取: '服务', 捎物: '服务', 同楼互助: '服务', 代买: '代购', 票券: '二手好物' };
// Older records may still carry the retired service labels. Keep them visible
// under the new catch-all option without exposing them as new choices.
const subcategoryAliases = {
  新乡东站: '新乡东',
  取快递: '其他',
  代送物品: '其他',
  文件: '其他',
  印务: '其他',
  帮打印: '其他',
  找资料: '其他',
  技能互助: '其他',
  临时帮忙: '其他'
};
function canonicalCategory(value) { return categoryAliases[value] || value; }
function canonicalSubcategory(value) { return subcategoryAliases[value] || value; }
module.exports = { categories, canonicalCategory, canonicalSubcategory };
