import { describe, expect, it } from "vitest";
import {
  MAX_ATTACHMENT_BYTES,
  attachmentKind,
  attachmentMimeType,
  formatAttachmentSize,
  validateAttachmentSelection,
} from "./attachments";

const file = (name: string, size: number, type = "") => ({ name, size, type });

describe("prompt attachments", () => {
  it("classifies common image, text, and binary files", () => {
    expect(attachmentKind(file("screen.png", 120, "image/png"))).toBe("image");
    expect(attachmentKind(file("notes.md", 120))).toBe("text");
    expect(attachmentKind(file("report.pdf", 120, "application/pdf"))).toBe(
      "binary",
    );
    expect(attachmentMimeType(file("screen.png", 120))).toBe("image/png");
  });

  it("keeps valid files while reporting size and duplicate constraints", () => {
    const existing = [file("notes.md", 400, "text/markdown")];
    const result = validateAttachmentSelection(existing, [
      file("notes.md", 400, "text/markdown"),
      file("screen.png", 900, "image/png"),
      file("archive.zip", MAX_ATTACHMENT_BYTES + 1, "application/zip"),
    ]);

    expect(result.accepted.map((item) => item.name)).toEqual(["screen.png"]);
    expect(result.errors[0]).toContain("archive.zip");
  });

  it("formats compact file sizes for attachment cards", () => {
    expect(formatAttachmentSize(512)).toBe("512 B");
    expect(formatAttachmentSize(1_536)).toBe("1.5 KB");
    expect(formatAttachmentSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});
