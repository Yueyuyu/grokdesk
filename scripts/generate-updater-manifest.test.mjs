import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildUpdaterManifest } from "./generate-updater-manifest.mjs";

const temporaryDirectories = [];

const createAssets = async (names) => {
  const directory = await mkdtemp(path.join(tmpdir(), "grokdesk-updater-"));
  temporaryDirectories.push(directory);
  await Promise.all(
    names.map((name) =>
      writeFile(
        path.join(directory, name),
        name.endsWith(".sig") ? `signature-for-${name}` : "package",
      ),
    ),
  );
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("updater manifest generation", () => {
  it("maps every signed desktop artifact to the canonical Tauri platform", async () => {
    const assetsDirectory = await createAssets([
      "GrokDesk_0.2.9_x64-setup.exe",
      "GrokDesk_0.2.9_x64-setup.exe.sig",
      "GrokDesk_0.2.9_aarch64.app.tar.gz",
      "GrokDesk_0.2.9_aarch64.app.tar.gz.sig",
      "GrokDesk_0.2.9_x86_64.app.tar.gz",
      "GrokDesk_0.2.9_x86_64.app.tar.gz.sig",
    ]);

    const manifest = await buildUpdaterManifest({
      assetsDirectory,
      repository: "Yueyuyu/grokdesk",
      tag: "v0.2.9",
      version: "0.2.9",
      notes: "Trusted update",
      publishedAt: "2026-07-24T00:00:00.000Z",
    });

    expect(Object.keys(manifest.platforms)).toEqual([
      "windows-x86_64",
      "darwin-aarch64",
      "darwin-x86_64",
    ]);
    expect(manifest.platforms["darwin-aarch64"].url).toContain(
      "GrokDesk_0.2.9_aarch64.app.tar.gz",
    );
    expect(manifest.platforms["windows-x86_64"].signature).toContain(
      "signature-for",
    );
  });

  it("refuses to publish an unsigned updater package", async () => {
    const assetsDirectory = await createAssets([
      "GrokDesk_0.2.9_x64-setup.exe",
      "GrokDesk_0.2.9_aarch64.app.tar.gz",
      "GrokDesk_0.2.9_aarch64.app.tar.gz.sig",
      "GrokDesk_0.2.9_x86_64.app.tar.gz",
      "GrokDesk_0.2.9_x86_64.app.tar.gz.sig",
    ]);

    await expect(
      buildUpdaterManifest({
        assetsDirectory,
        repository: "Yueyuyu/grokdesk",
        tag: "v0.2.9",
        version: "0.2.9",
        notes: "Trusted update",
        publishedAt: "2026-07-24T00:00:00.000Z",
      }),
    ).rejects.toThrow("Missing updater signature");
  });
});
