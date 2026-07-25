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

export function formatAttachmentSize(bytes: number, locale = "en") {
  if (bytes < 1024) {
    return `${new Intl.NumberFormat(locale).format(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${new Intl.NumberFormat(locale, {
      maximumFractionDigits: bytes < 10 * 1024 ? 1 : 0,
      minimumFractionDigits: bytes < 10 * 1024 ? 1 : 0,
    }).format(bytes / 1024)} KB`;
  }
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(bytes / (1024 * 1024))} MB`;
}

export interface AttachmentValidationMessages {
  tooMany: (maximum: number) => string;
  tooLarge: (name: string, size: string, maximum: string) => string;
  totalTooLarge: (maximum: string) => string;
  invalid: string;
}

const defaultValidationMessages: AttachmentValidationMessages = {
  tooMany: (maximum) => `You can attach up to ${maximum} files.`,
  tooLarge: (name, size, maximum) =>
    `${name} is ${size}; each file must be ${maximum} or smaller.`,
  totalTooLarge: (maximum) => `Attachments can total up to ${maximum}.`,
  invalid: "One or more attachments are invalid.",
};

export function validateAttachmentSelection<T extends AttachmentFileLike>(
  existing: T[],
  incoming: T[],
  options: {
    locale?: string;
    messages?: AttachmentValidationMessages;
  } = {},
) {
  const locale = options.locale ?? "en";
  const messages = options.messages ?? defaultValidationMessages;
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
      errors.push(messages.tooMany(MAX_ATTACHMENTS));
      break;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      errors.push(
        messages.tooLarge(
          file.name,
          formatAttachmentSize(file.size, locale),
          formatAttachmentSize(MAX_ATTACHMENT_BYTES, locale),
        ),
      );
      continue;
    }
    if (totalSize + file.size > MAX_TOTAL_ATTACHMENT_BYTES) {
      errors.push(
        messages.totalTooLarge(
          formatAttachmentSize(MAX_TOTAL_ATTACHMENT_BYTES, locale),
        ),
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
  options?: {
    locale?: string;
    messages?: AttachmentValidationMessages;
  },
): Promise<PromptAttachment[]> {
  const validation = validateAttachmentSelection([], files, options);
  if (validation.accepted.length !== files.length || validation.errors.length > 0) {
    throw new Error(
      validation.errors[0] ??
        options?.messages?.invalid ??
        defaultValidationMessages.invalid,
    );
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
