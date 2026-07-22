import type { GrokTask } from "../types";

export type TaskSearchMatchKind =
  | "recent"
  | "title"
  | "message"
  | "attachment"
  | "plan"
  | "tool";

export interface TaskSearchResult {
  task: GrokTask;
  kind: TaskSearchMatchKind;
  label: string;
  snippet: string;
  score: number;
}

interface SearchCandidate {
  kind: Exclude<TaskSearchMatchKind, "recent">;
  label: string;
  value: string;
  score: number;
}

const normalize = (value: string) => value.trim().toLocaleLowerCase();

const compactText = (value: string) => value.replace(/\s+/g, " ").trim();

const displayText = (value: string) =>
  compactText(value)
    .replace(/```[a-z0-9_-]*/gi, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*|__/g, "")
    .replace(/\|/g, " ")
    .replace(/(^|\s)[#>*~-]+(?=\s)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

const createSnippet = (value: string, query: string, maximumLength = 116) => {
  const compact = displayText(value);
  if (!compact) return "No saved preview";
  if (compact.length <= maximumLength) return compact;

  const matchIndex = compact.toLocaleLowerCase().indexOf(query);
  const contextBefore = 32;
  const start = Math.max(0, matchIndex < 0 ? 0 : matchIndex - contextBefore);
  const end = Math.min(compact.length, start + maximumLength);
  return `${start > 0 ? "…" : ""}${compact.slice(start, end).trim()}${end < compact.length ? "…" : ""}`;
};

const recentPreview = (task: GrokTask) => {
  const latestMessage = [...task.messages]
    .reverse()
    .find((message) => compactText(message.content));
  if (latestMessage) return createSnippet(latestMessage.content, "");
  if (task.plan[0]) return createSnippet(task.plan[0].title, "");
  return task.archivedAt ? "Archived local task" : "No saved transcript yet";
};

const findBestMatch = (
  task: GrokTask,
  query: string,
): SearchCandidate | null => {
  let best: SearchCandidate | null = null;
  const consider = (candidate: SearchCandidate) => {
    const normalizedValue = normalize(candidate.value);
    if (!normalizedValue.includes(query)) return;
    const score =
      candidate.score +
      (normalizedValue.startsWith(query) ? 24 : 0) +
      (normalizedValue === query ? 36 : 0);
    if (!best || score > best.score) best = { ...candidate, score };
  };

  consider({ kind: "title", label: "Task title", value: task.title, score: 140 });
  task.messages.forEach((message, messageIndex) => {
    consider({
      kind: "message",
      label: message.role === "user" ? "Your message" : "Grok Build response",
      value: message.content,
      score: 104 + Math.min(messageIndex, 12),
    });
    message.attachments?.forEach((attachment) =>
      consider({
        kind: "attachment",
        label: "Attachment",
        value: attachment.name,
        score: 94,
      }),
    );
  });
  task.plan.forEach((step) => {
    consider({ kind: "plan", label: "Plan", value: step.title, score: 88 });
    consider({ kind: "plan", label: "Plan detail", value: step.detail, score: 78 });
  });
  task.tools.forEach((tool) => {
    consider({ kind: "tool", label: "Tool", value: tool.action, score: 84 });
    consider({ kind: "tool", label: "Tool target", value: tool.target, score: 74 });
  });
  return best;
};

export function searchTasks(
  tasks: GrokTask[],
  query: string,
  maximumResults = 12,
): TaskSearchResult[] {
  const limit = Math.max(1, Math.min(maximumResults, 50));
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return [...tasks]
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime(),
      )
      .slice(0, limit)
      .map((task) => ({
        task,
        kind: "recent",
        label: task.archivedAt ? "Archived" : "Recent task",
        snippet: recentPreview(task),
        score: 0,
      }));
  }

  return tasks
    .flatMap((task): TaskSearchResult[] => {
      const best = findBestMatch(task, normalizedQuery);
      if (!best) return [];
      return [
        {
          task,
          kind: best.kind,
          label: best.label,
          snippet: createSnippet(best.value, normalizedQuery),
          score: best.score,
        },
      ];
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return (
        new Date(right.task.updatedAt).getTime() -
        new Date(left.task.updatedAt).getTime()
      );
    })
    .slice(0, limit);
}
