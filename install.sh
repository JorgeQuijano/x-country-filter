#!/usr/bin/env bash
# X Country Filter — one-command install for Brave/Chrome (Linux/macOS/WSL)
# Usage: bash <(curl -sL https://raw.githubusercontent.com/JorgeQuijano/x-country-filter/main/install.sh)
set -euo pipefail

DEST="${XDG_DATA_HOME:-$HOME/.local/share}/x-country-filter"
ZIP_URL="https://github.com/JorgeQuijano/x-country-filter/archive/refs/heads/main.zip"

echo "==> downloading extension..."
mkdir -p "$DEST"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -sL "$ZIP_URL" -o "$TMP/xcf.zip"
if command -v unzip >/dev/null 2>&1; then
  unzip -oq "$TMP/xcf.zip" -d "$TMP"
else
  python3 -m zipfile -e "$TMP/xcf.zip" "$TMP"
fi
cp -r "$TMP"/x-country-filter-main/* "$DEST/"

echo ""
echo "==> installed to: $DEST"
echo ""
echo "next, in brave or chrome:"
echo "  1. open brave://extensions  (or chrome://extensions)"
echo "  2. toggle 'developer mode' (top right)"
echo "  3. click 'load unpacked' and select:  $DEST"
echo ""
echo "tip: pin the extension icon so you can open its options fast."
