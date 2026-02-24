#!/usr/bin/env bash
set -e

BASE_URL="https://github.com/ArcaneSphere/PureWolf-Browser-Extension/releases/download/v0.9.40"

PUREWOLF_DIR="$HOME/.purewolf"
MANIFEST_DIR="$HOME/.mozilla/native-messaging-hosts"

BIN_URL="$BASE_URL/purewolf-native"
MANIFEST_URL="$BASE_URL/com.purewolf.json"

echo "Installing PureWolf native host..."

# --- 1. Create folders ---
mkdir -p "$PUREWOLF_DIR"
mkdir -p "$MANIFEST_DIR"

# --- 2. Download binary ---
echo "Downloading native binary..."
curl -L "$BIN_URL" -o "$PUREWOLF_DIR/purewolf-native"
chmod 755 "$PUREWOLF_DIR/purewolf-native"

# --- 3. Download & adjust manifest ---
echo "Installing Firefox manifest..."
curl -L "$MANIFEST_URL" | sed "s|/home/USERNAME|$HOME|g" > "$MANIFEST_DIR/com.purewolf.json"

# --- 4. Done ---
echo ""
echo "PureWolf installed successfully!"
echo "Binary location: $PUREWOLF_DIR/purewolf-native"
echo "Manifest location: $MANIFEST_DIR/com.purewolf.json"
echo "Please restart Firefox to activate the native host."

