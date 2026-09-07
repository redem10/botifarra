// Motor de joc de la Botifarra
// 4 jugadors (seients 0-3), parelles fixes: 0+2 vs 1+3
// Baralla espanyola de 48 cartes (oros, copes, espases, bastos; 1-12, amb 8 i 9)

const SUITS = ['oros', 'copes', 'espases', 'bastos'];
const SUIT_NAMES = { oros: 'Oros', copes: 'Copes', espases: 'Espases', bastos: 'Bastos' };
const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const RANK_NAMES = { 1: 'As', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'Sota', 11: 'Cavall', 12: 'Rei' };

// Valor en punts de cada carta
const CARD_POINTS = { 1: 11, 9: 9, 12: 4, 11: 3, 10: 2, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };

// Ordre de força (índex més alt = més fort) per a carta NO trumfada
const ORDER_NORMAL = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1]; // As el més fort, després Rei..Sota..9..8..2
// Ordre de força per a carta TRUMFADA (el 9 -manilla- puja per sobre de tot excepte l'As)
const ORDER_TRUMP = [2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 9, 1]; // As > 9(manilla) > Rei > Cavall > Sota > 8..2

const TOTAL_POINTS_PER_DEAL = 120; // 116 de cartes + 4 "de les últimes"

function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: `${suit}-${rank}` });
    }
  }
  return deck;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cardStrength(card, trumpSuit) {
  const order = card.suit === trumpSuit ? ORDER_TRUMP : ORDER_NORMAL;
  return order.indexOf(card.rank);
}

function cardLabel(card) {
  return `${RANK_NAMES[card.rank]} de ${SUIT_NAMES[card.suit]}`;
}

// Determina quina jugada guanya una baça (parcial o completa)
function trickWinner(trick, trumpSuit) {
  let best = trick[0];
  for (const play of trick.slice(1)) {
    const bestIsTrump = trumpSuit && best.card.suit === trumpSuit;
    const playIsTrump = trumpSuit && play.card.suit === trumpSuit;
    if (playIsTrump && !bestIsTrump) {
      best = play;
    } else if (playIsTrump === bestIsTrump && play.card.suit === best.card.suit) {
      if (cardStrength(play.card, trumpSuit) > cardStrength(best.card, trumpSuit)) best = play;
    }
  }
  return best;
}

// Pes aproximat de cada carta per a l'heurística dels bots (força + valor)
const BOT_CARD_WEIGHT = { 1: 6, 9: 5, 12: 3, 11: 2, 10: 1, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };

// Valors de cant possibles (punts que es comprometen a fer)
const BID_VALUES = [16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60];

class BotifarraGame {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.players = [null, null, null, null]; // {id, name, connected}
    this.reset();
  }

  reset() {
    this.phase = 'waiting'; // waiting | bidding | playing | scoring | finished
    this.dealerSeat = 0;
    this.hands = [[], [], [], []];
    this.bidding = null;
    this.trumpSuit = null;
    this.contract = null; // {seat, team, value, botifarra}
    this.currentTrickLeader = null;
    this.currentTurn = null;
    this.trick = []; // [{seat, card}]
    this.tricksWon = [[], []]; // per equip: array de baces (cada baça = array de {seat,card})
    this.teamScore = [0, 0]; // puntuació total de partida
    this.dealPoints = [0, 0]; // punts fets en la mà actual
    this.log = [];
    this.dealNumber = 0;
    this.winningTeam = null;
  }

  seatedPlayers() {
    return this.players.filter(p => p);
  }

  isFull() {
    return this.players.every(p => p);
  }

  addPlayer(id, name, isBot = false) {
    const emptySeat = this.players.findIndex(p => !p);
    if (emptySeat === -1) return -1;
    this.players[emptySeat] = { id, name, connected: true, isBot };
    return emptySeat;
  }

  removePlayerBySocket(id) {
    const seat = this.players.findIndex(p => p && p.id === id);
    if (seat !== -1) {
      this.players[seat].connected = false;
    }
    return seat;
  }

  reconnect(seat, id) {
    if (this.players[seat]) {
      this.players[seat].id = id;
      this.players[seat].connected = true;
    }
  }

  addLog(msg) {
    this.log.push(msg);
    if (this.log.length > 60) this.log.shift();
  }

  startDeal() {
    this.dealNumber++;
    const deck = shuffle(makeDeck());
    this.hands = [[], [], [], []];
    for (let i = 0; i < 48; i++) {
      this.hands[i % 4].push(deck[i]);
    }
    for (const hand of this.hands) {
      hand.sort((a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || a.rank - b.rank);
    }
    this.trumpSuit = null;
    this.contract = null;
    this.trick = [];
    this.tricksWon = [[], []];
    this.dealPoints = [0, 0];
    this.phase = 'bidding';
    this.bidding = {
      turn: (this.dealerSeat + 1) % 4,
      highestBid: null, // {seat, value, botifarra}
      passes: 0,
      history: [],
      finished: false
    };
    this.addLog(`Nova mà. Reparteix el seient ${this.dealerSeat + 1}.`);
  }

  currentBidder() {
    return this.bidding ? this.bidding.turn : null;
  }

  placeBid(seat, action, value) {
    if (this.phase !== 'bidding' || this.bidding.turn !== seat) return { error: 'No és el teu torn de cantar.' };
    const b = this.bidding;

    if (action === 'pass') {
      b.history.push({ seat, action: 'pass' });
      b.passes++;
      this.addLog(`Seient ${seat + 1} passa.`);
    } else if (action === 'botifarra') {
      b.highestBid = { seat, value: 999, botifarra: true };
      b.history.push({ seat, action: 'botifarra' });
      b.passes = 0;
      this.addLog(`Seient ${seat + 1} canta BOTIFARRA!`);
    } else if (action === 'bid') {
      if (!BID_VALUES.includes(value)) return { error: 'Valor de cant invàlid.' };
      if (b.highestBid && value <= (b.highestBid.botifarra ? 9999 : b.highestBid.value)) {
        return { error: 'Has de cantar més que l\'última aposta.' };
      }
      if (b.highestBid && b.highestBid.botifarra) return { error: 'Ja s\'ha cantat Botifarra, no es pot superar.' };
      b.highestBid = { seat, value, botifarra: false };
      b.history.push({ seat, action: 'bid', value });
      b.passes = 0;
      this.addLog(`Seient ${seat + 1} canta ${value}.`);
    } else {
      return { error: 'Acció de cant desconeguda.' };
    }

    // Determine if bidding finished
    const activeCount = 4;
    if (b.highestBid && b.passes >= activeCount - 1) {
      b.finished = true;
    } else if (!b.highestBid && b.passes >= activeCount) {
      // everyone passed: redeal, same dealer moves on
      this.addLog('Tothom ha passat. Es torna a repartir.');
      this.startDeal();
      return { ok: true, redeal: true };
    } else {
      b.turn = (b.turn + 1) % 4;
      // skip until reach someone who hasn't finished the round appropriately - simple round robin is fine
    }

    if (b.finished) {
      this.finishBidding();
    }

    return { ok: true };
  }

  finishBidding() {
    const hb = this.bidding.highestBid;
    const team = hb.seat % 2; // seats 0,2 = team 0 ; seats 1,3 = team 1
    this.contract = { seat: hb.seat, team, value: hb.botifarra ? 120 : hb.value, botifarra: hb.botifarra };
    this.phase = 'choose-trump';
    this.addLog(`Seient ${hb.seat + 1} guanya el cant amb ${hb.botifarra ? 'Botifarra' : hb.value}. Ha de triar trumfo.`);
  }

  chooseTrump(seat, suit) {
    if (this.phase !== 'choose-trump' || this.contract.seat !== seat) return { error: 'No pots triar trumfo ara.' };
    if (this.contract.botifarra) {
      this.trumpSuit = null; // sense trumfo a la botifarra
    } else {
      if (!SUITS.includes(suit)) return { error: 'Pal invàlid.' };
      this.trumpSuit = suit;
    }
    this.phase = 'playing';
    this.currentTrickLeader = (this.dealerSeat + 1) % 4;
    this.currentTurn = this.currentTrickLeader;
    this.trick = [];
    this.addLog(this.trumpSuit ? `Trumfo: ${SUIT_NAMES[this.trumpSuit]}.` : 'Es juga sense trumfo (Botifarra).');
    return { ok: true };
  }

  legalCards(seat) {
    const hand = this.hands[seat];
    if (this.trick.length === 0) return hand.map(c => c.id);
    const leadSuit = this.trick[0].card.suit;
    const trump = this.trumpSuit;

    const sameSuit = hand.filter(c => c.suit === leadSuit);
    if (sameSuit.length > 0) {
      // Ha de seguir el pal. Si el pal és trumfo, ha de matar si pot (jugar més alt que el trumfo actual del guanyador si és possible)
      if (leadSuit === trump) {
        const winning = this.currentWinningCard();
        const higher = sameSuit.filter(c => cardStrength(c, trump) > cardStrength(winning.card, trump));
        if (higher.length > 0 && this.mustBeat(seat)) return higher.map(c => c.id);
      }
      return sameSuit.map(c => c.id);
    }

    // No té el pal de sortida
    if (trump) {
      const trumps = hand.filter(c => c.suit === trump);
      if (trumps.length > 0) {
        const winning = this.currentWinningCard();
        const partnerWinning = winning.seat % 2 === seat % 2;
        if (!partnerWinning) {
          // ha de matar (trumfar) si pot superar el trumfo actual, si ja hi ha trumfo jugat
          if (winning.card.suit === trump) {
            const higher = trumps.filter(c => cardStrength(c, trump) > cardStrength(winning.card, trump));
            if (higher.length > 0) return higher.map(c => c.id);
            // no pot pujar-lo: pot jugar qualsevol trumfo o descartar
            return hand.map(c => c.id);
          } else {
            return trumps.map(c => c.id); // ha de trumfar
          }
        }
      }
    }
    return hand.map(c => c.id);
  }

  mustBeat() {
    return true; // regla simplificada: sempre s'ha d'intentar pujar si es pot
  }

  currentWinningCard() {
    return trickWinner(this.trick, this.trumpSuit);
  }

  playCard(seat, cardId) {
    if (this.phase !== 'playing' || this.currentTurn !== seat) return { error: 'No és el teu torn.' };
    const hand = this.hands[seat];
    const idx = hand.findIndex(c => c.id === cardId);
    if (idx === -1) return { error: 'No tens aquesta carta.' };
    const legal = this.legalCards(seat);
    if (!legal.includes(cardId)) return { error: 'Jugada no vàlida (has de seguir el pal o trumfar).' };

    const card = hand.splice(idx, 1)[0];
    this.trick.push({ seat, card });
    this.addLog(`Seient ${seat + 1} juga ${cardLabel(card)}.`);

    if (this.trick.length < 4) {
      this.currentTurn = (this.currentTurn + 1) % 4;
      return { ok: true };
    }

    // Baça completa
    const winner = this.currentWinningCard();
    const team = winner.seat % 2;
    const points = this.trick.reduce((s, p) => s + CARD_POINTS[p.card.rank], 0);
    this.dealPoints[team] += points;
    this.tricksWon[team].push(this.trick);
    this.addLog(`Seient ${winner.seat + 1} guanya la baça (${points} punts).`);

    const isLastTrick = this.hands.every(h => h.length === 0);
    if (isLastTrick) {
      this.dealPoints[team] += 4; // punts "de les últimes"
      this.addLog(`Seient ${winner.seat + 1} s'emporta les últimes (+4 punts).`);
      this.trick = [];
      this.finishDeal();
      return { ok: true, dealFinished: true };
    }

    this.trick = [];
    this.currentTrickLeader = winner.seat;
    this.currentTurn = winner.seat;
    return { ok: true };
  }

  finishDeal() {
    this.phase = 'scoring';
    const contractTeam = this.contract.team;
    const otherTeam = 1 - contractTeam;
    const made = this.dealPoints[contractTeam];
    const needed = this.contract.botifarra ? 120 : this.contract.value;
    const success = this.contract.botifarra ? made >= 120 : made >= needed;

    let summary;
    if (success) {
      this.teamScore[contractTeam] += this.contract.botifarra ? 120 : needed;
      this.teamScore[otherTeam] += this.dealPoints[otherTeam];
      summary = `Equip ${contractTeam === 0 ? 'A (1-3)' : 'B (2-4)'} complert el cant (${made} punts fets, calien ${needed}). +${this.contract.botifarra ? 120 : needed} punts.`;
    } else {
      this.teamScore[otherTeam] += needed + this.dealPoints[otherTeam];
      summary = `Equip ${contractTeam === 0 ? 'A (1-3)' : 'B (2-4)'} NO ha complert el cant (${made} de ${needed}). L'equip contrari suma ${needed} + els seus punts.`;
    }
    this.addLog(summary);
    this.dealerSeat = (this.dealerSeat + 1) % 4;

    if (this.teamScore[0] >= 101 || this.teamScore[1] >= 101) {
      this.phase = 'finished';
      this.winningTeam = this.teamScore[0] >= 101 && this.teamScore[0] >= this.teamScore[1] ? 0 : 1;
      this.addLog(`Fi de la partida! Guanya l'equip ${this.winningTeam === 0 ? 'A (1-3)' : 'B (2-4)'}.`);
    }
  }

  nextDeal() {
    if (this.phase === 'finished') return { error: 'La partida ha acabat.' };
    this.startDeal();
    return { ok: true };
  }

  // ---------- Lògica de bots ----------

  // Puntuació aproximada de cada pal en una mà, per decidir cants i trumfo
  _suitScores(seat) {
    const hand = this.hands[seat];
    const scores = { oros: 0, copes: 0, espases: 0, bastos: 0 };
    const counts = { oros: 0, copes: 0, espases: 0, bastos: 0 };
    for (const card of hand) {
      scores[card.suit] += BOT_CARD_WEIGHT[card.rank];
      counts[card.suit] += 1;
    }
    let bestSuit = SUITS[0];
    let bestValue = -Infinity;
    const combined = {};
    for (const suit of SUITS) {
      combined[suit] = scores[suit] + counts[suit] * 1.5;
      if (combined[suit] > bestValue) { bestValue = combined[suit]; bestSuit = suit; }
    }
    const handPoints = hand.reduce((s, c) => s + CARD_POINTS[c.rank], 0);
    return { bestSuit, bestValue, handPoints };
  }

  _botBid(seat) {
    const b = this.bidding;
    const { bestValue, handPoints } = this._suitScores(seat);
    const strength = bestValue + handPoints * 0.4;

    if (b.highestBid && b.highestBid.botifarra) {
      this.placeBid(seat, 'pass');
      return;
    }

    const rawTarget = 14 + Math.round(strength * 2.6);
    let suggested = null;
    for (const v of BID_VALUES) {
      if (v >= rawTarget) { suggested = v; break; }
    }

    const currentMax = b.highestBid ? b.highestBid.value : 0;
    if (suggested && suggested > currentMax && strength >= 6) {
      this.placeBid(seat, 'bid', suggested);
    } else {
      this.placeBid(seat, 'pass');
    }
  }

  _botChooseTrump(seat) {
    if (this.contract.botifarra) {
      this.chooseTrump(seat, null);
      return;
    }
    const { bestSuit } = this._suitScores(seat);
    this.chooseTrump(seat, bestSuit);
  }

  _botPlayCard(seat) {
    const hand = this.hands[seat];
    const legal = new Set(this.legalCards(seat));
    const options = hand.filter(c => legal.has(c.id));
    if (options.length === 0) return;

    let chosen;
    if (this.trick.length === 0) {
      // Surt: juga la carta amb menys punts per no regalar-ne
      chosen = options.slice().sort((a, b) => CARD_POINTS[a.rank] - CARD_POINTS[b.rank])[0];
    } else {
      const winners = options.filter(c => {
        const hypothetical = this.trick.concat([{ seat, card: c }]);
        return trickWinner(hypothetical, this.trumpSuit).seat === seat;
      });
      if (winners.length > 0) {
        // Guanya la baça gastant el menys possible
        chosen = winners.sort((a, b) => cardStrength(a, this.trumpSuit) - cardStrength(b, this.trumpSuit))[0];
      } else {
        // No pot guanyar: descarta la carta de menys valor
        chosen = options.slice().sort((a, b) => CARD_POINTS[a.rank] - CARD_POINTS[b.rank])[0];
      }
    }
    this.playCard(seat, chosen.id);
  }

  // Si toca a un bot, fa la seva jugada i retorna true. Si no, retorna false.
  performBotTurn() {
    if (this.phase === 'bidding') {
      const seat = this.bidding.turn;
      if (this.players[seat] && this.players[seat].isBot) { this._botBid(seat); return true; }
    } else if (this.phase === 'choose-trump') {
      const seat = this.contract.seat;
      if (this.players[seat] && this.players[seat].isBot) { this._botChooseTrump(seat); return true; }
    } else if (this.phase === 'playing') {
      const seat = this.currentTurn;
      if (this.players[seat] && this.players[seat].isBot) { this._botPlayCard(seat); return true; }
    }
    return false;
  }

  // Estat serialitzat per a un jugador concret (amaga les mans dels altres)
  stateFor(seat) {
    return {
      roomCode: this.roomCode,
      phase: this.phase,
      players: this.players.map(p => p ? { name: p.name, connected: p.connected, isBot: !!p.isBot } : null),
      mySeat: seat,
      myHand: seat != null && this.hands[seat] ? this.hands[seat] : [],
      handCounts: this.hands.map(h => h.length),
      dealerSeat: this.dealerSeat,
      bidding: this.bidding,
      bidValues: BID_VALUES,
      trumpSuit: this.trumpSuit,
      contract: this.contract,
      currentTurn: this.currentTurn,
      trick: this.trick,
      tricksWonCount: this.tricksWon.map(t => t.length),
      teamScore: this.teamScore,
      dealPoints: this.dealPoints,
      dealNumber: this.dealNumber,
      log: this.log,
      winningTeam: this.winningTeam,
      legalCards: this.phase === 'playing' && this.currentTurn === seat ? this.legalCards(seat) : []
    };
  }
}

module.exports = { BotifarraGame, SUITS, SUIT_NAMES, RANK_NAMES, CARD_POINTS, BID_VALUES };
