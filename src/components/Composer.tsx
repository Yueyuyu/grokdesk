import { PaperPlaneTilt, Stop } from "@phosphor-icons/react";
import { useRef, useState } from "react";

interface ComposerProps {
  busy: boolean;
  disabled?: boolean;
  onSend: (text: string) => Promise<void>;
  onCancel: () => Promise<void>;
}

export function Composer({
  busy,
  disabled = false,
  onSend,
  onCancel,
}: ComposerProps) {
  const [value, setValue] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);

  const submit = async () => {
    const next = value.trim();
    if (!next || busy || disabled) return;
    setValue("");
    await onSend(next);
    textarea.current?.focus();
  };

  return (
    <div className={`composer ${busy ? "is-busy" : ""}`}>
      <textarea
        ref={textarea}
        value={value}
        disabled={disabled}
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
      <div className="composer__toolbar">
        <span className="keyboard-hint">Ctrl Enter to send</span>
        <div className="composer__actions">
          {busy ? (
            <button
              type="button"
              className="cancel-hint"
              onClick={() => void onCancel()}
            >
              <Stop size={13} weight="fill" />
              Stop
            </button>
          ) : null}
          <button
            type="button"
            className="primary-button composer__send"
            onClick={() => void submit()}
            disabled={!value.trim() || busy || disabled}
          >
            <PaperPlaneTilt size={17} weight="fill" />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
