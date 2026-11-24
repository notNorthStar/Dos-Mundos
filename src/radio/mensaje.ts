/**
 * Vocabulario del radio y composición de mensajes (DISENO.md §4.2). Lógica pura: sin DOM.
 * Lo usan el panel del radio (src/radio/index.ts) y las pruebas (test/radio/mensaje.test.ts).
 */
import { CONFIG } from '../config';
import type { Ficha, Sena } from '../shared/contratos';

export type NumeroPasos = 1 | 2 | 3 | 4 | 5;

export interface EntradaVocabulario {
  sena: Sena;
  ingles: string;
  espanol: string;
  /** Texto de la ficha en pantalla, p. ej. "F · Forward · Al frente". */
  etiqueta: string;
  /** Lo que dice el radio con la seña sola. */
  frase: string;
  /** Si acepta un número después ("Avanza" + "dos pasos"), el verbo que se usa con él. */
  verboConNumero: string | null;
  /** false = existe en el tipo pero no entra en el MVP (no se puede agregar). */
  habilitada: boolean;
}

function entrada(
  sena: Sena,
  ingles: string,
  espanol: string,
  frase: string,
  verboConNumero: string | null = null,
  habilitada = true,
): EntradaVocabulario {
  return { sena, ingles, espanol, etiqueta: `${sena} · ${ingles} · ${espanol}`, frase, verboConNumero, habilitada };
}

/** Vocabulario del radio. El orden es el de la chuleta en pantalla. */
export const VOCABULARIO: Readonly<Record<Sena, EntradaVocabulario>> = {
  F: entrada('F', 'Forward', 'Al frente', 'Avanza', 'Avanza'),
  B: entrada('B', 'Back', 'Atrás', 'Date la vuelta', 'Retrocede'),
  L: entrada('L', 'Left', 'Izquierda', 'Gira a la izquierda'),
  R: entrada('R', 'Right', 'Derecha', 'Gira a la derecha'),
  // La U (escaleras) no entra en el MVP (DISENO.md §9): se conserva para la fase 2.
  U: entrada('U', 'Up', 'Arriba', 'Sube', null, false),
  D: entrada('D', 'Down', 'Abajo', 'Agáchate, está en el piso'),
  // Con coma, no con punto: el punto seguido de espacio es SEPARADOR_ORDENES y partiría la orden en dos.
  S: entrada('S', 'Stop', 'Quieto', 'Quieto, no hagas ruido'),
  A: entrada('A', 'Grab', 'Agarra', 'Ahí está, agárralo'),
};

/** Señas en el orden de la chuleta. */
export const SENAS: readonly Sena[] = ['F', 'B', 'L', 'R', 'U', 'D', 'S', 'A'];

/** Señas que se pueden agregar en el MVP. */
export const SENAS_HABILITADAS: readonly Sena[] = SENAS.filter((s) => VOCABULARIO[s].habilitada);

const PALABRAS_NUMERO: Record<NumeroPasos, string> = { 1: 'uno', 2: 'dos', 3: 'tres', 4: 'cuatro', 5: 'cinco' };

export function esSena(valor: string): valor is Sena {
  return Object.prototype.hasOwnProperty.call(VOCABULARIO, valor);
}

export function esNumeroPasos(valor: number): valor is NumeroPasos {
  return Number.isInteger(valor) && valor >= 1 && valor <= 5;
}

/** "un paso", "dos pasos"… (con apócope en singular). */
export function pasosEnPalabras(n: NumeroPasos): string {
  return n === 1 ? 'un paso' : `${PALABRAS_NUMERO[n]} pasos`;
}

/** Número en palabras: "uno"… "cinco". */
export function numeroEnPalabras(n: NumeroPasos): string {
  return PALABRAS_NUMERO[n];
}

const capitalizar = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/** Texto de una ficha en pantalla: "L · Left · Izquierda" o "2 · dos pasos". */
export function etiquetaFicha(ficha: Ficha): string {
  return ficha.tipo === 'sena' ? VOCABULARIO[ficha.sena].etiqueta : `${ficha.valor} · ${pasosEnPalabras(ficha.valor)}`;
}

/** Separador entre órdenes: una pausa clara para la voz. */
export const SEPARADOR_ORDENES = '. ';

/**
 * Frase que dirá la voz del radio.
 *   [F]            → "Avanza"
 *   [F, 2]         → "Avanza dos pasos"
 *   [B, 1]         → "Retrocede un paso"
 *   [L, L, F, 2]   → "Gira a la izquierda. Gira a la izquierda. Avanza dos pasos"
 * Un número suelto (no debería pasar: `puedeAgregar` lo impide) se dice solo: "Dos pasos".
 */
export function fichasATexto(fichas: readonly Ficha[]): string {
  const ordenes: string[] = [];
  for (let i = 0; i < fichas.length; i++) {
    const f = fichas[i];
    if (f.tipo === 'numero') {
      if (esNumeroPasos(f.valor)) ordenes.push(capitalizar(pasosEnPalabras(f.valor)));
      continue;
    }
    const v = VOCABULARIO[f.sena];
    if (!v) continue;
    const sig = fichas[i + 1];
    if (v.verboConNumero && sig?.tipo === 'numero' && esNumeroPasos(sig.valor)) {
      ordenes.push(`${v.verboConNumero} ${pasosEnPalabras(sig.valor)}`);
      i++;
    } else {
      ordenes.push(v.frase);
    }
  }
  return ordenes.join(SEPARADOR_ORDENES);
}

/**
 * Todas las órdenes sueltas que `fichasATexto` puede producir (sin `SEPARADOR_ORDENES`): cada seña
 * sola (también la U, por si se habilita), F y B con 1–5 pasos y los números sueltos. Es la lista de
 * clips que necesita la voz grabada (src/radio/vozGrabada.ts, tools/generar-voces.mjs).
 */
export function frasesDelRadio(): string[] {
  const frases: string[] = [];
  const agregar = (fichas: Ficha[]) => {
    const t = fichasATexto(fichas);
    if (t && !frases.includes(t)) frases.push(t);
  };
  const numeros: NumeroPasos[] = [1, 2, 3, 4, 5];
  for (const sena of SENAS) {
    agregar([{ tipo: 'sena', sena }]);
    if (VOCABULARIO[sena].verboConNumero) {
      for (const valor of numeros) agregar([{ tipo: 'sena', sena }, { tipo: 'numero', valor }]);
    }
  }
  for (const valor of numeros) agregar([{ tipo: 'numero', valor }]);
  return frases;
}

/** true si la última ficha es una seña que acepta número (F o B). */
export function aceptaNumeroDespues(fichas: readonly Ficha[]): boolean {
  const ultima = fichas[fichas.length - 1];
  if (ultima?.tipo !== 'sena' || !esSena(ultima.sena)) return false;
  return VOCABULARIO[ultima.sena].verboConNumero !== null;
}

/**
 * ¿Se puede agregar `ficha` al mensaje?
 *  - nunca más de `max` fichas (CONFIG.radio.maxFichas);
 *  - una seña deshabilitada en el MVP (U) no entra;
 *  - un número (1–5) solo justo después de F o B.
 */
export function puedeAgregar(fichas: readonly Ficha[], ficha: Ficha, max: number = CONFIG.radio.maxFichas): boolean {
  if (fichas.length >= max) return false;
  if (ficha.tipo === 'sena') return esSena(ficha.sena) && VOCABULARIO[ficha.sena].habilitada;
  return esNumeroPasos(ficha.valor) && aceptaNumeroDespues(fichas);
}

/** Mensaje en construcción (sin DOM). */
export class Compositor {
  private lista: Ficha[] = [];

  constructor(private readonly max: number = CONFIG.radio.maxFichas) {}

  /** Copia de las fichas actuales (JSON plano, listo para el bus). */
  get fichas(): Ficha[] {
    return this.lista.map((f) => ({ ...f }));
  }

  get cantidad(): number {
    return this.lista.length;
  }

  get vacio(): boolean {
    return this.lista.length === 0;
  }

  get lleno(): boolean {
    return this.lista.length >= this.max;
  }

  /** Frase que dirá la voz con el mensaje actual. */
  get texto(): string {
    return fichasATexto(this.lista);
  }

  /** true si la última ficha es F o B y todavía cabe un número. */
  get esperaNumero(): boolean {
    return !this.lleno && aceptaNumeroDespues(this.lista);
  }

  puedeAgregar(ficha: Ficha): boolean {
    return puedeAgregar(this.lista, ficha, this.max);
  }

  /** Agrega la ficha si es válida. Devuelve si se agregó. */
  agregar(ficha: Ficha): boolean {
    if (!this.puedeAgregar(ficha)) return false;
    this.lista.push({ ...ficha });
    return true;
  }

  /** Quita la última ficha y la devuelve (null si no había). */
  borrarUltima(): Ficha | null {
    return this.lista.pop() ?? null;
  }

  limpiar(): void {
    this.lista = [];
  }
}
