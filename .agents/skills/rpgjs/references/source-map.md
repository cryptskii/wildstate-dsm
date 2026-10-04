# Source Map

## Canonical URLs

- RPGJS v5 quick start: `https://v5.rpgjs.dev/guide/quick-start.md`
- RPGJS v5 index: `https://v5.rpgjs.dev/llms.txt`
- RPGJS synchronization guide: `https://v5.rpgjs.dev/guide/synchronization.md`
- CanvasEngine index: `https://canvasengine.net/llms.txt`
- RPGJS UI CSS README: `https://raw.githubusercontent.com/RSamaium/RPG-JS/refs/heads/v5/packages/ui-css/README.md`
- RPGJS physic README: `https://raw.githubusercontent.com/RSamaium/RPG-JS/refs/heads/v5/packages/physic/README.md`
- RPGJS v5 repo branch: `https://github.com/RSamaium/RPG-JS/tree/v5`

## Minimal Fetch Workflow

Verify the project first:

```bash
rg -n '"@rpgjs|@rpgjs/' . --glob 'package.json'
```

If no local project uses `@rpgjs/*`, read the quick start before doing anything else:

```bash
curl -fsSL https://v5.rpgjs.dev/guide/quick-start.md
```

Then install the project by following that page. Do not guess the setup from memory.

After installation, verify again that the scaffold now contains `@rpgjs/*` packages.

Fetch the RPGJS index:

```bash
curl -fsSL https://v5.rpgjs.dev/llms.txt -o /tmp/rpgjs-v5-llms.txt
```

List Markdown URLs found in the index:

```bash
rg -o 'https://[^ )]+\\.md' /tmp/rpgjs-v5-llms.txt
```

Fetch one relevant page:

```bash
curl -fsSL https://v5.rpgjs.dev/guide/quick-start.md
```

Fetch the synchronization guide when state replication or networked player data is involved:

```bash
curl -fsSL https://v5.rpgjs.dev/guide/synchronization.md
```

Fetch the CanvasEngine index when `.ce` files are involved:

```bash
curl -fsSL https://canvasengine.net/llms.txt -o /tmp/canvasengine-llms.txt
rg -o 'https://[^ )]+\\.md' /tmp/canvasengine-llms.txt
```

Fetch the RPGJS UI CSS README when GUI styling is involved:

```bash
curl -fsSL https://raw.githubusercontent.com/RSamaium/RPG-JS/refs/heads/v5/packages/ui-css/README.md
```

Fetch the RPGJS physic README when collisions or physics are involved:

```bash
curl -fsSL https://raw.githubusercontent.com/RSamaium/RPG-JS/refs/heads/v5/packages/physic/README.md
```

If the index exposes relative links instead of absolute URLs, resolve them against the site origin before fetching.
