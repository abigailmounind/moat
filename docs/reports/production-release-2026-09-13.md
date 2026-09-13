# 正式生产接入报告 · 2026-09-13

## 部署结果

按用户授权，正式 `themoat` Pages 已接入独立生产 `moat-api` Worker 与全新空 `moat-production` D1。0001–0003 迁移远程应用成功；未迁移隔离预发布用户数据。

- Pages：API 版产物部署成功，`MOAT_API → moat-api` 服务绑定生效。
- Worker：生产 D1、API/会话限流绑定生效。
- AI：已配置百炼 Key 并开启 Free-only 保护；能力接口公布 `model=configured`、`freeOnly=true`，仍受 D1 全局/主体限额和用户本轮同意闸门保护。
- 访客管理：随机密钥仅写入 `moat-api` Worker Secret `VISITOR_STATS_ADMIN_KEY`。

## 线上只读验证

- `GET https://themoat.pages.dev/`：200，HTML。
- `GET https://themoat.pages.dev/?view=explore`：200，HTML。
- `GET https://themoat.pages.dev/api/v1/capabilities`：200，JSON，报告 `persistence.mode=d1`、`durable=true`、匿名会话和规则模式。
- API 响应包含 `cache-control: no-store` 与 `x-content-type-options: nosniff`。

## 边界

当前可称为“正式匿名产品上线，AI 受控开放”。账号、跨设备恢复、备份演练和真实用户质量评测仍未完成；本次只读验证未主动发起真实模型请求。
