# RAG 中文入门：检索增强生成

RAG 的中文通常叫 **检索增强生成**。

英文全称是 **Retrieval-Augmented Generation**：

```text
Retrieval = 检索
Augmented = 增强
Generation = 生成
```

一句话解释：

> RAG 是先从外部资料库里检索相关资料，再让 LLM 基于这些资料生成答案。

它不是让模型完全凭记忆回答，也不是把所有资料一次性塞进 prompt。

## 没有 RAG vs 有 RAG

没有 RAG：

```text
JD + 整份 profile
 -> LLM
 -> 推荐建议
```

问题：

- prompt 可能很长、很乱。
- LLM 可能遗漏关键经历。
- LLM 可能生成听起来合理但没有依据的建议。
- 用户看不出来“这条建议来自哪段经历”。

有 RAG：

```text
JD
 -> 检索 profile 资料库里最相关的经历
 -> 把这些经历交给 LLM
 -> LLM 生成带证据的推荐建议
```

好处：

- 只给 LLM 看相关资料。
- 推荐更具体。
- 输出可以带 citation。
- 更容易调试：如果建议错了，可以检查是检索错了，还是生成错了。

## 这个项目里的 RAG 是什么

在 AI Job Search Copilot 里，RAG 的资料库是：

```text
data\profile_knowledge.json
```

它不是 LLM 凭空生成的，而是我们把候选人的 sanitized profile、项目经历、目标岗位标准整理成多个小块。

这些小块叫：

```text
chunks
evidence chunks
profile evidence
```

例如：

```text
工程 + 产品复合背景
数据 workflow / monitoring / scheduling 经验
AI Job Search Copilot 项目经历
英文沟通能力
目标岗位标准
```

每个 evidence chunk 有：

```text
id
title
category
content
keywords
citation
```

## 为什么不直接用 JSON 就完了

你的直觉是对的：如果资料很少，直接用 JSON 就够了，不一定需要 RAG。

比如只有几条信息：

```text
我有工程 + 产品经验
我会 SQL
我英语好
我做过 AI Job Search Copilot
```

那完全可以直接把 JSON 塞进 prompt：

```text
这是我的能力 JSON。
这是 JD。
请判断匹配度。
```

这可以跑，也不算错。

但 JSON 只是 **存资料的格式**。RAG 解决的是另一个问题：

> 当前这个问题 / JD 来了以后，系统应该从资料库里取哪些资料给 LLM？

可以这样区分：

| 概念 | 作用 |
|---|---|
| JSON | 存资料 |
| RAG | 决定针对当前问题检索哪些资料，并把资料交给 LLM 生成答案 |

更形象一点：

```text
JSON = 仓库
RAG = 从仓库里找货、挑货、交给模型的流程
```

所以 `data\profile_knowledge.json` 只是 RAG 的知识库原型，不是 RAG 的全部。

真正的 RAG 链路是：

```text
JD
 -> 分析 JD 需要什么能力
 -> 从 profile_knowledge.json 里找最相关的能力 / 经历
 -> 只把这些相关 evidence 给 LLM
 -> LLM 生成建议
 -> 输出 citation
```

## citation 和 eval set 不是 RAG 专属能力

如果这个工具只给个人使用，而且背景信息很少，不用 RAG 也能实现 citation 和 eval set。

例如直接维护一个结构化 JSON：

```json
{
  "profileEvidence": [
    {
      "id": "engineering-product",
      "content": "工程 + 产品复合背景",
      "citation": "profile#engineering-product"
    },
    {
      "id": "english",
      "content": "英语沟通能力强",
      "citation": "profile#language"
    }
  ]
}
```

然后每次把全部 evidence 都给 LLM：

```text
JD + all profileEvidence
 -> LLM
 -> recommendation with citations
```

这样也可以要求：

```text
每条建议必须引用 evidence id
```

所以 citation 可以不依赖 RAG。

eval set 也不依赖 RAG。

例如：

```json
{
  "jobTitle": "AI Product Manager",
  "expectedLevel": "strong_match",
  "expectedEvidenceIds": [
    "engineering-product",
    "ai-project"
  ]
}
```

然后比较：

```text
模型输出是否用了 expectedEvidenceIds
评分是否符合 expectedLevel
```

这就是 eval set。

所以要记住：

| 能力 | 不用 RAG 能不能做 |
|---|---|
| citation | 能 |
| eval set | 能 |
| evidence id | 能 |
| structured profile | 能 |
| top-k retrieval | 这是 RAG 的核心 |
| 大规模知识筛选 | RAG 更有价值 |

当前项目只有几条 profile evidence，从产品必要性来说：

> 不用 RAG 也能实现。

但从学习和面试价值来说：

> 做一个小型 RAG baseline 很有价值。

因为它练习了：

```text
chunking
retrieval
top-k
recall@k
citation
retrieval eval
RAG failure modes
安全边界
```

面试里可以这样说：

> 在当前个人 demo 规模下，RAG 不是产品上绝对必要的。因为 profile evidence 很少，直接把所有结构化 evidence 放进 prompt，也可以实现 citation 和 eval set。但我仍然实现了一个小型 RAG baseline，是为了把系统设计成可扩展架构：当 profile/project/interview notes 增多时，可以从全量 evidence prompt 迁移到 retrieval-based top-k evidence selection。同时这个 baseline 也让我能单独评估 retrieval quality，比如 recall@3。

## 真实产品：10w 用户时应该每人一个 RAG 还是 JSON

如果不考虑 demo，只考虑真实产品，10w 用户场景下不应该简单地说：

```text
每个人都做一个完整 RAG
```

也不应该只用一个大 JSON。

更合理的架构是：

```text
结构化 Profile DB + 可选的 per-user evidence index / RAG
```

也就是：

```text
每个用户 = structured profile + private document/evidence index
```

不同信息适合不同存法：

| 信息类型 | 推荐存法 |
|---|---|
| 姓名、城市、目标岗位、薪资、年限、技能标签 | 结构化 DB / JSON |
| 简历摘要、项目经历、面试故事、作品集说明 | document chunks / RAG |
| 用户上传的 PDF、长简历、Notion、博客 | RAG / document index |
| 明确可枚举字段，比如 skill、location、salary | 不需要 RAG |
| 长文本、经历描述、语义匹配 | 更适合 RAG |

关键判断：

> 不要因为有 10w 用户就用 RAG。RAG 的必要性取决于单个用户资料是否长、是否非结构化、是否需要语义检索和 citation，而不是用户总数。

### 为什么不能只用 JSON

如果每个用户的信息都很短，JSON 可以。

但真实产品里，用户可能会上传：

```text
多版本简历
项目经历
求职目标
面试复盘
作品集
LinkedIn / GitHub / 博客
过往 JD
投递反馈
```

当你要回答：

```text
这个 JD 里提到 enterprise AI workflow，用户哪段经历最适合拿出来讲？
```

这就不是简单字段匹配，而是语义检索问题。

### 为什么不能每次把用户全部资料塞给 LLM

问题不只是 10w 用户，而是单个用户上下文会增长。

每次分析 JD 都塞：

```text
用户全部资料 + JD
```

会有问题：

```text
成本高
速度慢
噪声多
上下文窗口有限
难以引用具体来源
```

### 但也没必要一开始就做复杂 RAG

真实产品可以分阶段：

#### 阶段 1：结构化 profile JSON / DB

适合 MVP：

```text
user_profile table
skills table
projects table
career_goals table
```

每次直接取用户 profile + JD 给 LLM。

适合：

```text
资料少
用户少
功能早期
成本不敏感
```

#### 阶段 2：结构化 DB + evidence chunks

把项目经历、简历段落拆成 evidence：

```text
user_evidence_chunks
- user_id
- evidence_id
- content
- source
- tags
```

先不用 embedding，也可以关键词 / 标签检索。

#### 阶段 3：per-user vector index / multi-tenant vector DB

当用户资料变多，或者需要语义匹配时，再加 embedding：

```text
embedding(user evidence chunk)
```

检索时必须限制用户：

```sql
WHERE user_id = current_user
ORDER BY vector_similarity(query, chunk_embedding)
LIMIT k
```

这才是真实产品里的 RAG。

### 10w 用户场景最关键的问题

用户数量大主要带来：

```text
multi-tenancy
permission isolation
cost
latency
index update
data deletion
privacy
```

尤其是：

```text
每次检索必须限制 user_id
```

绝对不能出现：

```text
用户 A 的 JD 检索到了用户 B 的经历
```

这是严重数据泄露。

推荐真实架构：

```text
Postgres
  users
  user_profiles
  user_skills
  user_projects
  user_evidence_chunks
  job_analyses

Vector index
  chunk_id
  user_id
  embedding
  metadata

Retrieval
  query = JD signals
  filter = user_id
  top_k = 3-5
```

真实流程：

```text
JD
 -> extract job signals
 -> read structured profile constraints
 -> retrieve user's evidence chunks with user_id filter
 -> score job deterministically
 -> generate recommendation with citations
```

面试 / 产品回答模板：

> 对 10w 用户的 job matching 产品，我不会把“是否使用 RAG”简单绑定到用户规模。用户数量大主要带来 multi-tenancy、权限隔离、成本和延迟问题。是否需要 RAG，取决于单个用户资料是否包含大量非结构化内容，比如长简历、项目经历、作品集、面试故事等。结构化字段如地点、薪资、技能标签应该放在 DB/JSON 里；长文本经历和项目证据适合切成 evidence chunks，并在需要时做 per-user retrieval。理想架构是 structured profile DB + private per-user evidence index，检索时必须用 user_id 做隔离。

## 为什么不能永远把整个 JSON 都塞给 LLM

小数据可以，大数据会不稳。

真实求职资料会越来越多：

```text
简历 1-2 页
项目经历 10 个
每个项目的技术细节
面试复盘
作品集介绍
不同岗位版本的简历
目标岗位标准
公司偏好
投递历史
面试反馈
```

如果全部塞给 LLM，会出现几个问题：

1. **太长**：prompt 变大，成本高，速度慢。
2. **太吵**：模型看了太多无关信息，反而抓不住重点。
3. **不可解释**：你不知道它为什么推荐这条经历。
4. **不好评估**：生成错了，不知道是资料错、检索错，还是模型写错。
5. **上下文限制**：资料继续变多后，模型窗口放不下。

RAG 的目标是：

> 当前这个 JD 只需要资料库里最相关的 3-5 条证据，而不是全部资料。

## 例子：为什么 RAG 比直接 JSON 更像真实产品

假设 JD 是：

```text
Data Agent Product Manager
要求：AI Agent、BI、SQL、数据分析、北京
```

你的资料库里可能有：

```text
工程 + 产品经验
英语沟通
SQL
monitoring
scheduling
AI Job Search Copilot
RAG
Agent
海外协作
```

直接全塞给 LLM，它可能只会泛泛地说：

```text
你有工程产品背景，适合这个岗位。
```

RAG 更好的流程是先检索出：

```text
1. AI Job Search Copilot 项目经历
2. 数据 workflow / SQL / monitoring 经历
3. 北京 AI Agent / data intelligence 目标岗位标准
```

然后生成：

```text
这个岗位应该重点突出你的 AI Job Search Copilot 项目，因为里面涉及 Agent workflow、RAG、结构化抽取；
同时突出你在数据 workflow、SQL、monitoring 方面的经验。
```

这个回答更具体，而且能追溯来源。

## 公司内部 Q&A chat 场景怎么理解 RAG

如果做一个公司内部 Q&A chat 工具，背后通常不只是一个 LLM。

它会有：

```text
LLM
+ 公司内部文档知识库
+ RAG retriever
+ 权限控制
+ citation / audit log
```

整体流程：

```text
公司内部文档
 -> chunking
 -> indexing / embedding
 -> RAG knowledge base

员工提问
 -> query understanding / signal extraction
 -> retrieval
 -> 取 top-k evidence chunks
 -> 可选 reranking
 -> 把 top-k chunks + 问题交给 LLM
 -> LLM 生成回答
 -> 返回 answer + citations
```

可以这样分工：

```text
LLM = 负责理解和表达
RAG = 负责查资料和提供证据
```

例如员工问：

```text
今年年假政策是什么？
```

系统不会直接让 LLM 凭记忆回答，而是：

```text
1. 理解问题：年假政策 / HR policy / 当前年份
2. 去内部文档库检索相关 chunks
3. 找到 top-k：
   - HR handbook section 3.2
   - 2026 leave policy update
   - FAQ: annual leave carryover
4. 把这些 chunks 给 LLM
5. LLM 基于证据生成回答
6. 返回 citation
```

这里要注意：

> RAG 返回的是证据片段，不是最终答案。最终答案是 LLM 基于这些 top-k evidence 生成的。

还要注意：

> `hitCount` 通常是离线评估指标，不是线上回答时天然存在的值。

线上员工提问时，通常没有 gold set，所以系统不知道“正确应该命中哪些 chunks”。  
只有在离线评估中，我们提前定义了：

```text
expectedEvidenceIds
```

才可以计算：

```text
hitCount
recall@k
```

公司 Q&A 的面试版表述：

> 在公司 Q&A chat 场景里，LLM 本身不直接知道内部文档。系统会先把公司文档切成 evidence chunks 并建立索引。员工提问后，系统抽取 query intent/signals，用这些 signals 去检索文档库，取 top-k 相关 chunks，必要时 rerank，然后把这些 evidence 和原问题一起交给 LLM。LLM 基于 evidence 生成回答，并返回 citation。hitCount 更多用于离线评估，比如我们有 gold expected chunks 时，用它计算 recall@k；线上回答时通常不会天然知道 hitCount。

## Data Agent 是不是一个巨大的 RAG

不是。

更准确地说：

> Data Agent 不是一个巨大的 RAG，而是一个会使用 RAG 的数据任务 agent。

可以理解成：

```text
Data Agent
 = LLM / agent orchestration
 + structured data tools
 + SQL / BI / API / metadata tools
 + RAG over unstructured docs
 + permissions / lineage / validation
```

RAG 是 Data Agent 的一部分，不是全部。

企业数据源通常分成多种类型：

| 数据类型 | 更合适的处理方式 |
|---|---|
| 表格、指标、订单、用户行为 | SQL / BI query |
| 实时库存、业务系统状态 | API / tool call |
| 数据表含义、字段解释、业务口径 | RAG / metadata retrieval |
| 报表说明、会议纪要、文档 | RAG |
| 权限、血缘、数据质量 | catalog / lineage / governance tools |

如果用户问：

```text
上周北京地区销售额是多少？
```

这不应该主要用 RAG 回答，而应该：

```text
生成 SQL
 -> 查数据库
 -> 返回结果
```

但如果用户问：

```text
GMV 的公司口径是什么？
```

这适合 RAG / metadata retrieval，因为答案可能在指标文档、数据字典或 wiki 里。

一个典型 Data Agent flow：

```text
用户问：为什么这个月新用户转化率下降？

1. 理解问题：指标 = 新用户转化率，时间 = 本月，对比 = 上月
2. RAG 查指标定义：新用户、转化率口径是什么
3. 查 metadata：相关表和字段在哪里
4. 生成 SQL：拉取本月 / 上月转化数据
5. 调用 BI / database tool 执行 SQL
6. 分析分渠道 / 地区 / 版本变化
7. RAG 查实验 / 发布文档：是否有版本变更或活动影响
8. 生成解释和建议
```

面试里可以这样说：

> Data Agent 不是简单的巨大 RAG。RAG 主要处理非结构化文档和业务语义，比如指标口径、字段含义、报表说明、历史分析记录。但结构化数据本身更适合通过 SQL、BI API 或数据工具查询。一个成熟 Data Agent 的关键是能根据问题选择正确工具：该查文档时用 RAG，该查数据时用 SQL/API，并且处理权限、数据血缘、质量校验和结果解释。

## 当前版本为什么还是用 JSON

当前版本用 JSON 是为了学习和可调试。

它不是说“JSON = RAG”，而是：

> 用 JSON 先模拟一个小型知识库，用 keyword retrieval 模拟检索器，用 citation 模拟可追溯生成，用 recall@3 模拟检索评估。

后面真实 RAG 可以换成：

```text
Markdown docs
PDF resume
Notion pages
SQLite
Postgres
向量数据库
Pinecone / Chroma / FAISS
```

存储形式会变，但 RAG 的核心不变：

```text
检索相关知识
 -> 交给 LLM
 -> 基于证据生成
```

## RAG 是即插即用的数据包吗

不是。

RAG 不是一个可以单独拎出来的神秘数据包，也不是模型或 agent 天生 builtin 的一次性内容。

更准确地说，RAG 是一套架构：

```text
外部资料库
 -> chunking
 -> index / vector DB
 -> retriever
 -> top-k retrieval
 -> prompt context
 -> LLM generation
```

所以 RAG 包含：

```text
数据存储
检索逻辑
权限控制
prompt 注入
引用 / citation
评估
```

其中有两层：

| 部分 | 是否持久 |
|---|---|
| 知识库 / index / vector DB | 持久 |
| 每次检索出来的 top-k chunks | 一次性进入当前请求上下文 |

也就是说，你可以长期维护一个 RAG 知识库，但每次模型只会拿到当前问题检索出来的少量资料。

## 一个 RAG 能不能给多个模型或 agent 用

可以，但前提是你把它做成独立服务或工具。

比如：

```text
Agent A
Agent B
Agent C
   ↓
同一个 RAG Retriever API
   ↓
公司文档库 / 向量数据库
```

这时多个 agent 可以复用同一个 RAG。

但要注意：

> 模型本身并不会“拥有”这个 RAG。模型只是每次通过工具调用拿到一小部分检索结果。

所以 RAG 可以跨 agent 复用，但不是自动对所有 agent 可见。是否可见取决于工具权限和系统配置。

## RAG 里有机密资料会不会泄露

会有风险，而且风险很真实。

如果 RAG 里放了公司机密文档，只要某个 agent 有权限调用它，检索结果就可能进入：

```text
LLM prompt
agent 日志
tool call trace
输出结果
第三方模型 API
debug 文件
缓存
```

如果你使用外部模型 API，比如 OpenAI、Gemini、Groq、Claude，被检索出来的机密片段可能会被发送给模型供应商。

除非使用的是公司批准的 enterprise / no-training / private deployment 环境，否则不要把公司机密随便接入外部模型。

## 调用其他 agent 时的泄露风险

如果你给其他 agent 访问 RAG 的权限，它理论上就能检索你的资料。

风险包括：

```text
用户 prompt 诱导 agent 查询机密
agent 错误地把 retrieved chunks 输出给用户
agent 把资料传给 web/search/第三方 API
日志记录了机密内容
另一个 agent 权限过大，绕过业务边界
```

所以不能简单地说：

```text
我的 RAG 给所有 agent 用
```

更安全的做法是：

```text
不同 agent -> 不同权限
不同用户 -> 不同文档 ACL
不同任务 -> 只返回必要 chunks
```

## 安全 RAG 的基本原则

如果 RAG 里有机密资料，至少要考虑：

| 保护 | 意义 |
|---|---|
| 最小权限 | 不是所有 agent 都能查全部文档 |
| 文档级 ACL | 用户只能检索自己有权限看的文档 |
| top-k 限制 | 只返回少量必要片段 |
| citation + audit log | 记录谁查了什么 |
| 不把 secret 放进 RAG | API key、密码、token 不应该进入知识库 |
| 企业模型 / 本地模型 | 避免机密发到不合规第三方 |
| agent tool allowlist | 有机密权限的 agent 不应同时拥有无限外部网络权限 |

尤其要记住：

> 有机密 RAG 权限的 agent，不应该同时拥有无限制 web、shell、文件、外部 API 权限。

## 在这个项目里的安全边界

当前项目的：

```text
data\profile_knowledge.json
```

只是本地教学版 RAG 知识库。

如果运行：

```bash
npm run demo:llm:mock
```

不会调用真实外部模型。

但如果运行：

```bash
npm run demo:llm:groq
npm run demo:llm:gemini
```

那么被检索出来的 profile evidence 会进入模型请求。

所以真实简历、公司机密、隐私信息，不应该随便放进这个 demo 的 RAG 知识库。

## RAG 内容应该手动维护还是 AI 自动维护

正确做法通常不是全手动，也不是 AI 全自动，而是：

```text
AI 辅助整理
 -> 人类审核
 -> 正式入库
 -> 定期评估和清理
```

也就是：

```text
AI assists, human approves.
```

RAG 知识库应该被当成一个 **knowledge ingestion pipeline（知识入库流水线）**，而不是随手往 JSON 里加几条内容。

### 为什么不能全手动

全手动的问题：

```text
慢
格式不统一
chunk 粒度不稳定
metadata / keywords 容易漏
资料多了维护不动
```

当前项目只有几条 profile evidence，手动维护可以。

但如果以后有：

```text
10 个项目经历
20 份 JD 分析
30 次面试复盘
多个简历版本
博客文章
作品集说明
```

纯手动维护就会很痛苦。

### 为什么不能 AI 全自动

AI 全自动的问题更严重：

```text
可能总结错
可能编造不存在的经历
可能把敏感信息放进 RAG
可能 chunk 切得不适合检索
可能 metadata 打错
可能把临时内容当长期知识
```

尤其是求职场景，RAG 里如果出现：

```text
夸大的经历
不真实技能
公司敏感信息
私人联系方式
薪资细节
```

后续生成简历、面试话术、HR outreach 时会很危险。

所以不能让 AI 自动把内容直接写进正式知识库。

## 真正开发 Agent / RAG 的团队怎么做

通常会设计一条 ingestion pipeline：

```text
1. Source collection
2. Document parsing
3. Chunking
4. Metadata extraction
5. Embedding / indexing
6. Human review / policy filter
7. Retrieval evaluation
8. Continuous refresh
```

中文解释：

| 步骤 | 做什么 |
|---|---|
| Source collection | 收集原始资料 |
| Parsing | 解析 PDF、Markdown、网页、数据库记录 |
| Chunking | 切成适合检索的小块 |
| Metadata extraction | 提取标题、标签、来源、权限、时间 |
| Indexing | 存进 JSON / DB / vector DB |
| Review | 人类审核敏感性、真实性、质量 |
| Evaluation | 用测试问题看能不能检索到正确内容 |
| Refresh | 定期更新、删除过期内容 |

## 对这个项目的推荐维护方式

后续可以把目录演进成：

```text
data\
  raw_profile_notes\
    project-ai-job-search.md
    product-platform-experience.md
    english-collaboration.md
    interview-stories.md

  generated\
    profile_knowledge.candidates.json

  profile_knowledge.json
  rag_eval_set.json
```

推荐流程：

```text
raw notes
 -> ingest script
 -> candidates
 -> human approval
 -> profile_knowledge
 -> eval
```

未来可以加一个命令：

```bash
npm run ingest:profile
```

它负责：

```text
读取 raw notes
 -> 切 chunk
 -> 生成候选 evidence JSON
 -> 输出到待审核文件
```

例如：

```text
data\generated\profile_knowledge.candidates.json
```

你人工确认真实性、隐私和质量后，再合并到：

```text
data\profile_knowledge.json
```

## AI 在 RAG 维护里适合做什么

AI 适合辅助：

```text
从长文档提取候选 chunks
生成 title
生成 keywords
生成 summary
发现可能重复的 chunk
建议 citation
建议 category
```

但 AI 不应该最终决定：

```text
这段经历是否真实
这段是否可以公开
这段是否含敏感信息
这段是否适合求职使用
是否合并进正式知识库
```

这些应该由人类确认。

面试里可以这样说：

> RAG 知识库不应该纯手动维护，也不应该完全让 AI 自动维护。我会把它设计成 ingestion pipeline：原始资料先进入 raw notes，AI 可以辅助做 chunking、metadata extraction、keyword generation，然后输出候选 evidence。候选 evidence 必须经过 human review，确认真实性、隐私和质量后才进入正式知识库。之后用 retrieval eval 检查这些 chunks 是否能被正确检索。

## 当前 RAG 的工作流

当前项目流程是：

```text
sample job
 -> extractJobSignalsWithLlm()
 -> scoreJob()
 -> retrieveProfileEvidence()
 -> generateRecommendationsWithLlm()
 -> exportResults()
```

更具体一点：

```text
JD + extracted job signals
 -> 提取关键词
 -> 去 data\profile_knowledge.json 里匹配相关 evidence chunks
 -> 给 evidence chunks 打分
 -> 取 top 3
 -> 把 top 3 evidence 交给推荐生成步骤
 -> 输出 evidenceCitations
```

代码对应关系：

| 概念 | 文件 / 字段 |
|---|---|
| 知识库 | `data\profile_knowledge.json` |
| 检索器 | `src\rag\retrieveProfileEvidence.ts` |
| 检索结果 | `retrievedEvidence` |
| 引用证据 | `recommendation.evidenceCitations` |
| 检索评估 | `data\rag_eval_set.json` |
| 评估命令 | `npm run eval:rag` |

## 现在为什么没有 embedding

当前版本用的是 **keyword-based retrieval**，也就是关键词检索。

它还不是 embedding-based semantic retrieval。

这是有意为之：

1. 关键词检索容易理解。
2. 每个匹配词都能看见。
3. 方便先建立 baseline。
4. 后面可以再加 embedding retrieval，并比较两种检索方式。

面试里可以这样解释：

> 我先实现 keyword retrieval baseline，因为它可解释、可本地运行，也方便调试 chunk 和 query。下一步可以把 retriever 换成 embedding retrieval，再用同一套 eval set 比较 recall@k 是否提升。

## 从 Milestone 1 到 Milestone 2 是怎么一步一步来的

### Milestone 1：先解决“岗位怎么判断”

Milestone 1 的流程：

```text
JD
 -> LLM structured extraction
 -> schema validation
 -> deterministic scoring
 -> LLM recommendation generation
```

这一步学的是：

- LLM structured output
- schema validation
- deterministic scoring
- prompt experiment
- gold judgment

关键思想：

> 不要直接问 LLM “这个岗位好不好”。先让 LLM 抽取结构化岗位信号，再用代码评分。

Milestone 1 解决的是：

```text
这个岗位是不是北京？
是不是 AI 产品？
薪资是否匹配？
技能是否匹配？
风险高不高？
```

但 Milestone 1 的推荐还比较泛，因为它只知道一份笼统 profile。

### Milestone 2：再解决“用哪段经历证明匹配”

Milestone 2 增加了：

```text
profile knowledge base
retrieval
citations
retrieval eval
```

也就是：

```text
候选人经历
 -> 拆成 evidence chunks
 -> JD 来了以后检索相关 chunks
 -> 生成推荐时引用这些 chunks
```

Milestone 2 解决的是：

```text
这个岗位应该突出哪段经历？
这条推荐建议有什么证据？
模型是不是在瞎编？
检索是否命中了人工期望的证据？
```

## RAG 面试要掌握什么

### 1. RAG 是什么

> RAG 是检索增强生成。系统先从外部知识库检索相关资料，再让 LLM 基于检索结果生成答案。

### 2. 为什么需要 RAG

> 因为 LLM 自己的回答可能缺少上下文、可能幻觉，也不能天然引用我的私有资料。RAG 可以把外部知识接入生成过程，并让答案可追溯。

### 3. chunking 是什么

> Chunking 是把长文档拆成较小的可检索片段。chunk 太大噪声多，chunk 太小上下文不完整。

### 4. embedding 是什么

> Embedding 是把文本转成向量，用向量相似度做语义检索。它能解决关键词不同但语义相近的问题。

Embedding 中文通常叫 **向量嵌入** 或 **文本向量化**。

它的作用是：

> 把一段文字转换成一组数字，让计算机可以比较两段文字的语义相似度。

例如人能看懂：

```text
AI Agent 产品经理
```

和：

```text
负责智能体工作流产品设计
```

意思很接近。

但关键词不完全一样：

```text
AI Agent
智能体
workflow
工作流
```

如果只用关键词匹配，可能匹配不到。

Embedding 会把它们变成类似这样的数字向量：

```text
AI Agent 产品经理
 -> [0.12, -0.08, 0.44, 0.91, ...]

负责智能体工作流产品设计
 -> [0.10, -0.05, 0.47, 0.88, ...]
```

然后系统计算两个向量的距离：

```text
距离近 = 语义相似
距离远 = 不相关
```

在 RAG 里，embedding 通常有两步：

入库时：

```text
文档 chunk
 -> embedding model
 -> vector
 -> 存到 vector database
```

查询时：

```text
用户问题 / JD signals
 -> embedding model
 -> query vector
 -> 去 vector DB 找最相似的 chunks
```

例如 JD 说：

```text
需要负责 data workflow orchestration
```

系统可能检索到你的经历：

```text
数据平台监控和调度系统
```

即使它们关键词不完全一样。

Keyword retrieval 和 embedding retrieval 的区别：

| 方法 | 怎么匹配 | 优点 | 缺点 |
|---|---|---|---|
| Keyword retrieval | 看关键词是否出现 | 简单、可解释、本地可跑 | 同义词、不同表达容易漏 |
| Embedding retrieval | 看语义向量是否相近 | 能处理同义词、语义相似 | 成本更高，结果没关键词那么直观 |

当前项目现在是：

```text
keyword retrieval
```

还没有 embedding。

后续如果升级，会变成：

```text
profile evidence chunks
 -> embedding
 -> vector index

JD / query
 -> embedding
 -> top-k similar chunks
```

面试可以这样说：

> Embedding 是把文本转换成向量，让系统可以用向量相似度做语义检索。在 RAG 里，文档 chunks 和用户 query 都会先被 embedding model 转成向量，然后在 vector database 里找最相似的 chunks。相比 keyword retrieval，embedding 能处理同义词和表达差异，但成本更高，也需要评估和权限控制。我的项目目前先用 keyword retrieval 做可解释 baseline，后续可以升级为 embedding retrieval，并用同一套 recall@k eval 比较效果。

#### Embedding model 需要关注吗

需要关注，但通常不是第一天就要深度调。

Embedding model 不是完全固定方案，也不是随便选一个就永远不用管。不同 embedding model 会影响 retrieval quality。

早期可以先用成熟默认方案，例如：

```text
OpenAI text-embedding-3-small / large
BGE 系列
E5 系列
Cohere Embed
Voyage embeddings
```

然后用 eval set 验证效果，而不是凭感觉选。

不同场景会影响 embedding model 的选择：

| 场景 | 关注点 |
|---|---|
| 英文文档 | 英文语义效果 |
| 中文文档 | 中文语义效果 |
| 中英混合 | multilingual embedding |
| 代码检索 | code-aware embedding |
| 法律 / 医疗 / 金融 | domain-specific embedding |
| 超低成本产品 | 小模型、低维向量 |
| 高精度企业搜索 | 大模型、reranking、hybrid search |
| 私有 / 机密数据 | 本地 embedding model 或企业合规模型 |

对当前项目来说，因为内容包括：

```text
中文 + 英文 + JD + 简历 + 项目经历
```

所以如果后续加 embedding，需要关注：

```text
multilingual ability
career / job matching quality
cost
latency
privacy
```

Embedding model 影响的是：

```text
query 和 chunk 的语义相似度判断
```

例如用户问：

```text
智能体工作流产品
```

好的 embedding model 可能能匹配：

```text
AI Agent workflow product
```

如果模型不适合中英混合，可能匹配不好。

大多数早期产品不需要 fine-tune embedding model。

更实际的顺序是：

```text
选成熟 embedding model
 -> 建 eval set
 -> 测 recall@k / precision@k
 -> 调 chunking / metadata / hybrid search
 -> 必要时换 embedding model
 -> 最后才考虑 fine-tune
```

只有在这些情况下才考虑 fine-tune / domain adaptation：

```text
行业术语非常特殊
通用 embedding 表现明显不够
有大量高质量标注 pair
业务价值足够大
```

面试可以这样说：

> Embedding model 需要关注，因为它直接影响 retrieval quality，但我不会一开始就过度优化。真实项目里我会先选择成熟的 multilingual embedding model，然后用 retrieval eval set 比较 recall@k、precision@k 和 latency/cost。如果是中英混合 JD 和简历场景，我会关注模型的 multilingual 表现；如果是企业内部知识库，还要考虑隐私和是否能用本地或企业合规模型。通常先调 chunking、metadata、hybrid search 和 reranking，再考虑 fine-tune embedding。

### 5. top-k 是什么

> top-k 是每次取最相关的前 k 个 chunks。比如本项目用 recall@3 看期望证据是否出现在前三个检索结果里。

在当前项目里：

```text
k = 3
```

意思是：

> 每个 JD 最多取排名最高的前 3 条 profile evidence。

更准确地说：

> top-k 选的是你的 RAG 知识库里最相关的前 k 个个人 evidence chunks，不是选 JD 的前 k 个 chunks。

你的 RAG 里放的是关于“你”的证据：

```text
工程 + 产品复合背景
数据 workflow / monitoring / scheduling 经验
AI Job Search Copilot 项目经历
英文沟通能力
目标岗位标准
```

所以当一个 JD 来了，系统是在问：

```text
针对这个 JD，我的哪些经历 / 技能 / 项目证据最相关？
```

然后从你的全部 profile evidence 里选出 top-k。

这个 k 不是模型自动生成的，而是我们人为设置的参数。

为什么现在选 3：

1. 样例知识库还小。
2. 每个岗位通常只需要 2-3 条核心证据。
3. k 太大会把不相关内容塞给 LLM。
4. k 太小可能漏掉重要经历。

所以现在先用：

```text
top-k = top 3 retrieved evidence chunks
```

### 5.1 hitCount 是什么

`hitCount` 的意思是：

> 检索结果命中了几个人工期望的 evidence。

例如 gold set 里写：

```json
"expectedEvidenceIds": [
  "profile-ai-application-learning",
  "profile-enterprise-ai-target",
  "profile-engineering-product-hybrid"
]
```

意思是：我们人工认为这个岗位最应该检索到这 3 条证据。

如果实际检索结果是：

```json
"retrievedEvidenceIds": [
  "profile-engineering-product-hybrid",
  "profile-enterprise-ai-target",
  "profile-ai-application-learning"
]
```

那 3 条都命中了：

```text
hitCount = 3
recall@3 = 3 / 3 = 1.00
```

如果实际检索结果是：

```json
"retrievedEvidenceIds": [
  "profile-data-workflow-systems",
  "profile-engineering-product-hybrid",
  "profile-enterprise-ai-target"
]
```

只命中了 2 条：

```text
hitCount = 2
recall@3 = 2 / 3 = 0.67
```

### 5.2 recall@3 是什么

公式是：

```text
recall@3 = hitCount / expectedEvidenceIds.length
```

也就是：

> 前 3 条检索结果里，命中了多少人工期望证据？

所以在 `rag-retrieval-evaluation.json` 里看到：

```json
"k": 3
```

意思是：

> 当前评估只看 top 3 检索结果。

如果你以后改成：

```bash
npm run eval:rag -- --k 5
```

那就会变成：

```text
recall@5
```

也就是看前 5 条里命中了多少期望 evidence。

在这个项目里，recall 的实现文件是：

```text
src\experiments\runRetrievalEvaluation.ts
```

它读取：

```text
data\sample_jobs.json
data\rag_eval_set.json
```

其中 `rag_eval_set.json` 里人工写了 expected evidence：

```json
{
  "jobTitle": "AI产品经理 - Coze",
  "company": "字节跳动 / Coze",
  "expectedEvidenceIds": [
    "profile-agent-function-calling-learning",
    "profile-enterprise-ai-target",
    "profile-ai-application-learning"
  ]
}
```

意思是：

> 对这个 Coze 岗位，我认为最应该检索到这 3 条 evidence。

然后系统实际检索：

```text
retrieveProfileEvidence()
 -> retrievedEvidenceIds
```

如果实际 top-3 是：

```json
[
  "profile-agent-function-calling-learning",
  "profile-ai-application-learning",
  "profile-enterprise-ai-target"
]
```

那三条都在 expected 里：

```text
hitCount = 3
recall@3 = 3 / 3 = 1.00
```

代码逻辑可以理解成：

```text
matchedExpectedIds = expectedEvidenceIds.filter(id =>
  retrievedEvidenceIds.includes(id)
)

hitCount = matchedExpectedIds.length

recallAtK = hitCount / expectedEvidenceIds.length
```

注意：

> recall@k 只评价检索有没有找到该找的 evidence，不评价最终回答写得好不好。

它不评价：

```text
LLM 最终回答是否自然
有没有幻觉
有没有正确引用 citation
有没有真正解决用户问题
```

所以 RAG 里要分开看：

```text
retrieval quality -> recall@k
generation quality -> groundedness / citation correctness / answer usefulness
```

当前项目里看到：

```text
average recall@3 = 1.00
```

意思是：

> 当前 8 个代表性 eval cases 中，人工期望的 evidence 都出现在系统检索的 top 3 结果里。

但这不代表系统完美，只代表：

> 在当前这 8 个 eval cases 上，keyword retrieval baseline 通过了人工定义的期望。

如果以后加入更多真实 JD，recall 可能下降，需要继续调：

```text
evidence chunks
keywords
retrieval scoring
top-k
embedding retrieval
reranking
```

面试可以这样说：

> 我用 recall@k 来单独评估 RAG 的 retrieval quality。具体做法是为每个样例 JD 人工标注 expected evidence IDs，然后运行 retriever 得到 top-k retrieved evidence。hitCount 是 top-k 中命中的 expected evidence 数量，recall@k = hitCount / expectedEvidenceIds.length。这样可以先判断检索有没有找到正确证据，再单独评估 LLM 是否正确使用这些证据生成回答。

### 5.3 reranking 是什么

Reranking 中文可以叫 **重排序**。

典型 RAG 常见两步：

```text
第一步：retrieval / recall
从知识库里快速粗召回一批候选，比如 top 20

第二步：reranking
用更精细的方法重新排序，从 top 20 里挑出最好的 top 3
```

为什么需要 reranking？

因为第一步检索通常追求快，可能不够准。

比如第一步返回：

```text
1. A 相关
2. B 一般
3. C 很相关
4. D 不相关
5. E 很相关
```

reranker 会重新判断：

```text
1. C 很相关
2. E 很相关
3. A 相关
4. B 一般
5. D 不相关
```

最后只把：

```text
C, E, A
```

交给 LLM。

当前项目还没有真正的 reranking。

现在是：

```text
JD
 -> keyword retrieval
 -> 按分数排序
 -> 取 top 3
```

后续如果加 reranking，会变成：

```text
JD
 -> keyword / embedding retrieval 先取 top 10
 -> reranker 重新排序
 -> 取 top 3
 -> 交给 LLM
```

面试可以这样说：

> Top-k 是 RAG 里控制上下文数量的参数。我的项目里 k=3，意思是每个 JD 只取排名前三的 profile evidence。评估时用 recall@3，看这前三条里命中了多少人工期望 evidence。hitCount 就是命中的数量。当前项目还没有单独 reranker，只是用 keyword score 排序；后续可以先召回 top 10，再用 reranker 对候选 evidence 重新排序，提升最终 top 3 的质量。

### 5.4 一个 JD 来了以后到底发生什么

注意一个常见误解：

> 不是 LLM 先把 JD 拆成很多 chunks，再和你的 RAG 比对。

更准确是：

```text
你的经历 / 技能 / 项目
 -> 事先拆成 RAG evidence chunks

JD 来了
 -> 抽取 JD signals
 -> 用这些 signals 去检索你的 evidence chunks
 -> 选出 top-k 个最相关的 evidence
 -> 基于这些 evidence 输出分析
```

例如 JD 是：

```text
Data Agent Product Manager
要求：AI Agent、BI、SQL、数据分析、北京
```

系统先抽取 JD signals：

```text
AI signals: Agent
Skill requirements: SQL, data analysis
Product signals: product manager, BI
Location: Beijing
```

然后用这些 signals 去你的 RAG 里找：

```text
哪些个人经历最能支持这个 JD？
```

可能检索到：

```text
1. profile-data-workflow-systems
2. profile-ai-application-learning
3. profile-enterprise-ai-target
```

最终分析基于：

```text
JD signals
+ deterministic score
+ top-k retrieved personal evidence
```

所以输出会类似：

```text
这个岗位和你匹配，因为：
1. JD 要 Data Agent / BI / SQL，你有 data workflow / SQL 相关经验。
2. JD 要 AI Agent，你的 AI Job Search Copilot 项目涉及 Agent / RAG / LLM。
3. JD 在北京 AI 应用层方向，符合你的目标岗位标准。
```

面试里更准确的说法：

> 系统先把我的经历、技能、项目拆成 RAG evidence chunks。JD 来了以后，LLM 或规则先抽取 JD 的结构化 signals，然后用这些 signals 去检索我的 RAG evidence chunks，选出 top-k 个最相关的证据，再基于这些证据生成匹配分析。

### 6. citation 为什么重要

> Citation 让用户知道答案依据来自哪里，可以减少幻觉，也方便人工审核。

### 7. 如何评估 RAG

> 要把 retrieval 和 generation 分开评估。先看检索有没有找对证据，再看 LLM 有没有正确使用证据生成答案。

本项目的评估：

```text
data\rag_eval_set.json
 -> expectedEvidenceIds
 -> npm run eval:rag
 -> recall@3
```

## RAG 常见面试问题清单

可以按 5 类准备：基础概念、工程实现、评估、安全、项目落地。

更完整的产品面试题库见：

```text
docs\rag-interview-question-bank.md
```

| 问题 | 回答重点 |
|---|---|
| RAG 是什么？ | 检索增强生成：先检索外部知识，再让 LLM 基于检索结果生成答案。 |
| 为什么需要 RAG，不直接 fine-tune？ | RAG 适合动态知识、私有知识、需要 citation 的场景；fine-tune 更适合学习格式、语气、稳定行为，不适合频繁更新事实。 |
| RAG 和直接把文档塞进 prompt 有什么区别？ | RAG 只取相关 chunks，降低噪声和成本，并支持 citation 和 retrieval eval。 |
| 什么是 chunking？ | 把长文档切成可检索的小块；太大噪声多，太小上下文断裂。 |
| chunk 怎么切？ | 优先按语义边界切，比如标题、段落、FAQ、章节、函数，而不是机械按固定字数切。 |
| 什么是 embedding？ | 把文本转成向量，用向量相似度做语义检索，解决关键词不同但语义相近的问题。 |
| 什么是 top-k？怎么选 k？ | 每次取最相关的前 k 个 chunks；k 太小容易漏，k 太大容易引入噪声，需要用 eval 调参。 |
| 什么是 reranking？ | 先粗召回一批候选 chunks，再用更强模型或交叉编码器重排，提高最终 top-k 质量。 |
| 如何评估 RAG？ | 分开评估 retrieval 和 generation；retrieval 看 recall@k、precision@k、MRR，generation 看 groundedness、faithfulness、answer quality。 |
| RAG 常见失败模式？ | 检索不到、检索错、chunk 质量差、query 太泛、embedding 不适合领域、LLM 忽略证据、幻觉 citation。 |
| 如何减少幻觉？ | 只允许基于 retrieved context 回答；无证据就说不知道；输出 citation；做 groundedness 检查。 |
| 如何处理权限和安全？ | 文档级 ACL、最小权限、audit log、敏感信息过滤、不要把 secret 放进 RAG。 |
| RAG 数据怎么维护？ | 用 ingestion pipeline：source -> parse -> chunk -> metadata -> index -> human review -> eval -> refresh。 |
| RAG 可以复用给多个 agent 吗？ | 可以，如果做成 retriever service/tool；但必须做权限隔离，不是所有 agent 都能查所有知识。 |
| 什么时候不需要 RAG？ | 数据很少、静态、能直接放进 prompt，或任务不依赖外部知识时。 |
| 你的项目里怎么用了 RAG？ | 把 profile/project/role criteria 做成 evidence chunks；JD 来了先检索相关 evidence，再生成带 citation 的推荐。 |

面试回答模板：

> 我在 AI Job Search Copilot 里做了一个 RAG-backed profile matching。Milestone 1 先做 JD 结构化抽取和 deterministic scoring，解决“岗位怎么判断”。Milestone 2 把候选人的 profile、项目经历和目标岗位标准拆成 evidence chunks。每个 JD 会先检索相关 evidence，再生成带 citation 的简历重点和 outreach 建议。我还单独做了 retrieval eval，用 recall@3 检查检索结果是否命中人工期望 evidence。当前版本先用 keyword retrieval 作为可解释 baseline，后续可以替换成 embedding retrieval 并比较 recall@k。

## RAG 体验不好时怎么定位问题

不要只看最终回答，要把链路拆开诊断。

RAG 体验不好可能来自 4 层：

```text
1. 知识库 / chunk 构建问题
2. retrieval / embedding / top-k 命中问题
3. reranking / context selection 问题
4. LLM generation / prompt / hallucination 问题
```

推荐排查顺序：

```text
用户问题
 -> query understanding 是否正确？
 -> expected evidence 是否存在？
 -> retriever 是否检索到了？
 -> top-k 是否包含正确证据？
 -> reranker 是否把正确证据排前？
 -> LLM 是否正确使用证据？
 -> 输出是否符合产品要求？
```

### 快速判断表

| 现象 | 可能问题 | 怎么判断 |
|---|---|---|
| 正确资料根本不在知识库 | RAG 构建问题 | 人工搜知识库也找不到 |
| 正确资料在知识库，但没被检索到 | retrieval / embedding 问题 | expected chunk 不在 top-k |
| 正确资料被检索到了，但排很后 | ranking / reranking 问题 | top-20 有，但 top-3 没有 |
| 正确资料在 top-k，但 LLM 没用 | generation / prompt 问题 | context 有证据，答案没引用或忽略 |
| LLM 编造不存在内容 | hallucination / grounding 问题 | answer 里有内容不在 retrieved context |
| 回答用了过期资料 | freshness / indexing 问题 | retrieved chunk 版本旧 |
| 回答泄露不该看的资料 | permission / ACL 问题 | retrieved chunk 不属于当前用户权限 |
| 回答太泛 | evidence 太泛或 prompt 太泛 | retrieved chunks 没有具体事实，或 prompt 没要求具体引用 |
| 回答太长 / 乱 | top-k 太大或 chunk 太长 | context 噪声过多 |
| 回答漏重点 | top-k 太小或 query 太窄 | expected evidence 被漏掉 |

### 怎么判断是不是 embedding 问题

典型信号：

```text
正确 chunk 在知识库里，
问题和 chunk 语义相近，
但检索不到。
```

例如：

```text
用户问：智能体工作流产品经验
知识库有：AI Agent workflow product experience
```

如果 keyword 找不到可以理解；但 embedding 也找不到，可能是：

```text
embedding model 不适合中英混合
query embedding 不好
chunk embedding 不好
领域术语不匹配
```

判断方法：

```text
换 embedding model 对比 recall@k
看 query 和 expected chunk 的 similarity score
用人工 eval set 测多个 case
```

### 怎么判断是不是 RAG 构建问题

看这些问题：

```text
正确答案有没有被写进知识库？
chunk 是否切得合理？
metadata 是否正确？
source / citation 是否存在？
文档是否过期？
权限标签是否正确？
```

常见 RAG 构建问题：

```text
chunk 太大：噪声多
chunk 太小：上下文断裂
chunk 标题 / keywords 不准
source / citation 缺失
文档没入库
文档过期
权限标签错
```

如果人工都很难从知识库找到正确证据，那不是 embedding 问题，而是知识库构建问题。

### 怎么判断是不是 hit / top-k 问题

看 eval 里的：

```text
expectedEvidenceIds
retrievedEvidenceIds
hitCount
recall@k
```

如果：

```text
top-20 有正确证据
top-3 没有
```

说明召回还行，但排序不行，可能需要：

```text
调 k
加 reranking
调 scoring
hybrid search
```

如果：

```text
top-20 都没有
```

说明召回失败，可能是：

```text
query 理解错
embedding 不好
chunk 构建差
知识缺失
```

### 怎么判断是不是最终输出问题

如果正确证据已经在 top-k 里，但回答还是不好：

```text
retrieved context 正确
answer 错误 / 泛泛 / 不引用 / 幻觉
```

那就是 generation 问题。

可以改：

```text
prompt
输出 schema
citation required
“没有证据就说不知道”
grounding checker
post-processing validation
```

### 真实产品应该记录什么 debug trace

每次回答最好记录：

```json
{
  "query": "这个岗位适合我吗？",
  "querySignals": ["AI Agent", "workflow", "SQL"],
  "retrievedChunks": [
    {
      "id": "profile-ai-project",
      "score": 0.87,
      "source": "profile_knowledge",
      "allowed": true
    }
  ],
  "topK": 3,
  "model": "xxx",
  "answerCitations": ["profile-ai-project"],
  "groundingCheck": "pass"
}
```

没有这种 trace，就很难判断问题到底出在检索、排序、权限，还是生成。

面试回答模板：

> 我不会只看最终回答来判断 RAG 系统好坏。我会把链路拆开诊断：先看知识库里是否存在正确 evidence，再看 retriever 是否召回，top-k 是否命中，reranker 是否排序正确，最后看 LLM 是否忠实使用 retrieved context。比如正确 evidence 不在知识库，是 ingestion/chunking 问题；在知识库但不在 top-k，是 retrieval 或 embedding 问题；在 top-20 但不在 top-3，是 ranking/reranking 问题；已经在 top-k 但回答仍然幻觉，就是 generation/grounding 问题。每次请求都应该记录 query signals、retrieved chunks、scores、citations 和 grounding check，才能定位问题。

## 面试回答模板

可以这样说：

> 我在 AI Job Search Copilot 的 Milestone 1 先做了 JD 结构化抽取、schema validation 和 deterministic scoring，解决“岗位如何判断”的问题。Milestone 2 加了 RAG-backed profile matching：我把 sanitized profile、项目经历和目标岗位标准整理成 evidence chunks。每个 JD 进来以后，系统先抽取岗位信号，再检索相关 candidate evidence，最后生成带 citation 的简历重点和 outreach 建议。我还单独做了 retrieval eval，用 recall@3 检查检索是否命中人工期望 evidence，避免 LLM 生成得很流畅但依据是错的。

短版：

> RAG 的重点不是让 LLM 写得更长，而是让生成结果有依据、可追溯、可评估。
