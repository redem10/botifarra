# Botifarra Online

Joc de la Botifarra (4 jugadors, baralla espanyola de 48 cartes) per jugar en línia amb WebSockets.

## Com funciona

- **Servidor** (Node.js + Express + `ws`): gestiona les sales, la baralla, els cants, el trumfo, les baces i la puntuació de manera autoritativa. `server/game.js` conté totes les regles del joc; `server/server.js` exposa el WebSocket i serveix els fitxers estàtics.
- **Client** (`public/`): pàgina única en HTML/CSS/JS sense frameworks. Es connecta per WebSocket, mostra la taula, la teva mà i els panells de cants/trumfo/resultats.

## Posar-ho en marxa en local

```bash
npm install
npm start
```

Obre `http://localhost:3000` en 4 pestanyes o dispositius diferents. Un jugador crea la sala ("Crear una sala") i rep un codi de 4 caràcters; els altres tres l'introdueixen a "Unir-me a la sala".

## Desplegar-ho perquè hi jugui gent des de fora

Necessites un host que executi Node.js de manera persistent i permeti WebSockets (no un hosting purament estàtic). Opcions habituals:

- **Railway / Render / Fly.io**: connecta el repositori, defineixen automàticament `npm start` com a comanda d'arrencada. Cal exposar el port que ve a `process.env.PORT` (ja ho fa el codi).
- **Un VPS propi**: `npm install --production && npm start`, darrere d'un reverse proxy (nginx/Caddy) amb TLS perquè el WebSocket vagi per `wss://`.

Un cop desplegat, comparteix la URL i el codi de sala amb els altres tres jugadors.

## Regles implementades

- Repartiment de 12 cartes per jugador (48 cartes: oros, copes, espases, bastos, de l'1 al 12).
- Cants per torns (16 a 60, o "Botifarra" per comprometre's a guanyar totes les baces), amb el jugador guanyador triant el trumfo.
- Obligació de seguir el pal i de matar amb trumfo quan no es pot seguir (regla simplificada: sempre cal pujar si es pot).
- Puntuació: si l'equip que ha cantat arriba als punts promesos, se'ls emporta (o els 120 si era Botifarra) més els punts que faci l'altre equip; si falla, tots els punts (els seus i el compromís) van a l'equip contrari.
- Partida a 101 punts.
- Reconnexió bàsica: si algú perd la connexió i torna a entrar amb el mateix nom i codi de sala, recupera el seu seient.

Nota: les regles de la botifarra varien una mica segons la colla i la zona (per exemple, el "renuncio" no està implementat). Si vols ajustar algun detall (valors de cant, punts per guanyar la partida, etc.), es pot retocar fàcilment a `server/game.js`.
