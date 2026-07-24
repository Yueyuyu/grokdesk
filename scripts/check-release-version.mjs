import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const readText = (relativePath) =>
  readFile(path.join(repositoryRoot, relativePath), "utf8");

const requireCondition = (condition, message) => {
  if (!condition) throw new Error(message);
};

const sha256 = async (relativePath) =>
  createHash("sha256")
    .update(await readFile(path.join(repositoryRoot, relativePath)))
    .digest("hex");

async function main() {
  const packageJson = JSON.parse(await readText("package.json"));
  const packageLock = JSON.parse(await readText("package-lock.json"));
  const tauriConfig = JSON.parse(await readText("src-tauri/tauri.conf.json"));
  const cargoManifest = await readText("src-tauri/Cargo.toml");
  const cargoLock = await readText("src-tauri/Cargo.lock");
  const wixFragment = await readText(
    "src-tauri/windows/versioned-shortcut.wxs",
  );
  const releaseWorkflow = await readText(".github/workflows/release.yml");
  const version = packageJson.version;
  const versionedIcon = `src-tauri/icons/GrokDesk-v${version}.ico`;

  requireCondition(
    packageLock.version === version &&
      packageLock.packages?.[""]?.version === version,
    "package-lock.json does not match package.json.",
  );
  requireCondition(
    tauriConfig.version === version,
    "tauri.conf.json does not match package.json.",
  );
  requireCondition(
    new RegExp(
      `^version = "${version.replaceAll(".", "\\.")}"$`,
      "m",
    ).test(cargoManifest),
    "Cargo.toml does not match package.json.",
  );
  requireCondition(
    new RegExp(
      `name = "grokdesk"\\r?\\nversion = "${version.replaceAll(".", "\\.")}"`,
    ).test(cargoLock),
    "Cargo.lock does not match package.json.",
  );
  requireCondition(
    tauriConfig.bundle?.createUpdaterArtifacts === true,
    "Tauri updater artifacts are not enabled.",
  );
  requireCondition(
    tauriConfig.plugins?.updater?.endpoints?.includes(
      "https://github.com/Yueyuyu/grokdesk/releases/latest/download/latest.json",
    ),
    "The canonical GitHub updater endpoint is missing.",
  );
  const wrappedPublicKey = tauriConfig.plugins?.updater?.pubkey;
  requireCondition(
    typeof wrappedPublicKey === "string" &&
      Buffer.from(wrappedPublicKey, "base64")
        .toString("utf8")
        .includes("minisign public key"),
    "The updater public key is missing or malformed.",
  );
  requireCondition(
    Object.prototype.hasOwnProperty.call(
      tauriConfig.bundle?.resources ?? {},
      `icons/GrokDesk-v${version}.ico`,
    ),
    "The versioned Windows shortcut icon is missing from Tauri resources.",
  );
  requireCondition(
    wixFragment.includes(`GrokDesk-v${version}.ico`) &&
      wixFragment.includes(`Value="${version}"`),
    "The MSI shortcut repair does not match the release version.",
  );
  requireCondition(
    [
      "release-assets/*.dmg",
      "release-assets/*.app.tar.gz",
      "release-assets/*.app.tar.gz.sig",
    ].every((assetPattern) => releaseWorkflow.includes(assetPattern)),
    "The release workflow does not upload every macOS installer and updater artifact.",
  );
  await access(path.join(repositoryRoot, versionedIcon));
  requireCondition(
    (await sha256(versionedIcon)) ===
      (await sha256("src-tauri/icons/icon.ico")),
    "The versioned Windows icon differs from the canonical icon.",
  );

  console.log(`Release version closure passed for GrokDesk ${version}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
