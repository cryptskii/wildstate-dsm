import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readMissionBoard, reportList } from '../src/domain/missions';
import {
  BODY_MAX, BUG_CHECKS, BUG_TEMPLATE, GAME_REPO, MISSIONS_TEMPLATE, SPLIT_NOTE,
  bugBody, bugTitle, fit, issueUrl, missionsBody, missionsTitle, type GameDetails,
} from '../src/domain/reports';

const shipped = readMissionBoard(JSON.parse(readFileSync('data/beta-missions.json', 'utf8')));
const details: GameDetails = {
  version: '0.1.0-beta.4', protocol: 2, server: 'wildstate.example', wallet: 'WALLET123',
  screen: 'Field · BAG', battle: null, device: 'SM-A165M · Android 15', at: '2026-10-10T15:00:00.000Z',
};

describe('the game missions a tester reports on', () => {
  it('are week 1 with the starter set\'s game missions on release day, and never the wallet\'s', () => {
    const l = reportList(shipped, '2026-10-10');
    expect(l.week).toBe(1);
    expect(l.missions.map((m) => m.id)).toEqual(['G1', 'G2', 'G3', 'G4', 'G5']);
  });
  it('are that week\'s own game missions from week 2 on', () => {
    expect(reportList(shipped, '2026-10-20').missions.map((m) => m.id)).toEqual(['G6', 'G7', 'G8', 'G9']);
    expect(reportList(shipped, '2026-10-27').missions.map((m) => m.id)).toEqual(['G10', 'G11', 'G12', 'G13']);
  });
  it('are the starter set\'s before any week is up, and none when the file cannot be read', () => {
    expect(reportList(shipped, '2026-10-01')).toEqual({ week: null, title: 'Starter missions', missions: shipped.starter.filter((m) => m.id.startsWith('G')) });
    expect(reportList(null, '2026-10-10').missions).toEqual([]);
  });
});

describe('a game bug report', () => {
  const bug = { summary: 'Fainted creature came back', checks: [BUG_CHECKS[0], BUG_CHECKS[1]], happened: 'HP went back to full', steps: '1. Arena 2. Faint', expected: 'It stays down', often: 'sometimes' as const };
  it('ticks what the tester ticked, and attaches the game\'s details', () => {
    const body = bugBody(bug, details);
    expect(bugTitle(bug)).toBe('[GAME BUG] Fainted creature came back');
    expect(body).toContain(`- [x] ${BUG_CHECKS[0]}`);
    expect(body).toContain(`- [ ] ${BUG_CHECKS[2]}`);
    expect(body).toContain('**How often:** Sometimes');
    expect(body).toContain('Wildstate 0.1.0-beta.4 · protocol 2 · server wildstate.example');
    expect(body).toContain('Device: SM-A165M · Android 15');
  });
  it('files on the game\'s repository through its template', () => {
    const url = new URL(issueUrl(BUG_TEMPLATE, bugTitle(bug), bugBody(bug, details)));
    expect(`${url.origin}${url.pathname}`).toBe(`https://github.com/${GAME_REPO}/issues/new`);
    expect(url.searchParams.get('template')).toBe('game-bug.md');
    expect(url.searchParams.get('body')).toBe(bugBody(bug, details));
  });
});

describe('a week\'s game missions report', () => {
  const l = reportList(shipped, '2026-10-10');
  const entries = l.missions.map((mission, i) => ({ mission, result: (i === 0 ? 'done' : i === 1 ? 'failed' : 'not-tried') as 'done' | 'failed' | 'not-tried', checks: i === 0 ? ['Worked the first time'] : [], comment: i === 1 ? 'Board did not open' : '', bugs: i === 1 ? '#12' : '' }));
  const report = { week: l.week, title: l.title, entries, overall: '' };
  it('lists each mission\'s result, checks, explanation and its bug reports, and says how the week is split', () => {
    const body = missionsBody(report, details);
    expect(missionsTitle(report)).toBe('[MISSIONS] Week 1 game missions');
    expect(body).toContain('1 of 5 game missions done');
    expect(body).toContain('### G1 · Connect Wildstate: Done');
    expect(body).toContain("### G2 · Find the bulletin board: Couldn't finish");
    expect(body).toContain('- [x] Worked the first time');
    expect(body).toContain('**Bug reports for this mission:** #12');
    expect(body).toContain(SPLIT_NOTE);
    expect(issueUrl(MISSIONS_TEMPLATE, missionsTitle(report), body)).toContain('template=weekly-game-missions.md');
  });
});

describe('a body too long for a link', () => {
  it('is cut to fit and says so; a short one is left whole', () => {
    expect(fit('short')).toBe('short');
    const cut = fit('x'.repeat(BODY_MAX * 2));
    expect(cut.length).toBe(BODY_MAX);
    expect(cut).toContain('Cut to fit the link');
  });
});
