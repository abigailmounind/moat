# Cloudflare Workers + D1 后端

这是正式后端迁移的独立入口，保留 Node + PostgreSQL。当前包括匿名会话、确认档案、完整工作区对象、导入/导出/删除、规则整理及可选的百炼多模型网关。正式 `themoat` 已接入规则模式 Worker + D1；AI、账号与备份恢复仍未在生产开放。

## 配置与密钥隔离

本地可从根目录 `wrangler.example.jsonc` 准备被 Git 忽略的 `wrangler.jsonc`，并保留独立 `.dev.vars`（模板 `.dev.vars.example`）。没有此文件时 Wrangler 可能回退读取 Node 的根 `.env`。不要把实际 Key 写进 Wrangler 配置、源码、日志或 Pages 产物；线上仅使用 Worker Secrets。

D1 绑定名为 `DB`。迁移按顺序应用 `0001_foundation.sql`、`0002_release_guards.sql` 和 `0003_visitor_stats.sql`；第二版向既有回执增加所有者列及索引并新增模型计数/在途锁，第三版新增与个人主体分离的 30 天访客事件表，不重建或清空旧数据。不要修改已应用迁移来替代升级。示例数据库 ID 是占位符，创建数据库、远程迁移及部署前单独核对 Cloudflare 账号与目标。

配置及运行命令集中在 [根 README](../README.md#cloudflare-目标后端)。公开模式 `MOAT_PUBLIC_API_ENABLED=true` 要求 `API_RATE_LIMITER` 与 `SESSION_RATE_LIMITER` 绑定；示例分别为每 IP 摘要每分钟 120 次总请求、10 次会话建立请求。缺少绑定/IP 或限流异常时，在访问 D1 前返回 503；达到桶上限返回 429。只有本机/隔离验证可以不启用公开模式。该变量是保护模式选择，不是访问身份校验；不要在生产关闭它。

`MOAT_MODEL_ENABLED` 默认 false。只有公开保护、D1 与完整百炼 Free-only 配置均具备时，能力接口才公布后台模型可用。使用新加坡普通 Key 与后台模型白名单，支持标准及 workspace 专属端点；当前隔离环境因专属端点超时改用已验证的新加坡标准端点。用户不选择模型。前端仍需用户本轮明确同意，模型候选仍须逐条确认再保存。能力接口的 `freeOnly` 表示配置确认状态，不是实时控制台审计结果。

## 数据与并发边界

API 沿用 `/api/v1`。已实现 `pages-worker.mjs` 同源适配器，通过 `MOAT_API` 服务绑定把原 Pages URL、Origin、Cookie、IP、请求体和幂等键交给后端校验；不改写为 `workers.dev` 域名、不增加 CORS、不放宽 Cookie。后端 JSON 状态及下载/回执头原样传递；绑定缺失、异常、重定向或非 JSON 响应返回 503 `api_unavailable`，不回落到首页或跟随外部地址。

只有显式 API 打包才输出 Pages advanced-mode `_worker.js` 和 `_routes.json`，后者仅包含 `/api`、`/api/*`，其他页面与素材保持静态分发。默认打包仍为纯静态。实现采用 [Pages advanced mode](https://developers.cloudflare.com/pages/functions/advanced-mode/)、[服务绑定](https://developers.cloudflare.com/pages/functions/bindings/#service-bindings) 和 [Functions 路由规则](https://developers.cloudflare.com/pages/functions/routing/#functions-invocation-routes)；本地两个 workerd Worker 的实际服务绑定联调已通过，已在隔离 Pages main 分支部署并验证，见 [预发布验证](../docs/reports/cloudflare-staging-release.md)。

Cookie 始终为 Secure、HttpOnly、SameSite=Lax。受保护请求需要有效匿名会话。读取重新校验存储 JSON 和 revision，异常返回 503 `stored_data_invalid`；bootstrap 和导出使用同一 D1 batch 读取档案/工作区，避免混合快照。

档案和工作区写入在同一事务中清理过期回执、占用共享幂等键、凭所有权条件更新 revision、读取首次响应；任一语句失败回滚整体。相同内容并发重试只写一次；同键不同内容返回冲突。回执保存 24 小时、每主体最多 100 条，容量在事务内检查。领域操作继续复用 shared，聚合 PUT 始终关闭。

主体删除要求同源、明确确认、主体 ID 与当前工作区 revision，成功才清 Cookie。级联删除会话、档案、工作区、回执、个人模型计数和在途锁；全局日计数不关联个人、不随删除重置。导出不包含令牌、回执、限流数据或 Key。

## 模型保护

- 每个实际供应商尝试先用 D1 原子预占全局 UTC 日名额，包含额度耗尽后的后台模型切换；默认上限 100。不同实例及重启共享计数，耗尽直接回退规则。
- 每主体默认每 UTC 整点小时 6 次模型请求，并持有一把有期限的 D1 在途锁；相同主体并发返回 429。失败或取消不退还已占用名额；锁按所有者释放，异常退出后可在期限届满时恢复。
- 结构化整理关闭模型思考并限制 4096 输出 token；携带候选契约和同输入规则参考，输出仍需共享校验。出站使用 manual 重定向模式并拒绝 3xx，避免转发凭证。
- 默认完整请求超时 75 秒，配置允许 1000–120000 ms；超时、供应商失败或模型额度耗尽时返回带原因的规则候选。模型体积上限 64 KiB，只转发本轮允许字段，不发送已有档案或附带未知字段。
- 数据库失败不得无计数调用模型。计数只含时间窗口、次数及必要主体标识，超过两天的窗口在后续请求中清理；原始回答、提示词、IP、Key 不写入 D1 或产品分析日志。
- 供应商端点限定 HTTPS 新加坡白名单及精确路径，拒绝凭证、额外端口、参数、片段和重定向。单次分析可跳过额度耗尽模型；Worker 不持久保存各模型剩余额度或熔断状态，新请求可能再遇到同一模型的 403，仍占全局尝试名额。

## 免费方案边界

代码中的次数上限不是 token 余额，也不能验证供应商控制台是否真正开启保护。发布前必须核对白名单中每个模型的 Free Quota Only 已开启且已生效；只有控制台状态确认后才设置 `ALIYUN_FREE_ONLY_CONFIRMED=true`。官方说明该开关默认关闭、配置生效有延迟；未生效期间的调用仍可能产生费用。免费额度只覆盖适用新加坡普通实时推理，Token/Coding Plan 专用 Key 不使用这份额度。见 [阿里云免费额度说明](https://www.alibabacloud.com/help/en/model-studio/new-free-quota)。

Cloudflare 边缘限流按位置、最终一致，不能当作全局计费账本；本工程用 D1 原子计数另行限制模型尝试。见 [Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)。D1 batch 的事务与整体回滚语义见 [D1 Database](https://developers.cloudflare.com/d1/worker-api/d1-database/)。

Cloudflare 控制台必须保持 Free 套餐，代码不会自动升级或启用付费替代资源；但应用不能证明账号当前套餐。D1 免费行读/写或容量超限返回 503 `free_tier_exhausted`，失败保留本地输入。公开前还要核对目标账号实际免费限制、限流绑定可用性、CPU/请求用量、通知与预算；不能仅凭本地测试承诺零账单。

## 验证与发布剩余项

优先运行根 README 中的自动隔离发布检查：打包真实 Worker、创建临时 D1、迁移、HTTP 生命周期、事务故障注入、模型模拟、前端协议及运行时重启，结束后清理自建合成测试库。该命令不读 `.env`、不调用真实模型、不操作云端。详细证据见 [发布保护验证](../docs/reports/cloudflare-release-guards.md)；早期迁移证据保留在 [D1 本地验证](../docs/reports/cloudflare-d1-local.md)。

Pages API 专项进一步覆盖真实本地服务绑定、静态入口/模块/素材、既有前端连接层、丢响应重试、规则、导出删除、同源拒绝与实际边缘限流，见 [同源接入验证](../docs/reports/pages-api-integration.md)。隔离预发布与用户侧 Free 套餐确认已完成；下一步需要账号/跨设备、备份恢复和删除保留策略、日志隐私、真实模型质量及浏览器端到端走查。本地协议测试不代表真实浏览器或用户验收通过。

## 隔离预发布准备

用户已确认 Workers Free，隔离环境已创建并通过远程与桌面/窄屏浏览器检查，`themoat` 生产站点未变。首轮模型关闭的证据见 [预发布验证](../docs/reports/cloudflare-staging-release.md)。之后用户确认全部白名单模型的 Free Quota Only 已生效，隔离 Worker 接入 AI，每日上限收紧为 20 次供应商尝试；见 [AI 与计划入口修复](../docs/reports/staging-ai-plan-entry.md)。下列清单作为后续部署约束；Preview 分支仅配置绑定，尚未实际部署验收。命令入口集中在根 README。

1. 确认目标 Cloudflare 账号保持 Workers Free，核对 Pages Functions、D1、限流绑定实际限制与可用性；不升级套餐、不启用付费替代服务。示例资源名只是待建目标。
2. 使用独立 `moat-staging` D1，将 ID 仅填入被忽略的后端本地配置 `env.staging`。在该隔离库按顺序应用全部版本化迁移；不得使用生产 ID、真实用户数据或已有生产库作为验证目标。
3. 首轮部署隔离 `moat-api-staging` Worker 时保持模型关闭。启用 AI 前需另行确认供应商免费保护、数据用途及部署范围，本轮该条件已确认并使用 Worker Secret；`workers_dev` 与版本预览 URL 关闭，仅供 Pages 服务绑定访问。公开请求保护仍开启，两个限流桶与生产分离。
4. 单独准备 `moat-staging` Pages，API 产物绑定 `MOAT_API → moat-api-staging`。生产/Preview 配置都只指向隔离 Worker；现有 `themoat` 生产 Pages 不改。确认目标站点访问范围，再进行远程合成数据测试。
5. Pages 控制台 Runtime 选择 **Fail closed**，避免 Functions 免费额度耗尽后把 API 误当静态资源；只读 API 检查同时拒绝 HTML 伪成功。该设置可经 Pages 项目 API 设置，本轮已写入并回读 production/preview 的 `fail_open=false`，参考 [Pages 失败行为](https://developers.cloudflare.com/pages/functions/routing/#fail-open--closed)。
6. 发布后先运行只读 API 检查，再在隔离站点用浏览器走规则/手工、明确保存、刷新、冲突、导出删除及窄屏/键盘流程。只读健康/能力检查不执行数据库写入，不能代替这项验收。
7. 失败时停止扩大开放；回退页面到已知静态产物前先处理已有服务器连接状态，不删除 D1、不覆盖浏览器副本。模型故障继续回退规则；扩大开放前分别核对 Free-only 控制台状态和内容质量。

隔离预发布与正式生产均已完成 Pages → Worker → D1 部署；正式环境使用独立空库并完成全部版本化迁移，生产 AI 保持关闭，访客管理密钥仅作为 Worker Secret 保存。账号、备份恢复和真实用户质量评测仍是后续工作。
