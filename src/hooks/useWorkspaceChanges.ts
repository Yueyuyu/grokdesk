import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  discardWorkspaceChange,
  getWorkspaceDiff,
  inspectWorkspace,
  stageWorkspaceChange,
  unstageWorkspaceChange,
} from "../lib/desktop";
import { emptyWorkspaceSnapshot, parseUnifiedDiff } from "../lib/workspace";
import type { WorkspaceDiff, WorkspaceSnapshot } from "../types";

type WorkspaceAction = "stage" | "unstage" | "discard";

const initialSnapshot = () =>
  emptyWorkspaceSnapshot(
    "unselected",
    "Choose a project folder to inspect real workspace changes.",
  );

export function useWorkspaceChanges(workspacePath: string, busy: boolean) {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>(initialSnapshot);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [diff, setDiff] = useState<WorkspaceDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [diffLoading, setDiffLoading] = useState(false);
  const [actionPending, setActionPending] = useState<WorkspaceAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const refreshSequence = useRef(0);
  const diffSequence = useRef(0);

  const applySnapshot = useCallback((next: WorkspaceSnapshot) => {
    setSnapshot(next);
    setSelectedPath((current) => {
      if (current && next.changes.some((change) => change.path === current)) {
        return current;
      }
      return next.changes[0]?.path ?? null;
    });
    setRevision((current) => current + 1);
  }, []);

  const refresh = useCallback(
    async (options: { silent?: boolean } = {}) => {
      const sequence = ++refreshSequence.current;
      if (!options.silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const next = await inspectWorkspace(workspacePath);
        if (sequence !== refreshSequence.current) return;
        applySnapshot(next);
        setError(null);
      } catch (cause) {
        if (sequence !== refreshSequence.current) return;
        setError(String(cause));
      } finally {
        if (sequence === refreshSequence.current) setLoading(false);
      }
    },
    [applySnapshot, workspacePath],
  );

  useEffect(() => {
    setSelectedPath(null);
    setDiff(null);
    setLastAction(null);
    setError(null);
    void refresh();

    if (!busy) return;
    const interval = window.setInterval(() => {
      void refresh({ silent: true });
    }, 1_500);
    return () => window.clearInterval(interval);
  }, [busy, refresh, workspacePath]);

  const selectedChange = useMemo(
    () => snapshot.changes.find((change) => change.path === selectedPath) ?? null,
    [selectedPath, snapshot.changes],
  );

  useEffect(() => {
    if (!selectedPath || !selectedChange) {
      setDiff(null);
      setDiffLoading(false);
      return;
    }

    const sequence = ++diffSequence.current;
    setDiffLoading(true);
    void getWorkspaceDiff(workspacePath, selectedPath)
      .then((next) => {
        if (sequence !== diffSequence.current) return;
        setDiff(next);
        setError(null);
      })
      .catch((cause) => {
        if (sequence !== diffSequence.current) return;
        setDiff(null);
        setError(String(cause));
      })
      .finally(() => {
        if (sequence === diffSequence.current) setDiffLoading(false);
      });
  }, [revision, selectedChange, selectedPath, workspacePath]);

  const runAction = useCallback(
    async (action: WorkspaceAction, path: string) => {
      if (actionPending) return false;
      setActionPending(action);
      setError(null);
      setLastAction(null);
      try {
        const next =
          action === "stage"
            ? await stageWorkspaceChange(workspacePath, path)
            : action === "unstage"
              ? await unstageWorkspaceChange(workspacePath, path)
              : await discardWorkspaceChange(workspacePath, path);
        applySnapshot(next);
        setLastAction(
          action === "stage"
            ? `Accepted ${path} into the Git index.`
            : action === "unstage"
              ? `Moved ${path} back to pending changes.`
              : `Reverted ${path}.`,
        );
        return true;
      } catch (cause) {
        setError(String(cause));
        return false;
      } finally {
        setActionPending(null);
      }
    },
    [actionPending, applySnapshot, workspacePath],
  );

  return {
    snapshot,
    selectedPath,
    selectedChange,
    setSelectedPath,
    diff,
    diffLines: useMemo(() => parseUnifiedDiff(diff?.patch ?? ""), [diff?.patch]),
    loading,
    diffLoading,
    actionPending,
    error,
    lastAction,
    clearError: () => setError(null),
    refresh,
    stage: (path: string) => runAction("stage", path),
    unstage: (path: string) => runAction("unstage", path),
    discard: (path: string) => runAction("discard", path),
  };
}

export type WorkspaceChangesController = ReturnType<typeof useWorkspaceChanges>;
