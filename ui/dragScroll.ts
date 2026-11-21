// Scrolling with nothing drawn for it: the app shows no scrollbars (base.css), so a scrollable area also moves by
// dragging it with the mouse, as a touch screen would. The wheel and the touchpad scroll as always. A press on text
// that can be selected, a control, a canvas or the PDF's text keeps its own meaning; a drag that scrolled is not a click.

const ownMeaning =
  "input, textarea, select, button, a, label, [contenteditable], canvas, svg, video, .textLayer, .katex, [data-no-drag]";

function scrollableAncestor(start: Element | null): HTMLElement | null {
  for (let element = start; element && element !== document.documentElement; element = element.parentElement) {
    if (!(element instanceof HTMLElement)) continue;
    const style = getComputedStyle(element);
    const vertical = /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
    const horizontal = /(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 1;
    if (vertical || horizontal) return element;
  }
  return null;
}

function install(): void {
  document.addEventListener(
    "mousedown",
    (down) => {
      if (down.button !== 0 || down.defaultPrevented) return;
      const target = down.target instanceof Element ? down.target : null;
      if (!target || target.closest(ownMeaning)) return;
      if (getComputedStyle(target).userSelect === "text") return;
      const scroller = scrollableAncestor(target);
      if (!scroller) return;
      const start = { x: down.clientX, y: down.clientY };
      let last = start;
      let dragging = false;
      const move = (event: MouseEvent) => {
        if (!dragging && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 4) return;
        dragging = true;
        event.preventDefault();
        scroller.scrollTop -= event.clientY - last.y;
        scroller.scrollLeft -= event.clientX - last.x;
        last = { x: event.clientX, y: event.clientY };
      };
      const up = () => {
        window.removeEventListener("mousemove", move, true);
        window.removeEventListener("mouseup", up, true);
        if (!dragging) return;
        // The click that ends a drag opens nothing.
        const swallow = (click: MouseEvent) => {
          click.stopPropagation();
          click.preventDefault();
        };
        window.addEventListener("click", swallow, { capture: true, once: true });
        window.setTimeout(() => window.removeEventListener("click", swallow, true), 0);
      };
      window.addEventListener("mousemove", move, true);
      window.addEventListener("mouseup", up, true);
    },
    true,
  );
}

install();
