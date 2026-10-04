# Character walking polish

The player, Mira, Rowan, Kade and Nessa use `public/spritesheets/*-walk-v4.png`: transparent 96×160 atlases, with twelve 32×40 frames. Rows are down, left, right, up; the middle column is the standing pose. `npm run art:pack-walks` isolates the largest character component in each source cell before sizing it, aligns feet, removes detached fragments and checks clear borders.

NPCs use short back-and-forth routes in `src/modules/main/patrol.ts`, with distinct 10–20 second pauses. Mira stays right of the campfire; Rowan is on the northwest lawn; Kade patrols the eastern meadow away from the fence opening; Nessa stays on the north pond bank. Dialogue and trainer battles hold the corresponding NPC in place. NPCs remain solid.

The campfire has zero mass and is not pushable. Pond frames last 900 ms instead of 300 ms. The player has a 16×16 walking footprint for clearance through the 32-pixel gateway, while artwork dimensions are unchanged. Waiting wallet connections have no avatar; disconnected sessions clear graphics, and late wallet callbacks cannot respawn disconnected players.

Validation: 39 tests pass, including patrol rest/interaction/lifecycle checks, avatar creation and cleanup, gate footprint, and campfire anchoring; type checking and production build pass. Clean sprites were visually inspected in the animation preview. Wallet-connected field traversal was not verified in this turn.
