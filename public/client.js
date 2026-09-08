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
  if (msg.type === 'queueStatus') {
    $('queue-count').textContent = msg.count;
    if (!$('screen-queue').classList.contains('active')) showScreen('screen-queue');
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
function getMyName() {
  myName = $('input-name').value.trim();
  return myName;
}

$('btn-mode-ai').addEventListener('click', async () => {
  if (!getMyName()) return showLobbyError('Escriu el teu nom primer.');
  hideLobbyError();
  await ensureConnected();
  send({ type: 'quickAI', name: myName });
});

$('btn-mode-online').addEventListener('click', async () => {
  if (!getMyName()) return showLobbyError('Escriu el teu nom primer.');
  hideLobbyError();
  await ensureConnected();
  $('queue-count').textContent = '1';
  showScreen('screen-queue');
  send({ type: 'queueOnline', name: myName });
});

$('btn-cancel-queue').addEventListener('click', () => {
  send({ type: 'cancelQueue' });
  showScreen('screen-lobby');
});

$('btn-mode-private').addEventListener('click', () => {
  $('mode-buttons').hidden = true;
  $('private-panel').hidden = false;
});

$('btn-back-private').addEventListener('click', () => {
  $('mode-buttons').hidden = false;
  $('private-panel').hidden = true;
});

$('btn-create').addEventListener('click', async () => {
  if (!getMyName()) return showLobbyError('Escriu el teu nom primer.');
  hideLobbyError();
  await ensureConnected();
  send({ type: 'create', name: myName });
});

$('btn-join').addEventListener('click', async () => {
  getMyName();
  const roomCode = $('input-roomcode').value.trim().toUpperCase();
  if (!myName) return showLobbyError('Escriu el teu nom primer.');
  if (!roomCode) return showLobbyError('Escriu el codi de la sala.');
  hideLobbyError();
  await ensureConnected();
  send({ type: 'join', name: myName, roomCode });
});

function showLobbyError(text) {
  const el = $('lobby-error');
  el.textContent = text;
  el.hidden = false;
}
function hideLobbyError() {
  $('lobby-error').hidden = true;
}

async function ensureConnected() {
  if (!ws || ws.readyState !== WebSocket.OPEN) await connect();
}

$('btn-start').addEventListener('click', () => send({ type: 'startGame' }));
$('btn-next-deal').addEventListener('click', () => send({ type: 'nextDeal' }));

$('btn-log-toggle').addEventListener('click', () => { $('log-panel').hidden = false; });
$('btn-log-close').addEventListener('click', () => { $('log-panel').hidden = true; });

document.querySelectorAll('.suit-btn[data-suit]').forEach(btn => {
  btn.addEventListener('click', () => send({ type: 'chooseTrump', action: 'suit', suit: btn.dataset.suit }));
});
$('btn-botifarra').addEventListener('click', () => send({ type: 'chooseTrump', action: 'botifarra' }));
$('btn-delegate').addEventListener('click', () => send({ type: 'chooseTrump', action: 'delegate' }));

$('btn-double-yes').addEventListener('click', () => send({ type: 'respondDouble', double: true }));
$('btn-double-no').addEventListener('click', () => send({ type: 'respondDouble', double: false }));

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
    const label = p ? `${p.isBot ? '🤖 ' : ''}${p.name}` : 'Buit';
    li.innerHTML = `<span class="dot"></span><span class="seat-num">Seient ${i + 1}</span><span>${label}</span>`;
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
  // Mapeja seients relatius: 0=jo(bottom), 1=el de la meva dreta, 2=el meu company(top), 3=el de la meva esquerra
  const posOrder = ['bottom', 'right', 'top', 'left'];
  for (let seat = 0; seat < 4; seat++) {
    const rel = relativePos(mySeat, seat);
    const posName = posOrder[rel];
    const tag = $(`tag-${posName}`);
    const p = state.players[seat];
    const isTurn = (state.phase === 'playing' && state.currentTurn === seat) ||
      (state.phase === 'trump-choice' && state.trumpChooserSeat === seat) ||
      (state.phase === 'doubling' && (state.doublingEligible || []).includes(seat) && !(state.doublingResponded || []).includes(seat));
    const isDealer = state.dealerSeat === seat;
    tag.classList.toggle('active-turn', isTurn);
    const nameSpan = tag.querySelector('.seat-name');
    let label = p ? `${p.isBot ? '🤖 ' : ''}${p.name}` : `Seient ${seat + 1}`;
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

  renderTrumpChoice(state, mySeat);
  renderDoubling(state, mySeat);
  renderDealResult(state);
  renderGameOver(state);
  renderLog(state);
}

function makeCardEl(card, big) {
  const el = document.createElement('div');
  el.className = `card suit-${card.suit}`;
  const img = document.createElement('img');
  img.src = `cards/${card.suit}-${card.rank}.png`;
  img.alt = `${RANK_LABEL[card.rank]} de ${SUIT_NAME[card.suit]}`;
  img.draggable = false;
  el.appendChild(img);
  return el;
}

function renderTrumpChoice(state, mySeat) {
  const panel = $('trump-panel');
  if (state.phase !== 'trump-choice') { panel.hidden = true; return; }
  const isMyChoice = state.trumpChooserSeat === mySeat;
  panel.hidden = !isMyChoice;
  if (!isMyChoice) {
    $('trump-status').textContent = `${seatLabel(state, state.trumpChooserSeat)} està triant el trumfo…`;
    return;
  }
  $('trump-status').textContent = state.canDelegate
    ? 'Ets el repartidor: tria un pal de trumfo, canta Botifarra, o delega la tria al teu company.'
    : 'El teu company t\'ha delegat la tria: has de triar un pal o Botifarra (ja no es pot tornar a delegar).';
  $('btn-delegate').style.display = state.canDelegate ? '' : 'none';
}

function renderDoubling(state, mySeat) {
  const panel = $('double-panel');
  if (state.phase !== 'doubling') { panel.hidden = true; return; }

  const eligible = state.doublingEligible || [];
  const responded = state.doublingResponded || [];
  const isEligible = eligible.includes(mySeat) && !responded.includes(mySeat);
  panel.hidden = !isEligible;
  if (!isEligible) return;

  const stageLabels = { contro: 'Contro', recontro: 'Recontro', santvicenc: 'Sant Vicenç' };
  const stageLabel = stageLabels[state.doublingStage] || 'Doblar';
  $('double-title').textContent = stageLabel;

  const explain = {
    contro: 'L\'equip contrari ha triomfat. Voleu doblar el valor de la mà (Contro)?',
    recontro: 'L\'equip contrari ha cantat Contro. Voleu tornar a doblar (Recontro)?',
    santvicenc: 'S\'ha cantat Recontro. Voleu doblar un cop més (Sant Vicenç)?'
  };
  $('double-status').textContent = explain[state.doublingStage] || '';
  $('btn-double-yes').textContent = `Sí, cantar ${stageLabel}!`;
}

let lastAckedDeal = -1;
function renderDealResult(state) {
  const panel = $('deal-result-panel');
  if (state.phase !== 'scoring') { panel.hidden = true; return; }
  panel.hidden = false;
  $('deal-result-text').textContent = state.lastDealSummary || (state.log[state.log.length - 1] || '');
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
