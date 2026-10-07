#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const run = name => JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), resolve(root, 'fixtures', name)], { encoding: 'utf8' }));
const render = result => {
  if (result.status === 'draft') {
    return `# 成功样例交付\n\n**问题**：${result.question}\n\n**可复制回复草稿**：${result.reply_draft}\n\n**依据**：${result.evidence.map(item => item.facts.map(fact => `\`${item.id}\`｜${fact}｜${item.source}`).join('；')).join('；')}\n`;
  }
  return `# 缺料样例交付\n\n**问题**：${result.question}\n\n**需补充**：${result.needed_fields.join('；')}。\n\n**回复说明**：${result.message}\n`;
};
const successInput = JSON.parse(readFileSync(resolve(root, 'fixtures/success-input.json'), 'utf8'));
const failureInput = JSON.parse(readFileSync(resolve(root, 'fixtures/failure-input.json'), 'utf8'));
const success = run('success-input.json').results[0];
const failure = run('failure-input.json').results[0];
if ('keywords' in successInput.sources[0] || 'answer' in successInput.sources[0]) throw new Error('成功样例不应依赖未公开的 keywords 或 answer');
if (success.status !== 'draft' || !success.reply_draft.includes('v2') || success.evidence[0]?.id !== 'tutorial-v2' || success.reply_draft.includes('undefined')) throw new Error('成功样例未生成受依据约束的 v2 草稿');
if (failure.status !== 'needs_more_information' || 'reply_draft' in failure || !failure.needed_fields.some(field => field.includes('已批准的发布日期或时间表')) || !failure.message.includes('发布日期或时间表')) throw new Error('失败样例未正确处理相关材料缺少发布日期');
if (render(success) !== readFileSync(resolve(root, 'fixtures/success-output.md'), 'utf8')) throw new Error('成功样例 Markdown 与脚本实际 JSON 输出不一致');
if (render(failure) !== readFileSync(resolve(root, 'fixtures/failure-output.md'), 'utf8')) throw new Error('缺料样例 Markdown 与脚本实际 JSON 输出不一致');
const unsupportedField = run('inventory-unrelated-input.json').results[0];
if (unsupportedField.status !== 'needs_more_information' || 'reply_draft' in unsupportedField || !unsupportedField.needed_fields.some(field => field.includes('库存'))) throw new Error('哑光外观资料不应回答红色款库存问题');
if (render(unsupportedField) !== readFileSync(resolve(root, 'fixtures/inventory-unrelated-output.md'), 'utf8')) throw new Error('库存字段错配的实际交付与参考结果不一致');
const reviewerRegressions = run('reviewer-regressions-input.json').results;
const reviewerExpected = ['12节内容', '嘉宾是李明', '适用于 v2', '覆盖主板和电池', '签收后7天'];
if (reviewerRegressions.length !== reviewerExpected.length || reviewerRegressions.some((result, index) => result.status !== 'draft' || !result.reply_draft.includes(reviewerExpected[index]))) {
  throw new Error('直接事实、教程版本、保修范围或退货期限的回归样例未能生成受依据约束的草稿');
}
if (reviewerRegressions[2].reply_draft.includes('v3')) throw new Error('教程版本事实只能确认已批准的 v2，不得推断 v3');
const crossProduct = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['A产品现在有库存吗？'], sources:[{id:'b',fact:'B产品目前有库存。',source:'商家库存表'}]}), encoding:'utf8'})).results[0];
if (crossProduct.status !== 'needs_more_information' || 'reply_draft' in crossProduct || !crossProduct.needed_fields.some(field => field.includes('相同的商品'))) throw new Error('B产品库存资料不能回答A产品库存问题');
const simpleInventory = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['有货吗？'], sources:[{id:'stock',fact:'有货。',source:'批准库存表'}]}), encoding:'utf8'})).results[0];
if (simpleInventory.status !== 'draft' || !simpleInventory.reply_draft.includes('有货。')) throw new Error('简单“有货吗？”应由直接批准事实回答');
const openingHours = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['店铺营业时间是几点？'], sources:[{id:'hours',fact:'店铺营业时间为9:00至18:00。',source:'店铺公告'}]}), encoding:'utf8'})).results[0];
if (openingHours.status !== 'draft' || !openingHours.reply_draft.includes('9:00至18:00')) throw new Error('营业时间问题应由明确营业时间事实回答');
const combined = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['A产品价格是多少，现在有库存吗？'], sources:[{id:'price-a',fact:'A产品售价100元。',source:'批准价目表'},{id:'stock-a',fact:'A产品目前有库存。',source:'批准库存表'}]}), encoding:'utf8'})).results[0];
if (combined.status !== 'draft' || combined.evidence.length !== 2 || !combined.reply_draft.includes('100元') || !combined.reply_draft.includes('有库存')) throw new Error('多字段问题应组合分别支持的同商品批准事实');
const wrongVariant = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['红色款有货吗？'], sources:[{id:'variants',fact:'红色款采用哑光外壳，蓝色款目前有库存。',source:'批准商品表'}]}), encoding:'utf8'})).results[0];
if (wrongVariant.status !== 'needs_more_information' || 'reply_draft' in wrongVariant || !wrongVariant.needed_fields.some(field => field.includes('库存'))) throw new Error('蓝色款库存不能回答红色款问题');
const sameClauseWrongVariant = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['红色款有货吗？'], sources:[{id:'variants-one-clause',fact:'红色款采用哑光外壳和蓝色款目前有库存。',source:'批准商品表'}]}), encoding:'utf8'})).results[0];
if (sameClauseWrongVariant.status !== 'needs_more_information' || 'reply_draft' in sameClauseWrongVariant) throw new Error('同一事实内蓝色款库存不能回答红色款问题');
const wrongProductSchedule = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['A产品什么时候发布？'], sources:[{id:'mixed-products',fact:'A产品功能已经确认，B产品计划于2027年5月发布。',source:'批准产品资料'}]}), encoding:'utf8'})).results[0];
if (wrongProductSchedule.status !== 'needs_more_information' || 'reply_draft' in wrongProductSchedule || !wrongProductSchedule.needed_fields.some(field => field.includes('发布日期'))) throw new Error('B产品发布日期不能回答A产品问题');
const genericDirect = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['可以预约吗？'], sources:[{id:'booking',fact:'目前可以预约。',source:'批准预约说明'}]}), encoding:'utf8'})).results[0];
if (genericDirect.status !== 'draft' || !genericDirect.reply_draft.includes('可以预约')) throw new Error('非固定类别的直接批准事实应能起草');
const unknownIntent = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['A产品怎么用？'], sources:[{id:'a',fact:'A产品有三种颜色。',source:'产品资料'}]}), encoding:'utf8'})).results[0];
if (unknownIntent.status !== 'needs_more_information' || 'reply_draft' in unknownIntent || !unknownIntent.needed_fields.some(field => field.includes('使用方法'))) throw new Error('“怎么用”未知支持字段不能默认起草');
const futurePlan = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['A产品什么时候发布？'], sources:[{id:'a',fact:'A产品的发布计划正在制定中。',source:'团队工作计划'}]}), encoding:'utf8'})).results[0];
if (futurePlan.status !== 'needs_more_information' || 'reply_draft' in futurePlan || !futurePlan.needed_fields.some(field => field.includes('发布日期'))) throw new Error('正在制定发布计划不能被当作已确定发布日期');
const noReleaseDate = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['新功能什么时候上线？'], sources:[{id:'a',fact:'新功能确认会上线。',source:'已批准功能介绍'}]}), encoding:'utf8'})).results[0];
if (noReleaseDate.status !== 'needs_more_information' || 'reply_draft' in noReleaseDate) throw new Error('确认会发布但没有日期的事实不能回答“什么时候上线”');
const shippingTime = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['订单什么时候发货？'], sources:[{id:'shipping',fact:'订单付款后48小时内发货。',source:'批准物流政策'}]}), encoding:'utf8'})).results[0];
if (shippingTime.status !== 'draft' || !shippingTime.reply_draft.includes('48小时内发货')) throw new Error('发货时间问题应由批准的配送时效回答');
const refundTime = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['退款什么时候到账？'], sources:[{id:'refund',fact:'退款将在3个工作日内到账。',source:'批准售后政策'}]}), encoding:'utf8'})).results[0];
if (refundTime.status !== 'draft' || !refundTime.reply_draft.includes('3个工作日内到账')) throw new Error('退款到账问题应由批准的售后时效回答');
const warrantyUpdated = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['A产品保修多久？'], sources:[{id:'warranty',fact:'A产品保修政策已更新。',source:'售后公告'}]}), encoding:'utf8'})).results[0];
if (warrantyUpdated.status !== 'needs_more_information' || 'reply_draft' in warrantyUpdated) throw new Error('保修政策已更新不能回答保修时长');
const runOne = (question, fact) => JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:[question], sources:[{id:'approved',fact,source:'批准材料'}]}), encoding:'utf8'})).results[0];
// Reviewer regressions: keep the exact reported inputs executable here. These
// assertions protect the safety boundary, policy-condition parsing, direct
// free-form conclusions, answer scoping, and evidence metadata redaction.
const unknownInventory = runOne('A产品现在有库存吗？', 'A产品有货状态未知，售价100元。');
if (unknownInventory.status !== 'needs_more_information' || 'reply_draft' in unknownInventory || !unknownInventory.needed_fields.some(field => field.includes('库存'))) throw new Error('库存状态未知不能被当作有货结论');
const preDispatchRefund = runOne('发货前可以退款吗？', '订单发货前可以退款。');
if (preDispatchRefund.status !== 'draft' || !preDispatchRefund.reply_draft.includes('发货前可以退款') || preDispatchRefund.needed_fields?.some(field => /发货日期|时效/u.test(field))) throw new Error('发货前是退款政策条件，不应被误判为发货时效');
const postArrivalReturn = runOne('到货后可以退货吗？', '订单到货后可以退货。');
if (postArrivalReturn.status !== 'draft' || !postArrivalReturn.reply_draft.includes('到货后可以退货') || postArrivalReturn.needed_fields?.some(field => /配送/u.test(field))) throw new Error('到货后是退货政策条件，不应被误判为配送信息');
for (const [question, fact, expected] of [
  ['课程难度如何？', '入门课程难度为初级。', '初级'],
  ['A产品能在户外使用吗？', 'A产品可以在户外使用。', '户外使用']
]) {
  const direct = runOne(question, fact);
  if (direct.status !== 'draft' || !direct.reply_draft.includes(expected)) throw new Error(`明确自由问答结论未被采用：${question}`);
}
const scopedUsage = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['A产品怎么使用？'], sources:[{id:'usage',fact:'A产品使用方法是先开机，然后点击开始，B产品售价200元。',source:'使用说明'}]}), encoding:'utf8'})).results[0];
if (scopedUsage.status !== 'draft' || !scopedUsage.reply_draft.includes('先开机') || /B产品|200元/u.test(scopedUsage.reply_draft) || scopedUsage.evidence.some(item => item.facts.some(fact => /B产品|200元/u.test(fact)))) throw new Error('使用问题的交付不得带出同一材料中其他商品的售价');
const redactedEvidence = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['A产品怎么使用？'], sources:[{id:'usage?access_token=SECRET123',fact:'A产品使用方法是先开机，然后点击开始。',source:'https://example.com/policy?access_token=SECRET123'}]}), encoding:'utf8'})).results[0];
if (redactedEvidence.status !== 'draft' || JSON.stringify(redactedEvidence.evidence).includes('SECRET123') || !redactedEvidence.evidence[0]?.source.includes('[已省略]') || !redactedEvidence.evidence[0]?.id.includes('[已省略]')) throw new Error('证据 ID 和来源中的凭据必须脱敏');
const googleSignedEvidence = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['A产品怎么使用？'], sources:[{id:'gcs',fact:'A产品使用方法是先开机，然后点击开始。',source:'https://storage.googleapis.com/bucket/object?X-Goog-Credential=private-credential&X-Goog-Signature=private-signature'}]}), encoding:'utf8'})).results[0];
if (googleSignedEvidence.status !== 'draft' || /private-credential|private-signature/u.test(JSON.stringify(googleSignedEvidence.evidence)) || !googleSignedEvidence.evidence[0]?.source.includes('X-Goog-Credential=[已省略]')) throw new Error('Google Cloud 签名 URL 参数必须从证据来源脱敏');
const conflictingSuitability = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['晨曦杯适合儿童吗？'], sources:[{id:'suitable',fact:'晨曦杯适合儿童。',source:'产品说明'},{id:'unsuitable',fact:'晨曦杯不适合儿童。',source:'安全说明'}]}), encoding:'utf8'})).results[0];
if (conflictingSuitability.status !== 'needs_more_information' || 'reply_draft' in conflictingSuitability) throw new Error('同一对象互斥的适用人群结论必须要求作者确认');
const reviewerPriceRange = runOne('A产品价格是多少？', 'A产品价格为100元至200元。');
if (reviewerPriceRange.status !== 'draft' || !reviewerPriceRange.reply_draft.includes('价格区间为100元至200元') || /售价100元。/u.test(reviewerPriceRange.reply_draft)) throw new Error('价格范围不得改写为单一定价');
for (const [question, fact] of [['A产品可以退货吗？', 'A产品提供退货入口。'], ['A产品可以退款吗？', 'A产品提供退款入口。'], ['A产品支持Android吗？', 'A产品未测试是否支持Android。'], ['A产品支持Android吗？', 'A产品是否支持Android尚不清楚。'], ['订单什么时候发货？', '订单将在3天内禁止发货。'], ['订单什么时候送达？', '订单在3天内尚不能送达。']]) {
  const out = runOne(question, fact);
  if (out.status !== 'needs_more_information' || 'reply_draft' in out) throw new Error(`入口、未知或否定措辞不得生成结论：${fact}`);
}
const redactedFact = runOne('A产品怎么使用？', 'A产品使用方法是先开机；临时凭据 sk-proj-ABCDEF1234567890，GitHub 凭据 ghp_ABCDEF1234567890。');
if (redactedFact.status !== 'draft' || /sk-proj-ABCDEF1234567890|ghp_ABCDEF1234567890/u.test(JSON.stringify(redactedFact))) throw new Error('材料事实中的裸凭据必须从草稿和依据中脱敏');
for (const [question, fact] of [
  ['A产品售价是多少？', 'A产品售价为100元或200元。'],
  ['A产品售价是多少？', 'A产品售价100元左右。'],
  ['A产品有货吗？', 'A产品目前有货或无货。']
]) {
  const unresolved = runOne(question, fact);
  if (unresolved.status !== 'needs_more_information' || 'reply_draft' in unresolved) throw new Error(`不确定或互斥结论不得生成草稿：${fact}`);
}
const reviewerRefundDestination = runOne('A产品退款会原路退回吗？', 'A产品退款原路退回至原支付账户。');
if (reviewerRefundDestination.status !== 'draft' || !reviewerRefundDestination.reply_draft.includes('原路退回至原支付账户')) throw new Error('原路退回问法应使用明确的退款去向依据');
for (const question of ['周末几点营业？', '店铺什么时候开门？']) {
  const hours = runOne(question, '周末10:00至18:00营业。');
  if (hours.status !== 'draft' || !hours.reply_draft.includes('10:00至18:00')) throw new Error(`营业时间核心问法不应被误识别为商品：${question}`);
}
for (const [question, fact, expected] of [
  ['入门课程有作业吗？', '入门课程有课后作业。', '课后作业'],
  ['直播支持回放吗？', '直播支持回放。', '支持回放'],
  ['晨曦杯可以放洗碗机吗？', '晨曦杯可以放入洗碗机清洗。', '放入洗碗机']
]) {
  const direct = runOne(question, fact);
  if (direct.status !== 'draft' || !direct.reply_draft.includes(expected)) throw new Error(`常见功能问答应按直接结论回答：${question}`);
}
for (const [question, fact] of [
  ['剪辑教程第2步适用哪个版本？', '调色教程第2步仅适用于 v2。'],
  ['晨曦系列是什么材质？', '暮色系列材质为玻璃。']
]) {
  const mismatch = runOne(question, fact);
  if (mismatch.status !== 'needs_more_information' || 'reply_draft' in mismatch) throw new Error(`不同的教程或产品系列名称不能交叉回答：${question}`);
}
const stockPageAsAnswer = runOne('A产品有库存吗？', 'A产品有库存页面可查看。');
if (stockPageAsAnswer.status !== 'needs_more_information' || 'reply_draft' in stockPageAsAnswer) throw new Error('库存页面可查看不能代替明确有货/无货结论');
const bothPayersDenied = runOne('A产品退货运费由谁承担？', 'A产品退货运费商家不承担，买家也不承担。');
if (bothPayersDenied.status !== 'needs_more_information' || 'reply_draft' in bothPayersDenied) throw new Error('买卖双方都不承担时不能生成承担方结论');
const otherPlatformPending = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input:JSON.stringify({tone:'简洁',questions:['A产品支持iOS吗？'],sources:[{id:'ios',fact:'A产品支持iOS。',source:'批准兼容表'},{id:'android',fact:'A产品是否支持Android仍在测试。',source:'版本验证记录'}]}),encoding:'utf8'})).results[0];
if (otherPlatformPending.status !== 'draft' || !otherPlatformPending.reply_draft.includes('支持iOS')) throw new Error('Android待测试状态不能使iOS兼容结论待确认');
const correctedRefundReason = runOne('A产品退款失败的原因是什么？', 'A产品退款失败不是因为系统错误，实际原因是账户冻结。');
if (correctedRefundReason.status !== 'draft' || !correctedRefundReason.reply_draft.includes('账户冻结') || correctedRefundReason.reply_draft.includes('系统错误')) throw new Error('明确的退款失败原因更正应保留实际原因');
const runMany = (question, facts) => JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:[question], sources:facts.map((fact,index)=>({id:`source-${index}`,fact,source:`批准材料${index}`}))}), encoding:'utf8'})).results[0];
for (const [question, fact] of [
  ['A产品售价是多少？','A产品售价据说是100元。'],
  ['A产品什么时候上线？','A产品有望于2027年上线。'],
  ['A产品什么时候发布？','A产品将于2027年5月发布公告。']
]) { const out=runOne(question,fact); if(out.status!=='needs_more_information'||'reply_draft' in out) throw new Error('传闻、预期或公告日期不能当作已批准的价格/上线事实'); }
for (const [question, fact] of [
  ['A产品现在有货吗？','A产品有货说明已删除。'],
  ['A产品能退款吗？','A产品支持退款进度查询。'],
  ['A产品支持蓝牙吗？','A产品支持蓝牙设备退货。']
]) { const out=runOne(question,fact); if(out.status!=='needs_more_information'||'reply_draft' in out) throw new Error('相近主题或已删除的说明不能代替库存、退款许可或兼容结论'); }
const privateCost = runOne('A产品售价是多少？','A产品售价100元且内部成本为20元。');
if(privateCost.status!=='draft'||!privateCost.reply_draft.includes('售价100元')||privateCost.reply_draft.includes('成本')) throw new Error('回答售价时不得带出未询问的内部成本');
const privateCostAfterComma = runOne('A产品怎么使用？', 'A产品使用方法是先开机，然后点击开始，内部成本为30元。');
if (privateCostAfterComma.status !== 'draft' || privateCostAfterComma.reply_draft.includes('内部成本') || privateCostAfterComma.reply_draft.includes('30元') || privateCostAfterComma.evidence.some(item => item.facts.some(text => text.includes('内部成本') || text.includes('30元')))) throw new Error('逗号连接的内部成本不能进入操作答复或证据');
const changedDispatchDates = runMany('订单哪天发货？',['订单将于2027年5月1日发货。','订单将于2027年5月2日发货。']);
if(changedDispatchDates.status!=='needs_more_information'||'reply_draft' in changedDispatchDates) throw new Error('不同日历日期的发货结论必须要求确认');
for(const [question,facts] of [
  ['A产品成本是多少？',['A产品成本为20元。','A产品成本为30元。']],
  ['A产品优惠是多少？',['A产品立减20元。','A产品立减30元。']],
  ['A产品安全吗？',['A产品通过安全认证。','A产品不安全。']]
]) { const out=runMany(question,facts); if(out.status!=='needs_more_information'||'reply_draft' in out) throw new Error('互相冲突的成本、优惠或安全结论必须要求确认'); }
const wrongTutorialStep = runOne('教程第3步适用哪个版本？', '教程第2步仅适用于 v2。');
if (wrongTutorialStep.status !== 'needs_more_information' || 'reply_draft' in wrongTutorialStep) throw new Error('第2步版本事实不能回答第3步');
const oppositeBooking = runOne('可以取消预约吗？', '目前可以预约。');
if (oppositeBooking.status !== 'needs_more_information' || 'reply_draft' in oppositeBooking) throw new Error('可预约不能回答能否取消预约');
for (const fact of ['A产品将于周五停止发布。', 'A产品周五发布维护更新。']) {
  const wrongLaunchEvent = runOne('A产品什么时候上线？', fact);
  if (wrongLaunchEvent.status !== 'needs_more_information' || 'reply_draft' in wrongLaunchEvent) throw new Error('停止发布或维护更新不能回答首次上线时间');
}
const matchingVariant = runOne('A产品红色款有货吗？', 'A产品红色款目前有货。');
if (matchingVariant.status !== 'draft' || !matchingVariant.reply_draft.includes('红色款目前有货')) throw new Error('商品与红色款组合事实应能回答同一款式库存问题');
const pendingReturnPolicy = runOne('A产品可以退货吗？', 'A产品退货政策正在更新。');
if (pendingReturnPolicy.status !== 'needs_more_information' || 'reply_draft' in pendingReturnPolicy) throw new Error('退货政策更新中不能回答是否可退货');
const otherCoursePrice = runOne('春季课程多少钱？', '秋季课程售价499元。');
if (otherCoursePrice.status !== 'needs_more_information' || 'reply_draft' in otherCoursePrice) throw new Error('秋季课程价格不能回答春季课程价格');
const otherFeatureSchedule = runOne('夜读功能什么时候上线？', '白噪音功能将于2027年上线。');
if (otherFeatureSchedule.status !== 'needs_more_information' || 'reply_draft' in otherFeatureSchedule) throw new Error('其他功能的时间不能回答夜读功能上线时间');
for (const fact of ['A产品上线方案将在2027年提交审批。','A产品发布会定于2027年5月举行。']) {
  const misleadingEvent = runOne('A产品什么时候上线？', fact);
  if (misleadingEvent.status !== 'needs_more_information' || 'reply_draft' in misleadingEvent) throw new Error('上线方案审批或发布会日期不能回答产品上线时间');
}
const dispatchPageUpdated = runOne('订单什么时候发货？', '发货政策已更新。');
if (dispatchPageUpdated.status !== 'needs_more_information' || 'reply_draft' in dispatchPageUpdated) throw new Error('发货政策更新不能回答发货时效');
const deliveryPageUpdated = runOne('订单什么时候到货？', '物流页面已经更新。');
if (deliveryPageUpdated.status !== 'needs_more_information' || 'reply_draft' in deliveryPageUpdated) throw new Error('物流页面更新不能回答到货时效');
const activityRegistration = runOne('活动几点开始？', '活动可以开始报名。');
if (activityRegistration.status !== 'needs_more_information' || 'reply_draft' in activityRegistration) throw new Error('开始报名不能回答活动开始时间');
const unrelatedEventTime = runOne('活动几点开始？', 'A产品发布会定于2027年5月举行。');
if (unrelatedEventTime.status !== 'needs_more_information' || 'reply_draft' in unrelatedEventTime) throw new Error('其他事件日期不能回答活动开始时间');
for (const [question,fact,expected] of [
  ['A产品有货吗？','A产品，当前有货。','当前有货'],
  ['A产品多少钱？','A产品，售价100元。','售价100元'],
  ['A产品什么时候上线？','A产品，计划于2027年5月上线。','2027年5月上线']
]) {
  const commaSeparatedEvidence = runOne(question, fact);
  if (commaSeparatedEvidence.status !== 'draft' || !commaSeparatedEvidence.reply_draft.includes(expected)) throw new Error('逗号分隔的对象和结论仍属于同一条批准事实');
}
const returnPolicyWithoutConclusion = runOne('A产品可以退货吗？', 'A产品退货政策详见官网。');
if (returnPolicyWithoutConclusion.status !== 'needs_more_information' || 'reply_draft' in returnPolicyWithoutConclusion) throw new Error('只有退货政策关键词而无结论不能起草');
const returnPolicyConclusion = runOne('A产品可以退货吗？', 'A产品支持签收后七天内退货。');
if (returnPolicyConclusion.status !== 'draft' || !returnPolicyConclusion.reply_draft.includes('七天内退货')) throw new Error('明确退货结论应能起草');
const warrantyPeriod = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['A产品保修多久？'], sources:[{id:'warranty',fact:'A产品保修2年。',source:'批准质保政策'}]}), encoding:'utf8'})).results[0];
if (warrantyPeriod.status !== 'draft' || !warrantyPeriod.reply_draft.includes('保修2年')) throw new Error('明确保修年限应能回答时长问题');
for (const [question,fact] of [
  ['A产品什么时候上线？','A产品不在2027年5月上线。'],
  ['订单什么时候发货？','订单不会在48小时内发货。'],
  ['退款什么时候到账？','退款不会在3个工作日内到账。']
]) {
  const deniedTime = runOne(question, fact);
  if (deniedTime.status !== 'needs_more_information' || 'reply_draft' in deniedTime) throw new Error(`否定的业务时效不能作为答案：${fact}`);
}
for (const fact of ['退款失败不是因为余额不足。','退款失败并非由于系统错误。']) {
  const excludedCause = runOne('退款失败是什么原因？', fact);
  if (excludedCause.status !== 'needs_more_information' || 'reply_draft' in excludedCause) throw new Error(`被否定的退款原因不能作为实际原因：${fact}`);
}
const deniedReturnPayer = runOne('A产品退货运费谁承担？', 'A产品退货运费商家不承担。');
if (deniedReturnPayer.status !== 'needs_more_information' || 'reply_draft' in deniedReturnPayer) throw new Error('被否定的运费承担方不能作为实际承担方');
const exchangeDeadline = runOne('A产品换货期限是多久？', 'A产品换货期限为签收后7天。');
if (exchangeDeadline.status !== 'draft' || !exchangeDeadline.reply_draft.includes('签收后7天')) throw new Error('标准“换货期限为签收后7天”表达应能回答');
const conflictingWarrantyScope = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['A产品质保范围有哪些？'], sources:[{id:'w1',fact:'A产品保修范围仅覆盖主板。',source:'批准质保政策 10:00'},{id:'w2',fact:'A产品保修范围仅覆盖电池。',source:'批准质保政策 10:05'}]}), encoding:'utf8'})).results[0];
if (conflictingWarrantyScope.status !== 'needs_more_information' || 'reply_draft' in conflictingWarrantyScope || !conflictingWarrantyScope.message.includes('互相冲突')) throw new Error('相互冲突的保修范围必须要求确认当前结论');
const refundAmountAsPrice = runOne('A产品多少钱？', 'A产品退款金额为100元。');
if (refundAmountAsPrice.status !== 'needs_more_information' || 'reply_draft' in refundAmountAsPrice) throw new Error('退款金额不能冒充商品售价');
const inventoryPageAsNegative = runOne('A产品现在有库存吗？', 'A产品没有库存页面。');
if (inventoryPageAsNegative.status !== 'needs_more_information' || 'reply_draft' in inventoryPageAsNegative) throw new Error('缺少库存页面不等于确认无库存');
for (const fact of ['A产品使用方法详见官网。','A产品使用方法已更新。']) {
  const vagueUsage = runOne('A产品怎么使用？', fact);
  if (vagueUsage.status !== 'needs_more_information' || 'reply_draft' in vagueUsage) throw new Error(`只有页面指向或更新通知不能回答使用步骤：${fact}`);
}
const directUsage = runOne('A产品怎么使用？', 'A产品使用方法是先打开电源，再点击开始即可运行。');
if (directUsage.status !== 'draft' || !directUsage.reply_draft.includes('先打开电源')) throw new Error('包含明确操作步骤的使用方法应能回答');
// Reviewer regressions: an approval workflow is not a launch commitment;
// every sub-question must be supported; ordinary direct answers and
// unasked contact details must be handled safely.
const pendingApprovalLaunch = runOne('A产品什么时候上线？', 'A产品尚待审批，计划于2027年7月上线。');
if (pendingApprovalLaunch.status !== 'needs_more_information' || 'reply_draft' in pendingApprovalLaunch) throw new Error('审批中的上线计划不得写成确定回复');
const partialCourseAnswer = runOne('入门课程有几节，适合谁？', '入门课程共包含12节内容。');
if (partialCourseAnswer.status !== 'needs_more_information' || 'reply_draft' in partialCourseAnswer || !partialCourseAnswer.needed_fields.includes('适用人群')) throw new Error('课程节数不能代替适用人群的复合回答');
const partialSafetyAnswer = runOne('A产品安全吗，怎么清洗？', 'A产品通过安全认证。');
if (partialSafetyAnswer.status !== 'needs_more_information' || 'reply_draft' in partialSafetyAnswer || !partialSafetyAnswer.needed_fields.includes('清洗方法')) throw new Error('安全依据不能代替清洗方法的复合回答');
const directProblemAnswer = runOne('A产品主要解决什么问题？', 'A产品主要解决夜间照明不足的问题。');
if (directProblemAnswer.status !== 'draft' || !directProblemAnswer.reply_draft.includes('夜间照明不足')) throw new Error('明确的问题解决结论应支持自由问答');
const directParticipationAnswer = runOne('这次活动怎么参加？', '这次活动可在小程序填写报名表参加。');
if (directParticipationAnswer.status !== 'draft' || !directParticipationAnswer.reply_draft.includes('小程序填写报名表')) throw new Error('明确的活动参加方式应支持自由问答');
const unaskedTelephone = runOne('A产品有货吗？', 'A产品有货，联系人张三，电话010-12345678。');
if (unaskedTelephone.status !== 'draft' || /张三|电话|010-12345678/u.test(JSON.stringify(unaskedTelephone))) throw new Error('未询问的联系人和座机不得出现在草稿或依据中');
for (const [question,facts] of [
  ['A产品有库存吗？',['A产品库存剩余8件。','A产品库存剩余12件。']],
  ['A产品支持退货吗？',['A产品支持签收后7天内退货。','A产品支持签收后14天内退货。']]
]) {
  const conflict = JSON.parse(execFileSync(process.execPath,[resolve(root,'scripts/draft-answers.mjs'),'-'],{input:JSON.stringify({tone:'简洁',questions:[question],sources:facts.map((fact,i)=>({id:`c${i}`,fact,source:`批准材料 ${i}`}))}),encoding:'utf8'})).results[0];
  if (conflict.status !== 'needs_more_information' || 'reply_draft' in conflict || !conflict.message.includes('互相冲突')) throw new Error(`互斥材料不能直接拼进草稿：${question}`);
}
const approximateWarranty = runOne('A产品保修多久？','A产品保修约2年。');
if (approximateWarranty.status !== 'needs_more_information' || 'reply_draft' in approximateWarranty) throw new Error('模糊保修时长不能作为肯定期限');
const liveTopic = runOne('这次直播的主题是什么？','这次直播的主题是秋季护肤。');
if (liveTopic.status !== 'draft' || !liveTopic.reply_draft.includes('秋季护肤')) throw new Error('明确写有直播主题的直接事实应支持普通问答');
const lectureLocation = runOne('这个讲座的地点是什么？','这个讲座的地点是三楼报告厅。');
if (lectureLocation.status !== 'draft' || !lectureLocation.reply_draft.includes('三楼报告厅')) throw new Error('明确的普通主语加结论不应依赖直播主题等硬编码意图');
const chineseProductMismatch = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['晨曦杯现在有库存吗？'], sources:[{id:'other',fact:'暮色杯目前有库存。',source:'批准库存表'}]}), encoding:'utf8'})).results[0];
if (chineseProductMismatch.status !== 'needs_more_information' || 'reply_draft' in chineseProductMismatch) throw new Error('中文商品名不同的库存事实不能互相回答');
const modelCompatibilityMismatch = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['X100兼容安卓吗？'], sources:[{id:'x200',fact:'X200支持安卓。',source:'批准兼容表'}]}), encoding:'utf8'})).results[0];
if (modelCompatibilityMismatch.status !== 'needs_more_information' || 'reply_draft' in modelCompatibilityMismatch) throw new Error('不同型号的兼容事实不能互相回答');
const phoneModelMismatch = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['iPhone 15多少钱？'], sources:[{id:'phone',fact:'华为P70售价5999元。',source:'批准价目表'}]}), encoding:'utf8'})).results[0];
if (phoneModelMismatch.status !== 'needs_more_information' || 'reply_draft' in phoneModelMismatch) throw new Error('不同品牌型号的价格事实不能互相回答');
const namedEditionMismatch = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['星河 Pro多少钱？'], sources:[{id:'other-edition',fact:'暮光 Pro售价5999元。',source:'批准价目表'}]}), encoding:'utf8'})).results[0];
if (namedEditionMismatch.status !== 'needs_more_information' || 'reply_draft' in namedEditionMismatch) throw new Error('不同无数字中英文型号的价格事实不能互相回答');
const colorStockMismatch = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['红色有货吗？'], sources:[{id:'blue',fact:'蓝色目前有货。',source:'批准库存表'}]}), encoding:'utf8'})).results[0];
if (colorStockMismatch.status !== 'needs_more_information' || 'reply_draft' in colorStockMismatch) throw new Error('不同颜色款式的库存事实不能互相回答');
const splitProducts = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['请问晨曦杯和暮色杯有库存吗？'], sources:[{id:'a',fact:'晨曦杯目前有库存。',source:'批准库存表'},{id:'b',fact:'暮色杯目前缺货。',source:'批准库存表'}]}), encoding:'utf8'})).results[0];
if (splitProducts.status !== 'draft' || !splitProducts.reply_draft.includes('晨曦杯') || !splitProducts.reply_draft.includes('暮色杯')) throw new Error('礼貌前缀或并列商品名不应被合并成未知商品');
const inventoryPageOnly = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['A产品有库存吗？'], sources:[{id:'page',fact:'A产品库存页面已更新。',source:'店铺通知'}]}), encoding:'utf8'})).results[0];
if (inventoryPageOnly.status !== 'needs_more_information' || 'reply_draft' in inventoryPageOnly) throw new Error('库存页面更新不能冒充有货或无货结论');
const pricePageOnly = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['A产品多少钱？'], sources:[{id:'page',fact:'A产品价格页面已更新。',source:'店铺通知'}]}), encoding:'utf8'})).results[0];
if (pricePageOnly.status !== 'needs_more_information' || 'reply_draft' in pricePageOnly) throw new Error('价格页面更新不能冒充实际售价');
const bluetoothMismatch = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['A产品是否支持蓝牙？'], sources:[{id:'returns',fact:'A产品支持七天退货。',source:'批准售后政策'}]}), encoding:'utf8'})).results[0];
if (bluetoothMismatch.status !== 'needs_more_information' || 'reply_draft' in bluetoothMismatch) throw new Error('退货政策不能冒充蓝牙兼容结论');
const weekdaySchedule = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['A产品什么时候上线？'], sources:[{id:'weekday',fact:'A产品将于周五上线。',source:'批准发布计划'}]}), encoding:'utf8'})).results[0];
if (weekdaySchedule.status !== 'draft' || !weekdaySchedule.reply_draft.includes('周五')) throw new Error('周几上线是有效的已批准时间表');
const yearSchedule = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['A产品什么时候上线？'], sources:[{id:'year',fact:'A产品将于2027年上线。',source:'批准发布计划'}]}), encoding:'utf8'})).results[0];
if (yearSchedule.status !== 'draft' || !yearSchedule.reply_draft.includes('2027年')) throw new Error('仅明确年份也是有效的已批准时段');
const invalidPriceSource = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['A产品价格和库存如何？'], sources:[{id:'',fact:'A产品售价100元。',source:''},{id:'stock',fact:'A产品目前有库存。',source:'批准库存表'}]}), encoding:'utf8'})).results[0];
if (invalidPriceSource.status !== 'needs_more_information' || 'reply_draft' in invalidPriceSource || !invalidPriceSource.needed_fields.some(field => field.includes('价格'))) throw new Error('缺少ID/来源的价格材料不能补齐多字段答案');
const conflictingStock = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['A产品有库存吗？'], sources:[{id:'s1',fact:'A产品目前有库存。',source:'库存表 10:00'},{id:'s2',fact:'A产品目前已售罄。',source:'库存表 10:05'}]}), encoding:'utf8'})).results[0];
if (conflictingStock.status !== 'needs_more_information' || 'reply_draft' in conflictingStock || !conflictingStock.message.includes('互相冲突')) throw new Error('同一商品互相冲突的库存批准材料必须暂停起草');
const platformSchedule = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['安卓端什么时候上线？'], sources:[{id:'ios',fact:'iOS端计划于2027年5月上线。',source:'批准版本计划'}]}), encoding:'utf8'})).results[0];
if (platformSchedule.status !== 'needs_more_information' || 'reply_draft' in platformSchedule) throw new Error('iOS发布日期不能回答安卓端上线时间');
const crossFieldProducts = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['A产品库存？B产品价格？'], sources:[{id:'a-price',fact:'A产品售价100元。',source:'批准价目表'},{id:'b-stock',fact:'B产品目前有库存。',source:'批准库存表'}]}), encoding:'utf8'})).results[0];
if (crossFieldProducts.status !== 'needs_more_information' || 'reply_draft' in crossFieldProducts || !crossFieldProducts.needed_fields.some(field => field.includes('A产品') && field.includes('库存')) || !crossFieldProducts.needed_fields.some(field => field.includes('B产品') && field.includes('售价'))) throw new Error('多个商品的事实不可跨商品或跨字段回答');
const clauseScopedFull = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input:JSON.stringify({tone:'简洁',questions:['A产品多少钱，B产品有货吗？'],sources:[{id:'ap',fact:'A产品售价100元。',source:'批准价目表'},{id:'bi',fact:'B产品有货。',source:'批准库存表'}]}),encoding:'utf8'})).results[0];
if (clauseScopedFull.status !== 'draft' || !clauseScopedFull.reply_draft.includes('100元') || !clauseScopedFull.reply_draft.includes('B产品有货')) throw new Error('分句分别询问商品字段时应按各自商品匹配，不生成笛卡尔组合');
const colorVariantsBoth = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input:JSON.stringify({tone:'简洁',questions:['红色款和蓝色款有货吗？'],sources:[{id:'red',fact:'红色款有货。',source:'批准库存表'},{id:'blue',fact:'蓝色款缺货。',source:'批准库存表'}]}),encoding:'utf8'})).results[0];
if (colorVariantsBoth.status !== 'draft' || !colorVariantsBoth.reply_draft.includes('红色款有货') || !colorVariantsBoth.reply_draft.includes('蓝色款缺货')) throw new Error('并列款式的共同字段问题必须逐款回答');
const zeroStockConflict = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['A产品有库存吗？'], sources:[{id:'s1',fact:'A产品目前有库存。',source:'库存表 10:00'},{id:'s2',fact:'A产品库存为0。',source:'库存表 10:05'}]}), encoding:'utf8'})).results[0];
if (zeroStockConflict.status !== 'needs_more_information' || 'reply_draft' in zeroStockConflict || !zeroStockConflict.message.includes('互相冲突')) throw new Error('数值库存为0必须识别为无库存并拦截冲突');
const noStockConflict = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['A产品有库存吗？'], sources:[{id:'s1',fact:'A产品目前有货。',source:'库存表 10:00'},{id:'s2',fact:'A产品没有库存。',source:'库存表 10:05'}]}), encoding:'utf8'})).results[0];
if (noStockConflict.status !== 'needs_more_information' || 'reply_draft' in noStockConflict || !noStockConflict.message.includes('互相冲突')) throw new Error('“没有库存”必须作为明确无货并拦截冲突');
const numericStockConflict = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['A产品有库存吗？'], sources:[{id:'s1',fact:'A产品库存为12件。',source:'库存表 10:00'},{id:'s2',fact:'A产品没有货。',source:'库存表 10:05'}]}), encoding:'utf8'})).results[0];
if (numericStockConflict.status !== 'needs_more_information' || 'reply_draft' in numericStockConflict || !numericStockConflict.message.includes('互相冲突')) throw new Error('正数库存与“没有货”必须识别为库存冲突');
const productionDate = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['A产品什么时候发布？'], sources:[{id:'production',fact:'A产品生产日期为2026年9月。',source:'产品铭牌'}]}), encoding:'utf8'})).results[0];
if (productionDate.status !== 'needs_more_information' || 'reply_draft' in productionDate) throw new Error('生产日期不能冒充发布日期');
const nfcMismatch = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['A产品支持NFC吗？'], sources:[{id:'wireless',fact:'A产品支持蓝牙。',source:'批准规格表'}]}), encoding:'utf8'})).results[0];
if (nfcMismatch.status !== 'needs_more_information' || 'reply_draft' in nfcMismatch) throw new Error('蓝牙能力不能回答 NFC 支持问题');
const fastChargeMatch = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['A产品支持快充吗？'], sources:[{id:'charge',fact:'A产品支持快充。',source:'批准规格表'}]}), encoding:'utf8'})).results[0];
if (fastChargeMatch.status !== 'draft' || !fastChargeMatch.reply_draft.includes('快充')) throw new Error('问题中的具体能力应与同一能力事实配对');
const warrantyRefund = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['保修多久？'], sources:[{id:'refund',fact:'退款将在3个工作日内到账。',source:'批准售后政策'}]}), encoding:'utf8'})).results[0];
if (warrantyRefund.status !== 'needs_more_information' || 'reply_draft' in warrantyRefund) throw new Error('退款到账时效不能回答保修期限');
const dispatchDelivery = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['订单什么时候发货？'], sources:[{id:'arrival',fact:'订单预计3天后到货。',source:'物流说明'}]}), encoding:'utf8'})).results[0];
if (dispatchDelivery.status !== 'needs_more_information' || 'reply_draft' in dispatchDelivery) throw new Error('到货时间不能回答发货时间');
for (const [question, facts] of [
  ['A产品什么时候到货？', ['A产品3天内到货。', 'A产品5天内到货。']],
  ['A产品什么时候上线？', ['A产品3天后上线。', 'A产品5天后上线。']]
]) {
  const conflict = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input:JSON.stringify({tone:'简洁',questions:[question],sources:facts.map((fact,i)=>({id:`relative-${i}`,fact,source:'批准时间表'}))}),encoding:'utf8'})).results[0];
  if (conflict.status !== 'needs_more_information' || 'reply_draft' in conflict || !conflict.message.includes('互相冲突')) throw new Error(`相对时效互斥值必须拦截：${question}`);
}
for (const [question, fact, expected, obsolete] of [
  ['退款什么时候到账？', '退款原定3天内到账。后来更正为5天内到账。', '5天内到账', '3天'],
  ['订单什么时候发货？', '订单原定24小时内发货。后来更正为48小时内发货。', '48小时内发货', '24小时']
]) {
  const corrected = runOne(question, fact);
  if (corrected.status !== 'draft' || !corrected.reply_draft.includes(expected) || corrected.reply_draft.includes(obsolete)) throw new Error(`明确的后续时效更正应覆盖旧值：${question}`);
}
for (const [question, oldFact, correction, expected] of [
  ['退款什么时候到账？', '退款原定3天内到账。', '后来更正为5天内到账。', '5天内到账'],
  ['订单什么时候发货？', '订单原定24小时内发货。', '后来更正为48小时内发货。', '48小时内发货'],
  ['A产品什么时候上线？', 'A产品原定3天后上线。', '后来更正为5天后上线。', '5天后上线']
]) {
  const corrected = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:[question], sources:[{id:'old', fact:oldFact, source:'批准材料'},{id:'new', fact:correction, source:'批准材料'}]}), encoding:'utf8'})).results[0];
  if (corrected.status !== 'draft' || !corrected.reply_draft.includes(expected) || corrected.evidence.some(item => item.id === 'old')) throw new Error(`跨材料的明确后续更正应覆盖旧值：${question}`);
}
for (const [question, fact, expected] of [
  ['A产品优惠多少钱？', 'A产品立减20元。', '立减20元'],
  ['A产品成本多少钱？', 'A产品成本为20元。', '成本为20元']
]) {
  const result = runOne(question, fact);
  if (result.status !== 'draft' || !result.reply_draft.includes(expected)) throw new Error(`价格问法必须匹配所问字段：${question}`);
}
const priceNotDiscount = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({tone:'简洁', questions:['A产品售价多少钱？'], sources:[{id:'deal',fact:'A产品优惠10元。',source:'活动说明'}]}), encoding:'utf8'})).results[0];
if (priceNotDiscount.status !== 'needs_more_information' || 'reply_draft' in priceNotDiscount) throw new Error('优惠金额不能冒充商品售价');
const formal = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], { input: JSON.stringify({...successInput, tone: '正式、专业'}), encoding: 'utf8' })).results[0];
if (!formal.reply_draft.startsWith('依据已批准资料，') || formal.reply_draft === success.reply_draft) throw new Error('tone 未改变回复表达');
const badTone = spawnSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], { input: JSON.stringify({...successInput, tone: '任意语气'}), encoding: 'utf8' });
if (badTone.status === 0) throw new Error('不支持的 tone 应被拒绝，不能静默忽略');
for (const textLength of [4974, 5000]) {
  const input = {tone: '简洁', questions: ['未覆盖的问题'], sources: [{id: 'i', fact: '甲'.repeat(textLength - 2), source: 's'}]};
  const result = spawnSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify(input), encoding: 'utf8'});
  if (result.status !== 0) throw new Error(`${textLength}字批准材料应可通过长度门槛`);
}
const tooLong = {tone: '简洁', questions: ['未覆盖的问题'], sources: [{id: 'i', fact: '甲'.repeat(4999), source: 's'}]};
if (spawnSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify(tooLong), encoding: 'utf8'}).status === 0) throw new Error('5001字批准材料应超过限制');
for (const file of ['SKILL.md', 'manifest.yaml', 'agents/openai.yaml', 'README.md', 'README.en.md', 'icon-512.png']) {
  try { readFileSync(resolve(root, file)); } catch { throw new Error(`缺少发布文件：${file}`); }
}
const icon = readFileSync(resolve(root, 'icon-512.png'));
if (icon.readUInt32BE(16) !== 512 || icon.readUInt32BE(20) !== 512) throw new Error('icon-512.png 必须是 512×512 PNG');
const manifest = readFileSync(resolve(root, 'manifest.yaml'), 'utf8');
const agent = readFileSync(resolve(root, 'agents/openai.yaml'), 'utf8');
if (!manifest.includes('name: selfmedia-community-answer-drafts-cn') || !manifest.includes('slug: selfmedia-community-answer-drafts-cn') || !manifest.includes('self_test: node scripts/self-test.mjs')) throw new Error('manifest 元数据不完整');
if (/^repository:\s*https:\/\/github\.com\/xxjrq\//mu.test(manifest)) throw new Error('GitHub Owner 未确认前，manifest 不得填写假仓库地址');
if (!agent.includes('allow_implicit_invocation: true') || agent.includes('../icon-512.png') || !agent.includes('$selfmedia-community-answer-drafts-cn')) throw new Error('agents 接口图标、策略或调用提示不合规');
const lampMismatch = runOne('晨曦灯多少钱？', '暮色灯售价100元。');
if (lampMismatch.status !== 'needs_more_information' || 'reply_draft' in lampMismatch) throw new Error('不同灯具名称不能互相套用售价');
const compatibilityMatch = runOne('X100兼容安卓吗？', 'X100支持安卓。');
if (compatibilityMatch.status !== 'draft' || !compatibilityMatch.reply_draft.includes('支持安卓')) throw new Error('兼容条件安卓不能被误判为第二个回答实体');
for(const target of ['NFC','USB-C','Android']){const match=runOne(`A产品支持${target}吗？`,`A产品支持${target}。`);if(match.status!=='draft'||!match.reply_draft.includes(`支持${target}`))throw new Error(`${target}兼容条件不得被当成第二个商品实体`);}
const compatibilityScopeLimit=runOne('A产品是否兼容安卓？','A产品支持安卓，但仅限B产品。');
if(compatibilityScopeLimit.status!=='needs_more_information'||'reply_draft' in compatibilityScopeLimit)throw new Error('转折后的适用对象限制必须与前半句结论一起保留');
for (const fact of ['A产品支持安卓；不过仅限B产品。', 'A产品支持安卓；然而只适用于B产品。']) {
  const contrastScopeLimit = runOne('A产品是否兼容安卓？', fact);
  if (contrastScopeLimit.status !== 'needs_more_information' || 'reply_draft' in contrastScopeLimit) throw new Error('不过/然而后的适用对象限制必须随兼容结论保留');
}
const eventStart = runOne('星火讲座什么时候举行？', '星火讲座定于10月8日举行。');
if (eventStart.status !== 'draft' || !eventStart.reply_draft.includes('10月8日')) throw new Error('明确讲座举行日期应能回答什么时候举行');
const attributePending = runOne('A产品是什么材质？', 'A产品材质信息正在整理。');
if (attributePending.status !== 'needs_more_information' || 'reply_draft' in attributePending) throw new Error('属性信息整理中不能冒充具体材质结论');
const crossObjectLaunch = runOne('会员中心什么时候上线？', '积分商城将于2027年5月上线。');
if (crossObjectLaunch.status !== 'needs_more_information' || 'reply_draft' in crossObjectLaunch) throw new Error('积分商城上线时间不能回答会员中心');
const crossPlatformCollection = runOne('微信公众号支持合集吗？', '抖音支持合集。');
if (crossPlatformCollection.status !== 'needs_more_information' || 'reply_draft' in crossPlatformCollection) throw new Error('抖音能力不能回答微信公众号');
const nameContainsColor = runOne('红果短剧支持合集吗？', '小红书支持合集。');
if (nameContainsColor.status !== 'needs_more_information' || 'reply_draft' in nameContainsColor) throw new Error('名称中的红字不能当作红色款并跨平台配对');
const pendingVersion = runOne('教程第2步适用哪个版本？', '教程第2步版本信息正在整理。');
if (pendingVersion.status !== 'needs_more_information' || 'reply_draft' in pendingVersion) throw new Error('整理中的版本信息不能冒充版本结论');
const vagueColor = runOne('A产品是什么颜色？', 'A产品颜色很好看。');
if (vagueColor.status !== 'needs_more_information' || 'reply_draft' in vagueColor) throw new Error('颜色评价不能冒充具体颜色值');
const modelAttribute = runOne('A产品是什么型号？', 'A产品型号为X100。');
if (modelAttribute.status !== 'draft' || !modelAttribute.reply_draft.includes('X100')) throw new Error('明确型号值应能生成草稿');
const differentSpeaker = runOne('星河音箱多少钱？', '暮光音箱售价299元。');
if (differentSpeaker.status !== 'needs_more_information' || 'reply_draft' in differentSpeaker) throw new Error('不同音箱商品不能互相套用价格');
const refundArrival = runOne('A产品退款多久到账？', 'A产品退款将在3个工作日内到账。');
if (refundArrival.status !== 'draft' || !refundArrival.reply_draft.includes('3个工作日')) throw new Error('退款到账时效问题中的“退款”不能误识别为商品实体');
const bluetoothFeature = runOne('A产品支持蓝牙功能吗？', 'A产品支持蓝牙功能。');
if (bluetoothFeature.status !== 'draft' || !bluetoothFeature.reply_draft.includes('蓝牙')) throw new Error('以“功能”结尾的谓语不能误识别为第二个商品');
const incompleteOpeningHours = runOne('店铺几点营业？', '店铺营业时间正在调整。');
if (incompleteOpeningHours.status !== 'needs_more_information' || 'reply_draft' in incompleteOpeningHours) throw new Error('营业时间调整通知不能冒充具体营业时段');
const incompleteDiscount = runOne('A产品有什么优惠？', 'A产品优惠政策已更新。');
if (incompleteDiscount.status !== 'needs_more_information' || 'reply_draft' in incompleteDiscount) throw new Error('优惠更新通知不能冒充具体优惠规则');
const incompleteCost = runOne('A产品成本多少？', 'A产品成本正在核算。');
if (incompleteCost.status !== 'needs_more_information' || 'reply_draft' in incompleteCost) throw new Error('成本核算中不能冒充具体成本数值');
const fiveGConflict = runOne('A产品是否支持5G？', 'A产品支持4G。');
if (fiveGConflict.status !== 'needs_more_information' || 'reply_draft' in fiveGConflict) throw new Error('4G能力不能回答5G兼容问题');
const bluetoothVersionConflict = runOne('A产品支持蓝牙5.3吗？', 'A产品支持蓝牙4.2。');
if (bluetoothVersionConflict.status !== 'needs_more_information' || 'reply_draft' in bluetoothVersionConflict) throw new Error('蓝牙4.2不能回答蓝牙5.3兼容问题');
const noPickupIsNotNoReturn = runOne('A产品可以退货吗？', 'A产品退货不支持上门取件。');
if (noPickupIsNotNoReturn.status !== 'needs_more_information' || 'reply_draft' in noPickupIsNotNoReturn) throw new Error('不支持上门取件不能代替是否允许退货的结论');
const airpodsMacbook = runOne('AirPods多少钱？', 'MacBook售价9999元。');
if (airpodsMacbook.status !== 'needs_more_information' || 'reply_draft' in airpodsMacbook) throw new Error('AirPods 问题不能套用 MacBook 价格');
const pendingPriceWithEstimate = runOne('A产品多少钱？', 'A产品价格尚未确定，预计100元。');
if (pendingPriceWithEstimate.status !== 'needs_more_information' || 'reply_draft' in pendingPriceWithEstimate) throw new Error('尚未确定的价格不能因带有预计数值而成为答案');
const testingCompatibility = runOne('A产品支持NFC吗？', 'A产品正在测试是否支持NFC。');
if (testingCompatibility.status !== 'needs_more_information' || 'reply_draft' in testingCompatibility) throw new Error('正在测试的兼容能力不能当作支持结论');
const delayedLaunch = runOne('A产品什么时候上线？', 'A产品预计2027年上线，现已延期且新日期未定。');
if (delayedLaunch.status !== 'needs_more_information' || 'reply_draft' in delayedLaunch) throw new Error('延期且新日期未定时不得引用旧预计日期');
const vagueRefundTime = runOne('退款什么时候到账？', '目前支持退款。');
if (vagueRefundTime.status !== 'needs_more_information' || 'reply_draft' in vagueRefundTime) throw new Error('退款许可不能冒充退款到账时效');
const mixedInventoryConflict = runOne('A产品有库存吗？', 'A产品已售罄，但B产品有货。A产品目前有库存。');
if (mixedInventoryConflict.status !== 'draft' || !mixedInventoryConflict.reply_draft.includes('目前有库存') || mixedInventoryConflict.reply_draft.includes('B产品')) throw new Error('同一材料的后续 A 商品库存状态优先，不能带入 B 商品库存');
for (const fact of ['A产品库存剩余8件，后来更正为0件。', 'A产品目前有货，目前库存待确认。']) {
  const updatedInventory = runOne('A产品现在有货吗？', fact);
  if (updatedInventory.status !== 'needs_more_information' || 'reply_draft' in updatedInventory) throw new Error(`更晚的库存更正或待确认状态必须覆盖旧库存：${fact}`);
}
const teaProductMismatch = runOne('蜜桃乌龙多少钱？', '茉莉绿茶售价20元。');
if(teaProductMismatch.status!=='needs_more_information'||'reply_draft' in teaProductMismatch)throw new Error('没有标准品类后缀的茶饮名称也必须按完整商品名匹配');
const yogurtVariantMismatch = runOne('蓝莓味酸奶有货吗？', '草莓味酸奶目前有货。');
if(yogurtVariantMismatch.status!=='needs_more_information'||'reply_draft' in yogurtVariantMismatch)throw new Error('口味商品名不能互相套用库存');
const politeTeaMatch = runOne('请问蜜桃乌龙多少钱？', '目前蜜桃乌龙售价20元。');
if(politeTeaMatch.status!=='draft'||!politeTeaMatch.reply_draft.includes('20元'))throw new Error('带礼貌语和状态词的普通商品名仍应按完整名称匹配');
const postponedAcrossSentences = runOne('A产品什么时候上线？', 'A产品原定2027年上线。现已延期，新日期未定。');
if(postponedAcrossSentences.status!=='needs_more_information'||'reply_draft' in postponedAcrossSentences)throw new Error('后句延期和新日期未定必须使前句预计日期失效');
const laterStockUpdate = runOne('A产品有货吗？', 'A产品上午有货。下午已售罄。');
if(laterStockUpdate.status!=='draft'||!laterStockUpdate.reply_draft.includes('已售罄'))throw new Error('后句省略商品名的售罄更新必须继承前句对象并覆盖早前库存');
const canceledLaunch = runOne('A产品什么时候上线？', 'A产品定于2027年5月取消上线。');
if(canceledLaunch.status!=='needs_more_information'||'reply_draft' in canceledLaunch)throw new Error('明确取消上线的日期不能当作上线承诺');
const bareProductCompatibility = runOne('蜜桃乌龙支持冷泡吗？', '茉莉绿茶支持冷泡。');
if(bareProductCompatibility.status!=='needs_more_information'||'reply_draft' in bareProductCompatibility)throw new Error('无标准品类后缀的茶饮名称不能跨商品回答能力');
const bareYogurtReturn = runOne('蓝莓酸奶可以退货吗？', '草莓酸奶支持七天退货。');
if(bareYogurtReturn.status!=='needs_more_information'||'reply_draft' in bareYogurtReturn)throw new Error('无标准品类后缀的口味商品名称不能跨商品回答政策');
const bareYogurtReturnMatch = runOne('蓝莓酸奶可以退货吗？', '蓝莓酸奶支持七天退货。');
if(bareYogurtReturnMatch.status!=='draft'||!bareYogurtReturnMatch.reply_draft.includes('七天退货'))throw new Error('普通商品名后的“可以”不能被误当作商品名称的一部分');
const refundReasonMissing = runOne('退款失败的原因是什么？', '目前支持退款。');
if(refundReasonMissing.status!=='needs_more_information'||'reply_draft' in refundReasonMissing)throw new Error('退款许可不能回答退款失败原因');
const returnShippingMissing = runOne('A产品退货需要谁承担运费？', 'A产品支持七天退货。');
if(returnShippingMissing.status!=='needs_more_information'||'reply_draft' in returnShippingMissing)throw new Error('允许退货不能回答退货运费承担方');
const unrelatedPendingSchedule = runOne('A产品什么时候上线？', 'A产品将于2027年5月上线。B产品上线日期待确认。');
if(unrelatedPendingSchedule.status!=='draft'||!unrelatedPendingSchedule.reply_draft.includes('2027年5月'))throw new Error('B产品未定的日期不能阻止A产品已有的确定时间');
const ambiguousInventory = runOne('有货吗？', 'A产品目前有货。B产品已售罄。');
if(ambiguousInventory.status!=='needs_more_information'||'reply_draft' in ambiguousInventory||!ambiguousInventory.needed_fields.some(field=>field.includes('商品或款式')))throw new Error('问题未指定商品且材料覆盖不同商品时必须先确认对象');
const uncertainInventory = runOne('A产品有货吗？', 'A产品可能有库存。');
if(uncertainInventory.status!=='needs_more_information'||'reply_draft' in uncertainInventory)throw new Error('可能有库存不是明确库存结论');
const ambiguousSchedule = JSON.parse(execFileSync(process.execPath,[resolve(root,'scripts/draft-answers.mjs'),'-'],{input:JSON.stringify({tone:'简洁',questions:['什么时候上线？'],sources:[{id:'a',fact:'A产品将于2027年5月上线。',source:'批准计划'},{id:'b',fact:'B产品上线日期待确认。',source:'计划'}]}),encoding:'utf8'})).results[0];
if(ambiguousSchedule.status!=='needs_more_information'||'reply_draft' in ambiguousSchedule)throw new Error('无对象上线问题即使只有一个材料可回答，也须先确认商品对象');
const refundReasonConcrete = runOne('退款失败的原因是什么？', '退款失败是由于账户余额不足。');
if(refundReasonConcrete.status!=='draft'||!refundReasonConcrete.reply_draft.includes('余额不足'))throw new Error('具体退款失败原因不必同时重复说明退款许可');
const returnShippingConcrete = runOne('A产品退货运费需要谁承担？', 'A产品退货运费由买家承担。');
if(returnShippingConcrete.status!=='draft'||!returnShippingConcrete.reply_draft.includes('买家承担'))throw new Error('具体退货运费承担方不必同时重复说明退货许可');
const negatedPrice = runOne('A产品多少钱？', 'A产品价格不是100元。');
if(negatedPrice.status!=='needs_more_information'||'reply_draft' in negatedPrice)throw new Error('否定的价格不能作为价格结论');
const correctedPrice = runOne('A产品多少钱？', 'A产品价格不是100元，实际售价200元。');
if(correctedPrice.status!=='draft'||!correctedPrice.reply_draft.includes('200元'))throw new Error('同句明确更正后的实际售价应可回答');
const negatedWarranty = runOne('A产品保修多久？', 'A产品保修不是2年。');
if(negatedWarranty.status!=='needs_more_information'||'reply_draft' in negatedWarranty)throw new Error('否定的保修时长不能作为保修期限');
const commonOpeningQuestion = runOne('店铺什么时候营业？', '店铺营业时间为9:00至18:00。');
if(commonOpeningQuestion.status!=='draft'||!commonOpeningQuestion.reply_draft.includes('9:00至18:00'))throw new Error('“什么时候营业”应能匹配明确营业时间');
const startUsingQuestion = runOne('怎么开始使用？', '怎么开始使用：先打开应用，再选择模式。');
if(startUsingQuestion.status!=='draft'||!startUsingQuestion.reply_draft.includes('选择模式'))throw new Error('“开始使用”是操作意图，不能误判为发布日期问题');
const missingFeatureEntity = runOne('尚未公布的新功能什么时候上线？', '新功能的用途已说明，但上线日期尚未公布。');
if (missingFeatureEntity.status !== 'needs_more_information' || missingFeatureEntity.needed_fields.some(field => field.includes('与问题相同的商品/款式标识'))) throw new Error('问题和材料已明确同一新功能时不应重复索要实体标识');
for(const [question,fact,label] of [
 ['A产品还有多少库存？','A产品有货。','库存数量'],
 ['A产品能退货几天？','A产品支持退货。','退货期限'],
 ['退款退到哪里？','支持退款。','退款去向']
]){const out=runOne(question,fact);if(out.status!=='needs_more_information'||'reply_draft' in out)throw new Error(`${label}缺少具体值时必须追问`);}
const staleCompatibility=runOne('A产品支持NFC吗？','A产品支持NFC。后来确认不支持NFC。');
if(staleCompatibility.status!=='draft'||!staleCompatibility.reply_draft.includes('不支持NFC')||staleCompatibility.reply_draft.includes('；'))throw new Error('同一材料后续否定结论必须覆盖早先兼容性结论');
const expiredReturn=runOne('A产品支持退货吗？','A产品支持退货。该政策已经失效。');
if(expiredReturn.status!=='needs_more_information'||'reply_draft' in expiredReturn)throw new Error('后续失效状态必须使早先售后政策结论失效');
const negatedDimension=runOne('A产品是什么尺寸？','A产品尺寸不是10厘米。');
if(negatedDimension.status!=='needs_more_information'||'reply_draft' in negatedDimension)throw new Error('否定尺寸值不能作为尺寸答案');
const negatedVersion=runOne('教程第2步适用哪个版本？','教程第2步不适用于v2。');
if(negatedVersion.status!=='needs_more_information'||'reply_draft' in negatedVersion)throw new Error('否定适用版本不能作为肯定版本答案');
const bareScheduleMismatch=runOne('蜜桃乌龙什么时候上线？','茉莉绿茶将于2027年5月上线。');
if(bareScheduleMismatch.status!=='needs_more_information'||'reply_draft' in bareScheduleMismatch)throw new Error('普通中文商品名称不能跨商品回答发布日期');
const bareScheduleMatch=runOne('蜜桃乌龙什么时候上线？','蜜桃乌龙将于2027年5月上线。');
if(bareScheduleMatch.status!=='draft'||!bareScheduleMatch.reply_draft.includes('2027年5月上线'))throw new Error('同一普通中文商品的明确上线日期应能起草');
const warrantyBorrowedForReturn=runOne('A产品可以退货多久？','A产品保修2年，支持退货。');
if(warrantyBorrowedForReturn.status!=='needs_more_information'||'reply_draft' in warrantyBorrowedForReturn)throw new Error('保修时长不能代答退货期限');
const dispatchBorrowedForRefund=runOne('A产品退款多久到账？','A产品发货24小时内，支持退款。');
if(dispatchBorrowedForRefund.status!=='needs_more_information'||'reply_draft' in dispatchBorrowedForRefund)throw new Error('发货时效不能代答退款到账时效');
for(const [question,fact] of [['A产品多少钱？','A产品退货费用10元。'],['A产品多少钱？','A产品配送费用10元。']]){const out=runOne(question,fact);if(out.status!=='needs_more_information'||'reply_draft' in out)throw new Error('退货或配送费用不能当作商品售价');}
for(const [question,fact] of [['A产品是什么颜色？','A产品颜色不是红色。'],['A产品是什么材质？','A产品材质不是塑料。']]){const out=runOne(question,fact);if(out.status!=='needs_more_information'||'reply_draft' in out)throw new Error('否定颜色或材质不构成肯定属性答案');}
const priceConflict=JSON.parse(execFileSync(process.execPath,[resolve(root,'scripts/draft-answers.mjs'),'-'],{input:JSON.stringify({tone:'简洁',questions:['A产品多少钱？'],sources:[{id:'p1',fact:'A产品售价100元。',source:'价目表1'},{id:'p2',fact:'A产品售价200元。',source:'价目表2'}]}),encoding:'utf8'})).results[0];
if(priceConflict.status!=='needs_more_information'||'reply_draft' in priceConflict||!priceConflict.message.includes('互相冲突'))throw new Error('互相矛盾的售价材料必须暂停草拟');
const correctedColor=runOne('A产品现在是什么颜色？','A产品颜色是红色。后来更正为蓝色。');
if(correctedColor.status!=='draft'||!correctedColor.reply_draft.includes('蓝色')||correctedColor.reply_draft.includes('红色'))throw new Error('后续属性更正必须覆盖旧值');
const negativeCompatibility=runOne('A产品支持NFC吗？','A产品不支持NFC。');
if(negativeCompatibility.status!=='draft'||!negativeCompatibility.reply_draft.includes('不支持NFC'))throw new Error('明确不支持也是兼容性问题的有效否定结论');
const returnMethod=runOne('A产品支持哪些退货方式？','A产品支持快递退货。');
if(returnMethod.status!=='draft'||!returnMethod.reply_draft.includes('快递退货'))throw new Error('退货语境中的“支持”不能误触发兼容性字段');
const permissionQuestion=runOne('新功能开放哪些权限？','新功能开放相册权限。');
if(permissionQuestion.status!=='draft'||!permissionQuestion.reply_draft.includes('相册权限'))throw new Error('开放权限问题不能误识别为发布日期问题');
for(const [question,fact] of [['蓝莓酸奶适合儿童吗？','草莓酸奶适合儿童。'],['课程适合新手吗？','课程价格为100元。']]){const out=runOne(question,fact);if(out.status!=='needs_more_information'||'reply_draft' in out)throw new Error('自由问答须同时匹配普通商品和问题意图');}
for(const [question,fact] of [['A产品尺寸是多少？','A产品重量为100g。'],['A产品重量是多少？','A产品尺寸为10厘米。']]){const out=runOne(question,fact);if(out.status!=='needs_more_information'||'reply_draft' in out)throw new Error('尺寸和重量不能互相代答');}
for(const [question,fact] of [['A产品是什么颜色？','A产品颜色是红色。'],['A产品支持NFC吗？','A产品支持NFC。']]){const second=fact.includes('红色')?'A产品颜色是蓝色。':'A产品不支持NFC。';const out=JSON.parse(execFileSync(process.execPath,[resolve(root,'scripts/draft-answers.mjs'),'-'],{input:JSON.stringify({tone:'简洁',questions:[question],sources:[{id:'one',fact,source:'来源1'},{id:'two',fact:second,source:'来源2'}]}),encoding:'utf8'})).results[0];if(out.status!=='needs_more_information'||'reply_draft' in out)throw new Error('互斥颜色或兼容结论必须先确认');}
const returnConflict=JSON.parse(execFileSync(process.execPath,[resolve(root,'scripts/draft-answers.mjs'),'-'],{input:JSON.stringify({tone:'简洁',questions:['A产品支持退货吗？'],sources:[{id:'one',fact:'A产品支持退货。',source:'来源1'},{id:'two',fact:'A产品不支持退货。',source:'来源2'}]}),encoding:'utf8'})).results[0];
if(returnConflict.status!=='needs_more_information'||'reply_draft' in returnConflict)throw new Error('互斥退货政策必须先确认');
for(const [question,fact] of [['A产品保修范围是什么？','A产品保修2年。'],['A产品在哪里办理保修？','A产品保修2年。'],['配送到哪些地区？','3天内送达。']]){const out=runOne(question,fact);if(out.status!=='needs_more_information'||'reply_draft' in out)throw new Error('售后范围、办理地点与配送地区须匹配具体子项');}
const power=runOne('A充电器功率是多少？','A充电器功率为30W。');
if(power.status!=='draft'||!power.reply_draft.includes('30W'))throw new Error('充电器功率应识别为具体属性字段');
for(const fact of ['A产品不会于2027年上线。','A产品原定2027年上线，后来改期。']){const out=runOne('A产品什么时候上线？',fact);if(out.status!=='needs_more_information'||'reply_draft' in out)throw new Error('否定或改期的旧上线日期不能作为当前承诺');}
const waterBag=runOne('A产品防水吗？','A产品附赠防水收纳袋。');
if(waterBag.status!=='needs_more_information'||'reply_draft' in waterBag)throw new Error('防水配件不能证明商品本体防水');
const investigatedReason=runOne('退款失败的原因是什么？','退款失败的原因正在调查中。');
if(investigatedReason.status!=='needs_more_information'||'reply_draft' in investigatedReason)throw new Error('调查中的退款原因尚无可答结论');
const negatedPayer=runOne('A产品退货运费谁承担？','A产品退货运费不是买家承担。');
if(negatedPayer.status!=='needs_more_information'||'reply_draft' in negatedPayer)throw new Error('否定某方承担不能替代实际承担方');
const deliveryYesNo=runOne('A产品配送到北京吗？','A产品配送范围覆盖北京。');
if(deliveryYesNo.status!=='draft'||!deliveryYesNo.reply_draft.includes('北京'))throw new Error('配送地区的是非问法应匹配明确覆盖区域');
const deliveryWrongRegion=runOne('A产品配送到北京吗？','A产品配送范围覆盖上海。');
if(deliveryWrongRegion.status!=='needs_more_information'||'reply_draft' in deliveryWrongRegion)throw new Error('只覆盖上海的资料不能回答是否配送到北京');
const deliveryRegions=runOne('A产品配送到哪些地区？','A产品配送范围覆盖北京和上海。');
if(deliveryRegions.status!=='draft'||!deliveryRegions.reply_draft.includes('北京和上海'))throw new Error('配送地区可由明确覆盖区域回答，不要求同时有时效');
for(const [question,one,two] of [['A产品保修多久？','A产品保修1年。','A产品保修2年。'],['A产品材质是什么？','A产品材质是棉。','A产品材质是塑料。']]){const out=JSON.parse(execFileSync(process.execPath,[resolve(root,'scripts/draft-answers.mjs'),'-'],{input:JSON.stringify({tone:'简洁',questions:[question],sources:[{id:'a',fact:one,source:'资料1'},{id:'b',fact:two,source:'资料2'}]}),encoding:'utf8'})).results[0];if(out.status!=='needs_more_information'||'reply_draft' in out)throw new Error('互斥的保修期限或材质值必须先确认');}
const naturalInventoryCountAlt=runOne('A产品库存数量是多少？','A产品有8件库存。');
if(naturalInventoryCountAlt.status!=='draft'||!naturalInventoryCountAlt.reply_draft.includes('8'))throw new Error('“有8件库存”应能回答库存数量问题');
const naturalInventoryCount=runOne('A产品还剩多少件？','A产品库存剩余8件。');
if(naturalInventoryCount.status!=='draft'||!naturalInventoryCount.reply_draft.includes('8件'))throw new Error('自然问法“还剩多少件”应匹配明确库存数量');
const inventoryCountConflict=JSON.parse(execFileSync(process.execPath,[resolve(root,'scripts/draft-answers.mjs'),'-'],{input:JSON.stringify({tone:'简洁',questions:['A产品库存数量是多少？'],sources:[{id:'a',fact:'A产品库存为12件。',source:'库存表1'},{id:'b',fact:'A产品库存为8件。',source:'库存表2'}]}),encoding:'utf8'})).results[0];
if(inventoryCountConflict.status!=='needs_more_information'||'reply_draft' in inventoryCountConflict||!inventoryCountConflict.message.includes('互相冲突'))throw new Error('不同库存数量不能合并为一个回复');
for(const fact of ['A产品售价100元。后来更正为200元。','A产品售价不是100元，而是200元。']){const out=runOne('A产品售价是多少？',fact);if(out.status!=='draft'||!out.reply_draft.includes('200元')||out.reply_draft.includes('100元'))throw new Error('明确更正后的售价应取新值，不沿用旧价');}
const exchangeDurationMissing=runOne('A产品换货期限多久？','A产品支持换货。');
if(exchangeDurationMissing.status!=='needs_more_information'||'reply_draft' in exchangeDurationMissing)throw new Error('换货许可不能代答具体换货期限');
const cleaningIntentMismatch=runOne('A产品怎么清洗？','A产品清洗剂售价10元。');
if(cleaningIntentMismatch.status!=='needs_more_information'||'reply_draft' in cleaningIntentMismatch)throw new Error('清洁产品价格不能代答清洗方法');
for(const [question,one,two] of [
 ['A产品什么时候上线？','A产品将于2027年5月上线。','A产品将于2027年6月上线。'],
 ['A产品退款多久到账？','A产品退款将在3个工作日内到账。','A产品退款将在5个工作日内到账。'],
 ['A产品订单多久发货？','A产品订单24小时内发货。','A产品订单48小时内发货。']
]){const out=JSON.parse(execFileSync(process.execPath,[resolve(root,'scripts/draft-answers.mjs'),'-'],{input:JSON.stringify({tone:'简洁',questions:[question],sources:[{id:'one',fact:one,source:'资料1'},{id:'two',fact:two,source:'资料2'}]}),encoding:'utf8'})).results[0];if(out.status!=='needs_more_information'||'reply_draft' in out||!out.message.includes('互相冲突'))throw new Error('互斥的上线、退款或发货时间必须要求确认');}
const laterScheduleCorrection=runOne('A产品什么时候上线？','A产品原定2027年5月上线。后来改为2027年6月上线。');
if(laterScheduleCorrection.status!=='draft'||!laterScheduleCorrection.reply_draft.includes('2027年6月')||laterScheduleCorrection.reply_draft.includes('2027年5月'))throw new Error('明确改期后的新日期必须覆盖旧日期');
const courseLocationIntent=runOne('课程在哪里上课？','课程价格为100元。');
if(courseLocationIntent.status!=='needs_more_information'||'reply_draft' in courseLocationIntent)throw new Error('课程价格不能代答课程地点');
const unrelatedNfcMention=runOne('A产品支持NFC吗？','A产品支持蓝牙，包装盒上印有NFC标识。');
if(unrelatedNfcMention.status!=='needs_more_information'||'reply_draft' in unrelatedNfcMention)throw new Error('仅提及NFC不能证明A产品支持NFC');
const promoNotPrice=runOne('A产品有满100元减20元优惠吗？','A产品活动期间满100元减20元。');
if(promoNotPrice.status!=='draft'||!promoNotPrice.reply_draft.includes('满100元减20元'))throw new Error('优惠门槛金额不得额外触发售价字段');
const numericReturnWindow=runOne('A产品可以退货多久？','A产品支持签收后7天内退货。');
if(numericReturnWindow.status!=='draft'||!numericReturnWindow.reply_draft.includes('7天内退货'))throw new Error('阿拉伯数字形式的退货期限也应可作答');
for(const [question,fact] of [['A产品什么时候上线？','A产品可能于2027年5月上线。'],['A产品多少钱？','A产品价格可能是100元。']]){const out=runOne(question,fact);if(out.status!=='needs_more_information'||'reply_draft' in out)throw new Error('可能性表述不是已确认的可答结论');}
for(const [question,fact] of [['A产品什么时候上线？','A产品预计于2027年5月上线。'],['A产品多少钱？','A产品价格暂定100元。']]){const out=runOne(question,fact);if(out.status!=='needs_more_information'||'reply_draft' in out)throw new Error('预计或暂定表述不是已确认的可答结论');}
for(const [question,one,two] of [['星火讲座什么时候举行？','星火讲座定于10月8日举行。','星火讲座定于10月9日举行。'],['店铺什么时候营业？','店铺营业时间为9:00至18:00。','店铺营业时间为10:00至20:00。']]){const out=JSON.parse(execFileSync(process.execPath,[resolve(root,'scripts/draft-answers.mjs'),'-'],{input:JSON.stringify({tone:'简洁',questions:[question],sources:[{id:'a',fact:one,source:'资料1'},{id:'b',fact:two,source:'资料2'}]}),encoding:'utf8'})).results[0];if(out.status!=='needs_more_information'||'reply_draft' in out||!out.message.includes('互相冲突'))throw new Error('互斥的活动日期或营业时段必须要求确认');}
const sameDayScheduleConflict=JSON.parse(execFileSync(process.execPath,[resolve(root,'scripts/draft-answers.mjs'),'-'],{input:JSON.stringify({tone:'简洁',questions:['星火讲座什么时候举行？'],sources:[{id:'a',fact:'星火讲座定于10月8日9:00举行。',source:'资料1'},{id:'b',fact:'星火讲座定于10月8日10:00举行。',source:'资料2'}]}),encoding:'utf8'})).results[0];
if(sameDayScheduleConflict.status!=='needs_more_information'||'reply_draft' in sameDayScheduleConflict||!sameDayScheduleConflict.message.includes('互相冲突'))throw new Error('同日但不同举行时间必须要求确认');
const noStockPresentConflict=JSON.parse(execFileSync(process.execPath,[resolve(root,'scripts/draft-answers.mjs'),'-'],{input:JSON.stringify({tone:'简洁',questions:['A产品有现货吗？'],sources:[{id:'a',fact:'A产品没有现货。',source:'库存表1'},{id:'b',fact:'A产品目前有货。',source:'库存表2'}]}),encoding:'utf8'})).results[0];
if(noStockPresentConflict.status!=='needs_more_information'||'reply_draft' in noStockPresentConflict||!noStockPresentConflict.message.includes('互相冲突'))throw new Error('没有现货与目前有货必须识别为库存冲突');
const refundAndNfc=JSON.parse(execFileSync(process.execPath,[resolve(root,'scripts/draft-answers.mjs'),'-'],{input:JSON.stringify({tone:'简洁',questions:['A产品支持退款和NFC吗？'],sources:[{id:'refund',fact:'A产品支持退款。',source:'售后政策'}]}),encoding:'utf8'})).results[0];
if(refundAndNfc.status!=='needs_more_information'||'reply_draft' in refundAndNfc||!refundAndNfc.needed_fields.some(field=>field.includes('适配结论')))throw new Error('复合售后与兼容问题缺少NFC依据时必须追问');
const returnAndPrice=JSON.parse(execFileSync(process.execPath,[resolve(root,'scripts/draft-answers.mjs'),'-'],{input:JSON.stringify({tone:'简洁',questions:['A产品可以退货吗，多少钱？'],sources:[{id:'return',fact:'A产品支持退货。',source:'售后政策'},{id:'price',fact:'A产品售价100元。',source:'价目表'}]}),encoding:'utf8'})).results[0];
if(returnAndPrice.status!=='draft'||!returnAndPrice.reply_draft.includes('退货')||!returnAndPrice.reply_draft.includes('100元'))throw new Error('同一商品的复合退货和售价问题必须正确配对');
const safetyNotPrice=runOne('晨曦杯安全吗？','晨曦杯售价100元。');
if(safetyNotPrice.status!=='needs_more_information'||'reply_draft' in safetyNotPrice)throw new Error('共享商品名不能让售价回答安全问题');
const returnWindowConflict=JSON.parse(execFileSync(process.execPath,[resolve(root,'scripts/draft-answers.mjs'),'-'],{input:JSON.stringify({tone:'简洁',questions:['A产品可以退货多久？'],sources:[{id:'a',fact:'A产品支持签收后7天内退货。',source:'规则1'},{id:'b',fact:'A产品支持签收后14天内退货。',source:'规则2'}]}),encoding:'utf8'})).results[0];
if(returnWindowConflict.status!=='needs_more_information'||'reply_draft' in returnWindowConflict||!returnWindowConflict.message.includes('互相冲突'))throw new Error('不同退货期限必须要求确认当前有效规则');
for(const [question,fact] of [['退款失败的原因是什么？','A产品退款失败原因详见官网。'],['A产品退货运费谁承担？','A产品退货运费由商家政策负责说明。']]){const out=runOne(question,fact);if(out.status!=='needs_more_information'||'reply_draft' in out)throw new Error('官网指引或政策说明不能冒充原因或承担方结论');}
const multiSource = (question, sources) => JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input:JSON.stringify({tone:'简洁',questions:[question],sources}),encoding:'utf8'})).results[0];
for (const [question, oldFact, pendingFact] of [
  ['A产品什么时候上线？','A产品计划于2027年5月上线。','A产品上线已延期，新日期待定。'],
  ['A产品多少钱？','A产品售价100元。','A产品最新价格待确认。'],
  ['A产品可以退货吗？','A产品支持签收后七天内退货。','A产品退货政策已失效。']
]) {
  const stale = multiSource(question,[{id:'old',fact:oldFact,source:'旧批准材料'},{id:'new',fact:pendingFact,source:'最新状态'}]);
  if (stale.status !== 'needs_more_information' || 'reply_draft' in stale) throw new Error('其他来源中的待定或失效状态必须阻止旧事实继续作答');
}
const compositeAttributes = multiSource('A产品是什么颜色和材质？',[{id:'color',fact:'A产品颜色为红色。',source:'批准规格表'},{id:'material',fact:'A产品材质为不锈钢。',source:'批准规格表'}]);
if (compositeAttributes.status !== 'draft' || !compositeAttributes.reply_draft.includes('红色') || !compositeAttributes.reply_draft.includes('不锈钢')) throw new Error('颜色和材质问题应分别由各自事实支持');
const missingCompositeAttribute = multiSource('A产品是什么颜色和材质？',[{id:'color',fact:'A产品颜色为红色。',source:'批准规格表'}]);
if (missingCompositeAttribute.status !== 'needs_more_information' || 'reply_draft' in missingCompositeAttribute || !missingCompositeAttribute.needed_fields.some(field => field.includes('材质'))) throw new Error('复合属性问题缺少材质材料时必须逐子问追问，不能只回答颜色');
const compositeSteps = multiSource('第2步和第3步分别适用哪个版本？',[{id:'step2',fact:'第2步适用于v2。',source:'批准教程'},{id:'step3',fact:'第3步适用于v3。',source:'批准教程'}]);
if (compositeSteps.status !== 'draft' || !compositeSteps.reply_draft.includes('第2步') || !compositeSteps.reply_draft.includes('第3步')) throw new Error('多个教程步骤应分别匹配版本材料');
const missingCompositeStep = multiSource('第2步和第3步分别适用哪个版本？',[{id:'step2',fact:'第2步适用于v2。',source:'批准教程'}]);
if (missingCompositeStep.status !== 'needs_more_information' || 'reply_draft' in missingCompositeStep || !missingCompositeStep.needed_fields.some(field => field.includes('版本范围'))) throw new Error('复合教程步骤缺少第3步材料时必须逐子问追问，不能只引用第2步');
for (const sources of [
  [{id:'seller',fact:'A产品退货运费由卖家承担。',source:'政策甲'},{id:'buyer',fact:'A产品退货运费由买家承担。',source:'政策乙'}],
  [{id:'rmb',fact:'A产品售价100元。',source:'价目甲'},{id:'usd',fact:'A产品售价100美元。',source:'价目乙'}]
]) {
  const conflict = multiSource(sources[0].fact.includes('运费') ? 'A产品退货运费谁承担？' : 'A产品多少钱？', sources);
  if (conflict.status !== 'needs_more_information' || 'reply_draft' in conflict) throw new Error('退款运费承担方或币种不同的价格材料必须判为冲突');
}
const multiTarget = multiSource('A产品支持Android和iOS吗？',[{id:'android',fact:'A产品支持Android。',source:'兼容表'},{id:'ios',fact:'A产品支持iOS。',source:'兼容表'}]);
if (multiTarget.status !== 'draft' || !multiTarget.reply_draft.includes('Android') || !multiTarget.reply_draft.includes('iOS')) throw new Error('Android和iOS可由分别批准的兼容事实回答');
const refundDestination = runOne('A产品退款退到哪里？','A产品退款原路退回支付账户。');
if (refundDestination.status !== 'draft' || !refundDestination.reply_draft.includes('支付账户')) throw new Error('明确退款去向可直接作答');
const reversePriceConflict = multiSource('A产品多少钱？',[{id:'one',fact:'100元为A产品售价。',source:'价目表1'},{id:'two',fact:'200元为A产品售价。',source:'价目表2'}]);
if (reversePriceConflict.status !== 'needs_more_information' || 'reply_draft' in reversePriceConflict) throw new Error('金额在前的售价表述也必须进入价格冲突检查');
const ambiguousDirect = multiSource('适合儿童吗？',[{id:'a',fact:'A产品适合儿童。',source:'资料A'},{id:'b',fact:'B产品不适合儿童。',source:'资料B'}]);
if (ambiguousDirect.status !== 'needs_more_information' || 'reply_draft' in ambiguousDirect) throw new Error('自由问答未指定商品时不能合并不同商品事实');
const unresolvedDirect = runOne('A产品适合儿童吗？','A产品是否适合儿童仍在测试。');
if (unresolvedDirect.status !== 'needs_more_information' || 'reply_draft' in unresolvedDirect) throw new Error('自由问答不能把仍在测试的结论当成事实');
const negatedDestination = runOne('A产品退款退到哪里？','A产品退款不退回原账户。');
if (negatedDestination.status !== 'needs_more_information' || 'reply_draft' in negatedDestination) throw new Error('否定的退款去向不能当成实际去向');
const destinationConflict = multiSource('A产品退款退到哪里？',[{id:'one',fact:'A产品退款退回支付宝账户。',source:'政策1'},{id:'two',fact:'A产品退款退回微信账户。',source:'政策2'}]);
if (destinationConflict.status !== 'needs_more_information' || 'reply_draft' in destinationConflict) throw new Error('不同退款渠道必须判为冲突');
for (const [question,fact] of [['A产品在哪里办理保修？','A产品可在服务中心办理保修。'],['A产品如何办理退货？','A产品可以在小程序办理退货。']]) {
  const location = runOne(question,fact);
  if (location.status !== 'draft' || !location.reply_draft.includes(question.includes('保修') ? '服务中心' : '小程序')) throw new Error('售后办理地点或渠道事实应能支持对应问题');
}
const safetyInventory = runOne('A产品安全吗？','A产品安全库存为100件。');
if (safetyInventory.status !== 'needs_more_information' || 'reply_draft' in safetyInventory) throw new Error('安全库存不能冒充产品安全结论');
const sharedWordOnly = runOne('A产品效果好吗？','A产品效果图已更新。');
if (sharedWordOnly.status !== 'needs_more_information' || 'reply_draft' in sharedWordOnly) throw new Error('自由问答不能仅凭共享词语把资料元信息当作结论');
const unpublishedCourse = runOne('课程什么时候开课？','课程开课通知尚未发布。');
if (unpublishedCourse.status !== 'needs_more_information' || 'reply_draft' in unpublishedCourse) throw new Error('未发布的开课通知不能回答开课时间');
const splitCompatibility = runOne('A产品支持Android和iOS吗？','A产品支持Android和iOS。');
if (splitCompatibility.status !== 'draft' || !splitCompatibility.reply_draft.includes('Android和iOS')) throw new Error('一条材料同时覆盖多个兼容目标时应能回答');
const modelCompatibility = runOne('A产品适配华为 P70吗？','A产品适配华为 P70。');
if (modelCompatibility.status !== 'draft' || !modelCompatibility.reply_draft.includes('华为 P70')) throw new Error('兼容目标型号不能被当成第二个商品');
const deliveryConflict = multiSource('A产品配送到哪些地区？',[{id:'north',fact:'A产品配送范围仅覆盖北京。',source:'配送规则1'},{id:'south',fact:'A产品配送范围仅覆盖上海。',source:'配送规则2'}]);
if (deliveryConflict.status !== 'needs_more_information' || 'reply_draft' in deliveryConflict) throw new Error('互斥配送地区范围必须判为冲突');
const macroDeliveryConflict = multiSource('A产品配送到哪些地区？',[{id:'east',fact:'A产品配送范围为华东地区。',source:'配送规则1'},{id:'south',fact:'A产品配送范围为华南地区。',source:'配送规则2'}]);
if (macroDeliveryConflict.status !== 'needs_more_information' || 'reply_draft' in macroDeliveryConflict) throw new Error('华东和华南等大区配送范围冲突必须确认');
const powerConflict = multiSource('A产品功率是多少？',[{id:'100w',fact:'A产品功率100W。',source:'规格表1'},{id:'200w',fact:'A产品功率200W。',source:'规格表2'}]);
if (powerConflict.status !== 'needs_more_information' || 'reply_draft' in powerConflict) throw new Error('功率不同的规格材料必须判为冲突');
const modelConflict = multiSource('A产品型号是什么？',[{id:'x100',fact:'A产品型号X100。',source:'规格表1'},{id:'x200',fact:'A产品型号X200。',source:'规格表2'}]);
if (modelConflict.status !== 'needs_more_information' || 'reply_draft' in modelConflict || !modelConflict.message.includes('互相冲突')) throw new Error('无“为”的不同型号规格材料也必须判为冲突');
const negatedCost = runOne('A产品成本是多少？','A产品成本不是100元。');
if (negatedCost.status !== 'needs_more_information' || 'reply_draft' in negatedCost) throw new Error('否定成本值不能当作肯定金额');
const vagueDispatch = runOne('订单什么时候发货？','订单将尽快发货。');
if (vagueDispatch.status !== 'needs_more_information' || 'reply_draft' in vagueDispatch) throw new Error('“尽快”不是明确发货时效');
const openingAsClosing = runOne('店铺几点关门？','店铺开门时间为9:00。');
if (openingAsClosing.status !== 'needs_more_information' || 'reply_draft' in openingAsClosing) throw new Error('开门时间不能回答关门时间');
const dateAsStartTime = runOne('活动几点开始？','活动将于10月8日举行。');
if (dateAsStartTime.status !== 'needs_more_information' || 'reply_draft' in dateAsStartTime) throw new Error('活动日期不能替代具体开始时刻');
const exactStartTime = runOne('活动几点开始？','活动将于10月8日10点开始。');
if (exactStartTime.status !== 'draft' || !exactStartTime.reply_draft.includes('10点')) throw new Error('带明确时刻的活动开始材料仍应可以回答');
const courseCount = runOne('入门课程包含几节内容？','入门课程共包含12节内容。');
if (courseCount.status !== 'draft' || !courseCount.reply_draft.includes('12节')) throw new Error('可直接回答课程节数，不应被有限意图白名单拦截');
const courseCountConflict = multiSource('入门课程包含几节内容？',[{id:'course-12',fact:'入门课程共包含12节内容。',source:'课程资料1'},{id:'course-15',fact:'入门课程共包含15节内容。',source:'课程资料2'}]);
if (courseCountConflict.status !== 'needs_more_information' || 'reply_draft' in courseCountConflict) throw new Error('课程节数不一致时须先确认当前值');
const liveGuest = runOne('这次直播的嘉宾是谁？','这次直播的嘉宾是张三。');
if (liveGuest.status !== 'draft' || !liveGuest.reply_draft.includes('张三')) throw new Error('可按已批准材料回答明确直播嘉宾');
const unresolvedGuestChoice = runOne('这次直播的嘉宾是谁？','这次直播的嘉宾是李明或王五。');
if (unresolvedGuestChoice.status !== 'needs_more_information' || 'reply_draft' in unresolvedGuestChoice) throw new Error('同一材料中的候选嘉宾未确认时不能生成可复制草稿');
const productDateFromManual = runOne('A产品什么时候发布？','A产品说明书将于2027年发布。');
if (productDateFromManual.status !== 'needs_more_information' || 'reply_draft' in productDateFromManual) throw new Error('说明书发布日期不能冒充产品发布日期');
const classLocationFromRegistration = runOne('课程在哪里上课？','课程在小程序办理报名。');
if (classLocationFromRegistration.status !== 'needs_more_information' || 'reply_draft' in classLocationFromRegistration) throw new Error('报名渠道不能冒充课程上课地点');
const eventDate = runOne('活动日期是哪天？','活动日期为2027年5月1日。');
if (eventDate.status !== 'draft' || !eventDate.reply_draft.includes('2027年5月1日')) throw new Error('明确的活动日期应能回答常见日期问法');
const credentialMetadata = JSON.parse(execFileSync(process.execPath, [resolve(root,'scripts/draft-answers.mjs'),'-'], {
  input: JSON.stringify({tone:'简洁',questions:['课程日期是哪天？'],sources:[{id:'stock-AKIAIOSFODNN7EXAMPLE',fact:'课程日期为2027年5月1日。',source:'https://example.com/private/AKIAIOSFODNN7EXAMPLE'}]}),
  encoding:'utf8'
})).results[0];
if (credentialMetadata.status !== 'draft' || JSON.stringify(credentialMetadata).includes('AKIAIOSFODNN7EXAMPLE') || !JSON.stringify(credentialMetadata).includes('已省略AWS凭据')) throw new Error('证据 ID 和来源中的 AWS Access Key 必须脱敏');
const pendingApprovalSchedule = runOne('A产品什么时候上线？','A产品尚待审批，计划于2027年7月上线。');
if (pendingApprovalSchedule.status !== 'needs_more_information' || 'reply_draft' in pendingApprovalSchedule) throw new Error('尚待审批的计划日期不能写成确定上线时间');
const partialCompound = runOne('入门课程有几节，适合谁？','入门课程共12节。');
if (partialCompound.status !== 'needs_more_information' || 'reply_draft' in partialCompound || !partialCompound.needed_fields.includes('适用人群')) throw new Error('复合问题缺少适用人群时不能只回答课程节数');
const partialSafetyAndCleaning = runOne('A产品安全吗，怎么清洗？','A产品通过安全测试。');
if (partialSafetyAndCleaning.status !== 'needs_more_information' || 'reply_draft' in partialSafetyAndCleaning) throw new Error('复合安全和清洗问题缺少清洗方式时不能只回答安全结论');
const productProblem = runOne('A产品主要解决什么问题？','A产品主要解决夜间照明不足的问题。');
if (productProblem.status !== 'draft' || !productProblem.reply_draft.includes('夜间照明不足')) throw new Error('已有直接依据的产品问题说明应能回答');
const eventHowToJoin = runOne('这次活动怎么参加？','这次活动通过小程序报名参加。');
if (eventHowToJoin.status !== 'draft' || !eventHowToJoin.reply_draft.includes('小程序报名参加')) throw new Error('已有明确方式的活动参与问题应能回答');
const stockWithoutContact = runOne('A产品有货吗？','A产品有货，联系人张三，电话010-12345678。');
if (stockWithoutContact.status !== 'draft' || !stockWithoutContact.reply_draft.includes('有货') || JSON.stringify(stockWithoutContact).includes('张三') || JSON.stringify(stockWithoutContact).includes('010-12345678') || /，，|，。/u.test(JSON.stringify(stockWithoutContact))) throw new Error('未询问的联系人和座机必须从回复与证据中移除，且不留多余标点');
for (const [question,fact] of [
  ['A产品支持iOS吗？','A产品支持iOS，但待确认。'],
  ['A产品保修多久？','A产品保修2年，但待确认。'],
  ['A产品价格是多少？','A产品售价100元，但待确认。']
]) {
  const unresolvedFact = runOne(question,fact);
  if (unresolvedFact.status !== 'needs_more_information' || 'reply_draft' in unresolvedFact) throw new Error('带有待确认尾句的结论不能生成草稿：' + fact);
}
for (const [question,fact] of [
  ['A产品价格是多少？','A产品去年售价100元。'],
  ['A产品现在有库存吗？','A产品曾经有货。'],
  ['A产品现在有库存吗？','A产品的“有货”结论已被撤回。']
]) {
  const staleFact = runOne(question,fact);
  if (staleFact.status !== 'needs_more_information' || 'reply_draft' in staleFact) throw new Error('历史或已撤回的结论不能当作当前事实：' + fact);
}
const crossVariantStock = runOne('A款有货吗？','B款有货。');
if (crossVariantStock.status !== 'needs_more_information' || 'reply_draft' in crossVariantStock) throw new Error('A款问题不能借用B款库存事实');
const crossCoursePrice = runOne('《春风》课程多少钱？','《秋雨》课程售价100元。');
if (crossCoursePrice.status !== 'needs_more_information' || 'reply_draft' in crossCoursePrice) throw new Error('一个课程的价格不能回答另一个课程的问题');
for (const fact of ['报名方式待公布。','报名方式正在设计。','报名方式已更新。']) {
  const pendingJoinMethod = runOne('这次活动怎么参加？',fact);
  if (pendingJoinMethod.status !== 'needs_more_information' || 'reply_draft' in pendingJoinMethod) throw new Error('待公布、设计中或刚更新的报名方式不能作为现行参加指引：' + fact);
}
const couponAsPrice = runOne('A产品多少钱？','A产品价格页面有100元优惠券。');
if (couponAsPrice.status !== 'needs_more_information' || 'reply_draft' in couponAsPrice) throw new Error('优惠券金额不能当作商品售价');
const salePriceAndCoupon = runOne('A产品多少钱？','A产品售价200元，另有100元优惠券。');
if (salePriceAndCoupon.status !== 'draft' || !salePriceAndCoupon.reply_draft.includes('200元')) throw new Error('优惠券不能遮蔽同一材料中的明确商品售价');
const privateQuerySource = JSON.parse(execFileSync(process.execPath,[resolve(root,'scripts/draft-answers.mjs'),'-'],{
  input:JSON.stringify({tone:'简洁',questions:['A产品多少钱？'],sources:[{id:'price',fact:'A产品售价100元。',source:'https://example.com/?key=AIzaSyDUMMYKEY1234567890&auth=auth-secret-123&session=session-secret-456'}]}),
  encoding:'utf8'
})).results[0];
const privateQueryOutput = JSON.stringify(privateQuerySource);
if (privateQueryOutput.includes('AIzaSyDUMMYKEY1234567890') || privateQueryOutput.includes('auth-secret-123') || privateQueryOutput.includes('session-secret-456')) throw new Error('证据来源 URL 中的 key、auth 和 session 参数必须脱敏');
const courseAudience = runOne('入门课程适合谁？','入门课程适合零基础初学者。');
if (courseAudience.status !== 'draft' || !courseAudience.reply_draft.includes('零基础初学者')) throw new Error('自由问答应按问题意图匹配适合人群');
const liveDuration = runOne('这次直播持续多久？','这次直播时长为90分钟。');
if (liveDuration.status !== 'draft' || !liveDuration.reply_draft.includes('90分钟')) throw new Error('自由问答应按问题意图匹配直播时长');
const guestsConflict = multiSource('这次直播的嘉宾是谁？',[{id:'guest-a',fact:'这次直播的嘉宾是李明。',source:'直播资料1'},{id:'guest-b',fact:'这次直播的嘉宾是王芳。',source:'直播资料2'}]);
if (guestsConflict.status !== 'needs_more_information' || 'reply_draft' in guestsConflict) throw new Error('自由问答中的不同嘉宾结论必须先确认');
const reasonsConflict = multiSource('退款失败的原因是什么？',[{id:'reason-a',fact:'退款失败是因为账户异常。',source:'退款记录1'},{id:'reason-b',fact:'退款失败是由于余额不足。',source:'退款记录2'}]);
if (reasonsConflict.status !== 'needs_more_information' || 'reply_draft' in reasonsConflict) throw new Error('不同退款失败原因不能合并成一个可复制答复');
for (const [question,fact] of [
  ['A产品什么时候上线？','A产品将于2027年上线。后来确认不会上线。'],
  ['订单什么时候发货？','订单3天内发货。后来确认不再发货。'],
  ['A产品退货期限是多久？','A产品支持签收后7天内退货。后来确认不支持退货。'],
  ['A产品保修期限是多久？','A产品保修2年。后来确认不提供保修。']
]) { const out=runOne(question,fact); if(out.status!=='needs_more_information'||'reply_draft' in out) throw new Error('后续明确否定应使同一事实的旧承诺失效'); }
const targetScopedSupport = runOne('A产品支持安卓吗？','A产品支持安卓。后来确认不支持iOS。');
if (targetScopedSupport.status !== 'draft' || !targetScopedSupport.reply_draft.includes('支持安卓')) throw new Error('iOS 否定不能使安卓支持结论失效');
const refundDestinationUnaffected = multiSource('A产品退款会退到哪里？',[{id:'destination',fact:'A产品退款原路退回原支付账户。',source:'退款规则'},{id:'pending-time',fact:'A产品退款到账时间待确认。',source:'时效说明'}]);
if (refundDestinationUnaffected.status !== 'draft' || !refundDestinationUnaffected.reply_draft.includes('原支付账户')) throw new Error('退款到账时间未确认不能阻止回答明确的退款去向');
const iosUsage = runOne('A产品能在iOS上使用吗？','A产品支持iOS。');
if (iosUsage.status !== 'draft' || !iosUsage.reply_draft.includes('支持iOS')) throw new Error('“能在iOS上使用吗”应匹配明确的平台兼容结论');
const chineseVersionConflict = multiSource('教程第2步适用于哪个版本？',[{id:'v2',fact:'教程第2步适用于版本2。',source:'教程资料1'},{id:'v3',fact:'教程第2步适用于版本3。',source:'教程资料2'}]);
if (chineseVersionConflict.status !== 'needs_more_information' || 'reply_draft' in chineseVersionConflict) throw new Error('中文“版本2/版本3”结论互斥时须先确认');
const returnDeadlineComplement = multiSource('A产品支持退货吗？',[{id:'return-ok',fact:'A产品支持退货。',source:'售后政策'},{id:'return-days',fact:'A产品退货期限为签收后7天。',source:'售后政策补充'}]);
if (returnDeadlineComplement.status !== 'draft' || !returnDeadlineComplement.reply_draft.includes('支持退货') || !returnDeadlineComplement.reply_draft.includes('签收后7天')) throw new Error('退货许可与退货期限是可合并信息，不应误判为冲突');
const colorOptions = multiSource('A产品有哪些颜色？',[{id:'red',fact:'A产品有红色款。',source:'款式表1'},{id:'blue',fact:'A产品有蓝色款。',source:'款式表2'}]);
if (colorOptions.status !== 'draft' || !colorOptions.reply_draft.includes('红色') || !colorOptions.reply_draft.includes('蓝色')) throw new Error('分别批准的颜色选项可以合并回答枚举问题');
const versionOptionQuestion = runOne('教程第2步适用于v2还是v3？','教程第2步仅已验证适用于 v2。');
if (versionOptionQuestion.status !== 'draft' || !versionOptionQuestion.reply_draft.includes('v2') || versionOptionQuestion.reply_draft.includes('v3')) throw new Error('版本选项问题应只确认已有依据的版本，不得把版本选项误拆成商品实体');
const warrantyScope = runOne('A产品保修范围是什么？','A产品保修范围覆盖主板和电池。');
if (warrantyScope.status !== 'draft' || !warrantyScope.reply_draft.includes('主板和电池')) throw new Error('保修范围应按范围事实回答，不得误索取保修期限');
const returnDeadline = runOne('A产品退货期限是多久？','A产品退货期限为签收后7天。');
if (returnDeadline.status !== 'draft' || !returnDeadline.reply_draft.includes('7天')) throw new Error('明确的签收后退货期限应被识别为可答事实');
const exchangeDeadlineStandard = runOne('A产品换货期限是多久？','A产品换货期限为签收后7天。');
if (exchangeDeadlineStandard.status !== 'draft' || !exchangeDeadlineStandard.reply_draft.includes('签收后7天')) throw new Error('明确的签收后换货期限应被识别为可答事实');
for (const [question, fact] of [
  ['A产品什么时候上线？', 'A产品不在2027年5月上线。'],
  ['订单什么时候发货？', '订单不会在48小时内发货。'],
  ['A产品退款多久到账？', 'A产品退款不会在3个工作日内到账。'],
  ['退款失败的原因是什么？', '退款失败不是因为余额不足。'],
  ['退款失败的原因是什么？', '退款失败不是由于系统错误。'],
  ['A产品退货运费谁承担？', 'A产品退货运费商家不承担。']
]) {
  const out = runOne(question, fact);
  if (out.status !== 'needs_more_information' || 'reply_draft' in out) throw new Error('否定事实不能充当实际时效、退款原因或退货运费承担方');
}
const versionConflict = multiSource('教程第2步适用哪个版本？', [{id:'v2',fact:'教程第2步适用于v2。',source:'教程甲'},{id:'v3',fact:'教程第2步适用于v3。',source:'教程乙'}]);
if (versionConflict.status !== 'needs_more_information' || 'reply_draft' in versionConflict || !versionConflict.message.includes('互相冲突')) throw new Error('同一步骤的不同适用版本必须要求确认当前有效结论');
const warrantyScopeConflict = multiSource('A产品保修范围是什么？', [{id:'board',fact:'A产品保修范围仅覆盖主板。',source:'规则甲'},{id:'battery',fact:'A产品保修范围仅覆盖电池。',source:'规则乙'}]);
if (warrantyScopeConflict.status !== 'needs_more_information' || 'reply_draft' in warrantyScopeConflict || !warrantyScopeConflict.message.includes('互相冲突')) throw new Error('互斥保修范围必须要求确认当前有效结论');
const arbitraryDirectAnswer = runOne('晨曦杯容量是多少？', '晨曦杯容量为500毫升。');
if (arbitraryDirectAnswer.status !== 'draft' || !arbitraryDirectAnswer.reply_draft.includes('500毫升')) throw new Error('批准知识中的开放式属性问答应能按直接事实回答');
const whyDirectAnswer = runOne('为什么要先预热烤箱？', '先预热烤箱是为了让食物受热更均匀。');
if (whyDirectAnswer.status !== 'draft' || !whyDirectAnswer.reply_draft.includes('受热更均匀')) throw new Error('“为什么”开放问法应匹配明确原因事实');
const countDirectAnswer = runOne('这款饮料有几种口味？', '这款饮料共有3种口味。');
if (countDirectAnswer.status !== 'draft' || !countDirectAnswer.reply_draft.includes('3种口味')) throw new Error('“几种”开放问法应匹配明确数量事实');
const supersededDirectAnswer = multiSource('这次直播的嘉宾是谁？', [
  {id:'guest',fact:'这次直播的嘉宾是李明。',source:'嘉宾确认表'},
  {id:'pending-guest',fact:'后来确认这次直播的嘉宾待确认。',source:'最新节目单'}
]);
if (supersededDirectAnswer.status !== 'needs_more_information' || 'reply_draft' in supersededDirectAnswer || supersededDirectAnswer.reply_draft?.includes('李明')) throw new Error('后续待确认事实必须使旧的自由问答结论失效');
const postfixVersionConflict = multiSource('教程第2步适用哪个版本？', [
  {id:'v20',fact:'教程第2步适用于2.0版本。',source:'教程甲'},
  {id:'v30',fact:'教程第2步适用于3.0版本。',source:'教程乙'}
]);
if (postfixVersionConflict.status !== 'needs_more_information' || 'reply_draft' in postfixVersionConflict) throw new Error('“2.0版本/3.0版本”后置写法也必须触发版本冲突');
const mixedPlatformCompatibility = runOne('A产品支持Android和iOS吗？', 'A产品支持Android，不支持iOS。');
if (mixedPlatformCompatibility.status !== 'draft' || !mixedPlatformCompatibility.reply_draft.includes('支持Android') || !mixedPlatformCompatibility.reply_draft.includes('不支持iOS')) throw new Error('一条材料可分别回答多个平台的正反兼容结论');
const correctedPriceNoComma = runOne('A产品多少钱？', 'A产品售价不是100元而是200元。');
if (correctedPriceNoComma.status !== 'draft' || !correctedPriceNoComma.reply_draft.includes('200元') || correctedPriceNoComma.reply_draft.includes('100元')) throw new Error('无逗号的“不是100元而是200元”应采纳更正后的金额');
const deliveryScopeConflict = multiSource('A产品配送哪些地区？', [
  {id:'east',fact:'A产品仅配送江浙沪地区。',source:'批准物流范围甲'},
  {id:'south',fact:'A产品仅配送珠三角地区。',source:'批准物流范围乙'}
]);
if (deliveryScopeConflict.status !== 'needs_more_information' || 'reply_draft' in deliveryScopeConflict || !deliveryScopeConflict.message.includes('互相冲突')) throw new Error('互斥配送范围必须要求确认当前覆盖范围');
const unusualColor = runOne('A产品是什么颜色？', 'A产品颜色是卡其色。');
if (unusualColor.status !== 'draft' || !unusualColor.reply_draft.includes('卡其色')) throw new Error('明确标注的颜色不应受限于颜色词表');
const unusualMaterial = runOne('A产品是什么材质？', 'A产品材质是食品级硅胶。');
if (unusualMaterial.status !== 'draft' || !unusualMaterial.reply_draft.includes('食品级硅胶')) throw new Error('明确标注的材质不应受限于材质词表');
const unusualWarrantyScope = runOne('A产品保修范围有哪些？', 'A产品保修范围覆盖摄像头和扬声器。');
if (unusualWarrantyScope.status !== 'draft' || !unusualWarrantyScope.reply_draft.includes('摄像头和扬声器')) throw new Error('明确标注的保修部件不应受限于固定部件词表');
const missingId = multiSource('A产品多少钱？',[{fact:'A产品售价100元。',source:'批准价目表'}]);
if (missingId.status !== 'needs_more_information' || !missingId.needed_fields.some(field => field.includes('材料 ID')) || missingId.needed_fields.some(field => field.includes('售价'))) throw new Error('缺少材料 ID 时应准确要求 ID，不应重新索取已有价格事实');
for (const [question, current, later] of [
  ['A产品什么时候上线？', 'A产品将于2027年上线。', '后来确认不会上线。'],
  ['订单什么时候发货？', '订单3天内发货。', '后来确认不会发货。'],
  ['A产品保修多久？', 'A产品保修2年。', '后来确认不提供保修。'],
  ['退款什么时候到账？', '退款将在3天内到账。', '后来确认不提供退款。']
]) {
  const out = multiSource(question, [{id:'current',fact:current,source:'当前批准材料'}, {id:'later',fact:later,source:'后续确认'}]);
  if (out.status !== 'needs_more_information' || 'reply_draft' in out) throw new Error('省略对象的明确后续否定必须使旧时效结论失效');
}
const conciseGuestConflict = multiSource('这次直播的嘉宾是谁？', [
  {id:'guest-one',fact:'嘉宾是李明。',source:'直播资料1'},
  {id:'guest-two',fact:'嘉宾是王芳。',source:'直播资料2'}
]);
if (conciseGuestConflict.status !== 'needs_more_information' || 'reply_draft' in conciseGuestConflict || !conciseGuestConflict.message.includes('互相冲突')) throw new Error('简洁嘉宾结论冲突时必须要求确认');
const conflictingRefundDates = runMany('退款哪天到账？', ['退款将于2027年5月1日到账。', '退款将于2027年5月2日到账。']);
if (conflictingRefundDates.status !== 'needs_more_information' || 'reply_draft' in conflictingRefundDates || !conflictingRefundDates.message.includes('互相冲突')) throw new Error('不同完整日期的退款到账结论必须要求确认');
const privateCostInDiscount = runOne('A产品优惠是多少？', 'A产品立减20元且内部成本为30元。');
if (privateCostInDiscount.status !== 'draft' || !privateCostInDiscount.reply_draft.includes('立减20元') || privateCostInDiscount.reply_draft.includes('成本')) throw new Error('回答优惠时不得带出未询问的内部成本');
for (const [question, partialFacts, completeFacts, omitted] of [
  ['A产品配送哪些地区、到货需要多久？', ['A产品配送范围为江浙沪。'], ['A产品配送范围为江浙沪。','A产品3天内到货。'], '到货'],
  ['A产品退货期限和运费由谁承担？', ['A产品支持签收后7天内退货。'], ['A产品支持签收后7天内退货。','A产品退货运费由买家承担。'], '运费'],
  ['A产品退款时间和去向是什么？', ['A产品退款将在3个工作日内到账。'], ['A产品退款将在3个工作日内到账。','A产品退款原路退回至支付宝。'], '去向']
]) {
  const incomplete = multiSource(question, partialFacts.map((fact,index)=>({id:`partial-${index}`,fact,source:'批准材料'})));
  if (incomplete.status !== 'needs_more_information' || 'reply_draft' in incomplete || !incomplete.needed_fields.some(field => field.includes(omitted))) throw new Error(`复合问题缺少子项时必须单独指出缺项：${question}`);
  const complete = multiSource(question, completeFacts.map((fact,index)=>({id:`complete-${index}`,fact,source:'批准材料'})));
  if (complete.status !== 'draft') throw new Error(`复合问题的每个子项都有依据时应完成答复：${question}`);
}
const compatibilityOr = runOne('A产品支持Android和iOS吗？', 'A产品支持Android或iOS。');
if (compatibilityOr.status !== 'needs_more_information' || 'reply_draft' in compatibilityOr) throw new Error('“Android或iOS”不能证明两个平台都支持');
const compatibilityOrSingleTarget = runOne('A产品支持iOS吗？', 'A产品支持Android或iOS。');
if (compatibilityOrSingleTarget.status !== 'needs_more_information' || 'reply_draft' in compatibilityOrSingleTarget) throw new Error('“Android或iOS”也不能证明单独的 iOS 支持');
for (const [question,fact] of [
  ['A产品退款退到哪里？','A产品退款退到账户或余额。'],
  ['A产品退货运费由谁承担？','A产品退货运费由买家或商家承担。']
]) {
  const ambiguous = runOne(question,fact);
  if (ambiguous.status !== 'needs_more_information' || 'reply_draft' in ambiguous) throw new Error(`政策中的“或”不能生成确定结论：${question}`);
}
const stockDoesNotLeakCost = runOne('A产品有库存吗？','A产品目前有库存，内部成本为30元。');
if (stockDoesNotLeakCost.status !== 'draft' || stockDoesNotLeakCost.reply_draft.includes('成本') || stockDoesNotLeakCost.reply_draft.includes('30元')) throw new Error('库存答复不能泄露同句未询问的成本');
const reviewerDirectHomework = runOne('入门课程有作业吗？', '入门课程有课后作业。');
if (reviewerDirectHomework.status !== 'draft' || !reviewerDirectHomework.reply_draft.includes('课后作业')) throw new Error('自由问答应接受问题意图与直接结论匹配的课程作业事实');
const reviewerReplay = runOne('直播支持回放吗？', '直播支持回放。');
if (reviewerReplay.status !== 'draft' || !reviewerReplay.reply_draft.includes('支持回放')) throw new Error('直播回放不是设备兼容问题，应按直接能力事实回答');
const reviewerCorrectedInventory = runOne('A产品现在有库存吗？', 'A产品库存剩余8件，后来更正为0件。');
if (reviewerCorrectedInventory.status !== 'needs_more_information' || 'reply_draft' in reviewerCorrectedInventory) throw new Error('同一材料的后续库存更正不得沿用旧数量');
const reviewerPendingInventory = runOne('A产品现在有库存吗？', 'A产品目前有货。后来库存待确认。');
if (reviewerPendingInventory.status !== 'needs_more_information' || 'reply_draft' in reviewerPendingInventory) throw new Error('后续库存待确认必须使旧有货结论失效');
const unsupportedPriceNegation = runOne('A产品售价是多少？','A产品没有证据表明售价100元。');
if (unsupportedPriceNegation.status !== 'needs_more_information' || 'reply_draft' in unsupportedPriceNegation) throw new Error('否定证据的句子不能被改写成已确认售价');
const unsupportedPriceEvidenceDisplay = runOne('A产品售价是多少？','A产品没有证据显示售价100元。');
if (unsupportedPriceEvidenceDisplay.status !== 'needs_more_information' || 'reply_draft' in unsupportedPriceEvidenceDisplay) throw new Error('“没有证据显示”的否定价格材料不能被改写成已确认售价');
const conflictingBooking = multiSource('可以预约吗？', [
  {id:'booking-yes',fact:'目前可以预约。',source:'预约说明1'},
  {id:'booking-no',fact:'目前不可以预约。',source:'预约说明2'}
]);
if (conflictingBooking.status !== 'needs_more_information' || 'reply_draft' in conflictingBooking || !conflictingBooking.message.includes('互相冲突')) throw new Error('互斥的预约结论必须要求作者确认');
for (const fact of ['A产品缺货信息已删除。','A产品有库存不是最终结论。']) {
  const staleInventory = runOne('A产品有库存吗？', fact);
  if (staleInventory.status !== 'needs_more_information' || 'reply_draft' in staleInventory) throw new Error('已删除或未定稿的库存表述不能生成有货结论');
}
const combinedWarranty = multiSource('A产品保修范围是什么，保修多久？', [
  {id:'warranty-scope',fact:'A产品保修范围覆盖主板和电池。',source:'批准保修政策'},
  {id:'warranty-duration',fact:'A产品保修期限为2年。',source:'批准保修政策'}
]);
if (combinedWarranty.status !== 'draft' || !combinedWarranty.reply_draft.includes('主板和电池') || !combinedWarranty.reply_draft.includes('2年')) throw new Error('复合保修问题应分别使用范围和期限事实，不得误解析商品实体');
for (const [question, fact] of [
  ['A产品保修多久？','A产品保修2年且内部成本为30元。'],
  ['A产品支持蓝牙吗？','A产品支持蓝牙且内部成本为30元。'],
  ['A产品怎么使用？','A产品使用方法是打开设置然后点击保存即可且内部成本为30元。']
]) {
  const privateFact = runOne(question, fact);
  if (privateFact.status !== 'draft' || privateFact.reply_draft.includes('内部成本') || privateFact.reply_draft.includes('30元') || privateFact.evidence.some(item => item.facts.some(text => text.includes('内部成本')))) throw new Error(`回答不得带出或引用未询问的内部成本：${question}`);
}
const commaJoinedUsageCost = runOne('A产品怎么使用？', 'A产品使用方法是先开机，然后点击开始，内部成本为30元。');
if (commaJoinedUsageCost.status !== 'draft' || commaJoinedUsageCost.reply_draft.includes('内部成本') || commaJoinedUsageCost.reply_draft.includes('30元') || commaJoinedUsageCost.evidence.some(item => item.facts.some(text => /内部成本|30元/u.test(text)))) throw new Error('逗号连接的内部成本不得进入使用方法的草稿或依据');
for (const fact of ['A产品包装上写着支持iOS。','A产品支持iOS端订单退货。']) {
  const misleadingCompatibility = runOne('A产品支持iOS吗？', fact);
  if (misleadingCompatibility.status !== 'needs_more_information' || 'reply_draft' in misleadingCompatibility) throw new Error('包装标注或订单退货语境不能证明商品兼容性');
}
const isolatedRefundDestination = runOne('A产品退款会退到哪里？','A产品退款会原路退回至原支付账户，但退款到账时间待确认。');
if (isolatedRefundDestination.status !== 'draft' || !isolatedRefundDestination.reply_draft.includes('原支付账户') || isolatedRefundDestination.reply_draft.includes('到账时间待确认') || isolatedRefundDestination.evidence.some(item => item.facts.some(text => text.includes('到账时间待确认')))) throw new Error('已确认退款去向不应被未确认的到账时间推翻或污染');
const responsiblePayer = runOne('A产品退货运费由谁承担？','A产品退货运费由商家负责。');
if (responsiblePayer.status !== 'draft' || !responsiblePayer.reply_draft.includes('商家负责')) throw new Error('“由商家负责”是明确的退货运费承担结论');
for (const [question, fact] of [
  ['A产品现在有库存吗？', 'A产品库存尚未确认。'],
  ['A产品支持NFC吗？', 'A产品是否支持NFC尚未确认。'],
  ['A产品退货运费由谁承担？', 'A产品退货运费不是由买家承担。']
]) {
  const unresolved = runOne(question, fact);
  if (unresolved.status !== 'needs_more_information' || 'reply_draft' in unresolved) throw new Error(`未确认或否定的事实不能生成肯定答复：${fact}`);
}
const redVariant = runOne('A产品的红色款有货吗？', 'A产品红色款目前有货。');
if (redVariant.status !== 'draft' || !redVariant.reply_draft.includes('有货')) throw new Error('商品名后的“的”不应导致颜色款式实体匹配失败');
for (const [question, fact, expected] of [
  ['A产品库存数量是多少？', 'A产品库存剩余八件。', '八件'],
  ['A产品退款几天到账？', 'A产品退款将在三个工作日内到账。', '三个工作日'],
  ['A产品保修多久？', 'A产品保修两年。', '两年']
]) {
  const chineseNumber = runOne(question, fact);
  if (chineseNumber.status !== 'draft' || !chineseNumber.reply_draft.includes(expected)) throw new Error(`中文数字事实应能回答对应问题：${fact}`);
}
const bareCorrectionAcrossSources = multiSource('A产品现在有库存吗？', [
  {id:'a-stock',fact:'A产品库存剩余8件。',source:'A产品库存表'},
  {id:'bare-correction',fact:'后来更正为0件。',source:'补充卡片'}
]);
if (bareCorrectionAcrossSources.status !== 'needs_more_information' || 'reply_draft' in bareCorrectionAcrossSources) throw new Error('没有商品身份的跨来源更正不能被绑定到A产品，但应使旧库存答复失效');
const incompleteCompositeEvidence = multiSource('A产品价格和库存？', [
  {fact:'A产品售价100元。',source:'批准价目表'},
  {id:'stock',fact:'A产品有库存。',source:'库存表'}
]);
if (incompleteCompositeEvidence.status !== 'needs_more_information' || 'reply_draft' in incompleteCompositeEvidence
    || incompleteCompositeEvidence.needed_fields.length !== 1 || incompleteCompositeEvidence.needed_fields[0] !== '材料 ID') throw new Error('复合问题任一对应事实缺少材料 ID 时必须整体停止并只追问材料 ID');
const priceRange = runOne('A产品售价是多少？', 'A产品售价100元起。');
if (priceRange.status !== 'draft' || !priceRange.reply_draft.includes('100元起')) throw new Error('价格下限必须保留“起”，不得改写成精确固定价格');
for (const fact of ['A产品签收后7天内可退货。', 'A产品签收后七天内可退货。']) {
  const returnWindow = runOne('A产品退货期限多久？', fact);
  if (returnWindow.status !== 'draft' || !returnWindow.reply_draft.includes(fact.includes('七天') ? '七天' : '7天')) throw new Error(`明确退货期限应能匹配并作答：${fact}`);
}
const refundTimeAndDestination = multiSource('A产品退款什么时候到账、会退到哪里？', [
  {id:'refund-combined',fact:'A产品退款将在3个工作日内原路退回原支付账户。',source:'批准退款规则'}
]);
if (refundTimeAndDestination.status !== 'draft' || !refundTimeAndDestination.reply_draft.includes('3个工作日')
    || !refundTimeAndDestination.reply_draft.includes('原支付账户')
    || !refundTimeAndDestination.evidence.some(item=>item.facts.some(fact=>fact.includes('3个工作日') && fact.includes('原支付账户')))) throw new Error('复合退款回答的依据必须同时保留到账时效和去向');
const correctedMaterial = runOne('A产品材质是什么？', 'A产品材质原为塑料，后来更正为玻璃。');
if (correctedMaterial.status !== 'draft' || !correctedMaterial.reply_draft.includes('A产品材质为玻璃') || correctedMaterial.reply_draft.includes('塑料')
    || !correctedMaterial.evidence.some(item=>item.facts.some(fact=>fact.includes('A产品材质更正为玻璃')))) throw new Error('材质的明确后续更正应覆盖旧结论并保留对应证据');
for (const question of ['A产品现有几件？', '还有几件？']) {
  const missingCount = runOne(question, 'A产品有货。');
  if (missingCount.status !== 'needs_more_information' || 'reply_draft' in missingCount) throw new Error(`询问库存数量时只有有货状态不能回答：${question}`);
}
for (const question of ['A产品退款会退到什么账户？', 'A产品退款返回哪张卡？']) {
  const missingDestination = runOne(question, 'A产品支持退款。');
  if (missingDestination.status !== 'needs_more_information' || 'reply_draft' in missingDestination) throw new Error(`仅有退款许可不能回答具体退款渠道：${question}`);
}
const payerExplanationOnly = runOne('A产品退货运费由谁承担？', 'A产品退货运费由商家负责说明。');
if (payerExplanationOnly.status !== 'needs_more_information' || 'reply_draft' in payerExplanationOnly) throw new Error('“负责说明”不是已确认的退货运费承担结论');
const privateEmail = runOne('A产品有库存吗？', 'A产品有货，管理员邮箱是admin@example.com。');
if (privateEmail.status !== 'draft' || !privateEmail.reply_draft.includes('有货') || /admin@example\.com|管理员邮箱/u.test(privateEmail.reply_draft)
    || /[，,；;][。！？!?]/u.test(privateEmail.reply_draft)
    || privateEmail.evidence.some(item=>item.facts.some(fact=>/admin@example\.com|管理员邮箱|[，,；;][。！？!?]/u.test(fact)))) throw new Error('非联系问题的答复与证据不得泄露无关管理员邮箱');
for (const [question, current, other] of [
  ['A产品支持Android吗？','A产品支持Android。','B产品Android支持情况仍在测试。'],
  ['A产品什么时候上线？','A产品将于2027年上线。','B产品上线日期尚未确定。']
]) {
  const isolated = multiSource(question,[{id:'a',fact:current,source:'A产品资料'},{id:'b',fact:other,source:'B产品资料'}]);
  if (isolated.status !== 'draft' || !isolated.reply_draft.includes(question.includes('上线') ? '2027年' : '支持Android')) throw new Error('B产品的后续/未定结论不能使A产品证据失效');
}
for (const [question, fact] of [
  ['A产品可以退货吗？','A产品支持退货咨询。'],
  ['A产品可以换货吗？','A产品提供换货说明。'],
  ['A产品保修多久？','A产品支持保修查询。']
]) {
  const serviceOnly = runOne(question, fact);
  if (serviceOnly.status !== 'needs_more_information' || 'reply_draft' in serviceOnly) throw new Error(`咨询/说明/查询服务不能冒充政策结论：${fact}`);
}
const chineseMultiTarget = multiSource('A产品支持安卓和iOS吗？', [
  {id:'android-cn',fact:'A产品支持安卓。',source:'兼容表'},
  {id:'ios-cn',fact:'A产品支持iOS。',source:'兼容表'}
]);
if (chineseMultiTarget.status !== 'draft' || !chineseMultiTarget.reply_draft.includes('安卓') || !chineseMultiTarget.reply_draft.includes('iOS')) throw new Error('分别批准的安卓与iOS结论可以合并回答');
const whyRefund = runOne('为什么退款失败？', '退款失败是由于账户异常。');
if (whyRefund.status !== 'draft' || !whyRefund.reply_draft.includes('账户异常')) throw new Error('“为什么”不能被误识别为商品实体，退款原因事实应直接回答');
const correctedLaunchDate = runOne('A产品什么时候上线？', 'A产品上线日期更正为2027年6月。');
if (correctedLaunchDate.status !== 'draft' || !correctedLaunchDate.reply_draft.includes('2027年6月')) throw new Error('明确更正的上线日期应能回答上线时间');
const correctedColorSameConclusion = multiSource('A产品是什么颜色？', [
  {id:'color-current',fact:'A产品颜色为蓝色。',source:'商品资料'},
  {id:'color-correction',fact:'A产品颜色不是红色，而是蓝色。',source:'更正资料'}
]);
if (correctedColorSameConclusion.status !== 'draft' || !correctedColorSameConclusion.reply_draft.includes('蓝色')) throw new Error('明确排除旧颜色并确认蓝色的更正不能与蓝色结论构成冲突');
for (const [question, fact] of [
  ['直播的嘉宾是谁？', '讲座的嘉宾是李明。'],
  ['课程在哪里上课？', '活动在线下教室举行。']
]) {
  const wrongTopic = runOne(question, fact);
  if (wrongTopic.status !== 'needs_more_information' || 'reply_draft' in wrongTopic) throw new Error(`不能把其他活动类型的事实套到问题上：${question}`);
}
const deliveryFacetConflict = multiSource('A产品配送哪些地区、多久到货？', [
  {id:'delivery-2d',fact:'A产品配送范围为北京，预计2天到货。',source:'配送规则1'},
  {id:'delivery-3d',fact:'A产品配送范围为北京，预计3天到货。',source:'配送规则2'}
]);
if (deliveryFacetConflict.status !== 'needs_more_information' || 'reply_draft' in deliveryFacetConflict) throw new Error('复合配送问题的同一地区到货时效冲突必须先确认');
const refundFacetConflict = multiSource('A产品退款什么时候到账、会退到哪里？', [
  {id:'refund-account',fact:'A产品退款将在3个工作日内原路退回原支付账户。',source:'退款规则1'},
  {id:'refund-alipay',fact:'A产品退款将在3个工作日内退到支付宝。',source:'退款规则2'}
]);
if (refundFacetConflict.status !== 'needs_more_information' || 'reply_draft' in refundFacetConflict) throw new Error('复合退款问题的去向冲突必须先确认');
const contactLeak = runOne('A产品有库存吗？', 'A产品当前有货，联系人张三，电话13800138000。');
if (contactLeak.status !== 'draft' || /张三|13800138000/u.test(contactLeak.reply_draft)
    || contactLeak.evidence.some(item=>item.facts.some(fact=>/张三|13800138000/u.test(fact)))) throw new Error('未询问联系方式时不得在回复或依据中泄露联系人姓名和手机号');
const symbolFirstPrice = runOne('A产品多少钱？', 'A产品售价¥100。');
if (symbolFirstPrice.status !== 'draft' || !symbolFirstPrice.reply_draft.includes('100')) throw new Error('带币种前置符号的明确售价应能生成回复');
const lowercaseBrandMismatch = runOne('airpods多少钱？', 'macbook售价9999元。');
if (lowercaseBrandMismatch.status !== 'needs_more_information' || 'reply_draft' in lowercaseBrandMismatch) throw new Error('小写英文品牌必须参与商品实体匹配，不能套用其他商品价格');
const homeworkPolarityConflict = multiSource('入门课程有课后作业吗？', [
  {id:'homework-yes',fact:'入门课程有课后作业。',source:'课程说明'},
  {id:'homework-no',fact:'入门课程没有课后作业。',source:'课程说明修订稿'}
]);
if (homeworkPolarityConflict.status !== 'needs_more_information' || 'reply_draft' in homeworkPolarityConflict) throw new Error('自由问答的相反存在结论必须先请求作者确认');
const compositeSizeConflict = multiSource('A产品尺寸是多少？', [
  {id:'size-10',fact:'A产品尺寸为10×20厘米。',source:'商品说明'},
  {id:'size-12',fact:'A产品尺寸为12×20厘米。',source:'商品说明修订稿'}
]);
if (compositeSizeConflict.status !== 'needs_more_information' || 'reply_draft' in compositeSizeConflict) throw new Error('多维尺寸任一维度冲突时必须先确认');
const correctedEuroPrice = multiSource('A产品多少钱？', [
  {id:'price-old',fact:'A产品售价100元。',source:'旧价目表'},
  {id:'price-new',fact:'A产品售价后来更正为99欧元。',source:'最新批准价目表'}
]);
if (correctedEuroPrice.status !== 'draft' || !correctedEuroPrice.reply_draft.includes('99欧元') || correctedEuroPrice.reply_draft.includes('100元')) throw new Error('后续欧元价格更正必须覆盖旧价');
const thresholdDiscount = runOne('A产品优惠是什么？', 'A产品优惠为第2件5折。');
if (thresholdDiscount.status !== 'draft' || !thresholdDiscount.reply_draft.includes('第2件5折')) throw new Error('优惠草稿必须保留第几件的适用门槛');
const thresholdDiscountConflict = multiSource('A产品优惠是什么？', [
  {id:'discount-2',fact:'A产品优惠为第2件5折。',source:'活动页'},
  {id:'discount-3',fact:'A产品优惠为第3件5折。',source:'活动页修订稿'}
]);
if (thresholdDiscountConflict.status !== 'needs_more_information' || 'reply_draft' in thresholdDiscountConflict) throw new Error('不同件数门槛的优惠不能合并为同一折扣');
const unrecognizedProductSafety = runOne('晨曦防晒霜安全吗？', '暮色玩具通过安全认证。');
if (unrecognizedProductSafety.status !== 'needs_more_information' || 'reply_draft' in unrecognizedProductSafety) throw new Error('未识别商品名也不能让安全结论跨商品套用');
for (const [question, fact] of [
  ['A产品多少钱？', 'A产品售价100元，最终以门店确认为准。'],
  ['A产品什么时候上线？', 'A产品将于2027年5月上线，具体日期以审批结果为准。']
]) {
  const pendingConclusion = runOne(question, fact);
  if (pendingConclusion.status !== 'needs_more_information' || 'reply_draft' in pendingConclusion) throw new Error(`附带最终确认条件的结论不能输出为确定承诺：${fact}`);
}
for (const [question, fact] of [
  ['A产品多少钱？', 'A产品售价100元，但售价200元。'],
  ['A产品支持安卓吗？', 'A产品支持安卓，但不支持安卓。'],
  ['A产品现在有库存吗？', 'A产品库存剩余3件，但已售罄。']
]) {
  const internalConflict = runOne(question, fact);
  if (internalConflict.status !== 'needs_more_information' || 'reply_draft' in internalConflict || !internalConflict.message.includes('互斥')) throw new Error(`同一材料中的互斥结论必须先确认：${fact}`);
}
for (const [question, fact] of [
  ['A产品多少钱？', 'A产品售价100元，售价200元。'],
  ['A产品支持安卓吗？', 'A产品支持安卓，不支持安卓。'],
  ['A产品现在有库存吗？', 'A产品库存剩余3件，已售罄。']
]) {
  const internalConflict = runOne(question, fact);
  if (internalConflict.status !== 'needs_more_information' || 'reply_draft' in internalConflict || !internalConflict.message.includes('互斥')) throw new Error(`逗号连接的同一材料互斥结论必须先确认：${fact}`);
}
const giftBoxMismatch = runOne('晨星礼盒安全吗？', '暮光礼盒通过安全认证。');
if (giftBoxMismatch.status !== 'needs_more_information' || 'reply_draft' in giftBoxMismatch) throw new Error('不同礼盒的安全材料不能互相套用');
const compoundSafetyAndWaterproof = multiSource('A产品安全吗并且防水吗？', [
  {id:'safety',fact:'A产品通过安全认证。',source:'批准认证材料'},
  {id:'waterproof',fact:'A产品具备防水能力。',source:'批准商品材料'}
]);
if (compoundSafetyAndWaterproof.status !== 'draft' || !compoundSafetyAndWaterproof.reply_draft.includes('安全认证') || !compoundSafetyAndWaterproof.reply_draft.includes('防水')) throw new Error('复合自由问答的每个子问题都有依据时应分别起草');
for (const [question, fact] of [
  ['A产品安全吗并且防水吗？', 'A产品通过安全认证。'],
  ['A产品防水防尘吗？', 'A产品具备防水能力。']
]) {
  const missingSubAnswer = runOne(question, fact);
  if (missingSubAnswer.status !== 'needs_more_information' || 'reply_draft' in missingSubAnswer) throw new Error(`复合问题有一个子项缺依据时不得只回答部分：${question}`);
}
for (const [question, fact] of [
  ['A产品支持NFC吗？', 'A产品尚未验证是否支持NFC。'],
  ['教程的第2步适用于哪个版本？', '教程第2步尚未验证是否适用于v2。']
]) {
  const unverified = runOne(question, fact);
  if (unverified.status !== 'needs_more_information' || 'reply_draft' in unverified) throw new Error(`尚未验证的兼容或版本事实不能作为已确认结论：${fact}`);
}
const secretInMatchedStock = runOne('A产品有库存吗？', 'A产品有货且访问令牌为 sk-test-1234567890。');
if (secretInMatchedStock.status !== 'draft' || !secretInMatchedStock.reply_draft.includes('有货') || /sk-test|令牌/u.test(JSON.stringify(secretInMatchedStock))) throw new Error('匹配事实中的令牌必须从回复和依据中清除');
console.log('PASS: 参考交付、步骤/意图/事件隔离、实体款式匹配、政策结论、跨来源失效与组合字段校验均通过。');
for (const [question, fact] of [
  ['发货前可以退款吗？','订单发货前可以退款。'],
  ['到货后可以退货吗？','商品到货后可以退货。']
]) {
  const timing = runOne(question, fact);
  if (timing.status !== 'draft' || !/(?:退款|退货)/u.test(timing.reply_draft)
      || timing.needed_fields?.some(field => /发货日期|配送|商品标识/u.test(field))) throw new Error(`条件时间词不能被当成商品或配送字段：${question}`);
}
const unknownStockFinal = runOne('A产品现在有库存吗？','A产品有货状态未知，售价100元。');
if (unknownStockFinal.status !== 'needs_more_information' || 'reply_draft' in unknownStockFinal) throw new Error('库存状态未知时不得把同句价格误当作有货结论');
for (const [question, fact, expected] of [
  ['课程难度如何？','入门课程难度为初级。','初级'],
  ['A产品能在户外使用吗？','A产品可以在户外使用。','户外使用']
]) {
  const direct = runOne(question, fact);
  if (direct.status !== 'draft' || !direct.reply_draft.includes(expected)) throw new Error(`清晰批准的自由问答结论应能匹配：${question}`);
}
const noCrossProductLeak = runOne('A产品怎么使用？','A产品使用方法是先开机，然后点击开始，B产品售价200元。');
if (noCrossProductLeak.status !== 'draft' || !noCrossProductLeak.reply_draft.includes('先开机')
    || noCrossProductLeak.reply_draft.includes('B产品') || noCrossProductLeak.reply_draft.includes('200元')) throw new Error('自由问答草稿不得泄露同一材料中的其他商品陈述');
const metadataSecret = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {
  input: JSON.stringify({tone:'简洁', questions:['A产品有库存吗？'], sources:[{id:'token=SECRET123', fact:'A产品有货。', source:'https://example.com/policy?access_token=SECRET123'}]}), encoding:'utf8'
})).results[0];
if (metadataSecret.status !== 'draft' || /SECRET123/u.test(JSON.stringify(metadataSecret))) throw new Error('证据 ID 与来源元数据中的凭据必须脱敏');
const directContextCases = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {
  input: JSON.stringify({tone:'简洁', questions:['这个滤镜有几种效果？','这个视频在哪里拍的？','你用什么相机拍视频？'], sources:[
    {id:'template',fact:'这个模板共有3种效果。',source:'批准模板卡'},
    {id:'location',fact:'这个视频是在杭州西湖拍摄的。',source:'拍摄记录'},
    {id:'camera',fact:'我拍视频使用索尼 A7M4。',source:'拍摄记录'}
  ]}), encoding:'utf8'
})).results;
if (directContextCases[0].status !== 'needs_more_information' || directContextCases.slice(1).some(result => result.status !== 'draft')) throw new Error('自由问答必须隔离不同对象，同时支持地点与拍摄设备的直接事实');
for (const source of [
  'Authorization: Bearer SECRET_BEARER_123456',
  'https://user123:password456@example.com/private',
  'https://example.com/file?X-Amz-Signature=SECRET_SIGNATURE_123456'
]) {
  const redacted = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {
    input: JSON.stringify({tone:'简洁', questions:['A产品有库存吗？'], sources:[{id:'safe',fact:'A产品有货。',source}]}), encoding:'utf8'
  })).results[0];
  if (redacted.status !== 'draft' || redacted.evidence.some(item => item.source.includes('SECRET_') || /password456|user123/u.test(item.source))) throw new Error(`来源凭据必须脱敏：${source}`);
}
const nonShortage = runOne('A产品有货吗？','A产品目前不缺货，并支持退货。');
if (nonShortage.status !== 'draft' || !/有货|不缺货/u.test(nonShortage.reply_draft) || /无货/u.test(nonShortage.reply_draft)) throw new Error('“不缺货”是肯定有货，不能反转为无货');
for (const [question, fact, expected] of [
  ['A产品有货吗？','A产品目前有货，但价格待确认。','有货'],
  ['A产品是什么颜色？','A产品颜色为红色，但材质待确认。','红色']
]) {
  const independentField = runOne(question, fact);
  if (independentField.status !== 'draft' || !independentField.reply_draft.includes(expected)) throw new Error(`其他字段待确认不能阻断已有结论：${question}`);
}
const targetScopedCompatibility = runOne('A产品支持 iOS 吗？','A产品支持 iOS，但不支持 Android。');
if (targetScopedCompatibility.status !== 'draft' || !/支持 iOS/u.test(targetScopedCompatibility.reply_draft)) throw new Error('兼容结论应按被询问的平台分别判定');
const warrantyScopeAnswer = runOne('A产品保修范围是什么？','A产品保修范围包括主板和电池。');
if (warrantyScopeAnswer.status !== 'draft' || !/主板和电池/u.test(warrantyScopeAnswer.reply_draft)) throw new Error('明确保修范围应生成可复制答复');
const launchSale = runOne('A产品什么时候开售？','A产品将于2027年5月开售。');
if (launchSale.status !== 'draft' || !/2027年5月/u.test(launchSale.reply_draft)) throw new Error('明确开售时间应匹配日程字段');
for (const [question, fact] of [
  ['退款什么时候到账？','退款申请需在3个工作日内提交/审核。'],
  ['订单什么时候发货？','订单发货前可在48小时内退款。']
]) {
  const wrongBusinessTimer = runOne(question, fact);
  if (wrongBusinessTimer.status !== 'needs_more_information' || 'reply_draft' in wrongBusinessTimer) throw new Error(`申请/退款或退款/发货时限不能互相代答：${question}`);
}
for (const [question, fact] of [
  ['A产品有库存吗？','A产品目前没有库存压力。'],
  ['A产品有库存吗？','A产品没有现货说明。'],
  ['有货吗？','没有现货说明。']
]) {
  const stockMetadata = runOne(question, fact);
  if (stockMetadata.status !== 'needs_more_information' || 'reply_draft' in stockMetadata) throw new Error(`库存说明或压力不是有货/无货结论：${fact}`);
}
for (const [question, fact] of [
  ['课程时长多久？','课程时长不是60分钟。'],
  ['直播主题是什么？','直播主题不是秋季护肤。']
]) {
  const excludedValue = runOne(question, fact);
  if (excludedValue.status !== 'needs_more_information' || 'reply_draft' in excludedValue) throw new Error(`否定排除项不是问题所需的肯定答案：${fact}`);
}
for (const [question, fact, oldValue, newValue] of [
  ['A产品多少钱？','A产品售价100元，后来更正为120元。','100元','120元'],
  ['A产品现在有几件？','A产品库存剩余3件，后来更正为5件。','3件','5件'],
  ['A产品什么时候上线？','A产品将于2027年5月上线，后来更正为2027年6月上线。','2027年5月','2027年6月'],
  ['订单预计几天发货？','订单预计2天发货，后来更正为3天发货。','2天','3天'],
  ['A产品退款多久到账？','A产品退款将在3个工作日内到账，后来更正为5个工作日内到账。','3个工作日','5个工作日']
]) {
  const corrected = runOne(question, fact);
  if (corrected.status !== 'draft' || corrected.reply_draft.includes(oldValue) || !corrected.reply_draft.includes(newValue)) throw new Error(`同句明确更正应只采用新值：${fact}`);
}
const missingOnlyId = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {
  input: JSON.stringify({tone:'简洁', questions:['A产品有库存吗？'], sources:[{fact:'A产品有货。',source:'库存记录'}]}), encoding:'utf8'
})).results[0];
if (missingOnlyId.status !== 'needs_more_information' || missingOnlyId.needed_fields.length !== 1 || missingOnlyId.needed_fields[0] !== '材料 ID'
    || !missingOnlyId.message.includes('只需补充对应的材料 ID') || missingOnlyId.message.includes('补充对应事实及来源')) throw new Error('仅缺材料 ID 时，追问说明也必须只要求补 ID');
for (const question of ['A产品配送哪些地区，多久到货？','A产品配送地区和到货时间是什么？']) {
  const deliveryFacets = multiSource(question,[
    {id:'region',fact:'A产品配送范围为江浙沪。',source:'批准配送地区表'},
    {id:'eta',fact:'A产品预计3天内到货。',source:'批准物流时效'}
  ]);
  const evidenceIds = deliveryFacets.evidence.map(item => item.id).sort().join(',');
  if (deliveryFacets.status !== 'draft' || !deliveryFacets.reply_draft.includes('江浙沪') || !deliveryFacets.reply_draft.includes('3天')
      || evidenceIds !== 'eta,region') throw new Error(`复合配送问法必须分别回答地区与时效：${question}`);
}
const dispatchAndArrival = multiSource('A产品什么时候发货，什么时候到货？',[
  {id:'dispatch',fact:'A产品付款后48小时内发货。',source:'发货规则'},
  {id:'arrival',fact:'A产品发货后3天内到货。',source:'物流规则'}
]);
if (dispatchAndArrival.status !== 'draft' || !dispatchAndArrival.reply_draft.includes('48小时') || !dispatchAndArrival.reply_draft.includes('3天')
    || dispatchAndArrival.evidence.map(item => item.id).sort().join(',') !== 'arrival,dispatch') throw new Error('发货时效与到货时效必须分别匹配，不能互相冲突');
const warrantyFacets = multiSource('A产品保修多久，范围是什么？',[
  {id:'duration',fact:'A产品保修期为2年。',source:'保修政策'},
  {id:'scope',fact:'A产品保修范围覆盖主板。',source:'保修政策'}
]);
if (warrantyFacets.status !== 'draft' || !warrantyFacets.reply_draft.includes('2年') || !warrantyFacets.reply_draft.includes('主板')
    || warrantyFacets.evidence.map(item => item.id).sort().join(',') !== 'duration,scope') throw new Error('复合保修问题必须同时回答期限和范围');
const registrationDateAsEvent = runOne('活动什么时候举行？','活动报名将于2027年5月1日开放。');
if (registrationDateAsEvent.status !== 'needs_more_information' || 'reply_draft' in registrationDateAsEvent) throw new Error('报名开放日期不能冒充活动举行日期');
for (const [question,fact] of [
  ['A产品有货吗？','A产品应该有货。'],
  ['A产品价格是多少？','A产品价格应该是100元。'],
  ['A产品什么时候上线？','A产品打算2027年上线。'],
  ['A产品保修多久？','A产品保修大约两年。'],
  ['A产品保修多久？','A产品原保修2年。']
]) {
  const speculative = runOne(question,fact);
  if (speculative.status !== 'needs_more_information' || 'reply_draft' in speculative) throw new Error(`不确定或过期的结论不能作为当前承诺：${fact}`);
}
for (const [question,fact] of [
  ['A产品尺寸是多少？','A产品包装尺寸为10厘米。'],
  ['A产品重量是多少？','A产品包装盒重量为2千克。'],
  ['A产品材质是什么？','A产品附带收纳袋材质为尼龙。'],
  ['A产品是什么颜色？','A产品说明书封面是蓝色。']
]) {
  const wrongObject = runOne(question,fact);
  if (wrongObject.status !== 'needs_more_information' || 'reply_draft' in wrongObject) throw new Error(`配件、包装或说明书属性不能冒充产品属性：${fact}`);
}
const scopedWarranty = runOne('A产品保修多久？','A产品电池保修2年，整机保修1年。');
if (scopedWarranty.status !== 'draft' || !scopedWarranty.reply_draft.includes('电池保修2年') || !scopedWarranty.reply_draft.includes('整机保修1年')) throw new Error('包含不同部件期限的保修材料必须完整说明各自范围与期限');
for (const [question,fact] of [
  ['A产品售价多少？','A产品售价为100元或200元。'],
  ['A产品售价多少？','A产品售价100元左右。'],
  ['A产品有货吗？','A产品目前有货或无货。']
]) {
  const uncertainOrConflicting = runOne(question,fact);
  if (uncertainOrConflicting.status !== 'needs_more_information' || 'reply_draft' in uncertainOrConflicting) throw new Error(`价格区间或互斥库存不能被选成确定答案：${fact}`);
}
const refundOriginalRoute = runOne('A产品退款会原路退回吗？','A产品退款原路退回至原支付账户。');
if (refundOriginalRoute.status !== 'draft' || !refundOriginalRoute.reply_draft.includes('原支付账户')) throw new Error('明确的原路退款依据应能回答原路退回问法');
const weekendHours = runOne('周末几点营业？','周末10:00至18:00营业。');
if (weekendHours.status !== 'draft' || !weekendHours.reply_draft.includes('10:00') || !weekendHours.reply_draft.includes('18:00')) throw new Error('周末时段不能被解析成商品名而拒绝营业时间问题');
const openTime = runOne('店铺什么时候开门？','营业时间为10:00至18:00。');
if (openTime.status !== 'draft' || !openTime.reply_draft.includes('10:00')) throw new Error('什么时候开门应识别为营业时间问题');
const credentialInFact = runOne('A产品售价多少？','A产品售价100元，sk-proj-ABCDEF1234567890，ghp_ABCDEF1234567890。');
if (`${credentialInFact.reply_draft || ''}${JSON.stringify(credentialInFact.evidence || [])}`.includes('sk-proj-') || `${credentialInFact.reply_draft || ''}${JSON.stringify(credentialInFact.evidence || [])}`.includes('ghp_')) throw new Error('裸 API/GitHub 凭据不能出现在回复或证据中');
const signedSource = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input:JSON.stringify({tone:'简洁',questions:['A产品售价多少？'],sources:[{id:'signed',fact:'A产品售价100元。',source:'https://storage.googleapis.com/item?X-Goog-Credential=private%40account&X-Goog-Signature=secret-signature'}]}),encoding:'utf8'})).results[0];
if (JSON.stringify(signedSource.evidence || []).includes('private%40account') || JSON.stringify(signedSource.evidence || []).includes('secret-signature')) throw new Error('Google Cloud 私有签名链接不能在 evidence.source 中泄露');
const reviewerBlockers = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({
  tone: '简洁',
  questions: ['《春风》课程多少钱？', 'A款有货吗？', '这次活动怎么参加？', 'A产品多少钱？'],
  sources: [
    {id: 'autumn-course', fact: '《秋雨》课程售价100元。', source: '课程价目表'},
    {id: 'variant-b', fact: 'B款有货。', source: '库存表'},
    {id: 'pending-signup', fact: '这次活动报名方式待公布。', source: '活动公告'},
    {id: 'coupon-only', fact: 'A产品价格页面有100元优惠券。', source: 'https://example.test/item?key=AIzaSyExampleKey0123456789&auth=private-auth&session=private-session'}
  ]
}), encoding: 'utf8'})).results;
if (reviewerBlockers.some(result => result.status !== 'needs_more_information' || 'reply_draft' in result)) throw new Error('课程/款式错配、待公布参加方式和仅优惠券均不得生成草稿');
if (!reviewerBlockers[2].needed_fields.some(field => field.includes('参加方式'))) throw new Error('活动参加方式待公布时必须请求实际参加方式');
if (!reviewerBlockers[3].needed_fields.some(field => field.includes('售价或价格'))) throw new Error('优惠券金额不得作为商品售价依据');
const reviewerSensitiveSource = JSON.stringify(JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({
  tone: '简洁', questions: ['A产品多少钱？'],
  sources: [{id: 'price', fact: 'A产品售价100元。', source: 'https://example.test/item?key=AIzaSyExampleKey0123456789&auth=private-auth&session=private-session'}]
}), encoding: 'utf8'})).results[0].evidence || []);
if (/AIzaSyExampleKey|private-auth|private-session/u.test(reviewerSensitiveSource)) throw new Error('Google API key、auth 与 session 参数不得出现在 evidence.source');
const suitabilityConflict = multiSource('晨曦杯适合儿童吗？',[
  {id:'suitable',fact:'晨曦杯适合儿童。',source:'产品说明'},
  {id:'unsuitable',fact:'晨曦杯不适合儿童。',source:'安全说明'}
]);
if (suitabilityConflict.status !== 'needs_more_information' || 'reply_draft' in suitabilityConflict) throw new Error('同一人群的适用性结论冲突时必须追问确认');
const priceInterval = runOne('A产品价格是多少？','A产品价格为100元至200元。');
if (priceInterval.status !== 'draft' || !priceInterval.reply_draft.includes('100元') || !priceInterval.reply_draft.includes('200元')) throw new Error('价格范围不得被缩成唯一的下界售价');

// Reviewer blockers: reject unsupported claims, omit unasked private data,
// and retain direct, explicitly approved course/policy/version conclusions.
const reviewerRequiredCases = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({
  tone: '简洁',
  questions: ['A产品售价多少？', 'A产品有货吗？', '这次直播主题是什么？', '课程几点上课？', 'A产品退货期限多久？', '教程第2步适用哪个版本？'],
  sources: [
    {id:'unverified-price', fact:'A产品售价100元的说法未经证实。', source:'作者核验记录'},
    {id:'inaccurate-stock', fact:'A产品有货的消息不准确。', source:'作者核验记录'},
    {id:'live-topic', fact:'这次直播主题是秋季护肤，嘉宾住址为北京市朝阳区某街道1号。', source:'作者直播公告'},
    {id:'course-time', fact:'课程每周三20:00上课。', source:'作者课程表'},
    {id:'return-window', fact:'A产品支持7天无理由退货。', source:'作者退货政策'},
    {id:'step-version', fact:'教程第2步适用于v2，不适用于v3。', source:'作者教程说明'}
  ]
}), encoding: 'utf8'})).results;
if (reviewerRequiredCases[0].status !== 'needs_more_information' || reviewerRequiredCases[1].status !== 'needs_more_information') throw new Error('未经证实售价或不准确库存不得生成草稿');
if (reviewerRequiredCases[2].status !== 'draft' || /住址|北京市朝阳区某街道1号/u.test(`${reviewerRequiredCases[2].reply_draft}${JSON.stringify(reviewerRequiredCases[2].evidence)}`)) throw new Error('未询问住址不得出现在直播主题回复或依据中');
if (reviewerRequiredCases[3].status !== 'draft' || !reviewerRequiredCases[3].reply_draft.includes('每周三20:00')) throw new Error('明确课程上课时间必须可作答');
if (reviewerRequiredCases[4].status !== 'draft' || !reviewerRequiredCases[4].reply_draft.includes('7天无理由退货')) throw new Error('阿拉伯数字退货期限必须可作答');
if (reviewerRequiredCases[5].status !== 'draft' || !reviewerRequiredCases[5].reply_draft.includes('适用于v2') || reviewerRequiredCases[5].reply_draft.includes('v3')) throw new Error('版本范围材料应只交付明确适用的v2结论');

// Attempt 68 review regressions: unverified claims, address minimization,
// schedule intent, Arabic-numeral return windows, and scoped version facts.
for (const [question, fact] of [
  ['A产品售价多少？', 'A产品售价100元的说法未经证实。'],
  ['A产品有货吗？', 'A产品有货的消息不准确。']
]) {
  const unverified = runOne(question, fact);
  if (unverified.status !== 'needs_more_information' || 'reply_draft' in unverified) throw new Error(`未经证实或明确不准确的价格/库存不能成为肯定回复：${fact}`);
}
const unaskedAddress = runOne('A产品有货吗？', 'A产品有货。联系人张三，家庭住址：北京市朝阳区建国路88号。');
if (unaskedAddress.status !== 'draft' || /张三|家庭住址|北京市朝阳区建国路88号/u.test(`${unaskedAddress.reply_draft}${JSON.stringify(unaskedAddress.evidence)}`)) throw new Error('未被询问的联系人住址不得进入回复或证据');
const weekdayCourse = runOne('课程几点上课？', '课程每周三20:00上课。');
if (weekdayCourse.status !== 'draft' || !weekdayCourse.reply_draft.includes('20:00')) throw new Error('课程具体上课时间应回答“几点上课”');
for (const [question, fact] of [
  ['A产品支持几天退货？', 'A产品支持签收后7天内退货。'],
  ['A产品可以退货吗？', 'A产品支持7天退货。']
]) {
  const arabicReturnWindow = runOne(question, fact);
  if (arabicReturnWindow.status !== 'draft' || !arabicReturnWindow.reply_draft.includes('7天')) throw new Error(`阿拉伯数字退货期限应识别为明确政策：${fact}`);
}
const scopedVersion = runOne('这门课程适用于哪个版本？', '课程适用于v2，不适用于v3。');
if (scopedVersion.status !== 'draft' || !scopedVersion.reply_draft.includes('v2') || scopedVersion.reply_draft.includes('v3')) throw new Error('明确适用v2且不适用v3的课程材料应只回答已确认的v2');

// Keep only release-critical checks for stale facts, contradictory options,
// incomplete denials, and object matching in mixed catalog notes.
for (const [question, fact] of [
  ['A产品现在有货吗？', 'A产品昨天有货。'],
  ['A产品现在多少钱？', 'A产品昨天售价100元。'],
  ['A产品现在支持 iOS 吗？', 'A产品昨天支持 iOS。'],
  ['A产品目前保修多久？', 'A产品昨天保修2年。'],
  ['A产品颜色是什么？', 'A产品颜色为红色或蓝色。'],
  ['A产品材质是什么？', 'A产品材质为塑料或金属。'],
  ['A产品型号是什么？', 'A产品型号为X100或X200。'],
  ['这次活动怎么参加？', '这次活动不是通过小程序报名。'],
  ['课程在哪里上课？', '课程不在北京上课。']
]) {
  const criticalIssue = runOne(question, fact);
  if (criticalIssue.status !== 'needs_more_information' || 'reply_draft' in criticalIssue) throw new Error(`关键问题材料不足或有冲突时不得生成误导性答复：${fact}`);
}
const currentCatalogFact = runOne('蜜桃乌龙现在有货吗？', '蜜桃乌龙目前有货，茉莉绿茶目前无货。');
if (currentCatalogFact.status !== 'draft' || !currentCatalogFact.reply_draft.includes('蜜桃乌龙目前有货') || /茉莉绿茶/u.test(currentCatalogFact.reply_draft)) throw new Error('明确命中的商品库存应能从混合商品材料中回答');
const sessionIdSource = JSON.parse(execFileSync(process.execPath, [resolve(root, 'scripts/draft-answers.mjs'), '-'], {input: JSON.stringify({
  tone: '简洁', questions: ['A产品多少钱？'],
  sources: [{id:'price',fact:'A产品售价100元。',source:'https://internal.example/item?sessionid=abcDEF123456789xyz'}]
}), encoding:'utf8'})).results[0];
if (sessionIdSource.status !== 'draft' || JSON.stringify(sessionIdSource.evidence).includes('abcDEF123456789xyz')) throw new Error('来源中的明确 sessionid 凭据必须脱敏');
for (const [question,fact] of [
  ['A产品可以退货吗？','A产品提供退货入口。'],
  ['A产品可以退款吗？','A产品提供退款入口。']
]) {
  const entryNotPolicy = runOne(question,fact);
  if (entryNotPolicy.status !== 'needs_more_information' || 'reply_draft' in entryNotPolicy) throw new Error(`退换入口不能代替实际政策结论：${fact}`);
}
for (const [question,fact] of [
  ['A产品支持Android吗？','A产品未测试是否支持Android。'],
  ['A产品支持Android吗？','A产品是否支持Android尚不清楚。'],
  ['订单几天内发货？','订单将在3天内禁止发货。'],
  ['A产品几天内送达？','A产品3天内尚不能送达。']
]) {
  const unresolvedConclusion = runOne(question,fact);
  if (unresolvedConclusion.status !== 'needs_more_information' || 'reply_draft' in unresolvedConclusion) throw new Error(`未知或否定材料不能伪装成适配/时效结论：${fact}`);
}
const exclusionOnlyDelivery = runOne('A产品配送哪些地区？','A产品配送范围排除海南和云南。');
if (exclusionOnlyDelivery.status !== 'needs_more_information' || 'reply_draft' in exclusionOnlyDelivery) throw new Error('只列出排除地区不能当作完整配送范围');
const staleDatedStock = runOne('A产品现在有库存吗？','A产品截至2024年6月1日库存有货。');
if (staleDatedStock.status !== 'needs_more_information' || 'reply_draft' in staleDatedStock) throw new Error('过期的日期库存快照不能回答当前库存');
const latestApprovedLaunch = JSON.parse(execFileSync(process.execPath,[resolve(root,'scripts/draft-answers.mjs'),'-'],{input:JSON.stringify({tone:'简洁',questions:['A产品什么时候上线？'],sources:[
  {id:'plan',fact:'A产品原计划于2027年3月上线。',source:'旧计划'},
  {id:'approved',fact:'A产品最新批准的上线日期为2027年5月。',source:'最终批准版本'}
]}),encoding:'utf8'})).results[0];
if (latestApprovedLaunch.status !== 'draft' || !latestApprovedLaunch.reply_draft.includes('2027年5月') || latestApprovedLaunch.reply_draft.includes('2027年3月')) throw new Error('最新批准的上线日期应覆盖旧计划日期');
for (const [question,fact,expected] of [
  ['这篇视频的作者是谁？','这篇视频作者：李明。','李明'],
  ['这次直播在哪个平台观看？','这次直播可在哔哩哔哩平台观看。','哔哩哔哩']
]) {
  const directSupported = runOne(question,fact);
  if (directSupported.status !== 'draft' || !directSupported.reply_draft.includes(expected)) throw new Error(`作者或观看平台的明确事实应能回答：${question}`);
}
const sensitiveHeaders = JSON.parse(execFileSync(process.execPath,[resolve(root,'scripts/draft-answers.mjs'),'-'],{input:JSON.stringify({tone:'简洁',questions:['A产品怎么使用？'],sources:[{id:'usage',fact:'A产品使用方法是先开机，然后点击开始。',source:'批准使用说明\nAuthorization: Bearer authSecret123\nCookie: sessionid=cookieSecret123; theme=dark\n授权链接：https://example.com/authorize?code=oauthSecret123'}]}),encoding:'utf8'})).results[0];
const exposedSecret = /authSecret123|cookieSecret123|oauthSecret123/u.test(JSON.stringify({reply:sensitiveHeaders.reply_draft,evidence:sensitiveHeaders.evidence}));
if (sensitiveHeaders.status !== 'draft' || exposedSecret || !JSON.stringify({reply:sensitiveHeaders.reply_draft,evidence:sensitiveHeaders.evidence}).includes('[已省略]')) throw new Error('Authorization、Cookie 和授权 URL code 必须按字段脱敏');
