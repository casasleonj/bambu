import { describe, expect, it } from 'vitest';
import { ordenarBarriosFIFO } from './fifo-barrio';

const p = (id: string, barrioClave: string, fecha: string) => ({
  id, barrioClave, createdAt: new Date(fecha),
});

describe('ordenarBarriosFIFO #859', () => {
  it('prioriza la antigüedad del pedido más viejo, no el volumen', () => {
    const pedidos = [
      ...Array.from({ length: 10 }, (_, i) => p('b' + i, 'B', '2026-11-18T10:00:00Z')),
      p('a1', 'A', '2026-11-16T10:00:00Z'),
      p('c1', 'C', '2026-11-14T10:00:00Z'),
    ];
    expect(ordenarBarriosFIFO(pedidos).map(g => g.clave)).toEqual(['C', 'A', 'B']);
  });

  it('mezcla parciales y pendientes según fecha original sin modificar el dato', () => {
    const pedidos = [p('nuevo', 'A', '2026-11-19T10:00:00Z'), p('parcial', 'A', '2026-11-11T10:00:00Z')];
    const grupos = ordenarBarriosFIFO(pedidos);
    expect(grupos[0].pedidos.map(x => x.id)).toEqual(['parcial', 'nuevo']);
    expect(pedidos[0].id).toBe('nuevo');
  });

  it('recalcula prioridad cuando desaparece el pedido más antiguo', () => {
    const pedidos = [p('a1', 'A', '2026-11-10T10:00:00Z'), p('a2', 'A', '2026-11-19T10:00:00Z'), p('b1', 'B', '2026-11-15T10:00:00Z')];
    expect(ordenarBarriosFIFO(pedidos).map(g => g.clave)).toEqual(['A', 'B']);
    expect(ordenarBarriosFIFO(pedidos.filter(x => x.id !== 'a1')).map(g => g.clave)).toEqual(['B', 'A']);
  });

  it('desempata determinísticamente por id', () => {
    expect(ordenarBarriosFIFO([p('z', 'Z', '2026-11-19T10:00:00Z'), p('a', 'A', '2026-11-19T10:00:00Z')]).map(g => g.clave)).toEqual(['A', 'Z']);
  });
});
