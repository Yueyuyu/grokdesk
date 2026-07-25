import { MagnifyingGlass, Minus, Square, X } from "@phosphor-icons/react";
import appIcon from "../assets/grokdesk-icon.png";
import { useI18n } from "../i18n/I18nProvider";
import { windowActions } from "../lib/desktop";
import {
  commandPaletteShortcut,
  detectAppPlatform,
} from "../lib/platform";

export function TitleBar({
  onCommandPaletteIntent,
  onOpenCommandPalette,
}: {
  onCommandPaletteIntent: () => void;
  onOpenCommandPalette: () => void;
}) {
  const { t } = useI18n();
  const platform = detectAppPlatform();
  const macos = platform === "macos";

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar__brand" data-tauri-drag-region>
        <img src={appIcon} alt="" className="titlebar__logo" />
        <span>{t("app.name")}</span>
      </div>
      <div className="titlebar__drag" data-tauri-drag-region />
      <button
        type="button"
        className="titlebar__command-trigger"
        onClick={onOpenCommandPalette}
        onFocus={onCommandPaletteIntent}
        onPointerEnter={onCommandPaletteIntent}
        aria-label={t("titlebar.searchAria")}
        title={`${t("titlebar.searchAria")} (${commandPaletteShortcut(platform)})`}
      >
        <MagnifyingGlass size={14} />
        <span>{t("titlebar.search")}</span>
        <kbd>{commandPaletteShortcut(platform)}</kbd>
      </button>
      {macos ? null : (
        <div className="window-controls" aria-label={t("titlebar.windowControls")}>
          <button
            type="button"
            aria-label={t("titlebar.minimize")}
            onClick={() => void windowActions.minimize()}
          >
            <Minus size={14} weight="regular" />
          </button>
          <button
            type="button"
            aria-label={t("titlebar.maximize")}
            onClick={() => void windowActions.toggleMaximize()}
          >
            <Square size={12} weight="regular" />
          </button>
          <button
            type="button"
            className="window-controls__close"
            aria-label={t("titlebar.close")}
            onClick={() => void windowActions.close()}
          >
            <X size={14} weight="regular" />
          </button>
        </div>
      )}
    </header>
  );
}
