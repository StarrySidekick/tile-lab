#!/bin/bash
# Double-click this file to play. It starts a tiny local web server and opens
# the game in your browser. Closing this Terminal window stops the server.

cd "$(dirname "$0")" || exit 1
PORT=5180

if curl -s -o /dev/null --max-time 1 "http://localhost:$PORT"; then
  echo "Tilemaker's Workshop is already running."
  open "http://localhost:$PORT"
  exit 0
fi

python3 -m http.server "$PORT" --directory . >/dev/null 2>&1 &
SERVER=$!

# Wait for the server to answer before opening the browser.
for _ in $(seq 1 40); do
  curl -s -o /dev/null --max-time 1 "http://localhost:$PORT" && break
  sleep 0.1
done

open "http://localhost:$PORT"

echo ""
echo "  Workshop is running:  http://localhost:$PORT"
echo "  Tile atlas:           http://localhost:$PORT/atlas.html"
echo ""
echo "  Close this window (or press Ctrl-C) to stop the server."
echo ""

trap 'kill $SERVER 2>/dev/null' EXIT
wait $SERVER
