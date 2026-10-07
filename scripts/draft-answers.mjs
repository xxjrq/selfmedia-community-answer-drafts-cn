#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const inputPath = process.argv[2];
if (!inputPath) throw new Error('用法：node scripts/draft-answers.mjs <input.json>');
const input = JSON.parse(inputPath === '-' ? readFileSync(0, 'utf8') : readFileSync(inputPath, 'utf8'));
if (!Array.isArray(input.questions) || input.questions.length < 1 || input.questions.length > 20 || !input.questions.every(q => typeof q === 'string' && q.trim())) {
  throw new Error('questions 必须是 1 至 20 条非空问题');
}
if (!Array.isArray(input.sources)) throw new Error('sources 必须是数组');
const materialText = input.sources.flatMap(source => [source?.id, source?.fact, source?.source]).filter(value => typeof value === 'string').join('');
if (Array.from(materialText).length > 5000) throw new Error('批准材料的 ID、事实与来源文本合计不得超过 5000 字符');
const tone = typeof input.tone === 'string' ? input.tone.trim() : '';
const toneParts = tone.replace(/[、，,\s/]+/gu, '');
const knownToneWords = ['耐心', '简洁', '友好', '克制', '活泼', '幽默', '正式', '专业', '温和', '直接', '口语'];
let remainingTone = toneParts;
for (const word of knownToneWords) remainingTone = remainingTone.replaceAll(word, '');
if (!tone || remainingTone) throw new Error('tone 必须使用已支持的语气词：耐心、简洁、友好、克制、活泼、幽默、正式、专业、温和、直接或口语');
const toneStyle = /活泼|幽默/u.test(tone) ? 'light'
  : /正式|专业/u.test(tone) ? 'formal'
    : /友好|耐心|克制|温和/u.test(tone) ? 'warm' : 'concise';
const toneLead = { light: '轻松说：', formal: '依据已批准资料，', warm: '和你说明一下：', concise: '简单说：' }[toneStyle];

const fieldMatchers = {
  inventory: /库存|现货|有货|缺货|无货|没货|没有货|没有库存|售罄|售完|暂无货|有无(?:现货|库存)|可购买|还剩|剩余|还有.{0,3}(?:多少|几)|现有(?:多少|几)(?:件|个|台)?|(?:多少|几)件/u,
  price: /价格|多少钱|售价/u,
  discount: /优惠|折扣|满减|立减|满\s*\d+(?:\.\d+)?\s*(?:元|件|人).{0,8}减/u,
  cost: /成本|采购价|进货价/u,
  opening_hours: /营业时间|营业时段|什么时候(?:开门|营业|关门|打烊)|几点(?:开门|营业|关门)|开门时间|关门时间/u,
  schedule: /日期|时间表|上线|发布|推出|开售|发售|举行|开放|开课|课程时间|几点(?:开始|举行|开放|上课|开课)|什么时候开始|活动时间|开始时间/u,
  version: /版本|第\d+步|v\d+(?:\.\d+)*/iu,
  compatibility: /兼容|适配|支持|能不能用|能用吗|能.{0,8}(?:在|于).{0,12}(?:使用|运行)|能否.{0,8}(?:使用|运行)|能在.{0,20}上使用吗|接口协议|协议/u,
  dispatch: /发货|寄出|出库/u,
  delivery: /配送|物流|到货|送达/u,
  return: /退货|退换/u,
  refund: /退款/u,
  exchange: /换货/u,
  warranty: /保修|质保/u,
  after_sales: /售后/u,
  product_attribute: /颜色|材质|外观|涂层|哑光|亮面|重量|尺寸|规格|型号|功率|深蓝色|浅蓝色|红色|橙色|黄色|绿色|蓝色|紫色|粉色|白色|黑色|灰色|棕色|米色/u,
  usage: /怎么(?:用|使用)|如何(?:用|使用|操作)|使用方法|操作步骤|使用步骤/u
};
const labels = { inventory: '对应款式的库存/有货状态', price: '对应商品的售价或价格', discount: '对应商品的优惠规则', cost: '对应商品的成本', opening_hours: '店铺营业时间', schedule: '已批准的发布日期或时间表', version: '对应步骤或功能的版本范围', compatibility: '对应型号与条件的适配结论', dispatch: '对应订单的发货日期或时效', delivery: '对应地区的配送/到货信息', return: '对应商品的退货政策', refund: '对应事项的退款信息', exchange: '对应商品的换货政策', warranty: '对应商品的保修/质保期限', after_sales: '问题涉及的售后政策', product_attribute: '问题涉及的商品规格或属性', usage: '对应商品/功能的使用方法或操作步骤', direct_answer: '与问题直接对应的已批准事实' };
function fieldsIn(text) {
  const fields = Object.entries(fieldMatchers).filter(([, pattern]) => pattern.test(text)).map(([field]) => field);
  // “支持回放/作业/预约” asks about a service feature, not device or
  // platform compatibility. Keep compatibility typed only when the question
  // names an adapter target or uses the explicit compatibility terms.
  if (fields.includes('compatibility') && !/(?:兼容|适配|NFC|蓝牙|Bluetooth|Wi-?Fi|USB|安卓|Android|iOS|iPhone|Windows|鸿蒙|5G|快充)/iu.test(text)) {
    fields.splice(fields.indexOf('compatibility'), 1);
  }
  // “优惠多少钱” and “成本多少钱” ask for those labelled values; the
  // generic currency phrase must not create an extra retail-price request.
  if (fields.includes('price') && /(?:优惠|折扣|满减|立减).{0,8}多少钱|多少钱.{0,8}(?:优惠|折扣|满减|立减)|(?:成本|采购价|进货价).{0,8}多少钱|多少钱.{0,8}(?:成本|采购价|进货价)/u.test(text)) {
    fields.splice(fields.indexOf('price'), 1);
  }
  if (fields.includes('product_attribute') && fields.some(field=>field!=='product_attribute')
      && !/(?:颜色|色彩|材质|外观|涂层|重量|尺寸|规格|型号)/u.test(text)) fields.splice(fields.indexOf('product_attribute'),1);
  if (fields.some(field => ['dispatch','delivery','return','refund','exchange','warranty','after_sales'].includes(field))) return fields.filter(field => {
    if (field === 'schedule') return /(?:上线|发布|推出|开售|发售|什么时候举行|何时举行|活动时间|开始时间)/u.test(text);
    if (field === 'compatibility') return /(?:兼容|适配|NFC|蓝牙|Bluetooth|Wi-?Fi|USB|安卓|Android|iOS|iPhone|Windows|鸿蒙|5G|快充)/iu.test(text);
    return true;
  }).filter(field => !(field === 'dispatch' && /发货前|发货后/u.test(text)
      && fields.some(item => ['return','refund','exchange','warranty','after_sales'].includes(item)))
    && !(field === 'delivery' && /到货前|到货后|签收后/u.test(text)
      && fields.some(item => ['return','refund','exchange','warranty','after_sales'].includes(item))));
  if (fields.includes('opening_hours')) return fields.filter(field => field !== 'schedule');
  if (fields.includes('schedule') && /开放.{0,8}(?:哪些|什么).{0,4}(?:权限|能力)|开放(?:哪些|什么)(?:权限|能力)|哪些权限|哪些能力/u.test(text)
      && !/(?:开放时间|什么时候开放|何时开放|开放日期)/u.test(text)) return fields.filter(field => field !== 'schedule');
  return fields;
}
function entityIds(text) { return new Set(entityMentions(text).filter(entity => entity.kind !== 'condition').map(entity => entity.id)); }
function sameEntityId(left, right) {
  const normalize = value => String(value || '').toLowerCase().replace(/^(?:这|该|本|此)(?:门|款|个|台|套|部|种)?/u, '');
  return normalize(left) === normalize(right);
}
function entityMentions(text) {
  const mentions = [];
  const entityText = text.replace(/(?:麻烦问下|请问|请告诉我|想问|为什么|为何|请|目前|现在|尚未公布的|即将上线的|正在开发的|后来确认|后来|之后|并且|同时|不过|然而|确认|现已|已经|不提供|不支持|不予|不会|不再|不允许|不能|不兼容|不适配|支持|发货前|发货后|到货前|到货后|签收前|签收后|购买前|购买后)/gu, value => ' '.repeat(value.length))
    .replace(/的(?=(?:红色|蓝色|黑色|白色|绿色|黄色|紫色|粉色|灰色|米色|棕色|橙色|深蓝|浅蓝|红(?=款|版)|蓝(?=款|版)|黑(?=款|版)|白(?=款|版)|绿(?=款|版)|黄(?=款|版)|紫(?=款|版)|粉(?=款|版)|灰(?=款|版))(?:款|版)?)/gu, ' ');
  // Keep conjunctions out of product names: "A产品和B产品" is two objects.
  // Do not use generic endings such as “款” or “功能” as product types:
  // they also occur in verbs and capability phrases (“退款”, “蓝牙功能”).
  const productPattern = /(?:[A-Za-z0-9_-]+?|[\p{Script=Han}]{1,8}?)(?:产品|商品|配件|礼盒|防晒霜|护肤品|酸奶|奶茶|茶饮|饮料|饼干|糖果|蛋糕|面包|水果|咖啡|茶|杯|瓶|包|鞋|手机|耳机|手表|电脑|衣服|裤子|相机|键盘|鼠标|灯|床|桌|椅|玩具|音箱|音响|路由器|充电器|显示器|平板|电视|空调|冰箱|洗衣机|短剧|中心|商城|后台|系统|公众号|课程|教程|系列|功能|活动|直播|讲座|套餐|服务|工具)/gu;
  const variantPattern = /(?:红色|蓝色|黑色|白色|绿色|黄色|紫色|粉色|灰色|米色|棕色|橙色|深蓝|浅蓝|红(?=款|版)|蓝(?=款|版)|黑(?=款|版)|白(?=款|版)|绿(?=款|版)|黄(?=款|版)|紫(?=款|版)|粉(?=款|版)|灰(?=款|版))(?:款|版)?/gu;
  for (const match of entityText.matchAll(productPattern)) {
    const leadingConnectors = /^(?:和|与|或|及|、|，|,)+/u.exec(match[0])?.[0].length ?? 0;
    const label = match[0].slice(leadingConnectors);
    if (/^(?:共包|总包|合包|共含|总含|合含)$/u.test(label)) continue;
    // Keep generic refund/return causes from becoming a second product entity.
    if (/^(?:退款|退货|换货)(?:失败|原因|不是|并非|由于|因为)/u.test(label)) continue;
    if (/^(?:(?:可)?在服务(?:中心)?|服务中心|服务|售后点|线下柜台|线上客服|平台客服|小程序|官网)$/iu.test(label)) continue;
    if (/^(?:(?:不)?支持|兼容|适配|蓝牙|Bluetooth|NFC|Wi-?Fi|USB|快充|退款|退货|换货|售后|预约|发货|配送|取件|上门).{0,6}功能$/iu.test(label)) continue;
    if (label) mentions.push({ id: label.toLowerCase(), label, start: match.index + leadingConnectors, end: match.index + match[0].length, kind:'product' });
  }
  if (/(?:适用于|不适用于|版本|第\d+步)/u.test(entityText) && !mentions.some(entity => entity.kind === 'product') && /课程/u.test(entityText)) {
    const match = /课程/u.exec(entityText);
    mentions.push({id:'课程',label:'课程',start:match.index,end:match.index+match[0].length,kind:'product'});
  }
  for (const match of entityText.matchAll(/(?:[A-Z]|\d{1,2}|[甲乙丙丁戊己庚辛壬癸])[款版]/gu)) {
    mentions.push({ id: match[0].toLowerCase(), label: match[0], start: match.index, end: match.index + match[0].length, kind: 'product' });
  }
  // Retain a small set of explicit generic feature references, while leaving
  // capability phrases such as “蓝牙功能” attached to their product.
  for (const match of entityText.matchAll(/(?:新|该|此)功能/gu)) {
    mentions.push({ id: match[0], label: match[0], start: match.index, end: match.index + match[0].length, kind: 'product' });
  }
  for (const match of entityText.matchAll(/[A-Za-z]{1,6}[-_]?\d{1,8}(?![A-Za-z0-9])/gu)) {
    // A value immediately following “型号” (with or without “为”) is a
    // specification value, never a second product.  Otherwise “A产品型号X100”
    // becomes two entities and prevents the two X-series specifications from
    // reaching the attribute-conflict check.
    if (/型号\s*(?:为|是|：|:)?\s*$/u.test(entityText.slice(Math.max(0,match.index-10),match.index))) continue;
    const isCompatibilityTarget=/(?:兼容|适配|支持|适用于|不适用于|版本为|版本是)[^。；;]{0,12}$/u.test(entityText.slice(Math.max(0,match.index-16),match.index));
    mentions.push({ id: match[0].toLowerCase(), label:match[0], start: match.index, end: match.index + match[0].length, ...(isCompatibilityTarget?{kind:'condition'}:{}) });
  }
  for (const match of entityText.matchAll(/(?:(?:[\p{Script=Han}]{1,6}\s*)?[A-Za-z]{1,8}\s*\d{1,4}(?:\s*(?:Pro|Max|Plus|mini|Ultra))?)/giu)) {
    // In “A产品型号为 X100”, X100 is the answer value, not a second
    // requested object.  Keeping it as an entity makes the attribute signal
    // bind to X100 and incorrectly rejects an otherwise exact answer.
    if (/型号\s*(?:为|是|：|:)?\s*$/u.test(entityText.slice(Math.max(0, match.index - 10), match.index)) || /型号(?:为|是|：|:)?\s*[A-Za-z0-9]/u.test(match[0])) continue;
    const isCompatibilityTarget=/(?:兼容|适配|支持)[^。；;]{0,16}$/u.test(entityText.slice(Math.max(0,match.index-24),match.index));
    const targetInMatch=/(?:兼容|适配|支持)/u.test(match[0]);
    const versionOption=/第\d+步|版本|适用|还是|或者/u.test(match[0]) && /(?:第\d+步|版本|适用)/u.test(text);
    if (versionOption) {
      const version = /\bv?\d+(?:\.\d+)*\b/iu.exec(match[0]);
      if (version) mentions.push({ id: version[0].toLowerCase(), label:version[0], start:match.index+version.index, end:match.index+version.index+version[0].length, kind:'condition' });
      continue;
    }
    mentions.push({ id: match[0].toLowerCase().replace(/\s+/g, ' '), label:match[0].trim(), start: match.index, end: match.index + match[0].length, ...(isCompatibilityTarget||targetInMatch||versionOption?{kind:'condition'}:{}) });
  }
  // Recognize branded Latin product names without model digits, such as
  // AirPods and MacBook. Platform/protocol names are handled separately as
  // conditions below, so they cannot become a second product entity.
  const englishStopwords = new Set(['about','after','again','also','any','app','can','course','does','from','have','help','into','live','much','note','price','product','should','some','than','that','the','this','what','when','where','which','with','work']);
  for (const match of entityText.matchAll(/\b[A-Za-z][A-Za-z0-9]{2,}\b/gu)) {
    if (englishStopwords.has(match[0].toLowerCase())) continue;
    if (/^(?:Android|Bluetooth|NFC|YouTube|TikTok|Windows|iPhone|iPad|iOS|USB|WiFi|YouTube)$/iu.test(match[0])) continue;
    if (/(?:兼容|适配|支持)[^。；;]{0,16}$/u.test(entityText.slice(Math.max(0,match.index-20),match.index))) { mentions.push({id:match[0].toLowerCase(),label:match[0],start:match.index,end:match.index+match[0].length,kind:'condition'}); continue; }
    mentions.push({ id: match[0].toLowerCase(), label: match[0], start: match.index, end: match.index + match[0].length, kind: 'product' });
  }
  // Some catalogue names have a Chinese series name plus an English edition
  // but no digit (for example “星河 Pro”). Treat that complete, spaced name
  // as an entity instead of falling back to a different named product.
  for (const match of entityText.matchAll(/[\p{Script=Han}]{2,8}\s+[A-Z][A-Za-z0-9_-]*(?:\s+(?:Pro|Max|Plus|mini|Ultra))?/gu)) {
    if (/(?:NFC|USB(?:-?C)?|Android|iOS|Wi-?Fi|Bluetooth|5G)$/iu.test(match[0])) continue;
    if (/^(?:后来|之后|并且|同时|不过|然而|确认|目前|现在|现已|已经|其实|因此|所以|不支持|支持|不兼容|不适配)/u.test(match[0])) continue;
    mentions.push({ id: match[0].toLowerCase().replace(/\s+/g, ' '), label:match[0].trim(), start: match.index, end: match.index + match[0].length });
  }
  const platformPattern = /微信公众号|公众号|抖音|小红书|哔哩哔哩|B站|YouTube|TikTok|视频号|安卓(?:端|版)?|Android(?:端|版)?|iOS(?:端|版)?|iPhone版|iPad版|Windows(?:端|版)?|Mac(?:端|版)?|网页端|网页版|PC端|鸿蒙(?:端|版)?/giu;
  for (const match of text.matchAll(platformPattern)) mentions.push({ id: match[0].toLowerCase(), label:match[0], start: match.index, end: match.index + match[0].length, kind:'condition' });
  for (const match of text.matchAll(variantPattern)) mentions.push({ id: match[0], label:match[0], start: match.index, end: match.index + match[0].length, kind:'variant' });
  // Bind a color/style to its adjacent product. “A产品红色款” is one asked
  // object; treating its product and color as two independent entities makes
  // equally specific evidence impossible to match safely.
  const mergedVariants = new Set();
  const composites = [];
  for (const variant of mentions.filter(item => item.kind === 'variant')) {
    const nearby = mentions.filter(item => item.kind === 'product' && item.id !== variant.id
      && (variant.start >= item.end ? variant.start - item.end : item.start - variant.end) <= 2
      && /^[\s-]*$/u.test(entityText.slice(Math.min(item.end, variant.end), Math.max(item.start, variant.start))));
    if (nearby.length === 1) {
      const product = nearby[0];
      mergedVariants.add(variant); mergedVariants.add(product);
      composites.push({id:`${product.id}::${variant.id}`,label:`${product.label}${variant.label}`,start:Math.min(product.start,variant.start),end:Math.max(product.end,variant.end)});
    }
  }
  if (mergedVariants.size) mentions.splice(0, mentions.length, ...mentions.filter(item => !mergedVariants.has(item)), ...composites);
  const ordered = mentions.filter(item => !/^(?:后来|之后|并且|同时|不过|然而|确认|目前|现在|现已|已经|不支持|不兼容|不适配)/u.test(item.label))
    .sort((left, right) => left.start - right.start || (right.end - right.start) - (left.end - left.start));
  // For product names without a catalogue suffix (for example fruit flavors
  // or drink names), bind the trailing noun phrase immediately before the
  // requested field. Skip generic demonstratives and fields already adjacent
  // to an explicit product/platform entity.
  for (const field of Object.keys(fieldMatchers)) {
    if (!['inventory','price','discount','cost','compatibility','return','refund','exchange','warranty','after_sales','opening_hours','schedule','usage'].includes(field)) continue;
    for (const signal of fieldMentions(text, field)) {
      const nearby = ordered.some(entity => Math.max(entity.start - signal.end, signal.start - entity.end, 0) <= 4);
      if (nearby) continue;
      // Questions and approved notes often put a courtesy/state adverb before
      // an otherwise ordinary catalogue name ("请问蜜桃乌龙多少钱" / "目前
      // 茉莉绿茶售价20元").  Strip only that leading framing before taking the
      // trailing noun phrase; otherwise the framing becomes part of the
      // entity and the two names no longer compare as the same object.
      const prefix = text.slice(0, signal.start).trim()
        .replace(/[\s、，,:：-]+$/u, '')
        .replace(/(?:目前|现在|当前|今天|今日)$/u, '')
        .replace(/(?:吗|呢|呀|啊|？|\?)$/u, '')
        .replace(/^(?:(?:麻烦)?请问|想问(?:一下)?|请(?:告诉我)?|目前|现在|当前|今日|今天|本店|该店)\s*/u, '')
        // In a question such as “蓝莓酸奶可以退货吗”, “可以” is the
        // modal verb for the policy, not part of the catalogue name.  Keep
        // the full ordinary product name while avoiding an invented entity
        // that could never match its approved fact.
        .replace(/(?:可以|能否|是否|能不能|可不可以)$/u, '')
        .replace(/(?:可以|可不可以|能否|是否)?(?:退货|退换|退款|换货|支持|兼容|适配)(?:吗|多久|几天)?$/u, '')
        // “蜜桃乌龙什么时候上线”中的疑问词不属于商品名；同样地，
        // 已批准材料的“蜜桃乌龙将于 2027 年 5 月上线”要在日期前
        // 截出同一个商品名，才能既拒绝跨商品借用，也接受同商品事实。
        .replace(/(?:什么时候|何时|几时|哪天)$/u, '')
        .replace(/(?:在哪里|在哪|哪儿|什么地点|哪个地点|如何|怎么)(?:办理|处理|申请)?$/u, '')
        .replace(/(?:在)?(?:服务中心|售后点|线下柜台|线上客服|平台客服|小程序|官网|App|应用内)(?:办理|处理|申请)?$/iu, '')
        .replace(/(?:将于|计划于|预计于|定于|于|在)\s*(?:20\d{2}年(?:\d{1,2}月(?:\d{1,2}[日号])?)?|\d{1,2}月(?:\d{1,2}[日号])?|周[一二三四五六日天]|今年|明年|本月|下月|月底|上旬|中旬|下旬|第[一二三四]季度)$/u, '');
      const bare = /([\p{Script=Han}]{2,12}|\b[A-Z][A-Za-z0-9]{1,24})$/u.exec(prefix)?.[1];
      if (!bare || /(?:\d+(?:天|小时|工作日|周|月|年|点|时)(?:内|后|前)?)$/u.test(prefix) || /^(?:请问|麻烦|目前|现在|当前|今天|昨天|今日|昨日|上午|下午|早上|晚上|周末|周[一二三四五六日天]|工作日|节假日|此前|后来|之后|确认|并且|同时|不过|然而|不支持|不兼容|不适配|支持|这个|那个|这款|该款|此款|商品|产品|商品名称|产品名称|店铺|本店|门店|为什么|为何|什么|如何|怎么|适用哪个|活动时间|实际|售价|价格|金额|费用|优惠|折扣|库存|有货|现货|缺货|售罄|成本|采购价|进货价|多少钱|发货前|发货后|到货前|到货后|签收前|签收后|购买前|购买后)(?:.{0,4})?$/u.test(bare)
          || /^(?:整机|电池|机身|主机|屏幕|机芯)$/u.test(bare)
          || /(?:售价|价格|标价|成交价|单价|金额|费用|优惠|折扣|库存|有货|现货|缺货|售罄|预计|定于|将于|延期|取消|推迟|支持|不支持|改为|已|现|尚|未|待|有|没有)/u.test(bare)
          || /\d+(?:天|小时|工作日|周|月|年|点|时)|[一二三四五六七八九十]+(?:天|小时|工作日|周|月|年)|签收后|购买后|明年|下月/u.test(bare)) continue;
      const id = bare.toLowerCase();
      if (!ordered.some(entity => entity.id === id)) ordered.push({id,label:bare,start:signal.start-bare.length,end:signal.start,kind:'product'});
    }
  }
  ordered.sort((left, right) => left.start - right.start || (right.end - right.start) - (left.end - left.start));
  const unique = [];
  for (const mention of ordered) {
    // A shorter real product label such as “A产品” can overlap a greedy
    // false match such as “产品保修范围是什么”. Keep the leftmost product
    // anchor instead of turning the rest of its question clause into another
    // requested entity.
    if (unique.some(existing => existing.start < mention.end && mention.start < existing.end)) continue;
    if (!unique.some(existing => existing.start === mention.start && existing.end === mention.end && existing.id === mention.id)) unique.push(mention);
  }
  return unique;
}
function fieldMentions(text, field) {
  const pattern = fieldMatchers[field];
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return [...text.matchAll(new RegExp(pattern.source, flags))].map(match => ({ start: match.index, end: match.index + match[0].length }));
}
function isFieldBoundToAskedEntity(clause, field, asked) {
  const entities = entityMentions(clause);
  if (!asked.size) return true;
  if (!entities.length) return false;
  // Bind each requested field occurrence to its nearest named product/variant.
  // This prevents an adjacent product's price, stock, or schedule from being
  // borrowed merely because the asked product occurs elsewhere in the sentence.
  return fieldMentions(clause, field).some(signal => {
    const nearestDistance = Math.min(...entities.map(entity => Math.max(entity.start - signal.end, signal.start - entity.end, 0)));
    const nearest = entities.filter(entity => Math.max(entity.start - signal.end, signal.start - entity.end, 0) === nearestDistance);
    return nearest.length === 1 && asked.has(nearest[0].id);
  });
}
function unrequestedAttributeObject(question, clause) {
  const objects = ['说明书封面', '包装盒', '外包装', '包装袋', '收纳袋', '说明书', '封面', '附件', '配件', '赠品', '标签', '包装'];
  return objects.some(object => clause.includes(object) && !question.includes(object));
}
function warrantyDurationScope(clause) {
  return /(?:电池|整机|主机|机身|屏幕|机芯|外壳|配件|附件|电源)(?=.{0,4}(?:保修|质保))/u.exec(clause)?.[0]
    || /(?:保修|质保)(?:范围)?(?:为|是)?\s*(电池|整机|主机|机身|屏幕|机芯|外壳|配件|附件|电源)/u.exec(clause)?.[1]
    || null;
}
function requestPairs(question) {
  const fields = fieldsIn(question);
  if (!fields.length) return [{field:'direct_answer', entity:null, key:'direct_answer:*'}];
  const entities = entityMentions(question);
  const requests = [];
  for (const field of fields) {
    const boundEntities = entities.filter(entity => (!['compatibility','version'].includes(field) || entity.kind !== 'condition')
      && !(field === 'schedule' && /^(?:活动|课程|课程安排)$/u.test(entity.id)));
    let activeEntities = boundEntities;
    const add = (signal, extra = {}) => {
      if (extra.entityOverride) {
        const entity = extra.entityOverride;
        requests.push({field, entity:entity.id, label:entity.label, warrantyScope:field==='warranty'&&/(?:保修范围|质保范围|保障什么|保哪些|保修覆盖)/u.test(question), key:`${field}:${entity.id}${extra.keySuffix||''}`,...extra});
        return;
      }
      if (!activeEntities.length || !signal) {
        requests.push({field, entity:null, warrantyScope:field==='warranty'&&/(?:保修范围|质保范围|保障什么|保哪些|保修覆盖)/u.test(question), key:`${field}:*${extra.keySuffix||''}`, ...extra});
        return;
      }
      const distance = entity => Math.max(entity.start - signal.end, signal.start - entity.end, 0);
      const nearestDistance = Math.min(...activeEntities.map(distance));
      const nearest = activeEntities.filter(entity => distance(entity) === nearestDistance);
      requests.push({field, entity:nearest.length === 1 ? nearest[0].id : null, label:nearest.length === 1 ? nearest[0].label : null, ambiguous:nearest.length > 1, warrantyScope:field==='warranty'&&/(?:保修范围|质保范围|保障什么|保哪些|保修覆盖)/u.test(question),
        key:`${field}:${nearest.length === 1 ? nearest[0].id : '?'}${extra.keySuffix||''}`, ...extra});
    };
    if (field === 'product_attribute') {
      const types = [...question.matchAll(/颜色|色彩|色号|材质|型号|功率|重量|尺寸|规格/gu)];
      const uniqueTypes = [...new Map(types.map(match => [
        /颜色|色彩|色号/u.test(match[0]) ? '颜色' : /材质/u.test(match[0]) ? '材质' : /型号/u.test(match[0]) ? '型号' : /功率/u.test(match[0]) ? '功率' : /重量/u.test(match[0]) ? '重量' : /尺寸|规格/u.test(match[0]) ? '尺寸' : match[0],
        { kind: /颜色|色彩|色号/u.test(match[0]) ? '颜色' : /材质/u.test(match[0]) ? '材质' : /型号/u.test(match[0]) ? '型号' : /功率/u.test(match[0]) ? '功率' : /重量/u.test(match[0]) ? '重量' : /尺寸|规格/u.test(match[0]) ? '尺寸' : match[0], start:match.index, end:match.index+match[0].length }
      ])).values()];
      if (uniqueTypes.length > 1) { for (const type of uniqueTypes) add(type, {attributeKind:type.kind,keySuffix:`:${type.kind}`}); continue; }
    }
    if (field === 'version') {
      const steps = [...question.matchAll(/第(\d+)步/gu)];
      if (steps.length) {
        const products = boundEntities.filter(entity => entity.kind !== 'condition' && entity.kind !== 'variant');
        for (const step of steps) {
          const signal={start:step.index,end:step.index+step[0].length};
          if (products.length === 1) add(signal, {entityOverride:products[0],step:step[1],keySuffix:`:step${step[1]}`});
          else add(null, {step:step[1],keySuffix:`:step${step[1]}`});
        }
        continue;
      }
    }
    if (field === 'compatibility') {
      const targets = compatibilityTargets(question);
      if (targets.length > 1) { const signal=fieldMentions(question,field)[0]; for (const target of targets) add(signal,{compatibilityTarget:target,keySuffix:`:${target.toLowerCase()}`}); continue; }
    }
    const signals = fieldMentions(question, field);
    if (!signals.length) { add(null); continue; }
    for (const signal of signals) {
      // When different clauses ask different products for different fields,
      // bind the field to entities in its own clause. A shared field after a
      // coordinated list still sees all entities in that clause.
      const left = Math.max(question.lastIndexOf('，', signal.start), question.lastIndexOf(',', signal.start), question.lastIndexOf('；', signal.start), question.lastIndexOf(';', signal.start)) + 1;
      const ends = ['，', ',', '；', ';'].map(mark => question.indexOf(mark, signal.end)).filter(position => position >= 0);
      const right = ends.length ? Math.min(...ends) : question.length;
      const segment = question.slice(left, right);
      const scoped = entityMentions(segment)
        .filter(entity => (!['compatibility','version'].includes(field) || entity.kind !== 'condition')
          && !(field === 'schedule' && /^(?:活动|课程|课程安排)$/u.test(entity.id)))
        .map(entity => ({...entity, start:entity.start + left, end:entity.end + left}));
      activeEntities = scoped.length ? scoped : boundEntities;
      const askedProducts = activeEntities.filter(entity => entity.kind !== 'condition' && entity.kind !== 'variant');
      const askedVariants = activeEntities.filter(entity => entity.kind === 'variant');
      if (signals.length === 1 && askedProducts.length > 1) {
        for (const entity of askedProducts) add(signal, {entityOverride:entity});
      } else if (signals.length === 1 && !askedProducts.length && askedVariants.length > 1) {
        for (const entity of askedVariants) add(signal, {entityOverride:entity});
      } else add(signal);
    }
    activeEntities = boundEntities;
  }
  let unique = [...new Map(requests.map(request => [request.key, request])).values()];
  // A single field can contain multiple independently answerable sub-questions.
  // Preserve each requested facet so a region fact cannot stand in for an ETA,
  // and a return permission cannot stand in for the return window or postage payer.
  const facetGroups = {
    delivery: [
      [/(?:哪些地区|什么地区|覆盖范围|配送范围|配送地区|送到哪里|配送到哪里)/u, 'delivery_region'],
      [/(?:到货|送达|配送).{0,8}(?:时间|多久|几天|何时|什么时候)|(?:什么时候|何时|多久|几天).{0,8}(?:到货|送达|配送)/u, 'delivery_time']
    ],
    return: [
      [/(?:退货|退换).{0,10}(?:几天|多少天|多久|期限|时长)|(?:几天|多少天|多久|期限|时长).{0,10}(?:退货|退换)/u, 'return_window'],
      [/(?:运费|邮费|谁(?:来|要|需)?承担|由谁|谁出)/u, 'return_shipping']
    ],
  refund: [
    [/(?:到账|退款.{0,4}时间|时间.{0,4}退款|什么时候|何时|多久|几天|几小时)/u, 'refund_time'],
    [/(?:退到|退回|退至|退款到|退款至|返回)(?:哪里|哪儿|哪个|什么|哪张)(?:账户|卡|渠道|地方)?|(?:退款)?去向|原路退回到/u, 'refund_destination']
  ],
  warranty: [
    [/(?:保修范围|质保范围|保障什么|保哪些|保修覆盖|保修.{0,12}范围|范围.{0,8}(?:是什么|是哪些|包括什么))/u, 'warranty_scope'],
    [/(?:保修|质保).{0,8}(?:多久|多长|几年|几个月|期限|时长)|(?:多久|多长|几年|几个月|期限|时长).{0,8}(?:保修|质保)/u, 'warranty_duration']
  ]
};
  for (const [field, patterns] of Object.entries(facetGroups)) {
    const facets = patterns.filter(([pattern]) => pattern.test(question)).map(([, facet]) => facet);
    if (facets.length < 2) continue;
    const originals = unique.filter(request => request.field === field);
    if (!originals.length) continue;
    unique = unique.filter(request => request.field !== field);
    for (const original of originals) for (const facet of facets) {
      unique.push({...original, facet, key:`${original.key}:facet:${facet}`});
    }
  }
  return unique;
}
function clauseMatchesRequest(clause, request) {
  if (request.ambiguous) return false;
  const quotedTitles = text => [...text.matchAll(/《([^》]{1,24})》/gu)].map(match => match[1].trim());
  const askedTitles = quotedTitles(request.question || '');
  const statedTitles = quotedTitles(clause);
  if (askedTitles.some(title => !clause.includes(title))) return false;
  if (statedTitles.some(title => !askedTitles.includes(title))) return false;
  if (!request.entity) return true;
  if (request.field === 'warranty' && request.warrantyScope && request.label && clause.includes(request.label)
      && /(?:保修|质保)范围.{0,24}(?:包括|涵盖|覆盖)/u.test(clause)) return true;
  if (request.field === 'return' && request.label && clause.includes(request.label)
      && entityIds(clause).has(request.entity)
      && !entityMentions(clause).some(entity => entity.id !== request.entity && entity.kind !== 'condition'
        && /(?:产品|商品|配件|酸奶|奶茶|茶饮|饮料|饼干|糖果|蛋糕|面包|水果|咖啡|茶|杯|瓶|包|鞋|手机|耳机|手表|电脑|衣服|裤子|相机|键盘|鼠标|灯|床|桌|椅|玩具|音箱|音响|路由器|充电器|显示器|平板|电视|空调|冰箱|洗衣机|课程|教程|系列|功能|活动|直播|讲座|套餐|服务|工具)$/u.test(entity.label))
      && /(?:(?:签收后|购买后)\s*)?(?:\d+(?:\.\d+)?|[零一二两三四五六七八九十百]+)\s*(?:天|个工作日|月|年)(?:\s*(?:内)?\s*(?:无理由)?)?.{0,8}(?:可|支持)?\s*(?:退货|退换)/u.test(clause)) return true;
  // Compact catalogue notation such as “A产品型号X100” has no delimiter
  // between the field and its value. Bind it directly to the requested named
  // product before generic entity tokenisation, which must otherwise decide
  // whether X100 is a product or a value.
  if (request.field === 'product_attribute' && request.label) {
    const escaped = request.label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    if (new RegExp(`${escaped}\\s*型号\\s*(?:为|是|：|:)?\\s*[A-Za-z0-9]`, 'u').test(clause)) return true;
  }
  const entities = entityMentions(clause).filter(entity => (!['compatibility','version'].includes(request.field) || entity.kind !== 'condition')
    && !(request.field === 'product_attribute' && entity.kind === 'variant')), signals = fieldMentions(clause, request.field);
  if (!entities.length || !signals.length) return false;
  return signals.some(signal => {
    const distance = entity => Math.max(entity.start - signal.end, signal.start - entity.end, 0);
    const nearestDistance = Math.min(...entities.map(distance));
    const nearest = entities.filter(entity => distance(entity) === nearestDistance);
    return nearest.length === 1 && sameEntityId(nearest[0].id, request.entity);
  });
}
function directQuestionTopic(question) {
  const normalized = question.replace(/[？?。！!]/gu, '').trim();
  if (/(?:在哪个平台|什么平台|哪个平台).{0,8}(?:看|观看|播放)|(?:在哪里|在哪|哪儿)观看/u.test(normalized)) return '观看平台';
  if (/(?:作者|作者姓名|作者名字)(?:是|为)?(?:谁|哪位|什么人)|(?:谁|哪位)是(?:这篇|该|本)?(?:文章|视频|作品)?作者/u.test(normalized)) return '作者';
  return /^(.*?)(?:是|为)?(?:什么|多少|几|谁|哪位|哪里|哪儿|哪个|哪些)(?:内容|信息|主题|嘉宾)?$/u.exec(normalized)?.[1]?.trim() || '';
}
function genericDirectSupport(question, clause) {
  // Free-form questions do not have a typed field to bind evidence to. Never
  // treat a shared word as proof: “安全吗” and “安全库存” are related text but
  // different claims. Prefer an explicit subject + predicate assertion when
  // the question asks an open-ended factual value. This keeps ordinary reader
  // questions extensible without accepting mere shared keywords.
  const normalizedQuestion = question.replace(/[？?。！!]/gu, '').trim();
  if (/(?:作者|作者姓名|作者名字)(?:是|为)?(?:谁|哪位|什么人)|(?:谁|哪位)是(?:这篇|该|本)?(?:文章|视频|作品)?作者/u.test(normalizedQuestion)) {
    return /(?:作者|创作者|原作者)(?:是|为|：|:)\s*[\p{Script=Han}A-Za-z][\p{Script=Han}A-Za-z·_-]{1,24}/u.test(clause);
  }
  const viewingPlatformQuestion = /(?:在哪个平台|什么平台|哪个平台).{0,8}(?:看|观看|播放)|(?:在哪里|在哪|哪儿)观看/u.test(normalizedQuestion);
  if (viewingPlatformQuestion) {
    if (/(?:可在|可以在|支持在|在)\s*(?:抖音|小红书|哔哩哔哩|B站|视频号|YouTube|TikTok|微博|快手|西瓜视频)(?:平台)?(?:上)?(?:观看|看|播放)/iu.test(clause)) return true;
    if (/(?:观看平台|播放平台)\s*(?:是|为|：|:)\s*(?:抖音|小红书|哔哩哔哩|B站|视频号|YouTube|TikTok|微博|快手|西瓜视频)/iu.test(clause)) return true;
    return false;
  }
  const objectKind = text => /(?:这个|那个|该|此)?([\p{Script=Han}]{1,6}(?:滤镜|模板|视频|相机|课程|教程|活动|讲座|直播|节目|服务|套餐|订单|产品|商品|功能|文章|图片|账号|店铺))/u.exec(text)?.[1] || '';
  const askedKind = objectKind(normalizedQuestion), statedKind = objectKind(clause);
  const cameraQuestion = /(?:什么|哪款).{0,4}相机|相机.{0,4}(?:什么|哪款)|用什么相机/u.test(normalizedQuestion);
  const cameraUseAssertion = /(?:我|本人|作者)?.{0,8}(?:拍视频|拍摄视频).{0,12}(?:使用|用).{1,24}/u.test(clause);
  if (askedKind && statedKind && askedKind !== statedKind && !(cameraQuestion && cameraUseAssertion)) return false;
  // A free-form question has no typed field (such as price or stock) to bind
  // to a source card.  If both sides explicitly name a business object, they
  // must name the same one.  Do this before the question-specific fallbacks
  // below: otherwise a generic assertion such as “嘉宾是李明” could make a
  // lecture card answer a live-stream question merely because both mention a
  // guest.  Concise cards with no object anchor remain usable, but a card
  // that *does* identify a different object is never borrowed.
  const askedObjects = entityMentions(normalizedQuestion).filter(item => item.kind !== 'condition');
  const statedObjects = entityMentions(clause).filter(item => item.kind !== 'condition');
  const sameObject = (asked, stated) => asked.id === stated.id
    || (/^(?:课程|教程|活动|讲座|直播|节目|服务|套餐|订单)$/u.test(asked.id) && stated.id.endsWith(asked.id));
  if (askedObjects.length && statedObjects.length
      && !askedObjects.some(asked => statedObjects.some(stated => sameObject(asked, stated)))
      && !(cameraQuestion && cameraUseAssertion)) return false;
  const topicGroups = [['直播间', '直播'], ['讲座'], ['课程', '教程'], ['活动'], ['节目']];
  for (const group of topicGroups) {
    const asked = group.some(topic => normalizedQuestion.includes(topic));
    const stated = topicGroups.flat().filter(topic => clause.includes(topic));
    if (asked && stated.length && !group.some(topic => stated.includes(topic))) return false;
  }
  const existence = /^(.*?)(?:有没有|有)([^，,。；;]+)$/.exec(normalizedQuestion);
  if (existence) {
    const subject = existence[1].trim(), object = existence[2].trim();
    const cleanObject = object.replace(/(?:吗|呢|呀|啊)$/u, '').trim();
    if (subject.length >= 2 && cleanObject && clause.includes(subject) && clause.includes(cleanObject)
        && /(?:有|包含|包括|提供|安排|设有)/u.test(clause)) return true;
  }
  const supportedFeature = /^(.*?)(?:支持|不支持)([^，,。；;]+)$/.exec(normalizedQuestion);
  if (supportedFeature) {
    const subject = supportedFeature[1].trim(), feature = supportedFeature[2].replace(/(?:吗|呢)$/u, '').trim();
    if (subject.length >= 2 && feature && clause.includes(subject) && clause.includes(feature)
        && /(?:支持|不支持|提供|开放|可回看|有回放)/u.test(clause)) return true;
  }
  const actionQuestion = /^(.*?)(?:可以|能否|能不能|可不可以|是否|能)(.+?)吗$/u.exec(normalizedQuestion);
  if (actionQuestion) {
    const subject = actionQuestion[1].trim();
    const action = actionQuestion[2].trim().replace(/^(?:把|将)/u, '');
    const target = action.replace(/^(?:放入|放进|放|使用|用|放到|放在)/u, '').trim();
    const normalizedFact = clause.replace(/放入|放进/gu, '放');
    if (subject.length >= 2 && target.length >= 2 && clause.includes(subject)
        && (normalizedFact.includes(action.replace(/放入|放进/gu, '放')) || normalizedFact.includes(target))
        && /(?:可以|可|能|不可以|不能|不支持|不可|适合|不适合|清洗|使用|放入|放进|放)/u.test(clause)) return true;
  }
  const whyAction = normalizedQuestion.replace(/^(?:为什么|为何)(?:要|会|需要|得)?/u, '').trim();
  if (whyAction.length >= 3 && clause.includes(whyAction) && /(?:是为了|为了|因为|由于|原因是|这样可以|以便)/u.test(clause)) return true;
  const directSubject = /^(.*?)(?:是|为)?(?:什么|多少|几|谁|哪位|哪里|哪儿|哪个|哪些)(?:内容|信息|主题|嘉宾)?$/u.exec(normalizedQuestion)?.[1]?.trim();
  if (directSubject && directSubject.length >= 2) {
    const escaped = directSubject.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    if (new RegExp(`${escaped}\\s*(?:是|为|：|:|有|包括|包含|达到)\\s*[^。；;，,]{1,80}`, 'u').test(clause)) return true;
  }
  const problemQuestion = /^(.*?)(?:主要)?(?:解决|改善|应对)(?:什么|哪些)(?:问题|痛点)$/u.exec(normalizedQuestion);
  if (problemQuestion) {
    const subject = problemQuestion[1].trim();
    if (subject.length >= 2 && clause.includes(subject)
        && /(?:主要)?(?:解决|改善|应对).{1,60}(?:问题|痛点)/u.test(clause)) return true;
  }
  if (/(?:怎么|如何)(?:参加|参与|报名)/u.test(question)) {
    const askedEvent = /(?:活动|讲座|直播|课程)/u.exec(question)?.[0];
    // “可在小程序填写报名表参加” is a direct participation method too.
    // Keep the event and action in the same assertion so an unrelated link
    // or a notice that registration merely exists cannot be used as an answer.
    const hasMethod = /(?:参加方式|参与方式|报名方式)(?:为|是|：|:)?|(?:通过|使用|前往|在).{0,16}(?:小程序|官网|公众号|链接|页面|现场|线上|线下).{0,16}(?:填写.{0,8})?(?:报名|参加|参与)|(?:报名|参加|参与).{0,12}(?:小程序|官网|公众号|链接|页面|现场|线上|线下)/u.test(clause);
    if (hasMethod && (!askedEvent || clause.includes(askedEvent))) return true;
  }
  const qualityQuestion = /^(.*?)(?:的)?(难度|级别|等级|主题|风格|特点|定位|用途|范围|内容|目标)(?:是)?(?:什么|如何|怎么样|怎样)$/u.exec(normalizedQuestion);
  if (qualityQuestion) {
    const [, subject, aspect] = qualityQuestion;
    if (subject.trim().length >= 2 && clause.includes(subject.trim()) && clause.includes(aspect)
        && /(?:是|为|包括|包含|达到|属于)/u.test(clause)) return true;
  }
  if (cameraQuestion && cameraUseAssertion) return true;
  const askedBooking = bookingIntent(question);
  if (askedBooking) return bookingIntent(clause) === askedBooking
    && /(?:可以|可|支持|能够|接受|允许|不可以|不可|不支持|不能|不接受|不允许).{0,8}(?:预约|预订)|(?:预约|预订).{0,8}(?:可以|可|支持|能够|接受|允许|不可以|不可|不支持|不能|不接受|不允许)/u.test(clause);
  if (/(?:几种|多少种|几类|多少类)/u.test(question)) return /(?:共|总计|合计|有|包含|包括)\s*\d+\s*(?:种|类)/u.test(clause);
  if (/(?:几节|多少节|几章|多少章)/u.test(question)) return /(?:课程|教程|内容|章节)/u.test(question)
    && /(?:共|总计|合计|包含|包括|由).{0,12}\d+\s*(?:节|章)/u.test(clause);
  if (/(?:嘉宾是谁|哪位嘉宾|谁是嘉宾|嘉宾是哪位)/u.test(question)) return /(?:直播|讲座|活动|节目)/u.test(question)
    // The question supplies the event scope.  Approved cards are commonly
    // concise ("嘉宾是李明"), so do not require them to repeat "直播"; their
    // distinct named conclusions are checked for conflict before drafting.
    && /(?:嘉宾|主讲人)(?:是|为|：|:)\s*[\p{Script=Han}]{2,8}(?:、[\p{Script=Han}]{2,8})?/u.test(clause);
  if (/(?:适合谁|适用于谁|适合哪些人)/u.test(question)) return /(?:适合|适用于|不适合|不适用于).{0,10}(?:零基础|初学者|新手|儿童|孩子|老人|孕妇|学生|成人|家长|职场人|创作者|开发者)/u.test(clause);
  if (/(?:持续多久|时长多久|时长是多少|多长时间)/u.test(question)) return /(?:时长|持续时间|持续).{0,8}(?:\d+(?:\.\d+)?\s*(?:分钟|小时|天|周)|[一二三四五六七八九十]+\s*(?:分钟|小时|天|周))|(?:\d+(?:\.\d+)?|[一二三四五六七八九十]+)\s*(?:分钟|小时|天|周).{0,8}(?:时长|持续)/u.test(clause);
  if (/安全吗|是否安全/u.test(question)) return /(?:通过|符合|达到|获得).{0,8}(?:安全(?:测试|认证|标准)|认证)|(?:安全测试|安全认证|安全标准).{0,8}(?:通过|符合|达到)|不安全|存在.{0,6}(?:安全风险|安全隐患)/u.test(clause) && !/安全库存/u.test(clause);
  if (/防水/u.test(question)) return /(?:产品|商品|设备|机身|机芯).{0,8}(?:支持)?防水|防水等级|具备防水/u.test(clause) && !/防水(?:收纳)?袋/u.test(clause);
  if (/防尘/u.test(question)) return /(?:产品|商品|设备|机身|机芯).{0,8}(?:支持)?防尘|防尘等级|具备防尘/u.test(clause);
  if (/怎么清洗|如何清洗|怎样清洗/u.test(question)) return /(?:清洗方式|清洁方式|用.{0,8}清洗|清洗.{0,8}(?:方法|步骤)|擦拭|冲洗|浸泡|先.{0,16}(?:再|然后))/u.test(clause);
  if (/(?:怎么|如何).{0,4}使用|开始使用/u.test(question)) return /(?:使用方法|操作步骤|打开|点击|选择|先).{0,24}(?:再|然后|选择|完成|即可)|(?:先|首先).{0,24}(?:再|然后|选择|完成|即可)/u.test(clause);
  if (/开放.{0,8}(?:哪些|什么).{0,4}(?:权限|能力)|开放(?:哪些|什么)(?:权限|能力)|哪些权限|哪些能力/u.test(question)) return /(?:开放|支持|提供).{0,12}(?:权限|能力)|(?:相册|相机|麦克风|位置|通讯录|存储|通知).{0,8}(?:权限|能力)/u.test(clause);
  if (/(?:哪里|在哪|哪儿|哪个地点|什么地点)/u.test(question)) {
    if (/(?:上课|授课|学习)/u.test(question)) return !/(?:报名|办理报名|注册报名)/u.test(clause)
      && /(?:在.{0,12}(?:上课|授课|学习)|(?:上课|授课|学习)(?:地点)?(?:为|是|在)|上课地点|授课地点|校区|教室|线上(?:授课|上课)|线下(?:授课|上课)|在线(?:授课|上课))/u.test(clause);
    return /(?:位于|在.{0,12}(?:办理|举行|举办|开展|拍摄|录制)|(?:拍摄|录制)(?:地点|于|在)|校区|教室|线上(?:授课|上课)|线下(?:授课|上课))/u.test(clause);
  }
  if (/(?:几节|多少节|几章|多少章)/u.test(question)) return /\d+\s*(?:节|章)/u.test(clause);
  if (/(?:嘉宾是谁|哪位嘉宾|谁是嘉宾|嘉宾是哪位)/u.test(question)) return /(?:嘉宾|主讲人)(?:是|为|：|:)\s*[\p{Script=Han}]{2,8}/u.test(clause);
  if (/适合|适用于/u.test(question)) {
    const audience = /适合.{0,4}(儿童|孩子|新手|初学者|老人|孕妇|学生|成人)/u.exec(question)?.[1];
    return !!audience && new RegExp(`(?:适合|适用于|不适合|不适用于).{0,5}${audience}`).test(clause);
  }
  return false;
}
function bookingIntent(text) {
  if (/(?:取消.{0,4}(?:预约|预订)|(?:预约|预订).{0,4}取消)/u.test(text)) return 'cancel_booking';
  if (/预约|预订/u.test(text)) return 'make_booking';
  return '';
}
function isRefundDestinationQuestion(question) {
  return /(?:退到|退回|退至|退款到|退款至|返回)(?:哪里|哪儿|哪个|什么|哪张)(?:账户|卡|渠道|地方)?|(?:退款)?去向|原路退回(?:到|吗|呢|是否|会不会)?/u.test(question);
}
function lacksSchedule(fact) {
  if (/(?:不会|不再|未计划|没有计划).{0,12}(?:上线|发布|推出)|(?:上线|发布|推出).{0,12}(?:不会|不再|未计划|没有计划)|(?:改期|延期|推迟|取消上线)|(?:未公布|暂无|尚未|没有).{0,16}(?:日期|时间表|上线|发布)|(?:日期|时间表|上线|发布).{0,16}(?:未公布|暂无|尚未|没有)|(?:发布计划|上线计划).{0,12}(?:正在制定|尚在制定|待制定)/u.test(fact)) return true;
  return !/(?:20\d{2}年(?:\d{1,2}月(?:\d{1,2}[日号])?)?|\d{1,2}月(?:\d{1,2}[日号])?|\d{1,2}月|周[一二三四五六日天]|(?:今年|明年|本月|下月|月底|上旬|中旬|下旬|第一季度|第二季度|第三季度|第四季度)|\d+(?:个)?(?:分钟|小时|天|工作日|周|月)(?:内|后|前)?|当天|次日|\d{1,2}:\d{2})/u.test(fact);
}
function hasReleaseEvent(question, fact) {
  if (/(?:发布公告|公告发布|公告将发布)/u.test(fact)
      && !/(?:产品|功能|服务).{0,8}(?:上线|推出|开放)/u.test(fact)) return false;
  // A production, warranty, or document date is not a release commitment.
  // Keep this deliberately narrow: a time answer needs an explicit launch
  // event in the same fact, rather than merely a calendar-looking string.
  const time = '(?:20\\d{2}年(?:\\d{1,2}月(?:\\d{1,2}[日号])?)?|\\d{1,2}月(?:\\d{1,2}[日号])?|周[一二三四五六日天]|(?:今年|明年|本月|下月|月底|上旬|中旬|下旬|第一季度|第二季度|第三季度|第四季度)|\\d+(?:个)?(?:分钟|小时|天|工作日|周|月)(?:内|后|前)?|当天|次日|\\d{1,2}:\\d{2})';
  if (/(?:活动|讲座|直播|课程).{0,8}(?:日期|哪天|哪一天)|(?:活动|讲座|直播|课程)(?:日期)?(?:是哪天|是哪一天)/u.test(question)) {
    return !/(?:开始报名|开始预约|开始申请|报名.{0,32}(?:开放|开始)|(?:开放|开始).{0,32}报名)/u.test(fact)
      && new RegExp('(?:(?:活动|讲座|直播|课程)日期(?:为|是|：|:)\\s*' + time + '|(?:将于|计划于|预计于|定于|于|在)\\s*' + time + '.{0,8}(?:举行|举办|开课|上课))', 'u').test(fact);
  }
  if (/几点/u.test(question)) {
    const clock='\\d{1,2}(?::\\d{2}|点(?:半)?)';
    const event=/开始|举行|开放|开课|上课/u.test(question)?'(?:开始|举行|开放|开课|上课)':'发布';
    return new RegExp(`(?:${clock}.{0,12}${event}|${event}时间(?:为|是|：|:)\\s*${clock})`,'u').test(fact);
  }
  if (/几点(?:开始|举行|开放)|什么时候(?:开始|举行|开放)|活动时间|开始时间/u.test(question))
    return !( /活动/u.test(question) && !/活动/u.test(fact) )
      && !/(?:开始报名|开始预约|开始申请|报名.{0,32}(?:开放|开始)|(?:开放|开始).{0,32}报名)/u.test(fact)
      && new RegExp(`(?:(?:将于|计划于|预计于|定于|于|在)\\s*${time}.{0,8}(?:开始|举行|开放)|(?:开始时间|活动时间)(?:为|是|：|:)\\s*${time})`, 'u').test(fact);
  if (/开课/u.test(question)) return !hasUnresolvedConclusion(fact)
    && new RegExp(`(?:(?:将于|计划于|预计于|定于|于|在)\\s*${time}.{0,8}(?:开课|上课|开始授课)|(?:开课|上课)时间(?:为|是|：|:)\\s*${time}|${time}.{0,3}(?:开课|上课))`, 'u').test(fact);
  if (/上线|推出|开售|发售|正式开放/u.test(question))
    return !/(?:停止|终止|下线|取消|撤销|暂停|延期|推迟|维护更新|上线方案|上线计划|提交审批)/u.test(fact)
      && new RegExp(`(?:(?:将于|计划于|预计于|定于|于|在)\\s*${time}.{0,8}(?:上线|推出|开售|发售|正式开放)|(?:上线|推出|开售|发售|正式开放)(?:时间|日期)(?:(?:更正为|后来更正为|实际改为|改为|为|是|：|:)\\s*)${time}|${time}.{0,3}(?:上线|推出|开售|发售|正式开放))`, 'u').test(fact);
  // A manual, report, announcement, or other collateral can itself be
  // published. Its date must not answer when the named product is released.
  if (/(?:说明书|使用手册|操作手册|指南|白皮书|报告|公告|文档|文件).{0,10}(?:发布|推出|上线)/u.test(fact)) return false;
  return !/(?:停止发布|终止发布|取消发布|撤销发布|延期发布|推迟发布|维护更新|发布会|发布计划|提交审批)/u.test(fact)
    && new RegExp(`(?:(?:将于|计划于|预计于|定于|于|在)\\s*${time}.{0,8}发布|发布时间(?:为|是|：|:)\\s*${time}|${time}.{0,3}发布)`, 'u').test(fact);
}
function compatibilityTargets(text) {
  const targets = new Set();
  const add = value => {
    const target = value.replace(/(?:吗|呢|呀|啊|的|功能|设备)$/gu, '').replace(/(?:和|与|及|或|或者|、)+$/gu, '').trim();
    if (/^[\p{Script=Han}]{2,8}$/u.test(target) && new RegExp(`${target}\\s+[A-Za-z]+\\s*\\d+`, 'iu').test(text)) return;
    if (target && target.length <= 24) targets.add(target.toLowerCase());
  };
  // Named capabilities are retained as exact tokens, so NFC and 快充 cannot
  // silently fall back to an unrelated capability such as 蓝牙.
  for (const match of text.matchAll(/(?:兼容|适配|支持)\s*((?:\d+\s*G|蓝牙\s*\d+(?:\.\d+)+|Bluetooth\s*\d+(?:\.\d+)+|Wi-?Fi\s*\d+(?:\.\d+)*|USB(?:-?C)?|[A-Za-z][A-Za-z0-9_-]*|[\p{Script=Han}]{2,8}))/giu)) add(match[1]);
  for (const match of text.matchAll(/(?:不支持|不兼容|不适配|无法兼容|无法适配)\s*([A-Za-z][A-Za-z0-9_-]*|[\p{Script=Han}]{2,8})/giu)) add(match[1]);
  for (const match of text.matchAll(/(?:兼容|适配|支持)\s*((?:[\p{Script=Han}]{1,8}\s*)?[A-Za-z]{1,8}\s*\d{1,4}(?:\s*(?:Pro|Max|Plus|mini|Ultra))?)/giu)) add(match[1]);
  for (const match of text.matchAll(/(?:能不能用|能用吗)\s*([A-Za-z][A-Za-z0-9_-]*|[\p{Script=Han}]{2,8})/gu)) add(match[1]);
  // “能在 iOS 上使用吗” puts the platform between the modal verb and
  // “使用”, so it is not covered by the ordinary “支持 iOS” form above.
  for (const match of text.matchAll(/能在\s*([A-Za-z][A-Za-z0-9_-]*|[\p{Script=Han}]{2,8})\s*上(?:使用|运行)吗/gu)) add(match[1]);
  for (const match of text.matchAll(/\b\d+\s*G\b|蓝牙\s*\d+(?:\.\d+)+|Bluetooth\s*\d+(?:\.\d+)+|Wi-?Fi\s*\d+(?:\.\d+)*|安卓|android|iOS|iPhone|iPad|Windows|Mac|鸿蒙|蓝牙|Bluetooth|USB(?:-?C)?|NFC|快充/giu)) add(match[0]);
  for (const match of text.matchAll(/(?:兼容|适配|支持)\s*((?:[\p{Script=Han}]{1,8}\s*)?[A-Za-z]{1,8}\s*\d{1,4}(?:\s*(?:Pro|Max|Plus|mini|Ultra))?)/giu)) add(match[1]);
  return [...targets];
}
function inventoryState(fact) {
  // Stock is a current-state answer. A historical observation or a withdrawn
  // conclusion is not usable inventory even when it contains "有货".
  if (inventoryObservationIsStale(fact)) return null;
  if (/(?:去年|前年|曾经|过去|此前|之前|历史上|原先|过往).{0,12}(?:库存|有货|缺货|现货)|(?:库存|有货|缺货|现货).{0,12}(?:去年|前年|曾经|过去|此前|之前|历史上|原先|过往)|(?:库存|有货|缺货|现货|结论).{0,12}(?:已撤回|被撤回|已作废|已失效|不再有效|已过期)/u.test(fact)) return null;
  if (/(?:有货|有库存|现货|缺货|无货|没货|无库存|售罄|售完|库存.{0,8}0)(?:不是|并非|不算).{0,8}(?:最终|当前|最新|確定)?(?:结论|结果|状态)|(?:不是|并非|不算).{0,8}(?:最终|当前|最新)(?:结论|结果|状态)/u.test(fact)) return null;
  fact = fact.replace(/(?:没有|无|暂无)(?:商品)?库存(?:压力|风险|问题|页面|链接|入口|表格|说明|信息)/gu, ' ');
  fact = fact.replace(/(?:没有|无|暂无)(?:商品)?现货(?:说明|信息|记录|页面|链接)/gu, ' ');
  fact = fact.replace(/(?:有货|有库存|现货)(?:说明|信息|页面|记录)?(?:已删除|被删除|已移除|被移除|已撤下|不存在)/gu, '');
  fact = fact.replace(/(?:无货|没货|没有货|无库存|没有库存|没有现货|缺货|售罄|售完|暂无货)(?:说明|信息|页面|记录)?(?:已删除|被删除|已移除|被移除|已撤下|不存在)/gu, '');
  if (/(?:有库存|有货|现货|库存可查).{0,6}(?:页面|链接|入口|表格)(?:可查看|可查询|可查)?/u.test(fact)) return null;
  if (/(?:可能|也许|或许|大概|估计|不一定|尚不确定|待确认).{0,8}(?:有货|库存|现货|可购买)|(?:有货|库存|现货|可购买).{0,8}(?:可能|也许|或许|大概|估计|不一定)/u.test(fact)) return null;
  // “不缺货” is an affirmative stock conclusion.  Check a genuine double
  // negation first; the previous expression accidentally matched a literal
  // `s` rather than optional whitespace, which made this safeguard inert.
  const notShortage = /(?:不缺货|并未缺货)/u.test(fact);
  const negatedNotShortage = /(?:不是|并非|没有|未)\s*(?:不缺货|并未缺货)/u.test(fact);
  if (notShortage && !negatedNotShortage) return 'positive';
  const negative = /无货|没货|没有货|无库存|没有库存|没有现货|缺货|售罄|售完|暂无货|不可购买|库存\s*(?:为|是|剩余|[:：])?\s*0(?:件|个|台|条|双|瓶|盒)?|(?:还剩|剩余|还有)\s*0(?:件|个|台|条|双|瓶|盒)?|(?:更正为|最终为|改为)\s*0(?:件|个|台|条|双|瓶|盒)?/u.test(fact);
  if (negative) return 'negative';
  if (/有货|现货|有库存|可购买|有\s*(?:\d+|[零一二两三四五六七八九十百]+)\s*(?:件|个|台|条|双|瓶|盒)?\s*(?:库存|现货)|库存\s*有\s*(?:\d+|[零一二两三四五六七八九十百]+)/u.test(fact)) return 'positive';
  const count = /(?:库存\s*(?:为|是|剩余|[:：])?\s*|(?:还剩|剩余|还有|有)\s*)(\d+|[零一二两三四五六七八九十百]+)(?:件|个|台|条|双|瓶|盒)?/u.exec(fact);
  return count && numberValue(count[1]) > 0 ? 'positive' : null;
}
function inventoryObservationIsStale(fact) {
  if (/(?:去年|前年|曾经|过去|此前|之前|历史上|原先|过往).{0,12}(?:库存|有货|缺货|现货)|(?:库存|有货|缺货|现货).{0,12}(?:去年|前年|曾经|过去|此前|之前|历史上|原先|过往)|(?:库存|有货|缺货|现货|结论).{0,12}(?:已撤回|被撤回|已作废|已失效|不再有效|已过期)/u.test(fact)) return true;
  const dateMatch = /(?:20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/u.exec(fact);
  if (!dateMatch || !/(?:库存|有货|缺货|现货)/u.test(fact)) return false;
  const year = Number(/20\d{2}/u.exec(fact)?.[0]);
  const month = Number(dateMatch[1]);
  const day = Number(dateMatch[2]);
  const observed = new Date(year, month - 1, day);
  const today = new Date(); today.setHours(0,0,0,0);
  return Number.isFinite(observed.getTime()) && observed < today;
}
function numberValue(value) {
  if (/^\d+$/.test(value)) return Number(value);
  const digit = {'零':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
  if (value.includes('百')) {
    const [hundreds, rest=''] = value.split('百');
    return (digit[hundreds] || 1) * 100 + (rest ? numberValue(rest) : 0);
  }
  if (value.includes('十')) {
    const [tens, ones=''] = value.split('十');
    return (tens ? digit[tens] : 1) * 10 + (ones ? digit[ones] : 0);
  }
  return digit[value] ?? NaN;
}
function inventoryQuantity(fact) {
  const match = /(?:库存\s*(?:(?:为|是|剩余|有|[:：])\s*)?|(?:还剩|剩余|还有|有)\s*)(\d+|[零一二两三四五六七八九十百]+)(?:件|个|台|条|双|瓶|盒)?(?:\s*(?:件|个|台|条|双|瓶|盒)?\s*库存)?/u.exec(fact);
  return match ? numberValue(match[1]) : null;
}
function withoutNegatedAmounts(clause, labels) {
  const label = labels.join('|');
  const currency = String.raw`\d+(?:\.\d+)?\s*(?:元|人民币|美元|美金|欧元|EUR|€|¥|\$)`;
  return clause.replace(new RegExp(`(?:${label}).{0,10}(?:不是|并非|不为|不等于)\\s*${currency}|${currency}.{0,10}(?:${label}).{0,8}(?:不是|并非|不为|不等于)`, 'gu'), '');
}
function currentPriceText(clause) {
  // Do not normalize an old or retracted amount into a current price. This
  // guard runs before the amount/correction extractors below.
  if (/(?:去年|前年|曾经|过去|此前|之前|历史上|原先|过往).{0,12}(?:售价|价格|标价|成交价|单价)|(?:售价|价格|标价|成交价|单价).{0,12}(?:去年|前年|曾经|过去|此前|之前|历史上|原先|过往)|(?:售价|价格|标价|成交价|单价|结论).{0,12}(?:已撤回|被撤回|已作废|已失效|不再有效|已过期)/u.test(clause)) return '';
  // “没有证据显示售价 100 元” is a denial of support, not a price
  // assertion. Keep all common evidence verbs in this guard so they cannot
  // fall through to the generic amount extractor below.
  if (/(?:没有证据(?:表明|证明|显示)|无证据(?:表明|证明|显示)|未能(?:证明|显示)|无法(?:证明|显示)).{0,16}(?:售价|价格|标价|成交价|单价)/u.test(clause)) return '';
  const corrected = /(?:售价|价格|标价|成交价|单价)\s*(?:不是|并非|不为|不等于)\s*\d+(?:\.\d+)?\s*(?:元|人民币|美元|美金|欧元|EUR|€|¥|\$)\s*[，,]?\s*而是\s*(\d+(?:\.\d+)?)\s*(元|人民币|美元|美金|欧元|EUR|€|¥|\$)/u.exec(clause);
  if (corrected) return `售价 ${corrected[1]}${corrected[2]}`;
  const laterCorrection = /(?:更正为|后来更正为|实际改为|改为)\s*(\d+(?:\.\d+)?)\s*(元|人民币|美元|美金|欧元|EUR|€|¥|\$)/u.exec(clause);
  if (laterCorrection) return `售价 ${laterCorrection[1]}${laterCorrection[2]}`;
  const normalized = clause.replace(/((?:售价|价格|标价|成交价|单价)\s*(?:为|是|：|:)?\s*)([¥$€])\s*(\d+(?:\.\d+)?)/gu, '$1$3$2');
  return withoutNegatedAmounts(normalized, ['售价','价格','标价','成交价','单价']);
}
function hasPolicyConclusion(field, clause) {
  // A policy heading, link, or change notice is not an answer. For policy
  // questions retain only a stated permission/prohibition or a concrete rule
  // (for example a return window), so a reader is never told a policy exists
  // when its actual conclusion is absent.
  const subject = {
    return: '退货|退换', refund: '退款', exchange: '换货',
    warranty: '保修|质保', after_sales: '售后'
  }[field];
  if (!subject) return true;
  if (field === 'warranty' && /(?:保修|质保)范围/u.test(clause)
      && /(?:范围|包括|涵盖|覆盖)\s*(?:为|是)?\s*[\p{Script=Han}]{2,}/u.test(clause)) return true;
  // Customer-service availability is not a policy decision. “支持退货咨询”
  // and “提供换货说明” only describe help channels, not permission or terms.
  if (/(?:退货|退换|换货|保修|质保).{0,4}(?:咨询|说明|查询)|(?:咨询|说明|查询).{0,4}(?:退货|退换|换货|保修|质保)/u.test(clause)
      && !/(?:允许|可以|可在|接受|不支持|不允许|不能|不可).{0,10}(?:退货|退换|换货|保修|质保)|(?:退货|退换|换货|保修|质保).{0,10}(?:允许|期限|签收后|购买后|终身|保修期)/u.test(clause)) return false;
  if (field === 'refund' && /退款.{0,8}(?:进度查询|查询进度|进度跟踪)/u.test(clause)
      && !/(?:可|能|支持|允许).{0,8}退款(?!进度查询|查询进度)/u.test(clause)) return false;
  // A return-method restriction is not a return-permission decision.
  if (field === 'return' && /(?:退货|退换).{0,12}不支持.{0,8}(?:上门取件|取件方式|寄件|上门)/u.test(clause)
      && !/不支持.{0,6}(?:退货|退换)/u.test(clause)) return false;
  if (field === 'return' && /(?:支持\s*)?(?:(?:签收后|购买后)\s*)?(?:\d+(?:\.\d+)?|[一二三四五六七八九十]+)\s*(?:天|个工作日|月|年)\s*(?:内)?\s*(?:无理由)?\s*退货/u.test(clause)) return true;
  const conclusion = '(?:可(?:以)?|能|支持|允许|接受|提供|不(?:可|能|支持|允许|接受|提供)|禁止|限于|仅限)';
  const concreteRule = String.raw`(?:(?:\d+(?:\.\d+)?|[零一二两三四五六七八九十百]+)\s*(?:年|个月|月|天|(?:个)?工作日|(?:个)?小时)|终身|签收后|购买后)`;
  return new RegExp(`(?:${conclusion}).{0,12}(?:${subject})|(?:${subject}).{0,12}(?:${conclusion}|${concreteRule})`, 'u').test(clause);
}
function hasConcreteOperationalValue(field, clause) {
  const pending = /(?:正在调整|正在更新|更新中|正在核算|待确认|待补充|尚未公布|暂无|未确定|处理中)/u.test(clause);
  if (pending) return false;
  if (field === 'opening_hours') return /(?:营业时间|开门时间|关门时间|营业时段).{0,12}\d{1,2}(?::\d{2}|点半?|时)(?:.{0,8}\d{1,2}(?::\d{2}|点半?|时))?|\d{1,2}(?::\d{2}|点半?|时).{0,8}(?:营业|开门|关门)/u.test(clause);
  if (field === 'discount') return /(?:满\s*\d+(?:\.\d+)?\s*(?:元|件|人).{0,8}(?:减\s*\d+(?:\.\d+)?|折)|(?:立减|优惠|减免)\s*\d+(?:\.\d+)?\s*(?:元|%|折)|\d+(?:\.\d+)?\s*(?:折|%折)|第\s*\d+\s*件.{0,8}\d+(?:\.\d+)?\s*折)/u.test(clause);
  if (field === 'cost') return /(?:成本|采购价|进货价).{0,12}\d+(?:\.\d+)?\s*(?:元|人民币|美元|美金|¥|\$)|\d+(?:\.\d+)?\s*(?:元|人民币|美元|美金|¥|\$).{0,12}(?:成本|采购价|进货价)/u.test(clause);
  return true;
}
function hasOperationalTime(fact, field) {
  const quantity = '(?:\\d+|[零一二两三四五六七八九十百]+)';
  const hasTime = /(?:20\d{2}年(?:\d{1,2}月(?:\d{1,2}[日号])?)?|\d{1,2}月(?:\d{1,2}[日号])?|周[一二三四五六日天]|(?:\d+|[零一二两三四五六七八九十百]+)(?:个)?(?:小时|工作日|天|周|月)(?:内|后|前)?|当天|次日)/u.test(fact);
  const hasEvent = field === 'dispatch' ? /(?:发货|寄出|出库)/u.test(fact) : /(?:配送|到货|送达)/u.test(fact);
  if (hasNegatedEventTime(fact, field)) return false;
  if (field === 'refund') return fact.split(/[，,。；;]/u).some(part => /(?:到账|退回(?:至|到)?原(?:支付)?账户|退款到账)/u.test(part)
    && (new RegExp(`${quantity}(?:个)?(?:小时|工作日|天|周|月)(?:内|后)?`, 'u').test(part) || /20\d{2}年\d{1,2}月\d{1,2}[日号]?|\d{1,2}月\d{1,2}[日号]/u.test(part)));
  return hasTime && hasEvent && !/(?:政策|页面|规则).{0,8}(?:已更新|更新中|维护中)/u.test(fact);
}
function hasNegatedEventTime(clause, field) {
  if (field === 'dispatch' && /(?:发货|寄出|出库)前[^。；;，,]{0,20}(?:退款|退货|换货)/u.test(clause)) return true;
  if (field === 'dispatch' && /(?:发货|寄出|出库)后[^。；;，,]{0,16}(?:到货|送达|配送)/u.test(clause)) return true;
  const event = field === 'schedule' ? '(?:上线|发布|推出|开放|开售|发售)' : field === 'dispatch' ? '(?:发货|寄出|出库)' : field === 'delivery' ? '(?:配送|到货|送达)' : '(?:退款|退回|到账)';
  const time = String.raw`(?:20\d{2}年(?:\d{1,2}月(?:\d{1,2}[日号])?)?|\d{1,2}月(?:\d{1,2}[日号])?|周[一二三四五六日天]|\d+(?:个)?(?:小时|工作日|天|周|月)(?:内|后|前)?|当天|次日)`;
  const negative = '(?:不会|不再|不在|并非|不是|未能|未|没有|尚不能|不能|无法|禁止|尚未|暂不|不予)';
  return new RegExp(`${negative}.{0,18}(?:${time}.{0,12})?${event}|${event}.{0,10}${negative}`, 'u').test(clause);
}
function hasUnresolvedConclusion(clause) {
  // “预计”“暂定” describe an intention, not an approved current
  // fact.  Treat them like “可能” so dates and prices never become promises.
  // Alternatives are likewise not a publishable conclusion: selecting the
  // first number (or the positive stock state) would invent certainty.
  if (/(?:未经证实|尚未证实|未证实|不准确|不实|未经核实|未核实|没有证据|无证据).{0,16}(?:售价|价格|标价|成交价|单价|库存|有货|缺货|现货)|(?:售价|价格|标价|成交价|单价|库存|有货|缺货|现货).{0,16}(?:未经证实|尚未证实|未证实|不准确|不实|未经核实|未核实|没有证据|无证据)/u.test(clause)) return true;
  if (/(?:报名|参加|参与)方式.{0,10}(?:待公布|尚未公布|暂未公布|正在设计|设计中|已更新|更新中|待确认|尚未确认)/u.test(clause)) return true;
  if (/(?:颜色|色彩|色号|材质|型号|重量|尺寸|规格|功率)[^。；;，,]{0,18}(?:或|或者|\/)[^。；;，,]{1,18}/u.test(clause)) return true;
  if (/(?:售价|价格|标价|成交价|单价)[^。；;，,]{0,16}\d+(?:\.\d+)?\s*(?:元|人民币|美元|美金|欧元|EUR|€|¥|\$)[^。；;，,]{0,8}(?:或|或者|\/)[^。；;，,]{0,8}\d+(?:\.\d+)?\s*(?:元|人民币|美元|美金|欧元|EUR|€|¥|\$)|(?:有货|无货|缺货|售罄|有库存|无库存|没有库存)[^。；;，,]{0,8}(?:或|或者|\/)[^。；;，,]{0,8}(?:有货|无货|缺货|售罄|有库存|无库存|没有库存)/u.test(clause)) return true;
  return /(?:可能|也许|或许|据说|传闻|有望|估计|预计|应该|打算|拟(?:于|定)?|暂定|(?:大约|大概|约|接近)\s*(?:\d|[零一二两三四五六七八九十百])|\d+(?:\.\d+)?\s*(?:年|个月|月|天|小时)\s*(?:左右|上下)|(?:\d+(?:\.\d+)?|[零一二两三四五六七八九十百]+)\s*(?:元|人民币|美元|美金|¥|\$)?\s*(?:左右|上下)|原(?:来)?(?:保修|质保)\s*\d)|(?:未测试.{0,12}(?:是否|能否|支持)|(?:是否|能否).{0,12}(?:尚不清楚|不清楚|未知)|尚不清楚|不清楚|尚未确定|暂未确定|仍未确定|待确认|待定|尚未敲定|尚未公布|暂未公布|尚未确认|暂未确认|仍未确认|未确认|尚未验证|未验证|仍待验证|验证尚未完成|未经验证|尚未核实|未核实|有货状态未知|库存状态未知|现货状态未知|(?:有货|库存|现货|状态|情况|结论|结果).{0,6}(?:未知|待定|不明)|(?:未知|待定|不明).{0,6}(?:状态|情况|结论|结果)|(?:尚未|暂未|未).{0,8}(?:发布|公布|开放|开始|确认)|(?:有货|库存|现货|支持|兼容|适配).{0,8}(?:尚未|暂未|仍未|未)确认|正在核算|正在调整|正在整理|正在调查|调查中|核实中|(?:价格|成本|优惠|版本|时间|日期|规则|信息).{0,8}(?:待补充|待更新)|正在测试.{0,10}(?:是否|能否)|(?:仍在|还在|尚在|正在).{0,8}(?:测试|确认|核实)|(?:是否|能否).{0,12}(?:仍在|还在|尚在|正在)(?:测试|确认|核实)|(?:延期|推迟|取消|撤销|暂停|改期).{0,16}(?:未定|待定|尚未确定|新日期)|(?:新日期|新时间).{0,8}(?:未定|待定|尚未确定)|以[^。；;，,]{1,24}(?:确认为准|审核为准|审批为准|最终结果为准|为准)|最终(?:结论|价格|时间|日期|规则).{0,12}(?:待确认|以.{1,16}为准))/u.test(clause);
}
function unresolvedForField(field, question, clause, request = {}) {
  if (field === 'schedule' && /(?:待审批|尚待审批|审批中|尚在审批|仍在审批)/u.test(clause)) return true;
  // Approved delivery estimates are useful answers when the source explicitly
  // gives a concrete ETA. Preserve “预计” in the public wording, while still
  // rejecting a bare/unconfirmed estimate with no operational time.
  const scopedClause = field === 'delivery' && hasOperationalTime(clause, 'delivery')
    ? clause.replace(/预计(?=\s*(?:\d+(?:\.\d+)?|[零一二两三四五六七八九十百]+)\s*(?:个)?(?:小时|工作日|天|周|月))/u, '')
    : clause;
  const fieldPattern = fieldMatchers[field];
  const claimParts = scopedClause.split(/(?:但|不过|然而|但是|只是|并且|同时|且|[，,；;。])/u).map(part => part.trim()).filter(Boolean);
  const pendingTail = claimParts.at(-1) || '';
  if (claimParts.length > 1 && fieldPattern?.test(claimParts.slice(0, -1).join(' '))
      && hasUnresolvedConclusion(pendingTail)
      && !Object.values(fieldMatchers).some(pattern => pattern.test(pendingTail))) return true;
  const asksHistorical = /(?:昨天|昨日|前天|上周|上个月|去年|前年|曾经|过去|此前|之前|历史上|原先|过往|哪天|什么时候|何时)/u.test(question);
  const staleCurrentClaim = claimParts.some(part => fieldPattern?.test(part)
    && (/(?:去年|前年|曾经|过去|此前|之前|历史上|原先|过往).{0,12}(?:售价|价格|标价|成交价|单价|库存|有货|缺货|现货|支持|不支持|兼容|适配|保修|质保)|(?:售价|价格|标价|成交价|单价|库存|有货|缺货|现货|支持|不支持|兼容|适配|保修|质保).{0,12}(?:去年|前年|曾经|过去|此前|之前|历史上|原先|过往)/u.test(part)
      || (!asksHistorical && /(?:昨天|昨日|前天|上周|上个月).{0,12}(?:售价|价格|标价|成交价|单价|库存|有货|缺货|现货|支持|不支持|兼容|适配|保修|质保)|(?:售价|价格|标价|成交价|单价|库存|有货|缺货|现货|支持|不支持|兼容|适配|保修|质保).{0,12}(?:昨天|昨日|前天|上周|上个月)/u.test(part))));
  if (staleCurrentClaim || (fieldPattern?.test(scopedClause) && /(?:已撤回|被撤回|撤销|已作废|已失效|不再有效|已过期)/u.test(scopedClause))) return true;
  if (!hasUnresolvedConclusion(scopedClause)) return false;
  let scope = fieldMatchers[field];
  if (field === 'product_attribute') {
    const kind = request.attributeKind || question;
    scope = /颜色|色彩|色号/u.test(kind) ? /颜色|色彩|色号|红色|蓝色|黑色|白色|绿色|黄色|紫色|粉色|灰色|米色|棕色|橙色/u
      : /材质/u.test(kind) ? /材质|棉|麻|丝|羊毛|皮革|真皮|木|竹|玻璃|陶瓷|金属|塑料|尼龙|聚酯/u
        : /型号/u.test(kind) ? /型号/u : /重量/u.test(kind) ? /重量/u : /尺寸|规格/u.test(kind) ? /尺寸|规格|长|宽|高|直径|厚度/u : scope;
  }
  if (!scope) return hasUnresolvedConclusion(clause);
  const parts = scopedClause.split(/(?:但|不过|然而|但是|只是|且|并且|同时|[，,；;。])/u).map(part => part.trim()).filter(Boolean);
  const relevant = parts.filter(part => scope.test(part));
  if (relevant.length) return relevant.some(part => hasUnresolvedConclusion(part));
  const otherTypedField = parts.some(part => Object.entries(fieldMatchers).some(([candidate, pattern]) => candidate !== field && pattern.test(part)));
  const otherAttributeFacet = field === 'product_attribute' && parts.some(part => /材质|颜色|色彩|色号|型号|功率|重量|尺寸|规格/u.test(part)
    && !scope.test(part));
  return otherTypedField || otherAttributeFacet ? false : hasUnresolvedConclusion(scopedClause);
}
function hasConcreteUsage(clause) {
  if (/(?:详见|请查看|查看官网|页面已更新|方法已更新|政策已更新|使用方法暂无|步骤待补充)/u.test(clause)) return false;
  return /(?:先|首先|第一步|第\d+步|打开|点击|长按|按住|输入|选择|进入|切换|连接|设置|保存|上传|下载|拖动|滑动|扫码|扫描|登录|启动|安装|运行|导入|导出|复制|粘贴|确认|提交|添加|删除|修改|填写|搜索).{0,24}(?:再|然后|即可|就能|完成|进入|选择|打开|保存|点击|设置|输入|提交|导入|运行|启动|使用|连接|配对|查看|得到|直到|并|后|秒|分钟|页面|按钮|菜单|文件|设备|应用|账号|账户|商品|功能|结果)|(?:使用步骤|操作步骤|使用方法)\s*(?:为|是|：|:).{2,}/u.test(clause);
}
function hasVersionConclusion(clause) {
  // “版本信息正在整理” identifies the topic but supplies no usable version.
  // Accept a concrete version token or an explicit labelled version value.
  if (/(?:正在整理|待确认|尚未|未公布|暂无|待补充).{0,10}(?:版本|信息)|(?:版本|信息).{0,10}(?:正在整理|待确认|尚未|未公布|暂无|待补充)/u.test(clause)) return false;
  return /\bv\d+(?:\.\d+)*\b/iu.test(clause)
    || /\b\d+(?:\.\d+)+\s*版本/iu.test(clause)
    || /版本\s*(?:为|是|：|:)\s*(?!信息(?:正在整理|待确认|尚未|未公布|暂无|待补充))[^。；;，,]{1,24}/u.test(clause)
    || /(?:适用(?:于)?|仅限|支持)\s*[^。；;，,]{1,24}(?:版|版本)/u.test(clause);
}
function labeledAttributeValue(kind, fact) {
  const label = /颜色|色彩|色号/u.test(kind) ? '(?:颜色|色彩|色号)' : /材质/u.test(kind) ? '材质' : '';
  if (!label) return '';
  const match = new RegExp(`${label}\\s*(?:为|是|：|:)\\s*([^。；;，,]{1,24})`, 'u').exec(fact);
  return match?.[1]?.trim() || '';
}
function correctedAttributeValue(kind, fact) {
  const value = /颜色|色彩|色号/u.test(kind)
    ? '(?:深蓝|浅蓝|红|蓝|黑|白|绿|黄|紫|粉|灰|米|棕|橙)(?:色|款|版)?'
    : /材质/u.test(kind)
      ? '(?:不锈钢|铝合金|人造革|真皮|羊毛|塑料|树脂|尼龙|聚酯|亚克力|玻璃|陶瓷|金属|皮革|棉|麻|丝|木|竹)'
      : /重量/u.test(kind)
        ? '(?:\\d+(?:\\.\\d+)?|[零一二两三四五六七八九十百]+)\\s*(?:g|kg|克|千克)'
        : /尺寸|规格/u.test(kind)
          ? '(?:\\d+(?:\\.\\d+)?|[零一二两三四五六七八九十百]+)\\s*(?:毫米|mm|厘米|cm|米|m|英寸|寸|GB|TB|W|瓦|ml|mL|升|L)'
          : /型号/u.test(kind) ? '[A-Za-z0-9][A-Za-z0-9._-]{0,24}'
            : /功率/u.test(kind) ? '\\d+(?:\\.\\d+)?\\s*(?:W|瓦)' : '';
  if (!value) return null;
  return new RegExp(`(?:更正为|已更正为|改为|实际(?:是|为)?|应为|而是|现在(?:是|为)?)\\s*(${value})`, 'iu').exec(fact)?.[1] || null;
}
function hasConcreteAttributeValue(question, clause) {
  // Attributes need values, not qualitative filler such as “颜色很好看”.
  if (/颜色|色彩|色号/u.test(question)) return Boolean(labeledAttributeValue(question, clause)) || /(?:红|蓝|黑|白|绿|黄|紫|粉|灰|米|棕|橙)(?:色|款|版)|金色|银色|透明|深色|浅色/u.test(clause);
  if (/材质/u.test(question)) return Boolean(labeledAttributeValue(question, clause)) || /(?:材质\s*(?:为|是|：|:)?\s*)?(?:棉|麻|丝|羊毛|皮革|真皮|人造革|木|竹|玻璃|陶瓷|金属|不锈钢|铝合金|塑料|树脂|尼龙|聚酯|亚克力)/u.test(clause);
  if (/型号/u.test(question)) return /型号\s*(?:为|是|：|:)?\s*[A-Za-z0-9][A-Za-z0-9._ -]{0,30}/u.test(clause);
  if (/功率/u.test(question)) return /(?:功率\s*(?:为|是|：|:)?\s*)?\d+(?:\.\d+)?\s*(?:W|瓦)/iu.test(clause);
  if (/重量/u.test(question)) return /重量.{0,6}\d+(?:\.\d+)?\s*(?:g|kg|克|千克)|\d+(?:\.\d+)?\s*(?:g|kg|克|千克).{0,6}重量/iu.test(clause);
  if (/尺寸|规格/u.test(question)) return /(?:尺寸|规格|长|宽|高|直径|厚度).{0,8}\d+(?:\.\d+)?\s*(?:毫米|mm|厘米|cm|米|m|英寸|寸|GB|TB|W|瓦|ml|mL|升|L)|\d+(?:\.\d+)?\s*(?:毫米|mm|厘米|cm|米|m|英寸|寸|GB|TB|W|瓦|ml|mL|升|L).{0,8}(?:尺寸|规格|长|宽|高|直径|厚度)/iu.test(clause);
  return true;
}
function deliveryRegionValue(fact) {
  // Exclusion-only notes do not establish the included delivery footprint.
  if (/(?:配送|送达|覆盖).{0,10}(?:不包括|不包含|不含|排除|除外|不配送|不送达)/u.test(fact)) return null;
  const match = /(?:仅配送|只配送|配送范围|配送地区|配送区域|送达范围|送达地区|配送到|配送至|送达|配送|覆盖)(?:为|是|覆盖|到|至)?\s*([^，,。；;]{1,24})/u.exec(fact);
  if (!match) return null;
  const value = match[1].replace(/(?:地区|区域|范围)$/u, '').trim();
  return value ? `${/(?:仅配送|只配送)/u.test(match[0]) || /(?:仅|只)\s*配送/u.test(fact.slice(Math.max(0, match.index - 2), match.index + match[0].length)) ? '仅:' : ''}${value}` : null;
}
function deliveryRegionTarget(question) {
  const target = /(?:配送到|送到|配送至)\s*([\p{Script=Han}]{2,8}?)(?:吗|呢|呀|啊)?$/u.exec(question.replace(/[？?。！!]$/u, '').trim())?.[1] || '';
  return /^(?:哪些|什么|哪里|哪儿)/u.test(target) ? '' : target;
}
function directAnswerValue(question, fact) {
  const normalized = question.replace(/[？?。！!]/gu, '').trim();
  const subject = /^(.*?)(?:是|为)?(?:什么|多少|几|谁|哪位|哪里|哪儿|哪个|哪些)(?:内容|信息|主题|嘉宾)?$/u.exec(normalized)?.[1]?.trim();
  if (!subject || subject.length < 2) return null;
  const escaped = subject.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const answer = new RegExp(`${escaped}\\s*(?:是|为|：|:)\\s*([^。；;，,]{1,80})`, 'u').exec(fact)?.[1]?.trim();
  return answer || null;
}
function answerSignature(request, fact, question) {
  const field=request.field;
  fact = latestCorrectedAssertion(fact, field, question, request);
  const facetQuestions = {
    delivery_region: '配送范围有哪些地区？', delivery_time: '预计什么时候到货？',
    return_window: '退货期限是多久？', return_shipping: '退货运费由谁承担？',
    refund_time: '退款什么时候到账？', refund_destination: '退款会退到哪里？',
    warranty_scope: '保修范围是什么？', warranty_duration: '保修期限是多久？'
  };
  if (request.facet && facetQuestions[request.facet]) question = `${request.label || ''}${facetQuestions[request.facet]}`;
  if (field === 'direct_answer') {
    const normalizedQuestion = question.replace(/[？?。！!]/gu, '').trim();
    const existence = /^(.*?)(?:有没有|有)([^，,。；;?？]+?)(?:吗)?$/u.exec(normalizedQuestion);
    if (existence && existence[1].trim().length >= 2 && fact.includes(existence[1].trim()) && fact.includes(existence[2].trim())) {
      return /(?:没有|并无|不存在|不提供|不含|未安排)/u.test(fact) ? 'negative' : 'positive';
    }
    if (bookingIntent(question) === 'make_booking' && bookingIntent(fact) === 'make_booking') {
      return /(?:不可以|不可|不支持|不能|不接受|不允许).{0,8}(?:预约|预订)|(?:预约|预订).{0,8}(?:不可以|不可|不支持|不能|不接受|不允许)/u.test(fact) ? 'negative' : 'positive';
    }
    if (/(?:安全吗|是否安全)/u.test(question)) {
      if (/(?:不安全|存在.{0,6}(?:安全风险|安全隐患))/u.test(fact)) return 'negative';
      if (/(?:通过|符合|达到|获得).{0,8}(?:安全(?:测试|认证|标准)|认证)|(?:安全测试|安全认证|安全标准).{0,8}(?:通过|符合|达到)/u.test(fact) && !/安全库存/u.test(fact)) return 'positive';
      return null;
    }
    if (/(?:嘉宾是谁|哪位嘉宾|谁是嘉宾|嘉宾是哪位)/u.test(question)) return (fact.match(/(?:嘉宾|主讲人)(?:是|为|：|:)\s*([\p{Script=Han}]{2,8}(?:、[\p{Script=Han}]{2,8})?)/u)||[])[1]||null;
    if (/(?:持续多久|时长多久|时长是多少|多长时间)/u.test(question)) return (fact.match(/(?:时长|持续时间|持续).{0,8}((?:\d+(?:\.\d+)?|[一二三四五六七八九十]+)\s*(?:分钟|小时|天|周))|((?:\d+(?:\.\d+)?|[一二三四五六七八九十]+)\s*(?:分钟|小时|天|周)).{0,8}(?:时长|持续)/u)||[]).slice(1).find(Boolean)||null;
    if (/(?:几节|多少节|几章|多少章)/u.test(question)) return (fact.match(/(?:\d+|[一二三四五六七八九十]+)\s*(?:节|章)/u)||[])[0]||null;
    if (/(?:几种|多少种|几类|多少类)/u.test(question)) return (fact.match(/(?:\d+|[一二三四五六七八九十]+)\s*(?:种|类)/u)||[])[0]||null;
    return directAnswerValue(question, fact);
  }
  if (field === 'refund' && /(?:失败|原因|为什么|因何)/u.test(question)) return (fact.match(/(?:因为|由于|原因是|失败是|导致|造成)\s*([^，,。；;]{2,24})/u)||[])[1]?.trim()||null;
  if(field==='price') {
    const priceText = currentPriceText(fact);
    const range = /(?:售价|价格|标价|成交价|单价)\s*(?:为|是|：|:)?\s*(\d+(?:\.\d+)?)\s*(元|人民币|美元|美金|欧元|EUR|€|¥|\$)\s*(?:至|到|—|–|~|～|-)\s*(\d+(?:\.\d+)?)\s*\2/u.exec(priceText);
    if (range) return `range:${range[1]}:${range[3]}:${range[2]}`;
    return [...priceText.matchAll(/(?:售价|价格|标价|成交价|单价)\s*(?:为|是|：|:)?\s*(\d+(?:\.\d+)?)\s*(元|人民币|美元|美金|欧元|EUR|€|¥|\$)|(\d+(?:\.\d+)?)\s*(元|人民币|美元|美金|欧元|EUR|€|¥|\$)[^。；;]{0,12}?(?:售价|价格|标价|成交价|单价)/gu)].map(item=>`${item[1]||item[3]}:${item[2]||item[4]}`).join('|')||null;
  }
  if(field==='inventory')return inventoryState(fact);
  if (['dispatch','delivery','refund'].includes(field)) {
    const event = field === 'dispatch' ? /(?:发货|寄出|出库)/u : field === 'delivery' ? /(?:配送|到货|送达)/u : /(?:退款|退回|到账)/u;
    const fullDate = fact.match(/20\d{2}年\d{1,2}月\d{1,2}[日号]?|\d{1,2}月\d{1,2}[日号]/u)?.[0];
    if (fullDate && event.test(fact)) return fullDate;
  }
  if (field === 'cost') return (fact.match(/(?:成本|采购价|进货价)\s*(?:为|是|：|:)?\s*\d+(?:\.\d+)?\s*(?:元|人民币|美元|美金|¥|\$)|\d+(?:\.\d+)?\s*(?:元|人民币|美元|美金|¥|\$)\s*(?:成本|采购价|进货价)/u)||[])[0]||null;
  if (field === 'discount') return (fact.match(/第\s*\d+\s*件.{0,8}\d+(?:\.\d+)?\s*折/u)||fact.match(/(?:满\s*\d+(?:\.\d+)?\s*(?:元|件|人).{0,8}(?:减\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?折)|(?:立减|优惠|减免)\s*\d+(?:\.\d+)?\s*(?:元|%|折)|\d+(?:\.\d+)?\s*(?:折|%折))/u)||[])[0]?.replace(/\s+/gu,'')||null;
  if(field==='schedule'){
    const relative=(fact.match(/(?:\d+(?:\.\d+)?|[一二三四五六七八九十]+)\s*(?:个)?(?:小时|工作日|天|周|月)(?:内|后|前)/u)||[])[0];
    if (relative) return relative.replace(/\s+/gu,'');
    const date=(fact.match(/(?:20\d{2}年(?:\d{1,2}月(?:\d{1,2}[日号])?)?|\d{1,2}月(?:\d{1,2}[日号])?|周[一二三四五六日天]|(?:今年|明年|本月|下月|月底|上旬|中旬|下旬|第一季度|第二季度|第三季度|第四季度))/u)||[])[0]||'';
    const times=(fact.match(/\d{1,2}:\d{2}|\d{1,2}点(?:半)?/gu)||[]).join('|');
    return date || times ? `${date}@${times}` : null;
  }
  if(field==='version') return (fact.match(/\bv\d+(?:\.\d+)*\b|版本\s*(?:为|是|号)?\s*\d+(?:\.\d+)*|\b\d+(?:\.\d+)+\s*版本/giu)||[]).map(value => {
    const normalized = value.replace(/\s+/gu,'').toLowerCase();
    // Keep v2 and “版本2” in the same value namespace.  This makes the
    // signature describe the asserted version, rather than its prose form.
    return normalized.replace(/^版本(?:为|是|号)?/u, 'v').replace(/版本$/u, '');
  }).join('|')||null;
  if(field==='opening_hours')return (fact.match(/\d{1,2}(?::\d{2}|点半?|时)/gu)||[]).join('|')||null;
  if(field==='delivery' && /(?:配送(?:哪些|什么)地区|哪些地区|什么地区|覆盖范围|配送范围|配送地区|送到哪里|配送到哪里)/u.test(question))return deliveryRegionValue(fact);
  if (['dispatch','delivery'].includes(field)) {
    const event = field === 'dispatch' ? /(?:发货|寄出|出库)/u : /(?:配送|到货|送达)/u;
    const fullDate = fact.match(/20\d{2}年\d{1,2}月\d{1,2}[日号]?|\d{1,2}月\d{1,2}[日号]/u)?.[0];
    if (fullDate && event.test(fact)) return fullDate;
  }
  if(['dispatch','delivery','refund'].includes(field) && /(?:多久|多长|几天|几个小时|多长时间|几小时|到账|发货|到货|送达|配送)/u.test(question))return (fact.match(/(?:\d+(?:\.\d+)?|[零一二两三四五六七八九十百]+)\s*(?:个)?(?:小时|工作日|天|周|月)(?:内|后|前)?|当天|次日/u)||[])[0]||null;
  if(field==='product_attribute'){
    const kind=request.attributeKind||question;
    if(/颜色|色彩|色号/u.test(kind))return correctedAttributeValue(kind,fact)||labeledAttributeValue(kind,fact)|| (fact.match(/深蓝|浅蓝|红色|蓝色|黑色|白色|绿色|黄色|紫色|粉色|灰色|米色|棕色|橙色|红|蓝|黑|白|绿|黄|紫|粉|灰|米|棕|橙/gu)||[]).join('|')||null;
    if(/材质/u.test(kind))return labeledAttributeValue(kind,fact)|| (fact.match(/不锈钢|铝合金|人造革|真皮|羊毛|塑料|树脂|尼龙|聚酯|亚克力|玻璃|陶瓷|金属|皮革|棉|麻|丝|木|竹/gu)||[]).join('|')||null;
    if(/型号/u.test(kind))return `型号:${(fact.match(/型号\s*(?:为|是|：|:)?\s*[A-Za-z][A-Za-z0-9._-]{0,24}/giu)||[]).join('|')}`;
    if(/功率/u.test(kind))return `功率:${(fact.match(/(?:功率\s*(?:为|是|：|:)?\s*)?\d+(?:\.\d+)?\s*(?:W|瓦)/giu)||[]).join('|')}`;
    const dimension=/重量/u.test(fact)?'weight':/(?:尺寸|规格|长|宽|高|直径|厚度)/u.test(fact)?'size':'';
    if (dimension === 'size') {
      const composite = fact.match(/\d+(?:\.\d+)?\s*(?:×|x|X|乘)\s*\d+(?:\.\d+)?(?:\s*(?:×|x|X|乘)\s*\d+(?:\.\d+)?)?\s*(?:毫米|mm|厘米|cm|米|m|英寸|寸)/iu)?.[0];
      if (composite) return `size:${composite.replace(/\s+/gu,'').replace(/[xX乘]/gu,'×').toLowerCase()}`;
    }
    return dimension?`${dimension}:${(fact.match(/\d+(?:\.\d+)?\s*(?:g|kg|克|千克|毫米|mm|厘米|cm|米|m|英寸|寸|GB|TB|W|瓦|ml|mL|升|L)/giu)||[]).join('|')}`:null;
  }
  if(field==='warranty'&&request.facet!=='warranty_scope'&&/(?:多久|几年|几个月|多长|期限|时长)/u.test(question))return (fact.match(/(?:\d+(?:\.\d+)?|[零一二两三四五六七八九十百]+)\s*(?:年|个月|月|天|小时)|终身|长期有效/gu)||[]).join('|')||null;
  if(field==='compatibility'){
    const targets=request.compatibilityTarget?[request.compatibilityTarget]:compatibilityTargets(question);
    const requestedTargets = targets.length ? targets : compatibilityTargets(fact);
    const parts = fact.split(/(?:但|不过|然而|但是|却|[，,；;。])/u);
    const signatures = requestedTargets.flatMap(target => {
      const escaped = target.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
      const mentions = parts.filter(part => new RegExp(escaped, 'iu').test(part)
        && /(?:兼容|适配|支持|不支持|不兼容|不适配|无法兼容|无法适配)/u.test(part));
      const negativePattern = new RegExp(`(?:不支持|不兼容|不适配|无法兼容|无法适配)[^，,。；;]{0,12}${escaped}|${escaped}[^，,。；;]{0,12}(?:不支持|不兼容|不适配|无法兼容|无法适配)`, 'iu');
      const statuses = mentions.map(part => negativePattern.test(part) ? 'negative' : 'positive');
      return statuses.length ? [`${new Set(statuses).size > 1 ? 'conflict' : statuses[0]}:${target.toLowerCase()}`] : [];
    });
    return signatures.length ? signatures.join('|') : null;
  }
  if(field==='refund' && isRefundDestinationQuestion(question)){
    const destination=/(?:原路退回(?:至|到)?|退回(?:至|到)?|退款至|退到)\s*(原支付账户|原账户|支付账户|银行卡|支付宝|微信|账户|钱包|卡号)/u.exec(fact);
    return destination?.[1]||null;
  }
  if(field==='return' && /(?:运费|邮费|谁(?:来|要|需)?承担|由谁|谁出)/u.test(question)){
    const payer=/(商家|卖家|买家|顾客|消费者|平台)\s*(?:承担|支付|负责(?:承担|支付|运费|邮费|费用)?|出(?:运费|邮费|费用))/u.exec(fact);
    return payer?.[0]||null;
  }
  if(field==='warranty'&&(request.facet === 'warranty_scope' || (!request.facet && request.warrantyScope))){
    const scope=/(?:保修|质保)?范围\s*(?:为|是|覆盖|包括|涵盖)?\s*([^。；;，,]{1,36})/u.exec(fact)?.[1]?.trim();
    return scope?`scope:${scope}`:null;
  }
  if(['return','exchange'].includes(field)){
    if (/(?:多久|多长|几天|多少天|期限|时长)/u.test(question)) {
      const deadline=/(?:换货|退货|退换)\s*(?:期限|期)\s*(?:为|是)?\s*(?:签收后|购买后)?\s*(?:\d+(?:\.\d+)?|[一二三四五六七八九十]+)\s*(?:天|个工作日|月|年)(?:\s*(?:内|无理由))?|(?:(?:签收后|购买后)\s*)?(?:\d+(?:\.\d+)?|[一二三四五六七八九十]+)\s*(?:天|个工作日|月|年)(?:\s*(?:内)?\s*(?:无理由)?)?\s*(?:退货|退换|换货)/u.exec(fact);
      return deadline?.[0]||null;
    }
    const status=hasPolicyConclusion(field,fact)?(/(?:不支持|不允许|不接受|不可|不能|禁止)/u.test(fact)?'negative':'positive'):'';
    return status||null;
  }
  if(['return','refund','exchange','warranty','after_sales'].includes(field)){
    const status=hasPolicyConclusion(field,fact)?(/(?:不支持|不允许|不接受|不可|不能|禁止)/u.test(fact)?'negative':'positive'):'';
    return status||null;
  }
  return null;
}
function hasInternalConflict(request, fact, question) {
  if (latestCorrectedAssertion(fact, request.field, question, request) !== fact) return false;
  if (request.field === 'schedule' && hasApprovedScheduleDate(fact)
      && /(?:原计划|原定|计划于|计划在|预计于|预计在|曾计划)/u.test(fact)) return false;
  if (request.field === 'version' && /(?:适用于|支持)\s*v?\d+(?:\.\d+)*[^。；;，,]{0,16}，?\s*(?:但|不过|，|,)?\s*(?:不适用于|不支持)\s*v?\d+(?:\.\d+)*/iu.test(fact)) return false;
  if (request.field === 'price' && /(?:\d+(?:\.\d+)?\s*(?:元|人民币|美元|美金|¥|\$))\s*(?:或|或者|还是)\s*(?:\d+(?:\.\d+)?\s*(?:元|人民币|美元|美金|¥|\$))/u.test(fact)) return true;
  if (request.field === 'inventory' && /(?:有货|有库存|现货|缺货|无货|没货|无库存|售罄|售完)[^。；;]{0,12}(?:或|或者|还是)[^。；;]{0,12}(?:有货|有库存|现货|缺货|无货|没货|无库存|售罄|售完)/u.test(fact)) return true;
  // A negated old value followed by an explicit correction is authoritative,
  // not an unresolved contradiction.
  if (/(?:不是|并非|不为|原为).{0,18}(?:而是|更正为|后来更正为|改为|实际改为|实际原因是|真正原因是)/u.test(fact)) return false;
  const sentences = fact.split(/[。；;]/u).map(sentence => sentence.trim()).filter(Boolean);
  const subject = request.label || entityMentions(fact).find(entity => entity.kind !== 'condition')?.label || '';
  return sentences.some(sentence => {
    const sentenceEntities = entityIds(sentence);
    if (request.entity && sentenceEntities.size && ![...sentenceEntities].some(id => sameEntityId(id, request.entity))) return false;
    // A source can state two incompatible values without a contrast word
    // ("售价100元，售价200元").  Treat comma-separated assertions as
    // separate candidates too; only distinct, field-specific signatures can
    // trigger a conflict, so descriptive comma phrases remain harmless.
    const parts = (request.field === 'compatibility'
      ? sentence.split(/(?:，|,)?(?:但|不过|然而|但是|却)/u)
      : sentence.split(/(?:，|,)?(?:但|不过|然而|但是|却)|[，,]/u)
    ).map(part => part.trim()).filter(Boolean);
    const signatures = parts.map(part => {
      const partEntities = entityIds(part);
      if (request.entity && partEntities.size && ![...partEntities].some(id => sameEntityId(id, request.entity))) return null;
      const scoped = request.entity && !partEntities.size && subject ? `${subject}${part}` : part;
      return answerSignature(request, scoped, question);
    }).filter(Boolean);
    if (request.field === 'warranty' && /(?:多久|多长|几年|几个月|期限|时长)/u.test(question)) {
      const scopes = parts.map(warrantyDurationScope);
      if (scopes.length > 1 && scopes.every(Boolean) && new Set(scopes).size === scopes.length) return false;
    }
    if (request.field === 'compatibility') {
      const targets = request.compatibilityTarget ? [request.compatibilityTarget] : compatibilityTargets(question);
      if (targets.some(target => {
        const escaped = target.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
        return new RegExp(`(?:支持|兼容|适配)\\s*${escaped}[^。；;]{0,32}(?:不支持|不兼容|不适配|无法兼容|无法适配)\\s*${escaped}|(?:不支持|不兼容|不适配|无法兼容|无法适配)\\s*${escaped}[^。；;]{0,32}(?:支持|兼容|适配)\\s*${escaped}`, 'iu').test(sentence);
      })) return true;
      // “支持 Android，不支持 iOS” supplies two compatible, scoped facts.
      // It conflicts only when the same target has opposing polarities.
      return signatures.some((left, index) => signatures.slice(index + 1).some(right => {
        const [leftState, leftTargets = ''] = left.split(':');
        const [rightState, rightTargets = ''] = right.split(':');
        if (leftState === rightState) return false;
        const rightTargetSet = new Set(rightTargets.split('|').filter(Boolean));
        return leftTargets.split('|').filter(Boolean).some(target => rightTargetSet.has(target));
      }));
    }
    return new Set(signatures).size > 1;
  });
}
function latestCorrectedAssertion(clause, field, question, request = {}) {
  const markers = [...clause.matchAll(/(?:后来更正为|更正为|后来改为|实际改为|改为)\s*/gu)];
  const marker = markers.at(-1);
  if (!marker) return clause;
  const prefix = clause.slice(0, marker.index);
  if (field === 'product_attribute') return clause;
  const signals = Object.entries(fieldMatchers).flatMap(([name, pattern]) => fieldMentions(prefix, name).map(signal => ({ field:name, end:signal.end })));
  signals.sort((left, right) => right.end - left.end);
  if (signals[0]?.field !== field) return clause;
  const value = clause.slice(marker.index + marker[0].length).trim().replace(/[。！？!?；;]+$/u, '');
  if (!value) return clause;
  if (field === 'inventory' && /^(?:0|零|〇|○)\s*(?:件|个|台|条|双|瓶|盒)?(?:库存)?$/u.test(value)) return '';
  const label = request.label || entityMentions(prefix).find(entity => entity.kind !== 'condition' && entity.kind !== 'variant')?.label || '';
  const scheduleEvent = /(开售|发售|上线|发布|推出|开放|举行|开课)/u.exec(prefix)?.[1] || '上线';
  const corrected = field === 'price' ? `${label}售价${value}`
    : field === 'inventory' ? `${label}库存剩余${value}`
      : field === 'schedule' ? `${label}将于${value}${/(?:开售|发售|上线|发布|推出|开放|举行|开课)/u.test(value) ? '' : scheduleEvent}`
        : field === 'dispatch' ? `${label}${value}`
          : field === 'refund' ? `${label}退款将在${value}` : '';
  return corrected || clause;
}
function hasRequestedSpecificValue(question, field, clause, request = {}) {
  const questionParts = question.split(/[？?。；;]/u);
  if (field === 'direct_answer' && /(?:嘉宾是谁|哪位嘉宾|谁是嘉宾|嘉宾是哪位)/u.test(question)
      && /(?:嘉宾|主讲人)(?:是|为|：|:)\s*[\p{Script=Han}]{2,8}\s*(?:或|或者)\s*[\p{Script=Han}]{2,8}/u.test(clause)) return false;
  const number = '(?:\\d+(?:\\.\\d+)?|[零一二两三四五六七八九十百]+)';
  if (field === 'inventory' && questionParts.some(part => /(?:库存|现货)(?:数量|还剩|剩余)?(?:是多少|多少|几件)|(?:有|还剩|剩余)多少(?:库存|件|个|台)|(?:现有|现在有|还有)(?:多少|几)(?:件|个|台)|还剩多少|剩余多少|还有多少/u.test(part))) return inventoryQuantity(clause) !== null;
  if (field === 'return' && /几天|多少天|多久|多长时间|期限/u.test(question)) return new RegExp(`(?:退货|退换)\\s*(?:期限|期)?\\s*(?:为|是|支持)?\\s*(?:(?:签收后|购买后)\\s*)?${number}\\s*(?:天|个工作日|月|年)|(?:签收后|购买后)?\\s*${number}\\s*(?:天|个工作日|月|年)\\s*(?:内)?\\s*(?:无理由)?\\s*(?:可|支持)?\\s*(?:退货|退换)`, 'u').test(clause);
  if (field === 'exchange' && /几天|多少天|多久|多长时间|期限/u.test(question)) return new RegExp(`(?:换货)\\s*(?:期限|期)\\s*(?:为|是)?\\s*(?:签收后|购买后)?\\s*${number}\\s*(?:天|个工作日|月|年)|(?:签收后|购买后)?\\s*${number}\\s*(?:天|个工作日|月|年)\\s*(?:内|可)?\\s*换货`, 'u').test(clause);
  if (field === 'refund' && isRefundDestinationQuestion(question)) {
    const destination=/(?:原路退回(?:至|到)?|退回(?:至|到)?|退款至|退到)\s*(原支付账户|原账户|支付账户|银行卡|支付宝|微信|账户|钱包|卡号)/u.exec(clause);
    return Boolean(destination) && !/(?:不|并非|不能|不会|无法)\s*$/u.test(clause.slice(0,destination.index));
  }
  if (field === 'warranty' && (request.facet === 'warranty_scope' || (!request.facet && request.warrantyScope))) return /(?:范围|包括|涵盖|覆盖)\s*(?:为|是)?\s*[\p{Script=Han}]{2,}(?:和|及|、[\p{Script=Han}]{2,})?/u.test(clause);
  if (['return','refund','exchange','warranty','after_sales'].includes(field) && /(?:哪里|在哪|哪儿|哪个(?:门店|网点|平台|页面)|如何办理)/u.test(question)) return /(?:门店|网点|服务中心|售后点|地址|官网|小程序|App|应用内|平台客服|线下柜台|线上客服)/iu.test(clause);
  if (field === 'delivery' && (/(?:配送(?:哪些|什么)地区|哪些地区|什么地区|覆盖范围|配送范围|配送地区|送到哪里|配送到哪里)/u.test(question) || deliveryRegionTarget(question))) {
    const value = deliveryRegionValue(clause);
    const target = deliveryRegionTarget(question);
    return Boolean(value && (!target || value.includes(target)));
  }
  return true;
}
function hasAffirmativeReturnPayer(clause) {
  const pattern=/(商家|卖家|买家|顾客|消费者|平台)\s*(?:承担|支付|负责(?:承担|支付|运费|邮费|费用)?|出(?:运费|邮费|费用))/gu;
  for(const match of clause.matchAll(pattern)){
    const before=clause.slice(Math.max(0,match.index-6),match.index);
    const after=clause.slice(match.index + match[0].length);
    if (/负责$/u.test(match[0]) && /^(?:说明|解释|补充|核实|处理|跟进)/u.test(after)) continue;
    const denied = /(?:不是由|并非由|不是|并非|不由|无需|不用|不需|也不|并不|同样不)\s*$/u.test(before)
      || /(?:商家|卖家|买家|顾客|消费者|平台)\s*(?:也不|不|并非|无需|不用|不需|同样不|并不).{0,6}(?:承担|支付|负责|出)/u.test(match[0]);
    if(!denied)return true;
  }
  return false;
}
function hasConcreteRefundReason(clause) {
  if (/(?:详见|请查看|查看|参见|官网|页面|联系客服|政策负责说明|原因待补充)/u.test(clause)) return false;
  if (/(?:实际原因是|真正原因是)\s*(?:因为|由于)?\s*(?:账户.{0,5}(?:异常|冻结)|余额不足|信息.{0,5}不符|资料.{0,5}(?:缺失|不全)|超时|系统错误|支付失败|库存不足|条件不符)/u.test(clause)) return true;
  if (/(?:不是|并非|不因|不是由于|并非由于)\s*(?:因为|由于)?/u.test(clause)
      && !/(?:但|不过|实际原因是|真正原因是|而是).{0,24}(?:因为|由于|原因是|账户.{0,5}(?:异常|冻结)|余额不足|信息.{0,5}不符|资料.{0,5}(?:缺失|不全)|超时|系统错误|支付失败|库存不足|条件不符)/u.test(clause)) return false;
  return /(?:因为|由于|原因是|失败是|导致|造成|账户.{0,5}(?:异常|冻结)|余额不足|信息.{0,5}不符|资料.{0,5}(?:缺失|不全)|超时|系统错误|支付失败|库存不足|条件不符)/u.test(clause);
}
function hasConcreteRefundDestination(clause) {
  const match = /(?:原路退回(?:至|到)?|退回(?:至|到)?|退款至|退到)\s*(原支付账户|原账户|支付账户|银行卡|支付宝|微信|账户|钱包|卡号)/u.exec(clause);
  return Boolean(match && !/(?:不|并非|不能|不会|无法)\s*$/u.test(clause.slice(0, match.index)));
}
function hasApprovedScheduleDate(text) {
  return /(?:最新|最终|正式|已获批|已批准|批准|核准|审定).{0,18}(?:上线|发布|推出|开放|开售|发售|发布日期|上线日期|日期|时间)|(?:上线|发布日期|上线日期).{0,10}(?:最新|最终|正式|已获批|已批准|批准|核准|审定)/u.test(text)
    && /(?:20\d{2}年(?:\d{1,2}月(?:\d{1,2}[日号])?)?|\d{1,2}月(?:\d{1,2}[日号])?|周[一二三四五六日天]|(?:今年|明年|本月|下月|月底|上旬|中旬|下旬)|\d+(?:个)?(?:天|工作日|周|月)(?:内|后|前)?)/u.test(text)
    && !lacksSchedule(text);
}
function isPlannedScheduleDate(text) {
  return /(?:原计划|原定|计划于|计划在|预计于|预计在|曾计划)/u.test(text)
    && /(?:20\d{2}年|\d{1,2}月|周[一二三四五六日天]|(?:今年|明年|本月|下月)|\d+(?:个)?(?:天|工作日|周|月))/u.test(text);
}
function invalidatedLater(field, later, question = '', request = null) {
  if (field === 'inventory') {
    // A correction with a concrete replacement is authoritative, while a
    // later pending status makes the earlier stock claim unusable.  Do not
    // let an old “有货/剩余 N 件” leak into a draft merely because the update
    // abbreviates “库存”.
    return /(?:后来|随后|之后|现已|最终)?\s*(?:更正为|后来更正为|改为|实际改为)\s*\d+\s*(?:件|个|台|条|双|瓶|盒)?|(?:库存|有货|现货|缺货|无货|售罄).{0,12}(?:待确认|尚未确定|未确认|暂不明确|仍在核实)|(?:待确认|尚未确定|未确认|暂不明确|仍在核实).{0,12}(?:库存|有货|现货|缺货|无货|售罄)/u.test(later);
  }
  if (field === 'direct_answer') {
    const topic = directQuestionTopic(question);
    return Boolean(topic && later.includes(topic) && hasUnresolvedConclusion(later));
  }
  if (field === 'schedule') return /(?:不会|不再|未计划|没有计划|取消|停止|不予).{0,14}(?:上线|发布|推出|开放|开售|发售)|(?:上线|发布|推出|开放|开售|发售).{0,12}(?:不会|不再|未计划|没有计划|取消|停止|不予)|(?:改期|延期|推迟|取消上线|取消开售|取消发售|不再按原计划|调整上线日期|调整开售日期|调整发售日期|(?:改为|更正为|后来改为).{0,16}(?:20\d{2}年|\d{1,2}月|明年|下月|\d+(?:个)?(?:小时|工作日|天|周|月)(?:内|后|前)?))/u.test(later);
  if (field === 'dispatch') return hasNegatedEventTime(later, 'dispatch') || /(?:后来|随后|更正为|后来更正为|实际改为|改为).{0,20}\d+(?:个)?(?:小时|工作日|天|周|月)(?:内|后|前)?.{0,12}(?:发货|寄出|出库)|(?:发货|寄出|出库).{0,12}(?:后来|随后|更正为|改为).{0,20}\d+(?:个)?(?:小时|工作日|天|周|月)(?:内|后|前)?/u.test(later);
  if (field === 'delivery') return hasNegatedEventTime(later, 'delivery') || /(?:后来|随后|更正为|后来更正为|实际改为|改为).{0,20}\d+(?:个)?(?:小时|工作日|天|周|月)(?:内|后|前)?.{0,12}(?:到货|送达|配送)|(?:到货|送达|配送).{0,12}(?:后来|随后|更正为|改为).{0,20}\d+(?:个)?(?:小时|工作日|天|周|月)(?:内|后|前)?/u.test(later);
  if (field === 'refund' && /(?:失败|原因|为什么|因何)/u.test(question)) return /(?:后来|现已|确认|实际)?\s*(?:不提供|不支持|不予|取消|撤销).{0,8}退款|退款.{0,8}(?:不提供|不支持|不予|取消|撤销)/u.test(later);
  if (field === 'refund' && /(?:到账|什么时候|何时|多久|几天|几小时)/u.test(question)) return hasNegatedEventTime(later, 'refund')
    || /(?:后来|随后|更正为|后来更正为|实际改为|改为).{0,20}\d+(?:个)?(?:小时|工作日|天|周|月)(?:内|后|前)?.{0,12}(?:退款|退回|到账)|(?:退款|退回|到账).{0,12}(?:后来|随后|更正为|改为).{0,20}\d+(?:个)?(?:小时|工作日|天|周|月)(?:内|后|前)?/u.test(later)
    || /(?:不提供|不支持|不予|取消|撤销).{0,8}退款|退款.{0,8}(?:不提供|不支持|不予|取消|撤销)/u.test(later);
  if (field === 'refund' && isRefundDestinationQuestion(question)) return /(?:不退回|不会退回|无法退回|退款去向待确认|退回账户待确认)/u.test(later);
  if (field === 'price') return /(?:更正为|后来更正|改为|实际改为)/u.test(later) && /\d+(?:\.\d+)?\s*(?:元|人民币|美元|美金|欧元|EUR|€|¥|\$)/u.test(later);
  if (field === 'compatibility') {
    const denied = /(?:不支持|不兼容|不适配|无法兼容|无法适配)/u.test(later);
    const asked = request?.compatibilityTarget ? [request.compatibilityTarget] : compatibilityTargets(question), stated = compatibilityTargets(later);
    if (denied && (!asked.length || !stated.length || asked.some(target => stated.includes(target)))) return true;
    // Keep an earlier broad conclusion from escaping a later restrictive tail.
    return /(?:但|不过|然而|但是|只是).{0,16}(?:仅限|只限|仅适用于|只适用于)/u.test(later)
      && (!asked.length || !stated.length || asked.some(target => stated.includes(target)));
  }
  if (['return','exchange','refund','warranty','after_sales'].includes(field)) {
    const expired = /(?:政策|规则|方案).{0,10}(?:已|已经|现已)?(?:失效|废止|取消|撤销|不再适用)|(?:已|已经|现已)(?:失效|废止|取消|撤销).{0,8}(?:政策|规则|方案)/u.test(later);
    const disabled = field === 'return' ? /(?:不支持|不允许|不接受|不能|不可).{0,8}(?:退货|退换)|(?:退货|退换).{0,8}(?:不支持|不允许|不接受|不能|不可)/u.test(later)
      : field === 'exchange' ? /(?:不支持|不允许|不接受|不能|不可).{0,8}换货|换货.{0,8}(?:不支持|不允许|不接受|不能|不可)/u.test(later)
      : field === 'refund' ? /(?:不提供|不支持|不予|取消|撤销).{0,8}退款|退款.{0,8}(?:不提供|不支持|不予|取消|撤销)/u.test(later)
      : field === 'warranty' ? /(?:不提供|不支持|不予|取消|撤销).{0,8}(?:保修|质保)|(?:保修|质保).{0,8}(?:不提供|不支持|不予|取消|撤销)/u.test(later)
      : /(?:不提供|不支持|不予|取消|撤销).{0,8}售后|售后.{0,8}(?:不提供|不支持|不予|取消|撤销)/u.test(later);
    return expired || disabled;
  }
  if (field === 'product_attribute') {
    const askedTargets = compatibilityTargets(question);
    const negatedCompatibility = /(?:不支持|不兼容|不适配|无法兼容|无法适配)/u.test(later);
    if (negatedCompatibility && askedTargets.length) return askedTargets.some(target => compatibilityTargets(later).includes(target));
    return /(?:更正为|已更正|改为|实际(?:是|为)?|应为|现在(?:是|为))\s*(?:深蓝|浅蓝|红|蓝|黑|白|绿|黄|紫|粉|灰|米|棕|橙)(?:色|款|版)?|(?:更正为|已更正|改为|实际(?:是|为)?|应为|现在(?:是|为))\s*(?:棉|麻|丝|羊毛|皮革|真皮|人造革|木|竹|玻璃|陶瓷|金属|不锈钢|铝合金|塑料|树脂|尼龙|聚酯|亚克力)|(?:更正为|已更正|改为|实际(?:是|为)?|应为|现在(?:是|为))\s*\d+(?:\.\d+)?\s*(?:g|kg|毫米|mm|厘米|cm|米|m|英寸|寸|GB|TB|W|瓦|ml|mL|升|L)/iu.test(later);
  }
  return false;
}
function hasNegatedRequestedValue(question, field, clause) {
  if (field === 'direct_answer') {
    const rejectedValue = /(?:时长|持续时间|主题|风格|难度|级别|等级|地点|位置|嘉宾|内容|型号|答案)\s*(?:不是|并非|不为|不等于|并不是)\s*[^，,。；;]{1,40}/u.test(clause);
    const suppliesCorrection = /(?:而是|实际为|实际上是|更正为|后来更正为|改为|应为|现在是)/u.test(clause);
    return rejectedValue && !suppliesCorrection;
  }
  if (field === 'cost') return /(?:成本|采购价|进货价)\s*(?:不是|并非|不为|不等于)\s*\d+(?:\.\d+)?\s*(?:元|人民币|美元|美金|¥|\$)|\d+(?:\.\d+)?\s*(?:元|人民币|美元|美金|¥|\$)\s*(?:不是|并非|不为|不等于).{0,8}(?:成本|采购价|进货价)/u.test(clause);
  if (field === 'product_attribute' && /尺寸|重量|规格/u.test(question)) return /(?:不是|并非|不为|不等于|没有|非)\s*\d+(?:\.\d+)?\s*(?:g|kg|毫米|mm|厘米|cm|米|m|英寸|寸|GB|TB|W|瓦|ml|mL|升|L)/iu.test(clause);
  if (field === 'product_attribute' && /颜色|色彩/u.test(question)) {
    const negative = /(?:颜色|色彩)?\s*(?:不是|并非|不为|不等于|没有|非)\s*(?:深蓝|浅蓝|红|蓝|黑|白|绿|黄|紫|粉|灰|米|棕|橙)(?:色|款|版)?/u.test(clause);
    const corrected = /(?:实际|更正为|改为|而是|应为|正确颜色(?:是|为)?).{0,12}(?:深蓝|浅蓝|红|蓝|黑|白|绿|黄|紫|粉|灰|米|棕|橙)(?:色|款|版)?/u.test(clause);
    return negative && !corrected;
  }
  if (field === 'product_attribute' && /材质/u.test(question)) {
    const negative = /(?:材质)?\s*(?:不是|并非|不为|不等于|没有|非)\s*(?:棉|麻|丝|羊毛|皮革|真皮|人造革|木|竹|玻璃|陶瓷|金属|不锈钢|铝合金|塑料|树脂|尼龙|聚酯|亚克力)/u.test(clause);
    const corrected = /(?:实际|更正为|改为|而是|应为|正确材质).{0,12}(?:棉|麻|丝|羊毛|皮革|真皮|人造革|木|竹|玻璃|陶瓷|金属|不锈钢|铝合金|塑料|树脂|尼龙|聚酯|亚克力)/u.test(clause);
    return negative && !corrected;
  }
  if (field === 'version') {
    const negatedVersions = [...clause.matchAll(/(?:不适用于|不支持|不兼容|不适配)\s*(v?\d+(?:\.\d+)*)/giu)].map(match => match[1].toLowerCase());
    const affirmedVersions = [...clause.matchAll(/(?:适用于|支持|兼容|版本为|版本是)\s*(v?\d+(?:\.\d+)*)/giu)].map(match => match[1].toLowerCase());
    const requestedVersions = [...question.replace(/第\d+步/gu, '').matchAll(/\b(v?\d+(?:\.\d+)*)\b/giu)].map(match => match[1].toLowerCase());
    if (requestedVersions.length) return requestedVersions.some(version => negatedVersions.includes(version));
    if (affirmedVersions.length) return affirmedVersions.some(version => negatedVersions.includes(version));
    return negatedVersions.length > 0;
  }
  if (field === 'refund' && /(?:失败|原因|为什么|因何)/u.test(question) && hasConcreteRefundReason(clause)) return false;
  if (['schedule','dispatch','delivery','refund'].includes(field)) return hasNegatedEventTime(clause, field);
  return false;
}
function splitFacts(fact) {
  // A contrast after a sentence-like delimiter remains part of the same
  // assertion: splitting it could discard its restriction or correction.
  return fact.split(/(?<=[。！？；;])\s*(?!(?:但|不过|然而|但是|只是|仅|只))/u)
    .flatMap(part => part.split(/(?<=[，,])\s*(?=(?:后来|随后|之后|现已|最终|更正为|已更正|确认不会|确认不再|确认不支持|确认不提供))/u)
      .map(piece => piece.trim().replace(/[，,]$/u, '')))
    .flatMap(part => {
      // Isolate undisclosed internal cost clauses so a comma cannot carry
      // them into an otherwise publishable answer/evidence excerpt.
      if (/(?:内部成本|采购成本|进货成本|毛利|利润)/u.test(part) && /\d+(?:\.\d+)?\s*(?:元|人民币|美元|美金|¥|\$)/u.test(part)) {
        const pieces = part.split(/(?:并且|且|同时|[，,])(?=(?:内部成本|采购成本|进货成本|毛利|利润))/u).map(item => item.trim()).filter(Boolean);
        if (pieces.length > 1) return pieces;
      }
      return [part];
    })
    .flatMap(text => [text])
    .flatMap(text => {
      const coordinated = text.split(/且(?=[^，,。；;]{0,60}(?:库存|现货|缺货|价格|售价|优惠|成本|保修|质保|兼容|适配|支持|使用方法|操作步骤|发货|配送|退款|退货|换货))/u).map(part => part.trim()).filter(Boolean);
      if (coordinated.length > 1 && coordinated.every(part => Object.values(fieldMatchers).some(pattern => pattern.test(part)))) return coordinated;
  const parts = text.split(/[，,]/u).map(part => part.trim()).filter(Boolean);
      // Split compact catalogue lists only when each side carries its own
      // named object or answer field. Keep ordinary comma-linked evidence
      // together so the object and its conclusion are not separated.
  const hasScopeRestriction = parts.slice(1).some(part => /(?:仅限|只限|仅适用于|只适用于)/u.test(part));
  const hasCorrectionContinuation = parts.slice(1).some(part => /^(?:而是|实际上|更正为|后来更正|改为)/u.test(part));
      const hasContrastContinuation = parts.slice(1).some(part => /^(?:但|不过|然而|但是|只是|仅|只)/u.test(part));
      return parts.length > 1 && !hasScopeRestriction && !hasCorrectionContinuation && !hasContrastContinuation && parts.every(part => entityMentions(part).length > 0) ? parts : [text.trim()];
    })
    .map(text => text.trim()).filter(Boolean);
}
function splitFactsWithContext(fact) {
  let previousEntity = null;
  let previousFields = [];
  // A bare “后来更正为 0 件” inherits both its product and its field.  Without
  // inventory here, a correction loses its stock signal and the older value
  // can be treated as the only answerable assertion.
  const continuationField = {inventory:'库存', refund:'退款', dispatch:'发货', delivery:'到货', schedule:'上线', price:'售价', discount:'优惠', cost:'成本'};
  return splitFacts(fact).map((text, index) => {
    const entities = entityMentions(text).filter(entity => entity.kind !== 'condition');
    const anchors = entities.filter(entity=>entity.kind!=='variant');
    if (anchors.length === 1) previousEntity = anchors[0];
    let context = anchors.length === 0 && previousEntity ? `${previousEntity.label} ${text}` : text;
    if (/(?:更正为|后来更正|改为|实际改为)/u.test(text) && previousEntity && previousFields.includes('price')) context = `${previousEntity.label} 售价 ${text}`;
    const isContinuation = /^(?:后来|随后|之后|现已|最终|更正为|后来更正|改为|实际改为|确认)/u.test(text.trim());
    if (isContinuation && !Object.keys(continuationField).some(field => fieldMatchers[field].test(context))) {
      const field = previousFields.find(candidate => continuationField[candidate]);
      if (field) context = `${continuationField[field]} ${context}`;
    }
    previousFields = Object.entries(fieldMatchers).filter(([, pattern]) => pattern.test(text)).map(([field]) => field);
    return { text, context, index };
  });
}
function continuationContext(request, text, question = '') {
  // A source card may contain only a deliberate continuation, for example
  // “后来更正为5天内到账。”  Preserve the requested subject and field while
  // evaluating it, so a separately stored correction can replace an earlier
  // card without allowing an unrelated object to borrow that correction.
  const trimmed = text.trim();
  const continuation = request.label && trimmed.startsWith(request.label)
    ? trimmed.slice(request.label.length).trimStart() : trimmed;
  if (!/^(?:后来|随后|之后|现已|最终|更正为|后来更正为|改为|实际改为)/u.test(continuation)) return text;
  if (!/(?:更正为|后来更正为|改为|实际改为)/u.test(continuation)) return text;
  // A correction in a separate source needs its own product identity. Do not
  // attach a bare “后来更正为0件” card to whichever product was asked.
  if (request.field === 'inventory' && request.entity && !entityIds(text).has(request.entity)) return text;
  const attributeCorrection = request.field === 'product_attribute';
  if (!attributeCorrection && !/(?:\d+(?:\.\d+)?|[零一二两三四五六七八九十百]+)\s*(?:个)?(?:小时|工作日|天|周|月)(?:内|后|前)?/u.test(continuation)
      && !(request.field === 'inventory' && /\d+\s*(?:件|个|台|条|双|瓶|盒)?/u.test(continuation))) return text;
  const attributeKind = request.attributeKind || (/颜色|色彩|色号/u.test(question) ? '颜色' : /材质/u.test(question) ? '材质' : /型号/u.test(question) ? '型号' : /功率/u.test(question) ? '功率' : /重量/u.test(question) ? '重量' : /尺寸|规格/u.test(question) ? '尺寸' : '属性');
  const fieldName = { inventory: '库存', schedule: '上线', dispatch: '发货', delivery: '到货', refund: '退款', product_attribute: attributeKind }[request.field];
  if (!fieldName) return text;
  const event = { inventory: /库存|有货|缺货|售罄/u, schedule: /上线|发布|推出|开放/u, dispatch: /发货|寄出|出库/u, delivery: /到货|送达|配送/u, refund: /退款|退回|到账/u }[request.field];
  // Inventory corrections frequently abbreviate the field to just a count.
  // The continuation marker and count are sufficient only after the caller
  // has supplied the requested inventory field and subject.
  if (!attributeCorrection && !event.test(continuation) && !(request.field === 'inventory' && /\d+\s*(?:件|个|台|条|双|瓶|盒)?/u.test(continuation))) return text;
  const bare = request.label && trimmed.startsWith(request.label)
    ? trimmed.slice(request.label.length).trimStart() : trimmed;
  const subject = request.label ? `${request.label}${fieldName}` : fieldName;
  return `${subject}${bare}`;
}
function missingFields(source) {
  const fields = [];
  if (!source || typeof source.id !== 'string' || !source.id.trim()) fields.push('材料 ID');
  if (!source || typeof source.fact !== 'string' || !source.fact.trim()) fields.push('可直接支持回答的事实');
  if (!source || typeof source.source !== 'string' || !source.source.trim()) fields.push('可引用来源');
  return fields;
}
function supportedClause(question, clause, request, sourceFact = clause) {
  const field = request.field;
  const extractedClause = latestCorrectedAssertion(clause, field, question, request);
  // Check the whole approved sentence before extracting a shortened or
  // corrected assertion, so a trailing “待确认” cannot be discarded. The
  // refund-destination exception remains narrowly scoped to its own facet.
  // A source card may contain independent facts for several products. Keep
  // another named product's pending status out of this request's assertion.
  const sourceForRequest = request.entity
    ? sourceFact.split(/[。；;]/u).filter(part => {
      const stated = entityIds(part);
      return !stated.size || stated.has(request.entity);
    }).join('。')
    : sourceFact;
  const originalConclusionClause = field === 'refund' && (request.facet === 'refund_destination'
    || isRefundDestinationQuestion(question))
    ? sourceForRequest.replace(/(?:退款)?(?:到账|到账时间|到账时效).{0,12}(?:待确认|待补充|未确定|尚未确定|暂未确定)/gu, '')
    : sourceForRequest;
  // An explicit later correction has already selected the replacement value;
  // do not let uncertainty attached only to the superseded value veto it.
  if (extractedClause === clause && unresolvedForField(field, question, originalConclusionClause, request)) return false;
  clause = extractedClause;
  const facetQuestions = {
    delivery_region: '配送范围有哪些地区？', delivery_time: '预计什么时候到货？',
    return_window: '退货期限是多久？', return_shipping: '退货运费由谁承担？',
    refund_time: '退款什么时候到账？', refund_destination: '退款会退到哪里？'
  };
  if (request.facet) question = `${request.label || ''}${facetQuestions[request.facet]}`;
  if (request.facet) {
    if (request.facet === 'delivery_region' && !deliveryRegionValue(clause)) return false;
    if (request.facet === 'delivery_time' && !hasOperationalTime(clause, 'delivery')) return false;
    if (request.facet === 'return_window' && !/(?:退货|退换).{0,10}(?:期限|期|签收后|购买后|\d+(?:\.\d+)?\s*(?:天|个工作日|月|年))|(?:(?:签收后|购买后)\s*)?\d+(?:\.\d+)?\s*(?:天|个工作日|月|年)(?:\s*(?:内)?\s*(?:无理由)?)?\s*(?:退货|退换)/u.test(clause)) return false;
    if (request.facet === 'return_shipping' && (!hasAffirmativeReturnPayer(clause) || /(?:买家|卖家|商家|平台).{0,8}(?:或|或者).{0,8}(?:买家|卖家|商家|平台).{0,8}(?:承担|支付|运费|邮费)/u.test(clause))) return false;
    if (request.facet === 'refund_time' && !hasOperationalTime(clause, 'refund')) return false;
    if (request.facet === 'refund_destination' && (!hasConcreteRefundDestination(clause) || /(?:账户|余额|银行卡|支付宝|微信|钱包).{0,8}(?:或|或者).{0,8}(?:账户|余额|银行卡|支付宝|微信|钱包)/u.test(clause))) return false;
  }
  const refundDestinationRequest = field === 'refund' && (request.facet === 'refund_destination'
    || isRefundDestinationQuestion(question));
  const conclusionClause = refundDestinationRequest
    ? clause.replace(/(?:退款)?(?:到账|到账时间|到账时效).{0,12}(?:待确认|待补充|未确定|尚未确定|暂未确定)/gu, '')
    : clause;
  if (unresolvedForField(field, question, conclusionClause, request)) return false;
  if (hasNegatedRequestedValue(question, field, clause) || !hasRequestedSpecificValue(question, field, clause, request)) return false;
  if (field === 'direct_answer') {
    const incompleteNegativeParticipation = /(?:怎么|如何|怎样)(?:参加|参与|报名)|(?:参加|参与|报名)(?:方式|怎么|如何)/u.test(question)
      && /(?:不是通过|不通过|并非通过|不是在|并非在).{1,24}(?:报名|参加|参与)?/u.test(clause)
      && !/(?:而是|实际(?:通过|在)|改为通过)/u.test(clause);
    const incompleteNegativeLocation = /(?:在哪里|在哪|哪儿|什么地点|上课地点|地点在哪里)/u.test(question)
      && /(?:不在|并非在|不位于).{1,16}(?:上课|举办|举行|开课)?/u.test(clause)
      && !/(?:而是|实际在|改在|地点为|地点是)/u.test(clause);
    if (incompleteNegativeParticipation || incompleteNegativeLocation) return false;
    const asked = entityIds(question);
    const stated = entityIds(clause);
    // A free-form direct fact has no typed field token to anchor. When product
    // names are involved, accept it only when it names the asked entity and no
    // competing entity, rather than guessing which product the assertion binds.
    const askedBooking = bookingIntent(question), factBooking = bookingIntent(clause);
    const contextualGuestQuestion = /(?:嘉宾是谁|哪位嘉宾|谁是嘉宾|嘉宾是哪位)/u.test(question)
      && /(?:直播|讲座|活动|节目)/u.test(question);
    const contextualCameraQuestion = /(?:什么|哪款).{0,4}相机|相机.{0,4}(?:什么|哪款)|用什么相机/u.test(question)
      && /(?:拍视频|拍摄视频).{0,12}(?:使用|用).{1,24}/u.test(clause);
    return (!askedBooking || askedBooking === factBooking)
      && genericDirectSupport(question, clause)
      // A guest card may intentionally omit the event name because the
      // question already scopes it ("嘉宾是李明").  Keep this exception
      // narrowly tied to the explicit guest predicate; all other free-form
      // assertions still require an object match when the question has one.
      && (contextualGuestQuestion && stated.size === 0
        || contextualCameraQuestion
        || !asked.size || (stated.size > 0 && [...stated].every(id => asked.has(id))));
  }
  if (!fieldMatchers[field].test(clause)
      && !(field === 'schedule' && hasReleaseEvent(question, clause))
      && !(field === 'opening_hours' && hasConcreteOperationalValue('opening_hours', clause))) return false;
  if (field === 'inventory' && !inventoryState(clause)) return false;
  if (['opening_hours','discount','cost'].includes(field) && !hasConcreteOperationalValue(field, clause)) return false;
  if (field === 'opening_hours' && /几点(?:开门|营业)/u.test(question)) {
    const values=[...clause.matchAll(/\d{1,2}(?::\d{2}|点半?|时)/gu)];
    const labeledTime = /(?:开门时间|营业时间|营业时段).{0,12}\d{1,2}(?::\d{2}|点半?|时)/u.test(clause);
    const explicitHours = values.length >= 2 && /(?:营业|开门)/u.test(clause);
    if (!labeledTime && !explicitHours) return false;
  }
  if (field === 'opening_hours' && /几点(?:关门|打烊)/u.test(question)) {
    const values=[...clause.matchAll(/\d{1,2}(?::\d{2}|点半?|时)/gu)];
    if (!/(?:关门时间|打烊时间)/u.test(clause) && (!/营业时间|营业时段/u.test(clause) || values.length < 2)) return false;
  }
  if (field === 'product_attribute' && (unrequestedAttributeObject(question, clause) || !hasConcreteAttributeValue(request.attributeKind || question, clause) || /(?:信息|资料|参数|详情).{0,8}(?:正在整理|待确认|尚未|未公布|暂无|待补充)|(?:正在整理|待确认|尚未|未公布|暂无|待补充).{0,8}(?:信息|资料|参数|详情)/u.test(clause))) return false;
  if (field === 'usage' && !hasConcreteUsage(clause)) return false;
  const deliveryRegionQuestion=field==='delivery'&&(/(?:配送(?:哪些|什么)地区|哪些地区|什么地区|覆盖范围|配送范围|配送地区|送到哪里|配送到哪里)/u.test(question)||Boolean(deliveryRegionTarget(question)));
  if (['dispatch','delivery'].includes(field) && !deliveryRegionQuestion && !hasOperationalTime(clause, field)) return false;
  if (field === 'refund' && /到账|什么时候|何时|多久|几天/u.test(question) && !hasOperationalTime(clause, field)) return false;
  const refundReasonQuestion = field === 'refund' && /(?:失败|原因|为什么|因何)/u.test(question);
  const returnShippingQuestion = field === 'return' && /(?:运费|邮费|谁(?:来|要|需)?承担|由谁|谁出)/u.test(question);
  const refundDestinationQuestion = field === 'refund' && isRefundDestinationQuestion(question);
  if (field === 'return' && /(?:退货|退换)入口/u.test(clause) && !/(?:入口|链接|按钮)/u.test(question)) return false;
  if (field === 'refund' && /退款入口/u.test(clause) && !/(?:入口|链接|按钮)/u.test(question)) return false;
  const serviceLocationQuestion = ['return','refund','exchange','warranty','after_sales'].includes(field) && /(?:哪里|在哪|哪儿|哪个(?:门店|网点|平台|页面)|如何办理)/u.test(question);
  const warrantyScopeQuestion = field === 'warranty' && (request.facet === 'warranty_scope' || (!request.facet && request.warrantyScope));
  if (refundReasonQuestion && !hasConcreteRefundReason(clause)) return false;
  if (returnShippingQuestion && (!/(?:运费|邮费)/u.test(clause) || !hasAffirmativeReturnPayer(clause))) return false;
  if (returnShippingQuestion && /(?:买家|卖家|商家|平台).{0,8}(?:或|或者).{0,8}(?:买家|卖家|商家|平台).{0,8}(?:承担|支付|运费|邮费)/u.test(clause)) return false;
  if (refundDestinationQuestion && /(?:账户|余额|银行卡|支付宝|微信|钱包).{0,8}(?:或|或者).{0,8}(?:账户|余额|银行卡|支付宝|微信|钱包)/u.test(clause)) return false;
  if (field === 'version') {
    const askedStep = request.step || /第(\d+)步/u.exec(question)?.[1];
    const factStep = /第(\d+)步/u.exec(clause)?.[1];
    if (askedStep && factStep !== askedStep) return false;
    if (!hasVersionConclusion(clause)) return false;
  }
  if (['return','refund','exchange','warranty','after_sales'].includes(field)
      && /(?:政策|规则|方案).{0,8}(?:正在更新|更新中|待确定|尚未确定|尚未公布)|(?:正在更新|更新中).{0,8}(?:政策|规则|方案)/u.test(clause)) return false;
  if (['return','refund','exchange','warranty','after_sales'].includes(field) && !refundReasonQuestion && !returnShippingQuestion && !refundDestinationQuestion && !serviceLocationQuestion && !warrantyScopeQuestion && !hasPolicyConclusion(field, clause)) return false;
  // A page update is metadata, not a price: require an actual amount.
  if (field === 'price' && /(?:优惠券|购物券|代金券|兑换券).{0,10}\d+(?:\.\d+)?\s*(?:元|人民币|美元|美金|¥|\$)/u.test(clause)
      && !/(?:售价|标价|成交价|单价|价格(?:为|是|：|:)?\s*\d+(?:\.\d+)?\s*(?:元|人民币|美元|美金|欧元|EUR|€|¥|\$))/u.test(clause)) return false;
  if (field === 'price' && !/(?:售价|标价|成交价|单价|价格(?:为|是|：|:)?\s*\d+(?:\.\d+)?\s*(?:元|人民币|美元|美金|欧元|EUR|€|¥|\$)|(?:售价|标价|成交价|单价).{0,12}(?:(?:\d+(?:\.\d+)?\s*(?:元|人民币|美元|美金|欧元|EUR|€|¥|\$))|(?:¥|\$|€)\s*\d+(?:\.\d+)?))|(?:\d+(?:\.\d+)?\s*(?:元|人民币|美元|美金|欧元|EUR|€|¥|\$)|(?:¥|\$|€)\s*\d+(?:\.\d+)?).{0,12}(?:售价|标价|成交价|单价)/u.test(currentPriceText(clause))) return false;
  if (field === 'compatibility') {
    if (/(?:包装|外包装|外盒|包装盒|说明书|标签|宣传材料).{0,12}(?:写着|标注|印有|宣称|标称).{0,12}(?:支持|兼容|适配)/u.test(clause)) return false;
    if (/(?:iOS|Android|Windows|鸿蒙)(?:端)?(?:订单|退货|退换|退款|售后|发货|物流|查询)/iu.test(clause)) return false;
    if (!/(?:兼容|适配|支持|不支持|不兼容|不适配|无法兼容|无法适配)/u.test(clause)) return false;
    if (/(?:蓝牙|Bluetooth).{0,4}(?:设备)?(?:退货|退换|退款|发货|查询|进度查询)/iu.test(clause)) return false;
    const targets = request.compatibilityTarget ? [request.compatibilityTarget] : compatibilityTargets(question);
    if (targets.length && !targets.every(target => {
      const escaped=target.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
      return new RegExp(`(?:兼容|适配|支持|不支持|不兼容|不适配|无法兼容|无法适配)[^，,。；;]{0,20}${escaped}|${escaped}[^，,。；;]{0,20}(?:兼容|适配|支持|不支持|不兼容|不适配|无法兼容|无法适配)`, 'iu').test(clause);
    })) return false;
    const questionTargets = compatibilityTargets(question);
    // “Android 或 iOS” establishes neither individual platform as a
    // confirmed compatibility target.  Reject it even for a single-platform
    // question, otherwise an ambiguous disjunction could leak into an iOS
    // (or Android) reply merely because that word occurs in the sentence.
    if (targets.some(target => clause.toLowerCase().includes(target.toLowerCase())) && /(?:或|或者)/u.test(clause)) return false;
    const limit = /(?:仅限|只限|仅适用于|只适用于)\s*([^，,。；;]+)/u.exec(clause)?.[1];
    if (limit && request.entity && !entityIds(limit).has(request.entity)) return false;
  }
  if (!clauseMatchesRequest(clause, request)) return false;
  if (field === 'schedule' && (lacksSchedule(clause) || /(?:不会|不再|未计划|没有计划).{0,12}(?:上线|发布|推出)|(?:上线|发布|推出).{0,12}(?:不会|不再|未计划|没有计划)/u.test(clause) || !hasReleaseEvent(question, clause))) return false;
  if (field === 'warranty' && request.facet !== 'warranty_scope' && /多久|多长|几个月|几年|多长时间|期限|时长/u.test(question)
      && !/(?:\d+(?:\.\d+)?|[零一二两三四五六七八九十百]+)\s*(?:年|个月|月|天|小时)|终身|长期有效/u.test(clause.replace(/(?:保修|质保).{0,8}(?:不是|并非|不为|不等于)\s*(?:\d+(?:\.\d+)?|[零一二两三四五六七八九十百]+)\s*(?:年|个月|月|天|小时)/gu,''))) return false;
  return true;
}
function needsMore(index, question, needed_fields, message) {
  return { index, question, status: 'needs_more_information', needed_fields, message };
}
function requestedFieldLabel(request) {
  // Keep follow-up requests as granular as the parsed sub-question. This is
  // important for combined questions such as “颜色和材质”：asking for a
  // generic attribute would not tell the author which missing fact to add.
  if (request.attributeKind) return `${request.label || ''}${request.entity ? '：' : ''}${request.attributeKind}信息`;
  if (request.step) return `第${request.step}步：${labels[request.field]}`;
  const facetLabel = {delivery_region:'配送地区',delivery_time:'到货时间',return_window:'退货期限',return_shipping:'退货运费承担方',refund_time:'退款到账时间',refund_destination:'退款去向',warranty_scope:'保修范围',warranty_duration:'保修期限'}[request.facet];
  if (facetLabel) return `${request.label || ''}${request.entity ? '：' : ''}${facetLabel}`;
  if (request.warrantyScope) return `${request.label || ''}${request.entity ? '：' : ''}保修范围`;
  // Direct questions are intentionally not forced into a narrow field type,
  // but follow-up requests still need to name the missing sub-answer.  This
  // matters for composite questions: a course count is not evidence for its
  // audience, nor is a safety assertion a cleaning instruction.
  if (request.field === 'direct_answer') {
    const directQuestion = request.question || '';
    if (/(?:适合谁|适用于谁|适合哪些人)/u.test(directQuestion)) return '适用人群';
    if (/(?:怎么|如何|怎样)清洗/u.test(directQuestion)) return '清洗方法';
    if (/(?:怎么|如何)(?:参加|参与|报名)/u.test(directQuestion)) return '参加方式';
  }
  return `${request.label || ''}${request.entity ? '：' : ''}${labels[request.field]}`;
}

function subQuestions(question) {
  const product = entityMentions(question).find(entity => entity.kind !== 'condition' && entity.kind !== 'variant');
  const productCount = entityMentions(question).filter(entity => entity.kind !== 'condition' && entity.kind !== 'variant').length;
  const makeQuestion = (part, index) => {
    const trimmed = part.trim().replace(/^(?:并且|同时|另外|以及|且)/u, '').replace(/[？?。！!]+$/u, '');
    const localProduct = entityMentions(trimmed).find(entity => entity.kind !== 'condition' && entity.kind !== 'variant');
    const inheritedProduct = productCount === 1 ? product : null;
    const scopedProduct = localProduct || inheritedProduct;
    const scoped = scopedProduct && !entityIds(trimmed).has(scopedProduct.id) ? scopedProduct.label + trimmed : trimmed;
    return /(?:吗|呢|呀|啊)$/u.test(scoped) ? `${scoped}？` : `${scoped}吗？`;
  };
  if (/(?:防水|防尘)(?:和|及|并且|同时)?(?:防水|防尘)/u.test(question)) {
    const features = [...new Set([...question.matchAll(/防水|防尘/gu)].map(match => match[0]))];
    if (features.length > 1) return features.map((feature, index) => makeQuestion(feature, index));
  }
  const parts = question.split(/(?:并且|同时|另外还|另外|以及|[，,；;])/u).map(part => part.trim()).filter(Boolean);
  if (parts.length < 2 || !parts.every(part => /(?:吗|呢|呀|啊|是否|能否|多少|几|什么|哪里|哪儿|怎么|如何|谁|安全|防水|防尘|防火|耐热|防滑|适合|适用|解决什么问题|改善什么问题)/u.test(part))) return [question];
  return parts.map(makeQuestion);
}

const results = input.questions.map((question, position) => {
  const index = position + 1;
  const parts = subQuestions(question);
  const requested = parts.flatMap((part, partIndex) => requestPairs(part).map(request => parts.length > 1
    ? { ...request, question: part, key: `${request.key}:part${partIndex + 1}` }
    : { ...request, question: part }));

  const matches = new Map();
  for (const source of input.sources) {
    if (missingFields(source).length > 0) continue;
    const records = splitFactsWithContext(source.fact);
    for (const record of records) {
      const supported = requested.filter(request => {
        const invalidatedElsewhere = input.sources.some(other => other !== source && !missingFields(other).length
          && splitFactsWithContext(other.fact).some(item => {
            const itemContext = continuationContext(request, item.context, question);
            const entities = entityIds(itemContext);
            // A later correction often relies on the immediately preceding
            // card for its subject ("后来确认不会发货").  It is a deliberate
            // continuation, not a different product claim.  Conversely, an
            // explicitly named different object must never invalidate this
            // request.
            const explicitContinuation = /(?:后来|随后|之后|现已|最终|更正|确认不会|确认不再|确认不支持|确认不提供|已更正|实际改为)/u.test(item.context);
            // Explicitly named facts about another product never supersede
            // this request. Bare continuation cards are scoped by
            // continuationContext above.
            const namedOtherProduct = entityMentions(itemContext).some(entity => entity.id !== request.entity
              && entity.kind !== 'condition'
              && /(?:产品|商品|配件|酸奶|奶茶|茶饮|饮料|饼干|糖果|蛋糕|面包|水果|咖啡|茶|杯|瓶|包|鞋|手机|耳机|手表|电脑|衣服|裤子|相机|键盘|鼠标|灯|床|桌|椅|玩具|音箱|音响|路由器|充电器|显示器|平板|电视|空调|冰箱|洗衣机|课程|教程|系列|功能|活动|直播|讲座|套餐|服务|工具)$/u.test(entity.label));
            if (request.entity && entities.size && !entities.has(request.entity) && (!explicitContinuation || namedOtherProduct)) return false;
            const bareInventoryCorrection = request.field === 'inventory'
              && /^(?:后来|随后|之后|现已|最终)?\s*(?:更正为|后来更正为|改为|实际改为)\s*\d+\s*(?:件|个|台|条|双|瓶|盒)?$/u.test(itemContext.trim());
            const unboundInventoryCorrection = request.field === 'inventory'
              && request.entity && !entities.has(request.entity)
              && /^(?:后来|随后|之后|现已|最终)?\s*(?:更正为|后来更正为|改为|实际改为)\s*\d+\s*(?:件|个|台|条|双|瓶|盒)?[。！？.!?]?$/u.test(item.text.trim());
            const signalsField = request.field === 'direct_answer'
              ? Boolean(directQuestionTopic(question) && itemContext.includes(directQuestionTopic(question)))
              : fieldMatchers[request.field]?.test(itemContext) || bareInventoryCorrection;
            const unresolved = unresolvedForField(request.field, question, itemContext, request);
            const expiredPolicy = ['return','refund','exchange','warranty','after_sales'].includes(request.field)
              && /(?:政策|规则|方案).{0,10}(?:已|已经|现已)?(?:失效|废止|取消|撤销|不再适用)|(?:已|已经|现已)(?:失效|废止|取消|撤销).{0,8}(?:政策|规则|方案)/u.test(itemContext);
            const explicitlyLater = explicitContinuation;
            const unresolvedForFacet = unresolved && (
              request.field === 'refund' && isRefundDestinationQuestion(question)
                ? /(?:去向|退回|账户|支付渠道|退款渠道)/u.test(itemContext)
                : request.field === 'refund' && /(?:到账|什么时候|何时|多久|几天|几小时)/u.test(question)
                  ? /(?:到账|时间|小时|工作日|天)/u.test(itemContext)
                : request.field === 'refund' && /(?:失败|原因|为什么|因何)/u.test(question)
                    ? /(?:失败|原因|为什么|由于|因为)/u.test(itemContext)
                    : request.field === 'warranty' && /(?:多久|几年|几个月|期限|时长)/u.test(question)
                      ? /(?:保修|质保).{0,10}(?:时间|期限|年|月|天)|(?:时间|期限|年|月|天).{0,10}(?:保修|质保)/u.test(itemContext)
                      : request.field === 'return' && /(?:几天|多少天|多久|期限|时长)/u.test(question)
                        ? /(?:退货|退换).{0,10}(?:期限|天|工作日)|(?:期限|天|工作日).{0,10}(?:退货|退换)/u.test(itemContext)
                        : request.field === 'exchange' && /(?:几天|多少天|多久|期限|时长)/u.test(question)
                          ? /(?:换货).{0,10}(?:期限|天|工作日)|(?:期限|天|工作日).{0,10}(?:换货)/u.test(itemContext)
                      : request.field === 'schedule' ? /(?:上线|发布|推出|开放|时间|日期)/u.test(itemContext)
                        : request.field === 'compatibility'
                          ? (() => { const targets = request.compatibilityTarget ? [request.compatibilityTarget] : compatibilityTargets(question); const stated = compatibilityTargets(itemContext); return !targets.length || !stated.length || targets.some(target => stated.includes(target)); })()
                          : true);
            const approvedDateSupersedesPlan = request.field === 'schedule'
              && isPlannedScheduleDate(record.context) && hasApprovedScheduleDate(itemContext);
            return unboundInventoryCorrection || approvedDateSupersedesPlan
              || (signalsField && (unresolvedForFacet || expiredPolicy || (explicitlyLater && invalidatedLater(request.field, itemContext, question, request))));
          }));
        if (invalidatedElsewhere) return false;
        const recordEntities = entityIds(record.context);
        const subject = request.entity || [...recordEntities][0];
        const later = records.slice(record.index + 1).filter(item => !subject || entityIds(item.context).has(subject));
        if (request.field === 'schedule' && later.some(item => isPlannedScheduleDate(record.context) && hasApprovedScheduleDate(item.context))) return false;
        const sourceOffset = source.fact.indexOf(record.text);
        const remainder = sourceOffset >= 0 ? source.fact.slice(sourceOffset + record.text.length) : '';
        const remainderEntities = new Set([...remainder.matchAll(/(?:[A-Za-z0-9_-]+?|[\p{Script=Han}]{1,8}?)(?:产品|商品|配件|酸奶|奶茶|茶饮|饮料|饼干|糖果|蛋糕|面包|水果|咖啡|茶|杯|瓶|包|鞋|手机|耳机|手表|电脑|衣服|裤子|相机|键盘|鼠标|灯|床|桌|椅|玩具|音箱|音响|路由器|充电器|显示器|平板|电视|空调|冰箱|洗衣机|短剧|中心|商城|后台|系统|公众号|课程|功能|活动|直播|讲座|套餐|服务|工具)/gu)].map(match => match[0].toLowerCase()));
        if (remainder && (!subject || !remainderEntities.size || remainderEntities.has(subject))
            && (unresolvedForField(request.field, question, remainder, request) || invalidatedLater(request.field, remainder, question, request))) return false;
        if (request.field === 'inventory' && later.some(item => inventoryState(item.text)
          || unresolvedForField('inventory', question, item.context, request))) return false;
        if (request.field === 'schedule' && later.some(item => unresolvedForField('schedule', question, item.context, request))) return false;
        if (later.some(item => invalidatedLater(request.field, item.context, question, request))) return false;
        const requestQuestion = request.question || question;
        return supportedClause(requestQuestion, continuationContext(request, record.context, requestQuestion), request, source.fact);
      });
      if (!supported.length) continue;
      const key = `${source.id ?? ''}\u0000${record.text}`;
      const current = matches.get(key) ?? { source, fact: record.text, context: record.context, fields: new Set() };
      supported.forEach(request => current.fields.add(request.key));
      matches.set(key, current);
    }
  }
  for (const request of requested.filter(item => !item.entity)) {
    const identities = new Set(input.sources.filter(source => missingFields(source).length === 0 && typeof source.fact === 'string')
      .flatMap(source => splitFactsWithContext(source.fact).filter(record => request.field === 'direct_answer'
        ? genericDirectSupport(question, record.context) : fieldMatchers[request.field].test(record.context))
        .flatMap(record => entityMentions(record.context).filter(entity => entity.kind !== 'condition').map(entity => entity.id))));
    if (identities.size > 1 && !requested.some(request => request.field === 'version')) return needsMore(index, question, ['请确认要回答的商品或款式'], '现有材料覆盖多个商品或款式，但问题没有指定对象。请补充对应商品后再生成回复。');
  }
  const invalidEvidenceRequests = new Set(), invalidEvidenceFields = new Set();
  for (const source of input.sources.filter(item => missingFields(item).length > 0 && typeof item?.fact === 'string' && item.fact.trim() && typeof item?.source === 'string' && item.source.trim())) {
    for (const record of splitFactsWithContext(source.fact)) for (const request of requested) {
      if (supportedClause(question, record.context, request, source.fact) && clauseMatchesRequest(record.context, request)) {
        invalidEvidenceRequests.add(request.key);
        for (const field of missingFields(source)) invalidEvidenceFields.add(field);
      }
    }
  }
  const supportedFields = new Set([...matches.values()].flatMap(match => [...match.fields]));
  const missing = requested.filter(request => !supportedFields.has(request.key));
  const missingEntityNeedsIdentification = missing.some(request => request.entity && !input.sources.some(source => typeof source?.fact === 'string' && [...entityIds(source.fact)].some(id => sameEntityId(id, request.entity))));
  const needed = [...missing.filter(request => !invalidEvidenceRequests.has(request.key)).map(request => requestedFieldLabel(request)), ...(missingEntityNeedsIdentification ? ['与问题相同的商品/款式标识'] : []), ...invalidEvidenceFields,
    // When an otherwise usable matching card only lacks required metadata,
    // request exactly that metadata. Asking for a source again when one is
    // already present obscures the actionable repair (for example, its ID).
    ...(missing.length && invalidEvidenceFields.size === 0 ? ['可引用来源'] : [])];
  const completeMatches = [...matches.values()].filter(match => missingFields(match.source).length === 0);
  // Free-form suitability questions are polarity-bearing conclusions just like
  // price or inventory.  Matching can deliberately keep only the later
  // clause of a corrected card, so inspect every approved card here as well:
  // otherwise “适合儿童” plus “不适合儿童” could silently become a publishable
  // answer containing only one side of the contradiction.
  const suitabilityRequest = requested.find(request => request.field === 'direct_answer'
    && /适合|适用于/u.test(request.question || question));
  if (suitabilityRequest) {
    const polarities = new Set();
    for (const source of input.sources) {
      if (missingFields(source).length > 0) continue;
      const fact = source.fact;
      // Do not let a conclusion about a different named object affect this
      // question.  Entity-less questions remain eligible for direct facts.
      if (suitabilityRequest.entity && !entityIds(fact).has(suitabilityRequest.entity)) continue;
      if (/(?:不适合|不适用于)/u.test(fact)) polarities.add('negative');
      if (/(?:适合|适用于)/u.test(fact.replace(/(?:不适合|不适用于)/gu, ''))) polarities.add('positive');
    }
    if (polarities.size > 1) return needsMore(index, question, ['相互冲突的适用人群材料及其更新时间'], '批准材料对是否适合该人群给出互斥结论；请确认当前有效结论，不生成可复制回复。');
  }
  if (missing.length || !completeMatches.length) {
    const fieldsToAsk = needed.length ? [...new Set(needed)] : ['材料 ID', '可引用来源'];
    const onlyMissingMaterialId = fieldsToAsk.length === 1 && fieldsToAsk[0] === '材料 ID' && invalidEvidenceFields.has('材料 ID');
    const explanation = onlyMissingMaterialId ? '批准事实与来源已经匹配，只需补充对应的材料 ID。'
      : `现有批准材料未能直接支持${missing.map(request => requestedFieldLabel(request)).join('、') || '完整回答'}。请作者补充对应事实及来源，不要推测。`;
    const message = onlyMissingMaterialId ? explanation : toneStyle === 'formal' ? `暂不形成回复草稿。${explanation}`
      : toneStyle === 'light' ? `这条先不硬答：${explanation}`
        : toneStyle === 'warm' ? `为避免答错，${explanation}` : explanation;
    return needsMore(index, question, fieldsToAsk, message);
  }
  for (const request of requested.filter(item=>['price','product_attribute','compatibility','return','refund','exchange','warranty','after_sales','schedule','dispatch','delivery','opening_hours','version','inventory','discount','cost','direct_answer'].includes(item.field))) {
    if (request.field === 'product_attribute' && /(?:有哪些|有哪几种|都有什么|有什么)(?:颜色|色彩|材质|型号|尺寸|规格)/u.test(question)) continue;
    const requestMatches = completeMatches.filter(match=>match.fields.has(request.key));
    const requestQuestion = request.question || question;
    if (requestMatches.some(match => hasInternalConflict(request, match.source.fact, requestQuestion))) {
      return needsMore(index, question, [`${request.label || ''}${request.entity ? '：' : ''}相互冲突的${labels[request.field]}材料`], `同一条批准材料对${request.label || '问题对象'}的${labels[request.field]}包含互斥结论；请作者确认当前有效内容，不生成可复制回复。`);
    }
    if (request.field === 'direct_answer' && /适合|适用于/u.test(requestQuestion)) {
      const polarities = new Set(requestMatches.map(match => {
        const fact = match.context || match.fact;
        if (/(?:不适合|不适用于)/u.test(fact)) return 'negative';
        if (/(?:适合|适用于)/u.test(fact)) return 'positive';
        return null;
      }).filter(Boolean));
      if (polarities.size > 1) return needsMore(index, question, ['相互冲突的适用人群材料及其更新时间'], '批准材料对是否适合该人群给出互斥结论；请确认当前有效结论，不生成可复制回复。');
    }
    if (['return','exchange'].includes(request.field) && !/(?:多久|多长|几天|多少天|期限|时长)/u.test(question)) {
      const statuses = new Set(requestMatches.map(match=>answerSignature(request,match.context||match.fact,requestQuestion)).filter(Boolean));
      const deadlines = new Set(requestMatches.map(match=>{
        const fact=match.context||match.fact;
        return (fact.match(/(?:换货|退货|退换)\s*(?:期限|期)\s*(?:为|是)?\s*(?:签收后|购买后)?\s*(?:\d+(?:\.\d+)?|[一二三四五六七八九十]+)\s*(?:天|个工作日|月|年)(?:\s*(?:内|无理由))?|(?:签收后|购买后)?\s*(?:\d+(?:\.\d+)?|[一二三四五六七八九十]+)\s*(?:天|个工作日|月|年)(?:\s*(?:内|可))?/u)||[])[0]||null;
      }).filter(Boolean));
      if(statuses.size>1||deadlines.size>1)return needsMore(index,question,[`${request.label||''}${request.entity?'：':''}相互冲突的${labels[request.field]}材料及其更新时间`],`批准材料对同一商品的${labels[request.field]}互相冲突；请确认当前有效结论，不生成可复制回复。`);
      continue;
    }
    const values = new Set(requestMatches.map(match=>answerSignature(request,match.context||match.fact,requestQuestion)).filter(Boolean));
    const warrantyHasSeparateScopes = request.field === 'warranty'
      && /(?:多久|多长|几年|几个月|期限|时长)/u.test(requestQuestion)
      && requestMatches.length > 1
      && requestMatches.every(match => warrantyDurationScope(match.context || match.fact))
      && new Set(requestMatches.map(match => warrantyDurationScope(match.context || match.fact))).size === requestMatches.length;
    if(values.size>1 && !warrantyHasSeparateScopes)return needsMore(index,question,[`${request.label||''}${request.entity?'：':''}相互冲突的${labels[request.field]}材料及其更新时间`],`批准材料对同一商品的${labels[request.field]}互相冲突；请确认当前有效结论，不生成可复制回复。`);
  }
  if (requested.some(request => request.field === 'inventory')) {
    const stockByEntity = new Map();
    for (const match of completeMatches.filter(item => [...item.fields].some(key => key.startsWith('inventory:')))) {
      const factEntities = entityIds(match.context || match.fact);
      const requestedEntity = requested.find(request => request.field === 'inventory' && request.entity && factEntities.has(request.entity))?.entity;
      const entity = requestedEntity || [...factEntities].join('|') || '*';
      if (!stockByEntity.has(entity)) stockByEntity.set(entity, []);
      stockByEntity.get(entity).push(match.fact);
    }
    for (const facts of stockByEntity.values()) {
      const quantities = new Set(facts.map(inventoryQuantity).filter(value => value !== null));
      if (quantities.size > 1) return needsMore(index, question, ['相互冲突的库存数量材料及其更新时间'], '批准材料对同一商品的库存数量互相冲突；请核对并保留当前有效的一条，不生成可复制回复。');
      const positive = facts.some(fact => inventoryState(fact) === 'positive');
      const negative = facts.some(fact => inventoryState(fact) === 'negative');
      if (positive && negative) return needsMore(index, question, ['相互冲突的库存材料及其更新时间'], '批准材料对同一商品的库存状态互相冲突；请核对并保留当前有效的一条，不生成可复制回复。');
    }
  }
  const removeUnaskedSensitiveClaims = text => {
    const secretPattern = /(?:令牌|密码|口令|密钥|API\s*key|api[_-]?key|access[_-]?token|refresh[_-]?token|bearer|secret|token|\b(?:sk-proj-|sk-|ghp_|gho_|ghu_|ghs_|github_pat_)[A-Za-z0-9_-]{8,}\b)/iu;
    const secretPieces = text.split(/(并且|同时|且|[，,；;。])/u);
    const secretPieceIsSafe = index => Boolean(secretPieces[index]?.trim()) && !secretPattern.test(secretPieces[index] || '');
    let withoutSecrets = '';
    for (let index = 0; index < secretPieces.length; index += 2) {
      if (!secretPieceIsSafe(index)) continue;
      withoutSecrets += secretPieces[index];
      const nextTextIndex = index + 2;
      if (secretPieces[index + 1] && (nextTextIndex >= secretPieces.length || !secretPieces[nextTextIndex]?.trim() || secretPieceIsSafe(nextTextIndex))) {
        withoutSecrets += secretPieces[index + 1];
      }
    }
    if (requested.some(request => request.field === 'cost')) return withoutSecrets;
    const asksForContact = /邮箱|邮件|电话|座机|固话|联系方式|手机号/u.test(question);
    const asksForAddress = /地址|住址|门牌|邮寄地址/u.test(question);
    const sanitized = asksForContact ? withoutSecrets : withoutSecrets.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[已省略联系方式]');
    // Never expose internal commercial figures in either the reader-facing
    // reply or the evidence excerpt.  This is deliberately value-oriented,
    // so it also catches a sensitive clause joined with a Chinese comma,
    // semicolon, or conjunction rather than relying on one exact separator.
    let publicText = sanitized
      .split(/([，,；;。])/u)
      .reduce((parts, piece) => {
        if (/(?:内部成本|采购成本|进货成本|毛利|利润)/u.test(piece)
            || (!asksForContact && /(?:联系人|联系电话|联系号码|电话号码|电话|座机|固话|办公电话|手机号码|手机号|联系方式)|1[3-9]\d{9}|\b0\d{2,3}[-\s]?\d{7,8}\b|\b400[-\s]?\d{3}[-\s]?\d{4}\b/u.test(piece))
            || (!asksForAddress && /(?:家庭住址|住址|详细地址|收货地址|联系地址|办公地址|联系地址|地址)\s*(?:为|是|：|:)?/u.test(piece))
            || (!asksForContact && /(?:已省略联系方式|管理员邮箱|邮箱地址|联系邮箱|个人邮箱)/u.test(piece))) return parts;
        parts.push(piece);
        return parts;
      }, [])
      .join('')
      .replace(/[，,；;]{2,}/gu, '，')
      .replace(/(?:，|,|；|;)\s*(?:并且|同时|且)?\s*$/u, '')
      .trim();
    const pendingPieces = publicText.split(/(但是|但|不过|然而|只是|并且|同时|且|[，,；;。])/u);
    const pendingSafe = [];
    for (let index = 0; index < pendingPieces.length; index += 2) {
      const piece = pendingPieces[index] || '';
      const relevantPending = requested.some(request => unresolvedForField(request.field, question, piece, request));
      const concreteDeliveryEstimate = requested.some(request => request.field === 'delivery')
        && hasOperationalTime(piece, 'delivery')
        && !hasUnresolvedConclusion(piece.replace(/预计(?=\s*(?:\d+(?:\.\d+)?|[零一二两三四五六七八九十百]+)\s*(?:个)?(?:小时|工作日|天|周|月))/u, ''));
      if (hasUnresolvedConclusion(piece) && !relevantPending && !concreteDeliveryEstimate) continue;
      pendingSafe.push(piece);
      if (pendingPieces[index + 1]) pendingSafe.push(pendingPieces[index + 1]);
    }
    publicText = pendingSafe.join('').replace(/(?:但是|但|不过|然而|只是|并且|同时|且|[，,；;])\s*(?=[。！？!?]|$)/gu, '').trim();
    const requestedIds = new Set(requested.map(request => request.entity).filter(Boolean));
    if (requestedIds.size) {
      const pieces = publicText.split(/([，,；;。])/u);
      const kept = [];
      let activeAskedEntity = false;
      const namedProductIds = piece => new Set(entityMentions(piece)
        .filter(item => item.kind !== 'condition' && /(?:产品|商品|配件|礼盒|防晒霜|护肤品|酸奶|奶茶|茶饮|饮料|饼干|糖果|蛋糕|面包|水果|咖啡|茶|杯|瓶|包|鞋|手机|耳机|手表|电脑|衣服|裤子|相机|键盘|鼠标|灯|床|桌|椅|玩具|音箱|音响|路由器|充电器|显示器|平板|电视|空调|冰箱|洗衣机)$/u.test(item.label))
        .map(item => item.id));
      for (let index = 0; index < pieces.length; index += 2) {
        const piece = pieces[index] || '';
        const ids = namedProductIds(piece);
        const explicitlyNamesAsked = requested.some(request => request.label && piece.includes(request.label));
        if (ids.size) activeAskedEntity = explicitlyNamesAsked || [...ids].every(id => requestedIds.has(id));
        const retain = ids.size ? (explicitlyNamesAsked || [...ids].every(id => requestedIds.has(id))) : (activeAskedEntity || !kept.length);
        if (!retain) { activeAskedEntity = false; continue; }
        kept.push(piece);
        if (pieces[index + 1]) kept.push(pieces[index + 1]);
      }
      publicText = kept.join('').replace(/[，,；;]+(?=[。！？!?]|$)/gu, '').trim();
    }
    // Removing a trailing sensitive clause may leave its preceding comma in
    // front of the final full stop (for example “有货，。”).  Keep the
    // approved assertion readable in both the draft and its evidence excerpt.
    return publicText.replace(/[，,；;]+(?=[。！？!?]|$)/gu, '').trim();
  };
  const publicEvidenceFact = match => {
    const sourceText = match.source?.fact || match.context || match.fact;
    const correctionRequest = requested.find(request => match.fields.has(request.key)
      && latestCorrectedAssertion(sourceText, request.field, request.question || question, request) !== sourceText);
    if (correctionRequest) match = { ...match, fact: latestCorrectedAssertion(sourceText, correctionRequest.field, correctionRequest.question || question, correctionRequest) };
    const attributeRequest = requested.find(request => request.field === 'product_attribute' && match.fields.has(request.key));
    if (attributeRequest) {
      const kind = attributeRequest.attributeKind || (/颜色|色彩|色号/u.test(question) ? '颜色' : /材质/u.test(question) ? '材质' : /型号/u.test(question) ? '型号' : /功率/u.test(question) ? '功率' : /重量/u.test(question) ? '重量' : /尺寸|规格/u.test(question) ? '尺寸' : '属性');
      const value = correctedAttributeValue(kind, match.fact);
      if (value) return `${attributeRequest.label || ''}${kind}更正为${value}`;
    }
    const warrantyRequest = requested.find(request => request.field === 'warranty' && match.fields.has(request.key));
    if (warrantyRequest?.label && warrantyRequest.entity && !entityIds(match.fact).has(warrantyRequest.entity)) {
      return `${warrantyRequest.label}${removeUnaskedSensitiveClaims(match.fact)}`;
    }
    const destinationRequest = requested.find(request => request.field === 'refund'
      && match.fields.has(request.key)
      && (request.facet === 'refund_destination' || isRefundDestinationQuestion(question)));
    if (!destinationRequest) return removeUnaskedSensitiveClaims(match.fact);
    const destination = /(?:原路退回(?:至|到)?|退回(?:至|到)?|退款至|退到)\s*(原支付账户|原账户|支付账户|银行卡|支付宝|微信|账户|钱包|卡号)/u.exec(match.fact);
    const alsoAskedRefundTime = requested.some(request => request.field === 'refund' && request.key !== destinationRequest.key && match.fields.has(request.key));
    return destination && !alsoAskedRefundTime ? `${destinationRequest.label || ''}退款${destination[0]}` : removeUnaskedSensitiveClaims(match.fact);
  };
  const redactCredentialMetadata = value => String(value ?? '')
    // Sources are delivered to readers as evidence.  Cover both the usual
    // API-token names and browser-session conventions (for example
    // `sessionid`, `JSESSIONID`, `connect.sid`, and CSRF values), preserving
    // the parameter name while never publishing its value.
    .replace(/([?&](?:key|auth|code|session(?:[_-]?id)?|jsessionid|phpsessid|connect\.sid|sid|csrf(?:[_-]?(?:token|key))?|xsrf(?:[_-]?token)?|access_token|refresh_token|api[_-]?key|token|secret|signature|sig)=)[^&#\s]+/giu, '$1[已省略]')
    .replace(/([?&](?:x-amz-signature|x-amz-credential|x-amz-security-token|x-goog-credential|x-goog-signature|x-goog-security-token|x-goog-algorithm|x-goog-date)=)[^&#\s]+/giu, '$1[已省略]')
    .replace(/\bAuthorization\s*:\s*Bearer\s+[^\s,;]+/giu, 'Authorization: Bearer [已省略]')
    .replace(/\bAuthorization\s*:\s*Basic\s+[^\s,;]+/giu, 'Authorization: Basic [已省略]')
    .replace(/\bCookie\s*:\s*[^\r\n]+/giu, 'Cookie: [已省略]')
    .replace(/(https?:\/\/)[^/@\s:]+:[^/@\s]+@/giu, '$1[已省略]@')
    .replace(/\b(?:sk|ghp|gho|ghu|ghs|github_pat)[_-][A-Za-z0-9_-]{8,}\b/giu, '[已省略凭据]')
    .replace(/\b(?:AKIA|ASIA|AIDA|AROA|ANPA|ANVA|ASCA)[A-Z0-9]{16}\b/gu, '[已省略AWS凭据]')
    .replace(/((?:token|secret|password|令牌|密码|口令|密钥)\s*(?:=|:|：|为|是)\s*)[A-Za-z0-9._~+/-]{6,}/giu, '$1[已省略]');
  const evidence = [];
  for (const match of completeMatches) {
    const safeId = redactCredentialMetadata(match.source.id);
    const safeSource = redactCredentialMetadata(match.source.source);
    const existing = evidence.find(item => item.id === safeId && item.source === safeSource);
    // Facts are user-supplied material too. They can contain a pasted token,
    // so apply the same redaction used for IDs and source URLs before any
    // text becomes deliverable evidence.
    const fact = redactCredentialMetadata(publicEvidenceFact(match));
    if (existing) { if (!existing.facts.includes(fact)) existing.facts.push(fact); }
    else evidence.push({ id: safeId, facts: [fact], source: safeSource });
  }
  const replyFact = match => {
    const singleRequest = requested.filter(item => match.fields.has(item.key)).length === 1
      ? requested.find(item => match.fields.has(item.key)) : null;
    const sourceText = match.source?.fact || match.context || match.fact;
    const correctionRequest = requested.find(request => match.fields.has(request.key)
      && latestCorrectedAssertion(sourceText, request.field, request.question || question, request) !== sourceText);
    if (correctionRequest) match = { ...match,
      fact: latestCorrectedAssertion(sourceText, correctionRequest.field, correctionRequest.question || question, correctionRequest),
      context: latestCorrectedAssertion(sourceText, correctionRequest.field, correctionRequest.question || question, correctionRequest) };
    if (singleRequest?.field === 'refund' && (singleRequest.facet === 'refund_destination'
        || isRefundDestinationQuestion(question))) {
      return publicEvidenceFact(match);
    }
    const attributeRequest = requested.find(request => request.field === 'product_attribute' && match.fields.has(request.key));
    if (attributeRequest) {
      const kind = attributeRequest.attributeKind || (/颜色|色彩|色号/u.test(question) ? '颜色' : /材质/u.test(question) ? '材质' : /型号/u.test(question) ? '型号' : /功率/u.test(question) ? '功率' : /重量/u.test(question) ? '重量' : /尺寸|规格/u.test(question) ? '尺寸' : '属性');
      const value = correctedAttributeValue(kind, match.fact);
      if (value) return `${attributeRequest.label || ''}${kind}为${value}`;
    }
    const warrantyRequest = requested.find(request => request.field === 'warranty' && match.fields.has(request.key));
    if (warrantyRequest?.label && warrantyRequest.entity && !entityIds(match.fact).has(warrantyRequest.entity)) {
      return `${warrantyRequest.label}${removeUnaskedSensitiveClaims(match.fact)}`;
    }
    if (singleRequest && ['price','cost','discount'].includes(singleRequest.field)) {
      const chunks = match.fact.split(/(?:并且|同时|且)/u).map(item => item.trim()).filter(Boolean);
      const scoped = chunks.find(item => fieldMatchers[singleRequest.field].test(item)
        && (!singleRequest.label || item.includes(singleRequest.label)));
      const text = scoped || match.fact;
      const label = singleRequest.label || entityMentions(text).find(item => item.kind !== 'condition')?.label || '';
      if (singleRequest.field === 'price') {
        const range = /(?:售价|价格|标价|成交价|单价)\s*(?:为|是|：|:)?\s*(\d+(?:\.\d+)?)\s*(元|人民币|美元|美金|欧元|EUR|€|¥|\$)\s*(?:至|到|—|–|~|～|-)\s*(\d+(?:\.\d+)?)\s*\2/u.exec(currentPriceText(text));
        if (range) return `${label}价格区间为${range[1]}${range[2]}至${range[3]}${range[2]}`;
        const amount = /(?:售价|价格|标价|成交价|单价)\s*(?:为|是|：|:)?\s*(\d+(?:\.\d+)?)\s*(元|人民币|美元|美金|欧元|EUR|€|¥|\$)\s*(起|起步|以上)?/u.exec(currentPriceText(text));
        if (amount) return `${label}${label ? '' : ''}售价${amount[1]}${amount[2]}${amount[3] || ''}`;
      }
      if (singleRequest.field === 'cost') {
        const amount = /(?:成本|采购价|进货价)\s*(?:为|是|：|:)?\s*(\d+(?:\.\d+)?)\s*(元|人民币|美元|美金|¥|\$)/u.exec(text);
        if (amount) return `${label}成本为${amount[1]}${amount[2]}`;
      }
      if (singleRequest.field === 'discount') {
        const discount = /第\s*\d+\s*件.{0,8}\d+(?:\.\d+)?\s*折/u.exec(text) || /(?:满\s*\d+(?:\.\d+)?\s*(?:元|件|人).{0,8}(?:减\s*\d+(?:\.\d+)?\s*(?:元|%|折)?|\d+(?:\.\d+)?折)|(?:立减|优惠|减免)\s*\d+(?:\.\d+)?\s*(?:元|%|折)|\d+(?:\.\d+)?\s*(?:折|%折))/u.exec(text);
        if (discount) return `${label}${discount[0]}`;
      }
    }
    const refundRequest = requested.find(item => item.field === 'refund' && match.fields.has(item.key));
    const correctedReason = /(?:实际原因是|真正原因是|而是)\s*(?:因为|由于)?\s*([^。；;，,]+)/u.exec(match.fact);
    if (refundRequest && correctedReason && /(?:不是|并非|不因|不由于)/u.test(match.fact)) {
      const cause = correctedReason[1].trim();
      return `${refundRequest.label || ''}退款失败的实际原因是${cause}`;
    }
    const stockRequest = requested.find(item => item.field === 'inventory' && match.fields.has(item.key));
    if (stockRequest && !requested.some(item => ['price','cost','discount'].includes(item.field))) {
      const containsOtherClaim = Object.entries(fieldMatchers).some(([field, pattern]) => field !== 'inventory' && pattern.test(match.fact)
        && !(field === 'product_attribute' && entityMentions(match.fact).some(entity => entity.kind === 'variant')
          && !/(?:颜色|材质|型号|功率|重量|尺寸|规格)/u.test(match.fact)));
      if (!containsOtherClaim) return removeUnaskedSensitiveClaims(match.fact);
      const label = stockRequest.label || entityMentions(match.context || match.fact).find(item => item.kind !== 'condition')?.label || '';
      const quantity = inventoryQuantity(match.fact);
      return quantity !== null ? `${label}库存为${quantity}件` : `${label}${label ? '目前' : ''}${inventoryState(match.fact) === 'negative' ? '无货' : '有货'}`;
    }
    const request = requested.find(item => item.field === 'price' && match.fields.has(item.key));
    if (!request || !/(?:更正为|后来更正|实际改为|改为|不是\s*\d+(?:\.\d+)?\s*(?:元|人民币|美元|美金|¥|\$).{0,8}而是)/u.test(match.fact)) return removeUnaskedSensitiveClaims(match.fact);
    const corrected = /售价\s*(\d+(?:\.\d+)?)\s*(元|人民币|美元|美金|欧元|EUR|€|¥|\$)/u.exec(currentPriceText(match.context || match.fact));
    if (!corrected) return match.fact;
    const entity = entityMentions(match.context || match.fact).find(item => item.kind !== 'condition')?.label || request.label || '';
    return `${entity}售价${corrected[1]}${corrected[2]}`;
  };
  const answerFacts = [...new Set(completeMatches.map(match => redactCredentialMetadata(replyFact(match))))];
  // Each approved fact commonly ends in a full stop.  Normalize those stops
  // before combining separately supported sub-answers, so a composite reply
  // remains directly copyable (rather than rendering as “。；”).
  const replyFacts = answerFacts
    .map(fact => fact.replace(/[。；;，,]+$/u, '').trim())
    .filter(Boolean);
  return { index, question, status: 'draft', reply_draft: `${toneLead}${replyFacts.join('；')}${replyFacts.length ? '。' : ''}`, evidence };
});

process.stdout.write(JSON.stringify({ results }, null, 2) + '\n');
