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
  WarningCircle,
  Wrench,
} from "@phosphor-icons/react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import appIcon from "../assets/grokdesk-icon.png";
import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/types";
import { formatAttachmentSize } from "../lib/attachments";
import {
  fallbackPlanPriority,
  fallbackPlanStepNumber,
  isFallbackPlanUpdate,
  isFallbackRuntimeTool,
  previewToolTargetTranslationKey,
  runtimeToolActionTranslationKey,
} from "../lib/localizedRuntimeUi";
import { localizeTaskTitle } from "../lib/tasks";
import type {
  ChatEntry,
  GrokTask,
  PlanStep,
  PromptAttachment,
  ToolActivity,
} from "../types";
import { Composer } from "./Composer";

const MarkdownContent = lazy(() =>
  import("./MarkdownContent").then(({ MarkdownContent }) => ({
    default: MarkdownContent,
  })),
);

interface TaskWorkspaceProps {
  task: GrokTask | null;
  busy: boolean;
  runningInBackground: number;
  storageLocked: boolean;
  storageWarning: string | null;
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
  const { formatDate, locale, t } = useI18n();
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
          <strong>{isAgent ? entry.name : t("task.you")}</strong>
          <time>
            {entry.createdAt
              ? formatDate(entry.createdAt, {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })
              : entry.time}
          </time>
        </header>
        {isAgent ? (
          <Suspense
            fallback={
              <p className="message__plain message__rendering" role="status">
                {t("task.renderingResponse")}
              </p>
            }
          >
            <MarkdownContent
              content={
                entry.content || (entry.streaming ? t("task.thinking") : "")
              }
            />
          </Suspense>
        ) : entry.content ? (
          <p className="message__plain">{entry.content}</p>
        ) : null}
        {entry.attachments && entry.attachments.length > 0 ? (
          <div
            className="message-attachments"
            aria-label={t("task.messageAttachments")}
          >
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
                <small>{formatAttachmentSize(attachment.size, locale)}</small>
              </span>
            ))}
          </div>
        ) : null}
        {entry.streaming ? (
          <span
            className="streaming-caret"
            aria-label={t("task.streaming")}
          />
        ) : null}
      </div>
    </article>
  );
}

function PlanCard({ steps }: { steps: PlanStep[] }) {
  const { formatNumber, t } = useI18n();
  return (
    <section
      className="activity-module plan-module"
      aria-label={t("task.executionPlan")}
    >
      <h2>{t("task.plan")}</h2>
      <ol>
        {steps.map((step, index) => {
          const fallbackStepNumber = fallbackPlanStepNumber(step.title);
          const fallbackPriority = step.detail
            ? fallbackPlanPriority(step.detail)
            : null;
          const title =
            fallbackStepNumber === null
              ? step.title
              : t("runtime.plan.step", {
                  number: formatNumber(fallbackStepNumber),
                });
          const detail = !step.detail
            ? null
            : isFallbackPlanUpdate(step.detail)
              ? t("runtime.plan.updatedBy")
              : fallbackPriority
                ? t("runtime.plan.priority", { priority: fallbackPriority })
                : step.detail;
          return (
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
                <strong>{title}</strong>
                {detail ? <small>{detail}</small> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const toolIcons = {
  edit: PencilSimple,
  read: FileText,
  run: Wrench,
  test: Flask,
  update: Wrench,
  write: Code,
};

function ToolsCard({ tools }: { tools: ToolActivity[] }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const visibleTools = expanded ? tools : tools.slice(-5);
  const activeCount = tools.filter((tool) => tool.status === "active").length;

  return (
    <section
      className={`activity-module tools-module ${expanded ? "is-expanded" : ""}`}
      aria-label={t("task.toolActivity")}
    >
      <header className="tools-module__header">
        <h2>{t("task.tools")}</h2>
        <div className="tools-module__meta">
          <span aria-live="polite">
            {activeCount > 0
              ? t("task.toolsRunning", { count: activeCount })
              : t(
                  tools.length === 1
                    ? "task.toolActivityCount.one"
                    : "task.toolActivityCount.other",
                  { count: tools.length },
                )}
          </span>
          {expanded ? (
            <button
              type="button"
              className="tool-more tool-more--header is-expanded"
              onClick={() => setExpanded(false)}
              aria-expanded="true"
            >
              {t("task.showLatest")}
              <CaretRight size={11} weight="bold" />
            </button>
          ) : null}
        </div>
      </header>
      <div className="tool-strip">
        {visibleTools.map((tool) => {
          const normalizedAction = tool.action.trim().toLocaleLowerCase();
          const Icon =
            toolIcons[normalizedAction as keyof typeof toolIcons] || Wrench;
          const actionKey = runtimeToolActionTranslationKey(tool.action);
          const targetKey = previewToolTargetTranslationKey(tool.id);
          const action = actionKey ? t(actionKey) : tool.action;
          const target = targetKey
            ? t(targetKey)
            : isFallbackRuntimeTool(tool.target)
              ? t("runtime.tool.fallback")
              : tool.target;
          return (
            <div className={`tool-item tool-item--${tool.status}`} key={tool.id}>
              <span className="tool-item__title">
                <Icon size={15} />
                {action}
              </span>
              <span className="tool-item__target" title={target}>
                {target}
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
            {expanded
              ? t("task.showLatest")
              : t("task.moreTools", { count: tools.length - 5 })}
            <CaretRight size={11} weight="bold" />
          </button>
        ) : null}
      </div>
    </section>
  );
}

const statusLabelKeys: Record<GrokTask["status"], TranslationKey> = {
  idle: "task.status.ready",
  running: "task.status.working",
  complete: "common.complete",
  error: "task.status.needsAttention",
};

export function TaskWorkspace({
  task,
  busy,
  runningInBackground,
  storageLocked,
  storageWarning,
  onSend,
  onCancel,
  onRetry,
  workspaceReady,
  onChooseWorkspace,
  workspaceChangeCount,
  onRunTests,
  onReviewChanges,
}: TaskWorkspaceProps) {
  const { t } = useI18n();
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
          <h1>
            {workspaceReady
              ? task
                ? localizeTaskTitle(task.title, t("sidebar.newTask"))
                : t("task.preparing")
              : t("task.chooseProjectFolder")}
          </h1>
          <p>
            Grok Build <span>·</span> ACP <span>·</span>{" "}
            <strong
              className={`task-status task-status--${task?.status ?? "idle"}`}
            >
              {!workspaceReady
                ? t("task.workspaceRequired")
                : task
                  ? t(statusLabelKeys[task.status])
                  : t("common.loading")}
            </strong>
          </p>
          {storageWarning ? (
            <div className="task-storage-warning" role="alert">
              <WarningCircle size={13} weight="fill" />
              <span>{storageWarning}</span>
            </div>
          ) : null}
          {runningInBackground > 0 ? (
            <p
              className="background-task-indicator"
              role="status"
              aria-live="polite"
            >
              <SpinnerGap size={13} weight="bold" className="spin" />
              {t(
                runningInBackground === 1
                  ? "task.backgroundRunning.one"
                  : "task.backgroundRunning.other",
                { count: runningInBackground },
              )}
            </p>
          ) : null}
        </div>
        <div className="task-header__actions">
          {task?.status === "error" ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => void onRetry()}
              disabled={busy || storageLocked || !workspaceReady}
            >
              <ArrowClockwise size={16} />
              {t("common.retry")}
            </button>
          ) : null}
          <button
            type="button"
            className="secondary-button"
            onClick={onRunTests}
            disabled={!task || busy || storageLocked || !workspaceReady}
          >
            <Play size={16} />
            {t("task.runTests")}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onReviewChanges}
          >
            <Code size={16} />
            {t("task.reviewChanges")}
            {workspaceChangeCount > 0 ? ` · ${workspaceChangeCount}` : ""}
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
              <section
                className="conversation-empty"
                aria-label={t("common.chooseWorkspace")}
              >
                <span>
                  <FolderOpen size={24} />
                </span>
                <h2>{t("task.openWorkspace")}</h2>
                <p>{t("task.openWorkspaceDescription")}</p>
                <button type="button" className="primary-button" onClick={onChooseWorkspace}>
                  <FolderOpen size={15} />
                  {t("common.chooseFolder")}
                </button>
              </section>
            ) : messages.length === 0 ? (
              <section
                className="conversation-empty"
                aria-label={t("sidebar.newTask")}
              >
                <span>
                  <ChatCircleDots size={24} />
                </span>
                <h2>{t("task.startNew")}</h2>
                <p>{t("task.startNewDescription")}</p>
              </section>
            ) : (
              messages.map((entry) => <Message entry={entry} key={entry.id} />)
            )}
            {plan.length > 0 ? <PlanCard steps={plan} /> : null}
            {busy ? (
              <div className="running-row">
                <em>{t("task.grokWorking")}</em>
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
            {t("task.backToLatest")}
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
            disabled={!task || storageLocked || !workspaceReady}
            onSend={onSend}
            onCancel={onCancel}
          />
        </div>
      </div>
    </main>
  );
}
