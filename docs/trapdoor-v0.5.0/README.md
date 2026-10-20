# Angry Marbles v0.5.0 verification

Implemented against the existing React + Cloudflare app, following design-reference/angry-marbles-trapdoor-v0.5.0/AGENT_INSTRUCTIONS.md. No replacement board or PocketBase integration.

## Evidence

| Board | Desktop (1365×768 viewport) | Phone (390×844 viewport) |
| --- | --- | --- |
| 4 players, after confirmed release | [Desktop](board-4-desktop.png) | [Phone](board-4-phone.png) |
| 6 players | [Desktop](board-6-desktop.png) | [Phone](board-6-phone.png) |
| 8 players | [Desktop](board-8-desktop.png) | [Phone](board-8-phone.png) |

[Actual-browser animated release recording](confirmed-pocket-release.webp) · [Browser acceptance results](browser-results.json)

Additional evidence: [Backward 8](backward-eight.png), [opponent ejection](release-opponent.png), [teammate at red](release-teammate.png), [occupied-red fallback](release-occupied-red.png).

The animation recording is captured from the running application during a confirmed Worker action, not the reference demo. Full-page screenshots retain each requested browser viewport width. Browser checks compare every actual rendered track/home hole ID and center against the locked module, assert zero rendered base holes and zero phone horizontal overflow, and verify a separate avatar pocket per player.

Two authenticated local browser sessions saw the same confirmed release and animation. Isolated tests use actual production routing and GameRoom logic, with only a test-only entry point for seeding local scenarios. The production Worker does not import this entry point. No production accounts/data or supplied room 8FNHLY were modified.

## Acceptance

- 52 rule/geometry tests pass, including exact full-coordinate snapshot comparisons for 4/6/8, empty green, own blocker, opponent return, teammate red vulnerability, occupied red returning teammate to inventory, specific base slot selection, and backward 8 from green.
- Real Worker integration passes: authenticated routes, two private views, public action equality, no batch bot turns, persisted alarm spacing at least four seconds, duplicate action rejection, and bump stats.
- Frontend type check/build and Worker deployment dry run pass.
- Browser acceptance covers confirmed drop/lift, all collision outcomes, backward-8 click selection, reduced motion, reconnect/re-entry without old animation, and fast queued playback.
- Board geometry source, card art, production API endpoints, auth schema and waiting countdown choices remain intact. No 120-second human per-move clock exists in the source; no new one was introduced.
- Teammate-red occupancy fallback is the user's explicit choice: return the displaced teammate to their avatar inventory and preserve the existing red occupant.

## Asset use

The new bundle's glossy marble and fantasy avatar sheets have exactly the same SHA-256 hashes as the previously integrated sheets, so the optimized existing public/assets/art assets are reused. The animation examples guide the separate inventory drop, green trap lid and below-board lift. The concept-board image is a style reference only; it is not rendered. Existing card art is unchanged. Effects are silent and honor reduced motion; fast playback is a local preference, not a server turn-speed change.

## Changed files

- README.md; handoff.txt; package.json; package-lock.json
- src/App.tsx; src/types.ts; src/engine.js; src/cloudflare.ts; src/marbles.css
- src/useActionPlayback.ts; src/board/ApprovedBoard.tsx; src/board/animateAction.ts
- worker/GameRoom.ts
- tests/engine.test.js; tests/trapdoor.test.js; tests/fixtures/geometry-v0.4.2.json
- tests/support/fixture-worker.ts; tests/support/worker-harness.js; tests/integration/worker.integration.test.js
- docs/trapdoor-v0.5.0/: this report, browser-results.json, six board screenshots, four scenario screenshots and the animated WebP recording.

Explicitly unchanged: pb_hooks/boardGeometry.cjs, src/main.tsx (theme remains last), wrangler.jsonc, worker auth/router and D1 migrations, public/assets/cards/ and public/assets/art/.

Deployment requires the Worker first, then the main-branch Pages workflow. This branch is not deployed.

Follow-up: selecting a move with an occupied teammate red marker displays a warning before play. The confirmed return to inventory also displays a prominent amber alert. Warning text comes from authoritative move validation and the confirmed action. Regression assertions cover both warnings for 4/6/8 boards.
