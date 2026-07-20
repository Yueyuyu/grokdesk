# GrokDesk 设计 QA

## 对照目标

- 视觉源：docs/design/grokdesk-light-concept.png
- 视觉源原始像素：1487 × 1058
- 规范化对照视口：1440 × 1024
- 实现截图：docs/design/grokdesk-implementation-1440x1024.png
- 完整并排证据：docs/design/grokdesk-design-comparison.png
- 局部并排证据：docs/design/grokdesk-focused-comparison.png
- 状态：Light 主题、Tasks、Changes、默认 OAuth 重构任务、检查器展开

源图、最新实现截图、完整并排图和局部并排图均已用 view_image 以原始细节打开检查。实现截图由 Codex 应用内 Browser/IAB 在 http://127.0.0.1:1420 的真实页面上采集，不是代码推断或静态拼图。

## Browser/IAB 证据

- 页面身份：URL 为 http://127.0.0.1:1420/，标题为 GrokDesk。
- 非空页面：DOM 包含三栏区域、任务标题、消息、Plan、Tools、Diff、Tests 和 Composer。
- 框架错误层：未发现。
- 控制台：最终桌面与移动端均为 0 条 error/warn。
- 桌面：window.innerWidth = 1440，window.innerHeight = 1024；document scrollWidth = 1440，scrollHeight = 1024；无横向溢出。
- 移动：390 × 844；document 与 body 的 scrollWidth 均为 390；无溢出元素。检查器收起时主区宽 335px，打开时以 left 54px、width 336px 的抽屉覆盖，随后可正常收起。
- 交互：Composer 输入 “Summarize the OAuth rotation change” 后 Send 可用；用户消息出现，Grok Build 回复按流式片段完成，输入框清空，busy 状态恢复。
- 交互：Settings 可打开；Dark 将 data-theme 设为 dark 且背景变为 rgb(13, 20, 25)，Light 恢复为 rgb(255, 255, 255)。
- 交互：Terminal 与 Context 标签均切换到对应真实内容，再恢复 Changes。

## 五项以上视觉比较

1. 信息架构：左侧导航、中部任务时间线、右侧检查器的三栏骨架与源图一致；没有被改成卡片网格或 IDE 编辑器。
2. 比例与布局：1440 × 1024 下左栏 268px、中区 772px、右栏 392px；标题栏 40px，页面无外层滚动，分区边界与源图对齐。
3. 字体与层级：Inter、任务标题、消息名/时间、正文、Plan/Tools 小字、Diff 等宽字体和 Inspector 标签的权重、行高与换行均保持源图密度。
4. 颜色与语义：中区为 #FFFFFF，导航为冷灰，Inspector 为浅冷色；蓝色仅用于选择/进行中/主操作，绿色仅用于成功，Diff 红绿背景低饱和。
5. Plan 与 Tools：四步状态、连接轨道、工具数量、目标文件、进度条和 “3 more” 入口均保留；最终补齐了入口方向箭头。
6. Composer：底部固定、圆角与软阴影、附件/@/分支、分裂式 Send 按钮、下拉箭头和焦点行为均匹配；移动端隐藏非必要提示但保留核心输入和发送。
7. Inspector：Changes/Terminal/Context 标签、7 个文件、选中行、Diff 行号与语义着色、Tests 结果和折叠控制均存在并可操作。
8. 图标与资产：最终将工作区、Tasks、MCP、分支下拉和工具更多入口改为更接近源图的 Phosphor/Imagegen 资产；品牌图标和头像均清晰、裁切正确，无占位符。
9. 响应式：390 × 844 下导航缩成图标栏，工具模块隐藏，标题动作保留为图标按钮，Inspector 改为抽屉；没有文本或主要操作被裁切。

## 首屏文案 Diff

主标题、导航、标签、任务内容、Plan、Tools、文件、Diff、Tests 和按钮标签均与视觉源一致。

保留两项有意的运行时文案差异：

- 源图底部使用静态 “Grok Build · ACP v0.6.3”；实现显示探测到的 CLI/ACP 或登录状态，避免伪造版本和连接结果。
- 源图 Composer 处于取消提示状态并显示 “Esc to cancel”；实现默认演示画面是可发送的空闲状态，显示 “Ctrl Enter to send”，真实 ACP 回合执行时会切换为可点击 Stop。

这两项是运行时真实性带来的状态文案，不改变布局、层级或核心工作流。

## 比较与修正历史

- [P2 已修复] Plan/Tools 宽度和对齐与视觉源有漂移。统一活动模块边距、标题和条目网格后重新截图，对照中主要边界一致。
- [P2 已修复] 消息字体、换行和垂直节奏过松。收紧消息字号、行高、分隔线和模块间距后，首屏内容数量与源图一致。
- [P2 已修复] Composer 高度和 Send 控件解剖不匹配。调整为 150px raised composer、分裂式 Send/菜单按钮，并保持底部间距。
- [P2 已修复] Inspector 标签、Diff 与 Tests 比例不匹配。固定 392px 检查器、三等分标签、真实行号与完整测试结果后通过。
- [P2 已修复] 分栏拖动累计偏移。34px 指针拖动最终只改变 34px，不再叠加起始偏差。
- [P1 已修复] 早期 390px 宽度下 Inspector 覆盖并挤压主内容。880px 以下自动收起，展开时变为受边界约束的抽屉。
- [P2 已修复] 移动端标题动作、子元素宽度和导航无障碍名称不稳定。最终 390 × 844 无横向溢出，按钮均有唯一可访问名称。
- [P3 已修复] 工作区/Tasks/MCP/更多/分支图标语义偏差。改用更接近视觉源的现有图标和项目品牌资产。

修正后重新采集 1440 × 1024 页面、重新生成完整与局部并排图，并再次用 view_image 检查。当前没有剩余的 P0、P1 或 P2 项。

## 保留偏差

- 用户头像采用项目专用 Imagegen 头像，不追求与概念图中的合成人物像素级相同；圆形裁切、尺寸、位置和色调一致。
- 品牌符号为原创 GrokDesk 图标，不复制 xAI/Grok 商标；在相同槽位和视觉重量下保持项目独立性。
- 小型图标由 Phosphor Icons 提供，个别路径不会与生成图像中的合成图标逐像素一致，但隐喻、描边、尺寸、颜色和对齐已匹配。

## 结论

实现已忠实验证 against the accepted design：原生尺寸目标、五类必查表面、首屏文案、核心交互、桌面与移动响应式均已覆盖；没有剩余的实质性视觉不匹配。

final result: passed
