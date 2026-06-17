# AI Job Search Copilot UI Improvement PRD

## 1. 背景

当前项目已经完成核心 AI workflow 和 agent hardening：JD 解析、RAG 证据检索、职位打分、推荐生成、tool trace、planner validation、approval gate 都可以跑通。

但现有 UI 主要是 **工程验证页面**，目标是让开发者确认 trace、approval、planner 是否工作；它还不是一个适合真实用户长期使用的产品界面。因此下一阶段需要单独做 UI/UX 改版，把系统从“可验证 demo”升级为“可使用产品”。

## 2. PRD 目标

本 PRD 描述 AI Job Search Copilot 的产品 UI 改进方向，重点解决：

1. 用户如何快速理解当前职位匹配结果。
2. 用户如何查看每个职位为什么被推荐或不推荐。
3. 用户如何查看 RAG 证据和 AI 推理链路。
4. 用户如何安全地批准或拒绝外部动作。
5. 用户如何把结果用于简历修改、面试准备和求职跟进。

## 3. 用户画像

### 3.1 主要用户

正在找 AI 产品 / AI 应用产品 / Agent 产品方向工作的候选人。

用户特点：

- 有工程和产品复合背景。
- 需要快速筛选大量 JD。
- 希望知道哪些职位值得投、为什么值得投。
- 需要把项目经历、RAG、LLM、Agent、Function Calling 等内容转化成面试表达。
- 不希望 Agent 未经确认自动投递或联系招聘方。

### 3.2 使用场景

| 场景 | 用户问题 |
|---|---|
| 批量筛选职位 | 这批岗位里哪些最值得看？ |
| 单个岗位分析 | 为什么这个岗位适合我？有什么风险？ |
| 简历优化 | 针对这个岗位，我应该突出哪些经历？ |
| 面试准备 | 这个岗位可能问什么？我应该怎么讲项目？ |
| 外部动作审批 | Agent 准备投递/发消息了，我是否批准？ |

## 4. 当前 UI 问题

| 问题 | 影响 |
|---|---|
| 信息层级弱 | 用户不容易先看到最重要的结论 |
| Trace 太工程化 | 适合 debug，但不适合普通用户理解 |
| 缺少职位列表/详情结构 | 无法像真实求职产品一样浏览和对比职位 |
| 推荐理由不够产品化 | 需要从 raw export 转成卡片、标签、解释 |
| Approval 缺少上下文 | 用户需要知道批准的具体动作、风险和后果 |
| 缺少面试学习视角 | 项目本身是学习 AI Agent 的作品，但 UI 没有体现学习路径 |
| 缺少状态管理 | 没有“待看、已收藏、准备投递、已投递、放弃”等状态 |

## 5. 产品原则

1. **结论先行**：先给用户结论，再允许展开证据和 trace。
2. **AI 可解释**：每个推荐都要能看到评分、证据、风险、生成来源。
3. **人类掌控**：任何投递、发消息、上传简历等外部动作必须明确审批。
4. **从筛选到行动**：UI 不只展示分析，还要帮助用户决定下一步。
5. **面试可讲**：保留工程透明度，让用户能理解 RAG、Tool Calling、Approval、Trace。

## 6. 信息架构

建议改成 5 个主模块：

```text
Dashboard
 -> Job Shortlist
 -> Job Detail
 -> Approval Center
 -> Learning / Agent Trace
 -> Settings
```

### 6.1 Dashboard

用途：让用户快速看到今天分析结果。

核心内容：

- 总职位数
- Strong match 数量
- Possible match 数量
- Low priority 数量
- 平均分
- Top 5 推荐职位
- 高风险职位数量
- 待审批动作数量

### 6.2 Job Shortlist

用途：职位筛选主页面。

建议 UI：

| 区域 | 内容 |
|---|---|
| 左侧筛选 | 推荐等级、地点、薪资、AI fit、风险、公司 |
| 中间列表 | 职位卡片、分数、标签、核心推荐理由 |
| 顶部排序 | 综合匹配度、薪资、AI fit、风险低优先 |

职位卡片字段：

- 职位名称
- 公司
- 地点
- 薪资
- 总分
- 推荐等级
- AI fit 标签
- 风险标签
- 1-2 条核心推荐理由
- 状态：待看 / 收藏 / 准备投递 / 已投递 / 放弃

### 6.3 Job Detail

用途：单个职位的完整解释页。

建议结构：

1. **Summary**
   - 是否建议投递
   - 总分和等级
   - 一句话理由

2. **Score Breakdown**
   - location
   - aiFit
   - productFit
   - compensation
   - seniority
   - skillFit
   - languageFit
   - riskPenalty

3. **Why Match**
   - 匹配的技能
   - 匹配的产品经历
   - 匹配的 AI 经验
   - 英语优势

4. **Risks**
   - 工作强度风险
   - AI 替代风险
   - 技能 gap
   - 薪资不确定性

5. **RAG Evidence**
   - 引用 profile evidence
   - 展示 evidence ID、title、quote、relevance reason

6. **Resume Focus**
   - 针对这个岗位简历该怎么改

7. **Interview Talking Points**
   - 面试可以怎么讲
   - 哪些 AI 概念可以展开

8. **Actions**
   - 收藏
   - 标记为准备投递
   - 生成 outreach message
   - 请求 apply approval

### 6.4 Approval Center

用途：所有外部动作的审批中心。

待审批 action card 应包含：

- actionId
- tool name，例如 `apply_to_job`
- 职位名称 / 公司
- 输入摘要
- 风险说明
- 创建时间
- Approve 按钮
- Reject 按钮

审批原则：

- 不允许全局批准某个 tool。
- 必须批准具体 actionId。
- 批准后要显示状态变化。
- 被拒绝的动作不可自动重试。

### 6.5 Learning / Agent Trace

用途：把工程 trace 转化成用户能理解的 AI 学习视图。

不直接只展示 raw trace，而是分两层：

1. **Human-readable timeline**

```text
1. Extracted job signals
2. Scored role with deterministic rubric
3. Retrieved profile evidence
4. Generated recommendation
5. Blocked external action pending approval
```

2. **Developer trace**

展示原始 tool-call-trace：

- tool
- inputSummary
- outputSummary
- durationMs
- success
- approval
- actionId
- error

## 7. 核心用户流程

### 7.1 职位筛选流程

```text
用户上传/导入 JD
 -> 系统批量分析
 -> Dashboard 展示整体结果
 -> 用户进入 Job Shortlist
 -> 用户按 Strong Match / AI Fit / Risk 筛选
 -> 用户打开 Job Detail
 -> 用户决定收藏、放弃或准备投递
```

### 7.2 单职位解释流程

```text
用户点击职位
 -> 看到一句话结论
 -> 查看 score breakdown
 -> 查看 RAG evidence
 -> 查看 resume focus / interview talking points
 -> 选择下一步 action
```

### 7.3 Approval 流程

```text
Agent 准备 apply_to_job
 -> 系统生成 pending approval
 -> 用户进入 Approval Center
 -> 查看 actionId、职位、风险说明
 -> Approve / Reject
 -> 系统记录 decision
 -> approved action 才能继续执行
```

## 8. 页面需求

### 8.1 Dashboard 页面

必须包含：

- 总览统计卡片
- Top match 列表
- Pending approvals 提醒
- 最近一次分析时间
- 入口按钮：查看全部职位、查看审批、查看 trace

验收标准：

- 用户 10 秒内能知道今天最值得看的职位。
- 用户能看到是否有待审批动作。

### 8.2 Job Shortlist 页面

必须包含：

- 职位卡片列表
- 分数和等级
- 筛选和排序
- 状态标签
- 点击进入详情

验收标准：

- 用户能按 strong match 过滤。
- 用户能按分数排序。
- 用户能看懂为什么某个职位排在前面。

### 8.3 Job Detail 页面

必须包含：

- 总结
- 分数拆解
- 推荐理由
- 风险
- RAG 证据
- 简历优化建议
- 面试 talking points
- action buttons

验收标准：

- 用户不打开 JSON 文件也能理解推荐逻辑。
- 用户可以把页面内容直接用于简历修改和面试准备。

### 8.4 Approval Center 页面

必须包含：

- pending approvals
- approved / rejected history
- actionId
- tool name
- 风险提示
- approve / reject 操作

验收标准：

- 用户清楚知道自己批准的是哪个具体动作。
- 未审批动作不会执行。
- 审批记录可追踪。

### 8.5 Agent Trace 页面

必须包含：

- human-readable timeline
- raw developer trace
- failed tool call 高亮
- actionId 链接到 approval

验收标准：

- 用户能理解 Agent 做了哪些步骤。
- 开发者能 debug 失败原因。

## 9. 数据需求

前端建议读取这些文件/API：

| 数据 | 来源 |
|---|---|
| 分析结果 | `exports/local-mvp-results.json` |
| tool trace | `exports/tool-call-trace.json` |
| pending approvals | `exports/pending-approvals.json` |
| approvals | `exports/approvals.json` |
| demo actions | `web_server.js` local APIs |

后续如果产品化，可以从文件存储迁移到 SQLite/Postgres。

## 10. MVP UI 改版优先级

### P0

1. Dashboard 总览
2. Job Shortlist 卡片列表
3. Job Detail 详情页
4. Approval Center

### P1

1. Agent Trace timeline
2. 状态管理：收藏、准备投递、已投递、放弃
3. 搜索和筛选
4. 面试 talking points 独立区域

### P2

1. 多批次分析历史
2. 上传 JD / resume 文件
3. 多版本简历建议
4. Chrome extension / job board integration

## 11. 非目标

本阶段不做：

- 真正自动投递真实岗位
- 真实招聘网站登录和投递
- 多用户账号系统
- 支付系统
- 复杂权限系统
- 移动端深度适配

## 12. 成功指标

| 指标 | 目标 |
|---|---|
| 用户找到 Top match 的时间 | 小于 10 秒 |
| 用户理解推荐理由 | 不需要打开 JSON |
| 用户完成 approval 判断 | 小于 30 秒 |
| 用户能复述 Agent 流程 | 能说出 extract / score / RAG / recommendation / approval |
| 面试展示效果 | 能通过 UI 解释 LLM Agent 工程化设计 |

## 13. 面试表达

可以这样讲：

> After completing the backend agent workflow, I realized the UI was still developer-oriented. The next product milestone is to convert raw exports and traces into a user-facing decision interface: shortlist, job detail, RAG evidence, approval center, and agent trace. The goal is to help users understand not only which jobs to apply for, but also why the agent made those recommendations and which external actions require human approval.

中文版本：

> 后端 Agent workflow 跑通以后，我发现 UI 仍然偏工程调试，不适合真实用户使用。所以我单独写了 UI 改版 PRD，把产品拆成 Dashboard、职位列表、职位详情、审批中心和 Agent Trace。核心目标是让用户不用看 JSON，也能理解推荐结果、RAG 证据、风险点和审批动作。

