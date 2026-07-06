import { useState, useEffect } from 'react';
import { ALL_DENOMS } from '../chips.js';
import { Chip } from './Chip.jsx';

// Botonera táctil: la apuesta se construye ficha por ficha con las fichas
// FÍSICAS del jugador (la composición real viene del servidor). Las fichas
// agregadas se pueden quitar tocándolas o con "Deshacer" antes de confirmar.
export function ActionBar({ state, me, onAction }) {
  const [betChips, setBetChips] = useState([]); // denominaciones agregadas, en orden

  const betTotal = betChips.reduce((s, v) => s + v, 0);
  const addedCount = (v) => betChips.filter((x) => x === v).length;
  const toCall = Math.min(state.currentBet - me.bet, me.stack);
  const maxTo = me.bet + me.stack;
  const minRaiseTo = Math.min(state.currentBet + state.minRaise, maxTo);
  const target = me.bet + betTotal; // a cuánto quedaría mi apuesta total

  useEffect(() => {
    setBetChips([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.toActIdx, state.phase, state.handNum]);

  const addChip = (v) => {
    setBetChips((prev) =>
      prev.filter((x) => x === v).length < (me.chips[v] || 0) ? [...prev, v] : prev
    );
  };
  const removeAt = (i) => setBetChips((prev) => prev.filter((_, j) => j !== i));
  const undo = () => setBetChips((prev) => prev.slice(0, -1));

  // Composición {denominación: cantidad} que viaja al servidor
  const chipSpec = betChips.reduce((acc, v) => ({ ...acc, [v]: (acc[v] || 0) + 1 }), {});

  // Interpretación de la apuesta construida
  let confirm = null;
  if (betTotal > 0) {
    if (betTotal === toCall) {
      confirm = { label: `Igualar ${toCall}`, action: { type: 'call', chips: chipSpec }, ok: true };
    } else if (betTotal < toCall) {
      confirm = { label: `Faltan ${toCall - betTotal} para igualar`, ok: false };
    } else if (target >= minRaiseTo || betTotal === me.stack) {
      confirm = {
        label: betTotal === me.stack ? `ALL-IN (${target})` : `Subir a ${target}`,
        action:
          betTotal === me.stack
            ? { type: 'allin' }
            : { type: 'raise', amount: target, chips: chipSpec },
        ok: true,
      };
    } else {
      confirm = { label: `Suba mínima: ${minRaiseTo}`, ok: false };
    }
  }

  // Solo denominaciones que el jugador tiene (la de 50 aparece si le tocó)
  const myDenoms = ALL_DENOMS.filter((d) => d.value >= 100 || (me.chips[d.value] || 0) > 0);

  return (
    <div className="action-bar">
      {/* Mis fichas reales por denominación, con botón para sumar a la apuesta */}
      <div className="denom-row">
        {myDenoms.map((d) => {
          const left = (me.chips[d.value] || 0) - addedCount(d.value);
          const canAdd = left > 0;
          return (
            <div className={`denom-col${canAdd ? '' : ' denom-off'}`} key={d.value}>
              <button
                className="denom-chip"
                disabled={!canAdd}
                onClick={() => addChip(d.value)}
                aria-label={`Agregar ficha de ${d.value}`}
              >
                <Chip denom={d} size={40} />
              </button>
              <span className="denom-count">×{left}</span>
              <button className="denom-add" disabled={!canAdd} onClick={() => addChip(d.value)}>
                +
              </button>
            </div>
          );
        })}
      </div>

      {/* Apuesta en construcción */}
      {betTotal > 0 && (
        <div className="bet-build">
          <div className="bet-build-chips">
            {betChips.map((v, i) => {
              const d = ALL_DENOMS.find((x) => x.value === v);
              return (
                <button
                  key={i}
                  className="bet-chip"
                  onClick={() => removeAt(i)}
                  title="Tocá para quitar esta ficha"
                >
                  <Chip denom={d} size={26} />
                </button>
              );
            })}
          </div>
          <div className="bet-build-info">
            <span className="bet-total">
              Apuesta: <b>{betTotal}</b>
            </span>
            <button className="link bet-undo" onClick={undo}>
              ↩ Deshacer
            </button>
            <button className="link bet-undo" onClick={() => setBetChips([])}>
              ✕ Limpiar
            </button>
          </div>
        </div>
      )}

      <div className="action-row">
        <button className="btn btn-fold" onClick={() => onAction({ type: 'fold' })}>
          Fold
        </button>
        {betTotal === 0 &&
          (toCall > 0 ? (
            <button className="btn btn-call" onClick={() => onAction({ type: 'call' })}>
              Call {toCall}
              {toCall >= me.stack && ' (all-in)'}
            </button>
          ) : (
            <button className="btn btn-call" onClick={() => onAction({ type: 'check' })}>
              Check
            </button>
          ))}
        {confirm && (
          <button
            className="btn btn-raise"
            disabled={!confirm.ok}
            onClick={() => confirm.ok && onAction(confirm.action)}
          >
            {confirm.label}
          </button>
        )}
        {betTotal === 0 && toCall < me.stack && (
          <button className="btn btn-allin" onClick={() => onAction({ type: 'allin' })}>
            All-in
          </button>
        )}
      </div>
    </div>
  );
}
