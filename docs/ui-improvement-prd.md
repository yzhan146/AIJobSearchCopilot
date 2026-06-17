# AI Job Search Copilot UI Improvement PRD

## 1. 背景

当前项目已经完成核心 AI workflow 和 agent hardening：JD 解析、RAG 证据检索、职位打分、推荐生成、tool trace、planner validation、approval gate 都可以跑通。

但现有 UI 主要是 **工程验证页面**，目标是让开发者确认 trace、approval、planner 是否工作；它还不是一个适合真实用户长期使用的产品界面。因此下一阶段需要单独做 UI/UX 改版，把系统从“可验证 demo”升级为“可使用产品”。

## 2. PRD 目标

本 PRD 描述 AI Job Search Copilot 的产品 UI 改进方向，重点解决：

1. 用户如何上传自己的背景资料，并让系统形成可靠的候选人画像。
2. 用户如何一次提交最多 10 个 JD 进行对比分析。
3. 产品如何根据“用户资料 vs JD 要求”的匹配程度，按成功率对 JD 排序。
4. 用户如何理解每个 JD 的排序理由。
5. 用户如何针对每个 JD 获得可执行的简历改进建议。
6. UI 如何做到简单、现代、平面化，降低非技术用户理解成本。

## 2.1 本阶段产品范围

### 支持的用户输入

本阶段只支持以下 3 类用户背景资料输入：

| 输入类型 | 说明 | 是否必需 |
|---|---|---|
| 简历 | 用户上传自己的简历文件或粘贴简历文本 | 至少需要一种背景输入 |
| 个人网站 | 用户填写个人网站 URL，例如 portfolio / blog / project page | 可选 |
| GitHub | 用户填写 GitHub profile 或 repo URL | 可选 |

明确限制：

- **不支持**除简历、个人网站、GitHub 以外的用户背景提交方式。
- 不支持上传无关文件，例如证书合集、聊天记录、作品截图包等。
- 不支持无限制爬取外部网站；个人网站和 GitHub 只作为用户明确提供的背景来源。

### 支持的 JD 输入

用户可以提交 **最多 10 个 JD** 进行同批次分析。

JD 输入方式：

- 粘贴 JD 文本。
- 粘贴 JD URL。
- 每个 JD 需要能识别出职位名称、公司、地点、职责、要求等核心信息。

限制：

- 单批次超过 10 个 JD 时，UI 应提示用户减少数量。
- 不支持无限批量导入。
- 不支持自动从招聘网站大规模抓取 JD。

## 2.2 核心产品输出

一次分析完成后，产品必须输出：

| 输出 | 说明 |
|---|---|
| JD 成功率排序 | 根据用户背景与 JD 要求的匹配程度，从高到低排序 |
| 排序理由 | 解释为什么某个 JD 排名更高或更低 |
| 单 JD 匹配分析 | 展示匹配项、缺口、风险和机会 |
| 简历改进建议 | 针对每个 JD 建议补充哪些 skill、调整哪些经历、突出哪些项目 |
| 面试准备建议 | 可选展示这个 JD 面试中可以强调的 talking points |

## 3. 用户画像

### 3.1 主要用户

正在找 AI 产品 / AI 应用产品 / Agent 产品方向工作的候选人。

用户特点：

- 有工程和产品复合背景。
- 需要快速比较一批 JD，本阶段单批次最多 10 个。
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

1. **结论先行**：先告诉用户 10 个 JD 里哪些成功率最高，再解释原因。
2. **输入克制**：只收集简历、个人网站、GitHub 和最多 10 个 JD，不做复杂表单。
3. **AI 可解释**：每个排序结果都要能看到匹配项、缺口、风险和证据。
4. **建议可执行**：简历建议必须具体到 skill、经历、项目表述和优先级。
5. **简单现代**：UI 风格应平面化、简洁、现代，减少装饰和认知负担。
6. **面试可讲**：保留工程透明度，让用户能理解 RAG、Tool Calling、Validation、Approval、Trace。

## 6. 信息架构

建议拆成 P0 主路径模块和 P2 扩展模块。

P0 主路径：

```text
Profile Setup
 -> JD Submission
 -> Ranking Dashboard
 -> Job Shortlist
 -> Job Detail
```

P2 扩展：

```text
Approval Center
 -> Learning / Agent Trace
 -> Settings
```

### 6.1 Profile Setup

用途：让用户上传/填写候选人背景资料。

核心内容：

- 简历上传或简历文本粘贴
- 个人网站 URL 输入
- GitHub profile/repo URL 输入
- 背景资料解析状态
- 资料完整度提示

验收标准：

- 用户清楚知道只支持简历、个人网站和 GitHub。
- 用户不需要填写复杂问卷也能开始分析。
- 系统能展示已成功读取哪些背景来源。

### 6.2 JD Submission

用途：让用户提交最多 10 个 JD。

核心内容：

- JD 文本输入框
- JD URL 输入框
- 已添加 JD 列表
- 当前数量：例如 `6 / 10`
- 删除 / 编辑 JD
- 超过 10 个 JD 时明确提示

验收标准：

- 用户能一次提交 1-10 个 JD。
- 超过 10 个 JD 时无法继续添加。
- 每个 JD 在提交前都能看到标题或摘要。

### 6.3 Ranking Dashboard

用途：让用户快速看到本批次 JD 的成功率排序。

核心内容：

- 总职位数
- 最高成功率 JD
- 平均成功率
- Strong / Medium / Low opportunity 数量
- Top 5 成功率职位
- 高风险职位数量
- 待审批动作数量
- 一句话总结：本批次是否值得重点投入

### 6.4 Job Shortlist

用途：职位筛选主页面。

建议 UI：

| 区域 | 内容 |
|---|---|
| 左侧筛选 | 成功率区间、地点、薪资、AI fit、风险、公司 |
| 中间列表 | JD 卡片、成功率、标签、核心排序理由 |
| 顶部排序 | 成功率、薪资、AI fit、风险低优先 |

职位卡片字段：

- 职位名称
- 公司
- 地点
- 薪资
- 成功率 / success score
- 推荐等级
- AI fit 标签
- 风险标签
- 1-2 条核心排序理由
- 状态：待看 / 收藏 / 准备投递 / 已投递 / 放弃

### 6.5 Job Detail

用途：单个职位的完整解释页。

建议结构：

1. **Summary**
   - 是否建议投递
   - 成功率和等级
   - 一句话理由

2. **Success Probability Breakdown**
   - location
   - aiFit
   - productFit
   - compensation
   - seniority
   - skillFit
   - languageFit
   - riskPenalty

3. **Ranking Reasons**
   - 为什么这个 JD 排名高 / 低
   - 哪些要求正好匹配用户背景
   - 哪些要求明显缺失
   - 与同批次其他 JD 相比的优势或劣势

4. **Why Match**
   - 匹配的技能
   - 匹配的产品经历
   - 匹配的 AI 经验
   - 英语优势

5. **Risks**
   - 工作强度风险
   - AI 替代风险
   - 技能 gap
   - 薪资不确定性

6. **RAG Evidence**
   - 引用 profile evidence
   - 展示 evidence ID、title、quote、relevance reason

7. **Resume Improvement Suggestions**
   - 针对这个岗位简历该怎么改
   - 应该加入哪些 skill
   - 哪些经历应该前置或强化
   - 哪些项目描述应该改写
   - 哪些 JD keyword 应该自然覆盖
   - 哪些 gap 不建议硬写，应该在面试中解释

8. **Interview Talking Points**
   - 面试可以怎么讲
   - 哪些 AI 概念可以展开

9. **Actions**
   - 收藏
   - 标记为准备投递
   - 生成 outreach message
   - 请求 apply approval

### 6.6 Approval Center

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

### 6.7 Learning / Agent Trace

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

### 7.1 资料输入流程

```text
用户进入 Profile Setup
 -> 上传简历 / 粘贴简历文本
 -> 可选填写个人网站
 -> 可选填写 GitHub
 -> 系统解析用户背景
 -> 展示已识别的技能、经历、项目、优势
```

### 7.2 JD 提交流程

```text
用户进入 JD Submission
 -> 粘贴 JD 文本或 URL
 -> 添加到本批次列表
 -> UI 显示当前数量 n / 10
 -> 用户确认提交
 -> 系统开始分析
```

### 7.3 职位排序流程

```text
系统读取用户背景
 -> 系统读取最多 10 个 JD
 -> 对每个 JD 计算成功率
 -> 按成功率从高到低排序
 -> Ranking Dashboard 展示整体结论
 -> Job Shortlist 展示所有 JD 卡片和排序理由
```

### 7.4 单职位解释和简历建议流程

```text
用户点击某个 JD
 -> 看到成功率、一句话结论和排序理由
 -> 查看匹配项、缺口、风险
 -> 查看 RAG evidence
 -> 查看 Resume Improvement Suggestions
 -> 按建议修改简历或准备面试表达
```

### 7.5 Approval 流程

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

### 8.1 Profile Setup 页面

必须包含：

- 简历上传 / 简历文本粘贴区域
- 个人网站 URL 输入
- GitHub URL 输入
- 已解析背景摘要
- 输入限制说明：只支持简历、个人网站、GitHub
- Continue to JD Submission 按钮

验收标准：

- 用户能在 1 分钟内完成背景资料输入。
- 用户清楚知道哪些输入方式支持，哪些不支持。
- 系统能展示用户背景资料是否已成功解析。

### 8.2 JD Submission 页面

必须包含：

- JD 文本输入
- JD URL 输入
- 已添加 JD 列表
- `n / 10` 数量提示
- 添加、删除、编辑 JD
- Analyze 按钮

验收标准：

- 用户最多只能提交 10 个 JD。
- 超过 10 个时按钮禁用并提示原因。
- 用户提交前能看到当前批次包含哪些 JD。

### 8.3 Ranking Dashboard 页面

必须包含：

- 总览统计卡片
- Top success probability 列表
- Pending approvals 提醒
- 最近一次分析时间
- 入口按钮：查看全部职位、查看审批、查看 trace
- 本批次整体建议，例如“优先看前 3 个 JD”

验收标准：

- 用户 10 秒内能知道本批次最值得看的 JD。
- 用户能理解排序依据是“成功率”，不是随意推荐。
- 用户能看到是否有待审批动作。

### 8.4 Job Shortlist 页面

必须包含：

- JD 卡片列表
- 成功率和等级
- 筛选和排序
- 状态标签
- 点击进入详情

验收标准：

- 用户能按 strong match / high success probability 过滤。
- 用户能按成功率排序。
- 用户能看懂为什么某个 JD 排在前面。

### 8.5 Job Detail 页面

必须包含：

- 总结
- 成功率拆解
- 排序理由
- 风险
- RAG 证据
- 简历优化建议
- 面试 talking points
- action buttons

验收标准：

- 用户不打开 JSON 文件也能理解推荐逻辑。
- 用户可以看到针对该 JD 的具体简历调整建议。
- 用户能知道应该补充哪些 skill、改写哪些经历、突出哪些项目。

### 8.6 Resume Improvement 区块

可以作为 Job Detail 内的重点区块，也可以后续独立成页面。

必须包含：

- Recommended skills to add
- Experiences to emphasize
- Experiences to rewrite
- Missing requirements / gaps
- Suggested resume bullets
- Do-not-fake warnings：哪些 skill 不应该硬写

验收标准：

- 建议必须针对当前 JD，而不是泛泛而谈。
- 每条建议需要说明原因。
- 用户能直接把建议用于改简历。

### 8.7 Approval Center 页面

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

### 8.8 Agent Trace 页面

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
| 用户简历 | 用户上传文件或粘贴文本 |
| 个人网站 | 用户填写 URL |
| GitHub | 用户填写 profile/repo URL |
| JD 输入 | 用户粘贴 JD 文本或 URL，单批次最多 10 个 |
| 分析结果 | `exports/local-mvp-results.json` |
| tool trace | `exports/tool-call-trace.json` |
| pending approvals | `exports/pending-approvals.json` |
| approvals | `exports/approvals.json` |
| demo actions | `web_server.js` local APIs |

后续如果产品化，可以从文件存储迁移到 SQLite/Postgres。

## 10. 视觉风格要求

UI 应该简单、直接、平面化，整体设计风格参考 `marshallzzz.com` 这类简洁现代的个人网站风格。

设计关键词：

| 方向 | 要求 |
|---|---|
| Layout | 大留白、清晰分区、少层级 |
| Visual style | 平面化、轻边框、少阴影、不要复杂渐变 |
| Typography | 字体清晰，标题有层级，正文易读 |
| Color | 克制的中性色为主，用少量强调色表达 success / risk / approval |
| Components | 卡片、标签、进度条、简单表格，避免复杂 dashboard 图表堆砌 |
| Interaction | 操作路径短，按钮文案明确，不让用户猜下一步 |

不建议：

- 不要做传统 ATS / HR SaaS 那种厚重后台风格。
- 不要做过度炫技的 3D、粒子、复杂动效。
- 不要把 trace/debug 信息默认暴露在主页面。
- 不要让用户面对大量 JSON 或工程字段。

## 11. MVP UI 改版优先级

### P0

1. Profile Setup：支持简历、个人网站、GitHub 输入。
2. JD Submission：支持最多 10 个 JD。
3. Ranking Dashboard：按成功率排序展示所有 JD。
4. Job Shortlist：展示 JD 卡片、成功率和排序理由。
5. Job Detail：展示单 JD 匹配解释。

### P1

1. Resume Improvement：针对每个 JD 给出简历修改建议。
2. 状态管理：收藏、准备投递、已投递、放弃。
3. 搜索和筛选。
4. 面试 talking points 独立区域。
5. 视觉风格 polish：接近平面化、简洁、现代的个人网站风格。

### P2

1. Approval Center。
2. Agent Trace timeline。
3. 多批次分析历史。
4. 多版本简历建议。
5. Chrome extension / job board integration。

## 12. 非目标

本阶段不做：

- 真正自动投递真实岗位
- 真实招聘网站登录和投递
- 多用户账号系统
- 支付系统
- 复杂权限系统
- 移动端深度适配
- 简历、个人网站、GitHub 以外的背景资料提交方式
- 单批次超过 10 个 JD 的分析
- 大规模招聘网站抓取

## 13. 成功指标

| 指标 | 目标 |
|---|---|
| 用户完成背景资料输入 | 小于 1 分钟 |
| 用户提交 JD 数量 | 支持 1-10 个，超过 10 个时明确拦截 |
| 用户找到最高成功率 JD 的时间 | 小于 10 秒 |
| 用户理解推荐理由 | 不需要打开 JSON |
| 用户理解排序理由 | 每个 JD 至少展示 1-2 条清晰原因 |
| 用户获得简历建议 | 每个 JD 至少 3 条具体建议 |
| 用户完成 approval 判断 | 小于 30 秒，P2 阶段要求 |
| 用户能复述 Agent 流程 | 能说出 extract / score / RAG / recommendation / approval |
| UI 视觉效果 | 简洁、现代、平面化，主路径无工程噪音 |

## 14. 面试表达

可以这样讲：

> After completing the backend agent workflow, I refined the UI PRD around a tighter user journey: users provide only resume, personal website, or GitHub as background sources, submit up to 10 JDs, and receive a success-probability ranking with clear reasons. For each JD, the product also generates concrete resume improvement suggestions, such as skills to add, experiences to emphasize, and project descriptions to rewrite.

中文版本：

> 后端 Agent workflow 跑通以后，我把 UI PRD 收敛成一个更清晰的产品流程：用户只需要提供简历、个人网站或 GitHub，然后提交最多 10 个 JD，系统按成功率排序，并解释每个 JD 为什么排在这个位置。对每个 JD，产品还会给出具体简历修改建议，例如应该补哪些 skill、调整哪些经历、突出哪些项目。
