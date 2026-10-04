# Muntlig övning & bedömning

Eleven samtalar muntligt med en AI-examinator om lärarens material och får
formativ återkoppling där innehåll/resonemang bedöms **separat** från språklig
form (bias-medveten bedömning). Inget betyg sätts automatiskt – underlaget
är till läraren.

## Kom igång

Kräver [Node.js](https://nodejs.org) samt en egen API-nyckel från
[console.anthropic.com](https://console.anthropic.com) (samtalen kostar en
slant per styck – nyckeln är din och hamnar aldrig i koden).

1. **API-nyckel**:
   ```bash
   cp .env.example .env
   # öppna .env och klistra in din nyckel
   ```

2. **Starta servern**:
   ```bash
   npm install   # behövs bara första gången
   npm start
   ```

3. Öppna **http://localhost:3000** i Chrome (bäst stöd för taligenkänning).
   På macOS går det också att dubbelklicka på `Starta appen.command`.

## Så används den

- **Läraren** fyller i material/ämne, väljer nivå, läge (öva/bedöma), språk
  (svenska, engelska eller tyska) och avslut: eleven avslutar själv, eller
  på tid (t.ex. 3 minuter – alla klara samtidigt). Bedömningskriterier kan
  klistras in och vävs då in i återkopplingen.
- **"Skapa elevlänk"** bakar in alla inställningar i en länk som ger eleven
  en låst, förenklad vy. Tomt material ⇒ eleven väljer ämne själv.
- **Eleven** talar (eller skriver) med examinatorn och får formativ
  återkoppling i fyra sektioner. Underlaget kan laddas ner som .txt eller
  skickas till läraren via Gmail.

### Dela utanför den egna datorn

Mikrofonen kräver https eller localhost (webbläsarregel). För att låta
andra testa med mikrofon – t.ex. under en workshop – kör
`Dela publikt.command` (kräver [cloudflared](https://github.com/cloudflare/cloudflared),
`brew install cloudflared`). Den skapar en tillfällig https-adress; stäng
fönstret när ni är klara. För permanent hostning finns `Dockerfile` och
`render.yaml` förberedda (sätt miljövariablerna `ANTHROPIC_API_KEY` och
gärna `ACCESS_CODE` som lås).

## Arkitektur

| Del | Lösning |
|---|---|
| Backend | Express ([server.js](server.js)) |
| AI | Claude API, `claude-sonnet-5` |
| TTS (uppläsning) | Piper-röster via `/tts` – faller tillbaka på webbläsarens systemröst om Piper saknas |
| STT (taligenkänning) | Web Speech API i webbläsaren |
| Frontend | [public/index.html](public/index.html) – ingen byggkedja, bara en fil |

### Endpoints

- `POST /chat` – `{setup, messages}` → examinatorns nästa replik
- `POST /feedback` – `{setup, messages}` → formativ återkoppling i fyra sektioner
- `POST /tts` – `{text, lang}` → wav-ljud via Piper (503 om Piper saknas)
- `GET /status` – visar om API-nyckel och röster är på plats

### Piper-röster (valfritt men rekommenderas)

Utan Piper används webbläsarens inbyggda röst. För bättre röster:

```bash
pip3 install piper-tts
python3 -m piper.download_voices sv_SE-nst-medium --data-dir voices
python3 -m piper.download_voices en_US-lessac-medium --data-dir voices   # engelska
python3 -m piper.download_voices de_DE-thorsten-medium --data-dir voices # tyska
```

Hittas inte `piper`-kommandot: sätt `PIPER_BIN=/sökväg/till/piper` i `.env`.

## Viktiga principer (rör ej)

Bygg gärna vidare – men dessa tre är projektets kärna:

- Språklig form får aldrig påverka innehållsbedömningen
- Alltid formativ återkoppling, aldrig automatiska betyg
- De två dimensionerna redovisas separat för läraren

## Licens

MIT – använd, ändra och sprid fritt. Se [LICENSE](LICENSE).
