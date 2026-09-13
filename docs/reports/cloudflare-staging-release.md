# Cloudflare 隔离预发布验证

- 日期：2026-09-13。
- 授权：用户确认当前账号 Workers Free，沿用创建隔离 Pages/D1/Worker 的授权；模型关闭，不上传百炼 Key，不改 `themoat`。
- 结果：隔离 main 分支已部署，远程 HTTP、前端协议及桌面/窄屏浏览器档案生命周期通过。不是全面开放或用户体验验收。

## 部署结果

| 项目 | 结果 |
|---|---|
| 入口 | https://moat-staging.pages.dev/ |
| Pages | `moat-staging`，main；部署 `79a992b1-66d9-4484-b982-07969fcd43bd` |
| Worker | `moat-api-staging`；版本 `4c32a229-1681-430f-ba85-7d3970601b3a`；公共 workers.dev 和版本预览地址关闭 |
| D1 | 独立 `moat-staging`，WNAM；两版迁移成功，不含生产数据 |
| 绑定 | Pages production/preview 均指向 `moat-api-staging`；Worker 绑定隔离 D1 及 120/分钟 API、10/分钟会话限流桶 |
| 失败行为 | production/preview 均回读确认 `fail_open=false` |
| 模型 | `MOAT_MODEL_ENABLED=false`，远程能力接口确认 rules-only；无百炼 Secret 上传或真实模型调用 |
| 生产隔离 | `themoat` 部署仍为 `b8773225-60bb-4cb3-ace3-f5f5acacb314`，部署前后核对一致 |

Free 状态依据本轮用户确认；原 OAuth 订阅查询 403 的历史证据保留在 [前置核对](cloudflare-staging-preflight.md)。本轮没有升级套餐。项目 API 支持部署配置字段，参见 [Cloudflare Pages Projects API](https://developers.cloudflare.com/api/resources/pages/subresources/projects/)。实际回读作为本轮设置证据，不以文档描述替代运行结果。

## 验证证据

- `npm run build:pages -- --with-api`：31 个测试文件通过，38 个浏览器/共享模块语法检查通过，形成独立 API 产物；不把根目录、配置或密钥上传为资产。
- 上一衔接步骤重新运行 `npm run check:pages-api`，本地双 Worker/D1、服务绑定、静态资源和数据生命周期通过。
- 远程 `check-pages.mjs --require-api`：7 个页面入口、33 个解析模块、5 个资源通过；同源 JSON、D1 能力、模型关闭、匿名隔离与未知路由通过。
- 复用本地 D1 生命周期脚本的临时副本，地址固定为本次 staging：档案变更、幂等回放、版本竞争、路径/计划、工作区导入、成长、证明确认/撤回、导出、陈旧删除拒绝及删除后会话失效通过；两个合成主体最终删除。原脚本只允许回环地址的保护未放宽。
- 复用 `runPagesConnections` 夹具：显式工作区/档案连接、模拟提交后丢响应、原键重试、规则整理、导出与删除通过；不自动重试不明结果的写请求。
- `browser-profile-sync-check.mjs`：真实 Chromium 在 1440px 和 390px、减少动态效果、窄屏触控模拟下，走完本地确认档案复制、手工探索保存到服务器、刷新、地图读取、保存位置切换、两标签陈旧提交保护、实际下载、二次确认删除和本地恢复；无页面脚本异常或横向溢出。
- 首轮窄屏测试误报后残留的合成主体，以 ID、创建时间和合成证明标记共同限定清理；所有测试结束后 D1 主体计数为 0。

## 本轮问题与修正

1. Wrangler 登录刷新最初被沙箱阻止，批准联网后恢复；没有重新登录或输出 OAuth 凭证。
2. 当前 CLI 创建 Pages 默认尝试委派其他托管方式且网络失败；为保持已授权的 Pages 架构，使用直接 Pages 创建选项。项目创建成功后正常 Pages 部署，无托管迁移。
3. Pages CLI 不接受自定义配置文件路径。使用独立临时部署目录中的标准 `wrangler.jsonc`，与输出资产目录分开；根 README 已修正操作说明。
4. 上传和 Node HTTP 检查遇到连接中断。上传重试成功；远程 Node 检查通过临时独立连接适配完成，仅 GET 遇到网络错误可重试，写请求不自动重试。没有把这些环境问题改成产品成功反馈。
5. 浏览器并发用例原先把模块加载、读取与提交放在同一个异步回调中；远程加载可能使后一个标签读到已更新版本，两次正常提交均成功。修正为两标签先保留各自原始快照，全部就绪后提交，保留连接层来源标记；修正后桌面与窄屏均通过。产品运行代码未改变。
6. 临时 Playwright/Chromium 及缺失共享库仅用于验证；下载中断使用续传完成，运行库解压到临时目录，未加入项目依赖或安装到系统。

## 限制与下一步

- 本次部署并验证 staging 项目的 main 分支。Preview 绑定和 Fail closed 已设置，但未创建 Preview 部署验证。
- 预发布地址可公开访问，采用匿名身份和显式服务端连接；没有账号、跨设备恢复或额外访问门禁。
- 浏览器检查是交互与布局回归，没有完成实体触控、完整键盘专项、字体视觉或用户体验验收。
- 备份恢复、删除保留策略、真实模型质量及供应商 Free-only 条件仍待分别完成。此次没有模型调用、生产发布、用户数据迁移或正式试用招募。
- 产物形成、自动检查通过和隔离部署成功分别记录；不继承旧版本的用户验收。
