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

// Sombrero texano, el ícono de cada jugador
function CowboyHat({ color, size = 30 }) {
  return (
    <svg viewBox="0 0 64 44" width={size} height={size * 0.69} aria-hidden="true">
      <path d="M25 6 Q32 1 39 6 L44 24 L20 24 Z" fill={color} />
      <ellipse cx="32" cy="30" rx="29" ry="9" fill={color} />
      <ellipse cx="32" cy="27.5" rx="21" ry="6" fill="rgba(0,0,0,0.25)" />
      <rect x="21" y="19" width="22" height="6" rx="3" fill="rgba(0,0,0,0.35)" />
    </svg>
  );
}

const ACTION_LABELS = {
  fold: 'Fold',
  check: 'Check',
  call: 'Call',
  raise: 'Raise',
  'all-in': 'ALL-IN',
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
        <CowboyHat color={color} size={46} />
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
