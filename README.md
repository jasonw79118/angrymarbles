# Angry Marbles

React and TypeScript game prototype with locked v0.4.2 board geometry, a browser-local demo, and an optional self-hosted PocketBase backend. Local demo play is simulated in one browser; online multiplayer has not yet been verified against a running PocketBase service.

## Features retained

- Approved geometry from v0.4.2: square singles board, and four-, six-, or eight-player team polygons; 18 track holes per side, red marker 2, green marker 8, five home holes, and five visible base holes.
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
- Realtime signals over PocketBase SSE; each connected player fetches a personal room view. Game decks and other hands are never exposed in the built-in collection API.

## Local development

Prerequisite: Node.js 22 or newer. PocketBase is optional for the local demo.

```powershell
npm ci
npm run dev
```

Vite serves the app at <http://localhost:5173/angrymarbles/> by default; port 5173 may increment if it is already occupied.

To run the PocketBase starter locally, download the official PocketBase v0.40.x Windows binary and place `pocketbase.exe` in the project root. Start it in one PowerShell window:

```powershell
.\pocketbase.exe serve --http=127.0.0.1:8090
```

Create a local superuser at <http://127.0.0.1:8090/_/>. Put these settings in an untracked `.env.local` file to enable the account and lobby UI:

```dotenv
VITE_POCKETBASE_URL=http://127.0.0.1:8090
VITE_BASE_PATH=/
```

Run `npm run dev` in another window. PocketBase migrations apply on startup. Localhost is reachable only from the PocketBase host; remote play requires an independently hosted HTTPS server. The source ZIP intentionally contains no executable.

Run `npm test` and `npm run build` for the current checks.

**Important:** Localhost (`127.0.0.1`) is reachable only from the device hosting PocketBase. Your wife cannot connect from her device until PocketBase is on a reachable **HTTPS** server.

## GitHub Pages deployment

The `.github/workflows/pages.yml` workflow deploys the static frontend from `main`. Enable **GitHub Actions** in repository Pages settings. It builds without PocketBase for the local demo; to enable online features, set the Actions variable `VITE_POCKETBASE_URL` to the public HTTPS PocketBase origin and allow `https://jasonw79118.github.io` in PocketBase. The expected site is <https://jasonw79118.github.io/angrymarbles/>. GitHub Pages does not host PocketBase.

## Always Free backend hosting (Oracle, subject to capacity)

Oracle's Always Free eligible A1 compute resource is currently equivalent to **2 OCPU / 12 GB RAM**, but machine supply varies by region and resources beyond the Free eligibility can incur charges. Don't assume a VM has been provisioned automatically. See `deploy/README.md` and `deploy/angry-marbles.service` for a practical Linux example.

## Security and operational limitations

- **Prototype, not public-launch ready.** Configure email verification and recovery SMTP before opening sign-ups widely. Enable rate limiting, add account abuse defenses, a privacy notice, and backups. PocketBase explicitly notes pre-v1 APIs can change and it is not recommended for production-critical systems without manual upgrade care.
- Only `players` signup/login may be accessed through standard collection routes. Both `am_rooms` and `am_stats` have locked rules; all changes go through authenticated, server-validated custom API routes. The `.env` frontend URL is public configuration, **never store a PocketBase superuser secret in GitHub Actions or the browser**.
- The renderer and rules engines now use the approved polygon geometry module. The board geometry suite verifies 72, 108, and 144 unique track holes and the lane/marker counts.
- **Bot moves execute immediately server-side** after the current human turn; visible timed bot animations and advanced strategic AI are future upgrades.
- Realtime is event-driven SSE with a **30-second reconnection/fallback refresh** per active room; it is not a client-side 1-second polling loop. Countdown UI updates locally every second.
- Some stats semantics are house-rule assumptions; agree on the definition of a "player assist" before a formal leaderboard.
- No existing Convex user accounts or games are migrated automatically. If Convex held any real data, an explicit migration would be necessary.

## File map

- `pb_migrations/`: PocketBase collections and restricted rules.
- `pb_hooks/main.pb.js`: secured custom routes and 1-minute fill backup job.
- `pb_hooks/controller.js`: transaction-safe room actions, real-time invalidations, stats.
- `pb_hooks/engine.js`: CommonJS mirror of the authoritative rules engine for PocketBase's JavaScript runtime.
- `src/engine.js`: frontend pure engine helpers and original rules unit tests.
- `src/App.tsx`: React lobby and interactive room.
- `src/pb.ts`: PocketBase client adapter.
- `.github/workflows/pages.yml`: GitHub Pages build/deploy workflow.
- `handoff.txt`: upgrade notes, remaining validation.

### Current validation

`npm test`: 27 tests passing. `npm run build`: passes. The reference package's `verify_geometry.py` passes in UTF-8 mode. The React board was checked against the approved six-player screenshot and verified at the exact lowercase `/angrymarbles/` route on desktop and mobile. PocketBase v0.40.x service integration and two-account online play have not yet been completed; do not treat multiplayer as verified.

The requested `design-reference/AGENT_FIX_PROMPT.md` directory/file was not present in the supplied local project or user-profile search. Restoration followed the explicit requirements in the user request and the original v0.4.2 archive in Downloads.
