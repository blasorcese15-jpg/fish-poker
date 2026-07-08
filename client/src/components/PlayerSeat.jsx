import { useEffect, useState } from 'react';
import { Card } from './Card.jsx';
import { ChipPile } from './Chip.jsx';

// Un color distintivo por jugador (asignado por el servidor vía colorIdx)
export const PLAYER_COLORS = [
  '#c0392b', // rojo
  '#2360b8', // azul
  '#d9a821', // dorado
  '#7d3fb3', // violeta
  '#e67e22', // naranja
  '#16a085', // turquesa
  '#d6479c', // rosa
  '#5d4630', // marrón cuero
  '#5c6b73', // gris pizarra
];

// Sombreros renderizados (assets IA del sheet del usuario). Los colores que
// no vinieron renderizados se derivan con filtros de tono sobre el gris/rojo.
export const HAT_SPRITES = [
  { src: '/assets/hat-red.png' }, // rojo
  { src: '/assets/hat-gray.png', filter: 'sepia(1) saturate(4) hue-rotate(185deg) brightness(0.95)' }, // azul
  { src: '/assets/hat-tan.png' }, // dorado
  { src: '/assets/hat-gray.png', filter: 'sepia(1) saturate(3) hue-rotate(230deg) brightness(1.05)' }, // violeta
  { src: '/assets/hat-brown.png', filter: 'saturate(1.7) hue-rotate(-8deg) brightness(1.12)' }, // naranja
  { src: '/assets/hat-gray.png', filter: 'sepia(1) saturate(3) hue-rotate(130deg)' }, // turquesa
  { src: '/assets/hat-red.png', filter: 'hue-rotate(315deg) saturate(1.2) brightness(1.2)' }, // rosa
  { src: '/assets/hat-brown.png' }, // marrón
  { src: '/assets/hat-black.png' }, // negro
];

// Sombrero texano vectorial (se usa como decoración y fallback).
export function CowboyHat({ color, size = 30 }) {
  return (
    <svg viewBox="0 0 64 46" width={size} height={size * 0.72} aria-hidden="true">
      {/* Sombra proyectada */}
      <ellipse cx="32" cy="41" rx="26" ry="3.5" fill="rgba(0,0,0,0.28)" />
      {/* Ala */}
      <path
        d="M3 30 Q3 24 9 26 Q20 29 32 29 Q44 29 55 26 Q61 24 61 30 Q61 36 48 38.5 Q40 40 32 40 Q24 40 16 38.5 Q3 36 3 30 Z"
        fill={color}
      />
      {/* Curva del ala: luz arriba, sombra abajo */}
      <path
        d="M3 30 Q3 24 9 26 Q20 29 32 29 Q44 29 55 26 Q61 24 61 30 L61 30 Q45 33 32 33 Q19 33 3 30 Z"
        fill="rgba(255,255,255,0.14)"
      />
      <path
        d="M6 33.5 Q18 37.5 32 37.5 Q46 37.5 58 33.5 Q52 38 40 39.4 Q32 40.3 24 39.4 Q12 38 6 33.5 Z"
        fill="rgba(0,0,0,0.3)"
      />
      {/* Copa */}
      <path d="M21 29 L23 9 Q24 4 29 5.5 Q32 2.5 35 5.5 Q40 4 41 9 L43 29 Q32 31.5 21 29 Z" fill={color} />
      {/* Hendidura y volumen de la copa */}
      <path d="M29 5.5 Q32 2.5 35 5.5 Q34 12 34 18 L30 18 Q30 12 29 5.5 Z" fill="rgba(0,0,0,0.22)" />
      <path d="M23 9 Q24 4 29 5.5 Q30 12 30 20 L23 22 Z" fill="rgba(255,255,255,0.12)" />
      <path d="M41 9 Q40 4 35 5.5 Q34 12 34 20 L41 22 Z" fill="rgba(0,0,0,0.16)" />
      {/* Banda con hebilla dorada */}
      <path d="M21.5 23.5 Q32 26.5 42.5 23.5 L43 29 Q32 31.5 21 29 Z" fill="rgba(20,12,4,0.55)" />
      <rect x="29.5" y="24.8" width="5" height="4.6" rx="1" fill="#d9a821" stroke="#8a6510" strokeWidth="0.8" />
    </svg>
  );
}

const ACTION_LABELS = {
  fold: 'Fold',
  check: 'Check',
  call: 'Call',
  raise: 'Raise',
  'all-in': 'ALL-IN',
  muck: 'No mostró',
};

export function PlayerSeat({ player, isDealer, isTurn, isMe, isAdmin, handInfo, turnDeadline, turnTotalMs }) {
  const cls = [
    'seat',
    isTurn && 'seat-turn',
    player.folded && 'seat-folded',
    !player.connected && 'seat-away',
    isMe && 'seat-me',
  ]
    .filter(Boolean)
    .join(' ');

  const color = PLAYER_COLORS[player.colorIdx % PLAYER_COLORS.length];

  return (
    <div className={cls}>
      {player.bet > 0 && (
        <div className="seat-bet">
          <ChipPile counts={player.betChips} size={22} maxPerDenom={3} />
          <span className="seat-bet-num">{player.bet}</span>
        </div>
      )}
      <div className="seat-cards">
        {player.inHand &&
          !player.folded &&
          player.cards.map((c, i) => <Card key={i} card={c} size="sm" />)}
      </div>
      <div className="seat-hat-big">
        <img
          className="seat-hat-img"
          src={HAT_SPRITES[player.colorIdx % HAT_SPRITES.length].src}
          style={{ filter: HAT_SPRITES[player.colorIdx % HAT_SPRITES.length].filter }}
          alt=""
          draggable="false"
        />
      </div>
      <div className="seat-plate">
        {isDealer && <span className="dealer-btn">D</span>}
        <span className="seat-name">
          {isAdmin && (
            <span className="admin-star" title="Admin de la partida">
              ★
            </span>
          )}
          {player.nickname}
        </span>
        <span className="seat-stack">
          {player.stack > 0 ? player.stack : player.allIn ? 'ALL-IN' : 'sin fichas'}
        </span>
        {!player.connected && <span className="seat-action seat-away-label">ausente 💤</span>}
        {handInfo && <span className="seat-hand-name">{handInfo}</span>}
        {player.connected && !handInfo && player.lastAction && (
          <span className={`seat-action seat-action-${player.lastAction}`}>
            {ACTION_LABELS[player.lastAction]}
          </span>
        )}
        {isTurn && turnDeadline && <TurnBar deadline={turnDeadline} totalMs={turnTotalMs} />}
      </div>
    </div>
  );
}

function TurnBar({ deadline, totalMs }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, deadline - now);
  const pct = Math.min(100, (left / (totalMs || 30000)) * 100);
  return (
    <div className="turn-bar">
      <div className="turn-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
