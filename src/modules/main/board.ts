import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RpgPlayer } from '@rpgjs/server';
import { boardView, readMissionBoard, reportList, type MissionBoard } from '../../domain/missions';

/**
 * Where the game server keeps the beta's weekly missions; edit it to post a new week. In
 * production that is the game's data folder (WILDSTATE_DATA_DIR, /opt/wildstate/game on the
 * host); BETA_MISSIONS names another file; locally it is the repository's data/ folder.
 */
const MISSIONS_PATH = process.env.BETA_MISSIONS
  ? process.env.BETA_MISSIONS
  : process.env.WILDSTATE_DATA_DIR
    ? join(process.env.WILDSTATE_DATA_DIR, 'beta-missions.json')
    : 'data/beta-missions.json';

/** The missions file as it is now, read fresh each time; a missing or broken file is logged and the board shows nothing pinned. */
async function currentBoard(): Promise<MissionBoard | null> {
  try {
    return readMissionBoard(JSON.parse(await readFile(MISSIONS_PATH, 'utf8')));
  } catch (e) {
    console.warn(`[board] the missions file ${MISSIONS_PATH} was not read: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

const today = () => new Date().toISOString().slice(0, 10);

/** The game missions a tester reports on this week, for the BAG's REPORT tab. */
export async function gameReportList() {
  return reportList(await currentBoard(), today());
}

/** The camp's bulletin board: its own screen, with this week's missions pinned up and a copy of the list to take away. */
export async function readBulletinBoard(player: RpgPlayer) {
  const view = boardView(await currentBoard(), today());
  const gui = player.gui('mission-board');
  gui.on<{ action: string }>('board', ({ action }) => {
    if (action === 'leave') gui.close();
  });
  await gui.open(view, { waitingAction: true, blockPlayerInput: true });
}
