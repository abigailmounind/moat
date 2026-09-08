# 阶段 9 修订实现与验收记录

日期：2026-09-08。状态：技术路径已核验，用户视觉验收待完成；阶段 9 尚未标记完成。

## 初版问题与本轮修复

初版“进入地图”无视觉效果，缺少 Hover 与真实动画；等宽描边偏离高保真水系。旧记录把暂停动态和可访问性写为已完成，证据不足。本轮撤回该记录，并重做以下部分。

| 项目 | 修订与证据 |
|---|---|
| 视觉构图 | 恢复整幅纸张地形地图；标题、三河标签、节点与右侧行动沿用主稿空间关系 |
| 河道 | 固定填充轮廓，有机河岸、宽窄变化、水面层与流纹；恰好 3 个主河系统；十条支流均有所属河、资本与合成证明关联 |
| 四态 | 默认、河流摘要、证明详情、未来方向；详情互斥；切换前后 SVG 主河 d 数据完全一致 |
| 证明 | 三份不同合成案例，显示来源、自述状态、贡献、资本关联与局限；不假装是真实访客档案 |
| 未来 | 生存河 2 个、能力河 1 个候选；热爱河无候选时不生成水道；重复展开不改动数据 |
| 实际动画 | 浏览器读取流纹 offset 为 -88.5704px / -144.47px，状态 running；后续采样发生变化。暂停后 -82.7898px / -137.13px 两次采样相同，状态 paused |
| 首次显现 | 重播后读取三条主河遮罩偏移为 100，延迟为 0.8 / 0.95 / 1.1 秒；约 4.8 秒恢复末态，提供立即查看 |
| 键盘 | Enter 打开证明与未来；Space 切换候选；Escape 关闭后焦点回到 node-project；候选切换后焦点保留在选中候选按钮 |
| 减少动态 | 页面设置开启后，12 条流纹与 3 个雾层的 animationName 全部为 none；键盘仍可走通证明 → 未来 → 返回。系统媒体查询同样接入，但没有修改用户操作系统偏好来测试 |
| 窄屏 | 390px 检查标签与河流入口、摘要、无方向说明、详情；无页面水平溢出。修正了热爱标签裁切与底栏挤压；详情位于地图下方 |
| 未实现入口 | 真实探索、计划和成长记录标注筹备中；不会显示虚假保存成功 |

## 自动化与运行

`node --test tests/state.test.mjs`：4 项通过，覆盖详情互斥、空/无效/跨河输入、100 次重复切换不修改数据、三河同核心与 SVG 引用完整性。`node scripts/check.mjs` 通过。`node scripts/export-map.mjs` 导出可复用河流层。

本地入口：http://127.0.0.1:4173/ 。运行服务只开放页面源码和两份运行资产，旧文档、压缩包与历史资料不通过预览服务暴露。

## 视觉证据

截图保存在 stage9-evidence/。默认态正常动态；其他稳态截图可在减少动态模式下捕获，避免记录过渡中间帧。动画另由运行时属性与重播观察核验。

- 01-default.png：整页构图。
- 02-river-summary.png：河流摘要。
- 03-proof.png：证明详情。
- 04-future.png：从属未来分叉。
- 05-mobile.png：窄屏地图与操作。

## 仍需验收的边界

当前已经接近原稿的构图与地形语言，但水面的水彩细节仍由 SVG 近似实现，未获得用户最终视觉确认。宽度是演示几何，没有资本评分算法。窄屏采用裁切地图加文字/按钮等价入口，未做整张地图平移缩放。真实保存、AI 探索、长期路径与计划编辑按后续阶段执行。屏幕阅读器未使用独立设备全量验证，不把 DOM 语义检查等同于完整辅助技术验收。

## 2026-09-08 视觉与一屏修订

本轮在 checkpoint `3c89095` 之后进行，范围保持在用户指定的 P0/P1/P2：

- 应用根节点改为 `height: 100dvh; min-height: 0; overflow: hidden`；背景、SVG、DOM overlay、侧栏和底栏均属于同一个 viewport 坐标层。移动端单独恢复纵向滚动，桌面端不监听或修改浏览器 Zoom。
- 地形图使用 `object-fit: cover`，不再使用固定尺寸或 `object-fit: fill`。1366×768、1440×900、1536×864 回归结果均为 body/document 高度等于 viewport，纵向溢出为 false，底栏 bottom 不超过 viewport。
- 河水主体改为青蓝基色 + 两层低对比 radial wash + 轻微 turbulence grain；沿岸增加很弱的 displacement edge 和 translucent bank wash。原有流纹保留，短线不增加数量。
- 右上、左下、右下增加低 opacity 的独立 ambient mist；不覆盖题字和主要卡片。右上题字与地图批注使用轻人文 fallback（STKaiti/Kaiti SC → Noto Serif SC），产品 UI 字体保持不变。

本轮截图和代码检查证明布局修复；水彩层次依然属于 SVG 近似，最终是否达到目标高保真仍需用户视觉确认。

## 2026-09-08 题字与水面二次修订

- 该轮次的程序化中心水色、wash、颗粒与岸线层已被后续用户 SVG 接入取代；当前河面视觉由 hires 纹理资产承载。
- 右上题字与地图手写批注接入本地 `assets/fonts/LXGWWenKaiLite-Regular.ttf`。字体来源、下载包哈希和 OFL 许可见 `assets/fonts/README.md`；系统字体仍作为回退。
- 静态路由仅新增字体文件扩展名白名单，未开放文档、压缩包或历史资产。
- 最新浏览器检查：字体 CSS 规则存在、ambient mist 3 层、旧 `water-body` 与 `bank-edge` 均为 0，暂停后新 `water-flow` offset 保持不变；项目检查与 4 项状态测试通过。

## 2026-09-08 用户河流 SVG 接入

- 用户提供的 `rivers-watercolor-hires.svg` 已保存到 `assets/three-rivers/`。文件尺寸同为 `1672 × 941`，但结构是一个内嵌透明 PNG 的 SVG wrapper（1 个 `<image>`、0 个 `<path>`），因此登记为视觉纹理资产，不冒充可编辑路径组件。
- 运行时将该纹理作为底层河面图层；现有 `src/map.js` 的三河路径、透明命中区、未来分叉和 `water-flow` 动态继续保留。资源设置 `pointer-events: none`，证明节点与河流入口仍可操作。
- 浏览器验证显示新图层 opacity `0.97`、命中区可打开证明详情，资源路由返回 200；完整显现后河面深浅、中心汇流与水彩边缘明显接近高保真参考。
- 旧程序化河面填充、wash、core 和 bank edge 已从运行时 SVG 移除；动态只作用于新河面对应的中心线流纹与低对比支流流纹。原始 SVG 的嵌入 PNG 后续改由资产级 alpha 处理生成 clean.svg；运行时不再依赖 `river-edge-clean` SVG filter，并通过 brightness / saturation / contrast 校正为更柔和的灰蓝色。

## 2026-09-08 河流资产与汇流显现精修

本轮严格限制在河流素材、河流色彩与质感、河流出现动画、三河汇流高光；页面布局、卡片、地形底图、文案和雾层未改动。

- 资产类型确认：用户 SVG 是 B 类自包含 SVG wrapper，`1672 × 941`，内部为一张 RGBA PNG，没有可编辑 `<path>`。原始文件保留在 `assets/three-rivers/rivers-watercolor-hires.svg`。
- 资产层去毛边：`scripts/clean_river_asset.py` 解码内嵌 PNG，以 alpha ≥ 96 的主体轮廓做 3px 外扩，仅裁掉主体外脱离的低 alpha 浅色边缘，保留主体内部水彩浅层和抗锯齿边缘；产物为 `rivers-watercolor-hires-clean.svg` 与 `rivers-watercolor-hires-clean.png`。本轮不依赖 CSS 降透明度来伪装去边。
- 河流层：移除旧的程序化河身、wash、core 和 bank-edge 视觉层；页面只引用 clean.svg 作为水彩河面，`water-flow` / `tributary-flow` 仅承担细微动态流纹，因此不会再出现旧阴影独自流动。
- 色彩：运行时 filter 调整为 `brightness(1.06) saturate(.82) contrast(.95)`，让青蓝河面更灰、更轻，保留较深的主体墨色和内部纹理。
- 汇流显现：新增 `river-reveal` user-space mask。三条主河路径均以汇流点为起点，分别向左上、右上、下方用 pathLength + dashoffset 显现；支流在主河之后短暂显现。未使用整幅图片 opacity 0→1 或圆形径向遮罩。
- 汇流高光：依据清理后位图中心亮部的 alpha 加权分析（约 `892.5,451.2`）并结合主河中心线，将高光定位为 `884,452`，半径由 36 缩至 31，显现为一次短促柔和的 pulse，不做强灯光效果。
- 浏览器核验：运行时 `water-body` / `bank-edge` 为 0；`river-reveal` 存在且含 3 条主路径、10 条支流路径；图片无自身动画，进入时读取到 `river-reveal`，320ms 时主路径 dashoffset 约 49px，约 1.6s 后为 0；汇流高光 opacity 为 0.68；暂停按钮能保持流纹 offset 不变且 animation-play-state 为 paused；点击透明命中区仍能打开河流摘要。

本轮仍需用户进行最终视觉验收，阶段 9 不在本记录中标记完成。
