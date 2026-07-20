# GrokDesk Imagegen 资产记录

这些项目内位图均通过 Codex 内置 Imagegen 工具生成，没有使用 API/CLI 回退。视觉概念以所选 “Quiet Command Center” 方案为结构基础，再转换为当前浅色主题。

## 浅色视觉概念

- 文件：grokdesk-light-concept.png
- 用途：实现布局、密度、颜色、字体、可见内容与层级的视觉源。
- 输入：所选暗色 “Quiet Command Center” 概念图作为严格编辑目标。

~~~text
Use case: precise-object-edit
Asset type: preview-only high-fidelity desktop UI theme revision
Input image 1: edit target and strict structural reference
Primary request: Convert only the dark theme of the supplied GrokDesk desktop app into the approved cool-white light theme. Preserve the selected “Quiet Command Center” design exactly. This is a theme transformation, not a redesign.

Hard invariants — preserve exactly:
- Keep the same 1440 x 1024 full desktop-app viewport and the same custom Windows title bar.
- Keep the exact three-region layout, panel widths, spacing, borders, vertical rhythm, scroll positions, task hierarchy, composer placement, avatars, icons, labels, task names, timestamps, plan steps, tool rows, file list, code diff, test panel, branch name, runtime status, and all visible content.
- Keep the left navigation, central conversation/execution timeline, plan block, tools block, bottom composer, and right Changes/Terminal/Context inspector in the same positions and proportions.
- Do not add, remove, rename, or rearrange any feature, control, tab, row, panel, button, or content.
- Preserve the same professional density and readable 14–16px product typography.
- Preserve exact app name “GrokDesk” and active task title “Refactor OAuth session storage”.

Change only the visual theme and action hierarchy:
- Main center surface: true clean white #FFFFFF.
- Left workspace/navigation rail: cool light gray #F4F6F8.
- Right review inspector: subtly tinted cool gray #F7F9FB.
- Header/title surfaces: white, with crisp cool-gray separators.
- Borders and dividers: #E1E5EA, thin and precise.
- Primary text: graphite #171A1F. Secondary text: #68707D.
- Active selection and running progress: restrained cobalt blue #2563EB with pale blue selected-row backgrounds.
- Success green #16A34A is used only for completed plan steps, passed tests, and connected/success status.
- Warning amber only for modified-file markers and attention states.
- Error red only for destructive/error states and removed diff lines.
- Make “Send” the only persistent blue primary button.
- Change “Review changes” from bright green into a refined neutral secondary/outlined button because the task is still running.
- Keep “Run tests” as a secondary outlined button.
- Use accessible, low-saturation light diff colors: pale red removed lines, pale green added lines, dark readable code text.
- Use minimal soft shadow only around the composer and meaningful raised controls; otherwise rely on spacing and 1px separators.

Mood and finish: premium native Windows productivity app, cool white engineering aesthetic, calm, crisp, highly legible, no cream or beige tint, no washed-out contrast.

Avoid: any layout drift, any IDE-style redesign, new sidebars, new cards, changed typography scale, content changes, extra labels, large colored surfaces, green primary buttons, excessive blue, warm off-white, glassmorphism, gradients, neon effects, browser chrome, device mockup, watermark.
~~~

## GrokDesk 品牌图标

- 文件：src/assets/grokdesk-icon.png
- 用途：启动器、标题栏、Agent 头像与工作区标记。
- 输入：浅色视觉概念仅作为设计语言参考。

~~~text
Use case: logo-brand
Asset type: production desktop app launcher icon for GrokDesk
Input images: Image 1 is the approved GrokDesk light-theme UI concept and strict visual-language reference, not an edit target.
Primary request: Create one original, minimal square launcher icon for “GrokDesk”, a premium desktop client for the Grok Build coding agent. The icon should visually echo the small orbital slash mark visible beside the GrokDesk name in Image 1: a confident circular orbit / abstract G-shaped symbol with one precise diagonal motion cut, suggesting an agent in motion and code transformation. Do not copy any existing corporate logo.
Style/medium: crisp vector-like app icon, flat geometric construction, production-ready at small sizes.
Composition/framing: centered single symbol with generous optical padding inside a softly rounded square tile; perfectly balanced silhouette; no mockup frame.
Color palette: cool clean white tile, graphite-black symbol, one restrained cobalt-blue accent (#2563EB); no other colors.
Lighting/mood: native Windows productivity software, calm, precise, technical, premium.
Text: no text, no letters, no wordmark.
Constraints: square 1:1 image; strong recognizable silhouette at 16px; clean edges; simple negative space; no transparency required; no watermark; no extra objects; no gradients; no 3D; no glass; no shadows outside the tile; no browser/device mockup; no xAI or Grok trademark logo replication.
~~~

## Alex Chen 用户头像

- 文件：src/assets/alex-chen.png
- 用途：任务消息与账户区域中的圆形用户头像。
- 输入：浅色视觉概念仅作为色调和裁切参考。

~~~text
Use case: photorealistic-natural
Asset type: production user avatar for the approved GrokDesk desktop UI
Input images: Image 1 is the approved light-theme interface; use only its calm, cool-white product tone and the small circular profile-photo treatment as style/composition reference.
Primary request: Create one realistic square professional avatar photo of a friendly East Asian male software engineer in his early 30s. Natural, understated expression, neat dark hair, casual dark crew-neck shirt, no accessories.
Scene/backdrop: simple soft cool-gray studio background that remains clean when cropped into a 32px circle.
Style/medium: photorealistic natural headshot, authentic skin texture, contemporary developer profile photo.
Composition/framing: centered head and shoulders, eye-level, generous safe area for circular crop, face clearly readable at small size.
Lighting/mood: soft window-like daylight, calm and approachable.
Color palette: neutral skin tones, graphite clothing, cool gray background.
Constraints: square 1:1 image; no text; no logo; no watermark; no dramatic bokeh; no strong color cast; no suit; no headset; no extra people; no device mockup.
~~~
