import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config';
import type { Ficha, Sena } from '../../src/shared/contratos';
import {
  Compositor,
  SENAS_HABILITADAS,
  SEPARADOR_ORDENES,
  VOCABULARIO,
  etiquetaFicha,
  fichasATexto,
  frasesDelRadio,
  puedeAgregar,
} from '../../src/radio/mensaje';
import { Sostenedor } from '../../src/radio/sostener';

const s = (sena: Sena): Ficha => ({ tipo: 'sena', sena });
const n = (valor: 1 | 2 | 3 | 4 | 5): Ficha => ({ tipo: 'numero', valor });

describe('VOCABULARIO', () => {
  it('tiene las 8 señas del tipo con etiqueta en inglés y español', () => {
    expect(Object.keys(VOCABULARIO).sort()).toEqual(['A', 'B', 'D', 'F', 'L', 'R', 'S', 'U']);
    expect(VOCABULARIO.F.etiqueta).toBe('F · Forward · Al frente');
    expect(VOCABULARIO.L.etiqueta).toBe('L · Left · Izquierda');
  });

  it('la U existe pero está deshabilitada en el MVP', () => {
    expect(VOCABULARIO.U.habilitada).toBe(false);
    expect(SENAS_HABILITADAS).toEqual(['F', 'B', 'L', 'R', 'D', 'S', 'A']);
  });
});

describe('fichasATexto', () => {
  it.each([
    [[s('F')], 'Avanza'],
    [[s('F'), n(1)], 'Avanza un paso'],
    [[s('F'), n(3)], 'Avanza tres pasos'],
    [[s('B')], 'Date la vuelta'],
    [[s('B'), n(2)], 'Retrocede dos pasos'],
    [[s('B'), n(1)], 'Retrocede un paso'],
    [[s('L')], 'Gira a la izquierda'],
    [[s('R')], 'Gira a la derecha'],
    [[s('D')], 'Agáchate, está en el piso'],
    [[s('S')], 'Quieto, no hagas ruido'],
    [[s('A')], 'Ahí está, agárralo'],
    [[s('F'), n(5)], 'Avanza cinco pasos'],
    [[s('F'), n(4)], 'Avanza cuatro pasos'],
  ] as Array<[Ficha[], string]>)('%j → %s', (fichas, texto) => {
    expect(fichasATexto(fichas)).toBe(texto);
  });

  it('une varias órdenes con una pausa', () => {
    expect(fichasATexto([s('L'), s('L'), s('F'), n(2)])).toBe('Gira a la izquierda. Gira a la izquierda. Avanza dos pasos');
    expect(fichasATexto([s('R'), s('F'), s('D'), s('A')])).toBe('Gira a la derecha. Avanza. Agáchate, está en el piso. Ahí está, agárralo');
    expect(fichasATexto([s('F'), n(2), s('B')])).toBe('Avanza dos pasos. Date la vuelta');
  });

  it('mensaje vacío → texto vacío', () => {
    expect(fichasATexto([])).toBe('');
  });

  it('un número suelto (no debería llegar) se dice solo', () => {
    expect(fichasATexto([s('L'), n(2)])).toBe('Gira a la izquierda. Dos pasos');
    expect(fichasATexto([n(1)])).toBe('Un paso');
  });

  it('ninguna orden suelta contiene el separador', () => {
    for (const f of frasesDelRadio()) expect(f.includes(SEPARADOR_ORDENES)).toBe(false);
  });
});

describe('frasesDelRadio', () => {
  const frases = frasesDelRadio();

  it('tiene cada seña sola, F y B con 1–5 pasos y los números sueltos (23 frases, sin repetir)', () => {
    expect(frases).toHaveLength(8 + 2 * 5 + 5);
    expect(new Set(frases).size).toBe(frases.length);
    for (const sena of Object.keys(VOCABULARIO) as Sena[]) expect(frases).toContain(fichasATexto([s(sena)]));
    for (const v of [1, 2, 3, 4, 5] as const) {
      expect(frases).toContain(fichasATexto([s('F'), n(v)]));
      expect(frases).toContain(fichasATexto([s('B'), n(v)]));
      expect(frases).toContain(fichasATexto([n(v)]));
    }
    expect(frases).toContain('Quieto, no hagas ruido');
    expect(frases).toContain('Retrocede un paso');
    expect(frases).toContain('Cinco pasos');
  });

  it('cualquier mensaje se parte en órdenes que están en la lista', () => {
    const mensajes: Ficha[][] = [
      [s('L'), s('L'), s('F'), n(2)],
      [s('R'), s('F'), s('D'), s('A')],
      [s('S')],
      [s('B'), n(5), s('B'), s('L'), n(3)],
    ];
    for (const m of mensajes) {
      for (const orden of fichasATexto(m).split(SEPARADOR_ORDENES)) expect(frases).toContain(orden);
    }
  });
});

describe('puedeAgregar', () => {
  it('acepta señas habilitadas y rechaza la U', () => {
    for (const sena of SENAS_HABILITADAS) expect(puedeAgregar([], s(sena))).toBe(true);
    expect(puedeAgregar([], s('U'))).toBe(false);
  });

  it('un número solo justo después de F o B', () => {
    expect(puedeAgregar([], n(2))).toBe(false);
    expect(puedeAgregar([s('F')], n(2))).toBe(true);
    expect(puedeAgregar([s('B')], n(5))).toBe(true);
    expect(puedeAgregar([s('L')], n(2))).toBe(false);
    expect(puedeAgregar([s('F'), n(2)], n(3))).toBe(false);
    expect(puedeAgregar([s('F'), s('L')], n(1))).toBe(false);
  });

  it('rechaza números fuera de 1–5', () => {
    expect(puedeAgregar([s('F')], { tipo: 'numero', valor: 0 as never })).toBe(false);
    expect(puedeAgregar([s('F')], { tipo: 'numero', valor: 6 as never })).toBe(false);
  });

  it(`máximo CONFIG.radio.maxFichas (${CONFIG.radio.maxFichas})`, () => {
    const llenas = Array.from({ length: CONFIG.radio.maxFichas }, () => s('L'));
    expect(puedeAgregar(llenas, s('R'))).toBe(false);
    expect(puedeAgregar(llenas.slice(1), s('R'))).toBe(true);
    const casi = [...llenas.slice(1, -1), s('F')];
    expect(casi.length).toBe(CONFIG.radio.maxFichas - 1);
    expect(puedeAgregar(casi, n(2))).toBe(true);
  });
});

describe('Compositor', () => {
  it('arma, borra y limpia un mensaje', () => {
    const c = new Compositor();
    expect(c.vacio).toBe(true);
    expect(c.agregar(s('L'))).toBe(true);
    expect(c.agregar(s('F'))).toBe(true);
    expect(c.esperaNumero).toBe(true);
    expect(c.agregar(n(2))).toBe(true);
    expect(c.esperaNumero).toBe(false);
    expect(c.texto).toBe('Gira a la izquierda. Avanza dos pasos');
    expect(c.fichas).toEqual([s('L'), s('F'), n(2)]);

    expect(c.borrarUltima()).toEqual(n(2));
    expect(c.esperaNumero).toBe(true);
    expect(c.texto).toBe('Gira a la izquierda. Avanza');
    c.limpiar();
    expect(c.fichas).toEqual([]);
    expect(c.borrarUltima()).toBeNull();
  });

  it('rechaza lo que puedeAgregar rechaza', () => {
    const c = new Compositor();
    expect(c.agregar(n(3))).toBe(false);
    expect(c.agregar(s('U'))).toBe(false);
    expect(c.cantidad).toBe(0);
  });

  it('respeta el máximo de fichas y no espera número si ya no cabe', () => {
    const c = new Compositor(3);
    c.agregar(s('L'));
    c.agregar(s('L'));
    c.agregar(s('F'));
    expect(c.lleno).toBe(true);
    expect(c.esperaNumero).toBe(false);
    expect(c.agregar(n(1))).toBe(false);
  });

  it('las fichas son copias en JSON plano (listas para el bus)', () => {
    const c = new Compositor();
    c.agregar(s('R'));
    const f = c.fichas;
    f.push(s('A'));
    expect(c.cantidad).toBe(1);
    expect(JSON.parse(JSON.stringify(c.fichas))).toEqual([s('R')]);
  });

  it('etiqueta de cada ficha', () => {
    expect(etiquetaFicha(s('R'))).toBe('R · Right · Derecha');
    expect(etiquetaFicha(n(1))).toBe('1 · un paso');
    expect(etiquetaFicha(n(3))).toBe('3 · tres pasos');
  });
});

describe('Sostenedor (sostener para confirmar)', () => {
  it('confirma una vez al cumplir el tiempo y pide soltar para repetir', () => {
    const h = new Sostenedor<string>(300);
    expect(h.actualizar('F', 0)).toBeNull();
    expect(h.actualizar('F', 200)).toBeNull();
    expect(h.actualizar('F', 310)).toBe('F');
    expect(h.actualizar('F', 900)).toBeNull();
    expect(h.actualizar(null, 950)).toBeNull();
    expect(h.actualizar('F', 1000)).toBeNull();
    expect(h.actualizar('F', 1300)).toBe('F');
  });

  it('usa la estabilidad externa si se da (stableMs del clasificador)', () => {
    const h = new Sostenedor<string>(300);
    expect(h.actualizar('L', 0, 120)).toBeNull();
    expect(h.actualizar('L', 16, 320)).toBe('L');
  });

  it('bloquear: el valor actual no cuenta hasta que cambie', () => {
    const h = new Sostenedor<number>(300);
    h.bloquear(3, 0);
    expect(h.actualizar(3, 1000)).toBeNull();
    expect(h.actualizar(2, 1100)).toBeNull();
    expect(h.actualizar(2, 1400)).toBe(2);
  });
});
