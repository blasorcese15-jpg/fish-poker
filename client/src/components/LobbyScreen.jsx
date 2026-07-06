import { useState } from 'react';

const DEFAULT_CONFIG = {
  smallBlind: 100,
  bigBlind: 200,
  maxPlayers: 9,
  turnTimer: 0,
};

export function LobbyScreen({ nickname, initialCode, onCreate, onJoin, onChangeNick, error }) {
  const [tab, setTab] = useState('join'); // join | create
  const [code, setCode] = useState(initialCode || '');
  const [cfg, setCfg] = useState(DEFAULT_CONFIG);

  const set = (key) => (e) => setCfg({ ...cfg, [key]: Number(e.target.value) });

  return (
    <div className="screen center-screen">
      <div className="brand brand-compact">
        <h1 className="brand-title">Fish Poker</h1>
        <p className="brand-sub">
          Hola, <b>{nickname}</b>{' '}
          <button className="link" onClick={onChangeNick}>
            cambiar
          </button>
        </p>
      </div>

      <div className="panel">
        <div className="tabs">
          <button className={tab === 'join' ? 'tab tab-active' : 'tab'} onClick={() => setTab('join')}>
            Unirme a mesa
          </button>
          <button
            className={tab === 'create' ? 'tab tab-active' : 'tab'}
            onClick={() => setTab('create')}
          >
            Crear mesa
          </button>
        </div>

        {tab === 'join' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) onJoin(code.trim().toUpperCase());
            }}
          >
            <label className="field-label" htmlFor="code">
              Código de la mesa
            </label>
            <input
              id="code"
              className="input input-code"
              value={code}
              maxLength={5}
              placeholder="ABC12"
              autoCapitalize="characters"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button className="btn btn-primary btn-block" disabled={code.trim().length < 5}>
              Sentarme 🪑
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onCreate(cfg);
            }}
          >
            <div className="cfg-grid">
              <label className="cfg-field">
                <span>Ciega chica</span>
                <select className="input" value={cfg.smallBlind} onChange={set('smallBlind')}>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                  <option value={500}>500</option>
                </select>
              </label>
              <label className="cfg-field">
                <span>Ciega grande</span>
                <select className="input" value={cfg.bigBlind} onChange={set('bigBlind')}>
                  <option value={200}>200</option>
                  <option value={500}>500</option>
                  <option value={1000}>1000</option>
                </select>
              </label>
              <label className="cfg-field">
                <span>Jugadores máx.</span>
                <select className="input" value={cfg.maxPlayers} onChange={set('maxPlayers')}>
                  {[2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="cfg-field cfg-field-wide">
                <span>Timer por turno</span>
                <select className="input" value={cfg.turnTimer} onChange={set('turnTimer')}>
                  <option value={0}>Sin timer</option>
                  <option value={20}>20 segundos</option>
                  <option value={30}>30 segundos</option>
                  <option value={60}>60 segundos</option>
                </select>
              </label>
            </div>
            <p className="buyin-note">
              Buy-in: <b>10.000</b> en fichas
              <br />
              <span>3×1000 · 4×750 · 4×500 · 4×250 · 10×100</span>
            </p>
            <button className="btn btn-primary btn-block">Abrir la mesa 🤠</button>
          </form>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
