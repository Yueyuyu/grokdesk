import type {
  ChangedFile,
  ChatEntry,
  DiffLine,
  PlanStep,
  ToolActivity,
} from "../types";

export const taskGroups = [
  {
    label: "Today",
    items: [
      {
        title: "Refactor OAuth session storage",
        time: "09:42",
        selected: true,
        running: true,
      },
      { title: "Add token refresh on 401", time: "08:15", complete: true },
      { title: "Normalize user profile shape", time: "Yesterday", complete: true },
    ],
  },
  {
    label: "This week",
    items: [
      { title: "Upgrade to React Router v7", time: "Jul 17", complete: true },
      { title: "Fix flaky auth test", time: "Jul 16", complete: true },
      { title: "Add logout everywhere", time: "Jul 15", complete: true },
    ],
  },
];

export const initialMessages: ChatEntry[] = [
  {
    id: "message-user-1",
    role: "user",
    name: "Alex",
    time: "09:42",
    content:
      "Refactor how we store OAuth sessions so refresh tokens are encrypted at rest and rotate on use.",
  },
  {
    id: "message-agent-1",
    role: "agent",
    name: "Grok Build",
    time: "09:43",
    content:
      "Understood. I’ll refactor the session store to encrypt refresh tokens, implement rotation on use, and add tests.",
  },
  {
    id: "message-agent-2",
    role: "agent",
    name: "Grok Build",
    time: "09:48",
    content: "Implemented encrypted storage and rotation on use. Running tests now.",
  },
];

export const initialPlan: PlanStep[] = [
  {
    id: "plan-1",
    title: "Audit current session storage and usage",
    detail: "Inspected auth service, session model, and storage adapters.",
    status: "complete",
  },
  {
    id: "plan-2",
    title: "Design encrypted session schema",
    detail: "Add enc_refresh_token, key_id, rotated_at. Use AES-256-GCM.",
    status: "complete",
  },
  {
    id: "plan-3",
    title: "Implement encrypted storage + rotation",
    detail: "Migrate write path, rotate on use, update session service.",
    status: "active",
  },
  {
    id: "plan-4",
    title: "Add tests and update docs",
    detail: "Unit tests for encryption + rotation. Update auth docs.",
    status: "pending",
  },
];

export const initialTools: ToolActivity[] = [
  { id: "tool-1", action: "Read", target: "session.ts", progress: 100, status: "complete" },
  {
    id: "tool-2",
    action: "Edit",
    target: "session.service.ts",
    progress: 78,
    status: "active",
  },
  { id: "tool-3", action: "Edit", target: "crypto.ts", progress: 65, status: "active" },
  {
    id: "tool-4",
    action: "Write",
    target: "session.migration.ts",
    progress: 54,
    status: "active",
  },
  {
    id: "tool-5",
    action: "Test",
    target: "auth/session.test.ts",
    progress: 8,
    status: "active",
  },
  { id: "tool-6", action: "Read", target: "auth.config.ts", progress: 100, status: "complete" },
  { id: "tool-7", action: "Update", target: "docs/auth.md", progress: 42, status: "active" },
  { id: "tool-8", action: "Run", target: "npm test", progress: 18, status: "active" },
];

export const changedFiles: ChangedFile[] = [
  { path: "src/auth/session.service.ts", status: "M" },
  { path: "src/auth/crypto.ts", status: "M" },
  { path: "src/auth/session.ts", status: "M" },
  { path: "src/auth/session.migration.ts", status: "A" },
  { path: "src/auth/__tests__/session.test.ts", status: "M" },
  { path: "docs/auth.md", status: "M" },
  { path: "prisma/schema.prisma", status: "M" },
];

const primaryDiff: DiffLine[] = [
  { kind: "hunk", content: "@@ -12,7 +12,18 @@ import { getKey } from './crypto';" },
  { kind: "context", oldNumber: 12, newNumber: 12, content: "import { db } from '../db';" },
  { kind: "context", oldNumber: 13, newNumber: 13, content: "import { Session } from './session';" },
  { kind: "context", oldNumber: 14, newNumber: 14, content: "" },
  {
    kind: "remove",
    oldNumber: 15,
    content: "export async function storeSession(data: Session) {",
  },
  { kind: "remove", oldNumber: 16, content: "  return db.session.upsert({" },
  { kind: "remove", oldNumber: 17, content: "    where: { id: data.id }," },
  { kind: "remove", oldNumber: 18, content: "    update: data," },
  { kind: "remove", oldNumber: 19, content: "    create: data," },
  { kind: "remove", oldNumber: 20, content: "  });" },
  {
    kind: "add",
    newNumber: 21,
    content: "export async function storeSession(data: Session) {",
  },
  {
    kind: "add",
    newNumber: 22,
    content: "  const enc = await encrypt(data.refreshToken);",
  },
  { kind: "add", newNumber: 23, content: "  return db.session.upsert({" },
  { kind: "add", newNumber: 24, content: "    where: { id: data.id }," },
  { kind: "add", newNumber: 25, content: "    update: {" },
  { kind: "add", newNumber: 26, content: "      ...data," },
  { kind: "add", newNumber: 27, content: "      enc_refresh_token: enc.ciphertext," },
  { kind: "add", newNumber: 28, content: "      key_id: enc.keyId," },
  { kind: "add", newNumber: 29, content: "      rotated_at: new Date()," },
  { kind: "add", newNumber: 30, content: "    }," },
  { kind: "add", newNumber: 31, content: "    create: {" },
  { kind: "add", newNumber: 32, content: "      ...data," },
  { kind: "add", newNumber: 33, content: "      enc_refresh_token: enc.ciphertext," },
  { kind: "add", newNumber: 34, content: "      key_id: enc.keyId," },
  { kind: "add", newNumber: 35, content: "      rotated_at: new Date()," },
  { kind: "add", newNumber: 36, content: "    }," },
  { kind: "add", newNumber: 37, content: "  });" },
  { kind: "add", newNumber: 38, content: "}" },
];

export const diffsByFile: Record<string, DiffLine[]> = Object.fromEntries(
  changedFiles.map((file) => [
    file.path,
    file.path === "src/auth/session.service.ts"
      ? primaryDiff
      : [
          { kind: "hunk", content: `@@ ${file.status === "A" ? "new file" : "-8,3 +8,7"} @@` },
          { kind: "context", oldNumber: 8, newNumber: 8, content: "// OAuth session hardening" },
          { kind: "add", newNumber: 9, content: "export const tokenRotationEnabled = true;" },
          { kind: "add", newNumber: 10, content: "export const encryptionVersion = 1;" },
        ],
  ]),
);

export const terminalSeed = [
  "$ grok agent stdio",
  "Grok Build ACP transport ready",
  "$ npm test -- auth/session.test.ts",
  "✓ encrypts refresh tokens at rest",
  "✓ rotates a token after successful use",
  "18 passed (1.2s)",
];
