#!/bin/bash
set -e

# --- 1. Create user-local folders ---
PUREWOLF_DIR="$HOME/.purewolf"
MANIFEST_DIR="$HOME/.mozilla/native-messaging-hosts"

mkdir -p "$PUREWOLF_DIR"
mkdir -p "$MANIFEST_DIR"

# --- 2. Copy binary ---
cp ./purewolf-native "$PUREWOLF_DIR/"
chmod 755 "$PUREWOLF_DIR/purewolf-native"

# --- 3. Copy & adjust manifest ---
sed "s|/home/USERNAME|$HOME|g" ./com.purewolf.json > "$MANIFEST_DIR/com.purewolf.json"

# --- 4. Success message ---
echo "PureWolf installed successfully!"
echo "Binary location: $PUREWOLF_DIR/purewolf-native"
echo "Manifest location: $MANIFEST_DIR/com.purewolf.json"
echo "Please restart Firefox to activate the native host."
