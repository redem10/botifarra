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

## Regles implementades (regles tradicionals catalanes)

Fonts consultades: pagat.com/manille/botifarc.html, cccj.es/reglaments/botifarra.htm i en.wikipedia.org/wiki/Botifarra_(card_game).

- **Baralla i valor de les cartes**: 48 cartes espanyoles. Dins de cada pal, l'ordre de força és **9 (Manilla), As, Rei, Cavall, Sota, 8, 7, 6, 5, 4, 3, 2** — el mateix ordre tant si el pal és trumfo com si no ho és; el trumfo simplement guanya sempre a la resta de pals.
- **Punts**: Manilla=5, As=4, Rei=3, Cavall=2, Sota=1 (la resta 0), + 1 punt per cada basa guanyada. Total: **72 punts per mà**.
- **Triar trumfo**: el repartidor tria un pal, canta **Botifarra** (mà sense trumfo), o **delega** l'elecció al seu company (que ja no podrà tornar a delegar).
- **Dobles**: un cop triat el trumfo, l'equip contrari pot cantar **Contro** (doblar el valor de la mà); si ho fa, l'equip que ha triomfat pot **Recontrar**; si es recontra i no és botifarra, l'equip contrari pot fer **Sant Vicenç**. Una mà de Botifarra ja duplica el valor per si mateixa; els dobles addicionals es multipliquen (fins a x16 si es canten tots).
- **Obligació de jugar**: cal servir el pal de sortida si es pot; si guanya un contrari, cal superar-lo si és possible (seguint pal amb una carta més alta, o trumfant si no es té el pal); si guanya el propi company, només cal servir, sense obligació de pujar.
- **Puntuació de la mà**: l'equip que supera els 36 punts (la meitat de 72) s'anota l'excés multiplicat pels dobles cantats. Empat a 36-36: ningú s'anota la mà.
- **Fi de partida**: la partida es juga a 101 punts.
- Els bots de la IA sempre passen en la fase de dobles (mai canten Contro/Recontro/Sant Vicenç) per mantenir un comportament predictible; els jugadors humans sí que hi poden jugar amb normalitat.
- Reconnexió bàsica: si algú perd la connexió i torna a entrar amb el mateix nom i codi de sala, recupera el seu seient.

Nota: existeixen variants regionals (occidental/oriental) amb petites diferències en l'obligació de jugar carta de valor quan no es pot guanyar; aquesta implementació segueix la variant occidental (la que s'aplica per defecte quan no s'acorda el contrari), que és la més estesa. Si vols ajustar algun detall, tot el motor de regles és a `server/game.js`.
