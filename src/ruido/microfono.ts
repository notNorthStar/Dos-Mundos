/**
 * Micrófono como medidor de ruido (hito 5, DISENO.md §5.1).
 *
 *   getUserMedia ─▶ MediaStreamSource ─▶ AnalyserNode   (NO se conecta a la salida)
 *
 * Mide el RMS en dBFS, lo compara con el ruido base calibrado y manda `ruido/microfono`
 * unas 10 veces por segundo. Sin micrófono (o con `nivelSimulado` > 0) manda el nivel simulado,
 * que la integración conecta a una tecla (AGENTS.md §5: todo debe poder probarse sin micrófono).
 *
 * Contrato: docs/CONTRATOS.md §4 · `crearMicrofono(bus, ctx): Microfono`.
 */
import { CONFIG } from '../config';
import type { Bus, Sistema } from '../shared/contratos';
import { AJUSTES_RUIDO } from './ajustes';
import { dbANivel, promedioDb, rmsADb, suavizar } from './nivel';

export interface Microfono extends Sistema {
  /** true si hay micrófono funcionando. Solo lectura para el resto del juego. */
  activo: boolean;
  /** true mientras dura la calibración. Solo lectura. */
  calibrando: boolean;
  /** Ruido base en dBFS (lo fija `calibrar()`). */
  baseDb: number;
  /** Pide el micrófono. Nunca lanza: sin permiso o sin micrófono devuelve false. */
  iniciar(): Promise<boolean>;
  /** Mide CONFIG.ruido.segCalibracion segundos de silencio y guarda `baseDb`. Nunca lanza. */
  calibrar(): Promise<void>;
  /** Respaldo de teclado (0–1): si es > 0 o no hay micrófono, se manda en lugar del real. */
  nivelSimulado: number;
}

export function crearMicrofono(bus: Bus, ctx: AudioContext): Microfono {
  const AJ = AJUSTES_RUIDO;
  let stream: MediaStream | null = null;
  let fuente: MediaStreamAudioSourceNode | null = null;
  let analizador: AnalyserNode | null = null;
  let muestras: Float32Array<ArrayBuffer> | null = null;
  let iniciando: Promise<boolean> | null = null;
  let calibracion: Promise<void> | null = null;
  let terminarCalibracion: (() => void) | null = null;
  let nivel = 0;
  let segDesdeEnvio = 0;
  let destruido = false;

  function medirDb(): number {
    if (!analizador || !muestras) return AJ.pisoDb;
    analizador.getFloatTimeDomainData(muestras);
    return rmsADb(muestras, AJ.pisoDb);
  }

  function apagar(): void {
    if (stream) for (const t of stream.getTracks()) t.stop();
    fuente?.disconnect();
    analizador?.disconnect();
    stream = null;
    fuente = null;
    analizador = null;
    muestras = null;
    mic.activo = false;
  }

  async function pedirMicrofono(): Promise<boolean> {
    try {
      const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
      if (!md || typeof md.getUserMedia !== 'function') return false;
      const s = await md.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
      if (destruido) {
        for (const t of s.getTracks()) t.stop();
        return false;
      }
      if (s.getAudioTracks().length === 0) {
        for (const t of s.getTracks()) t.stop();
        return false;
      }
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch {
          // Si no se puede reanudar, el analizador devuelve silencio; no es fatal.
        }
      }
      const f = ctx.createMediaStreamSource(s);
      const a = ctx.createAnalyser();
      a.fftSize = AJ.fftSize;
      a.smoothingTimeConstant = 0;
      f.connect(a); // Solo al analizador: el micrófono nunca suena en los audífonos.
      stream = s;
      fuente = f;
      analizador = a;
      muestras = new Float32Array(a.fftSize);
      // Si desconectan el micrófono, se pasa al respaldo.
      for (const t of s.getAudioTracks()) t.addEventListener('ended', () => apagar());
      mic.activo = true;
      return true;
    } catch (e) {
      console.warn('[ruido] No hay micrófono o no se dio permiso:', e);
      apagar();
      return false;
    }
  }

  const mic: Microfono = {
    activo: false,
    calibrando: false,
    baseDb: AJ.baseDbInicial,
    nivelSimulado: 0,

    iniciar() {
      if (destruido) return Promise.resolve(false);
      if (mic.activo) return Promise.resolve(true);
      if (iniciando) return iniciando;
      const p = pedirMicrofono();
      iniciando = p;
      void p.then(() => {
        if (iniciando === p) iniciando = null;
      });
      return p;
    },

    calibrar() {
      if (!mic.activo || destruido) return Promise.resolve();
      if (calibracion) return calibracion;
      mic.calibrando = true;
      const lecturas: number[] = [];
      const inicio = performance.now();
      const duracionMs = CONFIG.ruido.segCalibracion * 1000;
      calibracion = new Promise<void>((resolver) => {
        const id = window.setInterval(() => {
          if (mic.activo) lecturas.push(medirDb());
          if (!mic.activo || performance.now() - inicio >= duracionMs) terminar();
        }, AJ.msMuestraCalibracion);
        const terminar = () => {
          window.clearInterval(id);
          if (lecturas.length > 0) mic.baseDb = promedioDb(lecturas, AJ.pisoDb);
          mic.calibrando = false;
          calibracion = null;
          terminarCalibracion = null;
          resolver();
        };
        terminarCalibracion = terminar;
      });
      return calibracion;
    },

    actualizar(dtSeg: number) {
      if (destruido) return;
      const simulado = Math.min(1, Math.max(0, Number.isFinite(mic.nivelSimulado) ? mic.nivelSimulado : 0));
      let objetivo: number;
      if (simulado > 0 || !mic.activo) objetivo = simulado;
      else if (mic.calibrando) objetivo = 0; // Mientras se mide el silencio no se reporta ruido.
      else objetivo = dbANivel(medirDb(), mic.baseDb, AJ.margenDb, CONFIG.ruido.rangoDb);

      nivel = suavizar(nivel, objetivo, dtSeg, AJ.tauSubida, AJ.tauBajada);
      segDesdeEnvio += dtSeg;
      if (segDesdeEnvio >= AJ.segEntreEnvios) {
        segDesdeEnvio = Math.min(segDesdeEnvio - AJ.segEntreEnvios, AJ.segEntreEnvios);
        bus.enviar('ruido/microfono', { nivel: Math.round(nivel * 1000) / 1000 });
      }
    },

    destruir() {
      if (destruido) return;
      destruido = true;
      terminarCalibracion?.();
      apagar();
    },
  };

  return mic;
}
