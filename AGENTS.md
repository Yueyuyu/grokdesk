# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## GrokDesk accepted product decisions

- The visual source of truth is `docs/design/grokdesk-light-concept.png`.
- Preserve the three-region task command center: workspace/task navigation, active task timeline, and changes/terminal/context inspector.
- The light theme ships first. Keep shared `light`, `dark`, and `system` theme tokens so dark mode is a theme mapping, not a separate layout.
- Use true white for the main task surface, cool gray for navigation, and a subtle cool tint for the inspector. Blue is the persistent primary/action color; green is success-only.
- The desktop shell is Tauri + React. Use the installed official `grok` binary through `grok agent stdio`; do not reimplement the Grok Build agent or store OAuth tokens in this project.
- Authentication stays with the official CLI through `grok login --oauth`.
- After browser OAuth succeeds, the initiating desktop client must show an explicit success result, restart ACP so it reads the new credentials, and refresh all account information that the official CLI exposes. Do not rely solely on a fire-and-forget desktop event for login completion.
- GrokDesk is single-instance. Opening the desktop shortcut again must focus the existing window so OAuth completion and account state cannot land in a different app process.
- Never fabricate subscription tier or quota values. If the installed official CLI does not expose billing data, show that limitation explicitly and link users to the official SuperGrok management page.
- Windows installation automatically creates a GrokDesk desktop shortcut; shortcut presence is part of release verification.
- The Windows shortcut must use a versioned `.ico` path bundled beside the executable so Explorer cannot reuse stale icon-cache pixels. Release verification must inspect the icon as rendered on the real desktop, not only the source file's alpha channel.
- First launch must offer one-click installation of the official Grok Runtime so users do not need to open a terminal first.
- Grok OAuth login and SuperGrok subscription management must remain visible in onboarding and Settings.
- Browser previews must clearly identify simulated install/login data and must never default to a fake signed-in state.
- v0.1.8 establishes the real workspace review loop: users explicitly choose a project folder; Git status and unified diffs come from that folder; accepting stages only the selected file; undoing acceptance unstages it; reverting is always confirmed and never performs an automatic bulk rollback.
- The Changes inspector must state that it includes every Git change in the workspace, including edits that may predate the active Grok task. Development-only simulated changes must be explicitly labeled and must never ship as default product data.
- Plugins and MCP pages must display and mutate only data returned by the installed official Grok CLI. Browser previews remain read-only and never invent extension records.
- Plugin installation and every plugin or MCP removal require explicit user confirmation. Configuration changes must tell users to reconnect ACP before expecting the active Grok session to see them.
- GrokDesk must not request, display, log, or persist MCP tokens and headers. Credentialed servers should rely on official Runtime OAuth or environment-variable references configured outside GrokDesk.
- The task result area scrolls independently. Tools stay docked above the composer, default to the five most recent activities, and offer a working expand/collapse control.
- Agent responses use safe GFM Markdown rendering for headings, lists, links, tables, quotes, inline code, and code blocks; raw HTML remains disabled.
- The composer supports multi-select and drag-and-drop for files and images, with preview, removal, explicit limits, and real ACP capability checks. Attachment contents are turn-scoped and must never be persisted in task history.
- The repository root `README.md` is Simplified Chinese by default. Keep English, Japanese, Korean, and German translations in `README.en.md`, `README.ja.md`, `README.ko.md`, and `README.de.md`, with a language switcher in every file.
- Every README language version starts with the same complete project hero: the real GrokDesk icon, a localized one-line product description, language switcher, truthful live GitHub/release badges, download and section shortcuts, and the actual technology stack. Never add fake community, popularity, ranking, demo, or platform badges.
- Use the public `openai/codex` product and repository as a maturity benchmark for thread lifecycle, permissions and sandbox transparency, background terminals, search, diagnostics, skills, MCP, and keyboard-driven workflows. Preserve GrokDesk's official Grok CLI/ACP boundary: do not copy Codex branding or private behavior, import its auth/protocol, or expose a feature that the installed Grok Runtime cannot support truthfully.
- The Terminal inspector has separate Workspace and ACP log views. Workspace commands run only after explicit user input, are scoped to the selected folder, can stop their process tree, and never persist terminal output in task history. Browser previews remain read-only and never simulate command execution.
