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
    const onDisconnect = () => {
      setState(null);
      setError('Se cortó la conexión con el saloon. Volvé a unirte con el código.');
    };
    socket.on('state', onState);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('state', onState);
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
    else setError('');
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
      onEnd={() => socket.emit('endGame', handleAck)}
      onLeave={() => {
        socket.emit('leaveTable');
        setState(null);
      }}
    />
  );
}
