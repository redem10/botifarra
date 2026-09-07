const SUIT_ICON = { oros: '🪙', copes: '🍷', espases: '⚔️', bastos: '🪵' };
const SUIT_NAME = { oros: 'Oros', copes: 'Copes', espases: 'Espases', bastos: 'Bastos' };
const RANK_LABEL = { 1: 'As', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'Sota', 11: 'Cavall', 12: 'Rei' };

let ws = null;
let myName = '';
let latestState = null;

const $ = (id) => document.getElementById(id);

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    handleServerMessage(msg);
  });
  ws.addEventListener('close', () => {
    showToast('S\'ha perdut la connexió amb el servidor.');
  });
  return new Promise((resolve) => {
    ws.addEventListener('open', resolve, { once: true });
  });
}

function send(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function handleServerMessage(msg) {
  if (msg.type === 'error') {
    showToast(msg.message);
    return;
  }
  if (msg.type === 'joined') {
    $('waiting-roomcode').textContent = msg.roomCode;
    return;
  }
  if (msg.type === 'state') {
    latestState = msg.state;
    render(latestState);
  }
}

let toastTimer = null;
function showToast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

// ---------- LOBBY ACTIONS ----------
$('btn-create').addEventListener('click', async () => {
  myName = $('input-name').value.trim();
  if (!myName) return showLobbyError('Escriu el teu nom primer.');
  await ensureConnected();
  send({ type: 'create', name: myName });
});

$('btn-join').addEventListener('click', async () => {
  myName = $('input-name').value.trim();
  const roomCode = $('input-roomcode').value.trim().toUpperCase();
  if (!myName) return showLobbyError('Escriu el teu nom primer.');
  if (!roomCode) return showLobbyError('Escriu el codi de la sala.');
  await ensureConnected();
  send({ type: 'join', name: myName, roomCode });
});

function showLobbyError(text) {
  const el = $('lobby-error');
  el.textContent = text;
  el.hidden = false;
}

async function ensureConnected() {
  if (!ws || ws.readyState !== WebSocket.OPEN) await connect();
}

$('btn-start').addEventListener('click', () => send({ type: 'startGame' }));
$('btn-next-deal').addEventListener('click', () => send({ type: 'nextDeal' }));

$('btn-log-toggle').addEventListener('click', () => { $('log-panel').hidden = false; });
$('btn-log-close').addEventListener('click', () => { $('log-panel').hidden = true; });

document.querySelectorAll('.suit-btn').forEach(btn => {
  btn.addEventListener('click', () => send({ type: 'chooseTrump', suit: btn.dataset.suit }));
});

// ---------- RENDER ----------
function render(state) {
  if (state.phase === 'waiting') {
    renderWaiting(state);
    showScreen('screen-waiting');
    return;
  }
  showScreen('screen-table');
  renderTable(state);
}

function renderWaiting(state) {
  $('waiting-roomcode').textContent = state.roomCode;
  const list = $('seat-list');
  list.innerHTML = '';
  state.players.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = p ? 'filled' : '';
    li.innerHTML = `<span class="dot"></span><span class="seat-num">Seient ${i + 1}</span><span>${p ? p.name : 'Buit'}</span>`;
    list.appendChild(li);
  });
  const full = state.players.every(p => p);
  const btn = $('btn-start');
  btn.disabled = !full;
  btn.textContent = full ? 'Començar la partida' : 'Esperant jugadors…';
}

function seatLabel(state, seat) {
  const p = state.players[seat];
  return p ? p.name : `Seient ${seat + 1}`;
}

// Mapeja seients relatius: 0=jo(bottom), 1=esquerra, 2=dalt, 3=dreta
function relativePos(mySeat, seat) {
  return (seat - mySeat + 4) % 4;
}

function renderTable(state) {
  const mySeat = state.mySeat;

  $('score-a').textContent = state.teamScore[0];
  $('score-b').textContent = state.teamScore[1];
  $('deal-number').textContent = `Mà ${state.dealNumber}`;

  const trumpEl = $('trump-indicator');
  if (state.trumpSuit) {
    trumpEl.hidden = false;
    trumpEl.textContent = `Trumfo: ${SUIT_ICON[state.trumpSuit]} ${SUIT_NAME[state.trumpSuit]}`;
  } else if (state.contract && state.contract.botifarra) {
    trumpEl.hidden = false;
    trumpEl.textContent = 'Botifarra — sense trumfo';
  } else {
    trumpEl.hidden = true;
  }

  // Seats: posicions relatives
  const posOrder = ['bottom', 'left', 'top', 'right'];
  for (let seat = 0; seat < 4; seat++) {
    const rel = relativePos(mySeat, seat);
    const posName = posOrder[rel];
    const tag = $(`tag-${posName}`);
    const p = state.players[seat];
    const isTurn = state.phase === 'playing' && state.currentTurn === seat;
    const isDealer = state.dealerSeat === seat;
    tag.classList.toggle('active-turn', isTurn);
    const nameSpan = tag.querySelector('.seat-name');
    let label = p ? p.name : `Seient ${seat + 1}`;
    if (isDealer) label += ' 🃏';
    if (p && !p.connected) label = `<span class="disconnected">${label} (fora)</span>`;
    nameSpan.innerHTML = label + (state.dealerSeat === seat ? '' : '');

    if (posName !== 'bottom') {
      const cardsEl = $(`cards-${posName}`);
      cardsEl.innerHTML = '';
      const count = state.handCounts[seat] || 0;
      for (let i = 0; i < Math.min(count, 12); i++) {
        const mini = document.createElement('div');
        mini.className = 'mini-card';
        cardsEl.appendChild(mini);
      }
    }
  }

  // Trick area
  const trickArea = $('trick-area');
  trickArea.innerHTML = '';
  (state.trick || []).forEach(play => {
    const rel = relativePos(mySeat, play.seat);
    const wrap = document.createElement('div');
    wrap.className = `played-card pos-${rel}`;
    wrap.appendChild(makeCardEl(play.card, false));
    const who = document.createElement('div');
    who.className = 'who';
    who.textContent = seatLabel(state, play.seat);
    wrap.appendChild(who);
    trickArea.appendChild(wrap);
  });

  // Hand
  const handEl = $('hand-cards');
  handEl.innerHTML = '';
  const legal = new Set(state.legalCards || []);
  const canPlay = state.phase === 'playing' && state.currentTurn === mySeat;
  (state.myHand || []).forEach(card => {
    const el = makeCardEl(card, true);
    if (canPlay) {
      const isLegal = legal.has(card.id);
      el.classList.add(isLegal ? 'playable' : 'disabled');
      if (isLegal) el.addEventListener('click', () => send({ type: 'playCard', cardId: card.id }));
    }
    handEl.appendChild(el);
  });

  renderBidding(state, mySeat);
  renderTrumpChoice(state, mySeat);
  renderDealResult(state);
  renderGameOver(state);
  renderLog(state);
}

function makeCardEl(card, big) {
  const el = document.createElement('div');
  el.className = `card suit-${card.suit}`;
  el.innerHTML = `<span class="rank">${RANK_LABEL[card.rank]}</span><span class="suit-icon">${SUIT_ICON[card.suit]}</span>`;
  return el;
}

function renderBidding(state, mySeat) {
  const panel = $('bid-panel');
  if (state.phase !== 'bidding') { panel.hidden = true; return; }
  panel.hidden = false;

  const b = state.bidding;
  const isMyTurn = b.turn === mySeat;
  const statusEl = $('bid-status');
  if (b.highestBid) {
    const who = seatLabel(state, b.highestBid.seat);
    statusEl.textContent = b.highestBid.botifarra
      ? `${who} ha cantat Botifarra.`
      : `${who} porta el cant més alt: ${b.highestBid.value}.`;
  } else {
    statusEl.textContent = 'Ningú ha cantat encara.';
  }
  statusEl.textContent += isMyTurn ? ' És el teu torn.' : ` Torn de ${seatLabel(state, b.turn)}.`;

  const opts = $('bid-options');
  opts.innerHTML = '';
  if (!isMyTurn) return;

  const passBtn = document.createElement('button');
  passBtn.className = 'bid-btn pass';
  passBtn.textContent = 'Passar';
  passBtn.addEventListener('click', () => send({ type: 'bid', action: 'pass' }));
  opts.appendChild(passBtn);

  const minVal = b.highestBid && !b.highestBid.botifarra ? b.highestBid.value : 0;
  const canBotifarra = !(b.highestBid && b.highestBid.botifarra);
  state.bidValues.filter(v => v > minVal).forEach(v => {
    const btn = document.createElement('button');
    btn.className = 'bid-btn';
    btn.textContent = v;
    btn.addEventListener('click', () => send({ type: 'bid', action: 'bid', value: v }));
    opts.appendChild(btn);
  });

  if (canBotifarra) {
    const bf = document.createElement('button');
    bf.className = 'bid-btn botifarra';
    bf.textContent = 'Botifarra (totes les baces)';
    bf.addEventListener('click', () => send({ type: 'bid', action: 'botifarra' }));
    opts.appendChild(bf);
  }
}

function renderTrumpChoice(state, mySeat) {
  const panel = $('trump-panel');
  const shouldShow = state.phase === 'choose-trump' && state.contract && state.contract.seat === mySeat && !state.contract.botifarra;
  panel.hidden = !shouldShow;
}

let lastAckedDeal = -1;
function renderDealResult(state) {
  const panel = $('deal-result-panel');
  if (state.phase !== 'scoring') { panel.hidden = true; return; }
  panel.hidden = false;
  const lastLog = state.log[state.log.length - 1] || '';
  $('deal-result-text').textContent = lastLog;
}

function renderGameOver(state) {
  const panel = $('game-over-panel');
  if (state.phase !== 'finished') { panel.hidden = true; return; }
  $('deal-result-panel').hidden = true;
  panel.hidden = false;
  const teamName = state.winningTeam === 0 ? 'Equip A (1r i 3r)' : 'Equip B (2n i 4t)';
  $('game-over-text').textContent = `Guanya l'${teamName} amb ${state.teamScore[state.winningTeam]} punts.`;
}

function renderLog(state) {
  const list = $('log-list');
  list.innerHTML = '';
  state.log.slice().reverse().forEach(entry => {
    const li = document.createElement('li');
    li.textContent = entry;
    list.appendChild(li);
  });
}
