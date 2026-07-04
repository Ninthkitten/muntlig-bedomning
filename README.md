# Muntlig övning & bedömning

Eleven samtalar muntligt med en AI-examinator om lärarens material och får
formativ återkoppling där innehåll/resonemang bedöms **separat** från språklig
form (bias-medveten bedömning). Inget betyg sätts automatiskt.

## Kom igång

1. **API-nyckel** (krävs för samtal och återkoppling):
   ```bash
   cp .env.example .env
   # öppna .env och klistra in din nyckel från console.anthropic.com
   ```

2. **Starta servern**:
   ```bash
   npm install   # behövs bara första gången
   npm start
   ```

3. Öppna **http://localhost:3000** i Chrome (bäst stöd för taligenkänning).

## Arkitektur

| Del | Lösning |
|---|---|
| Backend | Express ([server.js](server.js)) |
| AI | Claude API, `claude-sonnet-5` |
| TTS (uppläsning) | Piper med svensk röst `sv_SE-nst-medium` via `/tts` – faller tillbaka på webbläsarens systemröst om Piper saknas |
| STT (taligenkänning) | Web Speech API i webbläsaren (sv-SE) |
| Frontend | [public/index.html](public/index.html) |

### Endpoints

- `POST /chat` – `{setup, history}` → examinatorns nästa replik
- `POST /feedback` – `{setup, history}` → formativ återkoppling i fyra sektioner
- `POST /tts` – `{text}` → wav-ljud med svensk Piper-röst (503 om Piper saknas)
- `GET /status` – visar om API-nyckel och TTS är på plats

### Piper (svensk röst)

Redan installerat på den här datorn. På en ny maskin:

```bash
pip3 install piper-tts
python3 -m piper.download_voices sv_SE-nst-medium --data-dir voices
```

## Viktiga principer (rör ej)

- Språklig form får aldrig påverka innehållsbedömningen
- Alltid formativ återkoppling, aldrig automatiska betyg
- De två dimensionerna redovisas separat för läraren
