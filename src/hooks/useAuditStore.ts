import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AUDIT_STORE_KEY,
  clearWorkspaceAudit,
  emptyAuditStore,
  parseAuditStore,
  serializeAuditStore,
  upsertAuditEvent,
  type AuditEventInput,
  type AuditStoreSnapshot,
} from "../lib/audit";
import { workspaceStorageKey } from "../lib/tasks";
import { isWorkspaceSelected } from "../lib/workspace";

const loadSnapshot = (enabled: boolean) => {
  if (!enabled || typeof window === "undefined") return emptyAuditStore();
  return parseAuditStore(window.localStorage.getItem(AUDIT_STORE_KEY));
};

const persistSnapshot = (snapshot: AuditStoreSnapshot) => {
  try {
    window.localStorage.setItem(AUDIT_STORE_KEY, serializeAuditStore(snapshot));
  } catch {
    // Storage may be unavailable or full. The in-memory audit remains usable.
  }
};

export function useAuditStore(workspacePath: string, enabled: boolean) {
  const [snapshot, setSnapshot] = useState<AuditStoreSnapshot>(() =>
    loadSnapshot(enabled),
  );
  const latestSnapshot = useRef(snapshot);
  const workspaceKey = workspaceStorageKey(workspacePath);

  useEffect(() => {
    latestSnapshot.current = snapshot;
    if (!enabled) return;
    const timer = window.setTimeout(() => persistSnapshot(snapshot), 120);
    return () => window.clearTimeout(timer);
  }, [enabled, snapshot]);

  useEffect(() => {
    if (!enabled) return;
    const flush = () => persistSnapshot(latestSnapshot.current);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [enabled]);

  const events = useMemo(
    () =>
      enabled && isWorkspaceSelected(workspacePath)
        ? snapshot.events.filter(
            (event) =>
              workspaceStorageKey(event.workspacePath) === workspaceKey,
          )
        : [],
    [enabled, snapshot.events, workspaceKey, workspacePath],
  );

  const recordEvent = useCallback(
    (event: AuditEventInput) => {
      if (!enabled || !isWorkspaceSelected(event.workspacePath)) return;
      setSnapshot((current) => upsertAuditEvent(current, event));
    },
    [enabled],
  );

  const clear = useCallback(() => {
    if (!enabled || !isWorkspaceSelected(workspacePath)) return;
    setSnapshot((current) => clearWorkspaceAudit(current, workspacePath));
  }, [enabled, workspacePath]);

  return {
    events,
    recordEvent,
    clear,
    pendingCount: events.filter((event) => event.status === "pending").length,
  };
}

export type AuditStoreController = ReturnType<typeof useAuditStore>;
