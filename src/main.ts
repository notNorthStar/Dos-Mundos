/**
 * Integración: crea el bus, la simulación y los clientes, y los hace avanzar una vez por cuadro.
 * Los módulos no se conocen entre sí; solo comparten el bus (docs/CONTRATOS.md).
 *
 * Tres modos (docs/CONTRATOS.md §7):
 *  - `solo`: una PC, pantalla y teclado divididos, bus en memoria.
 *  - `oido`: dos PC. Esta corre la simulación, el audio y el micrófono.
 *  - `vista`: dos PC. Esta muestra las cámaras y arma los mensajes del radio con la cámara.
 */
import { crearAudio } from './audio';
import { BusLocal } from './bus/BusLocal';
import { BusRed, enchufeWeb, urlRelevo } from './bus/BusRed';
import { CONFIG } from './config';
import { ALA_ESTE } from './data/alaEste';
import { LsmEngine } from './lsm';
import muestras from './lsm/data/samples.json';
import { crearClienteOido } from './oido';
import { crearPanelRadio } from './radio';
import { crearVozSintetica, hayVozParaElRadio } from './radio/voz';
import { crearMicrofono, type Microfono } from './ruido/microfono';
import type { Bus, Fase, Sistema } from './shared/contratos';
import { RUTA_RELEVO } from './shared/red';
import { Simulacion } from './sim/Simulacion';
import { crearClienteVista } from './vista';

type Modo = 'solo' | 'oido' | 'vista';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Falta #${id} en index.html`);
  return el as T;
};

const inicio = $('inicio');
const aviso = $('aviso');
const fin = $('fin');

/** Dos avisos independientes: el de dispositivos (pasajero) y el de la conexión (mientras dure). */
const avisos = { dispositivos: '', red: '', voz: '' };
function pintarAvisos(): void {
  const texto = [avisos.red, avisos.dispositivos, avisos.voz].filter(Boolean).join(' · ');
  aviso.textContent = texto;
  aviso.hidden = texto === '';
}
function avisar(cual: keyof typeof avisos, texto: string): void {
  avisos[cual] = texto;
  pintarAvisos();
}

function bloquearTeclasDelNavegador(): void {
  // Nunca Ctrl en los controles (AGENTS.md §2.1). Tab y Alt se bloquean para que no saquen el foco.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.key === 'Alt') e.preventDefault();
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
}

const radioAbierto = (): boolean => document.body.dataset.radioAbierto === '1';

/** N y M: ruido simulado, el respaldo cuando no hay micrófono (AGENTS.md §5). */
function conectarRuidoSimulado(microfono: Microfono): void {
  const { ruidoCuidado, ruidoPeligro } = CONFIG.teclas.general;
  const simulando = new Set<string>();
  const aplicar = (): void => {
    microfono.nivelSimulado = simulando.has(ruidoPeligro)
      ? CONFIG.ruido.simuladoPeligro
      : simulando.has(ruidoCuidado)
        ? CONFIG.ruido.simuladoCuidado
        : 0;
  };
  window.addEventListener('keydown', (e) => {
    if ((e.code === ruidoCuidado || e.code === ruidoPeligro) && !radioAbierto()) {
      simulando.add(e.code);
      aplicar();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (simulando.delete(e.code)) aplicar();
  });
  window.addEventListener('blur', () => {
    simulando.clear();
    aplicar();
  });
}

async function arrancar(modo: Modo, conDispositivos: boolean): Promise<void> {
  inicio.remove();
  document.body.dataset.modo = modo;
  bloquearTeclasDelNavegador();

  const mapa = ALA_ESTE;
  const red =
    modo === 'solo'
      ? null
      : new BusRed({ rol: modo, crearEnchufe: () => enchufeWeb(urlRelevo(location, RUTA_RELEVO)) });
  const bus: Bus = red ?? new BusLocal();

  const juegaOido = modo !== 'vista';
  const juegaVista = modo !== 'oido';
  const sistemas: Sistema[] = [];
  let microfono: Microfono | null = null;
  let lsm: LsmEngine | null = null;

  if (juegaOido) {
    const ctx = new AudioContext();
    void ctx.resume();
    // La simulación va primero: los clientes dibujan y suenan lo que ella anuncia.
    sistemas.push(new Simulacion(bus, mapa));
    microfono = crearMicrofono(bus, ctx);
    sistemas.push(microfono, crearClienteOido(bus, $('oido'), mapa));
    // El audio va en la PC de Oído: Vista no oye el juego (DISENO.md §2).
    sistemas.push(crearAudio(bus, mapa, ctx, crearVozSintetica()));
    conectarRuidoSimulado(microfono);
    void hayVozParaElRadio().then((hay) => {
      if (hay) return;
      // Se queda fijo: sin voz en español el radio no se entiende y hay que arreglarlo en Windows.
      avisar('voz', 'Esta PC no tiene voz en español: el radio sonará con acento inglés. Instálala en Configuración de Windows → Hora e idioma → Voz → Agregar voces → Español (México), y reinicia Chrome.');
    });
  }
  if (juegaVista) {
    const vista = crearClienteVista(bus, $('vista'), mapa);
    // Sin cámara se juega igual: el panel del radio acepta el teclado (AGENTS.md §5).
    lsm = conDispositivos ? new LsmEngine({ samples: muestras.samples }) : null;
    sistemas.push(vista, crearPanelRadio(bus, vista.panelRadio, lsm));
  }

  let fase: Fase = 'inicio';
  bus.escuchar('sim/estado', (e) => {
    if (e.fase === fase) return;
    fase = e.fase;
    fin.hidden = fase !== 'ganaron' && fase !== 'perdieron';
  });

  const reiniciar = (): void => {
    if (fase === 'ganaron' || fase === 'perdieron') bus.enviar('juego/reiniciar', {});
  };
  $('btn-reiniciar').addEventListener('click', reiniciar);
  window.addEventListener('keydown', (e) => {
    if (e.code !== CONFIG.teclas.general.reiniciar) return;
    e.preventDefault();
    reiniciar();
  });

  let antes = performance.now();
  const ciclo = (ahora: number): void => {
    // Tope de 0.1 s: al volver de otra pestaña no debe dar un salto enorme.
    const dt = Math.min(0.1, (ahora - antes) / 1000);
    antes = ahora;
    for (const s of sistemas) s.actualizar(dt);
    requestAnimationFrame(ciclo);
  };
  requestAnimationFrame(ciclo);

  if (conDispositivos) {
    avisar('dispositivos', juegaOido && juegaVista ? 'Preparando la cámara y el micrófono…' : juegaOido ? 'Preparando el micrófono…' : 'Preparando la cámara…');
    const [hayCamara, hayMicrofono] = await Promise.all([
      lsm ? lsm.enableCamera() : Promise.resolve(false),
      microfono ? microfono.iniciar() : Promise.resolve(false),
    ]);
    if (microfono && hayMicrofono) {
      avisar('dispositivos', `Calibrando el ruido del cuarto: ${CONFIG.ruido.segCalibracion} segundos de silencio, por favor.`);
      await microfono.calibrar();
    }
    const faltan = [
      juegaVista && !hayCamara ? 'Sin cámara: las señas se teclean (Tab abre el radio).' : '',
      juegaOido && !hayMicrofono ? 'Sin micrófono: el ruido solo viene del juego.' : '',
    ].filter(Boolean);
    avisar('dispositivos', faltan.join(' '));
    if (faltan.length > 0) window.setTimeout(() => avisar('dispositivos', ''), CONFIG.interfaz.msAviso);
  }

  if (!red) {
    bus.enviar('juego/iniciar', {});
    return;
  }

  // Dos PC: la partida empieza cuando están las dos. Si una se cae, se avisa y se sigue esperando.
  const otra = modo === 'oido' ? 'Vista' : 'Oído';
  red.alCambiar(({ conectado, otroPresente }) => {
    avisar('red', !conectado ? 'Sin conexión con el servidor del juego. Reintentando…' : !otroPresente ? `Esperando a la PC de ${otra}…` : '');
    // Solo la PC de Oído (la que simula) da la salida; la simulación ignora un segundo «iniciar».
    if (modo === 'oido' && conectado && otroPresente) bus.enviar('juego/iniciar', {});
  });
}

// ───────────────────────── Pantalla de inicio ─────────────────────────
const NOTAS: Record<Modo, string> = {
  solo: 'Las dos personas en esta PC: Oído a la izquierda, Vista a la derecha.',
  oido: 'Esta PC es la de Oído: audífonos, micrófono, flechas y mouse. Aquí corre el juego.',
  vista: 'Esta PC es la de Vista: cámaras, puertas y señas frente a la cámara. Sin audífonos.',
};
const pedido = new URLSearchParams(location.search).get('rol');
let modo: Modo = pedido === 'oido' || pedido === 'vista' ? pedido : 'solo';

const botonesModo = [...document.querySelectorAll<HTMLButtonElement>('#modos button')];
function elegirModo(nuevo: Modo): void {
  modo = nuevo;
  for (const b of botonesModo) b.setAttribute('aria-pressed', String(b.dataset.modo === nuevo));
  $('nota-modo').textContent = NOTAS[nuevo];
}
for (const b of botonesModo) b.addEventListener('click', () => elegirModo(b.dataset.modo as Modo));
elegirModo(modo);

$('btn-inicio').addEventListener('click', () => void arrancar(modo, true));
$('btn-teclado').addEventListener('click', () => void arrancar(modo, false));
