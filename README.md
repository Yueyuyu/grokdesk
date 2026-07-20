# GrokDesk

GrokDesk 是一个面向 Windows 的开源桌面客户端，把官方 Grok Build CLI 的任务执行、计划、工具调用、代码变更、测试、终端与上下文集中到一个三栏工作台中。

> [!IMPORTANT]
> GrokDesk 是独立、非官方的开源项目，与 xAI 不存在隶属、赞助或官方认可关系。“Grok”“Grok Build”和相关商标归其各自权利人所有。

![GrokDesk light interface](docs/design/grokdesk-implementation-1440x1024.png)

## 能做什么

- 在一个任务时间线里查看对话、执行计划和工具活动。
- 在 Changes、Terminal、Context 之间切换，并查看文件级 Diff 与测试结果。
- 发送新指令、接收流式回复、取消当前回合并处理 ACP 权限确认。
- 拖动左右分栏，折叠检查器，并在窄屏下自动切换为抽屉式检查器。
- 提供 Light、Dark、System 三套共享主题映射。
- 通过官方 Grok CLI 登录和运行，不在 GrokDesk 中保存 OAuth Token。

## 运行方式

GrokDesk 不重新实现 Grok Build Agent。原生端会：

1. 探测已安装的 grok 可执行文件及版本。
2. 通过官方命令 grok login --oauth 完成登录。
3. 启动 grok agent stdio。
4. 通过 ACP 执行 initialize、session/new、session/prompt，并处理流式 session/update、权限请求和取消。

如果界面显示 “Sign in required”，请先在终端完成官方 CLI 登录：

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

需要 Windows 10/11、Node.js 20+、Rust stable、Tauri 的 Windows 构建依赖，以及已安装的官方 grok CLI。

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
- 用户头像：src/assets/alex-chen.png

概念图、品牌图标和头像均通过内置 Imagegen 工作流生成。完整提示词与资产用途记录在 [docs/design/imagegen-assets.md](docs/design/imagegen-assets.md)；视觉验收记录见 [design-qa.md](design-qa.md)。

## 隐私与安全

- OAuth 凭据由官方 Grok CLI 管理。
- GrokDesk 不读取、不展示，也不持久化 OAuth Token。
- 工作区路径和任务内容只在用户触发 ACP 会话时发送给本机 Grok CLI。
- 请勿把密钥、Token 或生产环境凭据提交到仓库。

## 当前限制

- 目前优先支持 Windows 桌面端。
- 必须已安装官方 grok CLI。
- 完整的真实提示流需要有效的 Grok OAuth 登录；登录过期时，ACP initialize 仍可成功，但 session/new 会被官方 CLI 拒绝。

## License

[MIT](LICENSE)
