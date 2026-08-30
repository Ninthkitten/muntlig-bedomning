import 'dotenv/config';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir, networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  // Prototypen ändras ofta – låt aldrig webbläsaren visa en gammal version
  setHeaders: (res) => res.set('Cache-Control', 'no-store')
}));

const PORT = process.env.PORT || 3000;
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';

// Sätts ACCESS_CODE (t.ex. på hostingtjänsten) krävs koden för alla AI-anrop.
// Utan ACCESS_CODE (lokal användning) är allt öppet som vanligt.
const ACCESS_CODE = process.env.ACCESS_CODE || '';
app.use((req, res, next) => {
  if (!ACCESS_CODE || req.method !== 'POST') return next();
  if (req.get('x-access-code') === ACCESS_CODE) return next();
  res.status(401).json({ error: 'Åtkomstkod krävs. Skriv koden du har fått.' });
});

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// ---------- Promptbygge ----------

// Språk som samtalet kan föras på
const CONV_LANGS = { sv: 'svenska', en: 'engelska', de: 'tyska' };

function convLangName(lang) {
  return CONV_LANGS[lang] || CONV_LANGS.sv;
}

function setupText({ material, criteria, level, mode, convLang }) {
  return (
    'Material/ämne: """' + (material || '').trim() + '"""\n' +
    ((criteria || '').trim()
      ? 'Lärarens bedömningskriterier (t.ex. från Skolverket): """' + criteria.trim() + '"""\n'
      : '') +
    'Nivå: ' + level + '\n' +
    'Samtalets språk: ' + convLangName(convLang) + '\n' +
    'Läge: ' + (mode === 'ovning'
      ? 'ÖVNING – var stöttande, ge ledtrådar när eleven kör fast.'
      : 'BEDÖMNING – var neutral och vänlig examinator, ge inga ledtrådar.')
  );
}

// Bedöms språket? (gamla värden modersmal/flersprakig mappas för äldre elevlänkar)
function assessLanguage(langbg) {
  return langbg !== 'sprak_ej';
}
const LANG_NOTES = {
  bedoms:
    'Bedöm ämnesinnehåll och resonemang HELT SKILT från språklig form. Språkliga avvikelser får aldrig påverka innehållsbedömningen.',
  bedoms_ej:
    'Språket BEDÖMS INTE i detta samtal: kommentera inte uttal, ordval eller grammatik. Bedöm enbart ämnesinnehåll och resonemang.'
};

// Samtalshistorik ({role:'ai'|'me', text}) → Claude-meddelanden.
// Claude API kräver att turerna växlar strikt user/assistant, så
// intilliggande meddelanden med samma roll slås ihop.
function toMessages(history) {
  const msgs = [];
  for (const m of history || []) {
    const role = m.role === 'ai' ? 'assistant' : 'user';
    const text = String(m.text || '').trim();
    if (!text) continue;
    if (msgs.length && msgs[msgs.length - 1].role === role) {
      msgs[msgs.length - 1].content += '\n' + text;
    } else {
      msgs.push({ role, content: text });
    }
  }
  return msgs;
}

// Svaret kan innehålla tankeblock före texten – plocka ut textblocken.
function textOf(resp) {
  const text = resp.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (!text) throw new Error('AI:n gav inget textsvar (stop_reason: ' + resp.stop_reason + ')');
  return text;
}

function requireApi(res) {
  if (!anthropic) {
    res.status(503).json({
      error:
        'Ingen ANTHROPIC_API_KEY hittades. Kopiera .env.example till .env och lägg in din nyckel, starta sedan om servern.'
    });
    return false;
  }
  return true;
}

// ---------- /chat: examinatorns nästa replik ----------

app.post('/chat', async (req, res) => {
  if (!requireApi(res)) return;
  try {
    const { setup, history } = req.body || {};
    if (!setup || !String(setup.material || '').trim()) {
      return res.status(400).json({ error: 'setup.material saknas.' });
    }
    const isFirst = !(history || []).some((m) => m.role === 'ai');

    const lang = convLangName((setup || {}).convLang);
    const system =
      'Du är en vänlig muntlig examinator i en svensk skola. Du samtalar med en elev om ett material som läraren valt. ' +
      'Samtalet förs på ' + lang + '. Svara ENDAST med din nästa replik till eleven, på ' + lang + ', max 2–3 meningar, EN fråga i taget. ' +
      'Anpassa språk och svårighetsgrad till nivån.\n\n' +
      setupText(setup) +
      '\n\n' +
      (isFirst
        ? 'Hälsa kort välkommen och ställ en öppen inledande fråga om materialet, anpassad till nivån.'
        : 'Reagera kort på elevens senaste svar (bekräfta eller be om förtydligande) och ställ sedan en följdfråga som fördjupar eller breddar. Om svaret var tunt, be eleven utveckla eller ge ett exempel.');

    const messages = toMessages(history);
    if (!messages.length) messages.push({ role: 'user', content: '(Samtalet börjar nu.)' });

    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      // Snabba repliker i samtalet – ingen tankepaus mellan frågorna.
      thinking: { type: 'disabled' },
      system,
      messages
    });
    res.json({ reply: textOf(resp) });
  } catch (e) {
    console.error('/chat:', e);
    res.status(502).json({ error: 'AI-anropet misslyckades: ' + (e.message || e) });
  }
});

// ---------- /feedback: formativ återkoppling ----------

app.post('/feedback', async (req, res) => {
  if (!requireApi(res)) return;
  try {
    const { setup, history } = req.body || {};
    if (!setup || !(history || []).some((m) => m.role === 'me')) {
      return res.status(400).json({ error: 'Samtalet innehåller inga elevsvar.' });
    }
    const assessLang = assessLanguage(setup.langbg);
    const langNote = assessLang ? LANG_NOTES.bedoms : LANG_NOTES.bedoms_ej;

    const convo = (history || [])
      .map((m) => (m.role === 'ai' ? 'Examinator: ' : 'Elev: ') + m.text)
      .join('\n');

    const system =
      'Du är en erfaren lärare som ger formativ återkoppling på ett muntligt samtal' +
      (setup.convLang && setup.convLang !== 'sv'
        ? ' som fördes på ' + convLangName(setup.convLang) + '. Återkopplingen skrivs på svenska (den är till eleven och läraren), men citera gärna elevens formuleringar på originalspråket. '
        : '. ') +
      langNote;

    const hasCriteria = !!(setup.criteria || '').trim();
    const prompt =
      setupText(setup) +
      '\n\nSamtalet:\n' + convo + '\n\n' +
      (assessLang
        ? 'Svara på svenska med EXAKT dessa fyra rubriker, var och en på egen rad följd av 2–4 meningar:\n' +
          'INNEHÅLL OCH FÖRSTÅELSE:\nRESONEMANG OCH FÖRDJUPNING:\nSPRÅKLIG FRAMSTÄLLNING (separat från innehåll):\nNÄSTA STEG:\n'
        : 'Svara på svenska med EXAKT dessa tre rubriker, var och en på egen rad följd av 2–4 meningar:\n' +
          'INNEHÅLL OCH FÖRSTÅELSE:\nRESONEMANG OCH FÖRDJUPNING:\nNÄSTA STEG:\n') +
      'Var konkret, uppmuntrande och peka på exempel ur samtalet. ' +
      (hasCriteria
        ? (assessLang
          ? 'Relatera INNEHÅLL, RESONEMANG och SPRÅKLIG FRAMSTÄLLNING till lärarens bedömningskriterier (inklusive eventuella språkkriterier): beskriv vad i samtalet som visar vad i kriterierna, och vad som ännu inte syntes. '
          : 'Relatera INNEHÅLL och RESONEMANG till lärarens bedömningskriterier: beskriv vad i samtalet som visar vad i kriterierna, och vad som ännu inte syntes. Bortse från eventuella språkkriterier – språket bedöms inte. ')
        : '') +
      'Sätt INGET betyg, ange ingen betygsbokstav och påstå ALDRIG att eleven "klarat" en nivå, ett betygssteg eller ett kriterium – beskriv vad samtalet visar, tolkningen är lärarens.';

    // Återkopplingen får gärna vara genomtänkt – adaptivt tänkande är på
    // som standard, så max_tokens behöver rymma både tanke och svar.
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system,
      messages: [{ role: 'user', content: prompt }]
    });
    res.json({ feedback: textOf(resp) });
  } catch (e) {
    console.error('/feedback:', e);
    res.status(502).json({ error: 'AI-anropet misslyckades: ' + (e.message || e) });
  }
});

// ---------- /tts: svensk röst via Piper ----------

const PIPER_BIN = process.env.PIPER_BIN || 'piper';
const PIPER_VOICES = {
  sv: process.env.PIPER_VOICE || path.join(__dirname, 'voices', 'sv_SE-nst-medium.onnx'),
  en: path.join(__dirname, 'voices', 'en_US-lessac-medium.onnx'),
  de: path.join(__dirname, 'voices', 'de_DE-thorsten-medium.onnx')
};

let piperBinOk = null; // null = ej testad ännu
async function checkPiperBin() {
  if (piperBinOk !== null) return piperBinOk;
  try {
    await execFileAsync(PIPER_BIN, ['--help']);
    piperBinOk = true;
  } catch {
    piperBinOk = false;
  }
  return piperBinOk;
}

// Vilka språk har både Piper och en röstfil?
// DISABLE_TTS=true (t.ex. på Render, där CPU:n är för klen för Piper) stänger av
// serverrösten helt – webbläsarens systemröst tar då över automatiskt.
async function ttsLangs() {
  if (String(process.env.DISABLE_TTS || '').toLowerCase() === 'true') return {};
  if (!(await checkPiperBin())) return {};
  const out = {};
  for (const [lang, voice] of Object.entries(PIPER_VOICES)) out[lang] = existsSync(voice);
  return out;
}

app.post('/tts', async (req, res) => {
  const text = String((req.body || {}).text || '').trim();
  const lang = (req.body || {}).lang || 'sv';
  if (!text) return res.status(400).json({ error: 'Ingen text.' });
  const voice = PIPER_VOICES[lang] || PIPER_VOICES.sv;
  if (!(await checkPiperBin()) || !existsSync(voice)) {
    // Frontend faller tillbaka på webbläsarens systemröst.
    return res.status(503).json({ error: 'Ingen Piper-röst för språket "' + lang + '".' });
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'tts-'));
  const out = path.join(dir, 'out.wav');
  try {
    // Piper läser texten från stdin och skriver en wav-fil.
    await new Promise((resolve, reject) => {
      const p = spawn(PIPER_BIN, ['--model', voice, '--output_file', out]);
      p.stdin.end(text);
      p.on('close', (code) => (code === 0 ? resolve() : reject(new Error('piper exit ' + code))));
      p.on('error', reject);
    });
    res.set('Content-Type', 'audio/wav').send(readFileSync(out));
  } catch (e) {
    console.error('/tts:', e);
    res.status(500).json({ error: 'TTS misslyckades: ' + (e.message || e) });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Adress på lokala nätverket – används för elevlänkar så att de
// fungerar på andra datorer på samma nätverk.
function lanUrl() {
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) return 'http://' + ni.address + ':' + PORT;
    }
  }
  return null;
}

// Publik https-adress när "Dela publikt" är igång (skrivs av skriptet).
function publicUrl() {
  const f = path.join(__dirname, '.tunnel-url');
  try {
    if (existsSync(f)) {
      const u = readFileSync(f, 'utf8').trim();
      if (/^https:\/\//.test(u)) return u;
    }
  } catch {}
  return null;
}

// Statusinfo till frontend (visar t.ex. om API-nyckel saknas).
app.get('/status', async (_req, res) => {
  const langs = await ttsLangs();
  res.json({ api: !!anthropic, tts: !!langs.sv, ttsLangs: langs, model: MODEL, lanUrl: lanUrl(), publicUrl: publicUrl() });
});

app.listen(PORT, () => {
  console.log(`Muntlig bedömning: http://localhost:${PORT}`);
  if (!anthropic) console.warn('OBS: ANTHROPIC_API_KEY saknas – /chat och /feedback svarar 503.');
});
