import { createServer, provideI18n, provideServerModules, InMemorySaveStorageStrategy, provideSaveStorage } from '@rpgjs/server';
import main from './modules/main/server';
import { provideTiledMap } from '@rpgjs/tiledmap/server';
import i18n from './i18n';

export { PROTOCOL } from './protocol';

export default createServer({ providers: [
  provideI18n(i18n),
  // A player's profile is the game's record, by wallet; RPGJS save slots hold nothing.
  provideSaveStorage(new InMemorySaveStorageStrategy()),
  provideServerModules([main]),
  provideTiledMap(),
] });
