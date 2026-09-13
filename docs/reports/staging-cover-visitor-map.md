# 隔离预发布封面与访客地图验证

- 日期：2026-09-13
- 范围：`moat-staging` Pages、`moat-api-staging` Worker、`moat-staging` D1
- 生产边界：未修改或发布 `themoat`

## 结果

根网址现加载独立“人生护城河”封面，复用基础地形与三河图层；封面模块没有导入档案、工作区或个人地图连接。`/?view=river` 承载个人地图，新空主体为零证明、零路径、零计划。品牌统一返回 `/` 且不承担导航选中状态，探索与成长页面的发布文案和“返回我的河”路由已同步。

访客事件写入独立 `visitor_events` 表，只包含访问时间、国家代码、地区、城市和合法范围内四舍五入至 0.1 度的坐标。写入不创建产品会话，不保存 IP、Cookie 或主体标识，并在写入时删除 30 天前事件。私有读取要求 `VISITOR_STATS_ADMIN_KEY`，返回近 30 天总数及最多 500 条明细；密钥已生成并仅上传为 Worker Secret。

## 验证证据

- `npm test`：32 个测试文件通过，新增根路由、无个人数据依赖、品牌状态、空个人地图以及访客来源/隐私/坐标/保留期/密钥测试。
- `npm run check`：40 个浏览器、共享与 Cloudflare 模块语法及入口保护通过。
- `npm run check:cloudflare-release`：真实本地 D1 迁移、事务、重启、额度和前端协议通过；无真实供应商请求。
- `npm run check:pages-api`：真实本地 Pages Service Binding、D1、CSRF、Cookie、匿名隔离和限流通过。
- 四组 jsdom 检查通过；旧脚本的异步保存等待与新路由断言已更新。DOM 证据不等于视觉验收。
- 远程静态检查通过 7 个路由、35 个模块、5 个资源；`health` 返回正常，能力保持 `model: configured` 与 `freeOnly: true`，无密钥管理读取返回 401。
- 远程 `0003_visitor_stats.sql` 仅应用到 `moat-staging`；合成 POST 返回 201，随后只读计数为 1。该记录不含主体或 IP，按 30 天规则自动清理。

## 部署标识与限制

- Worker Version ID：`004284eb-069b-44bc-b0d8-be33e9c996b2`
- Pages 最新封面部署 ID：`b6ffd58c-2553-4b63-882b-c0a6b769ed50`
- Pages 最新封面部署 URL：`https://b6ffd58c.moat-staging.pages.dev`

当前执行环境没有可用 Chromium，Playwright 的完整浏览器与较小 headless shell 均因 CDN 连接反复中断而下载失败。因此本轮未形成新的 1440px、390px、键盘和减少动态效果真实浏览器视觉证据；已完成 DOM、真实 HTTP、远程静态与 API 验证，不能将其描述为浏览器视觉验收。访客世界地图仍是简化代码 SVG，等待真实浏览器和用户视觉验收。
