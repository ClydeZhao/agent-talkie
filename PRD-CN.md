# agent-talkie PRD

状态：当前版本  
最后更新：2026-05-30

一个让原本运行在不同产品中的编码代理协作的协作层。

## 核心想法

大多数编码代理在各自产品内部很强，但在产品边界之外彼此隔离。

你可以让 `Codex` 写代码，让 `Claude Code` 做评审，让 `Cursor` 探索代码库，但它们不会自然地彼此对话。人类于是变成了桥梁：

- 把一个工具里的请求复制到另一个工具里
- 再把回答粘贴回来
- 传递后续问题
- 重复解释上下文
- 跟踪谁被什么问题卡住

这些工作都是浪费。

`agent-talkie` 采取的是另一种方式。它不把每个 runtime 当成彼此隔离的孤岛，而是把正在运行的 session 连接到一个共享协作层里。Session 可以直接对话。一个 session 可以负责协调。人类可以观察并介入，而不必充当消息传输层。

这不是另一个“单一 runtime 内部的 subagent / agent team 系统”。它是一个跨独立原生 session 的互操作层。

这个模式既适用于一个人同时使用多个工具，也自然延展到团队。多个用户可以加入同一个协作空间，各自带来自己的本地 agent session。这些 session 保留自己的原生 runtime 和本地上下文，但仍然可以直接协作。

## 为什么这很重要

问题不在于 agent 不够强。问题在于每个 runtime 都把自己的优势困在自己的产品边界之内。

不同的 runtime 各有擅长。用户可能偏好用一个做实现，用另一个做评审，再用第三个做探索。缺失的不是另一个模型，缺失的是互操作性。

在团队层面也是一样。在一个 AI-native 团队里，不同的人会偏好不同的工具，并带来不同的本地 agent 配置。当每个成员都能把自己的 agent 带进同一个协作空间，而不必放弃自己的本地 runtime 或私有工作上下文时，这个产品就会强大得多。

这在公司级别、跨多个团队的大 feature 上尤其痛。产品工程、后端、前端、基础设施以及相关合作团队，往往都需要做方案对齐、接口协商、发布配合和联调。今天，这些协调工作仍然大量落在人身上，由人类在不同工具、不同团队和不同代码库之间手动转述上下文。而这正是这个产品应该消除的沟通开销。

这个产品不应该试图用一个新的超级 runtime 替换所有 runtime。它应该让现有 session 在原地协作。

## 模式

正确的抽象不是“每个品牌一个 agent”。也不是“每次交接对应一个 task”。更不是“一个所有人都能看到所有内容的聊天室”。

它应该是：

- 一组具体的运行中 session
- 一个共享协作空间
- session 之间的显式路由
- 在需要协调时出现的 orchestrator 角色
- 一个供人类监督和介入的可见界面

这是 conversation-first、task-second。

Task 依然重要。它帮助组织工作。但只有当 session 在初次分发之后还能继续对话时，价值才会出现：

- 索要上下文
- 质疑评审意见
- 澄清意图
- 协商下一步
- 彼此解阻

如果系统只支持一次性分发，它就会退化成一个弱化版任务队列，并失去重点。

## 设计原则

### Session first

协作的基本单位是 session，而不是 runtime 品牌。

用户协作的对象不是 “Claude” 或 “Codex” 这样的抽象实体，而是具体运行中的 session。每个 session 都有当前原生上下文、当前任务和明确身份。

这一点很重要，因为用户可能会同时运行多个来自同一 runtime 的 session。

Runtime 品牌不决定协作角色。Codex、Cursor、Claude Code 或其他原生
session 都可以扮演 orchestrator，也都可以扮演 worker。是否常驻也不由
角色决定：orchestrator 可以是 pull-based，也可以是 long-running；
worker 同样可以是 pull-based 或 long-running。协作层应该呈现真实的
session 行为，而不是根据工具名称推断能力。

### Conversation first

产品必须优化持续的来回协作，而不是单向委派。

对话不是工作的副作用。对话就是工作得以解决的方式。

### Existing runtime first

`agent-talkie` 应该连接用户已经在运行的 session。

它不应该为了实现跨工具协作而要求托管执行、托管的临时工作区，或者一个新的 runtime。

### Bring your own agents

这个产品应该适用于团队，而不只是单人用户。

每个参与者都应该可以把自己的本地 agent session 带入共享协作空间，不管他们使用的是哪种 runtime。

### Humans are not middleware

人类应该始终保有控制权，但不应该被迫在不同 agent 工具之间手动搬运信息。

当人类可以监督并引导协作，而不是充当复制粘贴桥梁时，这个产品才算成功。

### Peer resolution before human escalation

大多数问题应该先由 agent 彼此对话来解决。

只有在以下情况，人类才应该介入：

- 答案确实需要人类判断
- orchestrator 判断需要升级
- 原生客户端或工具要求人类直接确认

### Orchestrator as control point

orchestrator 不必转发每一条消息，但它应当对协作空间的结果负责，并主动推动整个团队往结果收敛。

它的职责不只是分发任务。它还应该维持推进节奏、跟进停滞中的线程、综合当前状态，并判断何时需要人类介入。

orchestrator 是 space 内部被分配的角色，不是某个 runtime 的特殊类别。
任何具备足够 tool-loop 能力的参与 session 都可以被指定为 orchestrator；
当协作需要不同负责人时，这个角色也应该可以转移。

它应当成为主要控制点，用于：

- 分派工作
- 跟进进度
- 决定何时升级
- 把整合后的问题呈现给人类

这样可以避免人类同时被拉进多条原始 agent 对话。

### Collaboration metadata belongs to the collaboration layer

角色、进度、焦点以及其他协作元数据，不属于工作仓库产物。它们属于协作层。

它们存在的目的，是让其他 session 和人类都能看懂当前工作状态。

### Local context stays local

协作层不应该要求把用户完整的本地上下文集中起来。

agent 保留自己的原生 runtime、工具权限和主要工作上下文，仍然运行在用户自己的机器上。协作层的作用是协调，而不是把所有本地状态吸收到单一系统里。

### Explicit participation over ambient discovery

参与必须是显式的。

同一用户拥有的本地 session，可以通过 slash command 或其他显式 attach 动作直接加入。

跨用户或跨机器的参与，则应要求显式的信任机制，例如邀请、审批流程或 access token。

仅仅因为被发现了，包括处于同一个局域网里，并不应该自动获得成员资格。

### Keep the boundary narrow

`agent-talkie` 应该解决跨 runtime 协作，而不是试图解决所有多 agent 问题。

它不应该试图拥有：

- git 冲突规避
- worktree 安全
- 托管的长期记忆系统
- 对原生 agent UX 的完全替代

### Tool layer first

`agent-talkie` 应聚焦协作工具层：连接 session、承载消息、暴露协作元数据，并让协调过程变得可见。

它的内建语义应保持狭窄。在这一层里，核心原语是消息交换加协作元数据。

更丰富的信息交换，例如代码上下文、diff、日志、API 细节或发布假设，应该通过 harness 去指导 agent 使用各自的原生工具完成，而不是直接做成一个庞大的平台内建 artifact 模型。

agent 应该如何使用这些工具，本质上是 harness engineering 问题，而不是 `agent-talkie` 自身要解决的核心产品问题。

Harness 可以围绕产品存在，但它们应始终从属于协作层，而不是反过来变成一个通用产品主轴。

这些 harness 究竟应主要由用户自己定义，例如通过 `AGENTS.md` 和 skills，还是由产品提供一些内建默认值，现在都应保持开放。

## 协作应该如何工作

这个产品应该像一条共享线路，把原本彼此分离的 agent 世界连接起来。

每个运行中的 session 都会加入一个共享协作空间。加入后，它会成为一个可见参与者，并具备：

- 稳定身份
- 人类可用的名称
- 可见的 runtime 和项目标签上下文
- 轻量协作元数据

用户应该按名字来指代 session，而不是按 runtime 品牌。

共享空间中的人类消息，默认应该发送给 orchestrator。人类也应该能够直接指向某个特定 session。处于同一空间中的 session 之间也应该能够直接对话。

可见的协作界面并不等同于所有 agent 的通用上下文。可见范围可以很广，但消息投递必须是显式的。

不是每一条可见消息都应该自动变成每个 session 的上下文。

在协作层这一层面，平台应承载消息和协作元数据，而不应默认把更丰富的信息交换做成第一类内建产品原语。

一个协作空间也可以包含多个人类参与者，每个人都带着自己的本地 session。重点不只是“一个人的多个 agent”，而是“多个人，各自带着自己的 agent，仍然像一个团队那样协作”。

### 默认人类体验

默认的人类体验应该像是在和团队负责人沟通，而不是在操作消息总线。

当一个协作空间里存在 orchestrator 时，主要的人类可见讨论应该是人类与该 orchestrator 之间的对话。orchestrator 负责协调，并应该把进展、问题和阻塞点整合后报告给人类。其他 session 仍然可见、可寻址，但它们不应该成为人类默认需要管理的主要对象。

人类仍然可以打开与某个具体 session 的直接 private conversation。这是一条用于澄清、调试或微操的介入路径。它不应该要求人类思考 routing target 这类传输字段。产品应该把它呈现为与该参与者的一段私聊。

Session-to-session conversation 也应该是一等能力。Worker 之间应该能互相提问、解决问题，并把有意义的状态报告回 orchestrator。orchestrator 不必转发每一个字节，但它应该拥有协作状态，并决定哪些内容需要呈现给人类。

协作历史应该以 conversation 和 system event 的形式可读。Raw envelope、payload JSON、routing field 和 transcript diagnostics 可以作为调试信息存在，但不应该是默认的人类可见视图。

创建协作空间时，不应该要求人类先想一个名字。系统可以分配一个人类可用的 label，并维护 active list，让另一个 runtime 可以通过自己的原生交互模型显式加入正确的空间。这保留了显式参与原则，同时避免让人类管理低层 identifier。

## 一个 session 应该暴露什么

每个 session 都应该暴露足够的信息，才能成为有用的协作者：

- 它是谁
- 它属于哪个 runtime
- 它暴露的 workspace label 或项目标签是什么
- 它当前扮演什么角色
- 它当前关注什么
- 它的工作进展如何

这些元数据应该由 `agent-talkie` 管理，在产品中可见，并在必要时允许人类编辑，也允许 session 自己更新。

产品应该同时支持自动和手动两种方式来保持这些元数据的最新状态，但具体机制现在应保持开放。

关键边界在于：协作元数据是共享的协作状态，它不同于暴露一个 session 的完整本地上下文。

## 解阻应该如何工作

中断本质上有两类。

第一类是知识型中断。某个 session 需要上下文、澄清或答案，而另一个 session 可能已经拥有这些信息。只要可能，这类问题都应该在协作层内部解决。

第二类是原生中断。某个 runtime 或工具需要人类直接执行操作，例如：

- 权限批准
- 身份认证
- 危险操作确认
- runtime 原生的用户输入提示

这些交互应该保留在原生客户端里。`agent-talkie` 应该让它们变得可见且易懂，但不应该试图取代它们。

这一区分很重要，因为不是每一种中断都应该把人类重新拉回环路中。

## 产品能力

产品应该支持：

- 命名 session，包括同一协作空间中来自同一 runtime 的多个 session
- 多个人类参与同一个协作空间
- bring-your-own-agent 模式，即每个人都可以贡献自己的本地 session
- 跨 runtime 的 session-to-session 直接通信
- 一个可以接收默认人类输入并负责协调工作的 orchestrator 角色
- 多轮对话，而不是一次性请求
- peer-first 的问题解决方式
- 由 orchestrator 负责的人类升级
- 让人看见谁在参与、他们在做什么、哪里需要关注
- 属于协作层而不是工作仓库的协作元数据
- 足够的工作区感知能力，使协作真正有意义
- 同一协作空间内多个 session 并行工作
- session 显式 opt-in 参与，以及基于邀请的 space 成员机制
- 一种 local-first 的信任模型，让本地上下文除非被明确分享，否则始终留在用户机器上

## 代表性例子

### 跨 runtime 评审

一个人类正在和名为 `impl-auth` 的 session 一起工作。他让它去找 `reviewer-1` 做一次评审。`reviewer-1` 完成评审，在需要时提出后续问题，并返回发现的问题。这两个 session 会继续讨论，直到评审真正被解决。

### 由 orchestrator 协调的多 session 交付

一个名为 `lead` 的 session 充当 orchestrator。它把前端工作派给 `fe-worker`，把后端工作派给 `be-worker`。这些 session 并行工作，在需要时互相提问，而 `lead` 只在必要时才升级给人类。

### Human-in-the-loop 解阻

一个 worker session 需要信息。另一个 session 给出答案，于是它无需人类帮助就能继续。后来，另一个 session 遇到了原生权限提示。产品会明确显示是哪个 session 需要人类关注，于是人类回到那个原生 session 中处理。

### 跨团队 feature 交付

一家公司正在交付一个跨多个团队的 feature。一个团队负责产品表层，另一个团队负责后端服务，另一个团队负责认证，还有一个团队负责发布所需的开发平台或基础设施。每个团队都已经有自己的本地 agent session，正在各自的 repo 或模块里工作。

这些 session 被拉进同一个 feature collaboration space。它们在这个 space 里做方案对齐、澄清责任边界、协商接口变更、协调实现顺序，并为联调做准备。当某个团队修改了 API 契约或发布假设时，相关 session 可以立刻继续追问，而不是等人类发现不一致之后再手动转述。

进入联调阶段后，这些 session 还可以继续跨团队沟通：确认预期、通过各自的工具和 harness 交换所需的代码或发布上下文、暴露阻塞点、协调修复。人类仍然负责监督和决策，但不再需要充当各团队 agent 之间的消息传输层。

## 非目标

`agent-talkie` 不打算：

- 解决通用的多 agent git 冲突或 worktree 冲突
- 变成一个面向 agent 行为的通用 harness 框架
- 取代各个 runtime 自身的 task system 或 subagent system
- 变成托管式自治 agent 平台
- 变成 agent 的持久化记忆平台
- 取代原生客户端中的审批、认证或提示交互 UX
- 让所有可见协作消息自动成为每个 session 的隐式上下文
- 把每个参与者的本地上下文都集中到一个托管系统里

## 默认决策

- Session 名称应该是人类可用的标签，并在需要时带有稳定的消歧信息。名称可以由用户指定，也可以由 session 提议；但一旦发生重名，系统应自动补充清晰的消歧信息，例如 runtime、所有者或数字后缀。
- 默认的 workspace-label 可见性应当最小化。runtime、repo 或 workspace label、branch、当前 focus 这类高层项目上下文可以可见，但本地路径和其他敏感细节在未显式分享前应保持私有。
- 元数据维护默认应采用混合模式。活动状态、阻塞状态、最近更新时间这类状态型字段可以自动更新；角色、显示名、归属关系、声明中的 focus 这类语义型字段应保持在人类控制之下。
- 面向人类的可见历史默认应限于共享协作时间线和被显式共享的 thread。原生客户端内部上下文、私有本地状态，以及任何没有进入协作层的内容，都不应默认暴露。

## 开放问题

- harness 到底应该有多少内建在产品里，又有多少应通过用户和仓库自己定义的机制来提供，例如 `AGENTS.md` 和 skills？
- 在团队共享协作空间时，初始的信任与邀请模型应该是什么？
- 当当前 orchestrator 消失时，应该如何分配、变更或恢复 orchestrator 角色？

## 说明

这份文档刻意保持抽象。它定义的是产品模式，而不是某个具体实现。

具体架构、协议、状态处理、元数据更新流程和 adapter 设计现在都应保持开放。这个产品有很多种实现得很好的方式。这份文档的工作，是把模式讲清楚，让后续这些决定可以在一致的前提下做出。
