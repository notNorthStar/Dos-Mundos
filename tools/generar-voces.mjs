/**
 * Genera los clips de voz del radio (public/radio/*.wav + voces.json) con la API de Gemini (TTS).
 * Se corre una sola vez; los clips quedan en el repositorio y el juego no necesita internet.
 *
 * La cuota gratuita es de unas 10 peticiones al día por modelo, así que se piden TODAS las frases
 * en un solo audio, con pausas largas, y aquí se corta por los silencios.
 *
 *   node tools/generar-voces.mjs                 pide el audio y lo corta
 *   node tools/generar-voces.mjs --desde a.pcm   corta una grabación ya descargada
 *   node tools/generar-voces.mjs --guardar a.pcm guarda además la grabación completa
 *
 * La clave se lee de la variable GEMINI_API_KEY o del archivo .env.local (que git ignora).
 * NUNCA escribas la clave en este archivo: el repositorio es público.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = join(RAIZ, 'public', 'radio');
const MODELO = 'gemini-3.8-flash-lite-tts';
const VOZ = 'Algenib';
const ESTILO =
  'Read each line below in Mexican Spanish with a low, grave, serious and tense voice, like a radio operator ' +
  'speaking quietly. Leave a full two-second silent pause after every line.';

/** Todas las órdenes que puede decir el radio (src/radio/mensaje.ts → frasesDelRadio). */
const PASOS = ['un paso', 'dos pasos', 'tres pasos', 'cuatro pasos', 'cinco pasos'];
const FRASES = [
  'Avanza',
  ...PASOS.map((p) => `Avanza ${p}`),
  'Date la vuelta',
  ...PASOS.map((p) => `Retrocede ${p}`),
  'Gira a la izquierda',
  'Gira a la derecha',
  'Sube',
  'Agáchate, está en el piso',
  'Quieto, no hagas ruido',
  'Ahí está, agárralo',
  ...PASOS.map((p) => p[0].toUpperCase() + p.slice(1)),
];

/** La misma normalización que `claveDeFrase` en src/radio/vozGrabada.ts. */
const clave = (t) => t.trim().toLowerCase().replace(/\.+$/, '').replace(/\s+/g, ' ');
const archivoDe = (t) =>
  clave(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '.wav';

function leerClave() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  const env = join(RAIZ, '.env.local');
  const m = existsSync(env) && readFileSync(env, 'utf8').match(/^GEMINI_API_KEY=(.+)$/m);
  if (!m) throw new Error('Falta GEMINI_API_KEY (variable de entorno o .env.local).');
  return m[1].trim();
}

/** PCM de 16 bits mono → WAV. */
function aWav(pcm, hz) {
  const cab = Buffer.alloc(44);
  cab.write('RIFF', 0);
  cab.writeUInt32LE(36 + pcm.length, 4);
  cab.write('WAVEfmt ', 8);
  cab.writeUInt32LE(16, 16);
  cab.writeUInt16LE(1, 20);
  cab.writeUInt16LE(1, 22);
  cab.writeUInt32LE(hz, 24);
  cab.writeUInt32LE(hz * 2, 28);
  cab.writeUInt16LE(2, 32);
  cab.writeUInt16LE(16, 34);
  cab.write('data', 36);
  cab.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([cab, pcm]);
}

/** Si la respuesta viene como WAV, se queda solo con las muestras. */
function soloMuestras(buf) {
  if (buf.subarray(0, 4).toString('latin1') !== 'RIFF') return buf;
  const i = buf.indexOf('data', 12, 'latin1');
  return i < 0 ? buf.subarray(44) : buf.subarray(i + 8);
}

const HZ = 24000;
const VENTANA = 480; // 20 ms
const UMBRAL = 250;
const VENTANAS_DE_SILENCIO = 30; // 0,6 s: más que la pausa de una coma, menos que la pausa entre frases

/** Tramos con voz, separados por silencios largos. Devuelve [inicio, fin) en muestras. */
function segmentar(pcm) {
  const energia = [];
  for (let i = 0; i + VENTANA * 2 <= pcm.length; i += VENTANA * 2) {
    let suma = 0;
    for (let q = 0; q < VENTANA; q++) {
      const v = pcm.readInt16LE(i + q * 2);
      suma += v * v;
    }
    energia.push(Math.sqrt(suma / VENTANA));
  }
  const tramos = [];
  let ini = -1;
  let silencio = 0;
  for (let i = 0; i < energia.length; i++) {
    if (energia[i] > UMBRAL) {
      if (ini < 0) ini = i;
      silencio = 0;
    } else if (ini >= 0 && ++silencio >= VENTANAS_DE_SILENCIO) {
      tramos.push([ini * VENTANA, (i - silencio + 1) * VENTANA]);
      ini = -1;
      silencio = 0;
    }
  }
  if (ini >= 0) tramos.push([ini * VENTANA, energia.length * VENTANA]);
  return tramos;
}

/** Recorta con margen, iguala el volumen (pico a −3 dB) y suaviza los bordes para que no truenen. */
function pulir(pcm, [ini, fin]) {
  const margen = Math.round(HZ * 0.05);
  const a = Math.max(0, ini - margen);
  const b = Math.min(pcm.length / 2, fin + margen);
  const n = b - a;
  let pico = 1;
  for (let i = 0; i < n; i++) pico = Math.max(pico, Math.abs(pcm.readInt16LE((a + i) * 2)));
  const ganancia = (32767 * 0.707) / pico;
  const rampa = Math.round(HZ * 0.008);
  const salida = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const borde = Math.min(1, i / rampa, (n - 1 - i) / rampa);
    salida.writeInt16LE(Math.round(pcm.readInt16LE((a + i) * 2) * ganancia * borde), i * 2);
  }
  return salida;
}

async function pedirGrabacion(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;
  const texto = [ESTILO, FRASES.map((f) => `${f}.`).join('\n\n[pause]\n\n')].join('\n\n');
  const cuerpo = {
    contents: [{ parts: [{ text: texto }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOZ } } },
    },
  };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(cuerpo),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  const parte = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!parte) throw new Error(`Sin audio: ${JSON.stringify(j).slice(0, 300)}`);
  return Buffer.from(parte.inlineData.data, 'base64');
}

const opcion = (nombre) => {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : null;
};

const desde = opcion('--desde');
const bruto = desde ? readFileSync(desde) : await pedirGrabacion(leerClave());
const guardar = opcion('--guardar');
if (guardar) writeFileSync(guardar, bruto);
const pcm = soloMuestras(bruto);
const tramos = segmentar(pcm);
// El modelo a veces lee primero la instrucción: las frases son siempre los últimos tramos.
const sobran = tramos.length - FRASES.length;
if (sobran < 0 || sobran > 3) {
  throw new Error(`Se esperaban ${FRASES.length} frases y salieron ${tramos.length} tramos: vuelve a intentarlo.`);
}
mkdirSync(SALIDA, { recursive: true });
const clips = {};
FRASES.forEach((frase, i) => {
  const archivo = archivoDe(frase);
  const audio = pulir(pcm, tramos[sobran + i]);
  writeFileSync(join(SALIDA, archivo), aWav(audio, HZ));
  clips[clave(frase)] = archivo;
  console.log(`✓ ${archivo.padEnd(34)} ${(audio.length / 2 / HZ).toFixed(2)} s`);
});
writeFileSync(join(SALIDA, 'voces.json'), JSON.stringify({ modelo: MODELO, voz: VOZ, clips }, null, 2) + '\n');
console.log(`Listo: ${FRASES.length} frases en public/radio/voces.json`);
