import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { Table } from './game/table.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, '../../client/dist');
const PORT = process.env.PORT || 3001;

const app = express();
app.use(express.static(CLIENT_DIST));
app.get('/health', (_req, res) => res.json({ ok: true }));
// Fallback SPA
app.use((_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));

const server = http.createServer(app);
const io = new Server(server);

/** @type {Map<string, Table>} */
const tables = new Map();

// Código de sala sin caracteres ambiguos (0/O, 1/I/L)
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () =>
      CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    ).join('');
  } while (tables.has(code));
  return code;
}

function broadcast(table) {
  for (const p of table.players) {
    const s = io.sockets.sockets.get(p.id);
    if (s) s.emit('state', table.sanitizeFor(p.id));
  }
}

function cleanNickname(raw) {
  const nick = String(raw || '').trim().slice(0, 16);
  return nick.length >= 2 ? nick : null;
}

// Una mesa sin nadie conectado sobrevive un rato por si vuelven;
// recién después se libera la memoria.
const EMPTY_TABLE_TTL_MS = 30 * 60 * 1000;

function scheduleCleanup(table) {
  clearTimeout(table._emptyTimer);
  table._emptyTimer = setTimeout(() => {
    if (table.isEmpty()) {
      table.destroy();
      tables.delete(table.code);
    }
  }, EMPTY_TABLE_TTL_MS);
}

function leaveTable(socket) {
  const code = socket.data.tableCode;
  if (!code) return;
  const table = tables.get(code);
  socket.data.tableCode = null;
  if (!table) return;
  // Salir de la app no saca del juego: el asiento queda guardado
  table.disconnect(socket.id);
  if (table.isEmpty()) scheduleCleanup(table);
  broadcast(table);
}

io.on('connection', (socket) => {
  socket.on('createTable', ({ nickname, config }, cb = () => {}) => {
    const nick = cleanNickname(nickname);
    if (!nick) return cb({ error: 'Nickname inválido (mínimo 2 caracteres)' });
    const code = genCode();
    const table = new Table(code, config || {}, () => broadcast(table));
    tables.set(code, table);
    table.addPlayer(socket.id, nick);
    socket.data.tableCode = code;
    cb({ ok: true, code });
    broadcast(table);
  });

  socket.on('joinTable', ({ nickname, code }, cb = () => {}) => {
    const nick = cleanNickname(nickname);
    if (!nick) return cb({ error: 'Nickname inválido (mínimo 2 caracteres)' });
    const table = tables.get(String(code || '').trim().toUpperCase());
    if (!table) return cb({ error: 'No existe una mesa con ese código' });
    const res = table.addPlayer(socket.id, nick);
    if (res.error) return cb(res);
    clearTimeout(table._emptyTimer);
    socket.data.tableCode = table.code;
    cb({ ok: true, code: table.code, reclaimed: res.reclaimed });
    broadcast(table);
  });

  socket.on('startHand', () => {
    const table = tables.get(socket.data.tableCode);
    if (!table || table.hostId !== socket.id) return;
    if (table.phase !== 'waiting' && table.phase !== 'showdown') return;
    table.startHand();
    broadcast(table);
  });

  socket.on('action', (payload, cb = () => {}) => {
    const table = tables.get(socket.data.tableCode);
    if (!table) return cb({ error: 'No estás en una mesa' });
    const res = table.handleAction(socket.id, payload || {});
    cb(res);
    broadcast(table);
  });

  socket.on('grantChips', ({ targetId, chips }, cb = () => {}) => {
    const table = tables.get(socket.data.tableCode);
    if (!table) return cb({ error: 'No estás en una mesa' });
    const res = table.grantChips(socket.id, targetId, chips || {});
    cb(res);
    broadcast(table);
  });

  socket.on('kickPlayer', ({ targetId }, cb = () => {}) => {
    const table = tables.get(socket.data.tableCode);
    if (!table) return cb({ error: 'No estás en una mesa' });
    const res = table.kickPlayer(socket.id, targetId);
    cb(res);
    if (res.ok) {
      const s = io.sockets.sockets.get(targetId);
      if (s) {
        s.data.tableCode = null;
        s.emit('kicked');
      }
    }
    broadcast(table);
  });

  socket.on('chat', ({ text }, cb = () => {}) => {
    const table = tables.get(socket.data.tableCode);
    if (!table) return cb({ error: 'No estás en una mesa' });
    const res = table.addChat(socket.id, text);
    cb(res);
    if (res.ok) broadcast(table);
  });

  socket.on('endGame', (cb = () => {}) => {
    const table = tables.get(socket.data.tableCode);
    if (!table) return cb({ error: 'No estás en una mesa' });
    const res = table.endGame(socket.id);
    cb(res);
    broadcast(table);
  });

  socket.on('rebuy', () => {
    const table = tables.get(socket.data.tableCode);
    if (!table) return;
    table.rebuy(socket.id);
    broadcast(table);
  });

  // El ganador de la mano puede pedir la salsa 🍅 (efecto festivo para todos)
  socket.on('salsa', () => {
    const table = tables.get(socket.data.tableCode);
    if (!table || table.phase !== 'showdown' || !table.result?.pots) return;
    const p = table.players.find((q) => q.id === socket.id);
    if (!p || !table.result.pots.some((pot) => pot.winners.includes(p.nickname))) return;
    for (const q of table.players) {
      const s = io.sockets.sockets.get(q.id);
      if (s) s.emit('salsa', { nickname: p.nickname });
    }
  });

  socket.on('leaveTable', () => leaveTable(socket));
  socket.on('disconnect', () => leaveTable(socket));
});

server.listen(PORT, () => {
  console.log(`🐟🤠 Fish Poker server en http://localhost:${PORT}`);
});
