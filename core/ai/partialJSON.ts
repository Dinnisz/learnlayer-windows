// Port of LearnLayer/AI/PartialJSON.swift @ ref 2026-11-04

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isWhitespace = (character: string | undefined) => character !== undefined && /\s/u.test(character);

function parse(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/**
 * Reads the start of a JSON reply as it streams in: everything up to the
 * last complete value, with the open objects and arrays closed. A string or
 * number still arriving is left out, never cut short, so what it gives can
 * be shown as it is.
 */
export const PartialJSON = {
  value(prefix: string): unknown | undefined {
    const repaired = PartialJSON.repaired(prefix);
    if (repaired === null) return undefined;
    const parsed = parse(repaired);
    return parsed.ok ? parsed.value : undefined;
  },

  /** The prefix cut after its last complete value, its containers closed; null before the first `{` or `[`. */
  repaired(prefix: string): string | null {
    type Container = "object" | "array";
    // Where an object is: waiting for a key, for its colon, for a value, or after one.
    type Expect = "key" | "colon" | "value" | "comma";
    const characters = Array.from(prefix);
    const stack: { container: Container; expect: Expect }[] = [];
    let safeEnd: number | null = null;
    let safeStack: Container[] = [];
    let inString = false;
    let isKey = false;
    let escaped = false;
    let scalarStart: number | null = null;
    let started = false;
    let rootStart = 0;

    const top = () => stack[stack.length - 1];
    const markSafe = (end: number) => {
      safeEnd = end;
      safeStack = stack.map((entry) => entry.container);
    };
    /** A value just ended in the container on top. */
    const valueEnded = (end: number) => {
      const entry = top();
      if (entry) entry.expect = "comma";
      markSafe(end);
    };
    const slice = (from: number, to: number) => characters.slice(from, to).join("");

    for (let index = 0; index < characters.length; index += 1) {
      const character = characters[index]!;
      const next = index + 1;
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') {
          inString = false;
          if (isKey) {
            const entry = top();
            if (entry) entry.expect = "colon";
          } else {
            valueEnded(next);
          }
        }
        continue;
      }
      if (scalarStart !== null) {
        // A number or literal ends at the first character that can't be in it.
        if (/[\p{L}\p{N}+\-.]/u.test(character)) continue;
        const scalar = slice(scalarStart, index);
        scalarStart = null;
        if (!parse(scalar).ok) return null;
        valueEnded(index);
      }
      switch (character) {
        case "{":
        case "[":
          if (!(started || stack.length === 0)) break;
          if (!started) rootStart = index;
          started = true;
          stack.push(
            character === "{" ? { container: "object", expect: "key" } : { container: "array", expect: "value" },
          );
          markSafe(next);
          break;
        case "}":
        case "]":
          if (stack.length === 0) return null;
          stack.pop();
          valueEnded(next);
          if (stack.length === 0) return slice(rootStart, next);
          break;
        case '"':
          if (!started) break;
          inString = true;
          isKey = top()?.container === "object" && top()?.expect === "key";
          break;
        case ":": {
          const entry = top();
          if (entry) entry.expect = "value";
          break;
        }
        case ",": {
          const entry = top();
          if (entry) entry.expect = entry.container === "object" ? "key" : "value";
          break;
        }
        default:
          if (started && !isWhitespace(character)) scalarStart = index;
      }
    }
    if (safeEnd === null) return null;
    // A comma left dangling before the cut is dropped.
    let text = slice(rootStart, safeEnd).replace(/[,\s]+$/u, "");
    for (const container of [...safeStack].reverse()) text += container === "object" ? "}" : "]";
    return text;
  },
};

/** `JSONSerialization` with `.sortedKeys`: every object's keys in order, at every depth. */
function sortedStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(sortedStringify).join(",")}]`;
  if (isObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${sortedStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function indexOfInsensitive(text: string, needle: string, from = 0): number {
  return text.toLowerCase().indexOf(needle.toLowerCase(), from);
}

/**
 * A streamed reply that arrived as a tool call (`<invoke name="respond">`)
 * instead of the JSON object that was asked for. Read back as JSON when the
 * parameters carry it, so that call can be used and is not requested again.
 */
export const ToolCallMarkup = {
  looksLikeToolCall(text: string): boolean {
    const trimmed = text.trim();
    if (trimmed === "" || trimmed.startsWith("{") || trimmed.startsWith("[")) return false;
    const lower = trimmed.toLowerCase();
    const openings = ["<invoke", "<function_calls", "<function_call", "<tool_call"];
    if (openings.some((opening) => lower.includes(opening))) return true;
    // The opening tag is still arriving ("<", "<inv", …).
    return lower.startsWith("<") && openings.some((opening) => opening.startsWith(lower));
  },

  isComplete(text: string): boolean {
    return ["</invoke>", "</function_calls>", "</function_call>", "</tool_call>"].some(
      (closing) => indexOfInsensitive(text, closing) >= 0,
    );
  },

  /** The JSON object the tool call was sending, or null when it isn't recoverable. */
  jsonObject(text: string): string | null {
    if (!ToolCallMarkup.looksLikeToolCall(text)) return null;
    const parameters = parameterBodies(text);
    if (parameters.length === 0) return null;
    if (parameters.length === 1) {
      const only = jsonValue(parameters[0]!.body);
      if (isObject(only)) return sortedStringify(only);
    }
    const wrappers = ["response", "json", "result", "answer", "data", "output"];
    for (const parameter of parameters) {
      if (!wrappers.includes(parameter.name.toLowerCase())) continue;
      const object = jsonValue(parameter.body);
      if (isObject(object) && object.parts !== undefined) return sortedStringify(object);
    }
    const object: Json = {};
    for (const parameter of parameters) object[parameter.name] = jsonValue(parameter.body);
    return sortedStringify(object);
  },
};

function parameterBodies(text: string): { name: string; body: string }[] {
  const found: { name: string; body: string }[] = [];
  let search = 0;
  while (search < text.length) {
    const open = indexOfInsensitive(text, "<parameter", search);
    if (open < 0) break;
    const afterOpen = open + "<parameter".length;
    const tagEnd = text.indexOf(">", afterOpen);
    if (tagEnd < 0) break;
    const tag = text.slice(afterOpen, tagEnd);
    const name = attribute("name", tag) ?? "value";
    if (tag.replace(/[ \t]+$/u, "").endsWith("/")) {
      found.push({ name, body: "" });
      search = tagEnd + 1;
      continue;
    }
    const close = indexOfInsensitive(text, "</parameter>", tagEnd + 1);
    if (close < 0) break;
    found.push({ name, body: text.slice(tagEnd + 1, close) });
    search = close + "</parameter>".length;
  }
  return found;
}

function attribute(name: string, tag: string): string | null {
  for (const quote of ['"', "'"]) {
    const start = indexOfInsensitive(tag, `${name}=${quote}`);
    if (start < 0) continue;
    const rest = tag.slice(start + name.length + 2);
    const end = rest.indexOf(quote);
    if (end < 0) continue;
    return rest.slice(0, end);
  }
  return null;
}

function jsonValue(body: string): unknown {
  const trimmed = body.trim();
  const direct = parsedJSON(trimmed);
  if (direct.ok) return direct.value;
  const decoded = decodeEntities(trimmed);
  if (decoded !== trimmed) {
    const again = parsedJSON(decoded);
    if (again.ok) return again.value;
  }
  if (decoded === "") return null;
  return decoded;
}

function parsedJSON(text: string): { ok: true; value: unknown } | { ok: false } {
  let inner = text;
  if (inner.startsWith("<![CDATA[") && inner.endsWith("]]>")) {
    inner = inner.slice("<![CDATA[".length, inner.length - "]]>".length).trim();
  }
  if (inner === "") return { ok: false };
  return parse(inner);
}

/** Ampersand first, so `&amp;quot;` becomes a quote and not the word amp. */
function decodeEntities(text: string): string {
  let out = text;
  for (const [entity, character] of [
    ["&amp;", "&"],
    ["&quot;", '"'],
    ["&apos;", "'"],
    ["&lt;", "<"],
    ["&gt;", ">"],
  ] as const) {
    out = out.replaceAll(entity, character);
  }
  return out;
}

/**
 * What to do with the reply so far while it streams. Tool-call markup is held
 * back until it can be read as JSON, and rejected once it is finished and can't.
 */
export type StreamedReplyEvent =
  { kind: "forward" } | { kind: "hold" } | { kind: "json"; json: string } | { kind: "reject" };

export function streamedReplyEvent(content: string): StreamedReplyEvent {
  if (!ToolCallMarkup.looksLikeToolCall(content)) return { kind: "forward" };
  if (ToolCallMarkup.isComplete(content)) {
    const json = ToolCallMarkup.jsonObject(content);
    return json === null ? { kind: "reject" } : { kind: "json", json };
  }
  return { kind: "hold" };
}

/**
 * A solution reply the model didn't quite close: a missing value becomes null,
 * and a card object that still isn't JSON is dropped. The rest of the reply stays.
 */
export const SolutionJSON = {
  repaired(text: string): string {
    return droppingBrokenCards(fillingMissingValues(SolutionJSON.closingSlippedBrackets(text)));
  },

  /**
   * Bracket slips: `["a", "b", "answer": {...}]` where the array was never
   * closed before the next key, and a `}` closing an array or a `]` closing an
   * object. Valid JSON is left as it is.
   */
  closingSlippedBrackets(text: string): string {
    const characters = Array.from(text);
    let result = "";
    const stack: string[] = [];
    let index = 0;
    const last = () => stack[stack.length - 1];
    while (index < characters.length) {
      const character = characters[index]!;
      if (character === '"') {
        let end = index + 1;
        let escaped = false;
        while (end < characters.length) {
          if (escaped) escaped = false;
          else if (characters[end] === "\\") escaped = true;
          else if (characters[end] === '"') break;
          end += 1;
        }
        let after = end + 1;
        while (after < characters.length && isWhitespace(characters[after])) after += 1;
        const isKey = after < characters.length && characters[after] === ":";
        if (isKey && last() === "[") {
          // A key inside an array: the array ended before it.
          while (last() === "[") {
            result = stripTrailingComma(result);
            result += "]";
            stack.pop();
          }
          result += ",";
        }
        result += characters.slice(index, Math.min(end + 1, characters.length)).join("");
        index = end + 1;
        continue;
      }
      switch (character) {
        case "{":
        case "[":
          stack.push(character);
          result += character;
          break;
        case "}":
        case "]": {
          // A closer that doesn't match what is open is the other kind's: `[... }` and `{... ]`.
          const wanted = last() === "[" ? "]" : last() === "{" ? "}" : character;
          if (stack.length > 0) stack.pop();
          result += wanted;
          break;
        }
        default:
          result += character;
      }
      index += 1;
    }
    return result;
  },
};

function stripTrailingComma(text: string): string {
  const trimmed = text.replace(/\s+$/u, "");
  return trimmed.endsWith(",") ? trimmed.slice(0, -1) : trimmed;
}

/** `"latex": }` and `"latex":,` become `"latex": null`. */
function fillingMissingValues(text: string): string {
  const characters = Array.from(text);
  let result = "";
  let inString = false;
  let escaped = false;
  let index = 0;
  while (index < characters.length) {
    const character = characters[index]!;
    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      index += 1;
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
      index += 1;
      continue;
    }
    if (character === ":") {
      result += ":";
      let cursor = index + 1;
      let spaces = "";
      while (cursor < characters.length && isWhitespace(characters[cursor])) {
        spaces += characters[cursor];
        cursor += 1;
      }
      if (cursor === characters.length || ",}]".includes(characters[cursor]!)) {
        result += " null";
        index = cursor;
        continue;
      }
      result += spaces;
      index = cursor;
      continue;
    }
    result += character;
    index += 1;
  }
  return result;
}

/** Each `"cards"` array keeps only the objects that parse. A broken one is omitted. */
function droppingBrokenCards(text: string): string {
  const characters = Array.from(text);
  const key = Array.from('"cards"');
  let output = "";
  let index = 0;
  let inString = false;
  let escaped = false;
  const startsWithKey = (at: number) => key.every((character, offset) => characters[at + offset] === character);
  while (index < characters.length) {
    const character = characters[index]!;
    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      index += 1;
      continue;
    }
    if (character === '"' && startsWithKey(index)) {
      let cursor = index + key.length;
      while (cursor < characters.length && isWhitespace(characters[cursor])) cursor += 1;
      if (cursor < characters.length && characters[cursor] === ":") {
        cursor += 1;
        while (cursor < characters.length && isWhitespace(characters[cursor])) cursor += 1;
        if (cursor < characters.length && characters[cursor] === "[") {
          output += characters.slice(index, cursor).join("");
          const repaired = repairedCardArray(characters, cursor);
          output += repaired.array;
          index = repaired.end;
          continue;
        }
      }
    }
    if (character === '"') inString = true;
    output += character;
    index += 1;
  }
  return output;
}

function repairedCardArray(characters: string[], openBracket: number): { array: string; end: number } {
  const kept: string[] = [];
  let index = openBracket + 1;
  const array = () => `[${kept.join(",")}]`;
  while (index < characters.length) {
    while (index < characters.length && (isWhitespace(characters[index]) || characters[index] === ",")) index += 1;
    if (index >= characters.length) break;
    if (characters[index] === "]") return { array: array(), end: index + 1 };
    if (characters[index] !== "{") break;
    const object = scanContainer(characters, index);
    if (!object) return { array: array(), end: characters.length };
    const cleaned = parsedObject(object.slice);
    if (cleaned !== null) kept.push(cleaned);
    index = object.end;
  }
  return { array: array(), end: index };
}

function scanContainer(characters: string[], open: number): { slice: string; end: number } | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = open; index < characters.length; index += 1) {
    const character = characters[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return { slice: characters.slice(open, index + 1).join(""), end: index + 1 };
    }
  }
  return null;
}

function parsedObject(slice: string): string | null {
  if (isJSONObject(slice)) return slice;
  const cleaned = removingTrailingCommas(slice);
  return isJSONObject(cleaned) ? cleaned : null;
}

function isJSONObject(slice: string): boolean {
  const parsed = parse(slice);
  return parsed.ok && isObject(parsed.value);
}

/** `{"latex":"x",}` is still that card. */
function removingTrailingCommas(text: string): string {
  const characters = Array.from(text);
  let result = "";
  let inString = false;
  let escaped = false;
  let index = 0;
  while (index < characters.length) {
    const character = characters[index]!;
    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      index += 1;
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
      index += 1;
      continue;
    }
    if (character === ",") {
      let cursor = index + 1;
      while (cursor < characters.length && isWhitespace(characters[cursor])) cursor += 1;
      if (cursor < characters.length && characters[cursor] === "}") {
        index = cursor;
        continue;
      }
    }
    result += character;
    index += 1;
  }
  return result;
}

export interface StreamedEvidence {
  quote: string;
  source: string | null;
  point: string | null;
  why: string | null;
}

/**
 * What has arrived of the part being solved: its answer once complete, the
 * passages it quotes, the paragraphs written so far.
 */
export interface StreamedPart {
  answerText: string | null;
  answerLatex: string | null;
  evidence: StreamedEvidence[];
  paragraphs: string[];
  /** The reply wrote "evidence" as null or reached the answer without it: not a text answer. */
  hasNoEvidence: boolean;
}

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

/** The part labelled `label` (else the first) in a partial solution. */
export function streamedPart(content: string, label: string | null): StreamedPart | null {
  const root = PartialJSON.value(content);
  if (!isObject(root) || !Array.isArray(root.parts) || root.parts.length === 0) return null;
  if (!root.parts.every(isObject)) return null;
  const parts = root.parts as Json[];
  const part = parts.find((candidate) => candidate.label === label) ?? parts[0]!;
  let answerText: string | null = null;
  if (isObject(part.answer) && typeof part.answer.text === "string" && part.answer.text !== "") {
    answerText = part.answer.text;
  } else if (typeof part.answer === "string" && part.answer !== "") {
    answerText = part.answer;
  }
  const answerLatex = typeof part.answerLatex === "string" && part.answerLatex !== "" ? part.answerLatex : null;
  const evidence: StreamedEvidence[] = [];
  if (Array.isArray(part.evidence) && part.evidence.every(isObject)) {
    for (const item of part.evidence as Json[]) {
      if (typeof item.quote !== "string" || item.quote === "") continue;
      evidence.push({ quote: item.quote, source: text(item.source), point: text(item.point), why: text(item.why) });
    }
  }
  const paragraphs =
    Array.isArray(part.paragraphs) && part.paragraphs.every(isObject)
      ? (part.paragraphs as Json[]).flatMap((paragraph) => (typeof paragraph.text === "string" ? [paragraph.text] : []))
      : [];
  const hasNoEvidence =
    part.evidence === null || (part.evidence === undefined && (answerText !== null || part.cards !== undefined));
  return { answerText, answerLatex, evidence, paragraphs, hasNoEvidence };
}
