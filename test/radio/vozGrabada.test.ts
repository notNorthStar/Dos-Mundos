import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VozRadio } from '../../src/shared/contratos';
import { claveDeFrase, crearVozGrabada, ordenesDe } from '../../src/radio/vozGrabada';
import { frasesDelRadio } from '../../src/radio/mensaje';

describe('claveDeFrase', () => {
  it('minúsculas, sin espacios de sobra ni punto final', () => {
    expect(claveDeFrase('Avanza dos pasos')).toBe('avanza dos pasos');
    expect(claveDeFrase('  Avanza   dos  pasos. ')).toBe('avanza dos pasos');
    expect(claveDeFrase('Quieto, no hagas ruido.')).toBe('quieto, no hagas ruido');
    expect(claveDeFrase('Agáchate, está en el piso')).toBe('agáchate, está en el piso');
    expect(claveDeFrase('')).toBe('');
  });

  it('cada frase del radio tiene una clave distinta', () => {
    const claves = frasesDelRadio().map(claveDeFrase);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it('ordenesDe parte el mensaje por el separador', () => {
    expect(ordenesDe('Gira a la izquierda. Avanza dos pasos')).toEqual(['gira a la izquierda', 'avanza dos pasos']);
    expect(ordenesDe('Quieto, no hagas ruido')).toEqual(['quieto, no hagas ruido']);
    expect(ordenesDe('  ')).toEqual([]);
  });
});

// ───────────── Contexto de audio falso (lo mínimo que usa la voz) ─────────────

function param() {
  return {
    value: 1,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
}

function crearCtxFalso() {
  const fuentes: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  const ctx = {
    currentTime: 0,
    createGain: () => ({ gain: param(), connect: vi.fn(), disconnect: vi.fn() }),
    createBufferSource: () => {
      const f = {
        buffer: null as unknown,
        onended: null as null | (() => void),
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        // Termina "al instante" (en el siguiente turno), como si el clip ya hubiera sonado.
        stop: vi.fn(() => setTimeout(() => f.onended?.(), 0)),
      };
      fuentes.push(f);
      return f;
    },
    decodeAudioData: vi.fn(async () => ({ duration: 0.5 })),
  };
  return { ctx: ctx as unknown as AudioContext, fuentes };
}

function stubFetch(manifiesto: Record<string, string> | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('voces.json')) {
        return manifiesto ? { ok: true, json: async () => ({ clips: manifiesto }) } : { ok: false, status: 404 };
      }
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    }),
  );
}

function respaldoFalso(): VozRadio & { dichos: string[] } {
  const dichos: string[] = [];
  return { dichos, decir: vi.fn(async (t: string) => void dichos.push(t)), callar: vi.fn() };
}

describe('crearVozGrabada', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('toca un clip por orden y no usa el respaldo si están todos', async () => {
    stubFetch({ 'gira a la izquierda': 'gira_a_la_izquierda.wav', 'avanza dos pasos': 'avanza_dos_pasos.wav' });
    const { ctx, fuentes } = crearCtxFalso();
    const respaldo = respaldoFalso();
    const voz = crearVozGrabada(ctx, respaldo);
    expect(voz.salida).toBeDefined();
    await voz.decir('Gira a la izquierda. Avanza dos pasos');
    expect(fuentes).toHaveLength(2);
    // El segundo clip empieza después del primero más la pausa.
    const t0 = fuentes[0]!.start.mock.calls[0]![0] as number;
    const t1 = fuentes[1]!.start.mock.calls[0]![0] as number;
    expect(t1).toBeGreaterThan(t0 + 0.5);
    expect(respaldo.dichos).toEqual([]);
  });

  it('si falta un clip, el mensaje completo lo dice el respaldo', async () => {
    stubFetch({ 'avanza dos pasos': 'avanza_dos_pasos.wav' });
    const { ctx, fuentes } = crearCtxFalso();
    const respaldo = respaldoFalso();
    const voz = crearVozGrabada(ctx, respaldo);
    await voz.decir('Gira a la izquierda. Avanza dos pasos');
    expect(fuentes).toHaveLength(0);
    expect(respaldo.dichos).toEqual(['Gira a la izquierda. Avanza dos pasos']);
  });

  it('sin manifiesto ni respaldo resuelve sin lanzar', async () => {
    stubFetch(null);
    const { ctx } = crearCtxFalso();
    const voz = crearVozGrabada(ctx, null);
    await expect(voz.decir('Avanza')).resolves.toBeUndefined();
    expect(() => voz.callar()).not.toThrow();
  });

  it('callar corta lo que suena y avisa al respaldo', async () => {
    stubFetch({ avanza: 'avanza.wav' });
    const { ctx } = crearCtxFalso();
    const respaldo = respaldoFalso();
    const voz = crearVozGrabada(ctx, respaldo);
    await voz.decir('Avanza'); // termina la carga
    // Una fuente que nunca termina sola: solo callar() la resuelve.
    const c = ctx as unknown as { createBufferSource: () => unknown };
    const original = c.createBufferSource;
    c.createBufferSource = () => {
      const f = original() as { stop: ReturnType<typeof vi.fn> };
      f.stop = vi.fn();
      return f;
    };
    const p = voz.decir('Avanza');
    await new Promise((r) => setTimeout(r, 5));
    voz.callar();
    await expect(p).resolves.toBeUndefined();
    expect(respaldo.callar).toHaveBeenCalled();
  });
});
