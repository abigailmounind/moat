# 资产索引

更新于 2026-09-08。现有媒体已逐文件核对与归档；[迁移清单](migration-manifest.csv) 记录原路径、现路径、SHA-256 和操作。共 65 次移动/独有 SVG 解包，未删除文件。重复原件进入 archive/duplicates，四个原始 ZIP 保留。下载附加信息（Zone.Identifier）留在原处，不作为业务资产。

| 目录 / 文件 | 用途与状态 |
|---|---|
| three-rivers/我的河 · 三河总览HiFi.png | 当前页面视觉参考 |
| three-rivers/我的河 · 三河总览HiFi-Hover态.png | 河流预览参考 |
| three-rivers/我的河 · 三河总览HiFi-证明详情态.png | 证明详情参考 |
| three-rivers/我的河 · 三河总览HiFi-未来分叉态.png | 从属未来方向参考 |
| three-rivers/terrain-v1.png | 从当前参考稿生成的独立地形底图；无河流、文字、UI；运行中复用，待整体视觉验收 |
| three-rivers/rivers-v2.svg | 由 src/map.js 导出的交互命中、动态流线与雾图层；视觉河面由用户提供的 hires 资产承载，待视觉验收 |
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

新河流源文件是 src/map.js；执行 `node scripts/export-map.mjs` 更新导出 SVG。河流、节点与 UI 叠层共用 1672 × 941 坐标。不要修改导出 SVG 后忘记回写源代码。`rivers-watercolor-hires.svg` 是用户提供的自包含视觉资产，内部实际为透明 PNG，不将它当作可编辑路径组件。`rivers-watercolor-hires-clean.svg` 由 `scripts/clean_river_asset.py` 在资产层移除脱离主体的低 alpha 外缘后生成；运行时引用 clean.svg，交互仍由现有 SVG 命中区和 DOM 层负责。

底图生成于本次任务，基于当前 HiFi 保留暖纸、珊瑚/苔绿/灰紫地形、等高线与树木，移除河流、文字、卡片和光点；原始生成结果留在任务生成目录。此素材不是用户最终验收的单独决定。

演示几何宽度不代表资本分数；三河支流的资本/证明关联见 src/data.js。财务与身体条件未知。真实资料不得写入演示资产或分析日志。

字体资产：`fonts/LXGWWenKaiLite-Regular.ttf` 仅用于右上题字和地图手写批注，来源、哈希与许可证见 `fonts/README.md`。它不改变产品 UI 的正文字体。
