/**
 * Mapa 2D del ala este para Vista: paredes, puertas abiertas o cerradas, objetos sin agarrar,
 * las cámaras y la posición y el rumbo de Oído. El monstruo NO aparece (DISENO.md §7.1).
 * Las paredes se pintan una vez en una capa fija; cada estado nuevo solo repinta lo que cambia.
 */
import type { EstadoJuego, Mapa } from '../shared/contratos';
import { altoMapa, anchoMapa, vectorDeRumbo } from '../shared/mapaUtil';

export interface Mapa2D {
  lienzo: HTMLCanvasElement;
  /** Ajusta el lienzo al tamaño en pantalla de su caja y repinta la capa fija. */
  redimensionar(): void;
  dibujar(estado: EstadoJuego): void;
  destruir(): void;
}

const COLOR = {
  fondo: '#020402',
  pared: '#14291a',
  piso: '#060c07',
  borde: '#2f6b3c',
  texto: '#3f7a4c',
  abierta: '#5fe07a',
  cerrada: '#e8a23a',
  salida: '#ff5a4a',
  salidaAbierta: '#d8ffe6',
  aparato: '#5fd8ff',
  llave: '#ffd84a',
  camara: '#3f7a4c',
  camaraActiva: '#b6ffc4',
  oido: '#f2fff2',
} as const;

export function crearMapa2D(mapa: Mapa): Mapa2D {
  const lienzo = document.createElement('canvas');
  lienzo.style.cssText = 'width:100%;height:100%;display:block;image-rendering:pixelated;';
  const ctx = lienzo.getContext('2d');
  const capaFija = document.createElement('canvas');
  const ctxFija = capaFija.getContext('2d');

  const ancho = anchoMapa(mapa);
  const alto = altoMapa(mapa);
  /** Píxeles por casilla y margen para centrar. */
  let e = 8;
  let ox = 0;
  let oz = 0;

  const transitable = (cx: number, cz: number): boolean => {
    if (cz < 0 || cz >= alto || cx < 0 || cx >= ancho) return false;
    return mapa.celdas[cz]?.[cx] !== '#';
  };

  const pintarFija = (): void => {
    if (!ctxFija) return;
    ctxFija.fillStyle = COLOR.fondo;
    ctxFija.fillRect(0, 0, capaFija.width, capaFija.height);
    for (let cz = 0; cz < alto; cz++) {
      for (let cx = 0; cx < ancho; cx++) {
        const libre = transitable(cx, cz);
        // Solo se pintan las paredes que tocan piso: el contorno del edificio.
        let visible = libre;
        if (!libre) {
          for (let dz = -1; dz <= 1 && !visible; dz++) {
            for (let dx = -1; dx <= 1 && !visible; dx++) visible = transitable(cx + dx, cz + dz);
          }
        }
        if (!visible) continue;
        ctxFija.fillStyle = libre ? COLOR.piso : COLOR.pared;
        ctxFija.fillRect(ox + cx * e, oz + cz * e, e, e);
      }
    }
    // Filo entre piso y pared.
    ctxFija.fillStyle = COLOR.borde;
    const g = Math.max(1, Math.round(e / 10));
    for (let cz = 0; cz < alto; cz++) {
      for (let cx = 0; cx < ancho; cx++) {
        if (!transitable(cx, cz)) continue;
        const x = ox + cx * e;
        const z = oz + cz * e;
        if (!transitable(cx, cz - 1)) ctxFija.fillRect(x, z - g, e, g);
        if (!transitable(cx, cz + 1)) ctxFija.fillRect(x, z + e, e, g);
        if (!transitable(cx - 1, cz)) ctxFija.fillRect(x - g, z, g, e);
        if (!transitable(cx + 1, cz)) ctxFija.fillRect(x + e, z, g, e);
      }
    }
    // Nombres de los cuartos.
    ctxFija.fillStyle = COLOR.texto;
    ctxFija.font = `${Math.max(7, Math.round(e * 0.62))}px 'Courier New', monospace`;
    ctxFija.textAlign = 'center';
    ctxFija.textBaseline = 'middle';
    for (const c of mapa.cuartos) {
      const mx = ox + ((c.desde.cx + c.hasta.cx + 1) / 2) * e;
      const mz = oz + ((c.desde.cz + c.hasta.cz + 1) / 2) * e;
      ctxFija.fillText(c.nombre.toUpperCase(), mx, mz + e * 0.9);
    }
  };

  const redimensionar = (): void => {
    const w = Math.max(1, Math.floor(lienzo.clientWidth));
    const h = Math.max(1, Math.floor(lienzo.clientHeight));
    if (lienzo.width === w && lienzo.height === h) return;
    lienzo.width = w;
    lienzo.height = h;
    capaFija.width = w;
    capaFija.height = h;
    e = Math.max(2, Math.floor(Math.min(w / ancho, h / alto)));
    ox = Math.floor((w - e * ancho) / 2);
    oz = Math.floor((h - e * alto) / 2);
    pintarFija();
  };

  const dibujar = (estado: EstadoJuego): void => {
    if (!ctx) return;
    ctx.drawImage(capaFija, 0, 0);
    const g = Math.max(2, Math.round(e / 4));

    // Puertas: barra atravesada si está cerrada; dos topes si está abierta.
    for (const p of mapa.puertas) {
      const { cx, cz } = p.casilla;
      const abierta = estado.puertas[p.id] === true;
      const x = ox + cx * e;
      const z = oz + cz * e;
      const ejeX = transitable(cx - 1, cz) || transitable(cx + 1, cz);
      ctx.fillStyle = p.esSalida ? (abierta ? COLOR.salidaAbierta : COLOR.salida) : abierta ? COLOR.abierta : COLOR.cerrada;
      if (abierta) {
        if (ejeX) {
          ctx.fillRect(x + (e - g) / 2, z, g, g);
          ctx.fillRect(x + (e - g) / 2, z + e - g, g, g);
        } else {
          ctx.fillRect(x, z + (e - g) / 2, g, g);
          ctx.fillRect(x + e - g, z + (e - g) / 2, g, g);
        }
      } else if (ejeX) {
        ctx.fillRect(x + (e - g) / 2, z, g, e);
      } else {
        ctx.fillRect(x, z + (e - g) / 2, e, g);
      }
      if (p.esSalida) {
        ctx.font = `bold ${Math.max(7, Math.round(e * 0.62))}px 'Courier New', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // El rótulo va del lado de la pared, para no tapar el vestíbulo.
        const abajo = !transitable(cx, cz + 1);
        ctx.fillText('SALIDA', x + e / 2, abajo ? z + e * 1.55 : z - e * 0.55);
      }
    }

    // Cámaras: número en su esquina; la activa resaltada con su cono de visión.
    ctx.font = `bold ${Math.max(7, Math.round(e * 0.7))}px 'Courier New', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const c of mapa.camaras) {
      const x = ox + c.pos.x * e;
      const z = oz + c.pos.z * e;
      const activa = c.numero === estado.camaraActiva;
      if (activa) {
        const ang = Math.atan2(c.mira.z - c.pos.z, c.mira.x - c.pos.x);
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = COLOR.camaraActiva;
        ctx.beginPath();
        ctx.moveTo(x, z);
        ctx.arc(x, z, e * 3.2, ang - 0.6, ang + 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = activa ? COLOR.camaraActiva : COLOR.camara;
      ctx.fillText(String(c.numero), x, z);
    }

    // Objetos que Oído todavía no agarra.
    for (const o of mapa.objetos) {
      if (estado.inventario[o.id]) continue;
      const x = ox + o.pos.x * e;
      const z = oz + o.pos.z * e;
      const r = Math.max(2, e * 0.26);
      if (o.id === 'llave') {
        ctx.fillStyle = COLOR.llave;
        ctx.beginPath();
        ctx.moveTo(x, z - r);
        ctx.lineTo(x + r, z);
        ctx.lineTo(x, z + r);
        ctx.lineTo(x - r, z);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = COLOR.aparato;
        ctx.fillRect(x - r, z - r, r * 2, r * 2);
      }
    }

    // Oído: triángulo que apunta hacia su rumbo.
    const v = vectorDeRumbo(estado.oido.rumbo);
    const px = ox + estado.oido.pos.x * e;
    const pz = oz + estado.oido.pos.z * e;
    const largo = Math.max(4, e * 0.55);
    const medio = largo * 0.6;
    ctx.fillStyle = COLOR.oido;
    ctx.beginPath();
    ctx.moveTo(px + v.x * largo, pz + v.z * largo);
    ctx.lineTo(px - v.x * medio - v.z * medio, pz - v.z * medio + v.x * medio);
    ctx.lineTo(px - v.x * medio + v.z * medio, pz - v.z * medio - v.x * medio);
    ctx.closePath();
    ctx.fill();
  };

  const destruir = (): void => {
    lienzo.remove();
  };

  return { lienzo, redimensionar, dibujar, destruir };
}
