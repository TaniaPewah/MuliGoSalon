# multiGO

A small real-time multiplayer **Go** (baduk / weiqi) salon, in the spirit of the online Go client from *Hikaru no Go*: a pastel 2D room where you walk around as a sloth, a shark or a jellyfish, sit down at a table or hit **Find game**, and play Go against another connected player with a server-side clock. A built-in **Practice** mode offers classic life-and-death (tsumego) problems you can solve solo.

Everything is in-memory: no database, no accounts. Ratings live for as long as your browser tab is connected.

## Stack

| Part      | Tech                                                                    |
| --------- | ----------------------------------------------------------------------- |
| `server/` | Node.js, TypeScript, Express, Socket.io, [`@sabaki/go-board`](https://github.com/SabakiHQ/go-board) for board mechanics |
| `client/` | React 18, TypeScript, Vite, hand-rendered SVG board, WebAudio sounds    |
| `shared/` | Protocol and domain types shared by both sides                          |

The server is the **single source of truth** for every game. The client never mutates game state; it only renders what the server sends and shows an optimistic hover preview.

## Running it

```bash
npm install
npm run dev
```

- Client (Vite): <http://127.0.0.1:4871>
- Server (Socket.io + REST health check): <http://127.0.0.1:4870>

Open the client in two browser windows (or an incognito window) to play against yourself. Other useful scripts:

```bash
npm test          # server unit tests (rules, scoring, clock, tsumego set)
npm run typecheck # TypeScript for server and client
npm run build     # production build (server/dist + client/dist)
npm start         # serve the built client from the server on :4870
```

Ports can be changed with `PORT`/`HOST` for the server and `MULTIGO_SERVER_URL` for the Vite proxy.

## What you can do

- **Enter the salon** with a name and one of three characters (sloth, shark, jellyfish).
- **Walk around** with the arrow keys / WASD or by clicking the floor. Everyone sees everyone else move in real time, with names and ranks above the avatars.
- **Sit at a table** (9×9 blitz, 9×9 normal, 13×13, 19×19 long). When a second player sits down the game starts.
- **Find game** puts you in a matchmaking queue; the next two waiting players are paired (the first player's board size and time control are used).
- **Play**: click to place (hover preview), pass, resign. Each player sees the board from their own side – White's view is rotated 180°. Stone "clack" and capture "rustle" sounds are synthesised with WebAudio (no assets, no network).
- **Practice**: 13 built-in tsumego (captures, ladder, net, snapback, double atari, making two eyes, killing at the vital point, …). The server validates each move and plays the scripted refutation/response; the problem is solved when you reach a leaf of the accepted-move tree or capture the target stones.

## Rules implemented (server side)

- Alternating turns, legal placement only on empty on-board points.
- **Captures**, including capturing a chain while your own stone would otherwise have no liberties (capture is resolved before the suicide check).
- **Suicide is illegal.**
- **Simple ko**: immediately retaking a single stone that just captured a single stone is illegal. The ko point is marked on the board. A pass clears the ko.
- **Triple repetition**: the server hashes every position (board + player to move). If any position occurs three times (e.g. a triple ko), the game ends in a **draw**. Repeating a position once is otherwise allowed (no superko ban), as requested.
- **Pass**: two consecutive passes end the game and trigger scoring.
- **Scoring**: area scoring (Tromp-Taylor / Chinese style): stones on the board plus empty regions that touch only one colour, with **komi 7.5** for White. Dead stones are *not* removed automatically – capture them before passing, as under Tromp-Taylor rules. The final ownership map is drawn on the board.
- **Resign** and **timeout** (loss on time) and **abandon** (a disconnecting player forfeits).
- **Clock**: main time + Fischer increment per player (presets: 1 min + 5 s, 5 min + 10 s, 15 min + 15 s). The server owns the clock: it stamps every move, arms a timer for the player to move and declares the loss itself. Clients only interpolate the last server snapshot for display; a move that arrives after the flag fell is rejected and the game ends on time.

## Rating and ranks

Each connected player starts at **1500** and is updated after every game with a plain **Elo** formula (K = 32; a draw counts as ½). Ratings are mapped to traditional Go ranks on an EGF-like scale of **100 points per rank with 2100 = 1 dan**:

| Rating | Rank |
| ------ | ---- |
| 2100+  | 1d … 9d (one dan per 100 points, capped at 9d) |
| 2000   | 1 kyu |
| 1500   | 6 kyu (starting rank) |
| 1000   | 11 kyu |

Ratings are kept in memory per connection, so they reset when you reload the page. Real Go servers use more elaborate systems (Glicko-style uncertainty, handicap-aware expected scores); Elo was chosen because it is simple, well understood and good enough for v1.

## Sync architecture

What happens when a player clicks on the board:

1. **Client emits an intent.** The React client never changes the board itself. It sends `game:place { gameId, x, y }` (or `game:pass` / `game:resign`) over Socket.io. The only "optimistic" thing it draws is the translucent hover stone, which is purely cosmetic.
2. **Server validates against the authoritative state.** The `GoGame` instance for that game checks: is the game still running, is it this player's colour, is this player's turn, has their clock already expired, is the point on the board and empty, is it the ko point, would the move be suicide. Board mechanics (captures, liberties) come from `@sabaki/go-board`; ko, repetition, passes, scoring and the clock are implemented in `server/src/game/GoGame.ts`.
3. **On success** the move is applied: captures are removed, the ko point is recomputed, the mover's clock is charged for the elapsed time and credited the Fischer increment, the turn flips, the position hash is recorded (triple repetition ⇒ draw) and the authoritative timeout timer is re-armed for the new player to move. The server then broadcasts the **full `GameState`** (board, turn, captures, clocks sampled at server time, result, …) to the game room (both players and any spectators). A full snapshot is small for Go and makes the client trivially stateless; deltas were not needed for v1.
4. **On failure** the server emits `game:error { code, message }` **only to the sender**, nothing is broadcast and nothing changes. The client shows the message as a toast.
5. **Clocks** are never trusted from the client. Each snapshot carries the remaining time of both players at server time; the client counts down locally from the moment it received the snapshot and resynchronises on every new snapshot. When the server's timer fires it re-checks the clock and, if the flag fell, finishes the game and broadcasts the result – even if the player is idle.

The same pattern is used for the salon (`salon:move`, `salon:sit` → server clamps/validates → `salon:state` / `salon:moved` broadcast) and for practice (`practice:move` → server validates legality and matches the solution tree → `practice:state` back to that player). Walking within 100px of a table that has a live game joins the walker to that game room as a read-only spectator; they receive the same `game:state` snapshots and cannot place stones.

## Tests

```bash
npm test
```

Server unit tests (Vitest) cover: single and multi-stone captures, capturing while in atari, suicide (single and multi-stone), simple ko (forbidden, allowed after a tenuki, cleared by a pass, not triggered by multi-stone captures), triple repetition via a triple ko, two-pass scoring with komi, resignation, clock deduction + Fischer increment, timeout loss, late-move rejection, Elo updates, and every solution line of every tsumego problem (legality, server replies, success condition).

## Layout

```
shared/src/index.ts        protocol + domain types, rank mapping
server/src/index.ts        express + socket.io bootstrap (port 4870)
server/src/sockets.ts      socket event handlers (session, salon, queue, game, practice)
server/src/salon.ts        2D room state: players, positions, tables, seats
server/src/GameManager.ts  live games, timeout timers, rating updates
server/src/game/GoGame.ts  authoritative rules engine + clock
server/src/game/scoring.ts area scoring
server/src/practice/       tsumego problems + practice sessions
client/src/store.tsx       socket client, app state, sound triggers
client/src/components/     GoBoard (SVG), Avatar (SVG characters), Clock
client/src/views/          Login, Salon, Game, Practice
```

## Not in v1

Chat, dead-stone marking before scoring, handicap games, persistence of ratings and game records across server restarts, and a smarter rating system.
