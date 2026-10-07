# 社区问题回复草稿

把最多 20 条脱敏读者问题，连同作者批准的知识、政策或引用来源，变成逐题可复制的中文回复草稿。每题都附可复核依据；商品/型号必须与问题一致，未知问题类别会要求补资料；制定中的发布计划不当作已批准日期。

![社区问题回复草稿推广图](assets/promo-1600x900.png)

## 输入与结果

输入为：最多 20 条问题、`id`/事实/来源文字合计不超过 5000 字的已批准资料，以及想要的回答语气（如耐心简洁、友好克制、活泼幽默或正式专业）。资料应包含可引用事实与出处；回答语气会反映在草稿措辞中。

结果为：每题的可复制回复、材料 ID / 事实 / 来源；没有直接依据时，输出待补充字段。它不采集评论、不发送消息、不管理用户，也不创建自动回复机器人。

## 安装

```bash
npx skills add xxjrq/selfmedia-community-answer-drafts-cn
```

## 可运行验证

```bash
node scripts/self-test.mjs
```

该命令实际运行成功与缺料两份输入：[成功输入](fixtures/success-input.json)、[成功交付](fixtures/success-output.md)、[缺料输入](fixtures/failure-input.json)、[缺料交付](fixtures/failure-output.md)。

## 使用边界

只用作者已批准的材料回答。没有发布计划、版本验证或政策依据时，请求作者补充正式事实及来源；不基于粉丝数量、平台经验或常识编造结论。

## 来源与许可

业务定位参考了 [marketingskills 的 content-strategy 技能](https://github.com/coreyhaines31/marketingskills/blob/main/skills/content-strategy/SKILL.md)，本仓库的说明、示例与代码均为原创，未复制其原文或源码。仓库以 [MIT License](LICENSE) 发布。
