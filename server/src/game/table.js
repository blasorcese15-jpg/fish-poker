// Máquina de estados de una mesa de Texas Hold'em.
// Todo el estado vive en memoria; la mesa muere cuando se van todos.
//
// Las fichas son FÍSICAS: cada jugador tiene una composición real por
// denominación, las apuestas mueven fichas concretas al pozo y el ganador
// recibe esas mismas fichas. La ficha de 50 es interna (gris): no se
// reparte al inicio, solo aparece si un pozo dividido deja restos.

import { newDeck } from './deck.js';
import { bestHand, compareRanks } from './handEval.js';

const AUTO_NEXT_HAND_MS = 8000;
const DISCONNECT_ACT_MS = 1500;
const RUNOUT_STEP_MS = 2400; // pausa dramática entre calles cuando hay all-in
const REVEAL_DECISION_MS = 10000; // tiempo para decidir mostrar o no
const BETTING_PHASES = ['preflop', 'flop', 'turn', 'river'];

export const DENOMS = [1000, 750, 500, 250, 100, 50];
// Reparto inicial: 3×1000, 4×750, 4×500, 4×250, 10×100 = 10.000
export const INITIAL_CHIPS = { 1000: 3, 750: 4, 500: 4, 250: 4, 100: 10 };
export const BUY_IN = 10000;

export function chipsValue(c) {
  return DENOMS.reduce((s, d) => s + (c[d] || 0) * d, 0);
}

function addChips(target, add) {
  for (const d of DENOMS) if (add[d]) target[d] = (target[d] || 0) + add[d];
}

function subChips(target, sub) {
  for (const d of DENOMS) if (sub[d]) target[d] -= sub[d];
}

function hasChips(chips, spec) {
  return DENOMS.every((d) => (spec[d] || 0) <= (chips[d] || 0));
}

// Composición exacta de `amount` con las fichas disponibles (DFS con memo).
export function composeExact(chips, amount) {
  if (amount === 0) return {};
  if (amount < 0 || amount > chipsValue(chips)) return null;
  const failed = new Set();
  const res = {};
  const dfs = (i, rest) => {
    if (rest === 0) return true;
    if (i >= DENOMS.length) return false;
    const key = i * 10_000_000 + rest;
    if (failed.has(key)) return false;
    const d = DENOMS[i];
    const max = Math.min(chips[d] || 0, Math.floor(rest / d));
    for (let k = max; k >= 0; k--) {
      res[d] = k;
      if (dfs(i + 1, rest - k * d)) return true;
    }
    res[d] = 0;
    failed.add(key);
    return false;
  };
  return dfs(0, amount) ? Object.fromEntries(DENOMS.filter((d) => res[d]).map((d) => [d, res[d]])) : null;
}

// El banco arma cualquier valor (múltiplo de 50) con fichas nuevas.
export function bankCompose(value) {
  const out = {};
  let rest = value;
  if (rest % 100 === 50) {
    out[50] = 1;
    rest -= 50;
  }
  out[1000] = Math.floor(rest / 1000);
  rest %= 1000;
  if (rest >= 500) {
    out[500] = 1;
    rest -= 500;
  }
  out[100] = rest / 100;
  return Object.fromEntries(Object.entries(out).filter(([, n]) => n > 0));
}

export class Table {
  constructor(code, config, onUpdate) {
    this.code = code;
    this.config = {
      smallBlind: Math.max(Math.floor(config.smallBlind) || 100, 50),
      bigBlind: Math.max(Math.floor(config.bigBlind) || 200, 100),
      buyIn: BUY_IN, // fijo: la composición inicial de fichas es fija
      maxPlayers: Math.min(Math.max(Math.floor(config.maxPlayers) || 9, 2), 9),
      turnTimer: Math.min(Math.max(Math.floor(config.turnTimer) || 0, 0), 120), // segundos, 0 = sin timer
    };
    // Overrides para tests (acelerar animaciones del motor)
    this._runoutMs = config.runoutMs ?? RUNOUT_STEP_MS;
    this._revealMs = config.revealMs ?? REVEAL_DECISION_MS;
    this.onUpdate = onUpdate;
    this.hostId = null;
    this.players = [];
    this.phase = 'waiting'; // waiting | preflop | flop | turn | river | reveal | showdown | ended
    this.runout = false; // all-in: cartas expuestas y calles con pausa
    this.revealTurnId = null; // de quién es el turno de mostrar (fase reveal)
    this.lastAggressorIdx = -1; // último que apostó/subió en la calle actual
    this._runoutTimer = null;
    this._revealTimer = null;
    this.community = [];
    this.deck = [];
    this.potChips = {}; // fichas físicas ya recolectadas en el pozo
    this.dealerIdx = -1;
    this.toActIdx = -1;
    this.currentBet = 0;
    this.minRaise = this.config.bigBlind;
    this.result = null;
    this.log = [];
    this.chat = [];
    this.handNum = 0;
    this.turnDeadline = null;
    this._turnTimer = null;
    this._nextHandTimer = null;
  }

  // ── Jugadores ────────────────────────────────────────────────

  addPlayer(id, nickname) {
    if (this.phase === 'ended') return { error: 'La partida ya terminó' };
    // Reincorporación: el mismo nickname con el asiento desconectado
    // recupera su lugar, su stack y sus fichas tal como los dejó.
    const existing = this.players.find(
      (p) => p.nickname.toLowerCase() === nickname.toLowerCase()
    );
    if (existing) {
      if (existing.connected) return { error: 'Ese nickname ya está en uso en esta mesa' };
      const oldId = existing.id;
      existing.id = id;
      existing.connected = true;
      if (this.hostId === oldId) this.hostId = id;
      this._log(`${existing.nickname} volvió a la mesa`);
      return { ok: true, reclaimed: true };
    }
    // Los desconectados conservan su asiento, así que cuentan para el límite
    if (this.players.length >= this.config.maxPlayers)
      return { error: 'La mesa está llena' };
    // Color distintivo: el índice libre más bajo (hasta 9 jugadores)
    const used = new Set(this.players.map((p) => p.colorIdx));
    let colorIdx = 0;
    while (used.has(colorIdx)) colorIdx++;
    const player = {
      colorIdx,
      id,
      nickname,
      stack: BUY_IN,
      chips: { ...INITIAL_CHIPS },
      betChips: {}, // fichas apostadas en la calle actual
      cards: [],
      bet: 0,
      totalBet: 0,
      folded: false,
      allIn: false,
      acted: false,
      inHand: false,
      connected: true,
      lastAction: null,
    };
    this.players.push(player);
    if (!this.hostId) this.hostId = id;
    this._log(`${nickname} se sentó a la mesa`);
    return { ok: true };
  }

  // Salir de la app NO saca del juego: el asiento, el stack y las fichas
  // quedan guardados hasta que vuelva (mismo nickname) o el admin lo saque.
  disconnect(id) {
    const idx = this.players.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const p = this.players[idx];
    if (!p.connected) return;
    p.connected = false;
    this._log(`${p.nickname} se desconectó (su asiento queda guardado)`);

    // Si estaba en medio de una mano, se foldea; sus fichas apostadas quedan
    if (this._inBettingPhase() && p.inHand && !p.folded) {
      if (this.toActIdx === idx) {
        this._autoAct(id);
      } else {
        p.folded = true;
        p.lastAction = 'fold';
        this._checkUncontested();
      }
    } else if (this.phase === 'reveal' && this.revealTurnId === id) {
      // Se fue en su turno de mostrar: muestra automáticamente (no pierde el pozo)
      this.handleReveal(id, true);
    }
  }

  // Única forma de sacar a alguien de la mesa: decisión del admin.
  kickPlayer(byId, targetId) {
    if (byId !== this.hostId) return { error: 'Solo el admin puede sacar jugadores' };
    if (targetId === byId) return { error: 'El admin no puede sacarse a sí mismo' };
    const target = this.players.find((p) => p.id === targetId);
    if (!target) return { error: 'Jugador no encontrado' };

    // Si está en la mano actual, primero se lo foldea
    const idx = this.players.indexOf(target);
    if (this._inBettingPhase() && target.inHand && !target.folded) {
      if (this.toActIdx === idx) {
        this._autoAct(targetId);
      } else {
        target.folded = true;
        target.lastAction = 'fold';
        this._checkUncontested();
      }
    }

    // Puede haber cambiado el estado (mano terminada): recalcular la posición
    const i = this.players.indexOf(target);
    if (i !== -1) {
      this.players.splice(i, 1);
      if (this.dealerIdx >= i) this.dealerIdx--;
      if (this.toActIdx > i) this.toActIdx--;
    }
    this._log(`⭐ El admin sacó a ${target.nickname} de la mesa`);
    return { ok: true };
  }

  // Chat interno de la mesa
  addChat(id, text) {
    const p = this.players.find((q) => q.id === id);
    if (!p) return { error: 'No estás en la mesa' };
    const msg = String(text || '').trim().slice(0, 300);
    if (!msg) return { error: 'Mensaje vacío' };
    this.chat.push({ nickname: p.nickname, colorIdx: p.colorIdx, text: msg, ts: Date.now() });
    if (this.chat.length > 100) this.chat.shift();
    return { ok: true };
  }

  // El admin (creador de la mesa) acredita fichas a cualquier jugador,
  // en cualquier momento de la partida. `spec` es {denominación: cantidad}.
  grantChips(byId, targetId, spec) {
    if (byId !== this.hostId) return { error: 'Solo el admin puede asignar fichas' };
    if (this.phase === 'ended') return { error: 'La partida ya terminó' };
    const p = this.players.find((q) => q.id === targetId);
    if (!p) return { error: 'Jugador no encontrado' };
    const clean = {};
    for (const d of DENOMS) {
      const n = Math.floor(spec?.[d] || 0);
      if (n < 0) return { error: 'Cantidad inválida' };
      if (n > 0) clean[d] = n;
    }
    const amt = chipsValue(clean);
    if (amt < 50 || amt > 1_000_000) return { error: 'Cantidad inválida' };
    addChips(p.chips, clean);
    p.stack += amt;
    this._log(`⭐ El admin acreditó ${amt} fichas a ${p.nickname}`);
    return { ok: true };
  }

  // Única forma de terminar la partida: decisión explícita del admin.
  endGame(byId) {
    if (byId !== this.hostId) return { error: 'Solo el admin puede finalizar la partida' };
    if (this.phase === 'ended') return { error: 'La partida ya terminó' };
    this._clearTurnTimer();
    clearTimeout(this._nextHandTimer);
    clearTimeout(this._runoutTimer);
    clearTimeout(this._revealTimer);
    this.runout = false;
    this.revealTurnId = null;
    // Si había una mano en curso, cada uno recupera lo apostado en ella
    for (const p of this.players) {
      if (p.totalBet > 0) {
        addChips(p.chips, p.betChips); // lo apostado en la calle actual, tal cual
        const fromPot = p.totalBet - chipsValue(p.betChips);
        if (fromPot > 0) this._takeFromPot(fromPot, p);
        p.stack += p.totalBet;
      }
      p.betChips = {};
      p.totalBet = 0;
      p.bet = 0;
      p.cards = [];
      p.inHand = false;
      p.folded = false;
      p.lastAction = null;
    }
    this.potChips = {};
    this.phase = 'ended';
    this.toActIdx = -1;
    this.community = [];
    this.result = {
      type: 'ended',
      standings: [...this.players]
        .sort((a, b) => b.stack - a.stack)
        .map((p) => ({ nickname: p.nickname, stack: p.stack, colorIdx: p.colorIdx })),
    };
    this._log('🔚 El admin finalizó la partida');
    return { ok: true };
  }

  rebuy(id) {
    const p = this.players.find((q) => q.id === id);
    if (!p || p.stack > 0) return;
    if (this._inBettingPhase() && p.inHand) return; // no en medio de una mano
    if (this.phase === 'ended') return;
    p.stack = BUY_IN;
    p.chips = { ...INITIAL_CHIPS };
    this._log(`${p.nickname} recompró ${BUY_IN} fichas`);
  }

  isEmpty() {
    return this.players.every((p) => !p.connected);
  }

  // ── Ciclo de la mano ─────────────────────────────────────────

  startHand() {
    if (this.phase === 'ended') return;
    clearTimeout(this._nextHandTimer);
    this._clearTurnTimer();

    // Los ausentes conservan asiento y fichas, pero no juegan la mano
    // (no se les reparte ni pagan ciegas hasta que vuelvan)
    const eligible = this.players.filter((p) => p.connected && p.stack > 0);
    if (eligible.length < 2) {
      this.phase = 'waiting';
      this.result = null;
      this.toActIdx = -1;
      for (const p of this.players) {
        p.cards = [];
        p.inHand = false;
        p.folded = false;
        p.lastAction = null;
      }
      return;
    }

    this.handNum++;
    this.result = null;
    this.community = [];
    this.deck = newDeck();
    this.potChips = {};
    this.currentBet = 0;
    this.minRaise = this.config.bigBlind;
    this.runout = false;
    this.revealTurnId = null;
    this.lastAggressorIdx = -1;
    clearTimeout(this._runoutTimer);
    clearTimeout(this._revealTimer);

    for (const p of this.players) {
      p.cards = [];
      p.bet = 0;
      p.totalBet = 0;
      p.betChips = {};
      p.folded = false;
      p.allIn = false;
      p.acted = false;
      p.lastAction = null;
      p.showCards = null;
      p.inHand = p.connected && p.stack > 0;
    }

    this.dealerIdx = this._nextIdx(this.dealerIdx, (p) => p.inHand);
    for (const p of this.players) {
      if (p.inHand) p.cards = [this.deck.pop(), this.deck.pop()];
    }

    // Blinds (heads-up: el dealer es la ciega chica)
    const inHandCount = this.players.filter((p) => p.inHand).length;
    const sbIdx =
      inHandCount === 2 ? this.dealerIdx : this._nextIdx(this.dealerIdx, (p) => p.inHand);
    const bbIdx = this._nextIdx(sbIdx, (p) => p.inHand);
    this._postBlind(this.players[sbIdx], this.config.smallBlind, 'ciega chica');
    this._postBlind(this.players[bbIdx], this.config.bigBlind, 'ciega grande');
    this.currentBet = this.config.bigBlind;

    this.phase = 'preflop';
    this._log(`── Mano #${this.handNum} · reparte ${this.players[this.dealerIdx].nickname} ──`);
    this._advanceTurn(bbIdx);
  }

  _postBlind(p, amount, label) {
    const pay = Math.min(amount, p.stack);
    this._payChips(p, pay);
    if (p.stack === 0) p.allIn = true;
    this._log(`${p.nickname} pone ${pay} de ${label}`);
  }

  // Mueve `amount` del stack del jugador a su apuesta, con fichas físicas.
  // `spec` (opcional) son las fichas que eligió en la UI.
  _payChips(p, amount, spec) {
    let used = null;
    if (amount === chipsValue(p.chips)) {
      used = { ...p.chips }; // all-in: van todas
    } else if (spec) {
      const clean = {};
      for (const d of DENOMS) {
        const n = Math.floor(spec[d] || 0);
        if (n > 0) clean[d] = n;
      }
      if (hasChips(p.chips, clean) && chipsValue(clean) === amount) used = clean;
    }
    if (!used) used = composeExact(p.chips, amount);
    if (!used) {
      // El banco le cambia fichas (mismo valor, otra composición) y reintenta
      p.chips = bankCompose(chipsValue(p.chips));
      used = composeExact(p.chips, amount);
    }
    if (!used) {
      // Último recurso: el banco arma la apuesta y recompone el resto
      used = bankCompose(amount);
      p.chips = bankCompose(chipsValue(p.chips) - amount);
    } else {
      subChips(p.chips, used);
    }
    addChips(p.betChips, used);
    p.stack -= amount;
    p.bet += amount;
    p.totalBet += amount;
  }

  // Las apuestas de la calle pasan físicamente al pozo
  _collectBets() {
    for (const p of this.players) {
      addChips(this.potChips, p.betChips);
      p.betChips = {};
    }
  }

  // Saca `amount` del pozo físico y lo entrega a `p` (fichas tal cual;
  // si el reparto exacto es imposible, el banco hace cambio).
  _takeFromPot(amount, p) {
    if (amount <= 0) return;
    let chips = composeExact(this.potChips, amount);
    if (chips) {
      subChips(this.potChips, chips);
    } else {
      chips = bankCompose(amount);
      this.potChips = bankCompose(Math.max(0, chipsValue(this.potChips) - amount));
    }
    addChips(p.chips, chips);
  }

  // ── Acciones ─────────────────────────────────────────────────

  handleAction(id, action) {
    if (!this._inBettingPhase()) return { error: 'No hay una ronda de apuestas activa' };
    const p = this.players[this.toActIdx];
    if (!p || p.id !== id) return { error: 'No es tu turno' };

    const toCall = this.currentBet - p.bet;
    const type = action?.type;
    const spec = action?.chips;

    if (type === 'fold') {
      p.folded = true;
      p.lastAction = 'fold';
      this._log(`${p.nickname} se retira`);
    } else if (type === 'check') {
      if (toCall > 0) return { error: 'No podés pasar, hay una apuesta que igualar' };
      p.lastAction = 'check';
      this._log(`${p.nickname} pasa`);
    } else if (type === 'call') {
      if (toCall <= 0) {
        p.lastAction = 'check';
        this._log(`${p.nickname} pasa`);
      } else {
        const pay = Math.min(toCall, p.stack);
        this._payChips(p, pay, spec);
        if (p.stack === 0) p.allIn = true;
        p.lastAction = p.allIn ? 'all-in' : 'call';
        this._log(`${p.nickname} iguala ${pay}${p.allIn ? ' (all-in)' : ''}`);
      }
    } else if (type === 'raise' || type === 'allin') {
      const maxTo = p.bet + p.stack;
      let target = type === 'allin' ? maxTo : Math.floor(action.amount) || 0;
      if (target >= maxTo) target = maxTo;

      if (target <= this.currentBet) {
        // All-in que no llega a subir: cuenta como call por menos
        if (target < maxTo)
          return { error: 'La suba tiene que superar la apuesta actual' };
        this._payChips(p, p.stack, spec);
        p.allIn = true;
        p.lastAction = 'all-in';
        this._log(`${p.nickname} va all-in con ${p.bet}`);
      } else {
        const minTo = Math.min(this.currentBet + this.minRaise, maxTo);
        if (target < minTo) target = minTo;
        this._payChips(p, target - p.bet, spec);
        if (p.stack === 0) p.allIn = true;
        const raiseSize = target - this.currentBet;
        // Solo una suba completa reabre la ronda y actualiza la suba mínima
        if (raiseSize >= this.minRaise) {
          this.minRaise = raiseSize;
          for (const q of this.players) if (q !== p) q.acted = false;
        }
        this.currentBet = target;
        this.lastAggressorIdx = this.toActIdx; // reglamento §12: muestra primero el último que apostó
        p.lastAction = p.allIn ? 'all-in' : 'raise';
        this._log(`${p.nickname} sube a ${target}${p.allIn ? ' (all-in)' : ''}`);
      }
    } else {
      return { error: 'Acción inválida' };
    }

    p.acted = true;
    this._clearTurnTimer();
    this._advanceTurn(this.toActIdx);
    return { ok: true };
  }

  // ── Flujo de la ronda ────────────────────────────────────────

  _advanceTurn(fromIdx) {
    if (this._checkUncontested()) return;

    const needsToAct = (p) =>
      p.inHand && !p.folded && !p.allIn && (!p.acted || p.bet < this.currentBet);
    const next = this._nextIdx(fromIdx, needsToAct);

    if (next !== -1) {
      this.toActIdx = next;
      this._startTurnTimer();
      return;
    }
    this._endStreet();
  }

  _checkUncontested() {
    const alive = this.players.filter((p) => p.inHand && !p.folded);
    if (this._inBettingPhase() && alive.length === 1) {
      this._awardUncontested(alive[0]);
      return true;
    }
    return false;
  }

  _endStreet() {
    this.toActIdx = -1;
    this._clearTurnTimer();
    this._collectBets();
    for (const p of this.players) {
      p.bet = 0;
      p.acted = false;
      // La etiqueta de acción no arrastra a la calle siguiente (salvo estados permanentes)
      if (p.lastAction !== 'fold' && p.lastAction !== 'all-in') p.lastAction = null;
    }
    this.currentBet = 0;
    this.minRaise = this.config.bigBlind;

    const alive = this.players.filter((p) => p.inHand && !p.folded);
    const canAct = alive.filter((p) => !p.allIn);

    // All-in: se exponen las cartas y las calles restantes salen con pausa
    if (canAct.length <= 1) {
      this._startRunout();
      return;
    }
    // River completo con apuestas cerradas: ronda de mostrar cartas
    if (this.phase === 'river') {
      this._startReveal();
      return;
    }

    this._burnAndDeal();
    this.phase =
      this.phase === 'preflop' ? 'flop' : this.phase === 'flop' ? 'turn' : 'river';
    this.lastAggressorIdx = -1; // cada calle arranca sin agresor
    this._log(`Se reparte el ${this.phase}`);
    this._advanceTurn(this.dealerIdx);
  }

  // All-in: las cartas quedan expuestas y el flop/turn/river salen con una
  // pausa dramática entre calle y calle antes del showdown.
  _startRunout() {
    this.runout = true;
    this.toActIdx = -1;
    if (this.community.length < 5) this._log('¡All-in! Se muestran las cartas…');
    const step = () => {
      if (this.phase === 'ended') return;
      if (this.community.length < 5) {
        this._burnAndDeal();
        this.phase =
          this.community.length === 3 ? 'flop' : this.community.length === 4 ? 'turn' : 'river';
        this._log(`Se reparte el ${this.phase}`);
        this.onUpdate();
        this._runoutTimer = setTimeout(step, this._runoutMs);
      } else {
        this._showdown();
        this.onUpdate();
      }
    };
    this._runoutTimer = setTimeout(step, this._runoutMs);
  }

  // Ronda de mostrar (reglamento §12): en orden, empezando por el último
  // que apostó, cada jugador decide si muestra sus cartas o las tira.
  // El que no muestra renuncia al pozo; si queda uno solo, gana sin mostrar.
  _startReveal() {
    this.phase = 'reveal';
    this.toActIdx = -1;
    const alive = (p) => p.inHand && !p.folded;
    const startIdx =
      this.lastAggressorIdx >= 0 && alive(this.players[this.lastAggressorIdx] || {})
        ? this.lastAggressorIdx
        : this._nextIdx(this.dealerIdx, alive);
    const queue = [this.players[startIdx].id];
    let idx = startIdx;
    for (;;) {
      idx = this._nextIdx(idx, alive);
      if (idx === -1 || idx === startIdx) break;
      queue.push(this.players[idx].id);
    }
    this._revealQueue = queue;
    this._log('Ronda de mostrar cartas');
    this._nextRevealTurn();
  }

  _nextRevealTurn() {
    clearTimeout(this._revealTimer);
    const contenders = this.players.filter((p) => p.inHand && !p.folded);
    if (contenders.length === 1) {
      // Todos los demás tiraron: gana sin obligación de mostrar (§12)
      this.revealTurnId = null;
      this.turnDeadline = null;
      this._awardUncontested(contenders[0]);
      return;
    }
    const next = this._revealQueue.find((id) => {
      const p = this.players.find((q) => q.id === id);
      return p && p.inHand && !p.folded && p.showCards === null;
    });
    if (!next) {
      this.revealTurnId = null;
      this.turnDeadline = null;
      this._showdown();
      return;
    }
    this.revealTurnId = next;
    const p = this.players.find((q) => q.id === next);
    const ms = p.connected ? this._revealMs : DISCONNECT_ACT_MS;
    this.turnDeadline = Date.now() + ms;
    this._revealTimer = setTimeout(() => {
      this.handleReveal(next, true); // por defecto muestra (nadie pierde el pozo por descuido)
      this.onUpdate();
    }, ms);
  }

  handleReveal(id, show) {
    if (this.phase !== 'reveal') return { error: 'No es el momento de mostrar cartas' };
    if (this.revealTurnId !== id) return { error: 'No es tu turno de mostrar' };
    const p = this.players.find((q) => q.id === id);
    if (!p) return { error: 'Jugador no encontrado' };
    clearTimeout(this._revealTimer);
    p.showCards = !!show;
    if (show) {
      this._log(`${p.nickname} muestra sus cartas`);
    } else {
      // Tirar las cartas sin mostrar = renunciar al pozo
      p.folded = true;
      p.lastAction = 'muck';
      this._log(`${p.nickname} tira sus cartas sin mostrar`);
    }
    this._nextRevealTurn();
    return { ok: true };
  }

  // Reglamento §6/8/10: se quema la primera carta del mazo antes de servir
  // cada grupo de cartas comunitarias.
  _burnAndDeal() {
    this.deck.pop();
    if (this.community.length === 0) {
      this.community.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
    } else {
      this.community.push(this.deck.pop());
    }
  }

  // ── Resolución de la mano ────────────────────────────────────

  _awardUncontested(winner) {
    this._collectBets();
    const total = this.players.reduce((s, p) => s + p.totalBet, 0);
    // El ganador se lleva las fichas del pozo tal cual fueron apostadas
    addChips(winner.chips, this.potChips);
    this.potChips = {};
    winner.stack += total;
    this.result = {
      type: 'uncontested',
      pots: [{ amount: total, winners: [winner.nickname] }],
      hands: [],
    };
    this._log(`${winner.nickname} gana ${total} sin mostrar`);
    this._finishHand();
  }

  _showdown() {
    this._collectBets();
    const alive = this.players.filter((p) => p.inHand && !p.folded);
    const evals = new Map(
      alive.map((p) => [p.id, bestHand([...p.cards, ...this.community])])
    );

    const pots = this._buildPots();
    const potResults = [];
    for (const pot of pots) {
      let bestRank = null;
      for (const p of pot.eligible) {
        const r = evals.get(p.id).rank;
        if (!bestRank || compareRanks(r, bestRank) > 0) bestRank = r;
      }
      const winners = pot.eligible.filter(
        (p) => compareRanks(evals.get(p.id).rank, bestRank) === 0
      );
      // Reparto en múltiplos de 50 (la ficha más chica que existe);
      // los restos se entregan de a 50 empezando por el primer ganador.
      const share = Math.floor(pot.amount / winners.length / 50) * 50;
      let remainder = pot.amount - share * winners.length;
      for (const w of winners) {
        let winAmount = share;
        if (remainder >= 50) {
          winAmount += 50;
          remainder -= 50;
        }
        // Las fichas del pozo pasan físicamente al ganador
        this._takeFromPot(winAmount, w);
        w.stack += winAmount;
      }
      potResults.push({ amount: pot.amount, winners: winners.map((w) => w.nickname) });
      this._log(
        `${winners.map((w) => w.nickname).join(' y ')} gana${winners.length > 1 ? 'n' : ''} ` +
          `${pot.amount} con ${evals.get(winners[0].id).name}`
      );
    }

    this.result = {
      type: 'showdown',
      pots: potResults,
      hands: alive.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        cards: p.cards,
        handName: evals.get(p.id).name,
      })),
    };
    this._finishHand();
  }

  // Arma pozo principal y side pots a partir de lo aportado por cada jugador.
  _buildPots() {
    const contrib = this.players.map((p) => ({ p, left: p.totalBet }));
    const pots = [];
    for (;;) {
      const aliveIn = contrib.filter((c) => c.left > 0 && c.p.inHand && !c.p.folded);
      if (aliveIn.length === 0) {
        // Fichas muertas restantes (folds tardíos) van al último pozo
        const rest = contrib.reduce((s, c) => s + c.left, 0);
        if (rest > 0 && pots.length > 0) pots[pots.length - 1].amount += rest;
        break;
      }
      const level = Math.min(...aliveIn.map((c) => c.left));
      let amount = 0;
      for (const c of contrib) {
        const take = Math.min(c.left, level);
        c.left -= take;
        amount += take;
      }
      pots.push({ amount, eligible: aliveIn.map((c) => c.p) });
    }
    return pots;
  }

  _finishHand() {
    // El pozo ya se repartió: limpiar aportes para que el estado quede consistente
    for (const p of this.players) {
      p.bet = 0;
      p.totalBet = 0;
      p.betChips = {};
    }
    this.phase = 'showdown';
    this.toActIdx = -1;
    this.revealTurnId = null;
    this.turnDeadline = null;
    this._clearTurnTimer();
    clearTimeout(this._revealTimer);
    this._nextHandTimer = setTimeout(() => {
      this.startHand();
      this.onUpdate();
    }, AUTO_NEXT_HAND_MS);
  }

  // ── Timer de turno ───────────────────────────────────────────

  _startTurnTimer() {
    this._clearTurnTimer();
    const p = this.players[this.toActIdx];
    if (!p) return;
    const ms = !p.connected
      ? DISCONNECT_ACT_MS
      : this.config.turnTimer > 0
        ? this.config.turnTimer * 1000
        : 0;
    if (ms > 0) {
      this.turnDeadline = Date.now() + ms;
      this._turnTimer = setTimeout(() => {
        this._autoAct(p.id);
        this.onUpdate();
      }, ms);
    } else {
      this.turnDeadline = null;
    }
  }

  _clearTurnTimer() {
    clearTimeout(this._turnTimer);
    this._turnTimer = null;
    this.turnDeadline = null;
  }

  _autoAct(id) {
    const p = this.players[this.toActIdx];
    if (!p || p.id !== id || !this._inBettingPhase()) return;
    if (this.currentBet - p.bet <= 0) {
      this.handleAction(id, { type: 'check' });
    } else {
      this.handleAction(id, { type: 'fold' });
    }
  }

  // ── Helpers ──────────────────────────────────────────────────

  _inBettingPhase() {
    return BETTING_PHASES.includes(this.phase);
  }

  _nextIdx(fromIdx, predicate) {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const idx = (fromIdx + i + n) % n;
      if (predicate(this.players[idx])) return idx;
    }
    return -1;
  }

  _log(msg) {
    this.log.push(msg);
    if (this.log.length > 60) this.log.shift();
  }

  destroy() {
    this._clearTurnTimer();
    clearTimeout(this._nextHandTimer);
    clearTimeout(this._emptyTimer);
    clearTimeout(this._runoutTimer);
    clearTimeout(this._revealTimer);
  }

  // Estado personalizado por jugador: solo ve sus cartas (y las reveladas
  // en el showdown). Las fichas de todos son públicas, como en la vida real.
  sanitizeFor(viewerId) {
    const revealed = new Set((this.result?.hands || []).map((h) => h.id));
    return {
      code: this.code,
      config: this.config,
      phase: this.phase,
      handNum: this.handNum,
      community: this.community,
      pot: this.players.reduce((s, p) => s + p.totalBet, 0),
      potChips: this.potChips,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      dealerIdx: this.dealerIdx,
      toActIdx: this.toActIdx,
      hostId: this.hostId,
      turnDeadline: this.turnDeadline,
      runout: this.runout,
      revealTurnId: this.revealTurnId,
      result: this.result,
      log: this.log.slice(-30),
      chat: this.chat.slice(-50),
      players: this.players.map((p) => ({
        id: p.id,
        colorIdx: p.colorIdx,
        nickname: p.nickname,
        stack: p.stack,
        chips: p.chips,
        betChips: p.betChips,
        bet: p.bet,
        folded: p.folded,
        allIn: p.allIn,
        inHand: p.inHand,
        connected: p.connected,
        lastAction: p.lastAction,
        showCards: p.showCards,
        cards:
          p.id === viewerId ||
          revealed.has(p.id) ||
          p.showCards === true ||
          (this.runout && p.inHand && !p.folded)
            ? p.cards
            : p.cards.map(() => null),
      })),
    };
  }
}
