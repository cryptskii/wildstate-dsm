import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOARD_WELCOME, boardView, readMissionBoard, weekOnBoard } from '../src/domain/missions';

const shipped = readMissionBoard(JSON.parse(readFileSync('data/beta-missions.json', 'utf8')));

describe('the camp bulletin board', () => {
  it('reads the missions file the game server ships: week 1 up on release day, then a week each Monday', () => {
    expect(shipped.weeks.map((w) => w.week)).toEqual([1, 2, 3]);
    expect(shipped.weeks[0].posted).toBe('2026-10-10');
    for (const w of shipped.weeks.slice(1)) expect(new Date(`${w.posted}T00:00:00Z`).getUTCDay()).toBe(1);
  });

  it('pins week 1 on release day with every week-1 mission after the board itself (G3 on)', () => {
    const view = boardView(shipped, '2026-10-10');
    expect(view.week?.week).toBe(1);
    expect(view.missions.map((m) => m.id)).toEqual(['G3', 'G4', 'G5']);
    for (const m of view.missions) expect(view.copyText).toContain(`${m.id} · ${m.title}\n${m.task}`);
  });

  it('shows the latest week posted by today, and nothing before the first', () => {
    expect(weekOnBoard(shipped, '2026-10-09')).toBeNull();
    expect(weekOnBoard(shipped, '2026-10-10')?.week).toBe(1);
    expect(weekOnBoard(shipped, '2026-10-18')?.week).toBe(1);
    expect(weekOnBoard(shipped, '2026-10-19')?.week).toBe(2);
    expect(weekOnBoard(shipped, '2026-12-01')?.week).toBe(3);
  });

  it('welcomes the reader, pins the week up, and offers the whole list to copy', () => {
    const view = boardView(shipped, '2026-10-20');
    expect(view.welcome).toBe('Welcome to the board. This will be where you get your updated weekly beta test missions every Monday morning.');
    expect(view.week?.week).toBe(2);
    expect(view.missions.map((m) => m.id)).toContain('G6');
    // Each week mixes wallet missions (M) and Wildstate missions (G).
    expect(view.missions.some((m) => m.id.startsWith('M'))).toBe(true);
    expect(view.missions.some((m) => m.id.startsWith('G'))).toBe(true);
    expect(view.copyText.startsWith('DSM beta missions · Week 2 · Interrupt and recover (posted 2026-10-19)')).toBe(true);
    for (const m of view.missions) expect(view.copyText).toContain(`${m.id} · ${m.title}\n${m.task}`);
  });

  it('welcomes the reader with nothing pinned when no week is up or the file cannot be read', () => {
    for (const view of [boardView(shipped, '2026-01-01'), boardView(null, '2026-10-20')]) {
      expect(view.welcome).toBe(BOARD_WELCOME);
      expect(view.week).toBeNull();
      expect(view.missions).toEqual([]);
    }
  });

  it('refuses a malformed file, naming what is wrong', () => {
    expect(() => readMissionBoard({ weeks: [{ week: 1, title: 'x', posted: 'Monday', missions: [] }] })).toThrow('"posted" must be a date');
    expect(() => readMissionBoard({ weeks: [{ week: 1, title: 'x', posted: '2026-10-12', missions: [{ id: 'M1', title: '', task: 't' }] }] })).toThrow('"title" must be some text');
    expect(() => readMissionBoard({})).toThrow('must list "weeks"');
  });
});
