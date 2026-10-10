/**
 * The beta's weekly missions as the camp's bulletin board shows them. Game
 * data, kept in a file on the game server and read fresh each time someone
 * walks up, so a new week is posted by editing the file: no new build.
 * Not a DSM encoding and not DSM state.
 */
export type Mission = { id: string; title: string; task: string };
export type MissionWeek = { week: number; title: string; posted: string; missions: Mission[] };
export type MissionBoard = { weeks: MissionWeek[]; footer: string };

/** What the board screen shows: the welcome, this week (if one is up), its missions, and the list to copy. */
export type BoardView = {
  welcome: string;
  week: { week: number; title: string; posted: string } | null;
  missions: Mission[];
  footer: string;
  copyText: string;
};

export const BOARD_WELCOME = 'Welcome to the board. This will be where you get your updated weekly beta test missions every Monday morning.';
export const NOTHING_PINNED = 'Nothing is pinned up yet. Check back Monday morning for this week’s missions.';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${where} must be some text`);
  return value.trim();
}

/** The board as the file states it; a malformed file is refused, naming what is wrong. */
export function readMissionBoard(json: unknown): MissionBoard {
  if (typeof json !== 'object' || json === null) throw new Error('the missions file must hold an object');
  const o = json as Record<string, unknown>;
  if (!Array.isArray(o.weeks)) throw new Error('the missions file must list "weeks"');
  const weeks = o.weeks.map((w, i): MissionWeek => {
    if (typeof w !== 'object' || w === null) throw new Error(`week ${i + 1} must be an object`);
    const wk = w as Record<string, unknown>;
    if (typeof wk.week !== 'number' || !Number.isInteger(wk.week)) throw new Error(`week ${i + 1} needs a whole "week" number`);
    const posted = text(wk.posted, `week ${wk.week} "posted"`);
    if (!DATE.test(posted)) throw new Error(`week ${wk.week} "posted" must be a date like 2026-10-12`);
    if (!Array.isArray(wk.missions) || wk.missions.length === 0) throw new Error(`week ${wk.week} needs at least one mission`);
    const missions = wk.missions.map((m, j): Mission => {
      if (typeof m !== 'object' || m === null) throw new Error(`week ${wk.week} mission ${j + 1} must be an object`);
      const mm = m as Record<string, unknown>;
      return {
        id: text(mm.id, `week ${wk.week} mission ${j + 1} "id"`),
        title: text(mm.title, `week ${wk.week} mission ${j + 1} "title"`),
        task: text(mm.task, `week ${wk.week} mission ${j + 1} "task"`),
      };
    });
    return { week: wk.week, title: text(wk.title, `week ${wk.week} "title"`), posted, missions };
  });
  return { weeks, footer: typeof o.footer === 'string' ? o.footer.trim() : '' };
}

/** The week on the board on `today` (YYYY-MM-DD): the latest one posted by then, or none yet. */
export function weekOnBoard(board: MissionBoard, today: string): MissionWeek | null {
  const posted = board.weeks.filter((w) => w.posted <= today).sort((a, b) => (a.posted < b.posted ? 1 : a.posted > b.posted ? -1 : b.week - a.week));
  return posted.length > 0 ? posted[0] : null;
}

/** What the board screen shows on `today`, with the whole list as plain text to copy elsewhere. */
export function boardView(board: MissionBoard | null, today: string): BoardView {
  const week = board !== null ? weekOnBoard(board, today) : null;
  const footer = board !== null ? board.footer : '';
  if (week === null) return { welcome: BOARD_WELCOME, week: null, missions: [], footer, copyText: `${BOARD_WELCOME}\n\n${NOTHING_PINNED}` };
  const copyText = [
    `DSM beta missions · Week ${week.week} · ${week.title} (posted ${week.posted})`,
    ...week.missions.map((m) => `${m.id} · ${m.title}\n${m.task}`),
    ...(footer.length > 0 ? [footer] : []),
  ].join('\n\n');
  return { welcome: BOARD_WELCOME, week: { week: week.week, title: week.title, posted: week.posted }, missions: week.missions, footer, copyText };
}
