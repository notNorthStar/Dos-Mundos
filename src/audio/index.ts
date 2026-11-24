/**
 * Audio de Oído (hito 3): audio espacial 3D, oclusión, reverberación por cuarto, pisadas,
 * monstruo, faros de los objetos, latido y radio. Todo sintetizado (sin archivos de audio).
 *
 * Grafo (ver mezcla.ts para el detalle de los buses):
 *   - Fuentes 3D persistentes (FuenteEspacial): monstruo (voz + pasos), decibelímetro (faro) y
 *     llave (faro). Temporales: puertas, cerradura y salida.
 *   - En la cabeza (mezcla.cabeza): pisadas, golpe, roce, objetos en la mano, grito.
 *   - Internos sin reverb (mezcla.interno): latido y estática al ser atrapado.
 *   - Radio (mezcla.radio): chasquidos, estática y la voz grabada si la hay; agacha el resto (ducking).
 *
 * Voz del monstruo según su estado (recetas en sonidos.ts, tiempos en ajustes.monstruo):
 *   - patrulla: respiración trabajosa e irregular + estertores, castañeteos y gemidos sueltos.
 *   - escucha:  la voz se corta; silencio con algún olfateo o clic aislado.
 *   - caza:     alarido disonante al empezar, luego jadeo rápido y gruñidos guturales.
 *   - atrapa:   estática y grito (final).
 *
 * El oyente mira hacia `rumbo + cabeza`: girar la cabeza con el mouse sirve para ubicar sonidos.
 * Con `monitor` (PC de Vista) se oye lo mismo, desde Oído, como por la bocina de la caseta.
 *
 * Contrato: docs/CONTRATOS.md §4 · `crearAudio(bus, mapa, ctx, voz, opciones?): Sistema`.
 */
import { CONFIG } from '../config';
import type {
  Bus,
  EstadoJuego,
  EstadoMonstruo,
  Fase,
  Mapa,
  ObjetoId,
  Punto,
  Sistema,
  VozRadio,
} from '../shared/contratos';
import { centroDe, distancia, hayPared } from '../shared/mapaUtil';
import { AJUSTES_AUDIO } from './ajustes';
import { FuenteEspacial } from './fuente3d';
import { crearMezcla } from './mezcla';
import { elegir, entre, limitar, Sintesis, variar, type Disparo } from './nucleo';
import { Programador } from './programador';
import { ColaRadio } from './radio';
import * as snd from './sonidos';

type ModoMonstruo = 'patrulla' | 'escucha' | 'caza' | 'callado';

export interface OpcionesAudio {
  /**
   * PC de Vista: la misma mezcla oída desde Oído, por un filtro de bocina de monitor
   * (ajustes.monitor). Los mensajes del radio no se dicen con voz: solo chasquido y estática.
   */
  monitor?: boolean;
}

/** Hacia dónde oye Oído: cuerpo + cabeza (la cabeza puede faltar si la simulación es vieja). */
function orientacionOido(e: EstadoJuego): number {
  const cabeza = e.oido.cabeza;
  return e.oido.rumbo + (typeof cabeza === 'number' && Number.isFinite(cabeza) ? cabeza : 0);
}

/** Aplica un fundido solo si el objetivo cambió (evita llenar de eventos la línea de tiempo). */
function crearFundido(aplicar: (v: number, tau: number) => void): (v: number, tau: number) => void {
  let ultimo = Number.NaN;
  return (v, tau) => {
    if (Math.abs(v - ultimo) < 0.005) return;
    ultimo = v;
    aplicar(v, tau);
  };
}

export function crearAudio(
  bus: Bus,
  mapa: Mapa,
  ctx: AudioContext,
  voz: VozRadio | null,
  opciones: OpcionesAudio = {},
): Sistema {
  const A = AJUSTES_AUDIO;
  const monitor = opciones.monitor === true;
  const s = new Sintesis(ctx);
  const mezcla = crearMezcla(ctx, { monitor });
  // En el monitor de Vista el radio no habla: solo se oye que la transmisión salió.
  const radio = new ColaRadio(s, mezcla, monitor ? null : voz);

  let estado: EstadoJuego | null = null;
  let faseAnterior: Fase | null = null;
  let finalSonado = false;
  let pie = 1;
  let segDesdeOclusion = Infinity;
  let destruido = false;
  /** Objetos agarrados según `sim/objeto` (llega antes que el siguiente estado). */
  const agarrados = new Set<ObjetoId>();
  const tiene = (e: EstadoJuego, id: ObjetoId) => e.inventario[id] || agarrados.has(id);

  // ───────────── Oyente ─────────────
  const L = ctx.listener;
  const oyenteAplicado = { x: NaN, z: NaN, rumbo: NaN };
  if (L.upX) {
    L.upX.value = 0;
    L.upY.value = 1;
    L.upZ.value = 0;
  }

  function colocarOyente(p: Punto, rumbo: number, inmediato: boolean): void {
    const cambio =
      Math.abs(p.x - oyenteAplicado.x) > 0.001 ||
      Math.abs(p.z - oyenteAplicado.z) > 0.001 ||
      Math.abs(rumbo - oyenteAplicado.rumbo) > 0.01;
    if (!cambio && !inmediato) return;
    oyenteAplicado.x = p.x;
    oyenteAplicado.z = p.z;
    oyenteAplicado.rumbo = rumbo;
    const r = (rumbo * Math.PI) / 180;
    const fx = Math.sin(r);
    const fz = -Math.cos(r);
    const y = A.alturas.oido;
    if (L.positionX) {
      const ahora = ctx.currentTime;
      const tau = A.suavizado.tauOyente;
      const pares: [AudioParam, number][] = [
        [L.positionX, p.x],
        [L.positionY, y],
        [L.positionZ, p.z],
        [L.forwardX, fx],
        [L.forwardY, 0],
        [L.forwardZ, fz],
      ];
      for (const [param, v] of pares) {
        if (inmediato) {
          param.cancelScheduledValues(ahora);
          param.setValueAtTime(v, ahora);
        } else param.setTargetAtTime(v, ahora, tau);
      }
    } else {
      // Navegadores sin AudioParam en el oyente.
      const viejo = L as unknown as {
        setPosition(x: number, y: number, z: number): void;
        setOrientation(x: number, y: number, z: number, ux: number, uy: number, uz: number): void;
      };
      viejo.setPosition(p.x, y, p.z);
      viejo.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  // ───────────── Fuentes persistentes ─────────────
  const nuevaFuente = (pos: Punto, altura: number, volumen = 0) =>
    new FuenteEspacial(ctx, mezcla.seco, mezcla.envioReverb, pos, altura, volumen);

  const monstruo = nuevaFuente(mapa.inicioMonstruo, A.alturas.monstruo);
  const volMonstruo = crearFundido((v, tau) => monstruo.fundir(v, tau));
  /** Sub-bus de la voz (respiración, gruñidos…): es lo que "se corta" en 'escucha'. */
  const vozMonstruo = ctx.createGain();
  vozMonstruo.gain.value = 0;
  vozMonstruo.connect(monstruo.entrada);
  const volVoz = crearFundido((v, tau) => {
    const ahora = ctx.currentTime;
    vozMonstruo.gain.cancelScheduledValues(ahora);
    vozMonstruo.gain.setValueAtTime(vozMonstruo.gain.value, ahora);
    vozMonstruo.gain.setTargetAtTime(v, ahora, tau);
  });

  const defDecibelimetro = mapa.objetos.find((o) => o.id === 'decibelimetro');
  const defLlave = mapa.objetos.find((o) => o.id === 'llave');
  const alturaObjeto = (enElPiso: boolean) => (enElPiso ? A.alturas.llave : A.alturas.decibelimetro);
  const faroDec = defDecibelimetro ? nuevaFuente(defDecibelimetro.pos, alturaObjeto(defDecibelimetro.enElPiso)) : null;
  const faroLlave = defLlave ? nuevaFuente(defLlave.pos, alturaObjeto(defLlave.enElPiso)) : null;
  const volFaroDec = crearFundido((v, tau) => faroDec?.fundir(v, tau));
  const volFaroLlave = crearFundido((v, tau) => faroLlave?.fundir(v, tau));

  /** Latido: bus interno con fundido de entrada. */
  const busLatido = ctx.createGain();
  busLatido.gain.value = 0;
  busLatido.connect(mezcla.interno);
  const volLatido = crearFundido((v, tau) => {
    const ahora = ctx.currentTime;
    busLatido.gain.cancelScheduledValues(ahora);
    busLatido.gain.setValueAtTime(busLatido.gain.value, ahora);
    busLatido.gain.setTargetAtTime(v, ahora, tau);
  });

  const persistentes: FuenteEspacial[] = [monstruo];
  if (faroDec) persistentes.push(faroDec);
  if (faroLlave) persistentes.push(faroLlave);
  /** Fuentes de un solo sonido (puertas, cerradura, salida); se destruyen al terminar. */
  const temporales = new Set<FuenteEspacial>();

  // ───────────── Bucles ─────────────
  const M = A.monstruo;
  let modoMonstruo: ModoMonstruo = 'callado';
  /**
   * Estado del monstruo que manda en el audio. `sim/monstruoEstado` lo cambia al instante;
   * `sim/estado` solo cuando su propio valor cambia (una foto atrasada no deshace el evento).
   */
  let estadoMonstruo: EstadoMonstruo = 'patrulla';
  let ultimoDeLaFoto: EstadoMonstruo | null = null;
  /** Lo que suena de la voz del monstruo: se corta al cambiar de modo (nada se encima). */
  const vocesMonstruo = new Set<Disparo>();
  const seguir = (v: snd.VozMonstruo): snd.VozMonstruo => {
    for (const d of vocesMonstruo) if (!d.vivo) vocesMonstruo.delete(d);
    vocesMonstruo.add(v.d);
    return v;
  };
  const cortarVoces = (tau: number): void => {
    for (const d of vocesMonstruo) d.cortar(tau);
    vocesMonstruo.clear();
  };

  /** Patrulla: respiro trabajoso; caza: jadeo. Cada uno sortea su duración y la pausa siguiente. */
  const progRespiracion = new Programador(ctx, (t) => {
    if (modoMonstruo === 'caza') {
      const v = seguir(snd.jadeo(s, vozMonstruo, t));
      return v.seg + entre(M.caza.segEntreJadeos);
    }
    const P = M.patrulla;
    const v = seguir(snd.respiroPatrulla(s, vozMonstruo, t));
    return v.seg + (Math.random() < P.probPausaLarga ? entre(P.segPausaLarga) : entre(P.segPausa));
  });

  /** Patrulla: estertor, castañeteo o gemido suelto, a intervalos al azar. */
  const progExtras = new Programador(ctx, (t) => {
    const cual = elegir(M.patrulla.pesosExtras);
    const receta = cual === 'estertor' ? snd.estertor : cual === 'chasquidos' ? snd.chasquidos : snd.gemido;
    const v = seguir(receta(s, vozMonstruo, t));
    return v.seg + entre(M.patrulla.segEntreExtras);
  });

  /** Escucha: la voz está cortada; olfateos o clics sueltos directo a la fuente. */
  const progEscucha = new Programador(ctx, (t) => {
    const receta = Math.random() < M.escucha.probOlfateo ? snd.olfateo : snd.clic;
    const v = seguir(receta(s, monstruo.entrada, t));
    return v.seg + entre(M.escucha.segEntre);
  });

  const progGrunido = new Programador(ctx, (t) => {
    const v = seguir(snd.grunido(s, vozMonstruo, t));
    return v.seg + entre(M.caza.segEntreGrunidos);
  });

  const progFaroDec = new Programador(ctx, (t) => {
    if (faroDec) snd.faroDecibelimetro(s, faroDec.entrada, t);
    return variar(A.faros.segPitidoDecibelimetro, 0.1);
  });

  const progFaroLlave = new Programador(ctx, (t) => {
    if (faroLlave) snd.faroLlave(s, faroLlave.entrada, t);
    return variar(A.faros.segTintineoLlave, 0.15);
  });

  const progLatido = new Programador(ctx, (t) => {
    const { bpm, intensidad } = ritmoCardiaco();
    snd.latido(s, busLatido, t, intensidad);
    return 60 / bpm;
  });

  const progsMonstruo = [progRespiracion, progExtras, progEscucha, progGrunido];
  const programadores = [...progsMonstruo, progFaroDec, progFaroLlave, progLatido];

  function ritmoCardiaco(): { bpm: number; intensidad: number } {
    const H = A.latido;
    if (!estado) return { bpm: H.bpmBase, intensidad: 1 };
    const d = distancia(estado.monstruo.pos, estado.oido.pos);
    const cercania = limitar((H.metrosLejos - d) / (H.metrosLejos - H.metrosCerca), 0, 1);
    const bpm = Math.min(H.bpmMax, H.bpmBase + estado.ruido.nivel * H.bpmPorRuido + cercania * H.bpmPorMonstruo);
    const intensidad = 1 + (H.volumenExtraMax * (bpm - H.bpmBase)) / (H.bpmMax - H.bpmBase);
    return { bpm, intensidad };
  }

  /** Cambia la voz del monstruo según su estado (y la fase). */
  function fijarModo(modo: ModoMonstruo): void {
    if (modo === modoMonstruo) return;
    const anterior = modoMonstruo;
    modoMonstruo = modo;
    // Lo que sonaba no debe encimarse con el nuevo modo ni reaparecer tras el silencio.
    cortarVoces(modo === 'caza' ? 0.05 : M.tauCorte);
    for (const p of progsMonstruo) p.parar();
    switch (modo) {
      case 'callado':
        volVoz(0, M.tauCorte);
        return;
      case 'escucha':
        // Se corta la respiración: silencio tenso y, después, algún olfateo o clic.
        volVoz(0, M.tauCorte);
        progEscucha.arrancar(entre(M.escucha.segAntesPrimero));
        return;
      case 'patrulla': {
        const deSilencio = anterior === 'callado' || anterior === 'escucha';
        volVoz(1, deSilencio ? M.tauVuelta : 0.05);
        progRespiracion.arrancar(deSilencio ? M.segPausaVuelta : 0.3);
        progExtras.arrancar(entre(M.patrulla.segEntreExtras));
        return;
      }
      case 'caza':
        // El alarido lo dispara `sim/monstruoEstado`; el jadeo entra cuando va bajando.
        volVoz(1, 0.02);
        progRespiracion.arrancar(M.caza.segAntesJadeo);
        progGrunido.arrancar(M.caza.segAntesJadeo + entre(M.caza.segEntreGrunidos) * 0.5);
        return;
    }
  }

  function modoDe(e: EstadoMonstruo, jugando: boolean): ModoMonstruo {
    if (!jugando) return 'callado';
    return e === 'patrulla' ? 'patrulla' : e === 'escucha' ? 'escucha' : e === 'caza' ? 'caza' : 'callado';
  }

  /** Enciende o apaga los bucles según el último estado. */
  function actualizarBucles(): void {
    const e = estado;
    // Tras el final (que puede llegar antes que el estado con la nueva fase) todo calla.
    const jugando = e?.fase === 'jugando' && !finalSonado;
    const tauFase = A.mezcla.tauFase;

    volMonstruo(jugando ? 1 : 0, tauFase);
    fijarModo(e ? modoDe(estadoMonstruo, jugando) : 'callado');

    // Faro del decibelímetro.
    if (jugando && e && !tiene(e, 'decibelimetro') && faroDec) {
      volFaroDec(1, tauFase);
      progFaroDec.arrancar(0.5);
    } else {
      volFaroDec(0, tauFase);
      progFaroDec.parar();
    }

    // Faro de la llave: solo audible a menos de CONFIG.audio.metrosTintineo (con borde suave).
    if (jugando && e && !tiene(e, 'llave') && faroLlave) {
      const d = distancia(faroLlave.pos, e.oido.pos);
      const m = CONFIG.audio.metrosTintineo;
      const audible = d <= m ? 1 : limitar(1 - (d - m) / A.faros.metrosDesvanecerLlave, 0, 1);
      volFaroLlave(Math.round(audible * 50) / 50, A.faros.tauAudible);
      if (audible > 0) progFaroLlave.arrancar(0.2);
      else progFaroLlave.parar();
    } else {
      volFaroLlave(0, tauFase);
      progFaroLlave.parar();
    }

    // Latido: desde que Oído tiene el decibelímetro.
    if (jugando && e && tiene(e, 'decibelimetro')) {
      volLatido(1, A.latido.tauEntrada);
      progLatido.arrancar(0.3);
    } else {
      volLatido(0, tauFase);
      progLatido.parar();
    }
  }

  // ───────────── Oclusión ─────────────
  function ocluida(pos: Punto, puertas: Record<string, boolean>): boolean {
    if (!estado) return false;
    return hayPared(mapa, puertas, pos, estado.oido.pos);
  }

  function actualizarOclusion(): void {
    if (!estado) return;
    for (const f of persistentes) f.fijarOclusion(ocluida(f.pos, estado.puertas));
    for (const f of temporales) f.fijarOclusion(ocluida(f.pos, estado.puertas));
  }

  /**
   * Crea una fuente temporal para un solo sonido. `abrirPuerta` = id de una puerta que se trata
   * como abierta para la oclusión (el sonido sale de la propia puerta).
   */
  function fuenteTemporal(pos: Punto, altura: number, abrirPuerta?: string): FuenteEspacial {
    const f = nuevaFuente(pos, altura, 1);
    if (estado) {
      const puertas = abrirPuerta ? { ...estado.puertas, [abrirPuerta]: true } : estado.puertas;
      f.fijarOclusion(ocluida(pos, puertas), true);
    }
    temporales.add(f);
    return f;
  }

  function soltarTemporal(f: FuenteEspacial): () => void {
    return () => {
      temporales.delete(f);
      f.destruir();
    };
  }

  // ───────────── Finales ─────────────
  function finalPerdieron(): void {
    if (finalSonado) return;
    finalSonado = true;
    radio.limpiar();
    fijarModo('callado');
    const ahora = ctx.currentTime;
    snd.estatica(s, mezcla.interno, ahora, A.final.segEstatica);
    snd.grito(s, mezcla.cabeza, ahora + A.final.segAntesGrito);
  }

  function finalGanaron(): void {
    if (finalSonado) return;
    finalSonado = true;
    radio.limpiar();
    const def = mapa.puertas.find((p) => p.esSalida);
    const pos = def ? centroDe(def.casilla) : (estado?.oido.pos ?? { x: 0, z: 0 });
    const f = nuevaFuente(pos, A.alturas.puerta, 1);
    f.fijarOclusion(false, true);
    temporales.add(f);
    snd.salida(s, f.entrada, ctx.currentTime, A.final.segAire, soltarTemporal(f));
  }

  // ───────────── Reinicio ─────────────
  function limpiar(): void {
    radio.limpiar();
    s.cortarTodo(A.mezcla.tauCorte);
    for (const p of programadores) p.parar();
    // Al cortar los disparos, las fuentes temporales se destruyen solas (alTerminar).
    estado = null;
    faseAnterior = 'inicio';
    finalSonado = false;
    estadoMonstruo = 'patrulla';
    ultimoDeLaFoto = null;
    agarrados.clear();
    pie = 1;
    actualizarBucles();
  }

  // ───────────── Bus ─────────────
  const quitar: (() => void)[] = [];
  const ahora = () => ctx.currentTime;

  quitar.push(
    bus.escuchar('sim/estado', (e) => {
      const primero = estado === null;
      estado = e;
      const previa = faseAnterior;
      faseAnterior = e.fase;
      // Nueva partida sin `juego/reiniciar` (por si la integración no lo manda).
      if ((previa === 'ganaron' || previa === 'perdieron') && (e.fase === 'inicio' || e.fase === 'jugando')) {
        finalSonado = false;
        agarrados.clear();
      }
      if ((e.fase === 'ganaron' || e.fase === 'perdieron') && previa !== e.fase) radio.limpiar();
      if (e.monstruo.estado !== ultimoDeLaFoto) {
        ultimoDeLaFoto = e.monstruo.estado;
        estadoMonstruo = e.monstruo.estado;
      }
      if (primero) {
        colocarOyente(e.oido.pos, orientacionOido(e), true);
        monstruo.colocar(e.monstruo.pos, true);
        segDesdeOclusion = Infinity;
      }
    }),

    bus.escuchar('sim/paso', (p) => {
      pie = -pie;
      snd.pisada(s, mezcla.cabeza, ahora(), p.superficie, p.corriendo, pie * A.pisadas.paneo);
    }),

    bus.escuchar('sim/choque', () => {
      snd.golpe(s, mezcla.cabeza, ahora());
    }),

    bus.escuchar('sim/puerta', (p) => {
      const def = mapa.puertas.find((q) => q.id === p.id);
      // La salida abierta la suena el final de "ganaron" (llave, cerrojo, puerta y aire).
      if (def?.esSalida && p.abierta) return;
      const f = fuenteTemporal(p.pos, A.alturas.puerta, p.id);
      const fin = soltarTemporal(f);
      if (p.portazo) snd.portazo(s, f.entrada, ahora(), fin);
      else if (p.abierta) snd.rechinido(s, f.entrada, ahora(), fin);
      else snd.cierre(s, f.entrada, ahora(), fin);
    }),

    bus.escuchar('sim/puertaBloqueada', (p) => {
      const f = fuenteTemporal(p.pos, A.alturas.puerta, p.id);
      snd.forcejeo(s, f.entrada, ahora(), soltarTemporal(f));
    }),

    bus.escuchar('sim/objeto', (o) => {
      const t = ahora();
      // El faro de ese objeto se apaga ya (no espera al siguiente estado).
      agarrados.add(o.id);
      apagarFaro(o.id);
      if (o.id === 'decibelimetro') snd.pitidoEncendido(s, mezcla.cabeza, t);
      else snd.llaveEnMano(s, mezcla.cabeza, t);
    }),

    bus.escuchar('sim/nadaQueAgarrar', () => {
      snd.roce(s, mezcla.cabeza, ahora());
    }),

    bus.escuchar('sim/monstruoPaso', (p) => {
      monstruo.colocar(p.pos);
      snd.pasoMonstruo(s, monstruo.entrada, ahora(), p.superficie, p.rapido);
    }),

    bus.escuchar('sim/monstruoEstado', (m) => {
      monstruo.colocar(m.pos);
      estadoMonstruo = m.estado;
      if (m.estado === 'atrapa') {
        finalPerdieron();
        return;
      }
      const jugando = (!estado || estado.fase === 'jugando') && !finalSonado;
      if (!jugando) return;
      // Cambia de modo ya (no espera a la siguiente foto) para que nada corte el alarido.
      fijarModo(modoDe(m.estado, true));
      if (m.estado === 'caza' && m.anterior !== 'caza') {
        seguir(snd.alarido(s, vozMonstruo, ahora()));
      }
    }),

    bus.escuchar('sim/fin', (f) => {
      if (f.resultado === 'ganaron') finalGanaron();
      else finalPerdieron();
    }),

    bus.escuchar('radio/mensaje', (m) => {
      if (estado && (estado.fase === 'ganaron' || estado.fase === 'perdieron')) return;
      radio.encolar({ texto: m.texto, emergencia: m.emergencia, radio: true });
    }),

    bus.escuchar('juego/reiniciar', () => limpiar()),
  );

  function apagarFaro(id: ObjetoId): void {
    const tau = A.mezcla.tauCorte;
    if (id === 'decibelimetro') {
      volFaroDec(0, tau);
      progFaroDec.parar();
    } else {
      volFaroLlave(0, tau);
      progFaroLlave.parar();
    }
  }

  return {
    actualizar(dtSeg: number) {
      if (destruido) return;
      if (estado) {
        colocarOyente(estado.oido.pos, orientacionOido(estado), false);
        monstruo.colocar(estado.monstruo.pos);
        const cuarto = mapa.cuartos.find((c) => c.id === estado!.oido.cuartoId);
        if (cuarto) mezcla.fijarReverb(cuarto.reverb);
        segDesdeOclusion += dtSeg;
        if (segDesdeOclusion >= A.oclusion.segEntreChequeos) {
          segDesdeOclusion = 0;
          actualizarOclusion();
        }
      }
      actualizarBucles();
      for (const p of programadores) p.tick();
    },

    destruir() {
      if (destruido) return;
      destruido = true;
      for (const q of quitar) q();
      for (const p of programadores) p.parar();
      radio.limpiar();
      mezcla.silenciar(true);
      s.cortarTodo(A.mezcla.tauCorte);
      vocesMonstruo.clear();
      // Se desconecta tras el fundido de salida para no dejar un clic.
      window.setTimeout(() => {
        radio.destruir();
        vozMonstruo.disconnect();
        busLatido.disconnect();
        for (const f of persistentes) f.destruir();
        for (const f of temporales) f.destruir();
        temporales.clear();
        mezcla.destruir();
      }, A.mezcla.tauCorte * 8 * 1000);
    },
  };
}
