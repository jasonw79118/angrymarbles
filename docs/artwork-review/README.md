# Angry Marbles artwork integration

Reviewed October 20, 2026. Source: design-assets/angry_marbles_asset_bundle_v1.

## Assets used

| Bundle asset | Integration |
| --- | --- |
| fantasy_animal_avatars.png | Six cropped 160px WebP portraits in PlayerList, assigned by seat; seats 7–8 reuse the first two. |
| glossy_marble_color_grid.png | Neutral glass sprite cropped from the dark marble; per-seat SVG component-transfer filters preserve preset and custom color choices. Existing marble circles, selection rings, click/keyboard delegation, and movement remain. |
| fantasy_tabletop_background.png | Compressed page backdrop; separate felt and wood crops skin the existing SVG board shapes and CSS tabletop/frame. Image overlays have no pointer events. |
| Four *_a_to_10_sheet.png sheets | Forty individual numbered card faces. |
| marble_royals_and_jokers_sheet.png | Twelve suit-specific royal faces and four joker variants, selected from the existing card IDs. |
| card_backs_sheet.png | Blue back on the draw pile. |
| end_turn_button_glossy.png | Style reference for CSS green, gold-rimmed primary buttons throughout the app. Live button labels and accessible names remain. |

Generated runtime assets: public/assets/art (67 files, approximately 1.1 MB). React/SVG URLs use import.meta.env.BASE_URL; CSS image URLs are rebased by Vite for /angrymarbles/.

Skipped: the red card-back variant because the app has one draw pile style; the baked-in “End Turn” image because the actual actions have different labels. Other marble colors in the sheet are unnecessary: one neutral texture supports every existing arbitrary player color without assigning the wrong color. Original source sheets remain untouched. No new dependency or API change.

## Verification

- npm test: 28/28 pass, including locked 72/108/144 track-hole geometry.
- npm run build: TypeScript check and Vite production build pass.
- git diff -- pb_hooks/boardGeometry.cjs: empty. No change to src/cloudflare.ts, worker/, wrangler.jsonc, or the final theme import in src/main.tsx.
- Local Worker + D1 only; named test account Marble Visual Test. Live screenshots use room 8FNHLY, turn 41, without playing or discarding a card in that room.
- Verified host “Play computers now” using a separate disposable local room, ticketed WebSocket frames, loaded portraits/cards, and no browser errors.
- Verified card then marble selection, keyboard Enter/Space delegation, automatic selection of the sole legal move, and clickable “Play selected” prompt without advancing the turn when no marble is selected.
- Phone document width equals viewport width: 390px. Full-page screenshots use 1365×768 and 390×844 browser viewports.
- The split move naming and game rules remain covered by the existing tests; no game logic changed.

Local development recovery: duplicate Wrangler sessions caused requests to hang. Restarting a single Worker with a separate WRANGLER_REGISTRY_PATH restored health/API responses. No backend source or production deployment was needed.

## Screenshots

| Screen | Desktop, 1365×768 viewport | Phone, 390×844 viewport |
| --- | --- | --- |
| Lobby | [Desktop](lobby-desktop.png) | [Phone](lobby-phone.png) |
| Waiting room | [Desktop](waiting-room-desktop.png) | [Phone](waiting-room-phone.png) |
| Live game, one card and one marble selected | [Desktop](live-game-desktop.png) | [Phone](live-game-phone.png) |

Raw browser verification metadata: [results.json](results.json). Temporary local test sessions are removed after each successful verification run. Validation completed before release.
