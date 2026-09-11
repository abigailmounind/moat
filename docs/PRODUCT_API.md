# 产品 API 与仓储契约 V1

- 用途：开发态匿名会话、聚合与路径/计划对象写入、幂等重试和内存/PostgreSQL 仓储契约。
- 更新：2026-09-11。架构与数据处理边界见 [后端架构](BACKEND_ARCHITECTURE.md)，归属规则见 [工作区规范](STAGE11_WORKSPACES.md)，模块职责见 [工程规范](ENGINEERING_STRUCTURE.md)。

## 当前接口

仅覆盖 `/api/v1/`。响应为 JSON，带 `Cache-Control: no-store`、`X-Content-Type-Options: nosniff`；错误格式为 `{error:{code,message,retryable}}`，不返回存储异常、用户正文或堆栈。旧分析接口和静态文件保留原格式。

| 接口 | 成功响应 | 条件 |
|---|---|---|
| GET /api/v1/health | {status:"ok",apiVersion:"1"} | 支持 HEAD；表示 HTTP 可响应，不持续探测数据库 |
| GET /api/v1/capabilities | 持久化、幂等、对象资源、身份、分析模式 | 按实际仓储报告 memory/false 或 postgres/true；模型默认关闭 |
| POST /api/v1/session | {session:{subject}} | 校验 Origin；创建为 201，已有会话为 200 |
| GET /api/v1/session | {session:{subject}} | 有效服务端会话 |
| GET /api/v1/bootstrap | {apiVersion,subject,data:{profile,workspace}} | 从会话决定主体 |
| GET /api/v1/workspace | {apiVersion,workspace} | 当前主体 |
| PUT /api/v1/workspace | {apiVersion,workspace} | 结构、版本、来源及可选幂等键 |
| GET /api/v1/paths、/plans | {apiVersion,revision,paths} 或 {apiVersion,revision,plans} | 当前主体 |
| GET /api/v1/paths/:id、/plans/:id | {apiVersion,revision,path} 或 {apiVersion,revision,plan} | 找不到或其他主体的对象均为 404 |
| POST /api/v1/paths、/plans | {apiVersion,workspace}，200 | 创建完整对象；必填幂等键 |
| PATCH /api/v1/paths/:id、/plans/:id | {apiVersion,workspace}，200 | 完整对象替换，非局部字段合并 |
| DELETE /api/v1/paths/:id、/plans/:id | {apiVersion,workspace}，200 | 请求体含 revision；事务处理关联影响 |

表中多个资源简写共用 `/api/v1` 前缀。能力枚举 rules/manual 不表示服务端分析接口已实现；bootstrap.profile 仍为空探索档案，暂无探索确认写入或迁移接口。页面默认本地保存；数据与同步页明确确认后可连接服务器工作区。探索档案仍独立保存在浏览器。

匿名 Cookie 使用 HttpOnly、SameSite=Lax、Path=/ 和 30 天浏览器有效期；直接 TLS 连接增加 Secure。内存会话随进程消失；PostgreSQL 保存令牌哈希及固定 30 天服务端有效期，过期后不可读取。尚无续期、回收任务、账号恢复或跨设备登录；代理部署仍待建设。

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
| 503 storage_unavailable / idempotency_capacity | 保留可靠数据和输入，稍后重试 |

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

check-product-http.mjs 使用独立内存临时服务检查全部浏览器模块。check-postgres.mjs 必须指定 MOAT_TEST_DATABASE_URL，在随机 schema 中验证真实迁移、跨连接并发、回滚、固定快照、到期、关系变更与 Node 重启恢复；见 [持久化首轮报告](reports/backend-persistence-v1.md)。

这些检查不等于数据库灾备、浏览器同步、跨设备登录或用户验收。
