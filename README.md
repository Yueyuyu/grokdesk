<p align="center">
  <img src="src/assets/grokdesk-icon.png" width="112" alt="GrokDesk 图标" />
</p>

<h1 align="center">GrokDesk</h1>

<p align="center">把官方 Grok Build 带进一个清晰、可审核的 Windows 与 macOS 桌面工作区。</p>

<p align="center">
  <strong>简体中文</strong> ·
  <a href="README.en.md">English</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.ko.md">한국어</a> ·
  <a href="README.de.md">Deutsch</a>
</p>

<p align="center">
  <a href="https://github.com/Yueyuyu/grokdesk/releases/latest"><img alt="最新版本" src="https://img.shields.io/github/v/release/Yueyuyu/grokdesk?display_name=tag&amp;sort=semver&amp;style=flat-square&amp;color=2563eb" /></a>
  <a href="https://github.com/Yueyuyu/grokdesk/actions/workflows/ci.yml"><img alt="持续集成" src="https://github.com/Yueyuyu/grokdesk/actions/workflows/ci.yml/badge.svg?branch=main" /></a>
  <a href="https://github.com/Yueyuyu/grokdesk/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/Yueyuyu/grokdesk?style=flat-square&amp;color=f59e0b" /></a>
  <a href="https://github.com/Yueyuyu/grokdesk/forks"><img alt="GitHub Forks" src="https://img.shields.io/github/forks/Yueyuyu/grokdesk?style=flat-square" /></a>
  <a href="https://github.com/Yueyuyu/grokdesk/issues"><img alt="GitHub Issues" src="https://img.shields.io/github/issues/Yueyuyu/grokdesk?style=flat-square" /></a>
  <a href="https://github.com/Yueyuyu/grokdesk/releases"><img alt="总下载量" src="https://img.shields.io/github/downloads/Yueyuyu/grokdesk/total?style=flat-square&amp;color=16a34a" /></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/github/license/Yueyuyu/grokdesk?style=flat-square&amp;color=16a34a" /></a>
</p>

<p align="center">
  <a href="https://github.com/Yueyuyu/grokdesk/releases/latest"><strong>下载最新版</strong></a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#功能亮点">功能</a> ·
  <a href="#隐私与安全">安全</a> ·
  <a href="#本地开发">开发</a>
</p>

<p align="center">
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square&amp;logo=tauri&amp;logoColor=white" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149ECA?style=flat-square&amp;logo=react&amp;logoColor=white" />
  <img alt="TypeScript 5.9" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&amp;logo=typescript&amp;logoColor=white" />
  <img alt="Rust" src="https://img.shields.io/badge/Rust-native-000000?style=flat-square&amp;logo=rust&amp;logoColor=white" />
  <img alt="ACP" src="https://img.shields.io/badge/Protocol-ACP-7C3AED?style=flat-square" />
  <img alt="Windows 10/11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=flat-square&amp;logo=windows11&amp;logoColor=white" />
  <img alt="macOS" src="https://img.shields.io/badge/macOS-Apple%20Silicon%20%7C%20Intel-000000?style=flat-square&amp;logo=apple&amp;logoColor=white" />
</p>

> [!IMPORTANT]
> GrokDesk 是独立、非官方的开源项目，与 xAI 不存在隶属、赞助或官方认可关系。“Grok”“Grok Build”和相关商标归其各自权利人所有。

![GrokDesk 三栏任务工作台](docs/design/grokdesk-implementation-zh-CN-1440x1024.png)

## 项目状态

| 项目 | 当前状态 |
| --- | --- |
| 当前源码 | `main` 分支对应 `v0.3.2`；版本以 [`package.json`](package.json) 和 Tauri 配置为准 |
| 公开安装版 | 以顶部 **最新版本** 徽章和 [GitHub Releases](https://github.com/Yueyuyu/grokdesk/releases/latest) 为准；新源码合并后，安装包可能要到下一次 Release 才提供 |
| 成熟度 | **公开测试版（Beta）**：可用于个人项目和真实工作区任务，但执行命令、授权工具或回滚文件前仍应检查目标与 Diff |
| 正式支持 | Windows 10/11 x64、macOS Apple Silicon、macOS Intel；Linux 暂无正式安装包 |

> [!NOTE]
> `main` 上看到的功能不等于已经出现在最新公开安装包中。需要直接使用时，请下载 Release，而不是把浏览器预览当成完整客户端。

## 快速开始

1. 从 [最新 Release](https://github.com/Yueyuyu/grokdesk/releases/latest) 下载对应系统的安装包。
2. Windows 建议使用 `x64-setup.exe`；macOS 请按芯片选择 `aarch64.dmg`（Apple Silicon）或 `x64.dmg`（Intel）。
3. 首次打开后依次点击 **Install Runtime** 和 **Sign in with Grok**，完成官方 Runtime 安装与 OAuth 登录。
4. 选择项目文件夹并创建任务。发送前检查附件，执行前检查权限请求，合并前检查真实 Git Diff。

## 为什么做 GrokDesk

Grok Build 的 Agent 能力来自官方 CLI；GrokDesk 不重新实现它。这个项目专注于补齐桌面使用体验：把任务历史、流式回复、计划、Tools、权限确认、Git 变更和终端上下文放进同一个三栏工作台，同时保留官方认证和运行时边界。

## 功能亮点

| 能力 | 当前行为 |
| --- | --- |
| 真实 ACP 会话 | 启动官方 `grok agent stdio`，支持 `session/new`、`session/load`、流式更新、取消和权限确认 |
| 后台 ACP 任务 | 最多保留 4 个任务级官方 Runtime 客户端：启动阶段串行以规避当前 CLI 的并发初始化阻塞，初始化后可并行运行；切换或新建任务不会中断输出，完成、失败和权限请求会在侧栏及可打开的通知中准确定位原任务 |
| 优化后的回答 | 安全渲染 GFM Markdown，包括标题、列表、任务列表、链接、表格、引用、行内代码和可复制代码块 |
| 稳定阅读体验 | 回答区独立顺滑滚动；用户上滚后不会被流式输出强行拉回，并提供“Back to latest” |
| 固定 Tools 底栏 | Tools 固定在输入框上方，默认展示最近 5 项，可展开查看完整活动 |
| 文件与图片 | 支持“＋”多选、拖放、缩略图、移除和仅附件发送；通过 ACP 图片或嵌入资源真实发送 |
| 工作区审核 | 显式选择项目文件夹，读取真实 Git 状态和统一 Diff，逐文件暂存、取消暂存或确认后回滚 |
| 真实工作区终端 | 在所选项目中运行 Windows PowerShell 或 macOS 用户 Shell，实时区分 stdout/stderr，支持历史命令、停止进程树，并保留独立 ACP 日志视图 |
| 后台终端与测试结果 | 最多 8 个独立终端标签可并行后台运行；支持新建、重命名、关闭和逐标签停止，并从真实 Vitest、Cargo、Jest、Node 输出提取通过数、失败数与耗时 |
| Runtime 与登录 | Windows 与 macOS 首次启动都可一键安装官方 Grok Runtime，并通过 `grok login --oauth` 登录 |
| 可信应用更新 | Settings 自动检查 GitHub Release 元数据，但下载与安装/重启分别要求确认；Windows 与 macOS 更新包都必须通过专用 Updater 公钥验证，浏览器预览不伪造更新 |
| 账号与本机活动 | 独立 Account 页面显示官方 Runtime 实际返回的套餐、额度与周期；同时按当前工作区汇总本机任务热力图和近期任务，且明确与 xAI 官方总用量区分 |
| Plugins 与 MCP | 从官方 Grok Runtime 读取并管理真实 Plugins、Marketplace 和 MCP 配置，不伪造本机状态 |
| Runtime 上下文与 Skills | 通过官方 `grok inspect --json` 读取当前工作区的项目指令、Skills、Agents 与配置层，并组合当前 ACP 会话报告的能力；支持刷新和重连 ACP，浏览器预览不伪造记录 |
| 模型与推理配置 | 只使用官方 ACP 初始化元数据展示模型、上下文窗口与推理强度，并通过官方 `--model`、`--reasoning-effort` 参数启动任务；已有对话的任务不会被静默重启 |
| 可靠的本机任务历史 | 安装版使用原生应用数据文件保存全部工作区任务，并通过原子替换、上一版本自动备份和关闭前影子副本保护尚未落盘的更新；Settings 会显示真实存储状态 |
| 更快的首屏加载 | 任务中枢与 Onboarding 保持同步加载；Settings、Account、Diagnostics、Permissions、Plugins、MCP 和 GFM 回答渲染器按实际需要加载，v0.3.1 的生产入口由 730.14 KB 降至 492.24 KB |
| 五语言桌面界面 | v0.3.2 支持简体中文、English、日本語、한국어和 Deutsch；默认跟随系统，未知语言回退简体中文，并可在 Settings 中即时切换和持久化 |
| 任务生命周期 | 归档/恢复任务、创建不复用 ACP Session 的本地分支，并以经过 8 MiB 限制与结构校验的 JSON 显式导入/导出；凭据和附件正文不会进入文件 |
| 命令面板与跨任务搜索 | 按 `Ctrl+K` 搜索当前工作区的普通与归档任务，覆盖标题、对话、附件名、计划和 Tools，并运行导航、新建任务、切换工作区和检查器命令 |
| 权限中心与执行审计 | 按工作区记录经过脱敏的权限决定、Grok 工具生命周期和终端命令结果；支持筛选、搜索与确认清除，浏览器预览不生成模拟记录 |
| 诊断中心与问题报告 | 真实检查 GrokDesk、Runtime、OAuth、ACP、工作区/Git 与 MCP，并提供可执行修复入口和脱敏 Markdown 报告；浏览器预览不伪造健康数据 |
| 桌面体验 | 单实例、可调三栏、可折叠检查器、Light/Dark/System 主题、Windows 桌面快捷方式和 macOS 原生红黄绿窗口控制 |

### 附件边界

- 最多 8 个附件，单个不超过 8 MiB，总计不超过 24 MiB。
- 图片使用 ACP `image` 内容块；文本与其他文件使用 ACP `resource` 内容块。
- GrokDesk 会读取当前 ACP 初始化结果中的 `promptCapabilities`。官方 Runtime 未公开对应能力时会明确报错，不会假装发送成功。
- 任务历史只保存附件名称、MIME 类型、大小和类别，不保存文件正文或 Base64 数据。
- 浏览器开发预览只演示交互，不会把附件发送到真实 Grok 账号。

### 任务历史与备份

- v0.3.0 会在首次启动时把旧版浏览器任务历史迁移到原生存储；主文件损坏时自动回退到上一份有效备份。
- v0.3.1 增加可通过 `npm run test:native-storage` 单独运行的原生存储烟测，覆盖首次写入、重启读取、上一版本保留、主文件损坏恢复、恢复后再次保存，以及主文件和备份同时损坏时的明确拒绝。
- **Settings → Task history & backup** 显示保存状态、任务数量、最近保存时间和存储大小，并支持显式导出或恢复全部工作区的完整备份。
- 本机最多保存 200 个任务，任务存储和完整备份的安全上限为 64 MiB。达到上限或写入失败时会明确提示，不会静默截断历史。
- 完整备份包含全部任务对话和工作区路径，但会移除 ACP Session ID、OAuth/MCP 凭据与附件正文。

### 桌面界面语言

- v0.3.2 提供简体中文、English、日本語、한국어和 Deutsch 五套完整桌面语言；默认跟随系统，无法识别的系统语言回退简体中文。
- Settings 可即时切换并持久化语言偏好。导航、按钮、表单、弹窗、通知、无障碍标签、日期和数字格式都会随当前语言更新。
- Runtime 返回的原文、模型 ID、命令、路径和终端原始输出保持原样，避免误改真实技术信息。
- 五套语言包独立按需加载，不进入同步首屏入口；后续仍以 v0.3.1 的 492.24 KB 生产入口作为性能回归基线。

## 安装与首次启动

前往 [GitHub Releases](https://github.com/Yueyuyu/grokdesk/releases) 下载对应安装包：

| 平台 | 安装包 | 说明 |
| --- | --- | --- |
| Windows 10/11 x64 | `x64-setup.exe`（推荐）或 `x64_en-US.msi` | 安装后自动创建 GrokDesk 桌面快捷方式 |
| macOS Apple Silicon | `aarch64.dmg` | 适用于 M1、M2、M3、M4 及后续 Apple 芯片 |
| macOS Intel | `x64.dmg` | 适用于 Intel Mac |

当前 macOS 构建尚未签名和公证。首次打开若被 Gatekeeper 拦截，请在 Finder 中右键 GrokDesk 选择“打开”，或前往“系统设置 → 隐私与安全性 → 仍要打开”。只从本仓库 Release 下载，并使用同一 Release 中的 `SHA256SUMS.txt` 校验文件。

Release 中的 `.app.tar.gz`、`.sig` 和 `latest.json` 用于应用内更新，不是普通用户手动安装所需的文件。

从 v0.2.9 起，安装版可在 **Settings → GrokDesk updates** 检查更新。自动检查只读取版本元数据；下载、安装和重启不会静默发生。应用内更新使用 Tauri 强制签名验证，手动下载仍应使用同一 Release 的 `SHA256SUMS.txt`。

首次打开按界面完成以下步骤：

1. 点击 **Install Runtime**，由 GrokDesk 执行 xAI 官方 HTTPS 安装脚本。
2. 点击 **Sign in with Grok**，在系统浏览器中完成官方 OAuth。
3. 选择一个项目文件夹，然后创建或打开任务。
4. 如需订阅，在 Onboarding 或 Settings 中打开官方 SuperGrok 管理页。

不需要先手动下载或打开 Grok Build。OAuth 凭据始终由官方 CLI 管理，GrokDesk 不保存 Token。

> [!NOTE]
> 套餐和额度只在官方 CLI 实际返回 billing 数据时显示；否则 GrokDesk 会明确说明限制并提供官方管理入口，不会编造套餐或用量。

## 工作方式

```mermaid
flowchart LR
  UI[React 桌面界面] -->|Tauri commands| Native[Rust 原生桥接]
  Native -->|JSON-RPC / stdio| CLI[官方 Grok Build CLI]
  CLI -->|OAuth 与模型服务| XAI[xAI]
  Native --> Git[本机 Git 工作区]
```

原生端负责进程生命周期、ACP 消息、系统浏览器、Runtime 安装和 Git 操作；React 端负责任务、对话、Tools、附件、审核与设置界面。项目不会复制官方 Agent，也不会在仓库内实现另一套 Grok 服务。

## 本地开发

### 环境要求

- Windows 10/11，或 macOS 13+
- Node.js 20+
- Rust stable
- Windows：MSVC toolchain、Visual Studio 2022 Build Tools（勾选 **Desktop development with C++**）与 WebView2 Runtime
- macOS：Xcode Command Line Tools

### 启动

```bash
npm ci
npm run tauri:dev
```

只预览 React 界面：

```bash
npm run dev
```

浏览器预览会明确标记模拟的 Runtime、Tools 和附件结果；Account 页面不会生成模拟账号、额度或活动数据。本机文件、真实账号与真实 ACP 只在安装版/Tauri 开发版中访问。

### 校验

```bash
npm test
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri:build
```

Windows 安装包生成在 `src-tauri/target/release/bundle/`。在 macOS 上可运行 `npm run tauri:build:mac-arm` 或 `npm run tauri:build:mac-intel` 生成对应 `.app` 与 `.dmg`。

## 隐私与安全

- OAuth 凭据由官方 Grok CLI 保存和刷新。
- GrokDesk 不读取、不展示、也不持久化 OAuth Token。
- Runtime 安装仅在用户点击后执行官方脚本：Windows 使用 `https://x.ai/cli/install.ps1`，macOS 使用 `https://x.ai/cli/install.sh`。
- 应用更新只访问本仓库的公开 GitHub Release 元数据与安装包；检查可以自动进行，但下载、安装和重启分别需要用户确认，浏览器预览不生成模拟结果。
- Account 中的热力图与近期任务只汇总当前工作区本机保存的任务、消息和 Tools，不读取 OAuth Token，也不冒充 xAI 官方账号总用量。
- 只有用户显式选择的工作区会用于 ACP 和 Git 操作。
- 工作区终端只执行用户主动输入的命令；原始输出与结构化测试摘要仅保留在当前应用会话，不写入任务历史。
- 附件只在当前发送回合中编码；内容不进入原生任务文件、自动备份或浏览器恢复副本。
- 单任务 JSON 和完整任务备份只在用户明确操作后导入或导出；文件可能包含对话、文件名和工作区路径，但不包含 OAuth/MCP 凭据、ACP Session ID 或附件正文。
- 命令面板只搜索当前工作区的本机任务；搜索词和结果不会上传到外部服务。
- 权限与执行历史仅在本机按工作区保存，最多保留 30 天和 500 条。终端输出、提示词、回复、附件正文、OAuth Token 与 MCP Header 不会进入审计记录，敏感命令参数会在持久化前脱敏。
- 诊断报告仅包含版本、平台、聚合计数和受控状态说明；绝对路径、账号标识、提示词、回复、终端输出、附件、OAuth 凭据以及 MCP 名称、端点和 Header 会被排除或脱敏。
- Context Inspector 只展示官方 Runtime 返回的安全投影；凭据值、绝对来源路径以及 MCP 名称、端点和 Header 不会进入前端数据。
- 模型配置只保存经过校验的模型 ID 与推理强度标识；模型目录来自官方 Runtime，浏览器预览不会伪造目录，也不会读取或保存账号凭据。
- 回滚文件始终要求二次确认，不执行自动批量回滚。
- Markdown 不启用原始 HTML，外部链接使用隔离的新窗口行为。

## 常见问题

<details>
<summary><strong>必须先手动安装 Grok Build 吗？</strong></summary>

不需要。首次启动时可由 GrokDesk 调用 xAI 官方 HTTPS 安装脚本。已经安装官方 Runtime 的用户也可以直接复用。
</details>

<details>
<summary><strong>浏览器里 OAuth 已成功，客户端为什么还没有账号或额度？</strong></summary>

登录由官方 CLI 完成。GrokDesk 会等待明确结果、重连 ACP 并刷新 Runtime 能提供的账号信息。如果仍未更新，请打开 Diagnostics 检查 OAuth 与 ACP；套餐和额度只有在官方 Runtime 返回 billing 数据时才会显示。
</details>

<details>
<summary><strong>为什么浏览器预览不能聊天、执行终端或读取插件？</strong></summary>

浏览器预览只用于检查 React 界面。真实 ACP、OAuth、本机文件、Git、终端、Plugins 和 MCP 只能在 Tauri 桌面版中访问，预览不会伪造这些数据。
</details>

<details>
<summary><strong>GrokDesk 是 xAI 官方客户端吗？</strong></summary>

不是。GrokDesk 是独立的开源桌面项目，复用官方 Grok CLI、OAuth 与 ACP 能力，但不代表 xAI，也不复制官方 Agent。
</details>

## 当前限制与路线图

- macOS DMG 当前未签名、未公证，首次打开可能需要手动通过 Gatekeeper；正式签名与公证仍在路线图中。
- Windows Authenticode、macOS Developer ID 与 Apple 公证需要外部证书；发布流水线已提供安全接入点，并会在证书缺失时明确报告未签名状态。
- Linux 尚无正式安装包，也暂不支持一键 Runtime 安装。
- 附件类型最终受已安装官方 Grok Runtime 的 ACP 能力约束。
- 套餐与额度受官方 CLI 是否提供 billing 接口约束。
- 终端当前运行非交互 PowerShell / Shell 命令，不提供完整 PTY/TTY 会话。
- Skills 当前在 Context Inspector 中为只读；官方 CLI 提供发现结果，但没有独立的 Skills 管理命令，安装与更新仍通过所属 Plugin 完成。
- 跨设备同步仍在后续路线中。

## 贡献

欢迎提交 Issue 和 Pull Request。请让每个 PR 聚焦一个逻辑改动，并在提交前运行相关测试与构建。安全问题请避免在公开 Issue 中附带 Token、账号信息或私有项目内容。

## 设计资料

- [视觉源图](docs/design/grokdesk-light-concept.png)
- [实现清单](docs/design/implementation-inventory.md)
- [视觉验收记录](design-qa.md)
- [Imagegen 资产说明](docs/design/imagegen-assets.md)

## License

[MIT](LICENSE)
