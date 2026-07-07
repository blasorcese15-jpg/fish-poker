import { breakdown, countsToList } from '../chips.js';

// Ficha de poker estilo casino: borde con franjas (dasharray) y valor al centro.
export function Chip({ denom, size = 42 }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className="chip"
      aria-label={`Ficha de ${denom.value}`}
    >
      <circle cx="50" cy="50" r="48" fill={denom.rim} />
      <circle cx="50" cy="50" r="45" fill={denom.color} />
      {/* Franjas del borde, como las fichas físicas */}
      <circle
        cx="50"
        cy="50"
        r="41"
        fill="none"
        stroke={denom.value === 1000 ? '#7fc9e8' : '#f7f5ef'}
        strokeWidth="9"
        strokeDasharray="11.5 18.4"
        strokeDashoffset="5"
      />
      <circle cx="50" cy="50" r="30" fill={denom.color} stroke={denom.rim} strokeWidth="2.5" />
      {/* Volumen: luz arriba-izquierda, sombra abajo-derecha */}
      <path
        d="M14 34 A40 40 0 0 1 66 14 A46 46 0 0 0 14 34 Z"
        fill="rgba(255,255,255,0.35)"
      />
      <ellipse cx="38" cy="32" rx="17" ry="9" fill="rgba(255,255,255,0.22)" transform="rotate(-32 38 32)" />
      <path
        d="M86 66 A40 40 0 0 1 34 86 A46 46 0 0 0 86 66 Z"
        fill="rgba(0,0,0,0.22)"
      />
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={denom.value >= 1000 ? 24 : 26}
        fontWeight="800"
        fontFamily="Alegreya Sans, sans-serif"
        fill={denom.text}
      >
        {denom.value}
      </text>
    </svg>
  );
}

// Pila de fichas para stacks, apuestas y pozo. Si recibe `counts`
// ({denominación: cantidad}) dibuja las fichas físicas reales; si no,
// descompone `amount` solo como visualización.
export function ChipPile({ amount, counts, size = 34, maxPerDenom = 4 }) {
  const piles = counts ? countsToList(counts) : amount > 0 ? breakdown(amount) : [];
  if (piles.length === 0) return null;
  return (
    <div className="chip-pile">
      {piles.map((d) => (
        <div className="chip-stack" key={d.value}>
          {Array.from({ length: Math.min(d.count, maxPerDenom) }).map((_, i) => (
            <div className="chip-stack-item" style={{ bottom: i * (size * 0.14) }} key={i}>
              <Chip denom={d} size={size} />
            </div>
          ))}
          {d.count > maxPerDenom && <span className="chip-count">×{d.count}</span>}
        </div>
      ))}
    </div>
  );
}
