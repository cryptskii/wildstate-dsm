type BoundMovement = {
  actionName: string;
  options: { keyDown?: (binding: BoundMovement) => void; keyUp?: (binding: BoundMovement) => void };
};
export type MovementControls = { getControls(): Record<string, BoundMovement> };

/** Sample one engine movement callback per tick; applyControl fans out to three devices. */
export function heldDirection(controls: () => MovementControls | null | undefined) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let held: { controls: MovementControls; direction: string; binding: BoundMovement } | undefined;
  const bindingFor = (target: MovementControls, direction: string) =>
    Object.values(target.getControls()).find(binding => binding.actionName === direction);
  function stop() {
    clearInterval(timer);
    timer = undefined;
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
      timer = setInterval(sample, 1000 / 60);
    },
    stop,
  };
}
