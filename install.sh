#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="$HOME/NeonKat"
DIST_DIR="dist"
ICON_SRC="build/kat.png"
DESKTOP_FILE="$HOME/.local/share/applications/neonkat.desktop"
APPIMAGE_SRC=$(ls -1 "$DIST_DIR"/NeonKat-*.appimage 2>/dev/null | sort -V | tail -n 1)

if [[ -z "${APPIMAGE_SRC:-}" ]]; then
    echo "Error: No Neonkat AppImage found in $DIST_DIR/"
    exit 1
fi

echo "Found AppImage: $APPIMAGE_SRC"
mkdir -p "$INSTALL_DIR"
cp "$APPIMAGE_SRC" "$INSTALL_DIR/NeonKat.AppImage"
chmod +x "$INSTALL_DIR/NeonKat.AppImage"
cp "$ICON_SRC" "$INSTALL_DIR/kat.png"

mkdir -p "$(dirname "$DESKTOP_FILE")"

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Name=NeonKat
Comment=Meeoooooww
Exec=$INSTALL_DIR/NeonKat.AppImage --ozone-platform=x11
Icon=$INSTALL_DIR/kat.png
Terminal=false
Type=Application
Categories=AudioVideo;Audio;Player;
StartupWMClass=NeonKat
EOF

chmod +x "$DESKTOP_FILE"

echo "NeonKat installed successfully."
echo "AppImage source: $APPIMAGE_SRC"
echo "Installed to: $INSTALL_DIR/NeonKat.AppImage"
