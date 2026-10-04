export type MovementControls = { applyControl(name: string, isDown?: boolean): Promise<void> };
/** Use the engine's repeating input so prediction, facing and walk frames stay together. */
export function heldDirection(controls: () => MovementControls | null | undefined) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let held: { controls: MovementControls; direction: string } | undefined;
  const apply = (target: MovementControls, direction: string, down: boolean) => {
    void target.applyControl(direction, down).catch(error => console.warn('Movement input failed', error));
  };
  function stop() {
    clearInterval(timer);
    timer = undefined;
    const previous = held;
    held = undefined;
    if (previous) apply(previous.controls, previous.direction, false);
  }
  return {
    start(direction: string) {
      stop();
      const target = controls();
      if (!target) return;
      held = { controls: target, direction };
      apply(target, direction, true);
      // Rendering can reset or replace the keyboard directive while a finger
      // stays down. Renew the held state without adding another movement route.
      timer = setInterval(() => {
        const current = controls();
        if (!current || !held) return;
        if (current !== held.controls) {
          apply(held.controls, direction, false);
          held.controls = current;
        }
        apply(current, direction, true);
      }, 16);
    },
    stop,
  };
}
