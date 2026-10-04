# Wildstate UI drop-in (from the design project)

Copy `dsm-creatures/` over the repo root (`/Users/cryptskii/Desktop/claude_workspace/d-s-m/dsm-creatures`). Then:

    npm test && npm run typecheck && npm run build

## What changes

- **src/domain/game.ts** — rules `creatures-local-v2`: species move tables (4 moves each), per-move charges, element chart (fire > grass; grass > water and volt; water > fire; volt > water), Burn/Root/Stun/Soaked statuses, Guard, Heal. Battle carries a 2-entry `log` so the UI animates from accepted state. Saves with the old `rules` literal will fail schema validation — clear local save slots.
- **src/gui/Play.vue** — pixel-RPG battle screen (sprite effects in `public/fx`) and field HUD (d-pad, party window, notice).
- **src/gui/Dialogue.vue** — pixel dialogue window.
- **src/modules/main/field.ts, journey.ts, server.ts** — accept any pinned move id; NPC anchors (`MIRA`, `ROWAN`) shared with server events.
- **src/tiled/simplemap.tmx + fieldmap-v3.png** — dressed map as an image layer over a grass ground layer, plus a `Collisions` object layer (70 rects). Start point moved to (368,176) on the path.
- **test/game.test.ts** — rewritten for v2 (12 cases).
- **public/creatures, public/fx, public/tiles, public/portraits** — assets.
- **.agents/skills** — updated skill docs (moves section, invariants checklist, battle-UI guidance).

## Verify against RPGJS docs (not assumed)

1. Image layers: confirm `provideTiledMap` renders `<imagelayer>`. If not, convert `fieldmap-v3.png` to a tileset and paint it as a tile layer.
2. Collisions: confirm the object layer convention (`class="collision"` here). Alternative: a hidden tile layer with a `collision` tile property.
3. `Direction` import and `moveRoutes` unchanged from the current repo.
4. Rowan still uses the `ranger` graphic the repo already registers; no sprite sheet is included here.

## Not done
- Local play only; no DSM claims (see .agents/skills/dsm-creature-game).
- Score/i18n strings for the Escape-menu journey list every move; see `src/i18n.patch.md`.
