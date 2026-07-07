import { useEffect, useMemo, useState } from 'react';
import { socket } from '../socket.js';
import { Card } from './Card.jsx';
import { ChipPile } from './Chip.jsx';
import { PlayerSeat } from './PlayerSeat.jsx';
import { ActionBar } from './ActionBar.jsx';
import { AdminPanel } from './AdminPanel.jsx';
import { SidePanel } from './SidePanel.jsx';
import { PLAYER_COLORS } from './PlayerSeat.jsx';

const BETTING = ['preflop', 'flop', 'turn', 'river'];

export function TableScreen({ state, myId, onAction, onStart, onRebuy, onLeave, onGrant, onKick, onEnd }) {
  const [copied, setCopied] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [salsa, setSalsa] = useState(null); // {nickname, key} → animación festiva
  const [salsaSent, setSalsaSent] = useState(false);

  useEffect(() => {
    const onSalsa = ({ nickname }) => {
      setSalsa({ nickname, key: Date.now() });
      setTimeout(() => setSalsa(null), 3500);
    };
    socket.on('salsa', onSalsa);
    return () => socket.off('salsa', onSalsa);
  }, []);

  // El botón de la salsa vuelve a estar disponible en la mano siguiente
  useEffect(() => setSalsaSent(false), [state.handNum]);

  const myIdx = state.players.findIndex((p) => p.id === myId);
  const me = myIdx >= 0 ? state.players[myIdx] : null;
  const n = state.players.length;
  const isHost = state.hostId === myId;
  const inBetting = BETTING.includes(state.phase);
  const isMyTurn = inBetting && state.toActIdx === myIdx;
  const handInfoById = useMemo(() => {
    const m = new Map();
    for (const h of state.result?.hands || []) m.set(h.id, h.handName);
    return m;
  }, [state.result]);

  // Mi asiento siempre abajo al centro: roto los índices para posicionar.
  // Los asientos van al perímetro de la mesa, con límites para que nunca
  // se recorten ni pisen las cartas comunitarias del centro.
  const seatPos = (idx) => {
    const rel = myIdx >= 0 ? (idx - myIdx + n) % n : idx;
    const angle = Math.PI / 2 + (rel * 2 * Math.PI) / n; // arranca abajo, sentido horario
    const left = Math.min(88, Math.max(12, 50 + 44 * Math.cos(angle)));
    const top = Math.min(93, Math.max(7, 50 + 45 * Math.sin(angle)));
    return { left: `${left}%`, top: `${top}%` };
  };

  const copyCode = () => {
    navigator.clipboard?.writeText(state.code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Compartir la mesa: Web Share API si existe, si no copia el link
  const shareUrl = `${window.location.origin}/?mesa=${state.code}`;
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Fish Poker',
          text: `Sumate a mi mesa de Fish Poker 🐟🤠 Código: ${state.code}`,
          url: shareUrl,
        });
        return;
      } catch {
        return; // usuario canceló el share nativo
      }
    }
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const canStart =
    isHost &&
    (state.phase === 'waiting' || state.phase === 'showdown') &&
    state.players.filter((p) => p.stack > 0).length >= 2;

  return (
    <div className="screen table-screen">
      <header className="table-header">
        <span className="table-brand">🐟 Fish Poker</span>
        <button className="code-chip" onClick={copyCode} title="Copiar código">
          Mesa {state.code} {copied ? '✓' : '⧉'}
        </button>
        <button className="code-chip share-btn" onClick={share} title="Compartir mesa">
          {copied ? 'Copiado ✓' : 'Compartir 📤'}
        </button>
        <span className="blinds-info">
          Ciegas {state.config.smallBlind}/{state.config.bigBlind}
          {state.handNum > 0 && ` · Mano #${state.handNum}`}
        </span>
        <button className="link link-leave" onClick={onLeave}>
          Salir
        </button>
      </header>

      <div className="felt-wrap">
        <div className="felt">
          <div className="felt-brand">
            <span className="felt-brand-stars">★ ★ ★</span>
            FISH POKER
            <span className="felt-brand-sub">TEXAS HOLD&apos;EM</span>
          </div>
          <div className="felt-center">
            {state.phase === 'waiting' ? (
              <div className="waiting-msg">
                <p>Esperando jugadores… ({n} en la mesa)</p>
                <p className="waiting-code">
                  Código <b>{state.code}</b>
                </p>
                <button className="btn btn-primary btn-share-big" onClick={share}>
                  {copied ? '¡Link copiado! ✓' : 'Compartir invitación 📤'}
                </button>
              </div>
            ) : (
              <>
                <div className="community">
                  {state.community.map((c, i) => (
                    <Card key={i} card={c} size="md" />
                  ))}
                  {Array.from({ length: 5 - state.community.length }).map((_, i) => (
                    <div key={`e${i}`} className="card card-md card-slot" />
                  ))}
                </div>
                {state.pot > 0 && (
                  <div className="pot">
                    <ChipPile counts={state.potChips} size={26} maxPerDenom={3} />
                    <span className="pot-num">Pozo: {state.pot}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {state.players.map((p, idx) => (
            <div key={p.id} className="seat-anchor" style={seatPos(idx)}>
              <PlayerSeat
                player={p}
                isAdmin={p.id === state.hostId}
                isDealer={idx === state.dealerIdx && state.phase !== 'waiting'}
                isTurn={inBetting && idx === state.toActIdx}
                isMe={idx === myIdx}
                handInfo={handInfoById.get(p.id)}
                turnDeadline={state.turnDeadline}
                turnTotalMs={state.config.turnTimer > 0 ? state.config.turnTimer * 1000 : null}
              />
            </div>
          ))}
        </div>
      </div>

      {adminOpen && (
        <AdminPanel
          players={state.players}
          myId={myId}
          onGrant={onGrant}
          onKick={onKick}
          onClose={() => setAdminOpen(false)}
        />
      )}

      <SidePanel chat={state.chat || []} log={state.log} myNickname={me?.nickname} />

      {state.phase === 'ended' && state.result?.standings && (
        <div className="modal-backdrop">
          <div className="modal panel ended-panel">
            <h3 className="modal-title">🏁 Partida finalizada</h3>
            <ol className="standings">
              {state.result.standings.map((s, i) => (
                <li key={s.nickname}>
                  <span className="standing-pos">{i === 0 ? '🏆' : `${i + 1}º`}</span>
                  <span
                    className="standing-dot"
                    style={{ background: PLAYER_COLORS[s.colorIdx % PLAYER_COLORS.length] }}
                  />
                  <span className="standing-name">{s.nickname}</span>
                  <b className="standing-stack">{s.stack}</b>
                </li>
              ))}
            </ol>
            <button className="btn btn-primary btn-block" onClick={onLeave}>
              Volver al lobby
            </button>
          </div>
        </div>
      )}

      {state.result && state.phase === 'showdown' && (
        <div className="result-banner">
          {state.result.pots.map((pot, i) => (
            <p key={i}>
              🏆 <b>{pot.winners.join(' y ')}</b> gana{pot.winners.length > 1 ? 'n' : ''}{' '}
              <b>{pot.amount}</b>
              {state.result.pots.length > 1 && i > 0 ? ' (side pot)' : ''}
            </p>
          ))}
          {me &&
            !salsaSent &&
            state.result.pots.some((pot) => pot.winners.includes(me.nickname)) && (
              <button
                className="btn btn-salsa"
                onClick={() => {
                  socket.emit('salsa');
                  setSalsaSent(true);
                }}
              >
                🍅 Paaasame la salsa!
              </button>
            )}
          <p className="result-next">La próxima mano arranca en unos segundos…</p>
        </div>
      )}

      {salsa && (
        <div className="salsa-overlay" key={salsa.key}>
          {['🍅', '🌶️', '💃', '🍅', '🤠', '🌶️', '🍅', '💃', '🍅', '🌶️'].map((e, i) => (
            <span
              className="salsa-drop"
              style={{ left: `${5 + i * 10}%`, animationDelay: `${(i % 5) * 0.25}s` }}
              key={i}
            >
              {e}
            </span>
          ))}
          <div className="salsa-text">¡{salsa.nickname} pide la salsa!</div>
        </div>
      )}

      <footer className="table-footer">
        {me && me.inHand && !me.folded && me.cards.length > 0 && (
          <div className="my-cards">
            {me.cards.map((c, i) => (
              <Card key={i} card={c} size="lg" />
            ))}
          </div>
        )}

        {isMyTurn && me ? (
          <ActionBar state={state} me={me} onAction={onAction} />
        ) : (
          <div className="footer-info">
            {canStart && (
              <button className="btn btn-primary" onClick={onStart}>
                {state.phase === 'waiting' ? '🎴 Repartir la primera mano' : '🎴 Siguiente mano ya'}
              </button>
            )}
            {me && me.stack === 0 && !inBetting && (
              <button className="btn btn-raise" onClick={onRebuy}>
                Recomprar {state.config.buyIn}
              </button>
            )}
            {inBetting && !isMyTurn && state.toActIdx >= 0 && (
              <span className="turn-hint">
                Turno de <b>{state.players[state.toActIdx]?.nickname}</b>…
              </span>
            )}
            {state.phase === 'waiting' && !canStart && !isHost && (
              <span className="turn-hint">El anfitrión reparte cuando estén todos 🤠</span>
            )}
          </div>
        )}

        {isHost && state.phase !== 'ended' && (
          <div className="admin-row">
            <button className="admin-btn" onClick={() => setAdminOpen(true)}>
              ⭐ Asignar fichas
            </button>
            <button
              className="admin-btn admin-btn-end"
              onClick={() => {
                if (window.confirm('¿Finalizar la partida para todos?')) onEnd();
              }}
            >
              🔚 Finalizar partida
            </button>
          </div>
        )}

      </footer>
    </div>
  );
}
