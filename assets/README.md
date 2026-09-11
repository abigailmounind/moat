# 资产索引

索引说明更新于 2026-09-10；原媒体盘点与归档执行于 2026-09-08。现有媒体已逐文件核对与归档；[迁移清单](migration-manifest.csv) 记录原路径、现路径、SHA-256 和操作。共 65 次移动/独有 SVG 解包，未删除文件。重复原件进入 archive/duplicates，四个原始 ZIP 保留。下载附加信息（Zone.Identifier）留在原处，不作为业务资产。

本索引维护资产事实，工程分层、公共文件白名单与变更验证见 [工程规范](../docs/ENGINEERING_STRUCTURE.md)，专题职责见 [文档导航](../docs/README.md)。本次工程文档整理只核对源码引用和派生工具，没有重新生成、移动媒体或重新执行历史哈希盘点。

| 目录 / 文件 | 用途与状态 |
|---|---|
| three-rivers/我的河 · 三河总览HiFi.png | 当前页面视觉参考；生成稿偶然细节不覆盖现行规范 |
| three-rivers/我的河 · 三河总览HiFi-Hover态.png | 河流预览参考 |
| three-rivers/我的河 · 三河总览HiFi-证明详情态.png | 证明详情参考 |
| three-rivers/我的河 · 三河总览HiFi-未来分叉态.png | 历史从属方向参考；分叉水道已取消，不能按此恢复 |
| three-rivers/terrain-v1.png | 从当前参考稿生成的独立地形底图；无河流、文字、UI；运行中复用；阶段 9 接受的是整体妥协版本，后续布局另验收 |
| three-rivers/rivers-v2.svg | 由 frontend/src/map.js 导出的地图快照，含命中、显现遮罩与雾；页面直接调用 mapMarkup 生成 SVG，未把此快照当作页面主入口 |
| three-rivers/rivers-watercolor-hires.svg | 用户提供的原始高质感三河视觉层；SVG 内嵌透明 PNG，保留为源资产 |
| three-rivers/rivers-watercolor-hires-clean.svg | 由原始内嵌 PNG 做资产级 alpha 轮廓清理后的运行时河面层；保留内部水彩纹理，去除外部浅色毛边 |
| three-rivers/rivers-watercolor-hires-clean.png | 清理后的 RGBA 派生位图；供资产检查与后续编辑使用，当前页面通过 clean.svg 引用 |
| references/ | 三张地图参考与视觉语法素材板 |
| references/unselected/ | 两张未选候选稿；不能覆盖当前主方向 |
| motion/动态显现示例.mp4 | 约 4.83 秒动效参考；不作为网页地图本体 |
| vector-components/v0.1/ | 原 12 个 SVG、色板与说明；原始组件起点，非验收完成组件库 |
| archive/packages/ | 原始 ZIP；保留压缩包内的历史原件 |
| archive/duplicates/ | 与已登记副本字节相同的原位置文件，保留来源与可追溯性 |
| ../docs/archive/ | 阶段 5–8 原型、PDF、低保真与旧产品定义 |

地图交互 SVG 的源为 `frontend/src/map.js`，页面通过 `mapMarkup` 生成；`scripts/export-map.mjs` 读取该模块和 `frontend/src/styles.css`，执行 `node scripts/export-map.mjs` 会更新 `rivers-v2.svg` 导出快照。这是写资产的派生命令，仅在地图源变更需要导出时执行。河流、节点与 UI 叠层共用 1672 × 941 坐标；不要仅修改派生 SVG 而遗漏源代码。

`rivers-watercolor-hires.svg` 是用户提供的自包含视觉资产，内部实际为透明 PNG，不将它当作可编辑路径组件。`rivers-watercolor-hires-clean.svg` 由 `scripts/clean_river_asset.py` 在资产层移除脱离主体的低 alpha 外缘后生成；运行时引用 clean.svg；处理先移除脱离主体的低 alpha 外缘，再仅在 18px 外轮廓带衰减高亮浅青毛边，保留内部水彩和白色流纹。交互仍由现有 SVG 命中区和 DOM 层负责。

底图生成于历史地图实现任务，基于当前 HiFi 保留暖纸、珊瑚/苔绿/灰紫地形、等高线与树木，移除河流、文字、卡片和光点；原始生成结果留在任务生成目录。此素材不是用户最终验收的单独决定。

当前地图几何宽度不代表资本分数。frontend/src/data.js 维护合成案例关系；个人文字与证明由 frontend/src/personal-map.js 从已确认记录投影，不能把合成支流映射当作个人资料。真实资料不得写入演示资产或分析日志。

字体资产：`fonts/LXGWWenKaiLite-Regular.ttf` 仅用于右上题字和地图手写批注，来源、哈希与许可证见 `fonts/README.md`。它不改变产品 UI 的正文字体。
