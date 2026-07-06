// Evaluador de manos: encuentra la mejor mano de 5 cartas entre las 7
// disponibles (2 propias + 5 comunitarias). El rango es un array que se
// compara lexicográficamente: [categoría, desempates...].

export const HAND_NAMES = [
  'Carta alta',
  'Pareja',
  'Doble pareja',
  'Trío',
  'Escalera',
  'Color',
  'Full house',
  'Póker',
  'Escalera de color',
];

function evaluate5(cards) {
  const ranks = cards.map((c) => c.r).sort((a, b) => b - a);
  const isFlush = cards.every((c) => c.s === cards[0].s);

  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  // Grupos ordenados por cantidad y luego por valor (para desempates)
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  let straightHigh = 0;
  if (counts.size === 5) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
    else if (ranks[0] === 14 && ranks[1] === 5) straightHigh = 5; // rueda A-2-3-4-5
  }

  if (isFlush && straightHigh) return [8, straightHigh];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (isFlush) return [5, ...ranks];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][1] === 3) return [3, groups[0][0], groups[1][0], groups[2][0]];
  if (groups[0][1] === 2 && groups[1][1] === 2)
    return [2, groups[0][0], groups[1][0], groups[2][0]];
  if (groups[0][1] === 2)
    return [1, groups[0][0], groups[1][0], groups[2][0], groups[3][0]];
  return [0, ...ranks];
}

export function compareRanks(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d;
  }
  return 0;
}

export function bestHand(cards7) {
  let best = null;
  const n = cards7.length;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            const rank = evaluate5([cards7[a], cards7[b], cards7[c], cards7[d], cards7[e]]);
            if (!best || compareRanks(rank, best) > 0) best = rank;
          }
  // Reglamento §14: la escalera de color al As tiene nombre propio
  const name = best[0] === 8 && best[1] === 14 ? 'Escalera Real' : HAND_NAMES[best[0]];
  return { rank: best, name };
}
