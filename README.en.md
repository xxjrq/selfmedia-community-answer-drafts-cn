# Community Answer Drafts

Turn up to 20 de-identified reader questions, approved knowledge or policy sources, and a desired tone into copy-ready Chinese community-answer drafts. Each draft includes traceable evidence; product/model identity must match the question, unsupported question types request more information, and a draft schedule is not treated as an approved release date.

![Community answer drafts promo](assets/promo-1600x900.png)

## Input and output

Provide up to 20 questions, approved material whose ID, fact, and source text totals no more than 5,000 Unicode characters, and a supported tone such as patient, concise, friendly, restrained, lively, humorous, formal, or professional. Tone changes the wording of the draft. The result contains a reply draft plus source ID, supported fact, and citation for each answer—or the exact fields needed to answer safely.

This skill does not collect comments, send messages, manage users, or create auto-reply bots.

## Install and verify

```bash
npx skills add xxjrq/selfmedia-community-answer-drafts-cn
node scripts/self-test.mjs
```

See the runnable [success input](fixtures/success-input.json) and [missing-evidence input](fixtures/failure-input.json), with their [success delivery](fixtures/success-output.md) and [missing-evidence delivery](fixtures/failure-output.md).

## Source and license

The business purpose was checked against [marketingskills content strategy](https://github.com/coreyhaines31/marketingskills/blob/main/skills/content-strategy/SKILL.md). This repository's prose, examples, and code are original. Licensed under [MIT](LICENSE).
