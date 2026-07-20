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
- Windows installation automatically creates a GrokDesk desktop shortcut; shortcut presence is part of release verification.
- First launch must offer one-click installation of the official Grok Runtime so users do not need to open a terminal first.
- Grok OAuth login and SuperGrok subscription management must remain visible in onboarding and Settings.
- Browser previews must clearly identify simulated install/login data and must never default to a fake signed-in state.
