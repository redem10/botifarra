const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const crypto = require('crypto');
const { BotifarraGame } = require('./game');

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const rooms = new Map(); // roomCode -> BotifarraGame
const waitingQueue = []; // clients esperant partida "Jugar Online"
const BOT_NAMES = ['Robot Nord', 'Robot Est', 'Robot Sud'];

function makeRoomCode() {
  let code;
  do {
    code = crypto.randomBytes(2).toString('hex').toUpperCase();
  } while (rooms.has(code));
  return code;
}

function broadcast(game) {
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    if (client.roomCode !== game.roomCode) continue;
    client.send(JSON.stringify({ type: 'state', state: game.stateFor(client.seat) }));
  }
}

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function sendError(ws, message) {
  send(ws, { type: 'error', message });
}

function broadcastQueueStatus() {
  waitingQueue.forEach((client, idx) => {
    send(client, { type: 'queueStatus', count: waitingQueue.length, needed: 4 });
  });
}

function removeFromQueue(ws) {
  const idx = waitingQueue.indexOf(ws);
  if (idx !== -1) {
    waitingQueue.splice(idx, 1);
    ws.inQueue = false;
    broadcastQueueStatus();
  }
}

// Fa jugar els bots en cadena (amb una petita pausa perquè es vegi natural) fins que torni a tocar a un humà
function runBots(game) {
  if (!game.performBotTurn()) return;
  broadcast(game);
  setTimeout(() => runBots(game), 600 + Math.random() * 500);
}

wss.on('connection', (ws) => {
  ws.roomCode = null;
  ws.seat = null;
  ws.playerId = crypto.randomBytes(8).toString('hex');

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return sendError(ws, 'Missatge invàlid.');
    }

    try {
      handleMessage(ws, msg);
    } catch (e) {
      console.error(e);
      sendError(ws, 'Error intern del servidor.');
    }
  });

  ws.on('close', () => {
    if (ws.inQueue) removeFromQueue(ws);
    if (ws.roomCode && rooms.has(ws.roomCode)) {
      const game = rooms.get(ws.roomCode);
      game.removePlayerBySocket(ws.playerId);
      broadcast(game);
    }
  });
});

function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'create': {
      const roomCode = makeRoomCode();
      const game = new BotifarraGame(roomCode);
      rooms.set(roomCode, game);
      joinRoom(ws, game, msg.name);
      break;
    }
    case 'quickAI': {
      const roomCode = makeRoomCode();
      const game = new BotifarraGame(roomCode);
      rooms.set(roomCode, game);
      joinRoom(ws, game, msg.name);
      BOT_NAMES.forEach((botName) => {
        game.addPlayer(`bot-${roomCode}-${botName}`, botName, true);
      });
      game.startDeal();
      broadcast(game);
      runBots(game);
      break;
    }
    case 'queueOnline': {
      ws.playerName = (msg.name || 'Jugador').slice(0, 20);
      ws.inQueue = true;
      waitingQueue.push(ws);
      broadcastQueueStatus();
      if (waitingQueue.length >= 4) {
        const four = waitingQueue.splice(0, 4);
        const roomCode = makeRoomCode();
        const game = new BotifarraGame(roomCode);
        rooms.set(roomCode, game);
        four.forEach((client) => {
          client.inQueue = false;
          const seat = game.addPlayer(client.playerId, client.playerName);
          client.roomCode = roomCode;
          client.seat = seat;
          send(client, { type: 'joined', roomCode, seat });
        });
        game.startDeal();
        broadcast(game);
        runBots(game);
      }
      break;
    }
    case 'cancelQueue': {
      removeFromQueue(ws);
      break;
    }
    case 'join': {
      const roomCode = (msg.roomCode || '').toUpperCase().trim();
      const game = rooms.get(roomCode);
      if (!game) return sendError(ws, 'Aquesta sala no existeix.');
      if (game.isFull()) {
        // intentar reconnectar si el nom coincideix amb un seient desconnectat
        const seatIdx = game.players.findIndex(p => p && !p.connected && p.name === msg.name);
        if (seatIdx !== -1) {
          game.reconnect(seatIdx, ws.playerId);
          ws.roomCode = roomCode;
          ws.seat = seatIdx;
          send(ws, { type: 'joined', roomCode, seat: seatIdx });
          broadcast(game);
          return;
        }
        return sendError(ws, 'La sala ja té 4 jugadors.');
      }
      joinRoom(ws, game, msg.name);
      break;
    }
    case 'bid': {
      const game = getGame(ws);
      if (!game) return;
      const result = game.placeBid(ws.seat, msg.action, msg.value);
      if (result.error) return sendError(ws, result.error);
      broadcast(game);
      runBots(game);
      break;
    }
    case 'chooseTrump': {
      const game = getGame(ws);
      if (!game) return;
      const result = game.chooseTrump(ws.seat, msg.suit);
      if (result.error) return sendError(ws, result.error);
      broadcast(game);
      runBots(game);
      break;
    }
    case 'playCard': {
      const game = getGame(ws);
      if (!game) return;
      const result = game.playCard(ws.seat, msg.cardId);
      if (result.error) return sendError(ws, result.error);
      broadcast(game);
      runBots(game);
      break;
    }
    case 'startGame': {
      const game = getGame(ws);
      if (!game) return;
      if (!game.isFull()) return sendError(ws, 'Calen 4 jugadors per començar.');
      if (game.phase !== 'waiting') return sendError(ws, 'La partida ja ha començat.');
      game.startDeal();
      broadcast(game);
      runBots(game);
      break;
    }
    case 'nextDeal': {
      const game = getGame(ws);
      if (!game) return;
      const result = game.nextDeal();
      if (result.error) return sendError(ws, result.error);
      broadcast(game);
      runBots(game);
      break;
    }
    default:
      sendError(ws, 'Tipus de missatge desconegut.');
  }
}

function joinRoom(ws, game, name) {
  const seat = game.addPlayer(ws.playerId, (name || 'Jugador').slice(0, 20));
  if (seat === -1) return sendError(ws, 'La sala ja té 4 jugadors.');
  ws.roomCode = game.roomCode;
  ws.seat = seat;
  send(ws, { type: 'joined', roomCode: game.roomCode, seat });
  broadcast(game);
}

function getGame(ws) {
  if (!ws.roomCode || !rooms.has(ws.roomCode)) {
    sendError(ws, 'No estàs en cap sala.');
    return null;
  }
  return rooms.get(ws.roomCode);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Botifarra online escoltant al port ${PORT}`);
});
