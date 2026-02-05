#!/bin/bash
# build-extension.sh
# Build a PureWolf browser extension package for Firefox, Chrome, or Edge
# Usage: bash build-extension.sh <browser>

set -e

# --- 1. Read the target browser from the first argument ---
BROWSER=$1
if [[ -z "$BROWSER" ]]; then
    echo "Usage: bash build-extension.sh <firefox|chrome|edge>"
    exit 1
fi

echo "Building PureWolf extension for: $BROWSER"

# --- 2. Define paths ---
EXT_DIR="./extension"              # Shared code (JS, CSS, dashboard, libs, popup, icons)
BROWSER_DIR="./browsers/$BROWSER"  # Browser-specific manifest
BUILD_DIR="./build/$BROWSER"       # Output folder

# --- 3. Clean previous build ---
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# --- 4. Copy shared extension code ---
echo "Copying shared extension files..."
cp -r "$EXT_DIR/"* "$BUILD_DIR/"

# --- 5. Copy browser manifest ---
echo "Copying $BROWSER manifest..."
cp "$BROWSER_DIR/manifest.json" "$BUILD_DIR/manifest.json"

# --- 6. Optional: Add any browser-specific tweaks ---
# (For example, background scripts or permissions can be patched here if needed)

# --- 7. Success message ---
echo "Build complete!"
echo "Extension is ready in: $BUILD_DIR"
echo "Load this folder into $BROWSER (see README for instructions)"
