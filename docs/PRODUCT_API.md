# 产品 API 与仓储契约 V1

- 用途：开发态匿名会话、规则/可选模型分析、确认档案与工作区写入、幂等重试和内存/PostgreSQL 仓储契约。
- 更新：2026-09-12。架构与数据处理边界见 [后端架构](BACKEND_ARCHITECTURE.md)，归属规则见 [工作区规范](STAGE11_WORKSPACES.md)，模块职责见 [工程规范](ENGINEERING_STRUCTURE.md)。

## 当前接口

仅覆盖 `/api/v1/`。响应为 JSON，带 `Cache-Control: no-store`、`X-Content-Type-Options: nosniff`；错误格式为 `{error:{code,message,retryable}}`，不返回存储异常、用户正文或堆栈。旧分析接口和静态文件保留原格式。

| 接口 | 成功响应 | 条件 |
|---|---|---|
| GET /api/v1/health | {status:"ok",apiVersion:"1"} | 支持 HEAD；表示 HTTP 可响应，不持续探测数据库 |
| GET /api/v1/capabilities | 持久化、幂等、对象资源、身份、分析模式 | 按实际仓储报告 memory/false 或 postgres/true；模型默认关闭 |
| POST /api/v1/visits | {apiVersion:"1",recorded:true} | Worker 同源请求；不创建会话，只保存时间、国家代码、地区、城市和 0.1 度坐标，写入时删除 30 天前记录 |
| GET /api/v1/admin/visits | {apiVersion,retentionDays,total,returned,limit,visits} | Worker 私有管理接口；要求 `Authorization: Bearer <VISITOR_STATS_ADMIN_KEY>`，总数覆盖近 30 天，明细最多 500 条 |
| POST /api/v1/session | {session:{subject}} | 校验 Origin；创建为 201，已有会话为 200 |
| DELETE /api/v1/session | {apiVersion:"1",signedOut:true,scope:"current_session"} | 同源；撤销当前令牌，成功后清 Cookie；重复退出可重试 |
| GET /api/v1/session | {session:{subject}} | 有效服务端会话 |
| GET /api/v1/bootstrap | {apiVersion,subject,data:{profile,profileRevision,workspace}} | 从会话决定主体 |
| POST /api/v1/analyses/rules | {apiVersion,analysis:{mode:"rules",ruleVersion,proposal}} | 有效会话；只处理本次提交的探索输入，不保存原始回答或候选 |
| POST /api/v1/analyses/model | model 候选；失败时为显式标记 fallbackFrom/fallbackReason 的 rules 候选 | 有效会话、同源 JSON、模型通道完整启用；后台选择模型，不返回具体模型名 |
| GET /api/v1/profile | {apiVersion,profile,revision} | 当前主体的确认档案与档案版本 |
| POST /api/v1/profile/change-sets | {apiVersion,profile,revision,duplicate} | 同源 JSON、档案 revision、确认变更集和必填幂等键 |
| GET /api/v1/workspace | {apiVersion,workspace} | 当前主体 |
| PUT /api/v1/workspace | {apiVersion,workspace} | 结构、版本、来源及可选幂等键 |
| GET /api/v1/paths、/plans | {apiVersion,revision,paths} 或 {apiVersion,revision,plans} | 当前主体 |
| GET /api/v1/paths/:id、/plans/:id | {apiVersion,revision,path} 或 {apiVersion,revision,plan} | 找不到或其他主体的对象均为 404 |
| POST /api/v1/paths、/plans | {apiVersion,workspace}，200 | 创建完整对象；必填幂等键 |
| PATCH /api/v1/paths/:id、/plans/:id | {apiVersion,workspace}，200 | 完整对象替换，非局部字段合并 |
| DELETE /api/v1/paths/:id、/plans/:id | {apiVersion,workspace}，200 | 请求体含 revision；事务处理关联影响 |

表中多个资源简写共用 `/api/v1` 前缀。页面默认使用浏览器本地规则和本地档案；仅当能力接口确认 Free-only 后台可用，且用户在本轮主动同意阿里云百炼新加坡处理时，页面才建立匿名会话并调用模型接口。该同意不持久化，刷新后恢复关闭。分析不会自动把候选变成确认内容，档案写入只接受逐条确认生成的变更集。

当前接口表以 Node + 内存/PostgreSQL 参考实现为完整口径。Cloudflare Worker 入口支持 health、capabilities、session，profile/workspace/bootstrap 读取，profile/change-sets、paths、plans、growth-records、proof、imports/workspace 写入，data/export、data 删除，以及 analyses/rules 和默认关闭的 analyses/model；账号及聚合写入仍未开放。读取复核存储 JSON 与 revision，异常返回 503 `stored_data_invalid`；bootstrap/导出的两张表位于同一 D1 batch。

Worker 写入在同一 batch 内清理过期回执、条件占用共享幂等键（每主体最多 100 条）、凭请求所有权条件更新文档并读取首次响应。相同内容并发重试返回同一响应及 `Idempotency-Replayed: true`；同键不同内容返回 409；任一 SQL 失败回滚数据和回执。原 24 小时有效期与 revision 语义不变。主体删除按工作区 revision 条件执行并级联清理数据、回执、个人模型计数与在途锁；全局无个人标识的日计数保留。

Worker 两个分析端点要求会话、同源、JSON 和有效 session，实际流式请求体上限为 64 KiB；只输出待确认候选，不写入档案。公开模式下缺少可信 IP 或限流绑定、绑定故障返回 503 `rate_limit_unavailable`；桶拒绝返回 429 `rate_limited`，均带 `Retry-After` 且发生在 D1 访问之前。模型未完整配置返回 503 `model_disabled`；同主体在途/小时超限分别返回 429 `model_in_progress` / `model_rate_limited`。D1 原子预占所有供应商尝试的 UTC 日名额（含多模型切换），耗尽后以 `fallbackReason: daily_limit` 返回规则候选。小时窗口按 UTC 整点，取消或失败不退还已占名额；在途锁有超时并按所有者释放。D1 故障不允许无计数调用供应商。边缘桶仅用于请求保护，非全局精确计费；本地专项不等于生产费用或模型质量验收。

Pages API 产物通过 `MOAT_API` 服务绑定保留原同源请求。Pages 层不创建身份、不持有数据库/模型 Key、不改写 Origin 或 Cookie。绑定故障、上游重定向或非 JSON 响应统一返回 503 `api_unavailable`、`retryable:true`、`Retry-After:60` 与 `Cache-Control:no-store`；其余后端 JSON 状态、回执、下载和 Cookie 头原样透传，不用静态首页掩盖失败。该路径已本地联调，远程配置和发布待确认。

匿名 Cookie 使用 HttpOnly、SameSite=Lax、Path=/ 和 30 天浏览器有效期；Node 直接 TLS 连接增加 Secure，Worker 始终设置 Secure。内存会话随进程消失；PostgreSQL/D1 保存令牌哈希及固定 30 天服务端有效期，过期后不可读取。尚无续期、回收任务、账号恢复或跨设备登录。

## 当前会话退出

`DELETE /api/v1/session` 校验 Origin，按 Cookie 撤销当前令牌，等待仓储成功后清 Cookie。无令牌、未知令牌和已撤销令牌也返回成功，便于响应丢失后重试；跨源请求返回 403。存储失败返回 503 并保留 Cookie，不伪报成功。

退出保留主体、工作区、探索档案和幂等回执，不等于删除数据或账号注销。其他会话不受影响；随后使用旧令牌发起的受保护请求返回 401。已通过会话检查的在途请求可能完成，退出不声称撤销已经接受的提交。浏览器服务器缓存和待提交记录尚未接入退出流程；当前没有页面退出入口，匿名主体也没有账号恢复方式。

## 路径与计划对象命令

创建请求体为 `{revision,path}` 或 `{revision,plan}`；更新同样提交完整对象，ID 必须与地址一致。删除为 `{revision}`。所有写操作校验有效会话、Origin、application/json，要求 `Idempotency-Key`；请求体最多 256 KiB。

`revision` 是工作区版本。主对象、关联影响和成功回执共用一个原子提交，尚未拆成每对象版本。客户端不能指定主体或用查询参数扩大权限。

- 创建重复 ID 或同来源方向路径返回 409；非法对象、新多路径计划、无路径或河流不一致返回 422。
- 旧同河多路径计划可保留原关联编辑；旧待归属计划须明确选择路径后保存。
- 移河更新可继承归属的计划；删除路径保留计划与里程碑并解除归属。
- 删除计划或移除里程碑解除成长记录活动关系，保留历史名称、分组上下文和已确认证明快照。
- 这些规则在仓储原子边界内通过共享操作层执行；客户端只处理确认与显示，不能绕过服务端校验。

对象成功响应返回完整工作区及 Idempotency-Replayed。能力 `objectWrites` 报告 resources 为 paths/plans/growth-records、revisionScope 为 workspace、idempotencyRequired 为 true。

## 成长、证明确认与空工作区导入

- `/api/v1/growth-records` 支持 GET/POST，`/:id` 支持 GET/PATCH/DELETE；集合返回 `{apiVersion,revision,growth}`，单条返回 `{apiVersion,revision,record}`。创建/完整更新请求为 `{revision,record}`。
- 普通成长编辑保留已确认的旧 proof；禁止通过普通编辑引入、更换或撤回快照。历史名称及上下文由服务端维护。
- `POST /api/v1/growth-records/:id/proof` 请求 `{revision,confirmed:true,selection:{capital?,river?,explanation?}}`。selection 必须是对象；行动与成果必填，指定资本或河流时解释必填。成功生成自述快照，不增加资本分值。
- `DELETE /api/v1/growth-records/:id/proof` 请求 `{revision}`，撤回快照，保留成长记录。
- `POST /api/v1/imports/workspace` 请求 `{revision,workspace,confirmed:true}`；仅目标 revision 为 0 且没有路径、计划、成长记录时允许复制，保留旧数据兼容，不自动修正归属。原浏览器内容不删除；不导入探索档案。
- 上述写操作都要求会话、同源 JSON 和幂等键，成功返回 `{apiVersion,workspace}`。未确认/无效快照返回 422 confirmation_required/invalid_proof，非法导入返回 422 invalid_import，非空目标返回 409 import_requires_empty。重放、版本及主体隔离沿用对象命令规则。

## 服务端规则分析与确认档案

- `POST /api/v1/analyses/rules` 请求体为 `{session}`。`session` 保留本轮 `id`、`flowVersion` 和回答数组；至少需要经历、行动、成果三类输入，q6 方法和 q7 河流依据可省略或跳过。服务器复用 `shared/rules-analysis.js` 与 `shared/understanding.js`，输出仍是 `contract_version: "0.1"` 的待确认候选；缺少必要输入返回 422 `invalid_analysis_input`。接口不接收主体 ID，不读取工作区或现有档案，也不记录原始输入日志。
- `POST /api/v1/analyses/model` 接受相同 `{session}`，只把校验后的允许字段发送给服务端配置的百炼新加坡模型。路由顺序由后台白名单决定；免费额度 403 会熔断该进程中的对应模型并尝试下一项，429 可尝试下一项，其他错误不跨模型重试以避免重复消耗。成功返回 `mode:"model"`、固定供应商标识和 `routing:"server_managed"`，不暴露模型名。
- 模型超时、额度全部耗尽、限流、无效输出或供应商失败时，以 200 返回确定性规则候选，同时明确 `mode:"rules"`、`fallbackFrom:"model"` 和安全的 `fallbackReason`。模型未配置则返回 503 `model_disabled`。所有模型输出都经过同一候选契约检查，不写档案、不保存原始回答。完整调用默认超时 75 秒，可在 1–120 秒内配置；客户端中止不保证供应商停止生成，因此不能用短超时替代额度保护。
- 同一服务端会话同时只允许一个模型请求；第二个在途请求返回 429 `model_in_progress`。每会话进程内默认每小时最多 6 次，达到后返回 429 `model_rate_limited` 和 `Retry-After`。该保护防止连点和普通重试消耗额度，但重启会清零，匿名用户也可新建会话，因此正式公开仍需边缘/IP 级限流。
- `GET /api/v1/profile` 返回 `{profile,revision}`。新匿名主体从 revision 0 和空档案开始；档案 revision 独立于工作区 revision。
- `POST /api/v1/profile/change-sets` 请求体为 `{revision,changeSet}`，要求 `Idempotency-Key`。仓储在主体写入边界内校验变更集、删除本轮 scope 中的旧条目、写入确认内容并递增档案 revision；重复键重放原响应，重复的同一变更集不会再次递增版本。陈旧版本返回 409 `revision_conflict` 并带当前档案；非法变更集返回 422 `invalid_profile_change`。
- 档案回执与工作区回执共用主体的幂等容量和键命名空间；PostgreSQL 通过 `002_profile_writes.sql` 添加档案版本和独立回执表，事务中先锁工作区再锁档案，删除主体会级联清理。

## 聚合工作区提交

PUT 请求体为 `{revision,workspace}`，revision 与 workspace.revision 必须一致，且为非负安全整数；达到安全整数上限时拒绝继续增加。成功 revision 加一。结构校验复用 shared/，保留旧独立、多路径计划及成长快照的可读取性。

聚合 PUT 未覆盖完整操作规则。服务默认在 durable 仓储禁用，返回 405 aggregate_write_disabled；内存开发模式保留兼容，可通过服务参数 allowAggregateWrites 显式控制。页面使用对象接口和空工作区导入，不通过聚合 PUT 绕过确认。

聚合 Idempotency-Key 可选；不带键保持原兼容行为，仅受版本检查保护。内存和 PostgreSQL 适配器都支持此行为。

## 幂等与并发

- 幂等键为 1–128 位 ASCII 字母、数字或 . _ : -，不包含个人信息。每次新的逻辑提交使用新键。
- 作用域是当前主体的所有工作区写入口；跨主体可复用相同键。创建、更新、删除和聚合 PUT 之间不能复用已占用的键。
- 聚合指纹对 `{revision,workspace}` 的规范 JSON 做 SHA-256；对象指纹额外包含操作类型、资源、标识及内容。属性顺序不影响指纹，数组顺序和字段值参与比较。
- 同键同内容重放首次成功响应与原版本，Idempotency-Replayed 为 true；首次提交为 false。即使对象后来被更新或删除，也不再次执行。
- 同键不同内容返回 409 idempotency_conflict。已提交却丢失响应时，用原键和原内容重试。
- 基础版本过期返回 409 revision_conflict，并带当前 workspace。客户端保留草稿，读取并核对差异，不盲目替换版本后覆盖。
- 校验、版本检查或事务提交前的存储失败不占用键。数据与回执同事务写入，避免发生数据成功却无法识别重试。
- 重放是历史响应，收到后应再 GET 最新状态，不能用旧回执覆盖更新的缓存。
- 客户端保留待提交请求和原幂等键，直到提交及最新状态缓存都完成。只有写请求的明确拒绝可移入失败草稿；会话检查、提交后读取或缓存失败均不能据此认定写入失败并清掉重试记录。

回执保留 24 小时，每主体默认最多 100 个未过期键。满额返回 503 idempotency_capacity；不提前淘汰仍有效的回执。过期回执在该主体下一次带键写入时清理，同键过期后仍须通过版本检查。

内存模式重启同时丢失会话、数据和回执；PostgreSQL 模式可在 Node 重启后恢复。完整数据保留、备份删除及回收任务仍待实现。

## 错误与客户端行为

| 状态 / 代码 | 客户端处理 |
|---|---|
| 400 invalid_json / invalid_idempotency_key | 修正请求，保留输入 |
| 401 session_required | 建立有效会话，不自动把本地数据迁入新主体 |
| 403 origin_rejected | 检查同域配置 |
| 404 subject_not_found / not_found | 核对会话或对象，不显示保存成功 |
| 405 method_not_allowed / 415 unsupported_media_type | 使用支持的方法及 application/json |
| 413 body_too_large / 422 invalid_workspace / invalid_item | 修正内容、归属与版本后重试 |
| 409 revision_conflict | 保留草稿，对照当前版本；retryable 不表示允许直接覆盖 |
| 409 already_exists / source_direction_conflict | 核对已有路径或计划，保留其编辑 |
| 409 idempotency_conflict | 新内容改用新键；retryable 为 false |
| 429 model_in_progress / model_rate_limited | 不重复提交；按 Retry-After 等待，规则与手工模式仍可用 |
| 503 storage_unavailable / idempotency_capacity / free_tier_exhausted | 保留可靠数据和输入，稍后重试；免费额度用尽时不切换付费资源 |
| 503 stored_data_invalid | 停止覆盖服务器内容，保留本地可靠副本并进入恢复流程 |

## 当前主体的服务端导出与删除

- `GET /api/v1/data/export`：有效会话下返回 `{format:"personal-moat-server-export",version:1,exportedAt,subject,data:{profile,workspace}}`，带 attachment 文件名与 no-store。复用 readBootstrap 的一致性快照；不包含会话令牌和幂等回执，也不包含浏览器独立探索档案或本地副本。
- `DELETE /api/v1/data`：同源 JSON 请求 `{confirmed:true,subjectId,revision}`（上限 4 KiB）。subjectId 必须与当前会话一致，仅用于确认校验，不作为授权身份；revision 必须等于当前工作区版本。成功为 `{apiVersion:"1",deleted:true,scope:"server_subject"}`，同时使 Cookie 到期。
- 缺少确认或主体不符为 422 deletion_confirmation_required；陈旧版本为 409 revision_conflict，要求重新核对；存储异常为 503，不报告成功。删除请求不创建主体，也不会自动迁移本地数据。
- 仓储同写操作共享工作区锁，删除当前主体、档案、工作区、路径/计划/成长、归属关系、所有会话及回执。PostgreSQL 使用事务与外键级联；内存采用同步边界。
- 删除不保留含个人工作区的幂等回执。成功后旧会话请求为 401；若响应丢失，401 只表示会话不可用，不能单凭它认定删除成功。浏览器副本、已下载导出文件、外部备份的删除另行处理。
- 数据与同步页已接入：先导出并显示范围，再次确认删除。连接层在发请求前持久化删除待核对标记；成功后清理服务器连接缓存，保留原始本地工作区。断线保留标记并阻止新连接操作；用户可独立确认清理缓存，该操作不确认或再次执行服务端删除。匿名主体删除不等同于尚未实现的账号注销。数据库备份保留/清理与恢复演练仍待实现。

## 仓储与持久化

createProductService({repository}) 等待所有仓储方法，兼容普通值或 Promise。未设置 DATABASE_URL 时使用 createMemoryProductRepository；设置后 product-runtime.mjs 创建连接池、校验迁移并选择 createPostgresProductRepository({pool})。配置失败停止启动，不降级为内存。连接配置及命令见根 README。

| 方法 / 属性 | 职责 |
|---|---|
| kind / durable / idempotency | 报告实际模式与回执策略 |
| createAnonymousSession() | 创建主体、空档案和工作区，返回 {token,subject} |
| revokeSession(token) | 撤销当前令牌；不存在时仍返回 ok；不删除主体或工作区 |
| findSession(token) | 返回 subject 或 null；令牌只在服务端映射主体 |
| readBootstrap(subjectId) | 返回 {profile,workspace} 或 null |
| deleteSubject(subjectId,revision) | 同一版本锁下移除主体及关联数据，返回 ok 或 subject_not_found/invalid_workspace/revision_conflict |
| readWorkspace(subjectId) | 返回隔离工作区快照或 null |
| writeWorkspace(subjectId,revision,workspace,{idempotencyKey}) | 聚合结构校验及替换；键可选 |
| mutateWorkspace(subjectId,revision,mutation,{idempotencyKey}) | mutation 为 {kind,action,itemId,item}；kind 为 paths/plans/growth，action 为 create/update/delete；另支持 growth 的 confirm-proof/revoke-proof 和 workspace 的 import；键必填 |

写入返回 `{ok:true,workspace,replayed}` 或 `{ok:false,code,workspace?}`。仓储自行复核版本、键及领域规则，不信任 HTTP 层传入的数据。请求、读取、响应与回执不能被调用方通过修改对象改变可靠存储。

PostgreSQL 写入先取得工作区行锁，再读回执、核对版本、变更关系、更新记录并保存回执。读取在同一连接的 REPEATABLE READ READ ONLY 事务中执行，避免多表混合版本。所有 SQL 使用参数，失败回滚并释放连接。

迁移包含主体、会话、档案、工作区版本、路径、计划、归属、成长记录与回执。对象正文用 JSONB 保留现有字段，里程碑、行动、证明快照尚未拆表。每次提交仍替换该主体工作区对象行，尚无每对象 revision 或局部 SQL 更新。迁移记录文件名与校验和，执行有数据库锁；启动只验证、不自动迁移。

## 验证入口

tests/product-repository.test.mjs、product-service.test.mjs 验证聚合、异步仓储、版本和回执；product-objects.test.mjs 验证对象接口、非法输入、归属变更、快照保留和失败重试。共享校验与浏览器兼容继续由 shared-domain 和工作区相关测试覆盖。

check-product-http.mjs 使用独立内存临时服务检查全部浏览器模块。check-postgres.mjs 必须指定 MOAT_TEST_DATABASE_URL，在随机 schema 中验证真实迁移、跨连接并发、回滚、固定快照、到期、关系变更与 Node 重启恢复；见 [持久化首轮报告](reports/backend-persistence-v1.md) 与 [生命周期验证](reports/postgres-lifecycle.md)。后者补齐六种操作在回执保存失败后的回滚与原键重试、删除失败回滚、写入/删除竞争，以及 HTTP 成长证明、导出删除跨重启检查。

这些检查不等于数据库灾备、浏览器同步、跨设备登录或用户验收。
