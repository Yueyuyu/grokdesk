import type {
  ChatAttachmentSummary,
  PromptAttachment,
  PromptAttachmentKind,
} from "../types";

export const MAX_ATTACHMENTS = 8;
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 24 * 1024 * 1024;

type AttachmentFileLike = Pick<File, "name" | "size" | "type">;

const TEXT_EXTENSIONS = new Set([
  "bat",
  "c",
  "cc",
  "conf",
  "cpp",
  "cs",
  "css",
  "csv",
  "env",
  "go",
  "h",
  "hpp",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "jsx",
  "log",
  "md",
  "mdx",
  "php",
  "properties",
  "ps1",
  "py",
  "rb",
  "rs",
  "scss",
  "sh",
  "sql",
  "svg",
  "toml",
  "ts",
  "tsx",
  "txt",
  "vue",
  "xml",
  "yaml",
  "yml",
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  bmp: "image/bmp",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  json: "application/json",
  md: "text/markdown",
  pdf: "application/pdf",
  png: "image/png",
  svg: "image/svg+xml",
  txt: "text/plain",
  webp: "image/webp",
  xml: "application/xml",
  yaml: "application/yaml",
  yml: "application/yaml",
};

const extensionOf = (name: string) =>
  name.includes(".") ? name.split(".").at(-1)?.toLocaleLowerCase() ?? "" : "";

export function attachmentMimeType(file: AttachmentFileLike) {
  const declared = file.type.trim().toLocaleLowerCase();
  if (declared) return declared;
  return MIME_BY_EXTENSION[extensionOf(file.name)] ?? "application/octet-stream";
}

export function attachmentKind(file: AttachmentFileLike): PromptAttachmentKind {
  const mimeType = attachmentMimeType(file);
  if (mimeType.startsWith("image/")) return "image";
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType.endsWith("+json") ||
    mimeType === "application/xml" ||
    mimeType.endsWith("+xml") ||
    mimeType === "application/yaml" ||
    TEXT_EXTENSIONS.has(extensionOf(file.name))
  ) {
    return "text";
  }
  return "binary";
}

export function formatAttachmentSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateAttachmentSelection<T extends AttachmentFileLike>(
  existing: T[],
  incoming: T[],
) {
  const accepted: T[] = [];
  const errors: string[] = [];
  let totalSize = existing.reduce((total, file) => total + file.size, 0);
  const fingerprints = new Set(
    existing.map((file) => `${file.name}\u0000${file.size}\u0000${file.type}`),
  );

  for (const file of incoming) {
    const fingerprint = `${file.name}\u0000${file.size}\u0000${file.type}`;
    if (fingerprints.has(fingerprint)) continue;
    if (existing.length + accepted.length >= MAX_ATTACHMENTS) {
      errors.push(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      break;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      errors.push(
        `${file.name} is ${formatAttachmentSize(file.size)}; each file must be ${formatAttachmentSize(MAX_ATTACHMENT_BYTES)} or smaller.`,
      );
      continue;
    }
    if (totalSize + file.size > MAX_TOTAL_ATTACHMENT_BYTES) {
      errors.push(
        `Attachments can total up to ${formatAttachmentSize(MAX_TOTAL_ATTACHMENT_BYTES)}.`,
      );
      continue;
    }

    accepted.push(file);
    fingerprints.add(fingerprint);
    totalSize += file.size;
  }

  return { accepted, errors };
}

export function attachmentSummary(
  file: AttachmentFileLike,
): ChatAttachmentSummary {
  return {
    name: file.name,
    mimeType: attachmentMimeType(file),
    size: file.size,
    kind: attachmentKind(file),
  };
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunkSize = 32_768;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return window.btoa(binary);
}

export async function preparePromptAttachments(
  files: File[],
): Promise<PromptAttachment[]> {
  const validation = validateAttachmentSelection([], files);
  if (validation.accepted.length !== files.length || validation.errors.length > 0) {
    throw new Error(validation.errors[0] ?? "One or more attachments are invalid.");
  }

  return Promise.all(
    files.map(async (file) => {
      const kind = attachmentKind(file);
      return {
        name: file.name,
        mimeType: attachmentMimeType(file),
        size: file.size,
        kind,
        data: kind === "text" ? await file.text() : await fileToBase64(file),
      } satisfies PromptAttachment;
    }),
  );
}
