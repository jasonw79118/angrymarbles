# Premium graphics restoration

Visual restoration of the working v0.6.0 React game. No board rebuild or gameplay redesign.

The supplied `fantasy_tabletop_background.png` and `tabletop-lantern-plants.png` are byte-identical (SHA-256 `89df8f3e4daf3c3d56ad2362230155d29301089460cb48b349e760145cbc5813`). The already optimized `public/assets/v060/tabletop.webp` is reused. The old 80–90% opaque background gradient was replaced with a light shade, the page no longer paints a second background, and the illustration is positioned at the top so its lanterns remain visible. No image aspect ratio is distorted. A felt-only crop of the same artwork supplies the board surface.

`src/board/glass.ts` reuses `marble-neutral.png`, derived from the supplied glossy marble sheet. Reusable SVG symbols apply per-player luminance tinting, curved reflections and internal swirls. Board sprites remain 21 SVG units across at their original centers, with the original hit targets and selection rings. Inventory and animation flight sprites reuse the glass texture with color blending. All six-digit custom player colors continue to work; the artwork is not restricted to eight baked colors.

Uniform viewBox framing follows the existing board outline and orientation. It does not modify the production coordinate module, hole centers, radii, indices, home lanes, or marble movement graph. The board now fills 91.9% of its SVG in four-player mode, 94.4% by 93.5% in six-player mode, and 94.3% in eight-player mode. The old on-board storage racks remain absent. Native browser pinch zoom remains enabled by the existing viewport meta tag.

Honey wood highlights, the existing wood texture, grain, carved-hole shadows and board shadows enrich the existing SVG surfaces. Larger fantasy avatars have player-color borders, five readable inventory positions, visible pockets, teammate/opponent labels, and a reduced-motion-aware active glow. The green play control, selected cards, waiting countdown badge and recent-move feedback have richer finishes. The control remains named **Play selected** and invokes the same handler. It sits below the board without covering holes.

The existing avatar-pocket -> green trapdoor -> marble rise -> close sequence is unchanged. Effects use the new glossy appearance. Opponents return to inventory; teammates go to their own red OUTER TRACK marker. The existing user-approved occupied-red inventory return and warning remain unchanged. No new rules, timer, API or backend deployment are introduced. The production 120-second waiting option is preserved; the app does not have a per-human-turn timer.

Validation:

- Before: actual four-player desktop/phone screenshots and a JSON snapshot, captured before edits.
- After: exact equality of every four-player rendered hole coordinate/radius/ID, pieces and turn against the baseline. Selected card and marble match the before screenshots.
- Four/six/eight boards: 72/108/144 track holes, 20/30/40 home holes, zero base holes, exact centers and IDs compared to production geometry.
- Every avatar, card and SVG image request succeeded under `/angrymarbles/`. No asset HTTP errors or browser runtime exceptions. No phone horizontal overflow at 390x844.
- Two authenticated sessions: exactly one confirmed pocket/drop/open/rise/close sequence per action; collision order, vulnerable teammate red target, occupied-red warning, own-green denial, backward eight, reconnect, reduced motion and fast queued actions verified.
- `npm test`: 63 pass. `npm run test:integration`: 1 pass. `npm run build`: TypeScript + Vite pass.
- `git diff` shows no changes to `pb_hooks/boardGeometry.cjs`, `src/engine.js`, `src/board/animateAction.ts`, `src/useActionPlayback.ts`, `src/cloudflare.ts`, `worker/`, `wrangler.jsonc`, or card artwork.

Evidence: `before-after-desktop.png`, `before-after-phone.png`, `before-state.json`, desktop/phone screenshots for each board, close-up board captures, `browser-results.json`, collision screenshots and `confirmed-pocket-trapdoor.webp` (actual browser recording).

No new artwork was generated, and no v0.5.1 files were used. The illustrated concept board is excluded because it cannot preserve approved holes. This restoration is local until explicitly published.
