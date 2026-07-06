const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

// card: {r, s} | null (boca abajo)
export function Card({ card, size = 'md' }) {
  if (!card) {
    return (
      <div className={`card card-${size} card-back`} aria-label="Carta boca abajo">
        <span className="card-back-fish">🐟</span>
      </div>
    );
  }
  const rank = RANKS[card.r] || String(card.r);
  const suit = SUITS[card.s];
  const red = card.s === 1 || card.s === 2;
  return (
    <div className={`card card-${size} ${red ? 'card-red' : 'card-black'}`}>
      <span className="card-rank">{rank}</span>
      <span className="card-suit">{suit}</span>
    </div>
  );
}
