import { useEffect, useState } from 'react';
import { socket } from './socket.js';
import { NicknameScreen } from './components/NicknameScreen.jsx';
import { LobbyScreen } from './components/LobbyScreen.jsx';
import { TableScreen } from './components/TableScreen.jsx';

// Deep link de invitación: /?mesa=CODIGO precarga el código en "unirme"
const inviteCode = new URLSearchParams(window.location.search).get('mesa') || '';

export default function App() {
  const [nickname, setNickname] = useState(localStorage.getItem('fp-nick') || '');
  const [editingNick, setEditingNick] = useState(!nickname);
  const [state, setState] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const onState = (s) => setState(s);
    const onKicked = () => {
      localStorage.removeItem('fp-table');
      setState(null);
      setError('El admin te sacó de la mesa.');
    };
    // Si se corta la conexión, socket.io reintenta solo; al reconectar
    // recuperamos el asiento guardado (mismo nickname en la misma mesa).
    const onConnect = () => {
      const code = localStorage.getItem('fp-table');
      const nick = localStorage.getItem('fp-nick');
      if (code && nick) {
        socket.emit('joinTable', { nickname: nick, code }, (res) => {
          if (res?.error) localStorage.removeItem('fp-table');
        });
      }
    };
    const onDisconnect = () => {
      setState(null);
      if (localStorage.getItem('fp-table'))
        setError('Se cortó la conexión… reconectando, tu asiento está guardado.');
    };
    socket.on('state', onState);
    socket.on('kicked', onKicked);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) onConnect();
    return () => {
      socket.off('state', onState);
      socket.off('kicked', onKicked);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const saveNick = (nick) => {
    setNickname(nick);
    localStorage.setItem('fp-nick', nick);
    setEditingNick(false);
  };

  const handleAck = (res) => {
    if (res?.error) setError(res.error);
    else {
      setError('');
      if (res?.code) localStorage.setItem('fp-table', res.code);
    }
  };

  if (editingNick) return <NicknameScreen initial={nickname} onDone={saveNick} />;

  if (!state)
    return (
      <LobbyScreen
        nickname={nickname}
        initialCode={inviteCode}
        error={error}
        onChangeNick={() => setEditingNick(true)}
        onCreate={(config) => socket.emit('createTable', { nickname, config }, handleAck)}
        onJoin={(code) => socket.emit('joinTable', { nickname, code }, handleAck)}
      />
    );

  return (
    <TableScreen
      state={state}
      myId={socket.id}
      onAction={(a) => socket.emit('action', a, handleAck)}
      onStart={() => socket.emit('startHand')}
      onRebuy={() => socket.emit('rebuy')}
      onGrant={(targetId, chips, done) =>
        socket.emit('grantChips', { targetId, chips }, (res) => {
          handleAck(res);
          done?.();
        })
      }
      onKick={(targetId) => socket.emit('kickPlayer', { targetId }, handleAck)}
      onEnd={() => socket.emit('endGame', handleAck)}
      onLeave={() => {
        socket.emit('leaveTable');
        localStorage.removeItem('fp-table');
        setState(null);
      }}
    />
  );
}
