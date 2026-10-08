import type { RpgMap, RpgPlayer } from '@rpgjs/server';

/**
 * Walking is the phone's: it moves the character at once and reports where it is, and the server
 * takes that position instead of replaying each step on its own clock (which ran seconds behind).
 * Walking pays nothing, so the server only checks a report is within walking reach of the last one.
 */
type Reported = { frame: number; clientState?: { x: number; y: number; direction?: string } };

/** Walking pace is about 0.11 px/ms; twice that leaves room for steps the network bunched together. */
const REACH_PX_PER_MS = 0.25, REACH_SLACK_PX = 48, REACH_WINDOW_MS = 1000;

/** Whether a reported position is within walking reach of the last accepted one. */
export function withinReach(from: { x: number; y: number }, to: { x: number; y: number }, elapsedMs: number): boolean {
  const reach = Math.min(Math.max(elapsedMs, 0), REACH_WINDOW_MS) * REACH_PX_PER_MS + REACH_SLACK_PX;
  return Math.hypot(to.x - from.x, to.y - from.y) <= reach;
}

const acceptedAt = new WeakMap<RpgPlayer, number>();

/** Once per server step: place each player where their phone last reported, and acknowledge it. */
export async function followReportedPositions(map: RpgMap) {
  for (const player of map.getPlayers()) {
    const reports = (player as any).pendingInputs as Reported[] | undefined;
    if (!reports?.length) continue;
    // The phone already took these steps; the engine must not replay them.
    (player as any).pendingInputs = [];
    const latest = reports.filter(r => r.clientState).sort((a, b) => b.frame - a.frame)[0];
    if (!latest?.clientState) continue;
    const now = Date.now();
    const { x, y, direction } = latest.clientState;
    const accepted = withinReach({ x: player.x(), y: player.y() }, { x, y }, now - (acceptedAt.get(player) ?? 0));
    if (accepted) {
      await player.teleport({ x, y });
      if (direction) player.changeDirection(direction as any);
      acceptedAt.set(player, now);
    }
    (map as any).stopMovement?.(player);
    // The acknowledgement the phone reconciles against: its own position when accepted, ours if not.
    (player as any)._lastFramePositions = {
      frame: latest.frame,
      position: { x: Math.round(player.x()), y: Math.round(player.y()), direction: player.direction() },
      serverTick: (map as any).getTick?.() ?? 0,
    };
  }
}
