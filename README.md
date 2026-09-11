# 人生护城河 · 我的三河地图


一个面向人生与职业决策场景的 AI-native 产品实验：通过「生存之河、能力之河、热爱之河」持续整理个人经历、能力与选择，逐步形成未来路径和可执行的护城河计划。

### 🌐 Live Demo

**[体验 Personal Moat →](https://themoat.pages.dev/)**

当前 Demo 已开放三河地图、结构化探索、结果确认、未来路径、护城河计划和成长记录等核心流程。

> 当前为公开演示版本。用户数据主要保存在浏览器本地；账号、跨设备同步、生产数据库和真实 AI 服务仍在开发中。


原生 JavaScript、DOM、SVG 与 CSS 的本地网页原型，配有 Node 静态服务与开发态产品 API。浏览器默认保存个人数据；服务端可选择内存或 PostgreSQL 仓储。工作区已有显式连接与复制入口，默认不迁移。当前没有账号、跨设备恢复或真实模型调用。

开始协作先读 [AGENTS](AGENTS.md)、[PRD](PRD.md) 和 [milestones](milestones.md)。工程职责与开发规则见 [工程结构与开发规范](docs/ENGINEERING_STRUCTURE.md)，按任务阅读见 [文档导航](docs/README.md)。

## 运行与配置

需要 Node.js 20 或以上。先用 `npm ci` 安装锁定依赖（服务端 PostgreSQL 驱动 `pg`），再在项目目录运行：

```sh
npm start
```

打开 http://127.0.0.1:4173/ 。兼容启动器为 `scripts/serve.mjs`，实际服务入口为 `backend/server.mjs`；浏览器入口为 `frontend/index.html`。

| 配置 | 当前行为 |
|---|---|
| `MOAT_PREVIEW_PORT` | 默认 4173；设为 0 时由系统分配临时端口，启动输出显示实际地址 |
| 监听地址 | 固定 `127.0.0.1`，用于本地预览 |
| `DATABASE_URL` | 未设置时使用内存；设置后连接 PostgreSQL，启动检查迁移版本；失败停止启动，不自动降级为内存 |
| `MOAT_TEST_DATABASE_URL` | 仅数据库验证脚本读取；使用独立测试库，脚本在随机 schema 中验证并清理 |
| 模型 | 默认关闭；供应商以代码参数注入，当前没有启用真实供应商的配置或调用 |

服务端文件修改后，已有进程须重启才能加载新代码。内存模式重启会丢失该进程内的匿名会话、工作区和回执；PostgreSQL 模式可恢复这些记录，同一浏览器仍需有效会话 Cookie。浏览器已保存数据不受其影响。

若首页空白，先检查浏览器开发者工具的 Network：首页返回 200 但 `/shared/profile.js`、`/shared/workspace.js` 、`/shared/workspace-operations.js` 或 `/shared/understanding.js` 返回 404，说明可能仍在运行旧路由服务。停止原启动终端中的服务，再运行 `npm start` 并刷新页面。只有 `npm start` 持续运行时，本地地址才可访问；无需另启一个前端服务。

## PostgreSQL 本地运行

在自己管理的本地 PostgreSQL 中准备空数据库，设置 `DATABASE_URL` 后运行：

```sh
npm run db:migrate
npm start
```

两个命令需使用同一连接配置。迁移使用事务、版本校验和数据库锁；应用启动只检查已应用的迁移，不自动修改表。连接串通过环境变量传入，不写入源码或提交的文件；`.env` 不会自动加载。

当前表按主体、会话、档案、工作区版本、路径、计划、计划归属、成长记录与回执拆分。里程碑和证明快照暂随对象 JSONB 内容存储；工作区仍是并发版本边界。`/api/v1/paths`、`/api/v1/plans` 已提供对象读写，连接服务器工作区后网页通过连接层调用对象接口，默认仍在本地保存。

## 页面入口

| URL | 页面 |
|---|---|
| `/?view=sync` | 数据与同步：预览后显式连接或复制、重试、切回本地 |
| `/` | 个人地图；无数据时显示空态，读取当前浏览器已确认内容 |
| `/?demo=1` | 独立合成地图案例 |
| `/?view=explore` | 探索、逐条确认、聚焦结果与自主本地保存 |
| `/?view=paths` | 按河流组织未来路径、编辑与比较 |
| `/?view=plans` | 路径下的护城河计划和里程碑 |
| `/?view=growth` | 成长记录、成果快照确认、更新和撤回 |

地图方向可以带入路径草稿；点击保存才建立路径，再次进入会打开已有路径。证明与工作区记录的语义见 [工作区规范](docs/STAGE11_WORKSPACES.md)，工程模块定位统一见工程规范。

## 检查命令

| 命令 | 验证范围 | 运行条件 |
|---|---|---|
| `npm test` | 领域、状态、存储、渲染与服务边界回归 | Node 内置测试运行器 |
| `npm run check` | 入口、关键资源及部分既有动效约束 | 静态检查，不是 lint 或完整构建 |
| `npm run check:stage10` | 合成候选样例的共享校验（CLI 入口） | 不代表完整 JSON Schema 或事实验证 |
| `npm run check:api` | 内存模式真实 HTTP 会话、幂等、冲突、隔离与前端模块加载 | 自动创建并关闭独立临时服务，忽略外部 DATABASE_URL |
| `npm run db:migrate` | 应用 PostgreSQL 迁移 | 需要 DATABASE_URL；会修改目标数据库 |
| `npm run check:postgres` | 真实数据库事务、并发、读取快照、成长/证明/导入失败回滚、导出删除及 Node 重启恢复 | 必须设置 MOAT_TEST_DATABASE_URL；创建随机测试 schema，结束后删除该 schema |

DOM 检查需要单独可用的 jsdom，未列入生产依赖；先核实实际路径，不假设历史报告中的临时目录仍存在：

```sh
node scripts/workspace-dom-check.mjs /path/to/jsdom/lib/api.js
node scripts/stage11-dom-check.mjs /path/to/jsdom/lib/api.js
node scripts/scaffold-dom-check.mjs /path/to/jsdom/lib/api.js
```

DOM 和 HTTP 检查不验证真实浏览器布局、触控或视觉；需要时另做浏览器走查。按改动选择证据见工程规范；纯文档修改只核对现状、规则、路径、链接及差异，不生成资产或重跑无关测试。

## API 与数据边界

开发态 V1 接口、错误、版本和幂等重试详见 [产品 API 与仓储契约](docs/PRODUCT_API.md)。旧 `GET /api/capabilities` 默认报告 `disabled`，`POST /api/analysis` 默认返回 503；探索页面继续使用浏览器本地规则。V1 能力枚举中的 rules/manual 不表示已有 V1 服务端分析接口。

长期内容目前依赖当前浏览器及站点来源；更换浏览器或端口不会自动带入旧数据。数据与同步页先预览，明确确认后才切换或复制工作区；原本地数据保留，探索档案不迁移。内存模式拒绝连接，新增页面尚待浏览器与持久库端到端验证。

本地存储没有严格同时多标签事务，未保存草稿也没有自动恢复。服务器连接操作要求 Web Locks，以保护跨标签缓存和待重试记录；能力缺失或申请锁失败时暂停连接、刷新、写入、重试和切换，保留已有缓存可读。纯本地工作区读写继续可用。PostgreSQL 模式已有持久匿名会话（30 天服务端有效期）与工作区；服务端已提供当前会话退出 API（保留数据，尚无页面入口）；注册身份、会话续期/回收、完整个人数据导出删除、备份恢复和跨设备同步尚未实现；后续边界见 [后端架构](docs/BACKEND_ARCHITECTURE.md)。数据与同步页已提供当前连接主体的服务端导出与二次确认删除入口；范围不包含原始浏览器工作区、探索档案、下载文件和备份。删除响应不明时暂停同步，可单独确认清理本机服务器缓存，清理不代表服务端删除已确认。真实 PostgreSQL 生命周期专项已通过，见 [验证报告](docs/reports/postgres-lifecycle.md)；浏览器下载和删除交互仍待专项验收。密钥不放浏览器，真实模型及外部数据处理仍待明确。

## 文档与资产入口

工程结构与规则 → [ENGINEERING_STRUCTURE](docs/ENGINEERING_STRUCTURE.md)；产品定义 → [PRD](PRD.md)；当前阶段和后续任务 → [milestones](milestones.md)；专题与历史证据 → [文档导航](docs/README.md)。

地图源代码、派生 SVG、河面纹理和字体的关系只在 [资产索引](assets/README.md) 维护。地图河宽、支流形状和雾分布仍是构图，没有个人资本强度计算。
