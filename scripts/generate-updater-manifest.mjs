import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_PLATFORMS = {
  "windows-x86_64": (name) => /setup\.exe$/i.test(name),
  "darwin-aarch64": (name) => /_aarch64\.app\.tar\.gz$/i.test(name),
  "darwin-x86_64": (name) => /_x86_64\.app\.tar\.gz$/i.test(name),
};

const updaterAssetUrl = (repository, tag, fileName) =>
  `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(fileName)}`;

const requireSingleAsset = (fileNames, platform, predicate) => {
  const matches = fileNames.filter(
    (name) => predicate(name) && !name.toLocaleLowerCase().endsWith(".sig"),
  );
  if (matches.length !== 1) {
    throw new Error(
      `${platform} requires exactly one updater asset, found ${matches.length}: ${matches.join(", ") || "none"}`,
    );
  }
  return matches[0];
};

export async function buildUpdaterManifest({
  assetsDirectory,
  repository,
  tag,
  version,
  notes,
  publishedAt,
}) {
  const fileNames = await readdir(assetsDirectory);
  const platforms = {};

  for (const [platform, predicate] of Object.entries(REQUIRED_PLATFORMS)) {
    const assetName = requireSingleAsset(fileNames, platform, predicate);
    const signatureName = `${assetName}.sig`;
    if (!fileNames.includes(signatureName)) {
      throw new Error(`Missing updater signature: ${signatureName}`);
    }
    const signature = (
      await readFile(path.join(assetsDirectory, signatureName), "utf8")
    ).trim();
    if (!signature) {
      throw new Error(`Updater signature is empty: ${signatureName}`);
    }
    platforms[platform] = {
      signature,
      url: updaterAssetUrl(repository, tag, assetName),
    };
  }

  return {
    version,
    notes,
    pub_date: publishedAt,
    platforms,
  };
}

const readOption = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1 || !args[index + 1]) {
    throw new Error(`Missing required option ${name}`);
  }
  return args[index + 1];
};

async function main() {
  const args = process.argv.slice(2);
  const assetsDirectory = path.resolve(readOption(args, "--assets"));
  const repository = readOption(args, "--repository");
  const tag = readOption(args, "--tag");
  const version = readOption(args, "--version");
  const output = path.resolve(readOption(args, "--output"));
  const notes = readOption(args, "--notes");
  const publishedAt = readOption(args, "--published-at");
  const expectedTag = `v${version}`;

  if (tag !== expectedTag) {
    throw new Error(`Tag ${tag} does not match updater version ${expectedTag}.`);
  }
  if (!/^[^/]+\/[^/]+$/.test(repository)) {
    throw new Error(`Invalid GitHub repository name: ${repository}`);
  }
  if (Number.isNaN(Date.parse(publishedAt))) {
    throw new Error(`Invalid publication timestamp: ${publishedAt}`);
  }

  const manifest = await buildUpdaterManifest({
    assetsDirectory,
    repository,
    tag,
    version,
    notes,
    publishedAt,
  });
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
