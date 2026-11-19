/**
 * La simulación: única dueña del estado del juego (docs/CONTRATOS.md §1, §3 y §5).
 * Recibe órdenes por el bus, avanza el mundo y anuncia hechos `sim/*`.
 * Lógica pura: sin DOM, sin Three.js y sin WebAudio; corre en Node para las pruebas.
 */
import { CONFIG, type Config } from '../config';
import type { Bus, EstadoJuego, Fase, Mapa, Mensajes, ObjetoId, TipoMensaje } from '../shared/contratos';
import { centroDe, cuartoEn, distancia, hayPared, puertasIniciales, type Puertas } from '../shared/mapaUtil';
import { AJUSTES_SIM, type AjustesSim } from './ajustes';
import { circuloTocaCasilla, objetoAlAlcance, puertaDeCamara, salidaAlAlcance } from './interaccion';
import { Monstruo } from './monstruo';
import { MovimientoOido } from './movimiento';
import { MedidorRuido } from './ruido';
import type { Emisor } from './tipos';

function inventarioVacio(): Record<ObjetoId, boolean> {
  return { decibelimetro: false, llave: false };
}

export class Simulacion {
  private readonly ajustes: AjustesSim = AJUSTES_SIM;
  private readonly bajas: Array<() => void> = [];
  private readonly emitir: Emisor;
  private readonly ruido: MedidorRuido;

  private fase: Fase = 'inicio';
  private t = 0;
  private oido: MovimientoOido;
  private monstruo: Monstruo;
  private puertas: Puertas;
  private inventario = inventarioVacio();
  private camaraActiva: number = AJUSTES_SIM.camaraInicial;
  /** Segundos acumulados desde el último `sim/estado`. */
  private segDesdeEstado = 0;
  private destruida = false;

  constructor(
    private readonly bus: Bus,
    private readonly mapa: Mapa,
    private readonly config: Config = CONFIG,
  ) {
    this.emitir = (tipo, datos) => {
      if (!this.destruida) this.bus.enviar(tipo, datos);
    };
    this.ruido = new MedidorRuido(config.ruido);
    this.oido = this.crearOido();
    this.monstruo = this.crearMonstruo();
    this.puertas = puertasIniciales(mapa);

    this.oir('juego/iniciar', () => this.iniciar());
    this.oir('juego/reiniciar', () => this.reiniciar());
    this.oir('ruido/microfono', (m) => this.ruido.fijarMicrofono(m.nivel));
    this.oir('vista/camara', (m) => this.cambiarCamara(m.numero));
    this.oir('vista/puerta', () => this.alternarPuerta());
    this.oir('oido/mover', (m) => {
      if (this.jugando) this.oido.mover(m.dir, m.corriendo, this.puertas);
    });
    this.oir('oido/girar', (m) => {
      if (this.jugando) this.oido.girar(m.sentido);
    });
    this.oir('oido/girarFino', (m) => {
      if (this.jugando) this.oido.girarFino(m.grados);
    });
    this.oir('oido/interactuar', () => this.interactuar());
  }

  /** Foto del estado actual (una copia nueva en cada lectura: JSON plano, solo lectura). */
  get estado(): EstadoJuego {
    return {
      t: this.t,
      fase: this.fase,
      oido: {
        pos: { ...this.oido.pos },
        rumbo: this.oido.rumbo,
        cuartoId: cuartoEn(this.mapa, this.oido.pos).id,
        corriendo: this.oido.corriendo,
        moviendose: this.oido.moviendose,
      },
      monstruo: {
        pos: { ...this.monstruo.pos },
        rumbo: this.monstruo.rumbo,
        cuartoId: cuartoEn(this.mapa, this.monstruo.pos).id,
        estado: this.monstruo.estado,
      },
      puertas: { ...this.puertas },
      inventario: { ...this.inventario },
      ruido: { nivel: this.ruido.nivel, zona: this.ruido.zona },
      camaraActiva: this.camaraActiva,
    };
  }

  /** Avanza la simulación `dtSeg` segundos reales. Los cuadros largos se parten en trozos cortos. */
  actualizar(dtSeg: number): void {
    if (this.destruida || !Number.isFinite(dtSeg) || dtSeg <= 0) return;

    let resto = dtSeg;
    while (resto > 0) {
      const dt = Math.min(resto, this.ajustes.dtMaxSeg);
      resto -= dt;
      this.avanzar(dt);
    }

    // `sim/estado` unas `estadoHz` veces por segundo, en cualquier fase (los clientes dibujan con él).
    const periodo = 1 / this.ajustes.estadoHz;
    this.segDesdeEstado += dtSeg;
    if (this.segDesdeEstado >= periodo) {
      this.segDesdeEstado %= periodo;
      this.emitirEstado();
    }
  }

  destruir(): void {
    this.destruida = true;
    for (const baja of this.bajas) baja();
    this.bajas.length = 0;
  }

  // ───────────────────────── Partida ─────────────────────────

  private get jugando(): boolean {
    return this.fase === 'jugando';
  }

  private iniciar(): void {
    if (this.fase !== 'inicio') return;
    this.cambiarFase('jugando');
  }

  /** Restablece todo (mundo, inventario, puertas, ruido, cámara) y empieza a jugar. */
  private reiniciar(): void {
    this.t = 0;
    this.ruido.reiniciar();
    this.oido = this.crearOido();
    this.monstruo = this.crearMonstruo();
    this.puertas = puertasIniciales(this.mapa);
    this.inventario = inventarioVacio();
    this.camaraActiva = this.ajustes.camaraInicial;
    this.fase = 'jugando';
    this.emitirEstadoYa();
  }

  private cambiarFase(fase: Fase): void {
    if (fase === this.fase) return;
    this.fase = fase;
    this.emitirEstadoYa();
    if (fase === 'ganaron' || fase === 'perdieron') this.emitir('sim/fin', { resultado: fase });
  }

  private avanzar(dt: number): void {
    // El ruido se mide siempre (la barra de Vista funciona también antes de empezar).
    if (!this.jugando) {
      this.ruido.actualizar(dt);
      return;
    }
    this.t += dt;
    this.oido.actualizar(dt);
    this.ruido.actualizar(dt);
    // Aunque Oído no haya encontrado el decibelímetro, el ruido cuenta: el monstruo oye igual.
    this.monstruo.actualizar(dt, this.ruido.zona, this.oido.pos, this.puertas);
    this.revisarAtrapa();
  }

  /**
   * En CUALQUIER estado (también en patrulla y en escucha), si el monstruo queda a
   * `distanciaAtrapa` o menos de Oído y no hay pared ni puerta cerrada entre los dos, lo atrapa.
   * Decisión de diseño: en patrulla también atrapa por contacto. El monstruo no "ve", pero si
   * tropieza con Oído lo agarra; por eso no basta con callarse: hay que quedarse quieto FUERA
   * de su ruta, y Vista (que sabe por dónde pasa) tiene que advertirlo o encerrarlo.
   */
  private revisarAtrapa(): void {
    const m = this.monstruo.pos;
    const o = this.oido.pos;
    if (distancia(m, o) > this.config.monstruo.distanciaAtrapa) return;
    if (hayPared(this.mapa, this.puertas, m, o)) return;
    this.monstruo.atrapar();
    this.cambiarFase('perdieron');
  }

  // ───────────────────────── Órdenes de Oído ─────────────────────────

  /**
   * Prioridad: 1) objeto sin agarrar al alcance; 2) la puerta de salida si está cerca;
   * 3) nada. El contrato dice "al frente", pero solo se exige distancia: Oído juega a ciegas.
   */
  private interactuar(): void {
    if (!this.jugando) return;
    const pos = this.oido.pos;

    const objeto = objetoAlAlcance(this.mapa, this.puertas, this.inventario, pos, this.ajustes.alcanceInteraccion);
    if (objeto) {
      this.inventario[objeto.id] = true;
      this.emitir('sim/objeto', { id: objeto.id, pos: { ...objeto.pos } });
      return;
    }

    const salida = salidaAlAlcance(this.mapa, this.puertas, pos, this.ajustes.alcanceSalida);
    if (salida) {
      const centro = centroDe(salida.casilla);
      if (!this.inventario.llave) {
        this.emitir('sim/puertaBloqueada', { id: salida.id, pos: centro });
        return;
      }
      this.puertas[salida.id] = true;
      this.emitir('sim/puerta', { id: salida.id, abierta: true, pos: centro, portazo: false });
      this.cambiarFase('ganaron');
      return;
    }

    this.emitir('sim/nadaQueAgarrar', {});
  }

  // ───────────────────────── Órdenes de Vista ─────────────────────────

  /** Solo se aceptan los números de cámara que existen en el mapa. Vale en cualquier fase. */
  private cambiarCamara(numero: number): void {
    if (!this.mapa.camaras.some((c) => c.numero === numero)) return;
    this.camaraActiva = numero;
  }

  /**
   * Abre o cierra la puerta de la cámara activa. Cerrar es un portazo (ruido); abrir no.
   * No se puede cerrar con Oído o el monstruo en la casilla de la puerta (o entrando a ella):
   * la orden se ignora sin anunciar nada.
   */
  private alternarPuerta(): void {
    if (!this.jugando) return;
    const puerta = puertaDeCamara(this.mapa, this.camaraActiva);
    if (!puerta) return;
    const centro = centroDe(puerta.casilla);

    if (!this.puertas[puerta.id]) {
      this.puertas[puerta.id] = true;
      this.emitir('sim/puerta', { id: puerta.id, abierta: true, pos: centro, portazo: false });
      return;
    }

    const radio = this.ajustes.radioOido;
    const destino = this.oido.destino;
    const oidoEnMedio =
      circuloTocaCasilla(this.oido.pos, radio, puerta.casilla) ||
      (destino !== null && circuloTocaCasilla(destino, radio, puerta.casilla));
    if (oidoEnMedio || this.monstruo.ocupa(puerta.casilla)) return;

    this.puertas[puerta.id] = false;
    this.ruido.sumar(this.config.ruido.porPortazo);
    this.emitir('sim/puerta', { id: puerta.id, abierta: false, pos: centro, portazo: true });
  }

  // ───────────────────────── Utilidades ─────────────────────────

  private crearOido(): MovimientoOido {
    return new MovimientoOido(this.mapa, this.config, this.ajustes, this.ruido, this.emitir);
  }

  private crearMonstruo(): Monstruo {
    return new Monstruo(this.mapa, this.config.monstruo, this.ajustes, this.emitir);
  }

  private oir<T extends TipoMensaje>(tipo: T, fn: (datos: Mensajes[T]) => void): void {
    this.bajas.push(this.bus.escuchar(tipo, fn));
  }

  private emitirEstado(): void {
    this.emitir('sim/estado', this.estado);
  }

  /** Estado inmediato (cambio de fase) y reinicio del acumulador para no duplicarlo enseguida. */
  private emitirEstadoYa(): void {
    this.segDesdeEstado = 0;
    this.emitirEstado();
  }
}
