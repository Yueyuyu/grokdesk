import { Info, ShieldCheck, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { PermissionOption, PermissionRequest } from "../types";

interface PermissionDialogProps {
  request: PermissionRequest;
  onAnswer: (option: PermissionOption | null) => Promise<void>;
}

export function PermissionDialog({ request, onAnswer }: PermissionDialogProps) {
  const [answering, setAnswering] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isDenyOption = (option: PermissionOption) =>
    /reject|deny/i.test(option.kind ?? "") || /reject|deny/i.test(option.name);
  const allowOptions = request.options.filter((option) => !isDenyOption(option));
  const denyOption = request.options.find(isDenyOption);

  useEffect(() => {
    setAnswering(null);
    setError(null);
  }, [request.auditEventId]);

  const answer = async (option: PermissionOption | null, actionId: string) => {
    if (answering) return;
    setAnswering(actionId);
    setError(null);
    try {
      await onAnswer(option);
    } catch (cause) {
      setError(String(cause).replace(/^Error:\s*/, ""));
      setAnswering(null);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="permission-dialog" role="dialog" aria-modal="true" aria-labelledby="permission-title">
        <header>
          <span><ShieldCheck size={21} /></span>
          <div><h2 id="permission-title">{request.title}</h2><p>{request.description}</p></div>
          <button type="button" className="icon-button" disabled={Boolean(answering)} onClick={() => void answer(null, "cancel")} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="permission-dialog__notice">
          <Info size={15} />
          <span>This decision is recorded locally. Prompts, responses, terminal output, and credentials are not stored in permission history.</span>
        </div>
        <div className="permission-dialog__actions">
          {error ? <span className="permission-dialog__error" role="alert">{error}</span> : null}
          <button type="button" className="secondary-button" disabled={Boolean(answering)} onClick={() => void answer(denyOption || null, "deny")}>{answering === "deny" ? "Sending…" : "Deny"}</button>
          {allowOptions.map((option, index) => (
            <button type="button" className={index === 0 ? "primary-button" : "secondary-button"} disabled={Boolean(answering)} key={option.optionId} onClick={() => void answer(option, option.optionId)}>
              {answering === option.optionId ? "Sending…" : option.name}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
