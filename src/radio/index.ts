/**
 * Panel del RADIO de Vista (hito 4, DISENO.md §4 y §7.1): arma mensajes con señas de LSM, cuenta dedos
 * para los números, tiene respaldo de teclado y manda `radio/mensaje` por el bus. La voz NO suena aquí:
 * el audio de Oído la dice con VozRadio (docs/CONTRATOS.md §4, "el radio suena del lado de Oído").
 *
 * Uso (integración):
 *   const panel = crearPanelRadio(bus, divDelRadio, lsm);   // lsm: LsmEngine con cámara, o null
 *   // cada cuadro: panel.actualizar(dt)   ·   al salir: panel.destruir()
 */
import { CONFIG } from '../config';
import { CameraView } from '../lsm/core/CameraView';
import type { LsmEngine } from '../lsm/core/LsmEngine';
import type { Bus, Ficha, Sena, Sistema } from '../shared/contratos';
import { AJUSTES_RADIO } from './ajustes';
import { contarDedos } from './dedos';
import {
  Compositor,
  SENAS,
  VOCABULARIO,
  esNumeroPasos,
  esSena,
  etiquetaFicha,
  fichasATexto,
  type NumeroPasos,
} from './mensaje';
import { Sostenedor } from './sostener';
import { ESTILOS_RADIO } from './estilos';

export { fichasATexto, VOCABULARIO, Compositor, puedeAgregar } from './mensaje';
export { contarDedos } from './dedos';
export { crearVozSintetica } from './voz';

const AVISO_PRIVACIDAD = 'La cámara se procesa en tu equipo; no se graba ni se envía nada.';

interface EntradaHistorial {
  texto: string;
  emergencia: boolean;
}

/** Crea un elemento con clase (prefijo radio-) y, opcionalmente, texto. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, clase: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/** Cambia el texto solo si es distinto (evita tocar el DOM cada cuadro). */
function poner(e: HTMLElement, texto: string): void {
  if (e.textContent !== texto) e.textContent = texto;
}

function esCampoDeTexto(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}

/** 'Digit3' / 'Numpad3' → 3. */
function numeroDeTecla(code: string): number | null {
  const camaras = CONFIG.teclas.vista.camaras as readonly string[];
  const i = camaras.indexOf(code);
  if (i >= 0) return i + 1;
  const m = /^Numpad([1-5])$/.exec(code);
  return m ? Number(m[1]) : null;
}

/** 'KeyF' → 'F' (por posición física; con e.key de respaldo). */
function senaDeTecla(e: KeyboardEvent): Sena | null {
  const m = /^Key([A-Z])$/.exec(e.code);
  const letra = m ? m[1] : e.key.length === 1 ? e.key.toUpperCase() : '';
  return esSena(letra) ? letra : null;
}

export function crearPanelRadio(bus: Bus, contenedor: HTMLElement, lsm: LsmEngine | null): Sistema {
  const cfg = CONFIG.radio;
  const aj = AJUSTES_RADIO;

  // ───────────── Estado ─────────────
  const compositor = new Compositor(cfg.maxFichas);
  const letras = new Sostenedor<string>(cfg.msSostener);
  const dedos = new Sostenedor<number>(cfg.msSostener);
  let abierto = false;
  /** Modo número (solo con cámara): hasta cuándo se espera un número tras F o B. */
  let numeroHasta: number | null = null;
  let conteoVivo: number | null = null;
  let letraViva: string | null = null;
  let progresoVivo = 0;
  // Emergencia (S sostenida)
  let emergenciaUsada = false;
  let emergenciaListaEn = 0;
  let fichaSDeEstaSostenida = false;
  // Avisos
  let aviso: { texto: string; tipo: 'enviado' | 'emergencia'; hasta: number } | null = null;
  let pista: { texto: string; hasta: number } | null = null;
  const historial: EntradaHistorial[] = [];
  let versionFichas = 0;
  let versionDibujada = -1;
  let versionHistorial = 0;
  let historialDibujado = -1;

  const ahoraMs = () => performance.now();
  const hayCamara = () => !!lsm && lsm.cameraReady;
  const marcarAbierto = (v: boolean) => {
    document.body.dataset.radioAbierto = v ? '1' : '0';
  };

  // ───────────── DOM ─────────────
  const estilo = document.createElement('style');
  estilo.dataset.radio = '1';
  estilo.textContent = ESTILOS_RADIO;
  document.head.appendChild(estilo);

  const raiz = el('div', 'radio-panel radio-cerrado');
  const cabecera = el('div', 'radio-cabecera');
  const titulo = el('span', 'radio-titulo', 'RADIO · CANAL 1');
  const estado = el('span', 'radio-estado', 'CERRADO');
  cabecera.append(titulo, estado);

  const cuerpo = el('div', 'radio-cuerpo');

  // Vista previa de la cámara
  const previa = el('div', 'radio-previa');
  const previaCaja = el('div', 'radio-previa-caja');
  const previaMsg = el('div', 'radio-previa-msg');
  const previaLectura = el('div', 'radio-previa-lectura');
  const previaBarra = el('div', 'radio-barra');
  const previaBarraRelleno = el('div', 'radio-barra-relleno');
  previaBarra.appendChild(previaBarraRelleno);
  previa.append(previaCaja, previaMsg, previaLectura, previaBarra);

  let vistaCamara: CameraView | null = null;
  if (lsm) {
    vistaCamara = new CameraView(lsm.video, previaCaja);
    // CameraView se coloca con position: fixed sobre la página; aquí la metemos dentro del panel.
    Object.assign(vistaCamara.box.style, {
      position: 'absolute',
      inset: '0',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      border: 'none',
      borderRadius: '0',
      zIndex: 'auto',
      display: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
  }
  let frameDibujado: unknown = undefined;

  // Centro: fichas, frase, pista, historial
  const centro = el('div', 'radio-centro');
  const fichasEl = el('div', 'radio-fichas');
  const fraseEl = el('div', 'radio-frase');
  const pistaEl = el('div', 'radio-pista');
  const avisoEl = el('div', 'radio-aviso');
  const historialEl = el('div', 'radio-historial');
  centro.append(fichasEl, fraseEl, pistaEl, avisoEl, historialEl);

  // Chuleta del vocabulario
  const chuleta = el('div', 'radio-chuleta');
  for (const s of SENAS) {
    const v = VOCABULARIO[s];
    const fila = el('div', v.habilitada ? 'radio-chuleta-fila' : 'radio-chuleta-fila radio-deshabilitada');
    fila.append(el('b', 'radio-chuleta-letra', s), el('span', 'radio-chuleta-texto', v.habilitada ? v.espanol : `${v.espanol} (fase 2)`));
    chuleta.appendChild(fila);
  }
  const filaNum = el('div', 'radio-chuleta-fila');
  filaNum.append(el('b', 'radio-chuleta-letra', '1–5'), el('span', 'radio-chuleta-texto', 'dedos, tras F/B'));
  chuleta.appendChild(filaNum);

  cuerpo.append(previa, centro, chuleta);

  const pie = el('div', 'radio-pie');
  const pieTeclas = el('span', 'radio-pie-teclas', 'TAB detector · ⌫ borrar · ENTER enviar · S sostenida: emergencia');
  const piePrivacidad = el('span', 'radio-pie-privacidad', AVISO_PRIVACIDAD);
  pie.append(pieTeclas, piePrivacidad);

  raiz.append(cabecera, cuerpo, pie);
  contenedor.appendChild(raiz);

  // ───────────── Lógica ─────────────
  const mostrarPista = (texto: string, ms: number = aj.msPistaU) => {
    pista = { texto, hasta: ahoraMs() + ms };
  };

  const entrarModoNumero = (ahora: number) => {
    numeroHasta = ahora + aj.msEsperaNumero;
    // La forma de la mano con la que se hizo F (3 dedos) o B (4) no cuenta como número:
    // hay que cambiarla (o bajar la mano) y luego mostrar el número.
    const frame = lsm?.tracker.lastFrame ?? null;
    dedos.bloquear(frame ? contarDedos(frame) : null, ahora);
  };

  const salirModoNumero = (ahora: number) => {
    if (numeroHasta === null) return;
    numeroHasta = null;
    conteoVivo = null;
    dedos.reiniciar();
    // La forma actual (p. ej. el "1" se parece a la D) no se agrega como letra hasta soltarla.
    letras.bloquear(lsm?.last?.letter ?? null, ahora);
  };

  /** Agrega una ficha y ajusta el modo número. Devuelve si se agregó. */
  const agregarFicha = (ficha: Ficha, ahora: number): boolean => {
    if (!compositor.agregar(ficha)) {
      if (compositor.lleno) mostrarPista(`Mensaje lleno (máx. ${cfg.maxFichas} fichas): ENTER o ⌫`);
      else if (ficha.tipo === 'numero') mostrarPista('Un número solo va justo después de F o B');
      return false;
    }
    versionFichas++;
    if (ficha.tipo === 'sena' && compositor.esperaNumero && abierto && hayCamara()) entrarModoNumero(ahora);
    else salirModoNumero(ahora);
    return true;
  };

  const registrarHistorial = (texto: string, emergencia: boolean) => {
    historial.unshift({ texto, emergencia });
    historial.length = Math.min(historial.length, aj.historial);
    versionHistorial++;
  };

  const enviar = () => {
    const ahora = ahoraMs();
    if (compositor.vacio) {
      mostrarPista('No hay fichas que enviar', 1500);
      return;
    }
    const fichas = compositor.fichas;
    const texto = fichasATexto(fichas);
    bus.enviar('radio/mensaje', { fichas, texto, emergencia: false });
    registrarHistorial(texto, false);
    aviso = { texto: `ENVIADO: «${texto}»`, tipo: 'enviado', hasta: ahora + aj.msAvisoEnviado };
    compositor.limpiar();
    versionFichas++;
    salirModoNumero(ahora);
  };

  const enviarEmergencia = (ahora: number) => {
    const fichas: Ficha[] = [{ tipo: 'sena', sena: 'S' }];
    const texto = fichasATexto(fichas);
    bus.enviar('radio/mensaje', { fichas, texto, emergencia: true });
    registrarHistorial(texto, true);
    aviso = { texto: `EMERGENCIA: «${texto}»`, tipo: 'emergencia', hasta: ahora + aj.msAvisoEnviado };
  };

  const borrar = () => {
    const ahora = ahoraMs();
    if (!compositor.borrarUltima()) return;
    versionFichas++;
    salirModoNumero(ahora);
    // Si quedó F o B al final (se borró su número), se puede volver a mostrar el número.
    if (compositor.esperaNumero && abierto && hayCamara()) entrarModoNumero(ahora);
  };

  const abrir = (v: boolean) => {
    if (v === abierto) return;
    const ahora = ahoraMs();
    abierto = v;
    marcarAbierto(v);
    versionFichas++; // el texto de "mensaje vacío" cambia según el estado
    letras.reiniciar();
    dedos.reiniciar();
    emergenciaUsada = false;
    fichaSDeEstaSostenida = false;
    if (v) {
      lsm?.setMode(aj.modoDeteccion);
    } else {
      salirModoNumero(ahora);
      lsm?.setMode('off');
      conteoVivo = null;
      letraViva = null;
      vistaCamara?.clear();
      frameDibujado = undefined;
    }
  };

  /** Seña S sostenida CONFIG.radio.msEmergencia: se manda sola, sin tocar el mensaje en construcción. */
  const revisarEmergencia = (letra: string | null, msEstable: number, ahora: number) => {
    if (letra !== 'S') {
      emergenciaUsada = false;
      fichaSDeEstaSostenida = false;
      return;
    }
    if (emergenciaUsada || msEstable < cfg.msEmergencia || ahora < emergenciaListaEn) return;
    emergenciaUsada = true;
    emergenciaListaEn = ahora + aj.msEnfriamientoEmergencia;
    // La ficha S que esta misma sostenida agregó a los 300 ms se quita: el mensaje queda como estaba.
    if (fichaSDeEstaSostenida) {
      const f = compositor.fichas;
      const ultima = f[f.length - 1];
      if (ultima?.tipo === 'sena' && ultima.sena === 'S') {
        compositor.borrarUltima();
        versionFichas++;
      }
    }
    fichaSDeEstaSostenida = false;
    enviarEmergencia(ahora);
  };

  const leerCamara = (ahora: number) => {
    if (!lsm) return;
    const p = lsm.read(ahora);
    letraViva = p.letter;
    if (numeroHasta !== null) {
      // Modo número: las letras NO se agregan (el "2" se parece a la U/V, el "1" a la D…).
      letras.actualizar(p.letter, ahora, p.stableMs);
      letras.consumir();
      const frame = lsm.tracker.lastFrame;
      const n = frame ? contarDedos(frame) : null;
      conteoVivo = n;
      const confirmado = dedos.actualizar(n, ahora);
      progresoVivo = n !== null && n >= 1 ? dedos.progreso(ahora) : 0;
      if (confirmado !== null && esNumeroPasos(confirmado)) {
        agregarFicha({ tipo: 'numero', valor: confirmado as NumeroPasos }, ahora);
      }
    } else {
      progresoVivo = p.letter ? letras.progreso(ahora, p.stableMs) : 0;
      const confirmada = letras.actualizar(p.letter, ahora, p.stableMs);
      if (confirmada === 'U') {
        // La R y la U se confunden; la U está fuera del MVP. No se convierte sola en R (decisión pendiente).
        mostrarPista('Leí U (no entra en el MVP). ¿Quisiste R? Tecla R');
      } else if (confirmada && esSena(confirmada) && VOCABULARIO[confirmada].habilitada) {
        const ok = agregarFicha({ tipo: 'sena', sena: confirmada }, ahora);
        if (ok && confirmada === 'S') fichaSDeEstaSostenida = true;
      }
    }
    revisarEmergencia(p.letter, p.stableMs, ahora);
  };

  // ───────────── Teclado ─────────────
  const alPresionar = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // nunca Ctrl (AGENTS.md §2.1)
    if (esCampoDeTexto(e.target)) return;
    const t = CONFIG.teclas.vista;
    if (e.code === t.detector) {
      e.preventDefault();
      if (!e.repeat) abrir(!abierto);
      return;
    }
    // Borrar y enviar funcionan también con el detector cerrado si hay mensaje en construcción.
    if (e.code === t.borrar) {
      if (!abierto && compositor.vacio) return;
      e.preventDefault();
      borrar();
      return;
    }
    if (e.code === t.enviar) {
      if (!abierto && compositor.vacio) return;
      e.preventDefault();
      if (!e.repeat) enviar();
      return;
    }
    // Letras y números solo con el detector abierto (cerrado, los números cambian de cámara y la S no hace nada).
    if (!abierto || e.repeat) return;
    const ahora = ahoraMs();
    const n = numeroDeTecla(e.code);
    if (n !== null) {
      e.preventDefault();
      if (esNumeroPasos(n)) agregarFicha({ tipo: 'numero', valor: n }, ahora);
      return;
    }
    const s = senaDeTecla(e);
    if (!s) return;
    e.preventDefault();
    if (!VOCABULARIO[s].habilitada) {
      mostrarPista('La U (Sube) no entra en el MVP. ¿Quisiste R?');
      return;
    }
    agregarFicha({ tipo: 'sena', sena: s }, ahora);
  };
  window.addEventListener('keydown', alPresionar);

  // ───────────── Dibujo ─────────────
  const dibujarFichas = () => {
    if (versionDibujada === versionFichas) return;
    versionDibujada = versionFichas;
    fichasEl.replaceChildren();
    const lista = compositor.fichas;
    if (lista.length === 0) {
      fichasEl.appendChild(el('span', 'radio-vacio', abierto ? 'Haz una seña o teclea una letra…' : 'Sin mensaje · TAB para abrir el detector'));
    }
    for (const f of lista) {
      fichasEl.appendChild(el('span', f.tipo === 'numero' ? 'radio-ficha radio-ficha-numero' : 'radio-ficha', etiquetaFicha(f)));
    }
    poner(fraseEl, lista.length ? `» ${fichasATexto(lista)}` : '');
  };

  const dibujarHistorial = () => {
    if (historialDibujado === versionHistorial) return;
    historialDibujado = versionHistorial;
    historialEl.replaceChildren();
    for (const h of historial) {
      historialEl.appendChild(el('div', h.emergencia ? 'radio-hist radio-hist-emergencia' : 'radio-hist', `${h.emergencia ? '!' : '›'} ${h.texto}`));
    }
  };

  const textoEstado = (): { texto: string; clase: string } => {
    if (!abierto) return { texto: 'CERRADO', clase: 'radio-cerrado' };
    if (!hayCamara()) return { texto: 'SIN CÁMARA: USA EL TECLADO', clase: 'radio-sin-camara' };
    if (numeroHasta !== null) return { texto: `NÚMERO: ${conteoVivo ?? '—'}`, clase: 'radio-numero' };
    return { texto: 'ESCUCHANDO SEÑAS', clase: 'radio-escuchando' };
  };

  let claseActual = '';
  const dibujar = (ahora: number) => {
    const est = textoEstado();
    poner(estado, est.texto);
    const clase = `radio-panel ${est.clase}${aviso?.tipo === 'emergencia' ? ' radio-alerta' : ''}`;
    if (clase !== claseActual) {
      raiz.className = clase;
      claseActual = clase;
    }
    dibujarFichas();
    dibujarHistorial();

    // Pista y aviso temporales
    if (pista && ahora > pista.hasta) pista = null;
    if (aviso && ahora > aviso.hasta) aviso = null;
    let textoPista = pista?.texto ?? '';
    if (!textoPista && abierto && compositor.esperaNumero) {
      textoPista =
        numeroHasta !== null
          ? `Muestra 1–5 dedos (${Math.max(0, Math.ceil((numeroHasta - ahora) / 1000))} s) o teclea 1–5`
          : 'Teclea 1–5 para los pasos (opcional)';
    }
    poner(pistaEl, textoPista);
    poner(avisoEl, aviso?.texto ?? '');
    avisoEl.className = aviso ? `radio-aviso radio-aviso-${aviso.tipo}` : 'radio-aviso';

    // Vista previa
    const camara = abierto && hayCamara();
    if (vistaCamara) {
      const disp = camara ? 'block' : 'none';
      if (vistaCamara.box.style.display !== disp) vistaCamara.box.style.display = disp;
      if (camara) {
        const frame = lsm!.tracker.lastFrame;
        if (frame !== frameDibujado) {
          frameDibujado = frame;
          vistaCamara.drawLandmarks(frame, numeroHasta !== null ? '#ffb000' : '#33ff66');
        }
      }
    }
    let msg = '';
    if (!abierto) msg = 'DETECTOR CERRADO\nTAB PARA ABRIR';
    else if (!lsm) msg = 'SIN CÁMARA\nteclea F B L R D S A y 1–5';
    else if (!lsm.cameraReady) {
      msg = lsm.status === 'cargando' ? 'CARGANDO CÁMARA…' : `SIN CÁMARA${lsm.errorReason ? `\n(${lsm.errorReason})` : ''}`;
    } else if (!lsm.tracker.lastFrame) msg = 'SIN MANO A LA VISTA';
    poner(previaMsg, msg);
    let lectura = '';
    if (camara) {
      if (numeroHasta !== null) lectura = conteoVivo !== null ? `DEDOS ${conteoVivo}` : '';
      else if (letraViva) lectura = `LEO ${letraViva}${esSena(letraViva) ? '' : ' (no es del radio)'}`;
    }
    poner(previaLectura, lectura);
    previaBarraRelleno.style.width = `${Math.round((camara ? progresoVivo : 0) * 100)}%`;
  };

  // Estado inicial
  marcarAbierto(false);
  lsm?.setMode('off');
  dibujar(ahoraMs());

  return {
    actualizar(_dtSeg: number): void {
      const ahora = ahoraMs();
      if (abierto && hayCamara()) leerCamara(ahora);
      else {
        letraViva = null;
        conteoVivo = null;
        progresoVivo = 0;
      }
      // Sin número a tiempo: F o B se quedan sin número y se vuelve al modo letras.
      if (numeroHasta !== null && (ahora > numeroHasta || !hayCamara())) salirModoNumero(ahora);
      dibujar(ahora);
    },
    destruir(): void {
      window.removeEventListener('keydown', alPresionar);
      lsm?.setMode('off');
      abierto = false;
      marcarAbierto(false);
      if (vistaCamara && lsm) {
        vistaCamara.destroy();
        // Al sacar el <video> del documento el navegador lo pausa: se reanuda para quien siga usando el motor.
        if (lsm.video.srcObject) void lsm.video.play().catch(() => undefined);
      }
      raiz.remove();
      estilo.remove();
    },
  };
}
