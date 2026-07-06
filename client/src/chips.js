// Denominaciones de fichas de Fish Poker.
// La de 50 es interna (gris): no se reparte al inicio, solo aparece
// cuando un pozo dividido deja restos.

export const CHIP_DENOMS = [
  { value: 1000, color: '#f7f5ef', rim: '#c9c4b4', text: '#3b2a17', label: 'blanca' },
  { value: 750, color: '#c0392b', rim: '#8e2418', text: '#fff', label: 'roja' },
  { value: 500, color: '#1f5fbf', rim: '#143f82', text: '#fff', label: 'azul' },
  { value: 250, color: '#2e7d43', rim: '#1d5b2e', text: '#fff', label: 'verde' },
  { value: 100, color: '#232323', rim: '#000', text: '#fff', label: 'negra' },
];

export const CHIP_50 = { value: 50, color: '#8d979e', rim: '#5f676d', text: '#fff', label: 'gris' };

export const ALL_DENOMS = [...CHIP_DENOMS, CHIP_50];

// Convierte {denominación: cantidad} en la lista de pilas para dibujar.
export function countsToList(counts) {
  return ALL_DENOMS.filter((d) => (counts?.[d.value] || 0) > 0).map((d) => ({
    ...d,
    count: counts[d.value],
  }));
}

// Descompone un monto en fichas (solo para visualización de fallback).
export function breakdown(amount) {
  const out = [];
  let rest = amount;
  for (const d of ALL_DENOMS) {
    const count = Math.floor(rest / d.value);
    if (count > 0) out.push({ ...d, count });
    rest -= count * d.value;
  }
  return out;
}
