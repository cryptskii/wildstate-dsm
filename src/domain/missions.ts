/**
 * The beta's weekly missions as the camp's bulletin board shows them. Game
 * data, kept in a file on the game server and read fresh each time someone
 * walks up, so a new week is posted by editing the file: no new build.
 * Not a DSM encoding and not DSM state.
 */
export type Mission = { id: string; title: string; task: string };
export type MissionWeek = { week: number; title: string; posted: string; missions: Mission[] };
/** `starter`: the set handed out before the board (in the Telegram channel), reported with week 1. */
export type MissionBoard = { weeks: MissionWeek[]; footer: string; starter: Mission[] };

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
    return { week: wk.week, title: text(wk.title, `week ${wk.week} "title"`), posted, missions: wk.missions.map((m, j) => mission(m, `week ${wk.week} mission ${j + 1}`)) };
  });
  if (o.starter !== undefined && !Array.isArray(o.starter)) throw new Error('"starter" must list missions');
  const starter = ((o.starter ?? []) as unknown[]).map((m, j) => mission(m, `starter mission ${j + 1}`));
  return { weeks, footer: typeof o.footer === 'string' ? o.footer.trim() : '', starter };
}

function mission(m: unknown, where: string): Mission {
  if (typeof m !== 'object' || m === null) throw new Error(`${where} must be an object`);
  const mm = m as Record<string, unknown>;
  return { id: text(mm.id, `${where} "id"`), title: text(mm.title, `${where} "title"`), task: text(mm.task, `${where} "task"`) };
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

/** Game missions, as a game report lists them: Wildstate's (G), never the wallet's (M). */
const isGame = (m: Mission) => m.id.startsWith('G');

/**
 * The game missions a tester reports on `today`: the week on the board, with the starter set's
 * game missions in week 1 (they are done before the board is reached); the starter set's alone
 * before any week is up.
 */
export function reportList(board: MissionBoard | null, today: string): { week: number | null; title: string; missions: Mission[] } {
  if (board === null) return { week: null, title: 'Starter missions', missions: [] };
  const week = weekOnBoard(board, today);
  const first = Math.min(...board.weeks.map((w) => w.week));
  if (week === null) return { week: null, title: 'Starter missions', missions: board.starter.filter(isGame) };
  const missions = [...(week.week === first ? board.starter : []), ...week.missions].filter(isGame);
  return { week: week.week, title: week.title, missions };
}
