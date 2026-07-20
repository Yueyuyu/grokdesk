import { Minus, Square, X } from "@phosphor-icons/react";
import appIcon from "../assets/grokdesk-icon.png";
import { windowActions } from "../lib/desktop";

export function TitleBar() {
  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar__brand" data-tauri-drag-region>
        <img src={appIcon} alt="" className="titlebar__logo" />
        <span>GrokDesk</span>
      </div>
      <div className="titlebar__drag" data-tauri-drag-region />
      <div className="window-controls" aria-label="Window controls">
        <button
          type="button"
          aria-label="Minimize"
          onClick={() => void windowActions.minimize()}
        >
          <Minus size={14} weight="regular" />
        </button>
        <button
          type="button"
          aria-label="Maximize"
          onClick={() => void windowActions.toggleMaximize()}
        >
          <Square size={12} weight="regular" />
        </button>
        <button
          type="button"
          className="window-controls__close"
          aria-label="Close"
          onClick={() => void windowActions.close()}
        >
          <X size={14} weight="regular" />
        </button>
      </div>
    </header>
  );
}
