import {
  File as FileIcon,
  FileImage,
  PaperPlaneTilt,
  Plus,
  SpinnerGap,
  Stop,
  X,
} from "@phosphor-icons/react";
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  attachmentKind,
  formatAttachmentSize,
  preparePromptAttachments,
  validateAttachmentSelection,
} from "../lib/attachments";
import { detectAppPlatform, sendShortcut } from "../lib/platform";
import type { PromptAttachment } from "../types";

interface ComposerProps {
  busy: boolean;
  disabled?: boolean;
  onSend: (text: string, attachments: PromptAttachment[]) => Promise<void>;
  onCancel: () => Promise<void>;
}

interface SelectedAttachment {
  id: string;
  file: File;
  previewUrl: string | null;
}

const createAttachmentId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function Composer({
  busy,
  disabled = false,
  onSend,
  onCancel,
}: ComposerProps) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<SelectedAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const keyboardShortcut = sendShortcut(detectAppPlatform());

  useEffect(
    () => () => {
      attachmentsRef.current.forEach((attachment) => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      });
    },
    [],
  );

  const clearAttachments = () => {
    attachments.forEach((attachment) => {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    });
    setAttachments([]);
    if (fileInput.current) fileInput.current.value = "";
  };

  const addFiles = (incoming: File[]) => {
    if (disabled || incoming.length === 0) return;
    const validation = validateAttachmentSelection(
      attachments.map((attachment) => attachment.file),
      incoming,
    );
    const next = validation.accepted.map((file) => ({
      id: createAttachmentId(),
      file,
      previewUrl:
        attachmentKind(file) === "image" ? URL.createObjectURL(file) : null,
    }));
    if (next.length > 0) setAttachments((current) => [...current, ...next]);
    setAttachmentError(validation.errors[0] ?? null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const removeAttachment = (id: string) => {
    setAttachments((current) => {
      const target = current.find((attachment) => attachment.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((attachment) => attachment.id !== id);
    });
    setAttachmentError(null);
  };

  const submit = async () => {
    const text = value.trim();
    if ((!text && attachments.length === 0) || busy || preparing || disabled) return;

    setPreparing(true);
    setAttachmentError(null);
    try {
      const prepared = await preparePromptAttachments(
        attachments.map((attachment) => attachment.file),
      );
      setPreparing(false);
      setValue("");
      clearAttachments();
      await onSend(text, prepared);
      textarea.current?.focus();
    } catch (cause) {
      setAttachmentError(String(cause).replace(/^Error:\s*/, ""));
    } finally {
      setPreparing(false);
    }
  };

  const onDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || !event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || !event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!dragging) return;
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  };

  const composerBusy = busy || preparing;
  const canSend = Boolean(value.trim() || attachments.length > 0);

  return (
    <div
      className={`composer ${composerBusy ? "is-busy" : ""} ${dragging ? "is-dragging" : ""}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        ref={fileInput}
        className="composer__file-input"
        type="file"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => addFiles(Array.from(event.target.files ?? []))}
      />

      {attachments.length > 0 ? (
        <div className="composer__attachments" aria-label="Selected attachments">
          {attachments.map((attachment) => {
            const kind = attachmentKind(attachment.file);
            return (
              <div className="attachment-chip" key={attachment.id}>
                {attachment.previewUrl ? (
                  <img src={attachment.previewUrl} alt="" />
                ) : (
                  <span className="attachment-chip__icon" aria-hidden="true">
                    {kind === "image" ? <FileImage size={17} /> : <FileIcon size={17} />}
                  </span>
                )}
                <span className="attachment-chip__copy">
                  <strong title={attachment.file.name}>{attachment.file.name}</strong>
                  <small>{formatAttachmentSize(attachment.file.size)}</small>
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(attachment.id)}
                  disabled={composerBusy}
                  aria-label={`Remove ${attachment.file.name}`}
                >
                  <X size={12} weight="bold" />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

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

      {attachmentError ? (
        <div className="composer__error" role="alert">
          {attachmentError}
        </div>
      ) : null}

      <div className="composer__toolbar">
        <div className="composer__tools">
          <button
            type="button"
            className="icon-button composer__add"
            onClick={() => fileInput.current?.click()}
            disabled={disabled || composerBusy}
            aria-label="Add files or images"
            title="Add files or images"
          >
            <Plus size={17} weight="bold" />
          </button>
          <span className="keyboard-hint">
            Add or drop files · {keyboardShortcut} to send
          </span>
        </div>
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
            disabled={!canSend || composerBusy || disabled}
          >
            {preparing ? (
              <SpinnerGap size={17} weight="bold" className="spin" />
            ) : (
              <PaperPlaneTilt size={17} weight="fill" />
            )}
            {preparing ? "Preparing" : "Send"}
          </button>
        </div>
      </div>

      {dragging ? (
        <div className="composer__drop-overlay" aria-hidden="true">
          <FileImage size={24} />
          <strong>Drop files to attach</strong>
          <span>Images, text, PDFs, and other workspace files</span>
        </div>
      ) : null}
    </div>
  );
}
