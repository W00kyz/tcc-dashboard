import "@testing-library/jest-dom/vitest";

// jsdom runs no layout engine, so every getBoundingClientRect() is a zero rect. @dnd-kit's
// KeyboardSensor compares the rects of sortable rows to pick a drop target, so under jsdom a
// keyboard drag can never move. Give <li> rows a deterministic vertical stack (ROW_HEIGHT
// tall, ordered by their position among their siblings) so the Space / Arrow / Space keyboard
// reorder resolves to a real neighbour in tests. Every other element keeps the zero rect
// jsdom already returns.
const ROW_HEIGHT = 48;
const ROW_WIDTH = 240;

function rect(top: number, height: number, width: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    bottom: top + height,
    left: 0,
    right: width,
    width,
    height,
    toJSON: () => ({}),
  };
}

function stackedRowRect(element: Element): DOMRect {
  const siblings = element.parentElement ? Array.from(element.parentElement.children) : [element];
  const index = Math.max(0, siblings.indexOf(element));

  return rect(index * ROW_HEIGHT, ROW_HEIGHT, ROW_WIDTH);
}

Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
  configurable: true,
  value(this: HTMLElement): DOMRect {
    return this.tagName === "LI" ? stackedRowRect(this) : rect(0, 0, 0);
  },
});

// jsdom has no matchMedia; the shadcn sidebar's useIsMobile() calls it on mount. Report a
// desktop viewport (no media query matches) so the shell renders its desktop sidebar.
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList,
});

// jsdom implements no scrolling; the board's pager scrolls the route table into view.
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => undefined;
}
