# Battle UI guidance (RPGJS)

The battle screen is a presentation projection of synchronized state. It never computes outcomes.

Data flow
- Read the battle, lead creature, inventory, and move table from synchronized player props.
- Send one `interact` per command with the displayed `revision`; disable all inputs until the next revision or an error arrives.
- Animate from the displayed snapshot to the accepted snapshot; never from client prediction.
- On error, show the error text and keep the displayed snapshot so the player can retry against the same revision.

Layout
- One card: heading (encounter source, turn), arena, command area, ledger strip.
- Status cards show name, level or "Wild creature", element chip, active statuses with turns remaining, HP bar, HP text. HP bar color: green above 20, amber above 10, red otherwise.
- Moves are a 4-up grid of species moves. Each shows: name, element chip, effect text with matchup multiplier against the current target, charge pips (filled = remaining) and "n/max charges" or "unlimited". Capture and Run sit below as a secondary row.
- Never render "DSM secured" or similar unless the real adapter returned accepted evidence. What runs on DSM underneath is the DSM panel's to show.

Ledger strip
- Show the current revision, last command id, and the consumed opportunity for the last accepted command. This is the game server's own record, not DSM evidence.

Sprites and effects
- Creature art lives in `public/creatures/<species>.png`; `ART` in `Play.vue` sets each species' facing, scale and lift.
- Effects are sprites in `public/fx`, choreographed per move from `MoveDef.fx` (`bite`, `tongue`, `snare`, `bash`, `jet`, `tusk`, `camo`, `chain`, `lure`); one effect at a time.
