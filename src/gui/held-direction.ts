type BoundMovement = {
  actionName: string;
  options: { keyDown?: (binding: BoundMovement) => void; keyUp?: (binding: BoundMovement) => void };
};
export type MovementControls = { getControls(): Record<string, BoundMovement> };

/**
 * Run `fn` every displayed frame. Phones starve timers while the game renders: measured on a
 * Galaxy A16, a 60-per-second interval fired 6.5 times a second while frames ran at ~42 fps,
 * so a held direction stepped in visible jerks. Without frames (tests, servers), 60 per second.
 */
function everyFrame(fn: () => void): () => void {
  if (typeof requestAnimationFrame === 'function') {
    let id = requestAnimationFrame(function loop() { fn(); id = requestAnimationFrame(loop); });
    return () => cancelAnimationFrame(id);
  }
  const timer = setInterval(fn, 1000 / 60);
  return () => clearInterval(timer);
}

/** Sample one engine movement callback per frame; applyControl fans out to three devices. */
export function heldDirection(controls: () => MovementControls | null | undefined) {
  let cancel: (() => void) | undefined;
  let held: { controls: MovementControls; direction: string; binding: BoundMovement } | undefined;
  const bindingFor = (target: MovementControls, direction: string) =>
    Object.values(target.getControls()).find(binding => binding.actionName === direction);
  function stop() {
    cancel?.();
    cancel = undefined;
    const previous = held;
    held = undefined;
    previous?.binding.options.keyUp?.(previous.binding);
  }
  function sample() {
    if (!held) return;
    const current = controls();
    if (!current) { stop(); return; }
    const binding = bindingFor(current, held.direction);
    if (!binding) { stop(); return; }
    if (current !== held.controls) {
      held.binding.options.keyUp?.(held.binding);
      held.controls = current;
    }
    held.binding = binding;
    binding.options.keyDown?.(binding);
  }
  return {
    start(direction: string) {
      stop();
      const target = controls();
      if (!target) return;
      const binding = bindingFor(target, direction);
      if (!binding) return;
      held = { controls: target, direction, binding };
      sample();
      cancel = everyFrame(sample);
    },
    /** Hold `direction`, or stop for null; holding the same direction again changes nothing. */
    set(direction: string | null) {
      if (direction === null) { stop(); return; }
      if (held?.direction !== direction) this.start(direction);
    },
    stop,
  };
}
