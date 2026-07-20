import {
  CaretRight,
  Check,
  Code,
  FileText,
  Flask,
  GitBranch,
  PencilSimple,
  Play,
  SpinnerGap,
  Wrench,
} from "@phosphor-icons/react";
import avatar from "../assets/alex-chen.png";
import appIcon from "../assets/grokdesk-icon.png";
import type { ChatEntry, PlanStep, ToolActivity } from "../types";
import { Composer } from "./Composer";

interface TaskWorkspaceProps {
  messages: ChatEntry[];
  plan: PlanStep[];
  tools: ToolActivity[];
  busy: boolean;
  onSend: (text: string) => Promise<void>;
  onCancel: () => Promise<void>;
  onRunTests: () => void;
  onReviewChanges: () => void;
}

function Message({ entry }: { entry: ChatEntry }) {
  const isAgent = entry.role === "agent";
  return (
    <article className={`message message--${entry.role}`}>
      <img
        src={isAgent ? appIcon : avatar}
        alt={isAgent ? "Grok Build" : "Alex"}
        className={`message__avatar ${isAgent ? "message__avatar--agent" : ""}`}
      />
      <div className="message__body">
        <header>
          <strong>{entry.name}</strong>
          <time>{entry.time}</time>
        </header>
        <p>{entry.content || (entry.streaming ? "Thinking…" : "")}</p>
        {entry.streaming ? <span className="streaming-caret" aria-label="Streaming" /> : null}
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
              <small>{step.detail}</small>
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
  return (
    <section className="activity-module tools-module" aria-label="Tool activity">
      <h2>Tools</h2>
      <div className="tool-strip">
        {tools.slice(0, 5).map((tool) => {
          const Icon = toolIcons[tool.action as keyof typeof toolIcons] || Wrench;
          return (
            <div className="tool-item" key={tool.id}>
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
        {tools.length > 5 ? (
          <button type="button" className="tool-more">
            {tools.length - 5} more
            <CaretRight size={11} weight="bold" />
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function TaskWorkspace({
  messages,
  plan,
  tools,
  busy,
  onSend,
  onCancel,
  onRunTests,
  onReviewChanges,
}: TaskWorkspaceProps) {
  const leading = messages.slice(0, 2);
  const trailing = messages.slice(2);
  const showsActiveRun =
    (busy && !messages.at(-1)?.streaming) ||
    (!busy && messages.at(-1)?.id === "message-agent-2");

  return (
    <main className="task-workspace">
      <header className="task-header">
        <div>
          <h1>Refactor OAuth session storage</h1>
          <p>
            Grok Build <span>·</span> ACP <span>·</span>{" "}
            <strong>feature/oauth-refresh</strong>
            <GitBranch size={14} />
          </p>
        </div>
        <div className="task-header__actions">
          <button type="button" className="secondary-button" onClick={onRunTests}>
            <Play size={16} />
            Run tests
          </button>
          <button type="button" className="secondary-button" onClick={onReviewChanges}>
            <Code size={16} />
            Review changes
          </button>
        </div>
      </header>

      <div className="conversation-scroll">
        <div className="conversation">
          {leading.map((entry, index) => (
            <div key={entry.id}>
              <Message entry={entry} />
              {index === 0 ? <hr /> : null}
            </div>
          ))}
          <PlanCard steps={plan} />
          <ToolsCard tools={tools} />
          {trailing.length ? <hr /> : null}
          {trailing.map((entry) => (
            <Message entry={entry} key={entry.id} />
          ))}
          {showsActiveRun ? (
            <div className="running-row">
              <em>Running: auth/session.test.ts</em>
              <SpinnerGap size={18} weight="bold" className="spin" />
            </div>
          ) : null}
        </div>
      </div>

      <div className="composer-dock">
        <Composer busy={busy} onSend={onSend} onCancel={onCancel} />
      </div>
    </main>
  );
}
