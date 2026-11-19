/**
 * HUD de Vista (DISENO.md §7.1): medidor de ruido con tres zonas (solo cuando Oído ya tiene el
 * decibelímetro), objetos de Oído, estado de la puerta de la cámara activa y recordatorio de
 * teclas. Es DOM puro y solo toca el documento cuando un valor cambia.
 */
import { CONFIG } from '../config';
import type { EstadoJuego, Mapa, ZonaRuido } from '../shared/contratos';

export interface Hud {
  raiz: HTMLElement;
  actualizar(estado: EstadoJuego): void;
  /** Resalta un instante el renglón de la puerta (llegó `sim/puerta`). */
  destellarPuerta(): void;
}

const NOMBRE_ZONA: Record<ZonaRuido, string> = {
  silencio: 'SILENCIO',
  cuidado: 'CUIDADO',
  peligro: 'PELIGRO',
};

/** 'KeyP' → 'P', 'Digit1' → '1', etc. */
function nombreTecla(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Backspace') return 'Retroceso';
  return code;
}

function elemento(etiqueta: string, clase: string, texto = ''): HTMLElement {
  const el = document.createElement(etiqueta);
  el.className = clase;
  if (texto) el.textContent = texto;
  return el;
}

export function crearHud(mapa: Mapa): Hud {
  const T = CONFIG.teclas.vista;
  const R = CONFIG.ruido;
  const raiz = elemento('div', 'dmv-hud');

  // — Medidor de ruido —
  const ruido = elemento('div', 'dmv-ruido');
  ruido.appendChild(elemento('span', 'dmv-rot', 'RUIDO'));
  const barra = elemento('div', 'dmv-barra');
  const z1 = elemento('i', 'dmv-z dmv-z1');
  const z2 = elemento('i', 'dmv-z dmv-z2');
  const z3 = elemento('i', 'dmv-z dmv-z3');
  z1.style.width = `${R.umbralCuidado * 100}%`;
  z2.style.width = `${(R.umbralPeligro - R.umbralCuidado) * 100}%`;
  z3.style.width = `${(1 - R.umbralPeligro) * 100}%`;
  const nivel = elemento('b', 'dmv-nivel');
  barra.append(z1, z2, z3, nivel);
  const zona = elemento('span', 'dmv-zona', NOMBRE_ZONA.silencio);
  ruido.append(barra, zona);

  const sinRuido = elemento('div', 'dmv-fila dmv-tenue', 'RUIDO  — sin medidor —');

  // — Objetos de Oído —
  const objetos = elemento('div', 'dmv-fila');
  objetos.appendChild(elemento('span', 'dmv-rot', 'OÍDO LLEVA'));
  const objAparato = elemento('span', 'dmv-obj', 'DECIBELÍMETRO');
  const objLlave = elemento('span', 'dmv-obj', 'LLAVE');
  objetos.append(objAparato, objLlave);

  // — Puerta de la cámara activa —
  const puerta = elemento('div', 'dmv-fila dmv-puerta');

  // — Teclas —
  const primera = nombreTecla(T.camaras[0]);
  const ultima = nombreTecla(T.camaras[T.camaras.length - 1] ?? T.camaras[0]);
  const teclas = elemento(
    'div',
    'dmv-fila dmv-tenue',
    `${primera}–${ultima} cámara · ${nombreTecla(T.puerta)} puerta · ${nombreTecla(T.detector)} señas · ` +
      `${nombreTecla(T.enviar)} enviar · ${nombreTecla(T.borrar)} borra`,
  );

  raiz.append(ruido, sinRuido, objetos, puerta, teclas);

  // Últimos valores escritos, para no tocar el DOM de más.
  let hayMedidor: boolean | null = null;
  let anchoNivel = -1;
  let zonaActual = '';
  let tieneAparato: boolean | null = null;
  let tieneLlave: boolean | null = null;
  let textoPuerta = '';
  let clasePuerta = '';

  const actualizar = (estado: EstadoJuego): void => {
    const medidor = estado.inventario.decibelimetro === true;
    if (medidor !== hayMedidor) {
      hayMedidor = medidor;
      ruido.style.display = medidor ? 'flex' : 'none';
      sinRuido.style.display = medidor ? 'none' : 'block';
    }
    if (medidor) {
      const w = Math.round(Math.max(0, Math.min(1, estado.ruido.nivel)) * 100);
      if (w !== anchoNivel) {
        anchoNivel = w;
        nivel.style.width = `${w}%`;
      }
      if (estado.ruido.zona !== zonaActual) {
        zonaActual = estado.ruido.zona;
        zona.textContent = NOMBRE_ZONA[estado.ruido.zona];
        ruido.dataset['zona'] = estado.ruido.zona;
      }
    }

    if (medidor !== tieneAparato) {
      tieneAparato = medidor;
      objAparato.classList.toggle('dmv-si', medidor);
    }
    const llave = estado.inventario.llave === true;
    if (llave !== tieneLlave) {
      tieneLlave = llave;
      objLlave.classList.toggle('dmv-si', llave);
    }

    const cam = mapa.camaras.find((c) => c.numero === estado.camaraActiva);
    const def = cam?.puertaId ? mapa.puertas.find((p) => p.id === cam.puertaId) : undefined;
    let texto: string;
    let clase: string;
    if (!def) {
      // Sin puerta controlable: si la cámara ve la salida, se informa su estado.
      const salida = mapa.puertas.find((p) => p.esSalida && cam && p.entre.includes(cam.cuartoId));
      if (salida) {
        const abierta = estado.puertas[salida.id] === true;
        texto = `${salida.nombre.toUpperCase()}: ${abierta ? 'ABIERTA' : 'CERRADA CON LLAVE'}`;
        clase = abierta ? 'dmv-abierta' : 'dmv-cerrada';
      } else {
        texto = 'ESTA CÁMARA NO CONTROLA PUERTAS';
        clase = 'dmv-tenue';
      }
    } else {
      const abierta = estado.puertas[def.id] === true;
      texto = `[${nombreTecla(T.puerta)}] ${def.nombre.toUpperCase()}: ${abierta ? 'ABIERTA' : 'CERRADA'}`;
      clase = abierta ? 'dmv-abierta' : 'dmv-cerrada';
    }
    if (texto !== textoPuerta) {
      textoPuerta = texto;
      puerta.textContent = texto;
    }
    if (clase !== clasePuerta) {
      clasePuerta = clase;
      puerta.className = `dmv-fila dmv-puerta ${clase}`;
    }
  };

  const destellarPuerta = (): void => {
    puerta.classList.remove('dmv-destello');
    // Forzar reflujo para que la animación vuelva a empezar.
    void puerta.offsetWidth;
    puerta.classList.add('dmv-destello');
  };

  return { raiz, actualizar, destellarPuerta };
}
