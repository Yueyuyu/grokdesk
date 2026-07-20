import {
  At,
  CaretDown,
  GitBranch,
  PaperPlaneTilt,
  Plus,
  Stop,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";

interface ComposerProps {
  busy: boolean;
  onSend: (text: string) => Promise<void>;
  onCancel: () => Promise<void>;
}

export function Composer({ busy, onSend, onCancel }: ComposerProps) {
  const [value, setValue] = useState("");
  const [sendMenuOpen, setSendMenuOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const submit = async () => {
    const next = value.trim();
    if (!next || busy) return;
    setValue("");
    await onSend(next);
  };

  const insertMention = () => {
    setValue((current) => `${current}${current ? " " : ""}@`);
    textarea.current?.focus();
  };

  return (
    <div className={`composer ${busy ? "is-busy" : ""}`}>
      <textarea
        ref={textarea}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void submit();
          }
        }}
        rows={3}
        aria-label="Message Grok Build"
        placeholder="Ask Grok Build anything…"
      />
      <input
        ref={fileInput}
        type="file"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) setValue((current) => `${current}${current ? "\n" : ""}[${file.name}]`);
        }}
      />
      <div className="composer__toolbar">
        <div className="composer__tools">
          <button
            type="button"
            className="icon-button"
            aria-label="Attach file"
            onClick={() => fileInput.current?.click()}
          >
            <Plus size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Mention context"
            onClick={insertMention}
          >
            <At size={18} />
          </button>
          <button type="button" className="branch-button">
            <GitBranch size={15} />
            <span>feature/oauth-refresh</span>
            <CaretDown size={11} />
          </button>
        </div>
        <div className="composer__actions">
          {busy ? (
            <button type="button" className="cancel-hint" onClick={() => void onCancel()}>
              <Stop size={13} weight="fill" />
              Stop
            </button>
          ) : (
            <span className="keyboard-hint">Ctrl Enter to send</span>
          )}
          <div className="send-button-group">
            <button
              type="button"
              className="primary-button composer__send"
              onClick={() => void submit()}
              disabled={!value.trim() || busy}
            >
              <PaperPlaneTilt size={17} weight="fill" />
              Send
            </button>
            <button
              type="button"
              className="primary-button composer__send-options"
              aria-label="More send options"
              aria-expanded={sendMenuOpen}
              onClick={() => setSendMenuOpen((open) => !open)}
              disabled={!value.trim() || busy}
            >
              <CaretDown size={13} weight="bold" />
            </button>
            {sendMenuOpen ? (
              <div className="send-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setSendMenuOpen(false); void submit(); }}>
                  <span>Send now</span>
                  <kbd>Ctrl ↵</kbd>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
