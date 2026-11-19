/**
 * Piezas básicas de la síntesis: buffers de ruido generados por código, respuestas al impulso
 * para la reverberación y `Disparo`, un sonido corto que se limpia solo al terminar.
 *
 * Regla para no tener clics: toda ganancia empieza en 0 y se mueve con rampas;
 * toda fuente se detiene cuando su envolvente ya llegó a ~−80 dB.
 */

export type TipoRuido = 'blanco' | 'rosa' | 'cafe';

/** Ruido blanco en mono. */
function bufferBlanco(ctx: BaseAudioContext, seg: number): AudioBuffer {
  const n = Math.max(1, Math.floor(ctx.sampleRate * seg));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** Ruido rosa (filtro de Paul Kellet), normalizado a pico ~0.9. */
function bufferRosa(ctx: BaseAudioContext, seg: number): AudioBuffer {
  const n = Math.max(1, Math.floor(ctx.sampleRate * seg));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let pico = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    const v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
    d[i] = v;
    pico = Math.max(pico, Math.abs(v));
  }
  const k = pico > 0 ? 0.9 / pico : 1;
  for (let i = 0; i < n; i++) d[i] = d[i]! * k;
  return buf;
}

/** Ruido café (integración del blanco con fuga): retumbos, viento, respiración grave. */
function bufferCafe(ctx: BaseAudioContext, seg: number): AudioBuffer {
  const n = Math.max(1, Math.floor(ctx.sampleRate * seg));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let ultimo = 0;
  let pico = 0;
  for (let i = 0; i < n; i++) {
    ultimo = (ultimo + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = ultimo;
    pico = Math.max(pico, Math.abs(ultimo));
  }
  const k = pico > 0 ? 0.9 / pico : 1;
  for (let i = 0; i < n; i++) d[i] = d[i]! * k;
  return buf;
}

export interface OpcionesImpulso {
  /** Tiempo de caída a −60 dB. */
  seg: number;
  predelay: number;
  /** 0–1: qué tan aguda es la cola al principio (se oscurece con el tiempo). */
  brillo: number;
  /** Reflexiones tempranas (segundos), cada una más débil. */
  ecos: readonly number[];
}

/**
 * Respuesta al impulso estéreo: ruido con decaimiento exponencial que se oscurece con el tiempo
 * (las paredes absorben los agudos), con un pequeño retraso inicial y algunas reflexiones tempranas.
 */
export function generarImpulso(ctx: BaseAudioContext, op: OpcionesImpulso): AudioBuffer {
  const sr = ctx.sampleRate;
  const largo = Math.max(1, Math.floor(sr * (op.predelay + op.seg)));
  const buf = ctx.createBuffer(2, largo, sr);
  const inicio = Math.floor(op.predelay * sr);
  const fundidoEntrada = Math.max(1, Math.floor(0.002 * sr));
  for (let canal = 0; canal < 2; canal++) {
    const d = buf.getChannelData(canal);
    let y = 0;
    for (let i = inicio; i < largo; i++) {
      const t = (i - inicio) / sr;
      // −60 dB en op.seg: e^(−6.9·t/seg).
      const env = Math.exp((-6.9 * t) / op.seg);
      // Pasa-bajas de un polo cuyo coeficiente baja con el tiempo: la cola se oscurece.
      const a = Math.min(1, Math.max(0.02, op.brillo * Math.exp((-3 * t) / op.seg)));
      y += a * (Math.random() * 2 - 1 - y);
      const entrada = Math.min(1, (i - inicio) / fundidoEntrada);
      d[i] = y * env * entrada;
    }
    // Reflexiones tempranas, un poco distintas por canal para dar amplitud.
    op.ecos.forEach((e, k) => {
      const pos = inicio + Math.floor((e + canal * 0.0007 * (k + 1)) * sr);
      if (pos < largo) d[pos] = d[pos]! + 0.5 / (k + 1);
    });
  }
  return buf;
}

/**
 * Un sonido corto. Crea sus nodos, los conecta a `salida` (ganancia propia) y, cuando todas
 * sus fuentes terminaron, se desconecta solo y avisa con `alTerminar`.
 */
export class Disparo {
  readonly salida: GainNode;
  private readonly nodos: AudioNode[] = [];
  private readonly fuentes: AudioScheduledSourceNode[] = [];
  private pendientes = 0;
  private terminado = false;

  constructor(
    private readonly s: Sintesis,
    destino: AudioNode,
    volumen: number,
    private readonly alTerminar?: () => void,
  ) {
    this.salida = s.ctx.createGain();
    this.salida.gain.value = volumen;
    this.salida.connect(destino);
  }

  get ctx(): AudioContext {
    return this.s.ctx;
  }

  /** Ganancia intermedia (empieza en `valor`; para envolventes usa 0). */
  ganancia(valor = 0): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = valor;
    this.nodos.push(g);
    return g;
  }

  filtro(tipo: BiquadFilterType, frecuencia: number, q = 1): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = tipo;
    f.frequency.value = frecuencia;
    f.Q.value = q;
    this.nodos.push(f);
    return f;
  }

  paneo(valor: number): StereoPannerNode {
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, valor));
    this.nodos.push(p);
    return p;
  }

  /** Distorsión suave (tanh) para gruñidos y gritos. */
  saturador(cantidad: number): WaveShaperNode {
    const w = this.ctx.createWaveShaper();
    const n = 1024;
    const curva = new Float32Array(n);
    const k = Math.max(0.001, cantidad);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curva[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    w.curve = curva;
    w.oversample = '2x';
    this.nodos.push(w);
    return w;
  }

  /** Ruido de `t` a `t + dur` (con desfase aleatorio en el buffer para que nunca suene igual). */
  ruido(tipo: TipoRuido, t: number, dur: number): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    const buf = this.s.buffer(tipo);
    src.buffer = buf;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = buf.duration;
    src.start(t, Math.random() * buf.duration * 0.9);
    src.stop(t + dur);
    this.registrar(src);
    return src;
  }

  osc(tipo: OscillatorType, frecuencia: number, t: number, dur: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = tipo;
    o.frequency.value = frecuencia;
    o.start(t);
    o.stop(t + dur);
    this.registrar(o);
    return o;
  }

  /**
   * Envolvente de percusión: 0 → pico en `ataque` → caída exponencial natural.
   * `caida` es el tiempo perceptible (~−30 dB); el sonido sigue hasta ~−60 dB (2·caida)
   * y ahí se pone en 0 (un escalón de −60 dB no se oye). Devuelve el fin.
   */
  golpe(param: AudioParam, t: number, ataque: number, pico: number, caida: number): number {
    const tPico = t + Math.max(0.001, ataque);
    const fin = tPico + caida * 2;
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(pico, tPico);
    param.setTargetAtTime(0, tPico, caida / 3.5);
    param.setValueAtTime(0, fin);
    return fin;
  }

  /** Envolvente de sostenido: sube en `ataque`, se queda, y baja en `liberacion`. Devuelve el fin. */
  sostenido(param: AudioParam, t: number, ataque: number, nivel: number, sostener: number, liberacion: number): number {
    const fin = t + ataque + sostener + liberacion;
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(nivel, t + Math.max(0.001, ataque));
    param.setValueAtTime(nivel, t + ataque + sostener);
    param.linearRampToValueAtTime(0, fin);
    return fin;
  }

  /** Corta el sonido con un fundido muy corto (sin clic). */
  cortar(tau: number): void {
    if (this.terminado) return;
    const ahora = this.ctx.currentTime;
    const g = this.salida.gain;
    g.cancelScheduledValues(ahora);
    g.setValueAtTime(g.value, ahora);
    g.setTargetAtTime(0, ahora, tau);
    for (const f of this.fuentes) {
      try {
        f.stop(ahora + tau * 6);
      } catch {
        // Ya terminó o nunca arrancó: nada que hacer.
      }
    }
  }

  private registrar(f: AudioScheduledSourceNode): void {
    this.nodos.push(f);
    this.fuentes.push(f);
    this.pendientes++;
    f.onended = () => {
      this.pendientes--;
      if (this.pendientes <= 0) this.terminar();
    };
  }

  private terminar(): void {
    if (this.terminado) return;
    this.terminado = true;
    for (const n of this.nodos) n.disconnect();
    this.salida.disconnect();
    this.s.olvidar(this);
    this.alTerminar?.();
  }
}

/** Contexto de síntesis: buffers compartidos y registro de los sonidos que están sonando. */
export class Sintesis {
  private readonly buffers: Record<TipoRuido, AudioBuffer>;
  private readonly activos = new Set<Disparo>();

  constructor(readonly ctx: AudioContext) {
    this.buffers = {
      blanco: bufferBlanco(ctx, 2),
      rosa: bufferRosa(ctx, 3),
      cafe: bufferCafe(ctx, 3),
    };
  }

  buffer(tipo: TipoRuido): AudioBuffer {
    return this.buffers[tipo];
  }

  /** Crea un sonido corto que va a `destino`. Hay que agregarle al menos una fuente. */
  disparo(destino: AudioNode, volumen: number, alTerminar?: () => void): Disparo {
    const d = new Disparo(this, destino, volumen, alTerminar);
    this.activos.add(d);
    return d;
  }

  olvidar(d: Disparo): void {
    this.activos.delete(d);
  }

  /** Corta todo lo que esté sonando (reinicio o destrucción). */
  cortarTodo(tau: number): void {
    for (const d of [...this.activos]) d.cortar(tau);
  }
}

/** Número aleatorio en [a, b). */
export function azar(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

/** Multiplica por un factor aleatorio en [1 − v, 1 + v]. */
export function variar(valor: number, v: number): number {
  return valor * azar(1 - v, 1 + v);
}

export function limitar(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
