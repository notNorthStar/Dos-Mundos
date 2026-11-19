import { describe, expect, it } from 'vitest';
import { crearVozSintetica, elegirVoz, msLimiteFrase } from '../../src/radio/voz';

const v = (name: string, lang: string, localService = true, def = false) => ({ name, lang, localService, default: def });

describe('elegirVoz', () => {
  it('prefiere es-MX, luego cualquier es-*, luego ninguna (la predeterminada)', () => {
    const mx = v('Microsoft Sabina', 'es-MX');
    const es = v('Microsoft Helena', 'es-ES');
    const en = v('David', 'en-US', true, true);
    expect(elegirVoz([en, es, mx], 'es-MX')).toBe(mx);
    expect(elegirVoz([en, es], 'es-MX')).toBe(es);
    expect(elegirVoz([en], 'es-MX')).toBeNull();
    expect(elegirVoz([], 'es-MX')).toBeNull();
  });

  it('acepta es_MX y prefiere voces locales', () => {
    const enLinea = v('Google español de México', 'es-MX', false);
    const local = v('Sabina', 'es_MX', true);
    expect(elegirVoz([enLinea, local], 'es-MX')).toBe(local);
  });
});

describe('crearVozSintetica', () => {
  it('sin speechSynthesis (Node) resuelve de inmediato y callar no lanza', async () => {
    const voz = crearVozSintetica();
    await expect(voz.decir('Avanza dos pasos')).resolves.toBeUndefined();
    expect(() => voz.callar()).not.toThrow();
  });

  it('el tiempo límite crece con el texto', () => {
    expect(msLimiteFrase('Gira a la izquierda. Gira a la izquierda. Avanza dos pasos')).toBeGreaterThan(msLimiteFrase('Avanza'));
  });
});
