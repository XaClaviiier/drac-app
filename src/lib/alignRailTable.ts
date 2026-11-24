// A desktop table extends through its panel padding. The scrollbar sits in the
// gap beside the action buttons so the last visible column keeps the same edge.
export function alignRailTable(viewport: HTMLDivElement | null) {
  const panel = viewport?.parentElement;
  if (!viewport || !panel) return;

  const measure = () => {
    const padding = parseFloat(getComputedStyle(panel).paddingRight);
    const scrollbarAndBorder = viewport.offsetWidth - viewport.clientWidth - viewport.clientLeft;
    viewport.style.setProperty('--app-rail-table-outset', (padding + scrollbarAndBorder) + 'px');
  };
  measure();
  let frame = 0;
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(measure);
  });
  observer.observe(panel);
  observer.observe(viewport);
  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
  };
}
