# Milestone 2 Final Recap: RAG-backed Profile Matching

Milestone 2 的目标不是“为了加 RAG 而加 RAG”，而是把 Milestone 1 的岗位匹配流程升级成：

```text
JD
 -> 提取岗位 signals
 -> 从候选人的 profile evidence 中检索最相关证据
 -> 用 deterministic scoring 判断匹配度
 -> 用 LLM / template 生成带 citation 的推荐
 -> 单独评估 retrieval quality
```

一句话总结：

> Milestone 2 让推荐不再只是“泛泛地说你适合”，而是能说明“为什么适合、依据来自哪段经历、检索有没有找对证据”。

## 当前完成状态

| 项目 | 状态 |
|---|---|
| RAG knowledge base | 已完成，`data\profile_knowledge.json` |
| Profile evidence | 已扩展到 28 条 public-safe chunks |
| Sample jobs | 已替换为北京 AI 产品 Top20 岗位 |
| Gold judgments | 已扩展到 20 条岗位判断 |
| RAG eval set | 已扩展到 8 个 retrieval eval cases |
| Retrieval tool | 已完成，`src\rag\retrieveProfileEvidence.ts` |
| Citation output | 已完成，`recommendation.evidenceCitations` |
| Retrieval eval | 已完成，`npm run eval:rag` |
| 当前 recall | `average recall@3 = 1.00` on current 8 eval cases |

## Milestone 1 到 Milestone 2 的演进

Milestone 1 解决的是：

```text
这个岗位是否匹配？
```

流程是：

```text
JD
 -> LLM structured extraction
 -> schema validation
 -> deterministic scoring
 -> recommendation generation
```

Milestone 2 进一步解决：

```text
这个岗位应该引用我的哪些经历来证明匹配？
```

新增流程是：

```text
profile evidence chunks
 -> retrieveProfileEvidence()
 -> top-k evidence
 -> evidenceCitations
 -> retrieval evaluation
```

## 这个项目里的 RAG 到底是什么

当前项目里的 RAG 是一个小型、可解释的 baseline：

```text
data\profile_knowledge.json
 -> local keyword retrieval
 -> top-k profile evidence
 -> recommendation citations
 -> recall@k eval
```

它还不是完整商用 RAG：

```text
没有 embedding retrieval
没有 vector database
没有 reranker
没有 ingestion pipeline
没有 multi-tenant ACL
```

但它已经覆盖了 RAG 的核心结构：

```text
知识库
检索
top-k
citation
eval
debuggability
```

## Profile evidence 现在包含什么

当前 `data\profile_knowledge.json` 有 28 条 evidence chunks，主要来自 sanitized resume、公开网站信息和项目学习材料。

覆盖：

- Monitoring Hub / unified observability platform
- 400K+ MAU platform adoption
- Job execution / scheduling / monitoring / execution identity
- Enterprise execution scalability / throttling / long-running jobs
- Migration and reliability constraints
- AI-driven monitoring: failure summarization, pattern clustering, anomaly detection
- AI-assisted feedback triage
- AI-assisted PM / design / engineering delivery workflow
- AI workflow impact: spec/design cycles from weeks to days
- Cross-workload context-aware Copilot experience
- Frontend platform / UX engineering
- Backend data infrastructure / Hadoop / job queue / logging
- Data security / GDPR / sensitive data protection
- English and global collaboration
- AI Job Search Copilot learning project
- RAG / Agent / Function Calling learning path
- Target role criteria: Beijing, AI application layer, enterprise workflow, data intelligence

## Top20 sample jobs 的意义

最初的 sample jobs 是 toy examples。现在已经替换成：

```text
beijing-ai-product-jobs-top20.xlsx -> data\sample_jobs.json
```

当前包含 20 个更真实的北京 AI 产品岗位，例如：

- 字节火山方舟大模型平台产品经理
- Apple AI Product Manager
- 百度 Agent / 千帆 / AIGC 产品岗位
- 美团 B2B AI 应用产品
- 京东 AI / AIGC 产品
- Coze / Agent 平台方向
- Lenovo AI-native device software PM
- 月之暗面 Agent 大模型产品经理

这样 Milestone 2 不再只是技术 demo，而是更贴近真实求职筛选场景。

## Recall@3 是怎么实现的

RAG eval 的核心文件：

```text
src\experiments\runRetrievalEvaluation.ts
```

它读取：

```text
data\sample_jobs.json
data\profile_knowledge.json
data\rag_eval_set.json
```

`data\rag_eval_set.json` 里人工标注：

```text
这个岗位应该检索到哪些 expectedEvidenceIds
```

系统实际运行：

```text
retrieveProfileEvidence()
 -> retrievedEvidenceIds
```

然后计算：

```text
hitCount = top-k 中命中的 expected evidence 数量
recall@k = hitCount / expectedEvidenceIds.length
```

当前：

```text
k = 3
average recall@3 = 1.00
```

注意：

> recall@3 只说明“当前 eval set 上检索命中了人工期望 evidence”，不代表最终推荐质量完美，也不代表系统在所有真实 JD 上都能 100% 命中。

## 为什么现在先用 keyword retrieval

这是一个刻意选择。

当前阶段不用 embedding，是因为：

```text
样本量小
需要先理解 RAG 原理
需要可解释 baseline
需要看清 matched terms
需要能调试 evidence / keyword / eval
```

面试可以这样说：

> 我没有一上来就做 embedding retrieval，而是先做 keyword retrieval baseline。这样可以清楚看到每条 evidence 为什么被检索出来，也方便理解 chunking、top-k、recall@k 和 citation。后续如果 profile evidence 增多，再用同一套 eval set 比较 embedding retrieval、hybrid search 和 reranking 是否真正提升质量。

## 这轮学到的核心概念

| 概念 | 你应该如何解释 |
|---|---|
| RAG | 先检索相关证据，再让 LLM 基于证据生成 |
| Chunk | 可检索的知识小块 |
| Evidence | 能支持推荐/回答的资料片段 |
| Top-k | 每次取最相关的前 k 条 evidence |
| Recall@k | 人工期望 evidence 有多少出现在 top-k 里 |
| Citation | 让最终推荐可追溯 |
| Keyword retrieval | 精确词、字段、产品名、专有名词更稳定 |
| Embedding retrieval | 语义相似、同义表达、跨语言更强 |
| Hybrid search | keyword + vector 互补 |
| Reranking | 粗召回后再精排，提升最终 top-k 质量 |

## 重要产品判断

这轮讨论里最重要的产品判断是：

> 对当前个人 demo 来说，RAG 不是产品上绝对必要的；但作为学习和可扩展架构，它非常有价值。

原因：

- 当前个人 profile evidence 不多，直接 JSON + citation 也能跑。
- 但未来如果有更多项目经历、面试故事、作品集、历史反馈，就不能每次把全部资料塞进 prompt。
- RAG 让系统可以从大量 evidence 中选择当前 JD 最相关的 top-k。
- RAG 也让 retrieval quality 可以单独评估。

更成熟的面试说法：

> 我知道当前 demo 规模下可以不用 RAG，但我仍然实现了一个小型 RAG baseline，是为了学习和验证可扩展架构。真正的产品判断不是“看到 LLM 就加 RAG”，而是根据知识规模、动态性、citation 需求、权限要求和成本延迟来决定。

## 如何解释这个项目

面试版：

> 我在 AI Job Search Copilot 的 Milestone 2 里做了 RAG-backed profile matching。Milestone 1 先完成 JD 结构化抽取、schema validation 和 deterministic scoring。Milestone 2 把候选人的简历、项目经历和目标岗位标准整理成 public-safe evidence chunks。每个 JD 进来后，系统先抽取岗位 signals，再从 profile evidence 中检索 top-k 相关证据，最后生成带 citation 的简历重点、面试 talking points 和 outreach 建议。我还单独做了 retrieval eval，用 recall@3 检查检索是否命中人工期望 evidence。

更短版：

> Milestone 2 的核心不是“让 LLM 更聪明”，而是“把正确证据放到 LLM 面前”。

## 出问题时怎么定位

如果推荐不好，不要直接换模型。按链路拆：

| 现象 | 可能问题 |
|---|---|
| 正确经历不在 knowledge base | evidence 构建问题 |
| 正确 evidence 在库里但没检索到 | retrieval / keyword / embedding 问题 |
| top-20 有但 top-3 没有 | ranking / reranking 问题 |
| top-k 有正确 evidence，但回答没用 | generation / prompt / grounding 问题 |
| 回答引用了不存在内容 | hallucination / fake citation |
| 检索到不该看的资料 | ACL / privacy 问题 |

## 为什么暂时不继续做 embedding / reranking / ingestion

这些都重要，但不是现在必须做。

当前选择是：

```text
Milestone 2 收口
 -> 进入 Milestone 3 Tool Calling / Agent Workflow
```

原因：

- 你已经理解了 RAG 的存在理由、结构、维护、评估和安全边界。
- 当前 demo 样本规模还不需要复杂 vector DB。
- 继续加 embedding/reranking 容易变成“为了技术而技术”。
- Milestone 3 的 Function Calling / Tool Calling 会让项目进入下一类面试重点。

## Milestone 2 验收标准

当前已满足：

```text
sample jobs: 20 realistic Beijing AI product roles
profile evidence: 28 public-safe chunks
RAG eval cases: 8
average recall@3: 1.00
recommendation output: evidenceCitations
learning docs: Chinese primer + interview bank + non-coder walkthrough
```

可以认为：

> Milestone 2 的主体已经完成，可以进入收口和提交 checkpoint。

## 下一步

建议：

```text
1. commit / push 当前 Milestone 2 checkpoint
2. 进入 Milestone 3: Function Calling & Agent Workflow
```

Milestone 3 会练习：

- 什么是 Function Calling / Tool Calling
- 如何把当前 typed functions 暴露成 tools
- Agent 和固定 workflow 的区别
- 人类确认 / approval gate
- tool logs / trace / debugging
- 为什么不能让 agent 随便自动投递
