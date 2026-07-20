import { ShieldCheck, X } from "@phosphor-icons/react";
import type { PermissionOption, PermissionRequest } from "../types";

interface PermissionDialogProps {
  request: PermissionRequest;
  onAnswer: (option: PermissionOption | null) => Promise<void>;
}

export function PermissionDialog({ request, onAnswer }: PermissionDialogProps) {
  const allowOptions = request.options.filter((option) => !option.kind?.includes("reject"));
  const denyOption = request.options.find((option) => option.kind?.includes("reject"));

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="permission-dialog" role="dialog" aria-modal="true" aria-labelledby="permission-title">
        <header>
          <span><ShieldCheck size={21} /></span>
          <div><h2 id="permission-title">{request.title}</h2><p>{request.description}</p></div>
          <button type="button" className="icon-button" onClick={() => void onAnswer(null)} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="permission-dialog__actions">
          <button type="button" className="secondary-button" onClick={() => void onAnswer(denyOption || null)}>Deny</button>
          {allowOptions.map((option, index) => (
            <button type="button" className={index === 0 ? "primary-button" : "secondary-button"} key={option.optionId} onClick={() => void onAnswer(option)}>
              {option.name}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
