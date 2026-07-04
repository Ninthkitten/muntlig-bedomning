#!/bin/bash
# Dubbelklicka på den här filen för att starta Muntlig övning & bedömning.
cd "$(dirname "$0")"

# Starta servern om den inte redan kör
if ! curl -s -m 2 http://localhost:3000/status > /dev/null 2>&1; then
  echo "Startar servern..."
  nohup node server.js > server.log 2>&1 &
  sleep 2
fi

echo "Öppnar appen i webbläsaren..."
open -a "Google Chrome" http://localhost:3000 2>/dev/null || open http://localhost:3000
echo "Klart! Du kan stänga det här fönstret."
