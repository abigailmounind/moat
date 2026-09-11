# 候选校验共享化验证

日期：2026-09-11。范围：候选校验模块抽取与调用收口。

## 实际改动

- 新增 shared/understanding.js，复用原运行时校验及 CLI 的 skippedTopics 检查。
- 前端保留 validateUnderstandingProposal 导出；分析服务直接引用 shared，解除前端规则和渲染依赖。
- CLI 保留错误数组接口，错误内容统一采用共享结果。候选 schema 和数据格式未修改，检查不等于完整 schema 验证或事实核实。
- 静态服务明确允许新模块；HTTP 检查优先验证该模块并保留完整依赖遍历。
- 增加非法候选、重复引用、已确认状态、敏感主题、跨入口一致性及输入不变回归。

## 本轮证据

- npm run check:stage10、npm run check 通过。
- npm test：17 个测试文件中 16 个通过；候选、分析服务等相关回归通过。workspace-render.test.mjs 的 river-tone-ability 断言失败；本轮未修改工作区页面及该测试。
- npm run check:api：沙箱内无法启动服务；获准在沙箱外运行后，新共享模块的 200 与 JavaScript 类型检查通过。随后遍历 frontend/src/main.js 的依赖时，frontend/src/sync.js 返回 404，完整 HTTP 检查未通过，后续 API 断言未执行。
- git diff --check 通过。

## 限制及下一步

工作区已有大量未提交工程变更，保留原状。本轮未修改视觉、数据库或页面保存方式，未执行浏览器视觉验收或数据库验证。先核对缺失 sync.js 与工作区选中态失败，再继续成长记录、证明确认独立接口等后端主线。
