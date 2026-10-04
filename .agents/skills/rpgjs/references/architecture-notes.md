# Architecture Notes

## Entry Points

Expect three possible entrypoints:

- `client.ts`
- `server.ts`
- `standalone.ts`

Use `standalone.ts` for a classic single-package RPG flow because it loads both client and server.

Use only `client.ts` and `server.ts` for an MMORPG-style setup.

## Configuration

Expect client and server configuration files, typically `config.client.*` and `config.server.*`.

The configuration layer already relies on dependency injection with providers.

Maps must be wired through a provider:

- use `provideTiledMap` when the project uses Tiled maps directly
- otherwise use a custom `provideLoadMap` implementation, as documented by RPGJS

Before changing map loading behavior, inspect the existing config and verify the expected provider in the docs.

## Modules And Hooks

Most gameplay behavior is implemented through hooks on both client and server sides.

Modules can stay lightweight or be wrapped in a dedicated folder with `defineModule` when the feature should be encapsulated, reusable, or shared with the community.

Prefer `defineModule` when the feature has its own hooks, assets, and internal structure rather than scattering code across unrelated files.

## Client Responsibilities

Spritesheets are an important client concern. They define the visual resources for characters and other renderable entities.

Because the stack uses Vite, static images are typically stored in the `public/` directory.

When adding visual assets:

- check how existing spritesheets are registered
- keep asset paths aligned with Vite public-file conventions
- verify any client hook or config registration needed for the asset to load

## Server Responsibilities

Player lifecycle hooks are central on the server side.

Important distinctions:

- `onConnected`: fires when the player connects to the server
- `onStart`: fires when the player explicitly starts after a title screen or equivalent manual start flow
- `onJoinMap`: fires after the player has joined a map

Do not treat `onConnected` and `onStart` as interchangeable.

In a common flow, a newly connected player arrives in a lobby context and then a `player.changeMap(...)` call sends them to the intended map.

## Map Model

In RPGJS, a map is also a room.

Treat maps as potentially independent runtime units. A map can live on one server while another map lives on another server.

When a player moves between maps, the engine transfers a snapshot of the player state so the object can be restored on the destination side.

This means that map transitions are not only visual. They are also part of the persistence and transfer model.

## Player API

Server hooks often expose `player` as an `RpgPlayer`-style object from the Player API.

Use the Player API for operations such as:

- money
- variables
- movement
- inventory or objects
- map changes

Before adding custom state outside the Player API, verify whether the existing player variable system already covers the need.

## Synchronization And State

Client-server synchronization should use player properties when the data represents real gameplay state.

Use player `props` to define which properties are synchronized and how they behave.

This is important because the synchronized property model also supports state continuity:

- state can remain available across map transfers
- state can survive snapshot-based transfers
- state can be preserved in memory for restart or recovery scenarios
- state can participate in save-oriented flows

When defining a property, verify the documented options such as permanence and whether it should be synchronized to the client.

For durable state, do not bypass `props` with unrelated storage paths unless there is a documented reason to do so.

Use `map.broadcast(type, data)` for ephemeral messages that should be sent to everyone on the current map without becoming saved state.

Use `player.on(key, cb)` to listen to data sent by the client when explicit socket-style communication is required.

Keep the distinction strict:

- `props` for state
- `map.broadcast(...)` for transient map-wide events or messages
- `player.on(...)` for handling client-sent data

## Events And Collisions

A map can contain both players and events.

Events react through hooks, including collision-style or interaction-style behaviors such as:

- the player touches the event
- the player triggers an action on the event

Use these hooks to implement scenario logic, encounters, interactions, and map-local behaviors.

## Variables

Variables are a core RPGJS concept and should be preferred for game-state conditions that need to persist or drive map behavior.

Variables are important because they:

- survive player transfers between maps
- fit general save workflows, including possible database persistence
- participate in automatic change detection inside RPGJS

The automatic change detection matters for map logic. For example, an event can appear only when a variable becomes `true`, and RPGJS can react to that state change automatically.

Prefer the built-in variable system over ad hoc flags when the state should affect visibility, progression, persistence, or event conditions.
