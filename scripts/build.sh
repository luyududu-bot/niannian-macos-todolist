#!/bin/zsh
set -eu
PROJECT_DIR="${0:A:h:h}"
DEST_DIR="${NIANNIAN_OUTPUT_DIR:-$PROJECT_DIR/dist/念念}"
if [[ "$(uname -s)" != Darwin ]]; then print -u2 '构建需要 macOS。'; exit 1; fi
if [[ -e "$DEST_DIR/念念.app" ]]; then print -u2 '目标位置已有念念.app；请先退出并移走旧应用，再重新构建。任务资料不会被删除。'; exit 1; fi
STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/niannian-build.XXXXXX")"
trap 'rm -rf "$STAGE_DIR"' EXIT
APP_PATH="$STAGE_DIR/念念.app"
/usr/bin/osacompile -l JavaScript -s -o "$APP_PATH" "$PROJECT_DIR/源码/main.js"
/bin/cp "$PROJECT_DIR/源码/"*.js "$PROJECT_DIR/源码/index.html" "$PROJECT_DIR/源码/style.css" "$APP_PATH/Contents/Resources/"
/bin/cp "$PROJECT_DIR/源码/念念.icns" "$APP_PATH/Contents/Resources/applet.icns"
set_plist() { /usr/libexec/PlistBuddy -c "Delete :$1" "$APP_PATH/Contents/Info.plist" 2>/dev/null || true; /usr/libexec/PlistBuddy -c "Add :$1 $2 $3" "$APP_PATH/Contents/Info.plist"; }
set_plist CFBundleName string 念念
set_plist CFBundleDisplayName string 念念
set_plist CFBundleIdentifier string local.niannian.desktop
set_plist CFBundleShortVersionString string 1.4.1
set_plist CFBundleVersion string 141
set_plist LSUIElement bool false
set_plist NSHighResolutionCapable bool true
set_plist NSAppleEventsUsageDescription string '将任务双向同步到iCloud备忘录的念念文件夹，每月一篇。'
/usr/bin/codesign --force --deep --sign - "$APP_PATH"
/usr/bin/codesign --verify --deep --strict "$APP_PATH"
mkdir -p "$DEST_DIR"
mv "$APP_PATH" "$DEST_DIR/念念.app"
/bin/cp -R "$PROJECT_DIR/源码" "$DEST_DIR/源码"
/bin/cp -R "$PROJECT_DIR/MCP" "$DEST_DIR/MCP"
/bin/cp "$PROJECT_DIR/README.md" "$DEST_DIR/使用说明.md"
if [[ -f "$PROJECT_DIR/LICENSE" ]]; then /bin/cp "$PROJECT_DIR/LICENSE" "$DEST_DIR/LICENSE"; fi
print "已构建：$DEST_DIR/念念.app"
print '请将整个念念文件夹放在固定位置。任务资料会在首次启动时创建。'
