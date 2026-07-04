#!/bin/bash
# Dubbelklicka för att dela appen publikt (t.ex. under ett webinar).
# En säker https-adress skapas som fungerar för alla – inklusive mikrofonen.
cd "$(dirname "$0")"

if ! curl -s -m 2 http://localhost:3000/status > /dev/null 2>&1; then
  echo "Startar servern..."
  nohup node server.js > server.log 2>&1 &
  sleep 2
fi

echo "Skapar publik adress (tar ca 10 sekunder)..."
LOG=$(mktemp)
cloudflared tunnel --url http://localhost:3000 > "$LOG" 2>&1 &
TUNNEL_PID=$!
trap 'kill $TUNNEL_PID 2>/dev/null' EXIT

URL=""
for i in $(seq 1 30); do
  URL=$(grep -o 'https://[a-z-]*\.trycloudflare\.com' "$LOG" | head -1)
  [ -n "$URL" ] && break
  sleep 1
done

if [ -z "$URL" ]; then
  echo "Kunde inte skapa en publik adress – kontrollera internetanslutningen och prova igen."
  exit 1
fi

clear
echo "════════════════════════════════════════════════════════"
echo ""
echo "  PUBLIK ADRESS – kopierad till urklipp:"
echo ""
echo "      $URL"
echo ""
echo "  Gör så här:"
echo "  1. Öppna adressen i Chrome (öppnas automatiskt nu)"
echo "  2. Fyll i materialet och klicka 'Skapa elevlänk' DÄR"
echo "  3. Dela elevlänken i webinar-chatten"
echo ""
echo "  Deltagarna kan tala med examinatorn – mikrofonen"
echo "  fungerar eftersom adressen är säker (https)."
echo ""
echo "  Delningen pågår så länge det här fönstret är öppet."
echo "  STÄNG FÖNSTRET när webinariet är klart – då slutar"
echo "  delningen och ingen mer kan använda din API-nyckel."
echo ""
echo "════════════════════════════════════════════════════════"
printf '%s' "$URL" | pbcopy
open "$URL"
wait $TUNNEL_PID
