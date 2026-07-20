import {
  ArrowSquareOut,
  Check,
  FolderOpen,
  GithubLogo,
  Globe,
  PlugsConnected,
  PuzzlePiece,
  ShieldCheck,
  Sparkle,
} from "@phosphor-icons/react";
import type { RuntimeStatus, ThemePreference } from "../types";

interface FeaturePanelProps {
  kind: "plugins" | "mcp" | "settings";
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  workspacePath: string;
  onChooseWorkspace: () => void;
  runtime: RuntimeStatus | null;
  connected: boolean;
  onConnect: () => Promise<unknown>;
  onDisconnect: () => Promise<void>;
  onSignIn: () => Promise<void>;
}

const pluginRows = [
  { name: "GitHub", detail: "Issues, pull requests, checks, and review context", icon: GithubLogo, enabled: true },
  { name: "Browser", detail: "Inspect and verify local product surfaces", icon: Globe, enabled: true },
  { name: "Security review", detail: "Run focused checks before changes ship", icon: ShieldCheck, enabled: false },
];

const mcpRows = [
  { name: "filesystem", detail: "stdio · workspace-scoped", status: "Connected" },
  { name: "github", detail: "HTTP · OAuth", status: "Connected" },
  { name: "linear", detail: "HTTP · OAuth", status: "Sign in" },
];

export function FeaturePanel({
  kind,
  theme,
  onThemeChange,
  workspacePath,
  onChooseWorkspace,
  runtime,
  connected,
  onConnect,
  onDisconnect,
  onSignIn,
}: FeaturePanelProps) {
  const authenticationState = connected
    ? "verified"
    : runtime?.authenticationState;
  const authenticationLabel =
    authenticationState === "verified"
      ? "Signed in"
      : authenticationState === "configured"
        ? "Credentials found · connect to verify"
        : "Sign in required";

  if (kind === "plugins") {
    return (
      <main className="feature-panel">
        <header className="feature-panel__header">
          <span className="feature-panel__icon"><PuzzlePiece size={22} /></span>
          <div><h1>Plugins</h1><p>Extend Grok Build without leaving the task workspace.</p></div>
          <button type="button" className="primary-button"><Sparkle size={16} /> Browse plugins</button>
        </header>
        <div className="settings-list">
          {pluginRows.map(({ name, detail, icon: Icon, enabled }) => (
            <div className="settings-row" key={name}>
              <span className="settings-row__icon"><Icon size={20} /></span>
              <span><strong>{name}</strong><small>{detail}</small></span>
              <button type="button" className={`toggle ${enabled ? "is-on" : ""}`} aria-label={`${enabled ? "Disable" : "Enable"} ${name}`}>
                <span />
              </button>
            </div>
          ))}
        </div>
      </main>
    );
  }

  if (kind === "mcp") {
    return (
      <main className="feature-panel">
        <header className="feature-panel__header">
          <span className="feature-panel__icon"><PlugsConnected size={22} /></span>
          <div><h1>MCP servers</h1><p>Tools and context exposed to the active Grok Build session.</p></div>
          <button type="button" className="primary-button">Add server</button>
        </header>
        <div className="settings-list">
          {mcpRows.map((server) => (
            <div className="settings-row" key={server.name}>
              <span className="mcp-health"><span /></span>
              <span><strong>{server.name}</strong><small>{server.detail}</small></span>
              <button type="button" className={server.status === "Sign in" ? "secondary-button" : "plain-status"}>
                {server.status === "Connected" ? <Check size={14} weight="bold" /> : null}{server.status}
              </button>
            </div>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="feature-panel feature-panel--settings">
      <header className="feature-panel__header">
        <div><h1>Settings</h1><p>Runtime, workspace, and appearance preferences.</p></div>
      </header>

      <section className="settings-section">
        <h2>Appearance</h2>
        <div className="theme-control" role="group" aria-label="Theme">
          {(["light", "dark", "system"] as ThemePreference[]).map((option) => (
            <button type="button" key={option} className={theme === option ? "is-active" : ""} onClick={() => onThemeChange(option)}>
              {option[0].toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h2>Workspace</h2>
        <div className="workspace-path">
          <FolderOpen size={18} />
          <span title={workspacePath}>{workspacePath}</span>
          <button type="button" className="secondary-button" onClick={onChooseWorkspace}>Choose folder</button>
        </div>
      </section>

      <section className="settings-section">
        <h2>Grok Build runtime</h2>
        <div className="runtime-summary">
          <div>
            <span className={`status-dot ${runtime?.available ? "status-dot--green" : "status-dot--amber"}`} />
            <span><strong>{runtime?.version || "Checking runtime…"}</strong><small>{runtime?.executablePath || "grok executable not found"}</small></span>
          </div>
          <dl>
            <div><dt>Official OAuth</dt><dd>{authenticationLabel}</dd></div>
            <div><dt>ACP transport</dt><dd>{connected ? "Connected" : "Ready"}</dd></div>
            <div><dt>Command</dt><dd><code>grok agent stdio</code></dd></div>
          </dl>
          <div className="runtime-summary__actions">
            {authenticationState === "missing" || authenticationState === "expired" ? <button type="button" className="primary-button" onClick={() => void onSignIn()}><ArrowSquareOut size={16} /> Sign in with Grok</button> : null}
            <button type="button" className="secondary-button" onClick={() => void (connected ? onDisconnect() : onConnect()).catch(() => undefined)}>
              {connected ? "Disconnect ACP" : "Connect ACP"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
