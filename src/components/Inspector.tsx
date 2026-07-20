import {
  CaretDown,
  CaretLeft,
  CaretUp,
  CheckCircle,
  Copy,
  DotsThree,
  FileText,
  FunnelSimple,
  GitBranch,
  Trash,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { changedFiles, diffsByFile } from "../data/demo";
import type { InspectorTab } from "../types";

interface InspectorProps {
  activeTab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  terminalLines: string[];
  onClearTerminal: () => void;
  onCollapse: () => void;
  sessionId: string | null;
}

const tabLabels: Record<InspectorTab, string> = {
  changes: "Changes",
  terminal: "Terminal",
  context: "Context",
};

export function Inspector({
  activeTab,
  onTabChange,
  terminalLines,
  onClearTerminal,
  onCollapse,
  sessionId,
}: InspectorProps) {
  const [selectedFile, setSelectedFile] = useState(changedFiles[0].path);
  const [testsOpen, setTestsOpen] = useState(true);
  const diff = useMemo(() => diffsByFile[selectedFile] || [], [selectedFile]);

  const copyDiff = async () => {
    const text = diff
      .map((line) => `${line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " "}${line.content}`)
      .join("\n");
    await navigator.clipboard?.writeText(text);
  };

  return (
    <aside className="inspector" aria-label="Task inspector">
      <div className="inspector__topbar">
        <div className="inspector-tabs" role="tablist" aria-label="Inspector views">
          {(Object.keys(tabLabels) as InspectorTab[]).map((tab) => (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              key={tab}
              className={activeTab === tab ? "is-active" : ""}
              onClick={() => onTabChange(tab)}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="icon-button inspector__collapse"
          onClick={onCollapse}
          aria-label="Collapse inspector"
        >
          <CaretLeft size={16} />
        </button>
      </div>

      {activeTab === "changes" ? (
        <div className="inspector__content inspector__content--changes">
          <section className="changed-files">
            <header>
              <strong>Changed files</strong>
              <span className="count-badge">{changedFiles.length}</span>
              <span className="changed-files__spacer" />
              <button type="button" className="icon-button" aria-label="Filter files">
                <FunnelSimple size={16} />
              </button>
              <button type="button" className="icon-button" aria-label="Sort files">
                <GitBranch size={16} />
              </button>
            </header>
            <div className="file-list">
              {changedFiles.map((file) => (
                <button
                  type="button"
                  key={file.path}
                  className={`file-row ${selectedFile === file.path ? "is-selected" : ""}`}
                  onClick={() => setSelectedFile(file.path)}
                >
                  <FileText size={15} />
                  <span>{file.path}</span>
                  <em className={`file-status file-status--${file.status.toLowerCase()}`}>
                    {file.status}
                  </em>
                </button>
              ))}
            </div>
          </section>

          <section className="diff-panel" aria-label={`Diff for ${selectedFile}`}>
            <header>
              <span title={selectedFile}>{selectedFile}</span>
              <em>{changedFiles.find((file) => file.path === selectedFile)?.status}</em>
              <button type="button" className="icon-button" onClick={() => void copyDiff()} aria-label="Copy diff">
                <Copy size={16} />
              </button>
              <button type="button" className="icon-button" aria-label="More diff actions">
                <DotsThree size={18} weight="bold" />
              </button>
            </header>
            <div className="diff-code" role="region" tabIndex={0}>
              {diff.map((line, index) => (
                <div className={`diff-line diff-line--${line.kind}`} key={`${line.kind}-${index}`}>
                  <span className="diff-number">{line.oldNumber ?? ""}</span>
                  <span className="diff-number">{line.newNumber ?? ""}</span>
                  <code>
                    {line.kind === "add" ? "+ " : line.kind === "remove" ? "− " : "  "}
                    {line.content}
                  </code>
                </div>
              ))}
            </div>
          </section>

          <section className={`test-panel ${testsOpen ? "is-open" : ""}`}>
            <button type="button" className="test-panel__header" onClick={() => setTestsOpen((value) => !value)}>
              <strong>Tests</strong>
              {testsOpen ? <CaretUp size={15} /> : <CaretDown size={15} />}
            </button>
            {testsOpen ? (
              <div className="test-result">
                <span>
                  <small>auth/session.test.ts</small>
                  <strong><CheckCircle size={15} weight="fill" /> Passed</strong>
                </span>
                <span>18 passed (1.2s)</span>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {activeTab === "terminal" ? (
        <div className="terminal-panel">
          <header>
            <span>ACP Terminal</span>
            <button type="button" className="icon-button" onClick={onClearTerminal} aria-label="Clear terminal">
              <Trash size={16} />
            </button>
          </header>
          <pre>{terminalLines.length ? terminalLines.join("\n") : "Terminal output will appear here."}</pre>
        </div>
      ) : null}

      {activeTab === "context" ? (
        <div className="context-panel">
          <section>
            <h2>Session</h2>
            <dl>
              <div><dt>Runtime</dt><dd>Grok Build ACP</dd></div>
              <div><dt>Session ID</dt><dd>{sessionId || "Not connected"}</dd></div>
              <div><dt>Branch</dt><dd>feature/oauth-refresh</dd></div>
              <div><dt>Mode</dt><dd>Default permissions</dd></div>
            </dl>
          </section>
          <section>
            <h2>Working context</h2>
            <p>Workspace rules, recent messages, selected diff, and changed-file metadata are sent through the official ACP session.</p>
          </section>
          <section className="context-note">
            GrokDesk never reads or stores your OAuth token. Authentication remains owned by the official Grok CLI.
          </section>
        </div>
      ) : null}
    </aside>
  );
}
