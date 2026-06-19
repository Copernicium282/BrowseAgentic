#!/bin/bash
# BrowseAgentic persistent browser launcher
# User runs this to launch Chrome. Agent connects via CDP.
#
# Usage:
#   ./scripts/browser.sh start    — Launch Chrome (stays open)
#   ./scripts/browser.sh stop     — Kill Chrome
#   ./scripts/browser.sh status   — Check if running
#   ./scripts/browser.sh screenshot — Save screenshot to /tmp/browseagentic_shot.png

DIR="$(cd "$(dirname "$0")/.." && pwd)"
PIDFILE="/tmp/browseagentic_browser.pid"
LOGFILE="/tmp/browseagentic_browser.log"
SCREENSHOT="/tmp/browseagentic_shot.png"
CDP_PORT="${BROWSEAGENTIC_CDP_PORT:-9222}"
PROFILE="${BROWSEAGENTIC_PROFILE:-$HOME/.browseagentic/chrome-profile}"

# Find Chrome binary
find_chrome() {
  for p in /usr/bin/google-chrome /usr/bin/google-chrome-stable /usr/bin/chromium-browser /usr/bin/chromium /snap/bin/chromium "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
    [ -x "$p" ] && echo "$p" && return
  done
  which google-chrome chromium-browser chromium 2>/dev/null | head -1
}

start_browser() {
  if [ -f "$PIDFILE" ] && kill -0 "$(cat $PIDFILE)" 2>/dev/null; then
    echo "Browser already running (PID $(cat $PIDFILE))"
    return 0
  fi

  CHROME=$(find_chrome)
  if [ -z "$CHROME" ]; then
    echo "ERROR: Chrome/Chromium not found"
    return 1
  fi

  echo "Launching Chrome (CDP port $CDP_PORT)..."
  mkdir -p "$PROFILE"

  # Detect screen size and position browser on left half
  SCREEN_RES=$(xdpyinfo 2>/dev/null | grep dimensions | awk '{print $2}')
  if [ -n "$SCREEN_RES" ]; then
    SCREEN_W=$(echo "$SCREEN_RES" | cut -dx -f1)
    SCREEN_H=$(echo "$SCREEN_RES" | cut -dx -f2)
    WIN_W=$((SCREEN_W / 2))
    WIN_POS="0,0"
  else
    WIN_W=960
    WIN_POS="0,0"
    SCREEN_H=1200
  fi

  "$CHROME" \
    --remote-debugging-port="$CDP_PORT" \
    --user-data-dir="$PROFILE" \
    --no-first-run \
    --no-default-browser-check \
    --disable-gpu \
    --disable-features=PasswordManagerOnboarding,PasswordManager,PasswordCheck |
    --disable-save-password-bubble \
    --disable-password-generation \
    --disable-password-manager-reauthentication \
    --password-store=basic \
    --no-default-app-check \
    --disable-extensions \
    --window-size="$WIN_W,$SCREEN_H" \
    --window-position="$WIN_POS" \
    "about:blank" \
    > "$LOGFILE" 2>&1 &

  echo $! > "$PIDFILE"
  disown

  # Wait for CDP
  for i in $(seq 1 20); do
    if curl -s "http://127.0.0.1:$CDP_PORT/json/version" > /dev/null 2>&1; then
      echo "Chrome ready on CDP port $CDP_PORT (PID $(cat $PIDFILE))"
      echo "Agent can now connect via: browser.cdp_port: $CDP_PORT"
      return 0
    fi
    sleep 0.5
  done

  echo "Chrome launched but CDP not ready yet. Check $LOGFILE"
  return 1
}

stop_browser() {
  if [ -f "$PIDFILE" ]; then
    PID=$(cat "$PIDFILE")
    if kill -0 "$PID" 2>/dev/null; then
      echo "Stopping Chrome (PID $PID)..."
      kill "$PID" 2>/dev/null
      sleep 1
      kill -9 "$PID" 2>/dev/null
      rm -f "$PIDFILE"
      echo "Stopped."
    else
      echo "Chrome not running (stale PID file)"
      rm -f "$PIDFILE"
    fi
  else
    echo "No browser running"
  fi
}

status_browser() {
  if [ -f "$PIDFILE" ] && kill -0 "$(cat $PIDFILE)" 2>/dev/null; then
    echo "Running (PID $(cat $PIDFILE)), CDP port $CDP_PORT"
  else
    echo "Not running"
  fi
}

take_screenshot() {
  cd "$DIR"
  node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:$CDP_PORT');
  const page = browser.contexts()[0]?.pages()[0];
  if (!page) { console.log('No page found'); process.exit(1); }
  await page.screenshot({ path: '$SCREENSHOT', type: 'png' });
  console.log('Screenshot: $SCREENSHOT');
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
" 2>&1
}

case "${1:-help}" in
  start)     start_browser ;;
  stop)      stop_browser ;;
  status)    status_browser ;;
  screenshot) take_screenshot ;;
  *) echo "Usage: $0 {start|stop|status|screenshot}" ;;
esac
