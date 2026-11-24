/**
 * Cliente de Oído (docs/CONTRATOS.md §4): pantalla en primera persona en tinieblas y controles
 * (flechas o WASD, Shift y mouse). Solo manda órdenes `oido/*` y dibuja lo que anuncia la
 * simulación. Oído juega con los ojos vendados: esta mitad es para el público.
 *
 * Movimiento de tablero: cada pulsación es un paso de una casilla o un giro de 90° del cuerpo.
 * El mouse solo gira la cabeza (`estado.oido.cabeza`); la cámara mira a `rumbo + cabeza`.
 *
 * El monstruo NO se dibuja (en una sola PC, Vista ve esta mitad y se rompería el juego).
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import { construirMundo, copiarEstado, diferenciaRumbo, estadoInicial } from '../mundo3d';
import type { Bus, Mapa, Sistema } from '../shared/contratos';
import { AJUSTES_OIDO as A } from './ajustes';

const GRADOS = Math.PI / 180;

type Direccion = 'adelante' | 'atras';

export function crearClienteOido(bus: Bus, contenedor: HTMLElement, mapa: Mapa): Sistema {
  const T = CONFIG.teclas.oido;

  // ───────────────────────── Estado local (copia del último sim/estado) ─────────────────────────
  const estado = estadoInicial(mapa);
  /** true si llegó un sim/estado después de la última orden de mover. */
  let estadoDesdeOrden = true;
  let segDesdeOrden = 1;
  /** Giro de la cabeza del último sim/estado (se guarda aparte: `copiarEstado` no lo copia). */
  let cabeza = 0;
  /** true tras un `sim/choque`: la tecla sostenida deja de insistir contra la pared. */
  let topado = false;

  // ───────────────────────── Escena ─────────────────────────
  const mundo = construirMundo(mapa, { mostrarOido: false });
  const escena = mundo.escena;
  escena.background = new THREE.Color(0x000000);
  escena.fog = new THREE.FogExp2(0x000000, A.densidadNiebla);
  escena.add(new THREE.AmbientLight(A.colorLuz, A.luzAmbiente));

  const camara = new THREE.PerspectiveCamera(A.fov, 1, 0.05, 30);
  camara.rotation.order = 'YXZ';
  camara.position.set(estado.oido.pos.x, A.alturaOjos, estado.oido.pos.z);
  const luz = new THREE.PointLight(A.colorLuz, A.luzCercana, A.alcanceLuzCercana, 2);
  camara.add(luz);
  escena.add(camara);

  let rumboVista = estado.oido.rumbo;
  let inclinacion = 0;

  // ───────────────────────── Render a baja resolución ─────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(1);
  const lienzo = renderer.domElement;
  lienzo.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;display:block;image-rendering:pixelated;';
  contenedor.appendChild(lienzo);

  const aviso = document.createElement('div');
  aviso.style.cssText =
    'position:absolute;inset:0;display:none;align-items:center;justify-content:center;' +
    'text-align:center;padding:0 8%;font:inherit;font-size:clamp(18px,3.2vw,40px);letter-spacing:0.2em;' +
    'color:#c9d1c9;background:rgba(0,0,0,0.72);pointer-events:none;z-index:3;text-transform:uppercase;';
  contenedor.appendChild(aviso);

  const ajustarTamano = (): void => {
    const anchoCss = Math.max(1, contenedor.clientWidth);
    const altoCss = Math.max(1, contenedor.clientHeight);
    const h = CONFIG.render.altoInterno;
    const w = Math.max(1, Math.round((h * anchoCss) / altoCss));
    renderer.setSize(w, h, false);
    camara.aspect = anchoCss / altoCss;
    camara.updateProjectionMatrix();
  };
  ajustarTamano();
  const observador = new ResizeObserver(ajustarTamano);
  observador.observe(contenedor);

  // ───────────────────────── Fin de partida ─────────────────────────
  let avisoActual = '';
  const mostrarAviso = (texto: string): void => {
    if (texto === avisoActual) return;
    avisoActual = texto;
    aviso.textContent = texto;
    aviso.style.display = texto ? 'flex' : 'none';
  };
  const avisoSegunFase = (): void => {
    if (estado.fase === 'ganaron') mostrarAviso(A.textoGanaron);
    else if (estado.fase === 'perdieron') mostrarAviso(A.textoPerdieron);
    else mostrarAviso('');
  };

  // ───────────────────────── Bus ─────────────────────────
  const bajas: Array<() => void> = [
    bus.escuchar('sim/estado', (e) => {
      copiarEstado(estado, e);
      cabeza = Number.isFinite(e.oido.cabeza) ? e.oido.cabeza : 0;
      estado.oido.cabeza = cabeza;
      estadoDesdeOrden = true;
      avisoSegunFase();
    }),
    // Los hechos se aplican de una vez a la copia local; el siguiente sim/estado los confirma.
    bus.escuchar('sim/puerta', (p) => {
      estado.puertas[p.id] = p.abierta;
    }),
    bus.escuchar('sim/objeto', (o) => {
      estado.inventario[o.id] = true;
    }),
    bus.escuchar('sim/choque', () => {
      topado = true;
    }),
    bus.escuchar('sim/fin', (f) => {
      estado.fase = f.resultado;
      avisoSegunFase();
    }),
  ];

  // ───────────────────────── Teclado ─────────────────────────
  /** Teclas apretadas ahora mismo (valores de KeyboardEvent.code). */
  const pulsadas = new Set<string>();
  let ultima: Direccion = 'adelante';

  const esLetra = (code: string): boolean => code.startsWith('Key');
  /**
   * En una sola PC, con el radio de Vista abierto las letras (F B L R S D A…) son señas: el
   * cliente de Oído ignora W A S D y sigue aceptando las flechas y Shift.
   */
  const radioAbierto = (): boolean => document.body.dataset.radioAbierto === '1';
  const ignorada = (code: string): boolean => esLetra(code) && radioAbierto();
  const es = (teclas: readonly string[], code: string): boolean => teclas.includes(code);
  const sostenida = (teclas: readonly string[]): boolean => teclas.some((c) => pulsadas.has(c) && !ignorada(c));

  const ordenarMover = (dir: Direccion): void => {
    // Se marca ANTES de enviar: con el bus local la simulación puede contestar en la misma llamada.
    estadoDesdeOrden = false;
    segDesdeOrden = 0;
    bus.enviar('oido/mover', { dir, corriendo: sostenida(T.correr) });
  };

  const direccionSostenida = (): Direccion | null => {
    const adelante = sostenida(T.avanzar);
    const atras = sostenida(T.retroceder);
    if (adelante && atras) return ultima;
    if (adelante) return 'adelante';
    if (atras) return 'atras';
    return null;
  };

  const alBajarTecla = (e: KeyboardEvent): void => {
    // Nunca Ctrl (AGENTS.md §2.1); tampoco atajos con Alt o la tecla del sistema.
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const code = e.code;
    if (ignorada(code)) return;

    if (es(T.avanzar, code) || es(T.retroceder, code)) {
      e.preventDefault();
      if (e.repeat) return;
      pulsadas.add(code);
      ultima = es(T.avanzar, code) ? 'adelante' : 'atras';
      topado = false;
      ordenarMover(ultima);
    } else if (es(T.girarIzq, code) || es(T.girarDer, code)) {
      e.preventDefault();
      if (e.repeat) return;
      topado = false;
      bus.enviar('oido/girar', { sentido: es(T.girarIzq, code) ? 'izq' : 'der' });
    } else if (es(T.correr, code)) {
      pulsadas.add(code);
    }
  };

  // Soltar se atiende siempre (también con el radio abierto), para no dejar teclas «pegadas».
  const alSoltarTecla = (e: KeyboardEvent): void => {
    pulsadas.delete(e.code);
  };

  const soltarTodo = (): void => {
    pulsadas.clear();
  };

  window.addEventListener('keydown', alBajarTecla);
  window.addEventListener('keyup', alSoltarTecla);
  window.addEventListener('blur', soltarTodo);

  // ───────────────────────── Mouse ─────────────────────────
  let pixelesX = 0;
  let pixelesY = 0;

  // Con pointer lock los eventos llegan al contenedor aunque el cursor «salga»; sin él, solo
  // mientras el cursor está sobre la mitad de Oído. En ambos casos movementX trae el avance.
  const alMoverMouse = (e: MouseEvent): void => {
    pixelesX += e.movementX;
    pixelesY += e.movementY;
  };

  const alPresionarMouse = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    if (document.pointerLockElement !== contenedor) {
      try {
        const r: unknown = contenedor.requestPointerLock();
        if (r instanceof Promise) r.catch(() => undefined);
      } catch {
        // Sin pointer lock el mouse sigue funcionando sobre la mitad de Oído.
      }
    }
    bus.enviar('oido/interactuar', {});
  };

  contenedor.addEventListener('mousemove', alMoverMouse);
  contenedor.addEventListener('mousedown', alPresionarMouse);

  // ───────────────────────── Ciclo ─────────────────────────
  let primera = true;

  const actualizar = (dtSeg: number): void => {
    const dt = Math.min(Math.max(dtSeg, 0), 0.1);
    segDesdeOrden += dt;

    // Tecla sostenida = pasos seguidos: se reenvía cuando la simulación avisa que Oído ya no se
    // mueve. Si topó con una pared deja de insistir hasta que suelte la tecla o gire.
    const dir = direccionSostenida();
    if (!dir) topado = false;
    else if (!topado && estadoDesdeOrden && !estado.oido.moviendose && segDesdeOrden >= A.segMinEntreOrdenes) {
      ordenarMover(dir);
    }

    // Mouse horizontal → cabeza: un solo mensaje por cuadro con lo acumulado.
    if (pixelesX !== 0) {
      const px = Math.max(-A.maxPixelesPorCuadro, Math.min(A.maxPixelesPorCuadro, pixelesX));
      bus.enviar('oido/girarFino', { grados: px * CONFIG.movimiento.gradosPorPixelMouse });
      pixelesX = 0;
    }
    if (pixelesY !== 0) {
      const py = Math.max(-A.maxPixelesPorCuadro, Math.min(A.maxPixelesPorCuadro, pixelesY));
      inclinacion -= py * A.gradosPorPixelInclinacion;
      inclinacion = Math.max(-A.inclinacionMaxGrados, Math.min(A.inclinacionMaxGrados, inclinacion));
      pixelesY = 0;
    }

    // La cámara sigue al estado con suavizado (llega ~15 veces por segundo).
    const dx = estado.oido.pos.x - camara.position.x;
    const dz = estado.oido.pos.z - camara.position.z;
    if (primera || Math.hypot(dx, dz) > A.saltoMaximo) {
      camara.position.x = estado.oido.pos.x;
      camara.position.z = estado.oido.pos.z;
      rumboVista = estado.oido.rumbo + cabeza;
      primera = false;
    } else {
      const k = 1 - Math.exp(-A.seguimientoPos * dt);
      camara.position.x += dx * k;
      camara.position.z += dz * k;
      // La mirada apunta a rumbo + cabeza (el cuerpo solo cambia de 90° en 90°).
      const mirada = estado.oido.rumbo + cabeza;
      rumboVista += diferenciaRumbo(rumboVista, mirada) * (1 - Math.exp(-A.seguimientoRumbo * dt));
    }
    camara.rotation.y = -rumboVista * GRADOS;
    camara.rotation.x = inclinacion * GRADOS;

    mundo.actualizar(estado, dt);
    renderer.render(escena, camara);
  };

  const destruir = (): void => {
    for (const baja of bajas) baja();
    bajas.length = 0;
    observador.disconnect();
    window.removeEventListener('keydown', alBajarTecla);
    window.removeEventListener('keyup', alSoltarTecla);
    window.removeEventListener('blur', soltarTodo);
    contenedor.removeEventListener('mousemove', alMoverMouse);
    contenedor.removeEventListener('mousedown', alPresionarMouse);
    if (document.pointerLockElement === contenedor) document.exitPointerLock();
    mundo.destruir();
    renderer.dispose();
    lienzo.remove();
    aviso.remove();
  };

  return { actualizar, destruir };
}
