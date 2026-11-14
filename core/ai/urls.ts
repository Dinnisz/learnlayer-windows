// URL helpers that write links the way Foundation's URLComponents does, so the Windows app opens
// character-for-character the same login and checkout links as the Mac app.

/** What `URLComponents.queryItems` leaves unescaped in a name or a value. */
const queryAllowed = /[A-Za-z0-9\-._~!$'()*+,/:;?@]/;

export function encodeQueryPart(text: string): string {
  let out = "";
  for (const character of text) {
    if (queryAllowed.test(character)) {
      out += character;
    } else {
      for (const byte of new TextEncoder().encode(character))
        out += "%" + byte.toString(16).toUpperCase().padStart(2, "0");
    }
  }
  return out;
}

export function queryString(items: readonly (readonly [string, string])[]): string {
  return items.map(([name, value]) => `${encodeQueryPart(name)}=${encodeQueryPart(value)}`).join("&");
}

/** An absolute http(s) URL with a host, as written; null for anything else. */
export function absoluteHTTP(raw: string | undefined | null): string | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "" || /\s/.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.hostname === "") return null;
  return trimmed;
}
