# GrokDesk implementation inventory

## Source visual truth

- Accepted concept: `grokdesk-light-concept.png`
- Source raster: 1487 × 1058; normalized QA viewport: 1440 × 1024
- Product outcome: one desktop surface for conversation, plan/tool progress, code review, tests, terminal context, and official Grok Build ACP execution.

## Allowed first-viewport copy

- GrokDesk
- Search or run a command
- Search tasks or run a command
- Workspaces
- acme/web-app
- Tasks
- Plugins
- MCP
- Settings
- Refactor OAuth session storage
- Grok Build · ACP · feature/oauth-refresh
- Run tests
- Review changes
- Changes
- Terminal
- Context
- Send

## Region and container model

1. Custom native-style title bar across the full window.
2. Cool-gray left rail with workspace selector, open navigation rows, task history, account, and runtime state.
3. True-white center task canvas with header, open conversation timeline, bordered plan/tools modules, and a raised composer.
4. Very-light cool-gray right inspector with tab strip, file list, diff surface, and tests surface.
5. Thin resizable splitters between the three regions. Inspector may collapse; the layout does not convert into an IDE editor.

## Design tokens

- Main background: `#ffffff`
- Navigation: `#f4f6f8`
- Inspector: `#f7f9fb`
- Primary text: `#171a1f`
- Secondary text: `#68707d`
- Border: `#e1e5ea`
- Primary blue: `#2563eb`
- Success: `#16a34a`
- Warning: `#d97706`
- Error: `#dc2626`
- Removed diff: `#fff1f1`
- Added diff: `#eefbf0`
- Radius: 6–10 px; 12 px only for the composer.
- Typography: Inter with Segoe UI Variable fallback; body/control text 12–15 px.

## Asset inventory

- `src/assets/grokdesk-icon.png`: Imagegen-created launcher and in-app brand mark.
- `src/assets/alex-chen.png`: Imagegen-created circular user/profile avatar.
- All product text, controls, diff content, plan rows, icons, and state are code-native.
- UI icons use Phosphor Icons with regular 1.5–2 px optical weight.

## Core interaction inventory

- Workspace selector and native folder picker.
- Tasks, Plugins, MCP, and Settings navigation.
- Task rename/delete, archive/restore, local branching with a fresh ACP session, and validated JSON import/export.
- `Ctrl+K` command palette for local cross-task search, navigation, task creation, workspace selection, and inspector commands.
- Resizable left and right panes plus inspector collapse.
- Changes, Terminal, and Context tabs.
- Changed-file selection and copy-diff action.
- Composer input, send, cancel, attach, mention, and branch selection controls.
- Real Grok binary detection, official OAuth launch, ACP session start, streamed session updates, permission response, and cancellation.
- Light/dark/system theme selection with shared layout and component geometry.

## Media treatment

- No hero illustration or background image.
- App icon uses its own white rounded-square tile; no overlay.
- Avatar is circular-cropped with no color overlay.
- Diff backgrounds are flat semantic surfaces with no gradients.
