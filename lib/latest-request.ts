/** Owns one UI request at a time, including parsing and delayed rendering. */
export function createLatestRequest() {
  let active: AbortController | null = null;

  function invalidate() {
    active?.abort();
    active = null;
  }

  return {
    invalidate,
    begin() {
      invalidate();
      const controller = new AbortController();
      active = controller;
      return {
        signal: controller.signal,
        isCurrent: () => active === controller && !controller.signal.aborted,
      };
    },
  };
}
