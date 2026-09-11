# Pages 成长记录修复与发布检查

日期：2026-09-11。

## 已发布

用户明确要求重新发布 Pages。使用已有 Cloudflare 登录核对项目后，向 `themoat` 的生产分支 `main` 上传通过检查的静态文件；部署成功地址为 https://b8773225.themoat.pages.dev，生产入口为 https://themoat.pages.dev/?view=growth。

成长页删除 workspace-model 的重复 readWorkspace 导入，保留 workspace-connection 的 readActiveWorkspace 别名。读取仍按照当前本地/服务器连接状态选择来源，保存仍经过连接层。UI、样式和文案未改。

这次通过 Wrangler 直接上传工作区产物，未提交或推送 Git。后续 Git 集成构建必须包含本地修复，否则可能重新部署旧代码。

## 工程完善

- `scripts/check.mjs` 递归解析全部前端与共享模块，已用原始重复导入错误验证失败拦截。
- `tests/growth-render.test.mjs` 实际导入成长页，验证本地与服务器缓存各自的内容选择。
- `scripts/build-pages.mjs` 先执行与 npm test 相同范围的测试及静态检查，再在独立临时目录生成 Pages 产物。包含根首页、frontend、shared 和当前运行所需地图与字体资产；不上传仓库根目录、后端、测试或历史材料。使用新目录，不清理用户已有目录。
- `scripts/check-pages.mjs` 检查线上七个页面入口，递归获取并解析动态页面与共享模块，核对 CSS、地图和字体资源 MIME。请求超时或检查失败返回非零状态。

根 README 按用户要求未修改。当前复用命令如下：

```sh
node scripts/build-pages.mjs
# 使用上一步实际输出的目录替换 <output-directory>
npx wrangler pages deploy <output-directory> --project-name themoat --branch main --commit-dirty=true
node scripts/check-pages.mjs https://themoat.pages.dev
```

每次部署仍需当前任务的发布授权；构建和只读检查可独立执行。

## 本轮证据与限制

- 构建前 22 个测试文件通过，30 个浏览器/共享模块语法检查通过。
- Cloudflare 返回 Deployment complete。
- 生产域名 HTTP 检查通过：7 个入口、29 个递归模块、5 个样式/地图/字体资源；成长页模块已通过语法解析。
- 新构建和线上检查脚本通过 Node 语法检查，git diff --check 通过。
- HTTP 与最小 DOM 替身回归不等于真实浏览器操作或视觉验收，本轮没有补记此类验收。

继续按 Pages + localStorage 稳定演示版。Workers/D1 适配、账号与跨设备仍未实施，现有 PostgreSQL 代码保留。后续优先进行完整浏览器核心流程走查及已记录的地图证明上下文修复。
