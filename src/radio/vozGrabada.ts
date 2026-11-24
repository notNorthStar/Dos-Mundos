/**
 * Voz del radio con clips grabados (WAV mono en public/radio/, generados con tools/generar-voces.mjs).
 *
 * Manifiesto (por omisión ./radio/voces.json):
 *   { "clips": { "avanza dos pasos": "avanza_dos_pasos.wav", … } }
 * La clave es la orden normalizada con `claveDeFrase`; el archivo es relativo a la carpeta del manifiesto.
 *
 * - Al crearla pide el manifiesto y precarga/decodifica todos los clips. Nunca lanza.
 * - `decir(texto)` parte el mensaje por SEPARADOR_ORDENES y toca un clip por orden, uno tras otro con
 *   una pausa corta. Si falta el manifiesto o algún clip del mensaje, el mensaje completo lo dice
 *   `respaldo` (la voz sintética); sin respaldo, resuelve sin decir nada.
 * - Suena por `salida` (un GainNode que NO va a ctx.destination): el audio lo conecta a su cadena de
 *   radio (src/audio/radio.ts), que le pone el filtro de banda, la saturación y la estática.
 */
import { CONFIG } from '../config';
import type { VozRadio } from '../shared/contratos';
import { SEPARADOR_ORDENES } from './mensaje';

/** Normaliza una orden para buscar su clip: minúsculas, sin espacios de sobra ni punto final. */
export function claveDeFrase(texto: string): string {
  return (texto ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parte un mensaje en órdenes (ya normalizadas como clave). */
export function ordenesDe(texto: string): string[] {
  return (texto ?? '')
    .split(SEPARADOR_ORDENES)
    .map(claveDeFrase)
    .filter((o) => o !== '');
}

/** Rampa de entrada/salida de cada clip (evita el clic si el WAV no empieza o termina en cero). */
const SEG_RAMPA = 0.006;

interface Sonando {
  src: AudioBufferSourceNode;
  g: GainNode;
}

export function crearVozGrabada(
  ctx: AudioContext,
  respaldo: VozRadio | null,
  urlManifiesto = './radio/voces.json',
): VozRadio {
  const cfg = CONFIG.radio.clips;
  const salida = ctx.createGain();
  salida.gain.value = cfg.volumen;

  const clips = new Map<string, AudioBuffer>();
  let manifiestoOk = false;
  let cargado = false;

  const cargar = async (): Promise<void> => {
    try {
      if (typeof fetch !== 'function') return;
      const base = typeof location !== 'undefined' ? location.href : 'http://localhost/';
      const urlBase = new URL(urlManifiesto, base);
      const r = await fetch(urlBase.href);
      if (!r.ok) {
        console.warn(`[radio] Sin manifiesto de voces (${r.status}): se usa la voz sintética.`);
        return;
      }
      const json = (await r.json()) as unknown;
      const lista = (json as { clips?: unknown } | null)?.clips;
      if (!lista || typeof lista !== 'object') {
        console.warn('[radio] El manifiesto de voces no tiene "clips": se usa la voz sintética.');
        return;
      }
      manifiestoOk = true;
      const entradas = Object.entries(lista as Record<string, unknown>).filter(
        (e): e is [string, string] => typeof e[1] === 'string' && e[1] !== '',
      );
      await Promise.all(
        entradas.map(async ([clave, archivo]) => {
          try {
            const rc = await fetch(new URL(archivo, urlBase).href);
            if (!rc.ok) throw new Error(`HTTP ${rc.status}`);
            const datos = await rc.arrayBuffer();
            const buffer = await ctx.decodeAudioData(datos);
            clips.set(claveDeFrase(clave), buffer);
          } catch (e) {
            console.warn(`[radio] No se pudo cargar el clip «${clave}» (${archivo}):`, e);
          }
        }),
      );
    } catch (e) {
      console.warn('[radio] Falló la carga de las voces grabadas:', e);
    } finally {
      cargado = true;
    }
  };
  const listo = cargar();

  /** Espera la carga, pero no más de `msEsperaCarga`. */
  const esperarCarga = (): Promise<void> => {
    if (cargado) return Promise.resolve();
    return new Promise<void>((resolver) => {
      const reloj = setTimeout(resolver, cfg.msEsperaCarga);
      void listo.then(() => {
        clearTimeout(reloj);
        resolver();
      });
    });
  };

  let generacion = 0;
  /** Hora de audio en que termina lo último programado (para encadenar llamadas seguidas). */
  let finProgramado = 0;
  const sonando = new Set<Sonando>();
  /** Mensajes en curso: callar() los resuelve. */
  const pendientes = new Set<() => void>();

  const soltar = (n: Sonando) => {
    sonando.delete(n);
    try {
      n.src.disconnect();
      n.g.disconnect();
    } catch {
      /* ya desconectado */
    }
  };

  /** Programa los clips y resuelve al terminar el último (o al callar). */
  const tocar = (buffers: AudioBuffer[]): Promise<void> =>
    new Promise<void>((resolver) => {
      let hecho = false;
      let reloj: ReturnType<typeof setTimeout> | undefined;
      const terminar = () => {
        if (hecho) return;
        hecho = true;
        if (reloj !== undefined) clearTimeout(reloj);
        pendientes.delete(terminar);
        resolver();
      };
      pendientes.add(terminar);
      try {
        const ahora = ctx.currentTime;
        let t = Math.max(ahora + 0.02, finProgramado > ahora ? finProgramado + cfg.segPausaEntreOrdenes : 0);
        let ultimo: Sonando | null = null;
        buffers.forEach((buf, i) => {
          if (i > 0) t += cfg.segPausaEntreOrdenes;
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const g = ctx.createGain();
          const dur = buf.duration;
          const rampa = Math.min(SEG_RAMPA, dur / 4);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(1, t + rampa);
          g.gain.setValueAtTime(1, Math.max(t + rampa, t + dur - rampa));
          g.gain.linearRampToValueAtTime(0, t + dur);
          src.connect(g);
          g.connect(salida);
          const n: Sonando = { src, g };
          sonando.add(n);
          src.onended = () => soltar(n);
          src.start(t);
          src.stop(t + dur + 0.01);
          t += dur;
          ultimo = n;
        });
        finProgramado = t;
        const fin = ultimo as Sonando | null;
        if (!fin) return terminar();
        fin.src.onended = () => {
          soltar(fin);
          terminar();
        };
        // Seguridad: si el contexto está suspendido, onended nunca llega.
        reloj = setTimeout(terminar, (t - ahora + 1) * 1000);
      } catch (e) {
        console.warn('[radio] No se pudo reproducir la voz grabada:', e);
        terminar();
      }
    });

  return {
    salida,

    async decir(texto: string): Promise<void> {
      try {
        const ordenes = ordenesDe(texto);
        if (ordenes.length === 0) return;
        const gen = generacion;
        await esperarCarga();
        if (gen !== generacion) return;
        const buffers = ordenes.map((o) => clips.get(o));
        if (!manifiestoOk || buffers.some((b) => b === undefined)) {
          if (manifiestoOk) {
            const faltan = ordenes.filter((o) => !clips.has(o));
            console.warn('[radio] Faltan clips para:', faltan, '→ voz de respaldo.');
          }
          if (respaldo) await Promise.resolve(respaldo.decir(texto)).catch(() => undefined);
          return;
        }
        await tocar(buffers as AudioBuffer[]);
      } catch (e) {
        console.warn('[radio] Falló la voz grabada:', e);
      }
    },

    callar(): void {
      generacion++;
      finProgramado = 0;
      try {
        const ahora = ctx.currentTime;
        for (const n of [...sonando]) {
          const p = n.g.gain;
          p.cancelScheduledValues(ahora);
          p.setValueAtTime(p.value, ahora);
          p.linearRampToValueAtTime(0, ahora + 0.015);
          try {
            n.src.stop(ahora + 0.03);
          } catch {
            /* ya detenida o sin arrancar */
          }
        }
      } catch {
        /* nada */
      }
      for (const fin of [...pendientes]) fin();
      try {
        respaldo?.callar();
      } catch {
        /* nada */
      }
    },
  };
}
