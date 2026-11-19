/**
 * Cliente de Oído (docs/CONTRATOS.md §4): pantalla en primera persona en tinieblas y controles
 * (flechas, Shift derecho y mouse). Solo manda órdenes `oido/*` y dibuja lo que anuncia la
 * simulación. Oído juega con los ojos vendados: esta mitad es para el público.
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
    bus.escuchar('sim/fin', (f) => {
      estado.fase = f.resultado;
      avisoSegunFase();
    }),
  ];

  // ───────────────────────── Teclado ─────────────────────────
  let adelante = false;
  let atras = false;
  let ultima: Direccion = 'adelante';
  let corriendo = false;

  const ordenarMover = (dir: Direccion): void => {
    // Se marca ANTES de enviar: con el bus local la simulación puede contestar en la misma llamada.
    estadoDesdeOrden = false;
    segDesdeOrden = 0;
    bus.enviar('oido/mover', { dir, corriendo });
  };

  const direccionSostenida = (): Direccion | null => {
    if (adelante && atras) return ultima;
    if (adelante) return 'adelante';
    if (atras) return 'atras';
    return null;
  };

  const alBajarTecla = (e: KeyboardEvent): void => {
    // Nunca Ctrl (AGENTS.md §2.1); tampoco atajos con Alt o la tecla del sistema.
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    switch (e.code) {
      case T.avanzar:
        e.preventDefault();
        if (!e.repeat) {
          adelante = true;
          ultima = 'adelante';
          ordenarMover('adelante');
        }
        break;
      case T.retroceder:
        e.preventDefault();
        if (!e.repeat) {
          atras = true;
          ultima = 'atras';
          ordenarMover('atras');
        }
        break;
      case T.girarIzq:
        e.preventDefault();
        if (!e.repeat) bus.enviar('oido/girar', { sentido: 'izq' });
        break;
      case T.girarDer:
        e.preventDefault();
        if (!e.repeat) bus.enviar('oido/girar', { sentido: 'der' });
        break;
      case T.correr:
        corriendo = true;
        break;
      default:
        break;
    }
  };

  const alSoltarTecla = (e: KeyboardEvent): void => {
    switch (e.code) {
      case T.avanzar:
        adelante = false;
        break;
      case T.retroceder:
        atras = false;
        break;
      case T.correr:
        corriendo = false;
        break;
      default:
        break;
    }
  };

  const soltarTodo = (): void => {
    adelante = false;
    atras = false;
    corriendo = false;
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

    // Tecla sostenida: se reenvía cuando la simulación avisa que Oído ya no se mueve.
    const dir = direccionSostenida();
    if (dir && estadoDesdeOrden && !estado.oido.moviendose && segDesdeOrden >= A.segMinEntreOrdenes) {
      ordenarMover(dir);
    }

    // Giro fino: un solo mensaje por cuadro con lo acumulado.
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
      rumboVista = estado.oido.rumbo;
      primera = false;
    } else {
      const k = 1 - Math.exp(-A.seguimientoPos * dt);
      camara.position.x += dx * k;
      camara.position.z += dz * k;
      rumboVista += diferenciaRumbo(rumboVista, estado.oido.rumbo) * (1 - Math.exp(-A.seguimientoRumbo * dt));
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
