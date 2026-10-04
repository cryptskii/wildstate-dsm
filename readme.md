# Wildstate / DSM Creatures

An exploration and animated battle prototype for an original creature-collection RPG, with DSM underneath: what a player owns lives in their DSM wallet.

## Run and play

Run `npm install`. Start the game's DSM account (`dsm-app-host`, see `docs/dsm-integration.md`), then `DSM_APP_HOST=http://127.0.0.1:8787 npm run dev` and open the Vite URL (on a phone: the Network URL). The game does not start without its account.

- Walk with arrow keys or the onscreen direction buttons. The map opens without a blocking menu.
- Walk east into the glowing meadow to start an encounter. Leave the meadow and re-enter for another encounter.
- At the pond's edge, tap CAST to fish: water creatures come only from the pond.
- Each species has four moves: an unlimited Strike and three with persistent charges. Elements matter (fire beats grass, grass beats water and volt, water beats fire, volt beats water), and moves can burn, root, stun or soak.
- Weaken the wild creature to 14 HP or below, then throw a capsule and name it. Captured creatures retain their remaining HP and join the collection.
- Return to exploring after a battle. HP and charges carry into the next encounter.
- Walk to Mira at camp and press Space or Talk / Rest to restore the party. Conversations show large character portraits; press Enter or Continue to advance through NPC dialogue and player replies. Rowan, the ranger just north of Mira, provides encounter guidance.
- BAG shows your creatures (SWAP IN picks the lead that fights next), your items, and your wallet. A player's progress is the game's record, keyed by their wallet; reloading the page resumes it.
- Escape opens the journal interface for the first exclusive campaign choice. Capsules are bought in the shop, paid from the wallet.

This is one small clearing and a first connected gameplay loop. It is not a finished campaign or open world. The meadow cycles deterministically through Mossling, Voltusk, Leon and Embercub, and the pond through Tidefin, Brineback and Rattlefin. Using items, the trading post's interior, evolution, additional areas, and successor campaign chapters remain unimplemented.

The camp map (`src/tiled/simplemap.tmx`) is a painted image over the starter's Pipoya ground, with an animated water layer and a collision layer of blocked tiles. Generated pixel-art PNG creatures with verified alpha transparency appear in the field and animated battle interface. See `docs/creature-art.md` and `docs/character-art.md` for the generation prompts; original generated pixels and alpha are preserved. Presentation animations do not determine gameplay results.

## Skills

Use `.agents/skills/rpgjs` with `.agents/skills/dsm-creature-game`. The latter is also installed in the user's Codex skills directory. `AGENTS.md` routes subsequent work to both.

## DSM

The game runs with DSM underneath (DSM Amendment A11). The game server runs in Node and reaches its own DSM account (`dsm-app-host`). Players connect their DSM wallet by scanning a code, or on the same phone with **OPEN DSM WALLET**. WILD and every caught creature then live in the wallet, and the market swaps WILD and ERA through SoFi. Press **DSM** or **D** for the overlay showing what ran on the game server and what ran on DSM. See `docs/dsm-integration.md`.

## Validation

`npm test`, `npm run typecheck` and `npm run build`. After a change to the DSM proto, run `npm run proto:gen` (it reads `../dsm/proto`, or `DSM_PROTO_DIR`).

Scaffold provenance: `rpgjs/starter`, v5, commit `e52f06dc1894feaf19bd8180bcfdbe140e56cfe0`. Original starter assets and license/credits apply; see the upstream starter for Pipoya graphics credits. No remote repository has been created or pushed.
