# Angry Marbles v0.6.0 verification

This is the existing React application with materials and animations adapted from the scanned v0.6.0 reference source. Screenshots are from the actual application connected to an isolated instance of the production Cloudflare Worker. The supplied offline demo is not shipped as the game.

| Players | Shared track | Home | Physical base holes | Every center and ID checked |
| --- | ---: | ---: | ---: | --- |
| 4 | 72 | 20 | 0 | Yes |
| 6 | 108 | 30 | 0 | Yes |
| 8 | 144 | 40 | 0 | Yes |

`comparison-4.png`, `comparison-6.png`, and `comparison-8.png` place the supplied deterministic renderer screenshot on the left and the actual React board on the right. Production keeps its existing viewer-at-bottom orientation; reference coordinates are used for independent tests only. Desktop screenshots use a 1365x768 viewport and phone screenshots use 390x844. Board screenshots select the eight and a specific marble on green; they do not submit a move.

`confirmed-pocket-trapdoor.webp` is an actual browser recording of a server-confirmed release. `browser-results.json` documents assertions from two authenticated sessions. Additional screenshots show opponent ejection, teammate red-track teleport, occupied-red return, lobby and waiting room.

Validated: 63 unit/rule/geometry/timeline tests, one real Worker integration test, production TypeScript/Vite build, and four supplied reference tests. Reference tests ran unmodified in an isolated CommonJS folder because the app's ESM package setting prevents the supplied CommonJS test from requiring its `.js` source directly. Defender completed the v0.6.0 custom scan without a matching detection. No v0.5.1 files were used.

Changed code: `ApprovedBoard.tsx` retains all geometry and delegated piece selection while applying extracted SVG materials; `materials.ts` holds the reference gradients/grain; `actionTimeline.js` and `animateAction.ts` drive confirmed effects; `useActionPlayback.ts` shares the effect duration; `App.tsx` integrates new portraits and phase descriptions; `marbles.css` applies reference styling and responsive inventories. Package and engine version constants are 0.6.0. `visual-timeline.test.js` adds reference comparisons and timeline invariants.

Assets: all six supplied portrait PNGs are used, with cyclic reuse for eight seats. The supplied tabletop PNG is optimized to WebP. Existing playing cards remain. Concept illustrations are excluded as board images because their holes do not define approved geometry. The demo's rules and controls are excluded. No backend API, login, statistics, card logic or production geometry changes were made. Occupied teammate red retains the user's approved inventory-return rule and warning. Existing waiting countdown is retained; this app has no per-human-move 120-second timer.
