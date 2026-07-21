# GrokDesk

GrokDesk 是一个面向 Windows 的开源桌面客户端，通过 ACP 把官方 Grok Build CLI 的真实任务对话、计划、工具活动和运行上下文集中到一个三栏工作台中。

> [!IMPORTANT]
> GrokDesk 是独立、非官方的开源项目，与 xAI 不存在隶属、赞助或官方认可关系。“Grok”“Grok Build”和相关商标归其各自权利人所有。

![GrokDesk light interface design reference](docs/design/grokdesk-implementation-1440x1024.png)

## 能做什么

- 新建和切换多个真实任务，并按工作区在本机持久化任务标题、对话、计划和工具活动。
- 为每个任务保存官方 ACP Session ID，重启或切回任务时通过 `session/load` 恢复 Grok Build 上下文。
- 发送新指令、接收流式回复、自动滚动到最新回复、取消当前回合并处理 ACP 权限确认。
- 在 Changes、Terminal、Context 之间切换；Terminal 与 Context 已接入真实状态，Changes 会在 Git 集成完成前明确显示未接入状态。
- 拖动左右分栏，折叠检查器，并在窄屏下自动切换为抽屉式检查器。
- 提供 Light、Dark、System 三套共享主题映射。
- 通过官方 Grok CLI 登录和运行，不在 GrokDesk 中保存 OAuth Token。
- 首次启动可一键安装官方 Grok Runtime，并直接进入官方 OAuth 与 SuperGrok 订阅入口。

## 安装与首次启动

从 [GitHub Releases](https://github.com/Yueyuyu/grokdesk/releases) 下载最新的 Windows `.exe` 安装包。安装完成后，GrokDesk 会自动创建桌面快捷方式。

首次打开时按界面完成三步即可：

1. 点击“安装 Runtime”，由 GrokDesk 执行 xAI 官方 HTTPS 安装脚本。
2. 点击“使用 Grok 登录”，在官方 OAuth 页面登录或切换账号。
3. 如需订阅，点击“查看方案”或在 Settings 中打开官方 SuperGrok 页面。若当前官方 CLI 未开放套餐与额度接口，GrokDesk 会明确说明并引导到官方管理页。

不需要预先下载或手动打开 Grok Build。浏览器中的开发预览只模拟安装和登录状态，并会明确标注；真实安装与认证只发生在桌面应用中。

## 运行方式

GrokDesk 不重新实现 Grok Build Agent。原生端会：

1. 探测 grok 可执行文件及版本；缺失时可在界面内运行官方安装脚本。
2. 通过官方命令 grok login --oauth 完成登录。
3. 启动 grok agent stdio。
4. 通过 ACP 执行 initialize、session/new、session/load、session/prompt，并处理流式 session/update、权限请求和取消。

如果命令行环境需要手动登录，等价的官方命令是：

~~~powershell
grok login --oauth
~~~

## 技术栈

- Tauri 2
- React 19 + TypeScript
- Vite 6
- Rust
- ACP over stdio
- Phosphor Icons
- Inter

## 本地开发

需要 Windows 10/11、Node.js 20+、Rust stable 和 Tauri 的 Windows 构建依赖。官方 grok CLI 可由应用首次启动流程安装。

~~~powershell
npm ci
npm run dev
~~~

常用校验：

~~~powershell
npm test
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri:build
~~~

安装包会生成到 src-tauri/target/release/bundle/ 下。

## 设计与 Imagegen 资产

- 视觉源：docs/design/grokdesk-light-concept.png
- 最终实现：docs/design/grokdesk-implementation-1440x1024.png
- 完整并排对照：docs/design/grokdesk-design-comparison.png
- 局部对照：docs/design/grokdesk-focused-comparison.png
- 品牌图标：src/assets/grokdesk-icon.png

概念图和品牌图标通过内置 Imagegen 工作流生成。完整提示词与资产用途记录在 [docs/design/imagegen-assets.md](docs/design/imagegen-assets.md)；视觉验收记录见 [design-qa.md](design-qa.md)。

## 隐私与安全

- OAuth 凭据由官方 Grok CLI 管理。
- GrokDesk 不读取、不展示，也不持久化 OAuth Token。
- Runtime 安装只在用户点击后执行官方 `https://x.ai/cli/install.ps1` 脚本。
- 工作区路径和任务内容只在用户触发 ACP 会话时发送给本机 Grok CLI。
- 请勿把密钥、Token 或生产环境凭据提交到仓库。

## 当前限制

- 目前优先支持 Windows 桌面端。
- 一键 Runtime 安装目前仅在 Windows 桌面端提供。
- 完整的真实提示流需要有效的 Grok OAuth 登录；登录过期时，ACP initialize 仍可成功，但 session/new 会被官方 CLI 拒绝。
- Git status/diff、测试结果采集、附件、插件发现和 MCP 配置尚未接入；相关页面不会展示虚构数据。
- 套餐与额度只在官方 Grok CLI 实际提供 billing 数据时显示，否则使用官方 SuperGrok 管理入口。

## License

[MIT](LICENSE)
