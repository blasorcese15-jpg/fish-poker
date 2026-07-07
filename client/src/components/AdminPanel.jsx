import { useState } from 'react';
import { CHIP_DENOMS } from '../chips.js';
import { Chip } from './Chip.jsx';

// Panel del admin: acreditar fichas por denominación y sacar jugadores.
export function AdminPanel({ players, myId, onGrant, onKick, onClose }) {
  const [targetId, setTargetId] = useState(players[0]?.id || '');
  const [counts, setCounts] = useState({});
  const [sending, setSending] = useState(false);

  const total = CHIP_DENOMS.reduce((s, d) => s + (counts[d.value] || 0) * d.value, 0);
  const bump = (value, delta) =>
    setCounts((c) => ({ ...c, [value]: Math.max(0, (c[value] || 0) + delta) }));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal panel" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">⭐ Asignar fichas</h3>

        <label className="field-label" htmlFor="grant-target">
          Jugador
        </label>
        <select
          id="grant-target"
          className="input"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
        >
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nickname}
              {p.id === myId ? ' (vos)' : ''} — {p.stack} fichas
            </option>
          ))}
        </select>

        <div className="grant-rows">
          {CHIP_DENOMS.map((d) => (
            <div className="grant-row" key={d.value}>
              <Chip denom={d} size={34} />
              <span className="grant-count">×{counts[d.value] || 0}</span>
              <div className="grant-btns">
                <button onClick={() => bump(d.value, -1)} disabled={!counts[d.value]}>
                  −
                </button>
                <button onClick={() => bump(d.value, 1)}>+</button>
              </div>
            </div>
          ))}
        </div>

        <p className="grant-total">
          Total a acreditar: <b>{total}</b>
        </p>

        {players.some((p) => p.id !== myId) && (
          <div className="kick-section">
            <p className="field-label">Sacar de la mesa</p>
            {players
              .filter((p) => p.id !== myId)
              .map((p) => (
                <div className="kick-row" key={p.id}>
                  <span className="kick-name">
                    {p.nickname}
                    {!p.connected && ' 💤'}
                  </span>
                  <span className="kick-stack">{p.stack} fichas</span>
                  <button
                    className="kick-btn"
                    onClick={() => {
                      if (window.confirm(`¿Sacar a ${p.nickname} de la mesa?`)) {
                        onKick(p.id);
                        onClose();
                      }
                    }}
                  >
                    Sacar
                  </button>
                </div>
              ))}
          </div>
        )}

        <div className="action-row">
          <button className="btn btn-muted" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            disabled={total === 0 || !targetId || sending}
            onClick={() => {
              setSending(true);
              onGrant(targetId, counts, () => {
                setSending(false);
                onClose();
              });
            }}
          >
            Acreditar
          </button>
        </div>
      </div>
    </div>
  );
}
