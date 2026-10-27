import "@testing-library/jest-dom/vitest";

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

// jsdom has no ResizeObserver; Radix's Checkbox measures its hidden form input with one when it
// sits inside a <form> (the company dialog).
if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class {
    observe() {
      return undefined;
    }
    unobserve() {
      return undefined;
    }
    disconnect() {
      return undefined;
    }
  };
}
