/**
 * Cliente de Vista (docs/CONTRATOS.md §4): la caseta de vigilancia.
 * Cámara activa en grande con filtro VHS, miniaturas de todas las cámaras, mapa 2D, HUD y el
 * hueco `#panel-radio` donde la integración monta el panel del radio.
 *
 * Vista NO ve al monstruo (DISENO.md §5.2 y §7.1): ninguna malla lo representa. Solo se nota
 * porque la cámara del cuarto donde está parpadea y mete estática (congelada en 'escucha').
 *
 * Un solo lienzo WebGL: cada cámara se dibuja a un render target pequeño y un plano por
 * recuadro lo pasa a la pantalla con el shader VHS. Las miniaturas se redibujan por turnos.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import { construirMundo, copiarEstado, estadoInicial } from '../mundo3d';
import type { Bus, CamaraDef, Mapa, Sistema } from '../shared/contratos';
import { AJUSTES_VISTA as A } from './ajustes';
import { ESTILOS_VISTA } from './estilos';
import { crearRecuadro, type Recuadro } from './filtroVhs';
import { crearHud } from './hud';
import { crearMapa2D } from './mapa2d';

export interface ClienteVista extends Sistema {
  /** El contenedor vacío `#panel-radio`, para que la integración monte ahí el panel del radio. */
  panelRadio: HTMLElement;
}

function div(clase: string, texto = ''): HTMLDivElement {
  const el = document.createElement('div');
  el.className = clase;
  if (texto) el.textContent = texto;
  return el;
}

function dosDigitos(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function crearClienteVista(bus: Bus, contenedor: HTMLElement, mapa: Mapa): ClienteVista {
  const T = CONFIG.teclas.vista;
  const camaras = mapa.camaras;
  const n = camaras.length;

  // ───────────────────────── Estado local (copia del último sim/estado) ─────────────────────────
  const estado = estadoInicial(mapa);
  /** true = hay que repintar el mapa y el HUD. */
  let sucio = true;

  // ───────────────────────── Estructura de la pantalla ─────────────────────────
  const raiz = div('dmv-raiz');
  const estilos = document.createElement('style');
  estilos.textContent = ESTILOS_VISTA;
  raiz.appendChild(estilos);

  const zonaCamaras = div('dmv-camaras');
  const osd = div('dmv-osd');
  const rec = div('dmv-rec', 'REC');
  rec.appendChild(document.createElement('i'));
  const nombreCamara = div('dmv-nombre');
  const fecha = div('dmv-fecha');
  const interferencia = div('dmv-interferencia', 'INTERFERENCIA');
  const fin = div('dmv-fin');
  osd.append(rec, nombreCamara, fecha, interferencia, fin);
  const zonaMinis = div('dmv-minis');
  const marcosMini: HTMLDivElement[] = camaras.map((c, i) => {
    const m = div('dmv-mini');
    m.style.top = `${(i / n) * 100}%`;
    m.style.height = `${100 / n}%`;
    const num = document.createElement('span');
    num.textContent = String(c.numero);
    m.appendChild(num);
    zonaMinis.appendChild(m);
    return m;
  });

  const inferior = div('dmv-inferior');
  const info = div('dmv-info');
  const cajaMapa = div('dmv-mapa');
  const mapa2d = crearMapa2D(mapa);
  cajaMapa.appendChild(mapa2d.lienzo);
  const hud = crearHud(mapa);
  info.append(cajaMapa, hud.raiz);
  const panelRadio = document.createElement('div');
  panelRadio.id = 'panel-radio';
  inferior.append(info, panelRadio);

  raiz.append(zonaCamaras, inferior);
  contenedor.appendChild(raiz);

  // ───────────────────────── Escena de las cámaras ─────────────────────────
  const mundo = construirMundo(mapa, { mostrarOido: true });
  const escena = mundo.escena;
  escena.background = new THREE.Color(A.luz.colorFondo);
  escena.fog = new THREE.Fog(A.luz.colorFondo, A.luz.nieblaCerca, A.luz.nieblaLejos);
  escena.add(new THREE.AmbientLight(A.luz.colorAmbiente, A.luz.ambiente));
  const sol = new THREE.DirectionalLight(0xffffff, A.luz.direccional);
  sol.position.set(0.4, 1, 0.7);
  escena.add(sol);

  const camPrincipal = new THREE.PerspectiveCamera(A.camara.fov, 4 / 3, 0.1, A.camara.lejos);
  const camMini = new THREE.PerspectiveCamera(A.camara.fov, A.miniaturas.aspecto, 0.1, A.camara.lejos);
  const apuntar = (cam: THREE.PerspectiveCamera, def: CamaraDef): void => {
    cam.position.set(def.pos.x, def.pos.y, def.pos.z);
    cam.lookAt(def.mira.x, def.mira.y, def.mira.z);
  };

  // ───────────────────────── Render y postproceso ─────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(1);
  const lienzo = renderer.domElement;
  lienzo.className = 'dmv-lienzo';
  zonaCamaras.append(lienzo, osd, zonaMinis);

  const opcionesRT = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true };
  const rtPrincipal = new THREE.WebGLRenderTarget(4, 4, opcionesRT);
  const rtMinis = camaras.map(() => new THREE.WebGLRenderTarget(4, 4, opcionesRT));

  const escenaPantalla = new THREE.Scene();
  const camPantalla = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const plano = new THREE.PlaneGeometry(2, 2);
  const recPrincipal: Recuadro = crearRecuadro(plano, 0.13, 1);
  recPrincipal.ponerImagen(rtPrincipal.texture);
  escenaPantalla.add(recPrincipal.malla);
  const recMinis: Recuadro[] = camaras.map((_c, i) => {
    const r = crearRecuadro(plano, 1.7 + i * 2.3, 0.5);
    r.ponerImagen(rtMinis[i]!.texture);
    escenaPantalla.add(r.malla);
    return r;
  });

  /** true = el render target grande todavía no tiene la imagen de la cámara activa. */
  let forzarPrincipal = true;
  /** Miniaturas que faltan por dibujar al menos una vez. */
  let minisPendientes = n;

  const ajustarTamano = (): void => {
    const anchoCss = Math.max(1, zonaCamaras.clientWidth);
    const altoCss = Math.max(1, zonaCamaras.clientHeight);
    const H = CONFIG.render.altoInterno;
    const W = Math.max(8, Math.round((H * anchoCss) / altoCss));
    const altoMini = H / Math.max(1, n);
    const anchoMini = Math.min(Math.round(altoMini * A.miniaturas.aspecto), Math.floor(W / 3));
    const anchoPrincipal = W - anchoMini;

    renderer.setSize(W, H, false);
    rtPrincipal.setSize(anchoPrincipal, H);
    camPrincipal.aspect = anchoPrincipal / H;
    camPrincipal.updateProjectionMatrix();
    recPrincipal.colocar(0, 0, anchoPrincipal, H, W, H);

    const altoRT = Math.max(2, Math.round(altoMini));
    camMini.aspect = anchoMini / altoRT;
    camMini.updateProjectionMatrix();
    for (let i = 0; i < n; i++) {
      rtMinis[i]!.setSize(Math.max(2, anchoMini), altoRT);
      recMinis[i]!.colocar(anchoPrincipal + 1, i * altoMini + 1, anchoMini - 2, altoMini - 2, W, H);
    }

    const porcentaje = (anchoPrincipal / W) * 100;
    osd.style.width = `${porcentaje}%`;
    zonaMinis.style.left = `${porcentaje}%`;

    forzarPrincipal = true;
    minisPendientes = n;
    mapa2d.redimensionar();
    sucio = true;
  };
  const observador = new ResizeObserver(ajustarTamano);
  observador.observe(contenedor);
  ajustarTamano();

  // ───────────────────────── Estática por cámara ─────────────────────────
  const estatica = new Float32Array(n);
  const brillo = new Float32Array(n).fill(1);
  let segParpadeo = 0;
  let golpeCambio = 0;
  let indiceActiva = -1;
  let turnoMini = 0;
  let segMinis = 0;
  let tiempo = 0;
  let segundoMostrado = -1;
  let interferenciaVisible = false;
  let textoFin = '';

  const monstruoEn = (def: CamaraDef): boolean =>
    estado.fase === 'jugando' && def.cuartoId === estado.monstruo.cuartoId;

  /** Estática que le toca a la cámara (0 a 1) según dónde y cómo está el monstruo. */
  const estaticaObjetivo = (def: CamaraDef): number => {
    if (estado.fase === 'perdieron') return A.estatica.perdieron;
    if (!monstruoEn(def)) return 0;
    return A.estatica[estado.monstruo.estado];
  };

  /** En 'escucha' la cámara del monstruo se queda con la última imagen. */
  const congelada = (def: CamaraDef): boolean => monstruoEn(def) && estado.monstruo.estado === 'escucha';

  const buscarActiva = (): number => {
    for (let i = 0; i < n; i++) {
      if (camaras[i]!.numero === estado.camaraActiva) return i;
    }
    return 0;
  };

  const mostrarFin = (): void => {
    const texto =
      estado.fase === 'ganaron' ? A.textoGanaron : estado.fase === 'perdieron' ? A.textoPerdieron : '';
    if (texto === textoFin) return;
    textoFin = texto;
    fin.textContent = texto;
    fin.style.display = texto ? 'flex' : 'none';
  };

  // ───────────────────────── Bus ─────────────────────────
  const bajas: Array<() => void> = [
    bus.escuchar('sim/estado', (e) => {
      copiarEstado(estado, e);
      sucio = true;
    }),
    // Los hechos se aplican de una vez a la copia local; el siguiente sim/estado los confirma.
    bus.escuchar('sim/puerta', (p) => {
      estado.puertas[p.id] = p.abierta;
      hud.destellarPuerta();
      sucio = true;
    }),
    bus.escuchar('sim/objeto', (o) => {
      estado.inventario[o.id] = true;
      sucio = true;
    }),
    bus.escuchar('sim/monstruoEstado', (m) => {
      estado.monstruo.estado = m.estado;
    }),
    bus.escuchar('sim/fin', (f) => {
      estado.fase = f.resultado;
      sucio = true;
    }),
  ];

  // ───────────────────────── Teclado ─────────────────────────
  const teclasCamara: readonly string[] = T.camaras;

  const alBajarTecla = (e: KeyboardEvent): void => {
    // Con el detector de señas abierto, letras y números son del panel del radio.
    if (document.body.dataset['radioAbierto'] === '1') return;
    if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
    const blanco = e.target;
    if (blanco instanceof HTMLInputElement || blanco instanceof HTMLTextAreaElement) return;
    const i = teclasCamara.indexOf(e.code);
    if (i >= 0) {
      e.preventDefault();
      bus.enviar('vista/camara', { numero: i + 1 });
      return;
    }
    if (e.code === T.puerta) {
      e.preventDefault();
      bus.enviar('vista/puerta', {});
    }
  };
  window.addEventListener('keydown', alBajarTecla);

  // ───────────────────────── Ciclo ─────────────────────────
  const dibujarCamara = (def: CamaraDef, cam: THREE.PerspectiveCamera, destino: THREE.WebGLRenderTarget): void => {
    apuntar(cam, def);
    renderer.setRenderTarget(destino);
    renderer.render(escena, cam);
  };

  const actualizar = (dtSeg: number): void => {
    const dt = Math.min(Math.max(dtSeg, 0), 0.1);
    tiempo += dt;
    if (n === 0) return;

    mundo.actualizar(estado, dt);

    // — Cámara activa —
    const activa = buscarActiva();
    if (activa !== indiceActiva) {
      if (indiceActiva >= 0) golpeCambio = A.estatica.alCambiar;
      indiceActiva = activa;
      forzarPrincipal = true;
      nombreCamara.textContent = camaras[activa]!.nombre;
      for (let i = 0; i < n; i++) marcosMini[i]!.classList.toggle('dmv-activa', i === activa);
      sucio = true;
    }
    if (golpeCambio > 0) golpeCambio = Math.max(0, golpeCambio - (A.estatica.alCambiar * dt) / A.estatica.segAlCambiar);

    // — Estática y parpadeo —
    segParpadeo += dt;
    const tocaParpadeo = segParpadeo >= A.estatica.segParpadeo;
    if (tocaParpadeo) segParpadeo = 0;
    const k = 1 - Math.exp(-A.estatica.seguimiento * dt);
    for (let i = 0; i < n; i++) {
      const def = camaras[i]!;
      estatica[i]! += (estaticaObjetivo(def) - estatica[i]!) * k;
      if (!monstruoEn(def)) {
        brillo[i] = 1;
      } else if (tocaParpadeo) {
        const caza = estado.monstruo.estado === 'caza' || estado.monstruo.estado === 'atrapa';
        const prob = caza ? A.estatica.probParpadeoCaza : A.estatica.probParpadeoPatrulla;
        brillo[i] = Math.random() < prob ? 0.3 + Math.random() * 0.45 : 1;
      }
    }

    // — Imagen grande (se salta si está congelada y ya tiene la imagen de esta cámara) —
    const defActiva = camaras[activa]!;
    if (forzarPrincipal || !congelada(defActiva)) {
      dibujarCamara(defActiva, camPrincipal, rtPrincipal);
      forzarPrincipal = false;
    }

    // — Miniaturas: una por turno —
    segMinis += dt;
    if (minisPendientes > 0 || segMinis >= A.miniaturas.segEntreRefrescos) {
      segMinis = 0;
      for (let intento = 0; intento < n; intento++) {
        const i = turnoMini;
        turnoMini = (turnoMini + 1) % n;
        if (minisPendientes === 0 && congelada(camaras[i]!)) continue;
        dibujarCamara(camaras[i]!, camMini, rtMinis[i]!);
        if (minisPendientes > 0) minisPendientes--;
        break;
      }
    }

    // — Composición con el filtro VHS —
    recPrincipal.animar(tiempo, Math.min(1, estatica[activa]! + golpeCambio), brillo[activa]!);
    for (let i = 0; i < n; i++) recMinis[i]!.animar(tiempo, estatica[i]!, brillo[i]!);
    renderer.setRenderTarget(null);
    renderer.render(escenaPantalla, camPantalla);

    // — Textos y mapa (solo cuando algo cambió) —
    const hayInterferencia = estaticaObjetivo(defActiva) > 0 && estado.fase === 'jugando';
    if (hayInterferencia !== interferenciaVisible) {
      interferenciaVisible = hayInterferencia;
      interferencia.style.display = hayInterferencia ? 'block' : 'none';
    }
    const segundo = Math.floor(A.reloj.inicioSeg + estado.t);
    if (segundo !== segundoMostrado) {
      segundoMostrado = segundo;
      const h = Math.floor(segundo / 3600) % 24;
      const m = Math.floor(segundo / 60) % 60;
      fecha.textContent = `${A.reloj.fecha}  ${dosDigitos(h)}:${dosDigitos(m)}:${dosDigitos(segundo % 60)}`;
    }
    if (sucio) {
      sucio = false;
      hud.actualizar(estado);
      mapa2d.dibujar(estado);
      mostrarFin();
    }
  };

  const destruir = (): void => {
    for (const baja of bajas) baja();
    bajas.length = 0;
    observador.disconnect();
    window.removeEventListener('keydown', alBajarTecla);
    mundo.destruir();
    mapa2d.destruir();
    rtPrincipal.dispose();
    for (const rt of rtMinis) rt.dispose();
    recPrincipal.material.dispose();
    for (const r of recMinis) r.material.dispose();
    plano.dispose();
    renderer.dispose();
    raiz.remove();
  };

  return { actualizar, destruir, panelRadio };
}
