#!/usr/bin/env bash
# Build (and optionally install) a full Linux x64 AppImage of this fork, including the orcad
# template for every SSH/runtime host target, without the upstream release CI.
#
# Native orcad slots (node-pty per platform) and the Windows helper binaries cannot be compiled on
# one Linux machine, so they come from an upstream stablyai/orca "Cut Release" run. The slot check
# (`build:orcad-prebuilds --require-slots`) fails if those prebuilds don't match this source.
#
# Usage: config/scripts/desktop-distribution/linux/build-fork-appimage.sh [--version X.Y.Z]
#          [--release-run <run-id>] [--install] [--skip-desktop-build]
#   --version             App version to stamp (default: latest upstream release + 1 patch, so the
#                         updater doesn't offer that release over this build). package.json is restored.
#   --release-run         Upstream run to take native slots from (default: newest successful Cut Release).
#   --install             Copy to ~/AppImages/orca.appimage and write the desktop entry.
#   --skip-desktop-build  Reuse out/ from an earlier run (only the orcad template and package are rebuilt).
# Requires: gh (authenticated), corepack, git.
set -euo pipefail

UPSTREAM=stablyai/orca
VERSION=''
RUN_ID=''
INSTALL=0
SKIP_DESKTOP=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --release-run) RUN_ID="$2"; shift 2 ;;
    --install) INSTALL=1; shift ;;
    --skip-desktop-build) SKIP_DESKTOP=1; shift ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  echo 'This script builds the Linux x64 AppImage and must run on Linux x86_64.' >&2
  exit 1
fi
for tool in gh corepack git; do
  command -v "$tool" >/dev/null || { echo "Missing required tool: $tool" >&2; exit 1; }
done
gh auth status >/dev/null 2>&1 || { echo 'Run `gh auth login` first.' >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
pnpm() { corepack pnpm "$@"; }

if [[ -z "$VERSION" ]]; then
  latest="$(gh release view -R "$UPSTREAM" --json tagName --jq .tagName)"
  IFS=. read -r major minor patch <<<"${latest#v}"
  VERSION="$major.$minor.$((patch + 1))"
fi
if [[ -z "$RUN_ID" ]]; then
  RUN_ID="$(gh run list -R "$UPSTREAM" --workflow release-cut.yml --status success --limit 1 \
    --json databaseId --jq '.[0].databaseId')"
fi
echo "== Orca fork build: version $VERSION, native slots from $UPSTREAM run $RUN_ID"

git diff --quiet -- package.json || { echo 'package.json has uncommitted changes; commit or stash them.' >&2; exit 1; }
trap 'git checkout -- package.json' EXIT
npm pkg set version="$VERSION"

echo '== Dependencies'
pnpm install --frozen-lockfile
pnpm -C mobile install --frozen-lockfile

if [[ "$SKIP_DESKTOP" == 0 ]]; then
  echo '== Desktop build'
  pnpm build:desktop
  pnpm build:native
fi

echo '== orcad native slots and Windows helpers'
LANES="$(mktemp -d)"
trap 'git checkout -- package.json; rm -rf "$LANES"' EXIT
gh run download "$RUN_ID" -R "$UPSTREAM" -p 'orcad-prebuild-*' -D "$LANES"
rm -rf .build/windows-process-tree .build/windows-cli-launcher .build/windows-security
gh run download "$RUN_ID" -R "$UPSTREAM" -n orcad-windows-process-tree -D .build/windows-process-tree
gh run download "$RUN_ID" -R "$UPSTREAM" -n orcad-windows-cli-launcher -D .build/windows-cli-launcher
gh run download "$RUN_ID" -R "$UPSTREAM" -n orcad-windows-security -D .build/windows-security
rm -rf out/orcad-prebuilds
node config/scripts/orcad-distribution/prebuilds/merge-orcad-prebuilds.mjs "$LANES"/*
pnpm build:orcad-prebuilds --require-slots
pnpm build:orcad-prebuilds --require-slots linux-x64-glibc217

echo '== orcad template (every host target) and AppImage'
rm -rf out/orcad-template
pnpm build:orcad-template
pnpm ensure:electron-runtime
ORCA_REQUIRE_ORCAD_TEMPLATE=1 pnpm exec electron-builder \
  --config config/electron-builder.config.cjs --linux AppImage --x64
APPIMAGE="$ROOT/dist/orca-linux.AppImage"
echo "== Built $APPIMAGE ($VERSION)"

if [[ "$INSTALL" == 1 ]]; then
  echo '== Install'
  mkdir -p "$HOME/AppImages/.icons" "$HOME/.local/share/applications"
  install -m 755 "$APPIMAGE" "$HOME/AppImages/orca.appimage"
  ICONS="$(mktemp -d)"
  (cd "$ICONS" && "$APPIMAGE" --appimage-extract orca-ide.png >/dev/null)
  install -m 644 "$ICONS/squashfs-root/orca-ide.png" "$HOME/AppImages/.icons/orca.png"
  rm -rf "$ICONS"
  cat >"$HOME/.local/share/applications/orca.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Orca
Comment=Next-gen IDE for parallel agentic development
Icon=$HOME/AppImages/.icons/orca.png
TryExec=$HOME/AppImages/orca.appimage
Exec=env DESKTOPINTEGRATION=1 $HOME/AppImages/orca.appimage %U
Terminal=false
MimeType=text/markdown;text/csv;text/tab-separated-values;x-scheme-handler/orca;
Categories=Utility;
StartupWMClass=orca
X-AppImage-Version=$VERSION
X-AppImage-Name=Orca
EOF
  command -v update-desktop-database >/dev/null && update-desktop-database "$HOME/.local/share/applications" || true
  command -v xdg-mime >/dev/null && xdg-mime default orca.desktop x-scheme-handler/orca || true
  echo "== Installed $HOME/AppImages/orca.appimage; quit and reopen Orca to run it."
fi
