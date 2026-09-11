# 项目文档导航与维护规则

- 更新于 2026-09-10；目录、职责与同步关系按本轮工程文档整理核对。
- 接手顺序：[协作规则](../AGENTS.md) → [PRD](../PRD.md) → [milestones](../milestones.md) → [工程结构与开发规范](ENGINEERING_STRUCTURE.md)，再按任务阅读专题。
- 本文维护文档定位与同步关系；命令只在 [项目 README](../README.md) 维护，阶段状态只在 milestones 维护。

## 文档职责

| 主文档 | 维护内容 | 引用它的文档不重复维护 |
|---|---|---|
| [AGENTS](../AGENTS.md) | 长期协作、授权、工作区保护与执行边界 | 不通过专题追加授权 |
| [PRD](../PRD.md) | 用户、产品语义、范围、数据原则 | 不维护模块清单、API 字段或完整进度 |
| [milestones](../milestones.md) | 当前阶段、用户验收范围、剩余工作与优先级 | 不在规范和报告另建最新进度表 |
| [根 README](../README.md) | 启动、配置、页面路由、检查命令与运行限制 | 工程规范引用命令入口 |
| [工程结构与开发规范](ENGINEERING_STRUCTURE.md) | 目录、模块、依赖例外、编码、数据修改和验证要求 | 各专题只解释本领域边界 |
| [后端架构](BACKEND_ARCHITECTURE.md) | 服务端目标、身份、持久化、迁移与 AI 双通道 | 已实现接口参数交给 API 契约 |
| [账号与匿名转账号规范](ACCOUNT_IDENTITY_SPEC.md) | OIDC 安全边界、主体映射、匿名迁移与供应商适配器待办 | 不代表已接入具体身份服务 |
| [产品 API](PRODUCT_API.md) | 当前 V1 HTTP、错误、版本、幂等与仓储契约 | 不把规划接口写成可调用接口 |
| [产品决策](PRODUCT_DECISIONS.md) | 已确认产品/设计决定、理由及修订依据 | 工程建议不升级为用户确认 |
| [设计上下文](DESIGN_CONTEXT.md) | 视觉方向、参考层级与布局原则 | 资产明细交给资产索引 |
| [交互规范](INTERACTION_SPEC.md) / [动效规范](MOTION_SPEC.md) | 触发、退出、焦点、状态协调 / 动画与降级 | 不另定数据归属或持久化规则 |
| [无 AI 规则规范](RULES_SPEC.md) | 规则依据、允许/禁止推断、依赖失效与固定内容案例；当前为规划基线 | 不把规划或格式校验当作实现和事实验收 |
| [探索规范](EXPLORATION_SPEC.md) | 候选、确认、映射、保存及隐私语义 | 页面顺序由最短流程维护 |
| [最短探索流程](STAGE10_MINIMUM_FLOW.md) | 当前页面、题目、继续条件与走查 | 不重复候选映射算法 |
| [工作区规范](STAGE11_WORKSPACES.md) | 路径、计划、里程碑、成长、快照及兼容操作语义 | 代码结构与 API 参数引用工程文档 |
| [资产索引](../assets/README.md) | 来源、用途、运行引用、源与派生关系 | 子目录保留具体许可证/素材说明 |
| `docs/reports/` | 某次实现或检查的证据、限制及日期 | 不代表现在再次测试或用户再次验收 |
| [历史归档](archive/README.md) | 历史阶段材料、原始上下文与迁移线索 | 不覆盖当前规范 |
| 本文 | 阅读导航、职责与同步矩阵 | 不承载产品或工程实现细则 |

## 按任务阅读

| 任务 | 主要文档 | 工程入口 |
|---|---|---|
| 接手、目录调整、模块拆分 | 工程规范、milestones | `frontend/`、`backend/`、`shared/`、`contracts/` |
| 启动或检查失败 | 根 README、工程规范 | `package.json`、`scripts/`、`backend/server.mjs` |
| 产品语义与新需求 | PRD、产品决策、对应专题 | 先区分明确决定与待验证建议 |
| 地图与页面视觉 | 设计上下文、资产索引、交互规范 | `frontend/src/map.js`、`styles.css`、`workspaces.css` |
| 河流摘要、证明与面板 | 交互规范、探索规范、工作区规范 | `frontend/src/app.js`、`state.js`、`personal-map.js` |
| 动画与减少动态效果 | 动效规范、工程规范 | `frontend/src/map.js`、`styles.css`、`app.js` |
| 探索、逐条确认、本地保存 | 探索规范、最短流程、工程规范 | `frontend/src/exploration-*.js`、`exploration.js`、`shared/profile.js`、`contracts/` |
| 路径、计划、成长与快照 | 工作区规范、工程规范 | `frontend/src/workspace-model.js`、`workspaces.js`、`growth.js`、`growth-proof.js`、`shared/` |
| API、幂等、仓储替换 | 产品 API、后端架构、工程规范 | `backend/product-service.mjs`、`product-repository.mjs`、`postgres-repository.mjs`、`tests/product-*.test.mjs` |
| 模型或规则服务化 | 探索规范、后端架构、工程规范的依赖例外 | `backend/analysis-service.mjs`、`frontend/src/exploration-analysis.js`、`analysis-client.js` |
| 账号、迁移与持久化 | 后端架构、产品 API、工作区规范、milestones | PostgreSQL 适配器、迁移与配置已形成；账号与用户迁移方案仍待落定 |
| 核对历史与验收 | milestones、下方验证证据、归档索引 | 按日期和范围阅读，保留当时结论 |

## 文档同步矩阵

先修改左列所指规则的主文档，再核对其余受影响文档；“核对”不要求每次机械改写全部文件。

| 变化 | 主文档 | 同步核对 |
|---|---|---|
| 目录、模块、依赖或兼容入口 | 工程规范 | 根 README、本文、相关专题路径；涉及工作状态再更新 milestones |
| 运行命令、环境变量、页面路由 | 根 README | 工程规范、本文、最短流程或工作区入口 |
| API 字段、错误、会话、版本、幂等、仓储 | 产品 API | 后端架构、工程规范、根 README、milestones |
| 候选契约、确认、保存或映射 | 探索规范 | 最短流程、工程规范、PRD 受影响语义、contracts 与校验实现 |
| 归属、旧数据兼容、删除或成果快照 | 工作区规范 | 交互规范、API、工程规范、PRD 受影响语义 |
| 视觉、交互、动效或资产 | 对应设计规范 / 资产索引 | 其他相关视觉规范、运行引用、milestones 验收范围 |
| 产品决定或需求范围 | 产品决策 / PRD | 相关专题、milestones；记录用户确认依据 |
| 实现或验收状态 | milestones | 链接对应报告；不修改旧报告的历史通过/未通过结论 |
| 新专题或废弃入口 | 本文 | 工程规范、AGENTS 职责索引及所有引用；保留历史来源 |
| 纯文档校正 | 对应主文档 | 相关引用、当前与历史边界、差异；不声称运行了无关测试 |

规范直接替换过期段落，详细过程进入报告。相对链接应能定位现文件；路径移动时检查 import、脚本、静态服务与文档，历史原路径则由归档迁移索引解释。

## 验证证据与历史入口

| 记录 | 对应范围 |
|---|---|
| [补充核对验证](reports/optional-evidence-check.md) | 具体方法、三河明确关系、全部跳过、旧会话兼容及浏览器回归 |
| [手工入口验证](reports/manual-exploration-entry.md) | 主动手工入口修复、确认和保存失败 DOM 回归、桌面与窄屏浏览器闭环 |
| [本地规则审查](reports/rules-audit.md) | 卡点推河、固定资本、无成果和删除依据后方向残留的源码与合成复现 |
| [会话退出基础](reports/session-revocation.md) | 当前令牌撤销、数据保留、失败处理与 PostgreSQL/HTTP 重启回归 |
| [PostgreSQL 生命周期验证](reports/postgres-lifecycle.md) | 真实 SQL 回滚、写入/删除竞争、成长证明与导出删除跨 Node 重启验证 |
| [证明上下文验证](reports/map-proof-context.md) | 跨河证明入口、未来方向、Escape 焦点与本地数据不变的 DOM 回归 |
| [Pages 成长页发布](reports/pages-growth-release.md) | 成长页重复导入修复、生产部署、静态打包与线上模块检查 |
| [跨保存位置保护](reports/workspace-source-guard.md) | 删除连接或切换位置后拒绝旧快照跨来源提交 |
| [数据管理页面验证](reports/data-management-ui.md) | 导出与二次确认删除、待核对标记、独立缓存清理 |
| [服务端数据生命周期](reports/server-data-lifecycle.md) | 当前匿名主体导出/删除，内存与 HTTP 验证，数据库专项待执行 |
| [连接锁边界](reports/workspace-locks.md) | 无跨标签锁时暂停服务器操作，保留缓存及本地读写 |
| [连接恢复验证](reports/workspace-recovery.md) | 响应丢失、缓存失败、会话隔离与重试记录保留 |
| [后端成长接口验证](reports/backend-growth-check.md) | 成长/证明/导入边界及共享仓储专项，持久库验证待执行 |
| [同步入口修复](reports/sync-entry-fix.md) | 同步页面、静态依赖、存储替身及验证边界 |
| [候选校验共享化](reports/shared-understanding.md) | 共享校验、兼容入口、CLI 收口及本轮验证阻碍 |
| [后端持久化首轮](reports/backend-persistence-v1.md) | PostgreSQL、路径/计划对象接口、真实事务与 Node 重启恢复 |
| [工程文档整理核对](reports/engineering-docs-audit.md) | 本次文档职责、结构、路径与一致性核对；无运行时修改 |
| [后端地基第二轮](reports/backend-foundation-v2.md) | 共享校验、异步仓储、幂等、HTTP 与本地流程自动回归 |
| [后续骨架](reports/next-foundation.md) | 当时个人地图、动态确认与方向桥接等增量 |
| [阶段 11](reports/stage11-verification.md) | 工作区和成果快照首轮验证 |
| [阶段 10](reports/stage10-walkthrough.md) | 当时探索、确认、本地保存与入口走查 |
| [阶段 9](reports/stage9-verification.md) | 地图核心交互与历次视觉修订 |
| [材料对账](reports/2026-09-08-reconciliation.md) | 2026-09-08 原始素材和历史文档核对 |
| [归档索引](archive/README.md) / [整理前快照](archive/docs-before-cleanup-2026-09-10.md) | 原始材料、旧规范和决策语境 |

报告中的“当前”“最近”仅指报告当时。后续修改不自动继承验收；旧正文、素材包说明与历史原路径不批量改写为新架构。本次核对范围与保留项详见工程文档整理报告。
