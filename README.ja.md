<p align="center">
  <img src="src/assets/grokdesk-icon.png" width="112" alt="GrokDesk アイコン" />
</p>

<h1 align="center">GrokDesk</h1>

<p align="center">公式 Grok Build を、見やすくレビュー可能な Windows デスクトップ・ワークスペースへ。</p>

<p align="center">
  <a href="README.md">简体中文</a> ·
  <a href="README.en.md">English</a> ·
  <strong>日本語</strong> ·
  <a href="README.ko.md">한국어</a> ·
  <a href="README.de.md">Deutsch</a>
</p>

<p align="center">
  <a href="https://github.com/Yueyuyu/grokdesk/releases/latest"><img alt="最新リリース" src="https://img.shields.io/github/v/release/Yueyuyu/grokdesk?display_name=tag&amp;sort=semver&amp;style=flat-square&amp;color=2563eb" /></a>
  <a href="https://github.com/Yueyuyu/grokdesk/actions/workflows/ci.yml"><img alt="継続的インテグレーション" src="https://github.com/Yueyuyu/grokdesk/actions/workflows/ci.yml/badge.svg?branch=main" /></a>
  <a href="https://github.com/Yueyuyu/grokdesk/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/Yueyuyu/grokdesk?style=flat-square&amp;color=f59e0b" /></a>
  <a href="https://github.com/Yueyuyu/grokdesk/forks"><img alt="GitHub Forks" src="https://img.shields.io/github/forks/Yueyuyu/grokdesk?style=flat-square" /></a>
  <a href="https://github.com/Yueyuyu/grokdesk/issues"><img alt="GitHub Issues" src="https://img.shields.io/github/issues/Yueyuyu/grokdesk?style=flat-square" /></a>
  <a href="https://github.com/Yueyuyu/grokdesk/releases"><img alt="総ダウンロード数" src="https://img.shields.io/github/downloads/Yueyuyu/grokdesk/total?style=flat-square&amp;color=16a34a" /></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/github/license/Yueyuyu/grokdesk?style=flat-square&amp;color=16a34a" /></a>
</p>

<p align="center">
  <a href="https://github.com/Yueyuyu/grokdesk/releases/latest"><strong>最新版をダウンロード</strong></a> ·
  <a href="#主な機能">機能</a> ·
  <a href="#インストールと初回起動">インストール</a> ·
  <a href="#ローカル開発">開発</a> ·
  <a href="#現在の制限とロードマップ">ロードマップ</a>
</p>

<p align="center">
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square&amp;logo=tauri&amp;logoColor=white" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149ECA?style=flat-square&amp;logo=react&amp;logoColor=white" />
  <img alt="TypeScript 5.9" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&amp;logo=typescript&amp;logoColor=white" />
  <img alt="Rust" src="https://img.shields.io/badge/Rust-native-000000?style=flat-square&amp;logo=rust&amp;logoColor=white" />
  <img alt="ACP" src="https://img.shields.io/badge/Protocol-ACP-7C3AED?style=flat-square" />
  <img alt="Windows 10/11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=flat-square&amp;logo=windows11&amp;logoColor=white" />
</p>

> [!IMPORTANT]
> GrokDesk は独立した非公式のオープンソースプロジェクトです。xAI との提携、後援、公式承認はありません。「Grok」「Grok Build」および関連する商標は、それぞれの権利者に帰属します。

![GrokDesk の3ペイン・タスクワークスペース](docs/design/grokdesk-implementation-1440x1024.png)

## GrokDesk の目的

Agent 本体には公式 Grok Build CLI をそのまま使用します。GrokDesk は、タスク履歴、ストリーミング応答、プラン、Tools、権限確認、Git 変更、ターミナル情報を1つの3ペイン画面にまとめ、認証や Agent を独自実装せずにデスクトップ体験を改善します。

## 主な機能

| 機能 | 現在の動作 |
| --- | --- |
| 実 ACP セッション | 公式 `grok agent stdio` を起動し、`session/new`、`session/load`、ストリーミング、キャンセル、権限確認に対応 |
| 読みやすい応答 | GFM Markdown の見出し、リスト、タスクリスト、リンク、表、引用、インラインコード、コピー可能なコードブロックを安全に表示 |
| 安定したスクロール | 応答領域は独立してスクロールし、上に戻った後はストリーミングで強制的に最下部へ移動しません。「Back to latest」で追従を再開できます |
| 固定 Tools ドック | Tools は入力欄の上に固定され、直近5件を表示。必要に応じて全件を展開できます |
| ファイルと画像 | 複数選択、ドラッグ＆ドロップ、プレビュー、削除、添付のみの送信に対応。ACP の image/resource として実際に送信 |
| ワークスペースレビュー | 明示的なフォルダー選択、実 Git ステータスと Unified Diff、ファイル単位の stage/unstage、確認付き revert |
| 実ワークスペースターミナル | 選択したプロジェクトで PowerShell を実行し、stdout/stderr、コマンド履歴、プロセスツリー停止、独立した ACP ログ表示に対応 |
| バックグラウンドターミナルとテスト結果 | 最大8個の独立ターミナルタブを並列実行し、作成・名前変更・終了・タブ単位の停止に対応。実際の Vitest、Cargo、Jest、Node 出力から成功数、失敗数、所要時間を抽出 |
| Runtime とログイン | 公式 Grok Runtime のワンクリック導入と `grok login --oauth` による認証 |
| Plugins と MCP | 公式 Runtime が公開する実際の Plugin、Marketplace、MCP 設定を表示・管理 |
| Runtime コンテキストと Skills | 公式 `grok inspect --json` から現在のワークスペースのプロジェクト指示、Skills、Agents、設定レイヤーを読み取り、アクティブな ACP セッションが報告する機能を組み合わせます。更新と明示的な ACP 再接続に対応し、ブラウザでは記録を模擬しません |
| モデルと推論プロファイル | 公式 ACP 初期化メタデータだけからモデル、コンテキストウィンドウ、推論強度を表示し、公式の `--model` と `--reasoning-effort` 引数でタスクを起動します。保存済み会話があるタスクを暗黙に再起動しません |
| ローカル履歴 | ワークスペース単位でタスク、メッセージ、プラン、Tools、ACP Session ID を保存。添付内容は保存しません |
| タスクのライフサイクル | アーカイブ/復元、新しい ACP Session を使うローカル分岐、8 MiB 上限と厳格な構造検証付き JSON の明示的なインポート/エクスポートに対応。認証情報と添付本文は含めません |
| コマンドパレットとタスク横断検索 | `Ctrl+K` で現在のワークスペース内の通常/アーカイブ済みタスクをタイトル、会話、添付名、プラン、Tools から検索し、ナビゲーション、タスク、ワークスペース、インスペクターのコマンドを実行 |
| 権限センターと実行監査 | ワークスペース単位で、マスキング済みの権限判断、Grok ツールのライフサイクル、ターミナルコマンドの結果を記録。フィルター、検索、確認付き削除に対応し、ブラウザプレビューでは監査記録を模擬生成しません |
| 診断センターとサポートレポート | GrokDesk、Runtime、OAuth、ACP、ワークスペース/Git、MCP を実際に確認し、実行可能な修復導線とマスキング済み Markdown レポートを提供。ブラウザプレビューでは健康状態を模擬しません |
| デスクトップシェル | 単一インスタンス、幅調整可能な3ペイン、折りたたみ可能なインスペクター、Light/Dark/System テーマ、デスクトップショートカット |

### 添付ファイルの制限

- 最大8件、1ファイル8 MiB、合計24 MiBまで。
- 画像は ACP `image`、テキストやその他のファイルは ACP `resource` を使用します。
- ACP 初期化結果の `promptCapabilities` を確認し、公式 Runtime が必要な機能を公開していない場合は明確なエラーを表示します。
- 履歴に保存するのはファイル名、MIME、サイズ、種類のみで、本文や Base64 データは保存しません。
- ブラウザプレビューは操作のデモのみで、実際の Grok アカウントへ添付を送信しません。

## インストールと初回起動

Windows 版は [GitHub Releases](https://github.com/Yueyuyu/grokdesk/releases) からダウンロードできます。インストール時に GrokDesk のデスクトップショートカットが自動作成されます。

初回起動時：

1. **Install Runtime** を選び、xAI 公式の HTTPS インストーラーを実行します。
2. **Sign in with Grok** を選び、システムブラウザで公式 OAuth を完了します。
3. プロジェクトフォルダーを選び、タスクを作成または開きます。
4. 必要に応じて Onboarding または Settings から公式 SuperGrok 管理ページを開きます。

Grok Build を事前に手動ダウンロードする必要はありません。OAuth 資格情報は公式 CLI が管理し、GrokDesk は Token を保存しません。

> [!NOTE]
> 契約プランと利用量は、公式 CLI が billing データを返した場合のみ表示されます。利用できない場合は制限を明示し、架空の値ではなく公式管理ページへのリンクを表示します。

## 仕組み

```mermaid
flowchart LR
  UI[React デスクトップ UI] -->|Tauri commands| Native[Rust ネイティブブリッジ]
  Native -->|JSON-RPC / stdio| CLI[公式 Grok Build CLI]
  CLI -->|OAuth とモデルサービス| XAI[xAI]
  Native --> Git[ローカル Git ワークスペース]
```

ネイティブ層はプロセス、ACP、システムブラウザ、Runtime 導入、Git 操作を担当し、React 層はタスク、会話、Tools、添付、レビュー、設定を担当します。公式 Agent を複製したり、別の Grok サービスを実装したりしません。

## ローカル開発

### 必要環境

- Windows 10/11
- Node.js 20+
- Rust stable（MSVC toolchain）
- Visual Studio 2022 Build Tools の **Desktop development with C++**
- WebView2 Runtime

### 起動

```powershell
npm ci
npm run tauri:dev
```

React UI のみをブラウザで確認する場合：

```powershell
npm run dev
```

ブラウザプレビューでは Runtime、ログイン、Tools、添付結果がシミュレーションであることを明示します。実ファイル、実アカウント、実 ACP へアクセスするのはインストール版または Tauri 開発版のみです。

### 検証

```powershell
npm test
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri:build
```

生成物は `src-tauri/target/release/bundle/` に出力されます。

## プライバシーと安全性

- OAuth 資格情報は公式 Grok CLI が保存・更新します。
- GrokDesk は OAuth Token を読み取り、表示、永続化しません。
- Runtime の導入は、ユーザーの明示操作後にのみ公式 `https://x.ai/cli/install.ps1` を実行します。
- ACP と Git 操作は、ユーザーが選んだフォルダーに限定されます。
- ワークスペースターミナルはユーザーが明示的に入力したコマンドだけを実行し、生の出力と構造化テスト概要は現在のアプリセッション内にのみ保持されます。
- 添付内容は現在の送信ターンでのみエンコードされ、タスク履歴には保存されません。
- タスク JSON はユーザーが明示的に操作した場合のみインポート/エクスポートされます。会話、ファイル名、ワークスペースパスを含む場合がありますが、OAuth/MCP 認証情報、ACP Session ID、添付本文は含みません。
- コマンドパレットは現在のワークスペースに保存されたローカルタスクだけを検索し、検索語や結果を外部サービスへ送信しません。
- 権限と実行の履歴はローカルかつワークスペース単位で保存され、30 日・500 件を上限とします。ターミナル出力、プロンプト、応答、添付本文、OAuth Token、MCP Header は記録せず、機密性のあるコマンド引数は保存前にマスキングします。
- 診断レポートに含まれるのはバージョン、プラットフォーム、集計値、管理された状態説明だけです。絶対パス、アカウント識別子、プロンプト、応答、ターミナル出力、添付、OAuth 資格情報、MCP の名前・エンドポイント・Header は除外またはマスキングされます。
- Context Inspector は公式 Runtime 出力の安全な投影だけを表示し、資格情報の値、絶対ソースパス、MCP の名前・エンドポイント・Header をフロントエンドへ渡しません。
- モデルプロファイルに保存するのは検証済みのモデル ID と推論強度 ID だけです。モデル一覧は公式 Runtime から取得し、ブラウザプレビューでは模擬せず、アカウント資格情報も読み取り・保存しません。
- ファイルの revert は必ず確認を要求し、自動一括ロールバックは行いません。
- Markdown の生 HTML は無効で、外部リンクは分離された新規ウィンドウで開きます。

## 現在の制限とロードマップ

- 現在は Windows を優先しており、macOS/Linux の正式パッケージはまだありません。
- Runtime のワンクリック導入は Windows のみです。
- 添付対応は、インストール済みの公式 Runtime が公開する ACP 機能に依存します。
- 契約プランと利用量は、公式 CLI の billing メソッドに依存します。
- ターミナルは現在、完全な PTY/TTY セッションではなく非対話型 PowerShell コマンドを実行します。
- Skills は現在 Context Inspector で読み取り専用です。公式 CLI は検出結果を公開しますが独立した Skills 管理コマンドはないため、導入と更新は所属 Plugin から行います。
- デバイス間同期は今後の予定です。

## コントリビューション

Issue と Pull Request を歓迎します。1つの PR は1つの論理変更に絞り、送信前に関連テストとビルドを実行してください。公開 Issue に Token、アカウント情報、非公開ワークスペースの内容を添付しないでください。

## デザイン資料

- [ビジュアルソース](docs/design/grokdesk-light-concept.png)
- [実装インベントリ](docs/design/implementation-inventory.md)
- [ビジュアル QA](design-qa.md)
- [Imagegen アセットノート](docs/design/imagegen-assets.md)

## License

[MIT](LICENSE)
