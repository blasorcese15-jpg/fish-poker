import { useState } from 'react';

export function NicknameScreen({ initial, onDone }) {
  const [nick, setNick] = useState(initial || '');
  const valid = nick.trim().length >= 2;

  return (
    <div className="screen center-screen">
      <div className="brand">
        <img className="cover-img" src="/cover.jpg" alt="Fish Poker" />
        <h1 className="brand-title">Fish Poker</h1>
        <p className="brand-sub">Texas Hold&apos;em entre amigos · fichas virtuales 🤠</p>
      </div>
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onDone(nick.trim());
        }}
      >
        <label className="field-label" htmlFor="nick">
          Tu nickname
        </label>
        <input
          id="nick"
          className="input"
          value={nick}
          maxLength={16}
          placeholder="Ej: TexasTiburón"
          autoFocus
          onChange={(e) => setNick(e.target.value)}
        />
        <button className="btn btn-primary btn-block" disabled={!valid}>
          Entrar al saloon
        </button>
      </form>
    </div>
  );
}
