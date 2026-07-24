#!/usr/bin/env bash
set -euo pipefail

bundle_directory="${1:?bundle directory is required}"
expected_version="${2:?expected version is required}"
updater_arch="${3:?updater architecture is required}"
require_signature="${4:-false}"

dmg="$(find "$bundle_directory/dmg" -maxdepth 1 -type f -name '*.dmg' -print -quit)"
archive="$(find "$bundle_directory/macos" -maxdepth 1 -type f -name '*.app.tar.gz' -print -quit)"

test -n "$dmg"
test -n "$archive"
test -s "$archive.sig"
tar -tzf "$archive" >/dev/null
hdiutil verify "$dmg"

mount_point="$(mktemp -d "${TMPDIR:-/tmp}/grokdesk-dmg.XXXXXX")"
cleanup() {
  hdiutil detach "$mount_point" -quiet >/dev/null 2>&1 || true
  rm -rf "$mount_point"
}
trap cleanup EXIT

hdiutil attach "$dmg" -mountpoint "$mount_point" -nobrowse -readonly -quiet
app_path="$(find "$mount_point" -maxdepth 1 -type d -name '*.app' -print -quit)"
test -n "$app_path"

bundle_identifier="$(defaults read "$app_path/Contents/Info" CFBundleIdentifier)"
bundle_version="$(defaults read "$app_path/Contents/Info" CFBundleShortVersionString)"
bundle_executable="$(defaults read "$app_path/Contents/Info" CFBundleExecutable)"

test "$bundle_identifier" = "com.grokdesk.desktop"
test "$bundle_version" = "$expected_version"
test -x "$app_path/Contents/MacOS/$bundle_executable"

if codesign --verify --deep --strict --verbose=2 "$app_path"; then
  echo "macOS app signature: valid"
elif [[ "$require_signature" == "true" ]]; then
  echo "A Developer ID signature was required but is not valid." >&2
  exit 1
else
  echo "macOS app signature: unsigned (Developer ID secrets are not configured)"
fi

echo "macOS package smoke test passed for GrokDesk $expected_version ($updater_arch)."
