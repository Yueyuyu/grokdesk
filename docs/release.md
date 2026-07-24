# GrokDesk 发布维护手册

## 信任边界

GrokDesk 使用两套不同的签名：

1. **Updater 签名是强制项。** `TAURI_SIGNING_PRIVATE_KEY` 生成 `.sig`，客户端使用 `src-tauri/tauri.conf.json` 中的公钥验证更新包。SHA256 只用于人工下载校验，不能替代 Updater 签名。
2. **操作系统代码签名是可选证书接入。** Windows Authenticode、macOS Developer ID 和 Apple 公证需要外部付费证书。Release 工作流在对应 Secrets 存在时启用并强制验证；未配置时必须在 Release 说明中明确标为未签名或未公证。

Updater 私钥一旦丢失，已安装客户端将无法验证后续版本。私钥、密码和恢复方式必须在仓库外至少保留一份受控备份，不能提交到 Git、Issue、日志或安装包。

## GitHub Secrets

强制：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

可选 Windows Authenticode：

- `WINDOWS_CERTIFICATE_BASE64`
- `WINDOWS_CERTIFICATE_PASSWORD`

可选 macOS Developer ID 与公证：

- `APPLE_CERTIFICATE_BASE64`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

## 发版前同步

版本号必须同时出现在以下位置：

- `package.json` 与 `package-lock.json`
- `src-tauri/Cargo.toml` 与 `src-tauri/Cargo.lock`
- `src-tauri/tauri.conf.json`
- `src-tauri/icons/GrokDesk-v<version>.ico`
- `src-tauri/windows/versioned-shortcut.wxs`

运行：

```bash
npm run release:check-version
npm test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
```

## Release 工作流闭环

推送与版本一致的 `v*` 标签后，`.github/workflows/release.yml` 会：

1. 在 Windows、macOS Apple Silicon 与 macOS Intel 上重复运行前端和 Rust 测试。
2. 使用 Updater 私钥生成 Windows 安装器签名及两个 macOS `.app.tar.gz` 签名。
3. 对 Windows EXE/MSI 结构、版本化快捷方式图标、MSI 修复动作、macOS DMG、App 元数据和代码签名状态做冒烟检查。
4. 使用提交到应用中的公钥重新验证每个 Updater 包的 `.sig`。
5. 生成包含三个平台的 `latest.json` 与 `SHA256SUMS.txt`。
6. 创建公开 Release 后重新匿名下载全部资产，复核 SHA256 和 Manifest 结构。
7. 只删除第三旧及更早的公开 Release，保留 Git 标签和提交历史。

Release 失败时不得手动宣称已发布。必须修复失败环节、重新运行，并验证公开资产可匿名下载。
