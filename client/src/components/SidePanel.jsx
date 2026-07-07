import { useEffect, useRef, useState } from 'react';
import { socket } from '../socket.js';
import { PLAYER_COLORS } from './PlayerSeat.jsx';

// Panel lateral deslizante con pestañas: Chat de la mesa e Historial de manos.
// La solapa queda pegada al borde derecho con un contador de no leídos.
export function SidePanel({ chat, log, myNickname }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('chat'); // chat | log
  const [draft, setDraft] = useState('');
  const [lastSeen, setLastSeen] = useState(chat.length);
  const listRef = useRef(null);

  const unread = Math.max(0, chat.length - lastSeen);
  const chatVisible = open && tab === 'chat';

  // Con el chat a la vista, todo queda leído y scrolleado al final
  useEffect(() => {
    if (chatVisible) {
      setLastSeen(chat.length);
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [chatVisible, chat.length]);

  const send = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    socket.emit('chat', { text });
    setDraft('');
  };

  return (
    <>
      <button
        className="panel-handle"
        onClick={() => setOpen(!open)}
        aria-label="Abrir chat de la mesa"
      >
        💬
        {!chatVisible && unread > 0 && <span className="panel-badge">{unread}</span>}
      </button>

      {open && (
        <div className="side-panel">
          <div className="side-tabs">
            <button
              className={tab === 'chat' ? 'side-tab side-tab-active' : 'side-tab'}
              onClick={() => setTab('chat')}
            >
              Chat{unread > 0 && tab !== 'chat' ? ` (${unread})` : ''}
            </button>
            <button
              className={tab === 'log' ? 'side-tab side-tab-active' : 'side-tab'}
              onClick={() => setTab('log')}
            >
              Historial
            </button>
            <button className="side-close" onClick={() => setOpen(false)} aria-label="Cerrar">
              ✕
            </button>
          </div>

          {tab === 'chat' ? (
            <>
              <div className="chat-list" ref={listRef}>
                {chat.length === 0 && (
                  <p className="chat-empty">Nadie dijo nada todavía… 🌵</p>
                )}
                {chat.map((m, i) => (
                  <div
                    className={`chat-msg${m.nickname === myNickname ? ' chat-msg-mine' : ''}`}
                    key={i}
                  >
                    <span
                      className="chat-author"
                      style={{ color: PLAYER_COLORS[m.colorIdx % PLAYER_COLORS.length] }}
                    >
                      {m.nickname}
                    </span>
                    <span className="chat-text">{m.text}</span>
                  </div>
                ))}
              </div>
              <form className="chat-form" onSubmit={send}>
                <input
                  className="chat-input"
                  value={draft}
                  maxLength={300}
                  placeholder="Escribí algo…"
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button className="chat-send" disabled={!draft.trim()}>
                  ➤
                </button>
              </form>
            </>
          ) : (
            <div className="chat-list side-log">
              {log
                .slice()
                .reverse()
                .map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
