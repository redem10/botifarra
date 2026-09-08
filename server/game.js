// Motor de joc de la Botifarra — regles tradicionals catalanes
// Fonts: pagat.com/manille/botifarc.html, cccj.es/reglaments/botifarra.htm, en.wikipedia.org/wiki/Botifarra_(card_game)
//
// 4 jugadors (seients 0-3), parelles fixes: 0+2 vs 1+3
// Baralla espanyola de 48 cartes (oros, copes, espases, bastos; 1-12, amb 8 i 9)

const SUITS = ['oros', 'copes', 'espases', 'bastos'];
const SUIT_NAMES = { oros: 'Oros', copes: 'Copes', espases: 'Espases', bastos: 'Bastos' };
const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const RANK_NAMES = { 1: 'As', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9 (Manilla)', 10: 'Sota', 11: 'Cavall', 12: 'Rei' };

// Valor en punts de cada carta. Manilla(9)=5, As=4, Rei=3, Cavall=2, Sota=1. Total per pal=15, x4 pals=60, +12 per les bases = 72 punts/mà.
const CARD_POINTS = { 9: 5, 1: 4, 12: 3, 11: 2, 10: 1, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };

// Ordre de força de les cartes DINS D'UN MATEIX PAL (igual sigui trumfo o no): 9,As,Rei,Cavall,Sota,8,7,6,5,4,3,2
const RANK_ORDER = [2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 1, 9]; // de més feble a més fort

const HALF_POINTS = 36; // llindar per anotar-se la mà (de 72 punts totals)

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

function rankValue(card) {
  return RANK_ORDER.indexOf(card.rank);
}

function cardLabel(card) {
  return `${RANK_NAMES[card.rank]} de ${SUIT_NAMES[card.suit]}`;
}

// x bat y?
function cardBeats(x, y, trumpSuit) {
  const xTrump = trumpSuit && x.suit === trumpSuit;
  const yTrump = trumpSuit && y.suit === trumpSuit;
  if (xTrump && !yTrump) return true;
  if (!xTrump && yTrump) return false;
  if (x.suit !== y.suit) return false;
  return rankValue(x) > rankValue(y);
}

// Determina quina jugada guanya una baça (parcial o completa)
function trickWinner(trick, trumpSuit) {
  let best = trick[0];
  for (const play of trick.slice(1)) {
    if (cardBeats(play.card, best.card, trumpSuit)) best = play;
  }
  return best;
}

// Pes aproximat de cada carta per a l'heurística dels bots
const BOT_CARD_WEIGHT = { 9: 6, 1: 5, 12: 3, 11: 2, 10: 1, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };

class BotifarraGame {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.players = [null, null, null, null];
    this.reset();
  }

  reset() {
    this.phase = 'waiting'; // waiting | trump-choice | doubling | playing | scoring | finished
    this.dealerSeat = 0;
    this.hands = [[], [], [], []];
    this.trumpChooserSeat = null;
    this.canDelegate = false;
    this.trumpSuit = null;
    this.contract = null; // {seat, team, botifarra}
    this.doubling = { contro: false, recontro: false, santVicenc: false };
    this.doublingStage = null;
    this.doublingEligible = [];
    this.doublingResponded = [];
    this.currentTrickLeader = null;
    this.currentTurn = null;
    this.trick = [];
    this.tricksWon = [[], []];
    this.teamScore = [0, 0];
    this.dealPoints = [0, 0];
    this.log = [];
    this.dealNumber = 0;
    this.winningTeam = null;
    this.lastDealSummary = null;
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
      hand.sort((a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || rankValue(b) - rankValue(a));
    }
    this.trumpSuit = null;
    this.contract = null;
    this.doubling = { contro: false, recontro: false, santVicenc: false };
    this.doublingStage = null;
    this.doublingEligible = [];
    this.doublingResponded = [];
    this.trick = [];
    this.tricksWon = [[], []];
    this.dealPoints = [0, 0];
    this.lastDealSummary = null;
    this.phase = 'trump-choice';
    this.trumpChooserSeat = this.dealerSeat;
    this.canDelegate = true;
    this.addLog(`Nova mà. Reparteix el seient ${this.dealerSeat + 1}, que ha de triar trumfo.`);
  }

  // action: 'suit' | 'botifarra' | 'delegate'
  chooseTrump(seat, action, suit) {
    if (this.phase !== 'trump-choice' || this.trumpChooserSeat !== seat) {
      return { error: 'No pots triar trumfo ara.' };
    }
    if (action === 'delegate') {
      if (!this.canDelegate) return { error: 'Ja no es pot delegar.' };
      const partnerSeat = (seat + 2) % 4;
      this.trumpChooserSeat = partnerSeat;
      this.canDelegate = false;
      this.addLog(`Seient ${seat + 1} delega l'elecció de trumfo al seu company (seient ${partnerSeat + 1}).`);
      return { ok: true };
    }
    if (action === 'botifarra') {
      this.trumpSuit = null;
      this.contract = { seat, team: seat % 2, botifarra: true };
      this.addLog(`Seient ${seat + 1} canta BOTIFARRA (sense trumfo)!`);
    } else if (action === 'suit') {
      if (!SUITS.includes(suit)) return { error: 'Pal invàlid.' };
      this.trumpSuit = suit;
      this.contract = { seat, team: seat % 2, botifarra: false };
      this.addLog(`Seient ${seat + 1} triomfa a ${SUIT_NAMES[suit]}.`);
    } else {
      return { error: 'Acció invàlida.' };
    }
    this._startDoublingStage('contro');
    return { ok: true };
  }

  _startDoublingStage(stage) {
    this.phase = 'doubling';
    this.doublingStage = stage;
    this.doublingResponded = [];
    const defendingTeam = 1 - this.contract.team;
    const askingTeam = (stage === 'contro' || stage === 'santvicenc') ? defendingTeam : this.contract.team;
    this.doublingEligible = [0, 1, 2, 3].filter(s => s % 2 === askingTeam);
    const stageLabel = { contro: 'Contro', recontro: 'Recontro', santvicenc: 'Sant Vicenç' }[stage];
    this.addLog(`Torn de l'equip ${askingTeam === 0 ? 'A (1-3)' : 'B (2-4)'} per decidir si canten ${stageLabel}.`);
  }

  _advanceDoubling() {
    if (this.doublingStage === 'contro') {
      if (this.doubling.contro) this._startDoublingStage('recontro');
      else this._beginPlay();
    } else if (this.doublingStage === 'recontro') {
      if (this.doubling.recontro && !this.contract.botifarra) this._startDoublingStage('santvicenc');
      else this._beginPlay();
    } else if (this.doublingStage === 'santvicenc') {
      this._beginPlay();
    }
  }

  respondDouble(seat, willDouble) {
    if (this.phase !== 'doubling' || !this.doublingEligible.includes(seat)) {
      return { error: 'No pots respondre ara.' };
    }
    if (this.doublingResponded.includes(seat)) {
      return { error: 'Ja has respost en aquesta fase.' };
    }
    const stageKey = { contro: 'contro', recontro: 'recontro', santvicenc: 'santVicenc' }[this.doublingStage];
    const stageLabel = { contro: 'Contro', recontro: 'Recontro', santvicenc: 'Sant Vicenç' }[this.doublingStage];

    if (willDouble) {
      this.doubling[stageKey] = true;
      this.addLog(`Seient ${seat + 1} canta ${stageLabel}!`);
      this._advanceDoubling();
      return { ok: true };
    }

    this.doublingResponded.push(seat);
    this.addLog(`Seient ${seat + 1} passa (${stageLabel}).`);
    if (this.doublingEligible.every(s => this.doublingResponded.includes(s))) {
      this._advanceDoubling();
    }
    return { ok: true };
  }

  _beginPlay() {
    this.phase = 'playing';
    this.currentTrickLeader = (this.dealerSeat + 1) % 4;
    this.currentTurn = this.currentTrickLeader;
    this.trick = [];
    this.addLog(this.trumpSuit ? `Es juga amb trumfo: ${SUIT_NAMES[this.trumpSuit]}.` : 'Es juga sense trumfo (Botifarra).');
  }

  legalCards(seat) {
    const hand = this.hands[seat];
    if (this.trick.length === 0) return hand.map(c => c.id);

    const leadSuit = this.trick[0].card.suit;
    const winner = trickWinner(this.trick, this.trumpSuit);
    const partnerWinning = winner.seat % 2 === seat % 2;
    const sameSuit = hand.filter(c => c.suit === leadSuit);

    if (partnerWinning) {
      if (sameSuit.length > 0) return sameSuit.map(c => c.id);
      return hand.map(c => c.id);
    }

    if (sameSuit.length > 0) {
      const beating = sameSuit.filter(c => cardBeats(c, winner.card, this.trumpSuit));
      return (beating.length > 0 ? beating : sameSuit).map(c => c.id);
    }

    if (this.trumpSuit) {
      const winningCards = hand.filter(c => c.suit === this.trumpSuit && cardBeats(c, winner.card, this.trumpSuit));
      if (winningCards.length > 0) return winningCards.map(c => c.id);
    }
    return hand.map(c => c.id);
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
    if (!legal.includes(cardId)) return { error: 'Jugada no vàlida (has de servir el pal i guanyar si pots).' };

    const card = hand.splice(idx, 1)[0];
    this.trick.push({ seat, card });
    this.addLog(`Seient ${seat + 1} juga ${cardLabel(card)}.`);

    if (this.trick.length < 4) {
      this.currentTurn = (this.currentTurn + 1) % 4;
      return { ok: true };
    }

    const winner = trickWinner(this.trick, this.trumpSuit);
    const team = winner.seat % 2;
    const points = this.trick.reduce((s, p) => s + CARD_POINTS[p.card.rank], 0) + 1;
    this.dealPoints[team] += points;
    this.tricksWon[team].push(this.trick);
    this.addLog(`Seient ${winner.seat + 1} guanya la baça (${points} punts).`);

    const isLastTrick = this.hands.every(h => h.length === 0);
    if (isLastTrick) {
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

    let multiplier = 1;
    if (this.contract.botifarra) multiplier *= 2;
    if (this.doubling.contro) multiplier *= 2;
    if (this.doubling.recontro) multiplier *= 2;
    if (this.doubling.santVicenc) multiplier *= 2;

    const p0 = this.dealPoints[0];
    const p1 = this.dealPoints[1];
    let summary;

    if (p0 === HALF_POINTS && p1 === HALF_POINTS) {
      summary = `Empat a ${HALF_POINTS} punts: ningú s'anota la mà.`;
    } else {
      const winnerTeam = p0 > HALF_POINTS ? 0 : 1;
      const winnerPoints = this.dealPoints[winnerTeam];
      const gained = (winnerPoints - HALF_POINTS) * multiplier;
      this.teamScore[winnerTeam] += gained;
      const multiplierLabel = multiplier > 1 ? ` (x${multiplier})` : '';
      summary = `Equip ${winnerTeam === 0 ? 'A (1-3)' : 'B (2-4)'} guanya la mà amb ${winnerPoints} punts (de 72). S'anota ${gained} punts${multiplierLabel}.`;
    }

    this.addLog(summary);
    this.lastDealSummary = summary;
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

  _botChooseTrumpAction(seat) {
    const { bestSuit, bestValue } = this._suitScores(seat);
    if (this.canDelegate && bestValue < 5) {
      this.chooseTrump(seat, 'delegate');
      return;
    }
    if (bestValue >= 16) {
      this.chooseTrump(seat, 'botifarra');
      return;
    }
    this.chooseTrump(seat, 'suit', bestSuit);
  }

  _botRespondDouble(seat) {
    // Els bots juguen sobre segur: mai doblen (evita disparar la puntuació de forma imprevisible)
    this.respondDouble(seat, false);
  }

  _botPlayCard(seat) {
    const hand = this.hands[seat];
    const legal = new Set(this.legalCards(seat));
    const options = hand.filter(c => legal.has(c.id));
    if (options.length === 0) return;

    let chosen;
    if (this.trick.length === 0) {
      chosen = options.slice().sort((a, b) => CARD_POINTS[a.rank] - CARD_POINTS[b.rank])[0];
    } else {
      const winners = options.filter(c => {
        const hypothetical = this.trick.concat([{ seat, card: c }]);
        return trickWinner(hypothetical, this.trumpSuit).seat === seat;
      });
      if (winners.length > 0) {
        chosen = winners.sort((a, b) => rankValue(a) - rankValue(b))[0];
      } else {
        chosen = options.slice().sort((a, b) => CARD_POINTS[a.rank] - CARD_POINTS[b.rank])[0];
      }
    }
    this.playCard(seat, chosen.id);
  }

  performBotTurn() {
    if (this.phase === 'trump-choice') {
      const seat = this.trumpChooserSeat;
      if (this.players[seat] && this.players[seat].isBot) { this._botChooseTrumpAction(seat); return true; }
    } else if (this.phase === 'doubling') {
      const seat = this.doublingEligible.find(s => !this.doublingResponded.includes(s) && this.players[s] && this.players[s].isBot);
      if (seat !== undefined) { this._botRespondDouble(seat); return true; }
    } else if (this.phase === 'playing') {
      const seat = this.currentTurn;
      if (this.players[seat] && this.players[seat].isBot) { this._botPlayCard(seat); return true; }
    }
    return false;
  }

  stateFor(seat) {
    return {
      roomCode: this.roomCode,
      phase: this.phase,
      players: this.players.map(p => p ? { name: p.name, connected: p.connected, isBot: !!p.isBot } : null),
      mySeat: seat,
      myHand: seat != null && this.hands[seat] ? this.hands[seat] : [],
      handCounts: this.hands.map(h => h.length),
      dealerSeat: this.dealerSeat,
      trumpChooserSeat: this.trumpChooserSeat,
      canDelegate: this.canDelegate,
      trumpSuit: this.trumpSuit,
      contract: this.contract,
      doubling: this.doubling,
      doublingStage: this.doublingStage,
      doublingEligible: this.doublingEligible,
      doublingResponded: this.doublingResponded,
      currentTurn: this.currentTurn,
      trick: this.trick,
      tricksWonCount: this.tricksWon.map(t => t.length),
      teamScore: this.teamScore,
      dealPoints: this.dealPoints,
      dealNumber: this.dealNumber,
      log: this.log,
      lastDealSummary: this.lastDealSummary,
      winningTeam: this.winningTeam,
      legalCards: this.phase === 'playing' && this.currentTurn === seat ? this.legalCards(seat) : []
    };
  }
}

module.exports = { BotifarraGame, SUITS, SUIT_NAMES, RANK_NAMES, CARD_POINTS };
