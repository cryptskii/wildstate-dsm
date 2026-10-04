# Move invariants checklist

Test externally observable state after `transition`, not implementation wording. Each item names the command, the expected error code or state delta, and the parent revision.

Charges
- Charged move at 0 charges -> `no-charges`; state unchanged; revision unchanged.
- Charges decrement exactly once per accepted move; a replayed `commandId` -> `stale`.
- Charges persist across `escape`, `victory`, `defeat`, `captured`, and ownership change.
- `heal` restores every move to its `max` and HP to species max; nothing else restores charges.
- Starting an encounter never changes HP or charges.

Elements
- Fire vs grass, grass vs water and volt, water vs fire, volt vs water -> x1.5; reverse -> x0.5; same or basic -> x1.
- Rounding happens once after guard and Soaked; never per modifier.

Statuses
- Applying a status the target already has does not stack or extend it.
- Burn ticks at end of holder's turn, 3 damage, exactly 2 ticks; cannot reduce HP below 0.
- Root and Stun skip exactly one action; the skipped action does not consume charges.
- Soaked clears Burn on application; the holder's damage is reduced by 2, minimum 1.
- All statuses and Guard clear at battle end; a new battle starts with none.

Guard and heal
- Guard halves the next hit before the single rounding and is consumed; a second hit is full damage.
- Heal cannot exceed species max HP; a heal at full HP still consumes the charge.

Termination
- Wild at 0 HP after the player's action -> `victory`; the wild action does not run.
- Wild at 0 HP from Burn tick -> `victory`; the wild action does not run.
- Player at 0 HP -> `defeat`; `encounter` with a fainted lead -> `fainted`.
- Each outcome consumes `encounter/<id>` once; a second finish on the same id -> `stale`.
- Rewards (XP, victories, captures) are granted exactly once per battle; the coin reward is a transfer from the game's account, never a state credit.

Capture
- `capture` with wild HP above the threshold -> `not-weakened`; with 0 capsules -> `no-capsules`.
- Captured creature carries its current HP, charges, and statuses-cleared state; it gets a new stable id owned by the holder.
