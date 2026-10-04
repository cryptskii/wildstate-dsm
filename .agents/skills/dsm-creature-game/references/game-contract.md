# Application contract

The game is an open-ended creature-collection world with a branching campaign. A player's path is a forward lineage through a committed campaign graph. Choices with conflicting alternatives consume the same player-scoped opportunity; separate vaults alone do not make alternatives exclusive.

The campaign definition is shared, but each player has an independent campaign instance. Wild encounters are independent of campaign advancement and require fresh allocations; do not reset consumed vaults. Define encounter eligibility and entropy provenance before claiming grinding, replay, or rarity manipulation is prevented.

Stable creature IDs name individual creatures. Persistent state includes current HP, per-move charges, XP, learned moves, ownership, and applicable persistent conditions. Species rules define maximum HP, element, move set, and growth. Battle state binds exact participant versions, combat resources, action order, and outcomes. Reserve participating resources against trades or incompatible concurrent updates. Healing is an explicit operation; battle start never silently restores HP or charges.

Battle resolution atomically grants authorized rewards once, consumes the encounter/reward opportunity, updates inventory, establishes capture ownership, and carries persistent combat resources forward. Campaign captures additionally consume/advance the applicable campaign opportunity. Currency requires authorized issuance and conserved debits; score should be derived from counted outcomes where possible.

DLVs express prior owner terms and funded resources. They do not by themselves prove a battle happened, authorize unlimited creature creation, or provide an arbitrary game policy interpreter. Successor DLV chaining and creature policies need normative mapping and implementation verification.

## Moves and combat

Move content is pinned configuration keyed by species; it is not client input. A `move` command carries only a move id; the reducer resolves damage, element multiplier, status application, guard, and heal from the pinned move table.

Elements: fire beats grass, grass beats water, water beats fire. Multipliers are fixed at x1.5 (advantage) and x0.5 (disadvantage), rounded once after all modifiers.

Charges are per move, not per creature. A move with `max: 0` is unlimited. Using a charged move with zero charges fails with `no-charges`. Charges survive encounters, saves, and transfers; only the explicit `heal` operation restores them. A creature received by trade arrives with its current charges.

Statuses are bounded, deterministic conditions stored on the creature: Burn (3 damage at end of the holder's turn, 2 turns), Root (holder skips its next action, 1 turn), Soaked (holder deals -2 damage, 2 turns; clears Burn). Guard halves the next hit and is consumed by it. Statuses and Guard clear when the battle ends; HP and charges do not.

Battle order is fixed: player action, player-applied statuses tick on the wild creature, wild action (or skipped if rooted), wild-applied statuses tick on the player creature. A battle reaching 0 HP on either side ends immediately in that step; no later step runs.

Current move table (species -> moves, local playtest v2):
- Embercub (fire): Strike 8 basic unlimited; Flare 14 fire 5; Ember Bite 9 fire + Burn 3; Warm Coat guard 2.
- Mossling (grass): Strike 8 basic unlimited; Leaf Cut 12 grass 5; Root Bind 6 grass + Root 3; Photosynth heal 12, 1.
- Dewtail (water): Strike 8 basic unlimited; Tide Lash 12 water 5; Soak 7 water + Soaked 3; Mist Veil guard 2.

## Trading post

The shop is a holder-scoped coin ledger operation. Coins are conserved: a purchase is a single command that debits coins and credits inventory atomically; neither side may be applied without the other. Prices are pinned catalogue content, never client input. A `buy-capsule` command exists today; `buy-item` (poultice, tonic, key items) and `sell-creature` are proposed and must be specified with the same parent/consumption discipline before implementation. Selling a creature is an ownership transfer and must go through the real transfer path when DSM mode exists; local mode may only simulate it with a clearly labelled local session. Key items with stock limits consume a per-holder opportunity (`shop/<item>`) so they cannot be bought twice.

## Pond and fishing

`cast` is a second encounter source with its own counter (`nextCast`) and opportunity id (`pond/<n>`). It requires `inventory.rod`. Its wild species are water-only. A pond battle consumes `encounter/<id>` exactly like a meadow battle; rewards are identical.

## Party lead and names

`lead` is an index into `creatures`; `set-lead` changes it outside battle only. The lead is the combatant for the next encounter or cast. A fainted lead blocks both. Nicknames are cosmetic: `capture.nick` and `rename.nick` are trimmed to 12 characters and never affect rules.

## Growth

Growth is pinned content, never client input. Level = 1 + floor(xp / 20), capped at 10. Max HP = 40 + 4 per level above 1. Every damaging move gains +1 base damage per level above 1 (applied before the element multiplier). Charged moves gain one extra slot at Lv 4 and another at Lv 7.

XP is granted only by a finishing command (`victory`, `captured`) and scales with the opponent: base (10 wild, 15 trainer, 5 capture) + 2 per level the opponent has above the combatant, −2 per level below, floor 4. Wild level rises with the holder's encounter index (`wildLevel`, cap 6, never more than one above the lead), trainers have fixed levels. Crossing a level tops up current HP by the gained max and adds the new charge slots immediately; the battle records `growth: { gain, from, to }` so the UI can show the level-up without recomputing.

XP lives on the creature's state object, so it travels with ownership: a traded or captured creature keeps its level, current HP and charges.
