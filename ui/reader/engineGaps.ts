// The newest JavaScript methods pdf.js 6 calls, for engines that don't have them yet. Chromium (WebView2 on Windows)
// has them all; Safari's engine (WKWebView on the Mac) lacks some on macOS 13–15: `Map.prototype.getOrInsertComputed`
// (every page drawn) and `Math.sumPrecise` (every embedded font converted, so without it LaTeX's fonts fell back to
// system ones and Σ drew as «X»). Each is defined only where missing, as its proposal specifies it, so on Windows this
// file does nothing.

type Store = { has(key: unknown): boolean; get(key: unknown): unknown; set(key: unknown, value: unknown): unknown };

function define(target: object, name: string, value: unknown) {
  if (typeof (target as Record<string, unknown>)[name] === "function") return;
  Object.defineProperty(target, name, { configurable: true, writable: true, value });
}

for (const prototype of [Map.prototype, WeakMap.prototype] as unknown as Store[]) {
  define(prototype, "getOrInsert", function (this: Store, key: unknown, value: unknown) {
    if (!this.has(key)) this.set(key, value);
    return this.get(key);
  });
  define(prototype, "getOrInsertComputed", function (this: Store, key: unknown, compute: (key: unknown) => unknown) {
    if (typeof compute !== "function") throw new TypeError("getOrInsertComputed: the callback is not a function");
    if (!this.has(key)) this.set(key, compute(key));
    return this.get(key);
  });
}

/** `Math.sumPrecise`: the sum of an iterable of numbers, with Neumaier's compensation for the rounding errors. */
define(Math, "sumPrecise", (values: Iterable<number>) => {
  let sum = -0;
  let compensation = 0;
  let any = false;
  for (const value of values) {
    if (typeof value !== "number") throw new TypeError("Math.sumPrecise: every item must be a number");
    if (!any) {
      sum = value;
      any = true;
      continue;
    }
    const next = sum + value;
    compensation += Math.abs(sum) >= Math.abs(value) ? sum - next + value : value - next + sum;
    sum = next;
  }
  return any ? sum + compensation : -0;
});

define(Uint8Array.prototype, "toHex", function (this: Uint8Array) {
  let hex = "";
  for (const byte of this) hex += byte.toString(16).padStart(2, "0");
  return hex;
});

define(Uint8Array, "fromBase64", (text: string) =>
  Uint8Array.from(atob(text.replace(/\s+/gu, "")), (c) => c.charCodeAt(0)),
);

define(
  Promise,
  "try",
  <T>(action: (...args: unknown[]) => T | PromiseLike<T>, ...args: unknown[]) =>
    new Promise<T>((resolve) => resolve(action(...args))),
);

export {};
