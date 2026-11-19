/**
 * Integración: crea el bus, la simulación y los clientes, y los hace avanzar una vez por cuadro.
 * Los módulos no se conocen entre sí; solo comparten el bus (docs/CONTRATOS.md).
 */
import { crearAudio } from './audio';
import { BusLocal } from './bus/BusLocal';
import { CONFIG } from './config';
import { ALA_ESTE } from './data/alaEste';
import { LsmEngine } from './lsm';
import muestras from './lsm/data/samples.json';
import { crearClienteOido } from './oido';
import { crearPanelRadio } from './radio';
import { crearVozSintetica } from './radio/voz';
import { crearMicrofono } from './ruido/microfono';
import type { Fase, Sistema } from './shared/contratos';
import { Simulacion } from './sim/Simulacion';
import { crearClienteVista } from './vista';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Falta #${id} en index.html`);
  return el as T;
};

const inicio = $('inicio');
const aviso = $('aviso');
const fin = $('fin');

function mostrarAviso(texto: string): void {
  aviso.textContent = texto;
  aviso.hidden = texto === '';
}

function bloquearTeclasDelNavegador(): void {
  // Nunca Ctrl en los controles (AGENTS.md §2.1). Tab y Alt se bloquean para que no saquen el foco.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.key === 'Alt') e.preventDefault();
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
}

const radioAbierto = (): boolean => document.body.dataset.radioAbierto === '1';

async function arrancar(conDispositivos: boolean): Promise<void> {
  inicio.remove();
  bloquearTeclasDelNavegador();

  const mapa = ALA_ESTE;
  const bus = new BusLocal();
  const ctx = new AudioContext();
  void ctx.resume();

  const sim = new Simulacion(bus, mapa);
  const oido = crearClienteOido(bus, $('oido'), mapa);
  const vista = crearClienteVista(bus, $('vista'), mapa);
  const voz = crearVozSintetica();
  const audio = crearAudio(bus, mapa, ctx, voz);
  const microfono = crearMicrofono(bus, ctx);

  // Sin cámara se juega igual: el panel del radio acepta el teclado (AGENTS.md §5).
  const lsm = conDispositivos ? new LsmEngine({ samples: muestras.samples }) : null;
  const radio = crearPanelRadio(bus, vista.panelRadio, lsm);

  // La simulación va primero: los clientes dibujan y suenan lo que ella anuncia.
  const sistemas: Sistema[] = [sim, microfono, oido, vista, radio, audio];

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

  // Teclas de la integración: reinicio y ruido simulado (respaldo sin micrófono).
  const { reiniciar: teclaReiniciar, ruidoCuidado, ruidoPeligro } = CONFIG.teclas.general;
  const simulando = new Set<string>();
  const aplicarRuidoSimulado = (): void => {
    microfono.nivelSimulado = simulando.has(ruidoPeligro)
      ? CONFIG.ruido.simuladoPeligro
      : simulando.has(ruidoCuidado)
        ? CONFIG.ruido.simuladoCuidado
        : 0;
  };
  window.addEventListener('keydown', (e) => {
    if (e.code === teclaReiniciar) {
      e.preventDefault();
      reiniciar();
    } else if ((e.code === ruidoCuidado || e.code === ruidoPeligro) && !radioAbierto()) {
      simulando.add(e.code);
      aplicarRuidoSimulado();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (simulando.delete(e.code)) aplicarRuidoSimulado();
  });
  window.addEventListener('blur', () => {
    simulando.clear();
    aplicarRuidoSimulado();
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

  if (conDispositivos && lsm) {
    mostrarAviso('Preparando la cámara y el micrófono…');
    const [hayCamara, hayMicrofono] = await Promise.all([lsm.enableCamera(), microfono.iniciar()]);
    if (hayMicrofono) {
      mostrarAviso(`Calibrando el ruido del cuarto: ${CONFIG.ruido.segCalibracion} segundos de silencio, por favor.`);
      await microfono.calibrar();
    }
    const faltan = [
      hayCamara ? '' : 'Sin cámara: las señas se teclean (Tab abre el radio).',
      hayMicrofono ? '' : 'Sin micrófono: el ruido solo viene del juego.',
    ].filter(Boolean);
    mostrarAviso(faltan.join(' '));
    if (faltan.length > 0) window.setTimeout(() => mostrarAviso(''), CONFIG.interfaz.msAviso);
  }

  bus.enviar('juego/iniciar', {});
}

$('btn-inicio').addEventListener('click', () => void arrancar(true));
$('btn-teclado').addEventListener('click', () => void arrancar(false));
