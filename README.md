# Angry Marbles v0.5.0

React and TypeScript game prototype with locked v0.4.2 board geometry, a browser-local demo, and an optional Cloudflare Workers backend. The Worker handles accounts and authenticated game actions, D1 stores account/session and room-discovery data, and Durable Objects own authoritative game state and realtime room updates. This upgrade was verified locally with two authenticated browser sessions against the real Worker routes and isolated D1/Durable Objects.

## Features retained

- Approved geometry from v0.4.2: square singles board, and four-, six-, or eight-player team polygons; 18 track holes per side, red marker 2, green marker 8, five visible home holes, and five base marbles in each avatar inventory. Legacy base coordinates remain unchanged but are not drawn.
- One authoritative `pb_hooks/boardGeometry.cjs` module supplies coordinates and track indices to the SVG renderer and both game engines.
- The React board renderer and scoped arcade stylesheet are ported from the original approved v0.4.2 `index.html`; existing auth, lobby, and server-validated move flows remain in place.
- The active player's base start is rotated to face them; SVG seat labels follow the rotation but stay readable. Mobile phones/tablets are detected at runtime and use the source's responsive board layout.
- Backend-free local mode supports choosing a game size, playing cards, moving marbles, and discarding.
- Original Jack, Queen, King, and Joker illustrations from v0.4.2.
- Separate accounts (you and your wife each sign in from your own device).
- Choose to play on the **same team** or **opposite teams** when joining a 4-, 6-, or 8-seat partner game; teammates sit directly opposite. Singles 1–4, with one seat as practice.
- Invite codes and public-room discovery; the host starts a 15–300-second human waiting period. Empty spots become bots when it expires. The server has a minute-interval fill backup; active clients fill immediately after the deadline.
- 48 presets plus custom hex marble colors; duplicate exact colors rejected.
- 108 playing cards: two 54-card decks including four jokers; five cards dealt, one drawn at turn start. Discards recycled as deck empties, preserving hands. Dealer marker rotates, no reward/penalty.
- Server-controlled cards, movements, bot turns, player statistics (games, wins, losses, bumps, assists).
- Ace or face card releases a marble *to exit only*; ace can advance 1, face cards 10; split 7 forward across two; 8 backward only; split 9 forward/back on separate marbles; joker; friendly and opponent bumps, base-exit assists, blocked home entrance, home-run logjams. See `tests/engine.test.js`.
- Realtime invalidations over Durable Object WebSockets; each connected player fetches a personal room view. Game decks and other hands are never exposed to other players.

## Local development

Prerequisite: Node.js 22 or newer. Cloudflare backend emulation is optional for the browser-local demo.

```powershell
npm ci
npm run dev
```

Vite serves the app at <http://localhost:5173/angrymarbles/> by default; port 5173 may increment if it is already occupied. To run the backend locally, use separate terminals for the Worker and frontend:

```powershell
npm run db:migrate:local
npm run worker:dev
```

The frontend API base defaults to `/api`, which Vite proxies to the Worker at `127.0.0.1:8787`. Put these settings in an untracked `.env.local` file to enable the account and lobby UI:

```dotenv
VITE_API_BASE_URL=/api
VITE_BASE_PATH=/
```

Run `npm run dev` in another window. D1 migrations are applied by the command above. Local Worker and D1 state are development-only; remote play requires a deployed Worker and database.

Run `npm test` and `npm run build` for the current checks.

**Important:** Localhost is reachable only from the device running the development server. Remote play requires the Worker to be deployed to a reachable HTTPS URL.

## GitHub Pages deployment

The `.github/workflows/pages.yml` workflow deploys the static frontend from `main` and builds it against the deployed Worker API. First create the Cloudflare D1 database, set its ID in `wrangler.jsonc`, apply remote migrations, and deploy the Worker with `npm run worker:deploy`. The workflow's `VITE_API_BASE_URL` is the public Worker HTTPS URL ending in `/api`. The expected site is <https://jasonw79118.github.io/angrymarbles/>. GitHub Pages hosts only the static frontend.

## Cloudflare backend setup

The Worker uses D1 for accounts, sessions, stats, room discovery, and short-lived WebSocket tickets. Each room is a Durable Object, which serializes authoritative moves and stores the full private game state. The production D1 database is created and migrated, and the Worker is deployed at <https://angry-marbles-api.jasonw79118.workers.dev>. Local development uses `npm run db:migrate:local`, `npm run worker:dev`, and `npm run dev`. The public Worker health and unauthenticated auth routes have been verified; signup from two real player accounts and a complete multiplayer game still need browser verification.

## Security and operational limitations

- **Prototype, not public-launch ready.** Configure email verification and password recovery before opening sign-ups widely. Add abuse controls, a privacy notice, and backups. Registration currently creates accounts without email verification.
- The browser only receives a bearer session token and per-player room views. Password hashes, session hashes, game decks, and other players' hands stay server-side. The frontend API URL is public configuration; never put Cloudflare API tokens or other secrets in `VITE_*` variables or the browser.
- The renderer and rules engines now use the approved polygon geometry module. The board geometry suite verifies 72, 108, and 144 unique track holes and the lane/marker counts.
- Bot moves are persisted and scheduled one at a time at 4.5-second intervals by Durable Object alarms. Public played cards remain visible on the board and in the card ledger. Advanced strategic AI remains future work.
- Realtime changes use single-use ticketed Durable Object WebSockets with automatic reconnection. Confirmed action sequence IDs prevent duplicate effects; joining or rejoining restores the final state without replaying old animations.
- Some stats semantics are house-rule assumptions; agree on the definition of a "player assist" before a formal leaderboard.
- No existing Convex user accounts or games are migrated automatically. If Convex held any real data, an explicit migration would be necessary.

## File map

- `worker/index.ts`: account/session endpoints and authenticated API routing.
- `worker/GameRoom.ts`: authoritative room state, rules actions, bots, alarms, and realtime notifications.
- `worker/migrations/`: D1 schema migrations.
- `worker/auth.ts`: password and session-token hashing.
- `src/engine.js`: frontend pure engine helpers and original rules unit tests.
- `src/App.tsx`: React lobby and interactive room.
- `src/cloudflare.ts`: browser API client and Durable Object WebSocket subscription.
- `.github/workflows/pages.yml`: GitHub Pages build/deploy workflow.
- `handoff.txt`: upgrade notes, remaining validation.

### v0.5.0 trapdoor upgrade

- Pick a card, then pick a specific marble on the board, in its avatar inventory, or using the numbered marble buttons. Tapping a marble with one legal move selects that move automatically. Selecting a card no longer preselects a marble and then accidentally clears it when tapped.
- An 8 moves an already-released track marble backward, including from green START; it never releases inventory. Ace/J/Q/K release inventory to the unchanged green start.
- Confirmed release: existing occupant is ejected or redirected, an inventory token drops into the separate avatar pocket, then a lid opens on the existing green hole and the marble rises from below. Opponents return to inventory. Teammates go to their own red OUTER-TRACK marker and remain vulnerable. Per the user's clarification, an occupied teammate red marker returns that teammate to inventory without moving the occupant.
- Base racks, their holes, base-piece drawings, and on-board base counts are hidden. All five home holes and all 72/108/144 track holes retain their exact IDs and coordinates.
- Current and recent public played cards are shown separately from private hands. A bounded 256-action public ledger and sequenced visual queue cover rapid updates. Reduced motion, fast playback and silent sound are supported; animations do not authorize moves.
- Existing waiting countdown options, including 120 seconds, remain server-controlled. No human turn clock was added: this repository did not have a 120-second per-move clock to preserve.

Validation: `npm test` (52 rule/geometry tests), `npm run test:integration` (real Worker routes, privacy, collisions, bot alarms and stats), `npm run build`, and `npx wrangler deploy --dry-run`. Exact coordinate regression: tests/fixtures/geometry-v0.4.2.json. Browser evidence and the animation recording: [v0.5.0 review](docs/trapdoor-v0.5.0/README.md).

Deployment order: deploy the Worker before pushing/merging the frontend release to main. No D1 schema migration or wrangler.jsonc changes are needed. Old rooms acquire action history on their next confirmed action; existing positions are not migrated. The test-only fixture entry point is never imported by the production Worker.
