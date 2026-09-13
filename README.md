# 人生护城河 · 我的三河地图


一个面向人生与职业决策场景的 AI-native 产品实验：通过「生存之河、能力之河、热爱之河」持续整理个人经历、能力与选择，逐步形成未来路径和可执行的护城河计划。

### 🌐 Live Demo

**[体验 Personal Moat →](https://themoat.pages.dev/)**

当前正式入口已开放三河地图、结构化探索、结果确认、未来路径、护城河计划和成长记录等核心流程；生产域名已接入匿名会话、D1 持久化、导出删除和规则模式 API。

> 当前为公开匿名版本。用户无需注册即可使用：每个浏览器配置文件自动获得独立匿名主体，云端数据不会与其他主体混读。生产 AI 已按 Free-only 配置受控开放，用户需在本轮明确同意，失败时回退规则/手工模式。账号、跨设备同步和备份不是当前版本目标。


工程采用原生 JavaScript ES Modules、DOM、SVG 与 CSS，配有 Node 参考服务、PostgreSQL 持久化实现，以及已部署到隔离预发布的 Cloudflare Pages、Worker 与 D1。浏览器默认保存个人数据，也可显式连接匿名服务器主体；两种位置不自动合并。当前没有账号或跨设备恢复。探索默认使用本地规则，仅在隔离环境能力确认 Free-only 且用户本轮明确同意时调用百炼新加坡模型。

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
| `ALIYUN_DASHSCOPE_API_KEY` | 新加坡地域的百炼普通 API Key；只在服务端读取，不写入仓库或浏览器 |
| `ALIYUN_FREE_MODELS` | 逗号分隔的后台模型白名单；按顺序尝试，最多 12 个，不向用户提供选择 |
| `ALIYUN_FREE_ONLY_CONFIRMED` | 必须精确为 `true`，表示已在控制台为白名单模型启用 Free Quota Only；缺失时拒绝启用 |
| `ALIYUN_MODEL_BASE_URL` | Moat workspace 的新加坡专属地址：`https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`；不填则用新加坡共享端点，拒绝 trial/token/coding plan 端点 |
| `ALIYUN_MODEL_DAILY_CALL_LIMIT` | 可选进程内每日硬上限，默认 100；重启清零，不能替代边缘限流和云端 Free Quota Only |
| `MOAT_MODEL_CALLS_PER_HOUR` | 可选；每个服务端会话每小时最多模型请求数，默认 6；同一会话同时只允许一个请求在途 |
| `MOAT_MODEL_TIMEOUT_MS` | 可选；完整模型请求超时，默认 75000、允许 1000–120000；依据当前 workspace 实测覆盖 Flash 与 Max 平均耗时 |

服务端文件修改后，已有进程须重启才能加载新代码。内存模式重启会丢失该进程内的匿名会话、工作区和回执；PostgreSQL 模式可恢复这些记录，同一浏览器仍需有效会话 Cookie。浏览器已保存数据不受其影响。

若首页空白，先检查浏览器开发者工具的 Network：首页返回 200 但 `/shared/profile.js`、`/shared/workspace.js` 、`/shared/workspace-operations.js` 或 `/shared/understanding.js` 返回 404，说明可能仍在运行旧路由服务。停止原启动终端中的服务，再运行 `npm start` 并刷新页面。只有 `npm start` 持续运行时，本地地址才可访问；无需另启一个前端服务。

## PostgreSQL 本地运行

在自己管理的本地 PostgreSQL 中准备空数据库，设置 `DATABASE_URL` 后运行：

```sh
npm run db:migrate
npm start
```

两个命令需使用同一连接配置。迁移使用事务、版本校验和数据库锁；应用启动只检查已应用的迁移，不自动修改表。连接串和模型密钥通过环境变量传入，不写入源码或提交的文件。`npm start`、`npm run db:migrate` 和 `npm run check:postgres` 会用 Node 内置能力读取项目根目录中可选的 `.env`；该文件已被 Git 忽略，字段示例见 `.env.example`。模型配置不完整时保持关闭并输出安全错误；只有控制台逐个或批量确认 Free Quota Only 后才能设置确认开关。

当前表按主体、会话、档案、工作区版本、路径、计划、计划归属、成长记录与回执拆分。里程碑和证明快照暂随对象 JSONB 内容存储；工作区仍是并发版本边界。`/api/v1/paths`、`/api/v1/plans` 已提供对象读写，连接服务器工作区后网页通过连接层调用对象接口，默认仍在本地保存。

## Cloudflare 目标后端

访客明细管理密钥使用 `VISITOR_STATS_ADMIN_KEY` Worker Secret；不放入 Pages、源码或已提交配置，本地需要时可写入被忽略的 `.dev.vars`。

`cloudflare/` 与 `wrangler.example.jsonc` 是 Workers + D1 免费方案的独立迁移入口，保留现有 Node + PostgreSQL 实现。目前覆盖匿名会话、档案/工作区一致读取与写入、导出删除、规则整理及默认关闭的百炼多模型网关。公开模式要求两项边缘限流绑定；模型的全局每日调用名额、个人小时上限和在途锁保存在 D1，不依赖单个 Worker 实例。迁移、HTTP、并发、失败回滚和模拟模型专项见 [发布保护验证](docs/reports/cloudflare-release-guards.md)。Pages 同源适配器、可选 API 打包与真实本地服务绑定联调已完成，见 [同源接入验证](docs/reports/pages-api-integration.md)；隔离 D1/Pages 已部署并通过远程检查，见 [预发布验证](docs/reports/cloudflare-staging-release.md)；账号和备份恢复仍待完成。

Worker 的 `MOAT_MODEL_ENABLED` 默认关闭，启用还要求 `MOAT_PUBLIC_API_ENABLED=true`、D1、两项限流绑定及完整百炼 Free-only 配置。`ALIYUN_MODEL_DAILY_CALL_LIMIT` 在 Worker 中是所有实际供应商尝试（含切换模型）的 UTC 日上限，默认 100；`MOAT_MODEL_CALLS_PER_HOUR` 是每主体 UTC 整点小时上限，默认 6。失败和取消不退还已占名额。根 `.env` 只用于 Node；Worker 本地保留独立 `.dev.vars`，线上密钥只放 Secrets。详细配置及费用边界见 [Cloudflare 后端说明](cloudflare/README.md)。代码确认开关不能代替阿里云控制台每个模型已生效的 Free Quota Only。

### Pages 打包与隔离预发布准备

`npm run build:pages` 保留纯静态产物；`npm run build:pages -- --with-api` 才加入 `_worker.js` 和 `_routes.json`，通过 `MOAT_API` 服务绑定转发同源 `/api`、`/api/*`。两者均先运行全量测试和静态检查，在系统临时目录输出独立 `moat-pages-*` 文件夹，不部署、不覆盖仓库。上传时只选命令输出目录，不能上传项目根目录。

API 版页面没有数据库或百炼 Key，只绑定后端 Worker。从 `wrangler.pages.example.jsonc` 准备 Pages 配置，填入本次输出的绝对路径；示例仅面向隔离的 `moat-staging` Pages 与 `moat-api-staging` Worker。后端示例的 `env.staging` 使用独立 D1 占位符、独立限流桶、关闭模型及 Worker 公共地址，不继承生产数据库。Preview 不得绑定生产 API。远程建库、迁移、绑定及部署需要先确认账号和目标；准备顺序、失败关闭与回退边界见 [Cloudflare 预发布准备](cloudflare/README.md#隔离预发布准备)。

Pages CLI 不支持 `--config wrangler.pages.jsonc`。部署时将 Pages 配置另存为独立临时部署目录中的 `wrangler.jsonc`，该目录与打包产物分开，避免上传配置或误读根目录后端配置：

```sh
npx wrangler pages deploy /绝对路径/moat-pages-产物 --project-name moat-staging --branch main --cwd /绝对路径/独立部署目录
```

当前隔离预发布入口：[moat-staging.pages.dev](https://moat-staging.pages.dev/)。服务端保存需要在「数据与同步」中显式连接；站点与生产演示的浏览器存储互相隔离。隔离站点使用百炼新加坡标准端点接入 Free-only 云端辅助：探索补充页勾选本轮同意后才调用；全站每日最多 20 次供应商尝试、每主体每小时 6 次。尚无账号或跨设备恢复。首轮规则版证据见 [预发布验证](docs/reports/cloudflare-staging-release.md)，当前 AI 与计划入口结果及 HTTP/2 验证限制见 [后续修复](docs/reports/staging-ai-plan-entry.md)。

## 页面入口

| URL | 页面 |
|---|---|
| `/?view=sync` | 数据与同步：预览后显式连接或复制、重试、切回本地 |
| `/` | 独立封面；复用三河地形但不读取个人档案或工作区，记录一次匿名粗粒度访问 |
| `/?view=river` | 我的河；无数据时显示基础三河与探索入口，只读取当前主体已确认内容 |
| `/?demo=1` | 隐藏调试用合成地图案例，不在正式界面提供入口 |
| `/?view=explore` | 探索、逐条确认、聚焦结果与自主本地保存 |
| `/?view=paths` | 按河流组织未来路径、编辑与比较 |
| `/?view=plans` | 路径下的护城河计划和里程碑 |
| `/?view=growth` | 成长记录、成果快照确认、更新和撤回 |
| `/?view=visitors` | 访客地图管理页；输入管理密钥后读取近 30 天明细 |

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
| `npm run check:cloudflare-release` | 自动打包 Worker、创建隔离 D1、应用迁移、执行 HTTP 生命周期、并发/回滚、模拟模型限额、前端协议及运行时重启检查，最后关闭服务并删除合成测试库 | 已安装锁文件中的 Wrangler 工具链；需允许本机端口；不读 `.env` 或本地 Wrangler 配置、不调用真实模型、不访问云端 |
| `npm run check:cloudflare-local -- http://127.0.0.1:8788` | 已运行本地 D1 的 HTTP 生命周期、幂等与 revision 并发检查 | 手动准备 `.dev.vars`、迁移并启动 Wrangler；脚本强制只接受回环地址，会写入合成数据；优先使用上面的自动隔离检查 |
| `npm run build:pages` / `npm run build:pages -- --with-api` | 全量测试与静态检查后生成纯静态 / 同源 API 产物 | 不部署；后者需要 Pages `MOAT_API` 服务绑定才能连接服务器 |
| `npm run check:pages-api` | 两个真实本地 Worker + D1 + 服务绑定，静态模块、只读发布检查、数据生命周期、前端连接重试、来源和 Cookie、API 限流后静态可用 | 需要本机端口；自动清理自建临时产物和数据库，不读取真实配置、不开模型 |
| `node scripts/check-pages.mjs https://目标站点 --require-api` | 只读核对页面、模块与素材，同源 JSON API、D1 能力声明、模型关闭、匿名隔离和未知路由；不跟随重定向 | 首轮规则/手工预发布检查，要求模型关闭；AI 已启用的站点仅运行静态检查并单独核对模型能力及真实通道。不建会话、不写数据、不调用模型；不证明数据库写入、浏览器交互或 Free 套餐已验收。不加标志则仅查静态站点 |

DOM 检查需要单独可用的 jsdom，未列入生产依赖；先核实实际路径，不假设历史报告中的临时目录仍存在：

```sh
node scripts/workspace-dom-check.mjs /path/to/jsdom/lib/api.js
node scripts/stage11-dom-check.mjs /path/to/jsdom/lib/api.js
node scripts/scaffold-dom-check.mjs /path/to/jsdom/lib/api.js
node scripts/manual-exploration-dom-check.mjs /path/to/jsdom/lib/api.js
```

DOM 和 HTTP 检查不验证真实浏览器布局、触控或视觉；需要时另做浏览器走查。按改动选择证据见工程规范；纯文档修改只核对现状、规则、路径、链接及差异，不生成资产或重跑无关测试。

无 AI 本地闭环可用外置 Playwright 和 Chromium 做真实浏览器回归；先运行 `npm start`，再执行：

```sh
node scripts/browser-flow-check.mjs /path/to/playwright/index.mjs /path/to/chrome http://127.0.0.1:4173
```

脚本覆盖 1440px 桌面与 390px 触控模拟视口、键盘进入手工整理、确认保存、路径、计划、里程碑、成长、证明、刷新恢复和地图回看，并检查页面异常、意外 API 请求及横向溢出。浏览器必须具备所需系统运行库；触控模拟不等于实体设备验收。

探索档案的服务器连接需先以 PostgreSQL 模式启动应用，再运行：

```sh
node scripts/browser-profile-sync-check.mjs /path/to/playwright/index.mjs /path/to/chrome http://127.0.0.1:4173
```

该脚本在独立浏览器上下文中覆盖本地确认档案复制、服务端探索保存、刷新恢复、本地/服务器切换、地图投影、两标签陈旧提交保护、实际导出下载、二次确认删除、会话失效和本地副本恢复，并检查桌面和 390px 窄屏横向溢出。它会创建并删除匿名测试主体和合成记录，不应指向生产数据库。

云端辅助同意与回退使用拦截的模拟 V1 响应验证，不调用真实供应商：

```sh
node scripts/browser-model-consent-check.mjs /path/to/playwright/index.mjs /path/to/chrome http://127.0.0.1:4173
```

该脚本覆盖默认未同意时零模型请求、键盘聚焦、同意后 V1 调用、云端失败的显式本地规则回退，以及 1440px/390px 布局。运行服务时应关闭真实模型环境变量，脚本自身会拦截 `/api/v1`。

## API 与数据边界

开发态 V1 接口、错误、版本和幂等重试详见 [产品 API 与仓储契约](docs/PRODUCT_API.md)。旧 `GET /api/capabilities` 默认报告 `disabled`，`POST /api/analysis` 固定不接真实供应商。探索页面默认使用浏览器本地规则；只有 V1 报告 Free-only 模型可用且用户在本轮主动勾选外部处理同意时，才会调用 `/api/v1/analyses/model`。具体模型由后台路由，不提供用户选择。

长期内容默认依赖当前浏览器及站点来源；更换浏览器或端口不会自动带入旧数据。数据与同步页分别预览工作区和探索确认档案，明确确认后才切换或复制；原本地数据保留，两类数据不自动合并。探索档案连接只提交确认变更集，不上传本轮原始回答。内存模式拒绝连接；档案同步交互已通过 PostgreSQL 持久服务的桌面、窄屏和冲突恢复专项，实体触控与字体细节仍待验收。

本地存储没有严格同时多标签事务，未保存草稿也没有自动恢复。服务器连接操作要求 Web Locks，以保护跨标签缓存和待重试记录；能力缺失或申请锁失败时暂停连接、刷新、写入、重试和切换，保留已有缓存可读。纯本地工作区读写继续可用。PostgreSQL 模式已有持久匿名会话（30 天服务端有效期）与工作区；服务端已提供当前会话退出 API（保留数据，尚无页面入口）；注册身份、会话续期/回收、完整个人数据导出删除、备份恢复和跨设备同步尚未实现；后续边界见 [后端架构](docs/BACKEND_ARCHITECTURE.md)。数据与同步页已提供当前连接主体的服务端导出与二次确认删除入口；范围不包含原始浏览器工作区、探索档案、下载文件和备份。删除响应不明时暂停同步，可单独确认清理本机服务器缓存，清理不代表服务端删除已确认。真实 PostgreSQL 生命周期专项已通过，见 [验证报告](docs/reports/postgres-lifecycle.md)；浏览器下载和删除交互仍待专项验收。密钥不放浏览器；真实模型只在服务端 Free-only 关闭式配置与用户本轮同意同时成立时调用，生产边缘限流和线上开放仍待完成。

## 文档与资产入口

工程结构与规则 → [ENGINEERING_STRUCTURE](docs/ENGINEERING_STRUCTURE.md)；产品定义 → [PRD](PRD.md)；当前阶段和后续任务 → [milestones](milestones.md)；专题与历史证据 → [文档导航](docs/README.md)。

地图源代码、派生 SVG、河面纹理和字体的关系只在 [资产索引](assets/README.md) 维护。地图河宽、支流形状和雾分布仍是构图，没有个人资本强度计算。
