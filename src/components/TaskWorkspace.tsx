import {
  ArrowClockwise,
  ArrowDown,
  CaretRight,
  ChatCircleDots,
  Check,
  Code,
  File,
  FileImage,
  FileText,
  Flask,
  FolderOpen,
  PencilSimple,
  Play,
  SpinnerGap,
  UserCircle,
  Wrench,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import appIcon from "../assets/grokdesk-icon.png";
import { formatAttachmentSize } from "../lib/attachments";
import type {
  ChatEntry,
  GrokTask,
  PlanStep,
  PromptAttachment,
  ToolActivity,
} from "../types";
import { Composer } from "./Composer";
import { MarkdownContent } from "./MarkdownContent";

interface TaskWorkspaceProps {
  task: GrokTask | null;
  busy: boolean;
  onSend: (text: string, attachments: PromptAttachment[]) => Promise<void>;
  onCancel: () => Promise<void>;
  onRetry: () => Promise<void>;
  workspaceReady: boolean;
  onChooseWorkspace: () => void;
  workspaceChangeCount: number;
  onRunTests: () => void;
  onReviewChanges: () => void;
}

function Message({ entry }: { entry: ChatEntry }) {
  const isAgent = entry.role === "agent";
  return (
    <article className={`message message--${entry.role}`}>
      {isAgent ? (
        <img
          src={appIcon}
          alt="Grok Build"
          className="message__avatar message__avatar--agent"
        />
      ) : (
        <span
          className="message__avatar message__avatar--user"
          aria-hidden="true"
        >
          <UserCircle size={23} weight="regular" />
        </span>
      )}
      <div className="message__body">
        <header>
          <strong>{entry.name}</strong>
          <time>{entry.time}</time>
        </header>
        {isAgent ? (
          <MarkdownContent
            content={entry.content || (entry.streaming ? "Thinking…" : "")}
          />
        ) : entry.content ? (
          <p className="message__plain">{entry.content}</p>
        ) : null}
        {entry.attachments && entry.attachments.length > 0 ? (
          <div className="message-attachments" aria-label="Message attachments">
            {entry.attachments.map((attachment, index) => (
              <span
                className="message-attachment"
                key={`${attachment.name}-${attachment.size}-${index}`}
                title={`${attachment.name} · ${attachment.mimeType}`}
              >
                {attachment.kind === "image" ? (
                  <FileImage size={15} />
                ) : (
                  <File size={15} />
                )}
                <span>{attachment.name}</span>
                <small>{formatAttachmentSize(attachment.size)}</small>
              </span>
            ))}
          </div>
        ) : null}
        {entry.streaming ? (
          <span className="streaming-caret" aria-label="Streaming" />
        ) : null}
      </div>
    </article>
  );
}

function PlanCard({ steps }: { steps: PlanStep[] }) {
  return (
    <section className="activity-module plan-module" aria-label="Execution plan">
      <h2>Plan</h2>
      <ol>
        {steps.map((step, index) => (
          <li key={step.id} className={`plan-step plan-step--${step.status}`}>
            <span className="plan-step__rail" aria-hidden="true">
              <span className="plan-step__marker">
                {step.status === "complete" ? (
                  <Check size={14} weight="bold" />
                ) : step.status === "active" ? (
                  <span className="plan-step__active-square" />
                ) : (
                  index + 1
                )}
              </span>
            </span>
            <span className="plan-step__copy">
              <strong>{step.title}</strong>
              {step.detail ? <small>{step.detail}</small> : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const toolIcons = {
  Read: FileText,
  Edit: PencilSimple,
  Write: Code,
  Test: Flask,
  Run: Wrench,
  Update: Wrench,
};

function ToolsCard({ tools }: { tools: ToolActivity[] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleTools = expanded ? tools : tools.slice(-5);
  const activeCount = tools.filter((tool) => tool.status === "active").length;

  return (
    <section
      className={`activity-module tools-module ${expanded ? "is-expanded" : ""}`}
      aria-label="Tool activity"
    >
      <header className="tools-module__header">
        <h2>Tools</h2>
        <div className="tools-module__meta">
          <span aria-live="polite">
            {activeCount > 0
              ? `${activeCount} running`
              : `${tools.length} ${tools.length === 1 ? "activity" : "activities"}`}
          </span>
          {expanded ? (
            <button
              type="button"
              className="tool-more tool-more--header is-expanded"
              onClick={() => setExpanded(false)}
              aria-expanded="true"
            >
              Show latest
              <CaretRight size={11} weight="bold" />
            </button>
          ) : null}
        </div>
      </header>
      <div className="tool-strip">
        {visibleTools.map((tool) => {
          const Icon = toolIcons[tool.action as keyof typeof toolIcons] || Wrench;
          return (
            <div className={`tool-item tool-item--${tool.status}`} key={tool.id}>
              <span className="tool-item__title">
                <Icon size={15} />
                {tool.action}
              </span>
              <span className="tool-item__target" title={tool.target}>
                {tool.target}
              </span>
              <span className="tool-progress">
                <span style={{ width: `${tool.progress}%` }} />
              </span>
            </div>
          );
        })}
        {tools.length > 5 && !expanded ? (
          <button
            type="button"
            className={`tool-more ${expanded ? "is-expanded" : ""}`}
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
          >
            {expanded ? "Show latest" : `${tools.length - 5} more`}
            <CaretRight size={11} weight="bold" />
          </button>
        ) : null}
      </div>
    </section>
  );
}

const statusLabels: Record<GrokTask["status"], string> = {
  idle: "Ready",
  running: "Working",
  complete: "Complete",
  error: "Needs attention",
};

export function TaskWorkspace({
  task,
  busy,
  onSend,
  onCancel,
  onRetry,
  workspaceReady,
  onChooseWorkspace,
  workspaceChangeCount,
  onRunTests,
  onReviewChanges,
}: TaskWorkspaceProps) {
  const scrollArea = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const messages = task?.messages ?? [];
  const plan = task?.plan ?? [];
  const tools = task?.tools ?? [];
  const lastMessage = messages.at(-1);

  const scrollToLatest = (behavior: ScrollBehavior = "smooth") => {
    const element = scrollArea.current;
    if (!element) return;
    nearBottom.current = true;
    setShowScrollToLatest(false);
    element.scrollTo({ top: element.scrollHeight, behavior });
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => scrollToLatest("auto"));
    return () => window.cancelAnimationFrame(frame);
  }, [task?.id]);

  useEffect(() => {
    if (!nearBottom.current && lastMessage?.role !== "user") {
      setShowScrollToLatest(true);
      return;
    }
    const frame = window.requestAnimationFrame(() => scrollToLatest("smooth"));
    return () => window.cancelAnimationFrame(frame);
  }, [messages.length, lastMessage?.content.length, plan.length, busy]);

  const trackScrollPosition = () => {
    const element = scrollArea.current;
    if (!element) return;
    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    const nextNearBottom = distanceFromBottom < 96;
    nearBottom.current = nextNearBottom;
    setShowScrollToLatest(!nextNearBottom);
  };

  return (
    <main className="task-workspace">
      <header className="task-header">
        <div>
          <h1>{workspaceReady ? task?.title ?? "Preparing task…" : "Choose a project folder"}</h1>
          <p>
            Grok Build <span>·</span> ACP <span>·</span>{" "}
            <strong
              className={`task-status task-status--${task?.status ?? "idle"}`}
            >
              {!workspaceReady
                ? "Workspace required"
                : task
                  ? statusLabels[task.status]
                  : "Loading"}
            </strong>
          </p>
        </div>
        <div className="task-header__actions">
          {task?.status === "error" ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => void onRetry()}
              disabled={busy || !workspaceReady}
            >
              <ArrowClockwise size={16} />
              Retry
            </button>
          ) : null}
          <button
            type="button"
            className="secondary-button"
            onClick={onRunTests}
            disabled={!task || busy || !workspaceReady}
          >
            <Play size={16} />
            Run tests
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onReviewChanges}
          >
            <Code size={16} />
            Review changes{workspaceChangeCount > 0 ? ` · ${workspaceChangeCount}` : ""}
          </button>
        </div>
      </header>

      <div className="conversation-stage">
        <div
          className="conversation-scroll"
          ref={scrollArea}
          onScroll={trackScrollPosition}
        >
          <div className="conversation">
            {!workspaceReady ? (
              <section className="conversation-empty" aria-label="Choose workspace">
                <span>
                  <FolderOpen size={24} />
                </span>
                <h2>Open a project workspace</h2>
                <p>Grok Build will run only inside the folder you explicitly choose.</p>
                <button type="button" className="primary-button" onClick={onChooseWorkspace}>
                  <FolderOpen size={15} />
                  Choose folder
                </button>
              </section>
            ) : messages.length === 0 ? (
              <section className="conversation-empty" aria-label="New task">
                <span>
                  <ChatCircleDots size={24} />
                </span>
                <h2>Start a new task</h2>
                <p>Describe what you want Grok Build to do in this workspace.</p>
              </section>
            ) : (
              messages.map((entry) => <Message entry={entry} key={entry.id} />)
            )}
            {plan.length > 0 ? <PlanCard steps={plan} /> : null}
            {busy ? (
              <div className="running-row">
                <em>Grok Build is working…</em>
                <SpinnerGap size={18} weight="bold" className="spin" />
              </div>
            ) : null}
          </div>
        </div>
        {showScrollToLatest ? (
          <button
            type="button"
            className="scroll-to-latest"
            onClick={() => scrollToLatest("smooth")}
          >
            <ArrowDown size={14} weight="bold" />
            Back to latest
          </button>
        ) : null}
      </div>

      <div className="task-bottom-dock">
        {tools.length > 0 ? (
          <div className="tools-dock">
            <ToolsCard tools={tools} />
          </div>
        ) : null}
        <div className="composer-dock">
          <Composer
            busy={busy}
            disabled={!task || !workspaceReady}
            onSend={onSend}
            onCancel={onCancel}
          />
        </div>
      </div>
    </main>
  );
}
