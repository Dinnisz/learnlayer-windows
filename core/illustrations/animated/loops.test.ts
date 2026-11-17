// Port of the array-loop and recursion suites of LearnLayerTests/PremadeFigureBatch4ProgrammingTests.swift @ ref
// 2026-11-04. The figures' bounds and overlaps are checked with the gallery in animated.test.ts.

import { describe, expect, it } from "vitest";
import { arrayLoopRun, recursionTrace } from "./loops";

describe("loop over an array", () => {
  it("sum keeps a running total", () => {
    const run = arrayLoopRun("sum", [4, 7, 2, 9, 5], 0, 0)!;
    expect(run.passes.map((p) => p.accumulator)).toEqual([4, 11, 13, 22, 27]);
    expect(run.result).toBe(27);
    expect(run.passes.map((p) => p.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it("max keeps the best so far and where it is", () => {
    const run = arrayLoopRun("max", [4, 7, 2, 9, 5], 0, 0)!;
    expect(run.passes.map((p) => p.accumulator)).toEqual([4, 7, 7, 9, 9]);
    expect(run.passes.map((p) => p.test)).toEqual([null, true, false, true, false]);
    expect(run.result === 9 && run.answerIndex === 3).toBe(true);
    // The first of equal maxima wins, since the test is strict.
    expect(arrayLoopRun("max", [9, 3, 9], 0, 0)!.answerIndex).toBe(0);
    const negative = arrayLoopRun("max", [-5, -2, -9], 0, 0)!;
    expect(negative.result === -2 && negative.answerIndex === 1).toBe(true);
  });

  it("count tests every element against k", () => {
    const run = arrayLoopRun("count", [4, 7, 2, 9, 5, 6], 5, 0)!;
    expect(run.passes.map((p) => p.test)).toEqual([false, true, false, true, false, true]);
    expect(run.passes.map((p) => p.accumulator)).toEqual([0, 1, 1, 2, 2, 3]);
    expect(run.result).toBe(3);
  });

  it("search stops at the first match or runs off the end", () => {
    const found = arrayLoopRun("search", [4, 7, 2, 9, 5, 9], 0, 9)!;
    expect(found.passes).toHaveLength(4);
    expect(found.result === 3 && found.answerIndex === 3).toBe(true);
    expect(found.passes.map((p) => p.test)).toEqual([false, false, false, true]);
    const missing = arrayLoopRun("search", [4, 7, 2], 0, 11)!;
    expect(missing.passes).toHaveLength(3);
    expect(missing.result === null && missing.answerIndex === null).toBe(true);
  });
});

describe("recursion", () => {
  it("Fibonacci makes two calls and returns their sum", () => {
    const known: Record<number, [number, number]> = { 2: [1, 3], 3: [2, 5], 4: [3, 9], 5: [5, 15] };
    for (const [n, [value, calls]] of Object.entries(known)) {
      const trace = recursionTrace("fibonacci", Number(n))!;
      expect(trace.calls[0]!.result, `F(${n})`).toBe(value);
      expect(trace.calls.length, `calls of F(${n})`).toBe(calls);
      expect(trace.events).toHaveLength(2 * calls);
      for (const call of trace.calls)
        if (call.argument < 2) expect(call.children.length === 0 && call.result === call.argument).toBe(true);
        else {
          expect(call.children.map((c) => trace.calls[c]!.argument)).toEqual([call.argument - 1, call.argument - 2]);
          expect(call.result).toBe(call.children.reduce((sum, c) => sum + trace.calls[c]!.result, 0));
        }
    }
    // F(2) is computed fib(n − 1) times: the repeated work the picture points out.
    for (let n = 3; n <= 5; n++) {
      let a = 0;
      let b = 1;
      for (let i = 0; i < n - 1; i++) [a, b] = [b, a + b];
      expect(recursionTrace("fibonacci", n)!.calls.filter((c) => c.argument === 2).length, `n = ${n}`).toBe(a);
    }
  });

  it("events follow the order of a real run", () => {
    const trace = recursionTrace("fibonacci", 4)!;
    const stack: number[] = [];
    const calledBefore = new Set<number>();
    for (const event of trace.events)
      if (event.returns) {
        expect(stack[stack.length - 1], "a call returns only when it is the innermost one").toBe(event.call);
        stack.pop();
      } else {
        expect(calledBefore.has(event.call)).toBe(false);
        calledBefore.add(event.call);
        expect(stack[stack.length - 1] ?? null).toBe(trace.calls[event.call]!.parent);
        stack.push(event.call);
      }
    expect(stack).toEqual([]);
  });

  it("factorial is a chain down to zero and back", () => {
    for (let n = 1; n <= 6; n++) {
      const trace = recursionTrace("factorial", n)!;
      expect(trace.calls.map((c) => c.argument)).toEqual(Array.from({ length: n + 1 }, (_, i) => n - i));
      let product = 1;
      for (let k = 2; k <= n; k++) product *= k;
      expect(trace.calls[0]!.result).toBe(product);
      expect(trace.calls[trace.calls.length - 1]!.result).toBe(1);
    }
    expect(recursionTrace("fibonacci", 6)).toBeNull();
    expect(recursionTrace("factorial", 0)).toBeNull();
    expect(recursionTrace("ackermann", 2)).toBeNull();
  });
});
