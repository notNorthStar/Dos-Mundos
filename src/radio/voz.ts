/**
 * Voz del radio (DISENO.md §4.2). MVP: voz sintética con speechSynthesis en español de México.
 * La estática y el filtro de radio los pone el audio de Oído (src/audio), no esta voz.
 *
 * ── Futuro: crearVozGrabada(ctx: AudioContext): VozRadio ──────────────────────────────────────────
 * Misma interfaz VozRadio, sin tocar el resto del código:
 *   1. Precargar con fetch + ctx.decodeAudioData un AudioBuffer por clip grabado por el equipo
 *      (public/radio/avanza.ogg, retrocede.ogg, gira_izquierda.ogg, uno.ogg … cinco.ogg, paso.ogg,
 *      pasos.ogg, pausa corta…), en un Map<string, AudioBuffer>.
 *   2. decir(texto): partir el texto en órdenes por SEPARADOR_ORDENES (src/radio/mensaje.ts) y cada
 *      orden en frases conocidas ("Avanza" + "dos" + "pasos"); mapear cada frase a su clip (lo ideal
 *      es que fichasATexto tenga una gemela que devuelva la lista de claves de clip).
 *   3. Programar los AudioBufferSourceNode uno tras otro con start(t) acumulando duraciones (+ pausa
 *      entre órdenes), todos hacia un GainNode de salida que el audio conecta a su cadena de radio
 *      (mono, filtro de banda, estática).
 *   4. Resolver cuando termine el último (onended) con el mismo tiempo límite de seguridad; callar()
 *      llama stop() a los nodos programados. Si falta un clip, caer a la voz sintética para esa frase.
 */
import { CONFIG } from '../config';
import type { VozRadio } from '../shared/contratos';
import { AJUSTES_RADIO } from './ajustes';

/** Lo mínimo que se usa de SpeechSynthesisVoice (permite probar la elección sin navegador). */
export interface VozDisponible {
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
}

const normalizarIdioma = (l: string) => (l || '').replace('_', '-').toLowerCase();

/**
 * Elige la mejor voz: primero la del idioma exacto (es-MX), luego cualquier es-*, luego la
 * predeterminada (null = que el navegador decida). Entre empates prefiere las locales (funcionan
 * sin internet, como en el foro) y las "Natural"/"Neural" (suenan mejor).
 */
export function elegirVoz<V extends VozDisponible>(voces: readonly V[], idioma: string): V | null {
  const objetivo = normalizarIdioma(idioma);
  const base = objetivo.split('-')[0];
  let mejor: V | null = null;
  let mejorPuntos = 0;
  for (const v of voces) {
    const l = normalizarIdioma(v.lang);
    let puntos = 0;
    if (l === objetivo) puntos = 100;
    else if (l.split('-')[0] === base) puntos = 50;
    else continue;
    if (v.localService) puntos += 10;
    if (/natural|neural/i.test(v.name)) puntos += 5;
    if (v.default) puntos += 1;
    if (puntos > mejorPuntos) [mejor, mejorPuntos] = [v, puntos];
  }
  return mejor;
}

/** Tiempo límite de seguridad para una frase (por si `onend` nunca llega). */
export function msLimiteFrase(texto: string, velocidad: number = CONFIG.radio.voz.velocidad): number {
  const a = AJUSTES_RADIO.voz;
  const v = velocidad > 0 ? velocidad : 1;
  return Math.max(a.msMinimo, (texto.length * a.msPorCaracter) / v) + a.msMargen;
}

/**
 * Voz sintética del radio. Las frases se dicen en orden (una cola propia): cada `decir` resuelve
 * cuando termina la suya. Nunca lanza. Sin speechSynthesis, resuelve de inmediato.
 */
export function crearVozSintetica(): VozRadio {
  const synth: SpeechSynthesis | null =
    typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  const cfg = CONFIG.radio.voz;

  let voz: SpeechSynthesisVoice | null = null;
  const cargarVoces = () => {
    try {
      voz = synth ? elegirVoz(synth.getVoices(), cfg.idioma) : null;
    } catch {
      voz = null;
    }
  };
  if (synth) {
    cargarVoces();
    // Las voces cargan de forma asíncrona (en Chrome getVoices() empieza vacío).
    try {
      synth.addEventListener('voiceschanged', cargarVoces);
    } catch {
      /* navegador viejo: se reintenta en cada decir */
    }
  }

  /** Generación: callar() la sube y las frases en cola de antes se descartan. */
  let generacion = 0;
  let cola: Promise<void> = Promise.resolve();
  /** Frases en curso: se guardan para que el recolector no se coma el utterance (otro bug de Chrome). */
  const enCurso = new Set<{ u: SpeechSynthesisUtterance; terminar: () => void }>();

  const hablar = (texto: string, gen: number): Promise<void> =>
    new Promise<void>((resolver) => {
      if (!synth || gen !== generacion) return resolver();
      if (!voz) cargarVoces();
      let hecho = false;
      let temporizador: ReturnType<typeof setTimeout> | undefined;
      const registro = { u: null as unknown as SpeechSynthesisUtterance, terminar: () => {} };
      const terminar = () => {
        if (hecho) return;
        hecho = true;
        if (temporizador !== undefined) clearTimeout(temporizador);
        enCurso.delete(registro);
        resolver();
      };
      registro.terminar = terminar;
      try {
        const u = new SpeechSynthesisUtterance(texto);
        registro.u = u;
        u.lang = voz?.lang ?? cfg.idioma;
        if (voz) u.voice = voz;
        u.rate = cfg.velocidad;
        u.pitch = cfg.tono;
        u.volume = 1;
        u.onend = terminar;
        u.onerror = terminar;
        enCurso.add(registro);
        temporizador = setTimeout(terminar, msLimiteFrase(texto, cfg.velocidad));
        synth.speak(u);
      } catch {
        terminar();
      }
    });

  return {
    decir(texto: string): Promise<void> {
      const limpio = (texto ?? '').trim();
      if (!synth || !limpio) return Promise.resolve();
      const gen = generacion;
      const p = cola.then(() => hablar(limpio, gen));
      cola = p.catch(() => undefined);
      return p.catch(() => undefined);
    },
    callar(): void {
      generacion++;
      try {
        synth?.cancel();
      } catch {
        /* nada */
      }
      // Si el navegador no manda onend al cancelar, se resuelven aquí.
      for (const r of [...enCurso]) r.terminar();
    },
  };
}
