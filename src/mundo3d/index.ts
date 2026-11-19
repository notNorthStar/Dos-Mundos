/**
 * Mundo 3D compartido (docs/CONTRATOS.md §4). Construye, a partir de `mapa.celdas`, la geometría
 * estilo PSX del nivel: pisos, techo, paredes, marcos y hojas de puerta, muebles, objetos y la
 * figura de Oído. Cada pantalla llama a `construirMundo` por separado y recibe SU escena;
 * las luces, la niebla y el fondo los pone cada pantalla (Oído: tinieblas; Vista: cámaras).
 *
 * El monstruo NO se dibuja nunca (DISENO.md §7): aquí no existe ninguna malla para él.
 */
import * as THREE from 'three';
import type { EstadoJuego, Mapa, ObjetoId, PuertaDef, Superficie } from '../shared/contratos';
import { altoMapa, anchoMapa, cuartoEn, puertaEn, puertasIniciales } from '../shared/mapaUtil';
import { AJUSTES_MUNDO as A } from './ajustes';
import { diferenciaRumbo } from './estado';
import { ConstructorMalla, type Color3 } from './malla';
import {
  crearAzar,
  texturaGrano,
  texturaLetreroSalida,
  texturaPared,
  texturaPiso,
  texturaPuerta,
  texturaPuertaSalida,
  texturaTecho,
} from './texturas';

export { AJUSTES_MUNDO } from './ajustes';
export { copiarEstado, diferenciaRumbo, estadoInicial } from './estado';

export interface Mundo3D {
  escena: THREE.Scene;
  /** Pone puertas, objetos y la figura de Oído según el estado. Llamar una vez por cuadro. */
  actualizar(estado: EstadoJuego, dtSeg: number): void;
  destruir(): void;
}

export interface OpcionesMundo {
  /** false = no se crea la figura de Oído (pantalla en primera persona). Por omisión, true. */
  mostrarOido?: boolean;
}

interface HojaPuerta {
  def: PuertaDef;
  malla: THREE.Mesh;
  anguloCerrada: number;
  anguloAbierta: number;
}

const GRADOS = Math.PI / 180;

// Colores por vértice (lineales, 0 a 1).
const C_MARCO: Color3 = [0.2, 0.16, 0.12];
const C_MARCO_SALIDA: Color3 = [0.7, 0.55, 0.08];
const C_MESA: Color3 = [0.32, 0.22, 0.13];
const C_ESTANTE: Color3 = [0.24, 0.27, 0.3];
const C_TABLA: Color3 = [0.3, 0.3, 0.28];
const C_CAJAS: readonly Color3[] = [
  [0.45, 0.33, 0.18],
  [0.38, 0.28, 0.16],
  [0.3, 0.32, 0.34],
  [0.42, 0.4, 0.3],
];

export function construirMundo(mapa: Mapa, opciones: OpcionesMundo = {}): Mundo3D {
  const mostrarOido = opciones.mostrarOido ?? true;
  const H = A.altoPared;
  const ancho = anchoMapa(mapa);
  const alto = altoMapa(mapa);
  const azar = crearAzar(A.semilla);

  const escena = new THREE.Scene();
  const texturas: THREE.Texture[] = [];
  const materiales: THREE.Material[] = [];
  const geometrias: THREE.BufferGeometry[] = [];

  const registrar = <T extends THREE.Texture>(t: T): T => {
    texturas.push(t);
    return t;
  };
  const material = <M extends THREE.Material>(m: M): M => {
    materiales.push(m);
    return m;
  };
  const agregar = (c: ConstructorMalla, m: THREE.Material, padre: THREE.Object3D = escena): THREE.Mesh | null => {
    if (c.vacia) return null;
    const g = c.construir();
    geometrias.push(g);
    const malla = new THREE.Mesh(g, m);
    malla.matrixAutoUpdate = false;
    padre.add(malla);
    return malla;
  };

  const transitable = (cx: number, cz: number): boolean => {
    if (cz < 0 || cz >= alto || cx < 0 || cx >= ancho) return false;
    return mapa.celdas[cz]?.[cx] !== '#';
  };
  const indiceCuarto = (cx: number, cz: number): number => {
    const c = cuartoEn(mapa, { x: cx + 0.5, z: cz + 0.5 });
    return Math.max(0, mapa.cuartos.indexOf(c));
  };

  // ───────────────────────── Piso, techo y paredes (fusionados por material) ─────────────────────────
  const pisos = new Map<Superficie, ConstructorMalla>();
  const paredes: ConstructorMalla[] = mapa.cuartos.map(() => new ConstructorMalla());
  const techo = new ConstructorMalla();
  const exterior = new ConstructorMalla();

  for (let cz = 0; cz < alto; cz++) {
    for (let cx = 0; cx < ancho; cx++) {
      if (!transitable(cx, cz)) continue;
      const idx = indiceCuarto(cx, cz);
      const cuarto = mapa.cuartos[idx];
      const superficie: Superficie = cuarto?.superficie ?? 'concreto';
      let piso = pisos.get(superficie);
      if (!piso) {
        piso = new ConstructorMalla();
        pisos.set(superficie, piso);
      }
      piso.cuad([cx, 0, cz + 1], [cx + 1, 0, cz + 1], [cx + 1, 0, cz], [cx, 0, cz], [0, 1, 0], cx, -(cz + 1), cx + 1, -cz);
      techo.cuad([cx, H, cz], [cx + 1, H, cz], [cx + 1, H, cz + 1], [cx, H, cz + 1], [0, -1, 0], cx, cz, cx + 1, cz + 1);

      const pared = paredes[idx] ?? paredes[0]!;
      const salida = puertaEn(mapa, cx, cz)?.esSalida === true;
      // En la casilla de la salida, la cara del fondo (la opuesta al lado transitable) es «afuera».
      const destino = (opuestoTransitable: boolean): ConstructorMalla => (salida && opuestoTransitable ? exterior : pared);

      if (!transitable(cx, cz - 1)) {
        destino(transitable(cx, cz + 1)).cuad([cx, 0, cz], [cx + 1, 0, cz], [cx + 1, H, cz], [cx, H, cz], [0, 0, 1], cx, 0, cx + 1, 1);
      }
      if (!transitable(cx, cz + 1)) {
        destino(transitable(cx, cz - 1)).cuad(
          [cx + 1, 0, cz + 1], [cx, 0, cz + 1], [cx, H, cz + 1], [cx + 1, H, cz + 1], [0, 0, -1], -(cx + 1), 0, -cx, 1,
        );
      }
      if (!transitable(cx - 1, cz)) {
        destino(transitable(cx + 1, cz)).cuad([cx, 0, cz + 1], [cx, 0, cz], [cx, H, cz], [cx, H, cz + 1], [1, 0, 0], -(cz + 1), 0, -cz, 1);
      }
      if (!transitable(cx + 1, cz)) {
        destino(transitable(cx - 1, cz)).cuad(
          [cx + 1, 0, cz], [cx + 1, 0, cz + 1], [cx + 1, H, cz + 1], [cx + 1, H, cz], [-1, 0, 0], cz, 0, cz + 1, 1,
        );
      }
    }
  }

  let semilla = A.semilla;
  for (const [superficie, c] of pisos) {
    agregar(c, material(new THREE.MeshLambertMaterial({ map: registrar(texturaPiso(superficie, ++semilla)) })));
  }
  paredes.forEach((c, i) => {
    agregar(c, material(new THREE.MeshLambertMaterial({ map: registrar(texturaPared(i, ++semilla)) })));
  });
  agregar(techo, material(new THREE.MeshLambertMaterial({ map: registrar(texturaTecho(++semilla)) })));
  // «Afuera»: una pared clara sin niebla; solo se ve cuando la salida se abre.
  agregar(exterior, material(new THREE.MeshBasicMaterial({ color: 0xbfd8ff, fog: false })));

  // ───────────────────────── Marcos, muebles (una sola malla con color por vértice) ─────────────────────────
  const grano = registrar(texturaGrano(++semilla));
  const matColor = material(new THREE.MeshLambertMaterial({ map: grano, vertexColors: true }));
  const fijos = new ConstructorMalla();
  const letreros = new ConstructorMalla();

  // ───────────────────────── Puertas ─────────────────────────
  const matPuerta = material(new THREE.MeshLambertMaterial({ map: registrar(texturaPuerta(++semilla)) }));
  const matSalida = material(new THREE.MeshLambertMaterial({ map: registrar(texturaPuertaSalida(++semilla)) }));
  const P = A.puerta;
  const anchoHoja = 1 - 2 * P.anchoJamba;
  const cHoja = new ConstructorMalla();
  cHoja.caja(0, 0, -P.grosorHoja / 2, anchoHoja, P.alto, P.grosorHoja / 2, [1, 1, 1], true);
  const geoHoja = cHoja.construir();
  geometrias.push(geoHoja);

  const hojas: HojaPuerta[] = [];
  const inicialPuertas = puertasIniciales(mapa);

  for (const def of mapa.puertas) {
    const { cx, cz } = def.casilla;
    const oeste = transitable(cx - 1, cz);
    const este = transitable(cx + 1, cz);
    const sur = transitable(cx, cz + 1);
    // Eje del paso: 'x' si se cruza de oeste a este; 'z' si se cruza de norte a sur.
    const ejeX = oeste || este;
    // Lado hacia el que abre la hoja (+1 o −1 sobre el eje del paso): siempre uno transitable.
    const lado = ejeX ? (este ? 1 : -1) : sur ? 1 : -1;
    const color = def.esSalida ? C_MARCO_SALIDA : C_MARCO;
    const g2 = P.grosorMarco / 2;
    const j = P.anchoJamba;
    const malla = new THREE.Mesh(geoHoja, def.esSalida ? matSalida : matPuerta);
    let anguloCerrada: number;
    let anguloAbierta: number;

    if (ejeX) {
      const x = cx + 0.5;
      fijos.caja(x - g2, 0, cz, x + g2, P.alto, cz + j, color, false, 2);
      fijos.caja(x - g2, 0, cz + 1 - j, x + g2, P.alto, cz + 1, color, false, 2);
      fijos.caja(x - g2, P.alto, cz, x + g2, H, cz + 1, color, false, 2);
      malla.position.set(x, 0, cz + j);
      anguloCerrada = -Math.PI / 2;
      anguloAbierta = lado > 0 ? 0 : -Math.PI;
      if (def.esSalida) {
        const xl = x + lado * (g2 + 0.01);
        const y0 = P.alto + 0.15;
        const y1 = P.alto + 0.45;
        // Visto desde el lado transitable: la izquierda del que mira queda en z alto si mira a −x.
        const zIzq = lado > 0 ? cz + 0.85 : cz + 0.15;
        const zDer = lado > 0 ? cz + 0.15 : cz + 0.85;
        letreros.cuad([xl, y0, zIzq], [xl, y0, zDer], [xl, y1, zDer], [xl, y1, zIzq], [lado, 0, 0], 0, 0, 1, 1);
      }
    } else {
      const z = cz + 0.5;
      fijos.caja(cx, 0, z - g2, cx + j, P.alto, z + g2, color, false, 2);
      fijos.caja(cx + 1 - j, 0, z - g2, cx + 1, P.alto, z + g2, color, false, 2);
      fijos.caja(cx, P.alto, z - g2, cx + 1, H, z + g2, color, false, 2);
      malla.position.set(cx + j, 0, z);
      anguloCerrada = 0;
      anguloAbierta = lado > 0 ? -Math.PI / 2 : Math.PI / 2;
      if (def.esSalida) {
        const zl = z + lado * (g2 + 0.01);
        const y0 = P.alto + 0.15;
        const y1 = P.alto + 0.45;
        const xIzq = lado > 0 ? cx + 0.15 : cx + 0.85;
        const xDer = lado > 0 ? cx + 0.85 : cx + 0.15;
        letreros.cuad([xIzq, y0, zl], [xDer, y0, zl], [xDer, y1, zl], [xIzq, y1, zl], [0, 0, lado], 0, 0, 1, 1);
      }
    }
    malla.rotation.y = inicialPuertas[def.id] ? anguloAbierta : anguloCerrada;
    escena.add(malla);
    hojas.push({ def, malla, anguloCerrada, anguloAbierta });
  }

  // ───────────────────────── Muebles ─────────────────────────
  /** Dirección (dx, dz) de la primera pared pegada a la casilla, o null. */
  const paredVecina = (cx: number, cz: number): [number, number] | null => {
    if (!transitable(cx, cz - 1)) return [0, -1];
    if (!transitable(cx - 1, cz)) return [-1, 0];
    if (!transitable(cx + 1, cz)) return [1, 0];
    if (!transitable(cx, cz + 1)) return [0, 1];
    return null;
  };

  /** Dónde se dibuja cada objeto (los que van sobre una mesa se corren hacia la pared). */
  const posObjeto = new Map<ObjetoId, THREE.Vector3>();
  for (const o of mapa.objetos) {
    if (o.enElPiso) {
      posObjeto.set(o.id, new THREE.Vector3(o.pos.x, 0, o.pos.z));
      continue;
    }
    const cx = Math.floor(o.pos.x);
    const cz = Math.floor(o.pos.z);
    const dir = paredVecina(cx, cz);
    const M = A.mesa;
    const corr = dir ? 0.5 - M.fondo / 2 - 0.02 : 0;
    const mx = cx + 0.5 + (dir ? dir[0] * corr : 0);
    const mz = cz + 0.5 + (dir ? dir[1] * corr : 0);
    const alLargoX = !dir || dir[0] === 0;
    const sx = alLargoX ? M.ancho : M.fondo;
    const sz = alLargoX ? M.fondo : M.ancho;
    fijos.cajaCentro(mx, M.alto - 0.025, mz, sx, 0.05, sz, C_MESA, false, 2);
    for (const ex of [-1, 1]) {
      for (const ez of [-1, 1]) {
        fijos.cajaCentro(mx + ex * (sx / 2 - 0.05), (M.alto - 0.05) / 2, mz + ez * (sz / 2 - 0.05), 0.05, M.alto - 0.05, 0.05, C_MESA, false, 2);
      }
    }
    posObjeto.set(o.id, new THREE.Vector3(mx, M.alto, mz));
  }

  /** Un tramo de estante que ocupa la huella (x0,z0)-(x1,z1), con cajas encima. */
  const estante = (x0: number, z0: number, x1: number, z1: number): void => {
    const E = A.estante;
    const p = 0.04;
    for (const x of [x0, x1 - p]) {
      for (const z of [z0, z1 - p]) fijos.caja(x, 0, z, x + p, E.alto, z + p, C_ESTANTE, false, 2);
    }
    const largoX = x1 - x0 >= z1 - z0;
    for (const y of E.tablas) {
      fijos.caja(x0, y - 0.03, z0, x1, y, z1, C_TABLA, false, 2);
      if (y >= E.alto) continue;
      // Cajas y botes sobre la tabla.
      let t = 0.08 + azar() * 0.1;
      const largo = largoX ? x1 - x0 : z1 - z0;
      const fondo = largoX ? z1 - z0 : x1 - x0;
      while (t < largo - 0.3) {
        const a = 0.16 + azar() * 0.2;
        const h = 0.12 + azar() * 0.26;
        const f = fondo * (0.55 + azar() * 0.3);
        const color = C_CAJAS[Math.floor(azar() * C_CAJAS.length)] ?? C_MESA;
        if (azar() > 0.25) {
          if (largoX) fijos.caja(x0 + t, y, z0 + 0.03, x0 + t + a, y + h, z0 + 0.03 + f, color, false, 2);
          else fijos.caja(x0 + 0.03, y, z0 + t, x0 + 0.03 + f, y + h, z0 + t + a, color, false, 2);
        }
        t += a + 0.05 + azar() * 0.2;
      }
    }
  };

  for (const id of A.cuartosConEstantes) {
    const c = mapa.cuartos.find((q) => q.id === id);
    if (!c) continue;
    const f = A.estante.fondo;
    // Pared norte (se salta la primera casilla: ahí suele ir la cámara).
    for (let cx = c.desde.cx + 1; cx <= c.hasta.cx; cx++) {
      if (transitable(cx, c.desde.cz - 1)) continue;
      estante(cx + 0.04, c.desde.cz + 0.02, cx + 0.96, c.desde.cz + 0.02 + f);
    }
    // Pared este (sin las esquinas).
    for (let cz = c.desde.cz + 1; cz < c.hasta.cz; cz++) {
      if (transitable(c.hasta.cx + 1, cz)) continue;
      estante(c.hasta.cx + 0.98 - f, cz + 0.04, c.hasta.cx + 0.98, cz + 0.96);
    }
  }

  agregar(fijos, matColor);
  if (!letreros.vacia) {
    agregar(letreros, material(new THREE.MeshBasicMaterial({ map: registrar(texturaLetreroSalida()) })));
  }

  // ───────────────────────── Objetos ─────────────────────────
  const mallasObjeto = new Map<ObjetoId, THREE.Mesh>();
  // El decibelímetro tiene pantalla encendida: material sin luces para que brille un poco.
  const matAparato = material(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const matLlave = material(
    new THREE.MeshLambertMaterial({ map: grano, vertexColors: true, emissive: new THREE.Color(0.2, 0.14, 0.02) }),
  );

  for (const o of mapa.objetos) {
    const c = new ConstructorMalla();
    let m: THREE.Material;
    if (o.id === 'decibelimetro') {
      c.caja(-0.1, 0, -0.06, 0.1, 0.05, 0.06, [0.05, 0.05, 0.06]);
      c.caja(-0.07, 0.05, -0.04, 0.03, 0.056, 0.035, [0.2, 0.9, 0.4]);
      c.caja(0.055, 0.05, -0.03, 0.08, 0.06, -0.005, [0.9, 0.12, 0.08]);
      c.caja(0.085, 0.05, -0.05, 0.095, 0.14, -0.04, [0.3, 0.3, 0.32]);
      m = matAparato;
    } else {
      // Llave algo más grande que una real para que se distinga en las cámaras.
      const oro: Color3 = [0.95, 0.75, 0.2];
      c.caja(-0.1, 0.01, -0.07, -0.07, 0.035, 0.07, oro);
      c.caja(0.01, 0.01, -0.07, 0.04, 0.035, 0.07, oro);
      c.caja(-0.1, 0.01, -0.07, 0.04, 0.035, -0.04, oro);
      c.caja(-0.1, 0.01, 0.04, 0.04, 0.035, 0.07, oro);
      c.caja(0.04, 0.01, -0.015, 0.34, 0.035, 0.015, oro);
      c.caja(0.24, 0.01, 0.015, 0.27, 0.035, 0.07, oro);
      c.caja(0.31, 0.01, 0.015, 0.34, 0.035, 0.06, oro);
      m = matLlave;
    }
    const g = c.construir();
    geometrias.push(g);
    const malla = new THREE.Mesh(g, m);
    const p = posObjeto.get(o.id);
    if (p) malla.position.copy(p);
    malla.rotation.y = o.id === 'llave' ? 0.7 : 0.25;
    escena.add(malla);
    mallasObjeto.set(o.id, malla);
  }

  // ───────────────────────── Figura de Oído ─────────────────────────
  let figura: THREE.Group | null = null;
  let piernaIzq: THREE.Mesh | null = null;
  let piernaDer: THREE.Mesh | null = null;
  let brazoIzq: THREE.Mesh | null = null;
  let brazoDer: THREE.Mesh | null = null;

  if (mostrarOido) {
    const piel: Color3 = [0.78, 0.58, 0.45];
    const chamarra: Color3 = [0.72, 0.4, 0.16];
    const pantalon: Color3 = [0.16, 0.2, 0.34];
    const pelo: Color3 = [0.1, 0.07, 0.05];
    const negro: Color3 = [0.06, 0.06, 0.07];

    figura = new THREE.Group();
    // El modelo mira hacia −z (rumbo 0 = norte); la figura gira con rotation.y = −rumbo.
    const cuerpo = new ConstructorMalla();
    cuerpo.caja(-0.2, 0.8, -0.11, 0.2, 1.4, 0.11, chamarra, false, 2);
    cuerpo.caja(-0.05, 1.4, -0.05, 0.05, 1.45, 0.05, piel);
    cuerpo.caja(-0.11, 1.44, -0.11, 0.11, 1.66, 0.11, piel);
    cuerpo.caja(-0.12, 1.6, -0.06, 0.12, 1.72, 0.125, pelo);
    cuerpo.caja(-0.12, 1.66, -0.12, 0.12, 1.72, -0.06, pelo);
    // Audífonos de diadema y radio en el pecho: la seña de identidad de Oído.
    cuerpo.caja(-0.155, 1.49, -0.05, -0.11, 1.61, 0.05, negro);
    cuerpo.caja(0.11, 1.49, -0.05, 0.155, 1.61, 0.05, negro);
    cuerpo.caja(-0.14, 1.72, -0.02, 0.14, 1.745, 0.02, negro);
    cuerpo.caja(0.04, 1.18, -0.15, 0.14, 1.32, -0.11, negro);
    const mCuerpo = new THREE.Mesh(cuerpo.construir(), matColor);
    geometrias.push(mCuerpo.geometry);
    figura.add(mCuerpo);

    const pierna = new ConstructorMalla();
    pierna.caja(-0.08, -0.74, -0.08, 0.08, 0, 0.08, pantalon, false, 2);
    pierna.caja(-0.08, -0.8, -0.14, 0.08, -0.74, 0.08, negro);
    const geoPierna = pierna.construir();
    geometrias.push(geoPierna);
    piernaIzq = new THREE.Mesh(geoPierna, matColor);
    piernaIzq.position.set(-0.1, 0.8, 0);
    piernaDer = new THREE.Mesh(geoPierna, matColor);
    piernaDer.position.set(0.1, 0.8, 0);

    const brazo = new ConstructorMalla();
    brazo.caja(-0.05, -0.46, -0.06, 0.05, 0, 0.06, chamarra, false, 2);
    brazo.caja(-0.04, -0.56, -0.05, 0.04, -0.46, 0.05, piel);
    const geoBrazo = brazo.construir();
    geometrias.push(geoBrazo);
    brazoIzq = new THREE.Mesh(geoBrazo, matColor);
    brazoIzq.position.set(-0.26, 1.38, 0);
    brazoDer = new THREE.Mesh(geoBrazo, matColor);
    brazoDer.position.set(0.26, 1.38, 0);

    figura.add(piernaIzq, piernaDer, brazoIzq, brazoDer);
    figura.position.set(mapa.inicioOido.pos.x, 0, mapa.inicioOido.pos.z);
    figura.rotation.y = -mapa.inicioOido.rumbo * GRADOS;
    escena.add(figura);
  }

  // Las mallas fijas no recalculan su matriz cada cuadro.
  escena.updateMatrixWorld(true);

  // ───────────────────────── Actualización por cuadro ─────────────────────────
  let primera = true;
  let rumboFigura = mapa.inicioOido.rumbo;
  let fasePaso = 0;
  let amplitud = 0;
  const velPuerta = Math.PI / 2 / P.segAbrir;

  const actualizar = (estado: EstadoJuego, dtSeg: number): void => {
    const dt = Math.min(Math.max(dtSeg, 0), 0.1);

    for (const h of hojas) {
      const meta = estado.puertas[h.def.id] ? h.anguloAbierta : h.anguloCerrada;
      const actual = h.malla.rotation.y;
      if (actual === meta) continue;
      const paso = velPuerta * dt;
      const falta = meta - actual;
      h.malla.rotation.y = primera || Math.abs(falta) <= paso ? meta : actual + Math.sign(falta) * paso;
    }

    for (const [id, malla] of mallasObjeto) {
      malla.visible = !estado.inventario[id];
    }

    if (figura) {
      const F = A.figura;
      const dx = estado.oido.pos.x - figura.position.x;
      const dz = estado.oido.pos.z - figura.position.z;
      const dist = Math.hypot(dx, dz);
      if (primera || dist > F.saltoMaximo) {
        figura.position.x = estado.oido.pos.x;
        figura.position.z = estado.oido.pos.z;
        rumboFigura = estado.oido.rumbo;
      } else {
        const k = 1 - Math.exp(-F.seguimientoPos * dt);
        figura.position.x += dx * k;
        figura.position.z += dz * k;
        fasePaso += dist * k * Math.PI;
        const kr = 1 - Math.exp(-F.seguimientoRumbo * dt);
        rumboFigura += diferenciaRumbo(rumboFigura, estado.oido.rumbo) * kr;
      }
      figura.rotation.y = -rumboFigura * GRADOS;

      // Balanceo de piernas y brazos mientras avanza.
      const caminando = dist > 0.02 ? 1 : 0;
      amplitud += (caminando - amplitud) * (1 - Math.exp(-10 * dt));
      const giro = Math.sin(fasePaso) * F.balanceo * amplitud;
      if (piernaIzq && piernaDer && brazoIzq && brazoDer) {
        piernaIzq.rotation.x = giro;
        piernaDer.rotation.x = -giro;
        brazoIzq.rotation.x = -giro * 0.7;
        brazoDer.rotation.x = giro * 0.7;
      }
    }
    primera = false;
  };

  const destruir = (): void => {
    escena.clear();
    for (const g of geometrias) g.dispose();
    for (const m of materiales) m.dispose();
    for (const t of texturas) t.dispose();
    geometrias.length = 0;
    materiales.length = 0;
    texturas.length = 0;
    hojas.length = 0;
    mallasObjeto.clear();
  };

  return { escena, actualizar, destruir };
}
