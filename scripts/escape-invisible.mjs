// Writes characters that are invisible or easy to confuse in source code as escapes: control and format
// characters, private-use codes, line and paragraph separators, non-breaking spaces, combining marks and
// ligatures. Run with --check to only list the files that have any (exit 1 when there are).
//
// Every special character below is built from its code, so no tool on the way can turn an escape into the
// character it names.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const check = process.argv.includes("--check");
const BACKSLASH = String.fromCharCode(92);
const categories = ["Cc", "Cf", "Co", "Zl", "Zp", "Mn"].map((name) => BACKSLASH + "p{" + name + "}").join("");
const extra = String.fromCharCode(0xa0) + String.fromCharCode(0xfb00) + "-" + String.fromCharCode(0xfb06);
const special = new RegExp("[" + categories + extra + "]", "u");
const allowed = new Set([String.fromCharCode(9), String.fromCharCode(10), String.fromCharCode(13)]);

function escape(character) {
  const code = character.codePointAt(0);
  const hex = code.toString(16).toUpperCase();
  return code > 0xffff ? BACKSLASH + "u{" + hex + "}" : BACKSLASH + "u" + hex.padStart(4, "0");
}

const files = execSync("git ls-files core ui scripts src-tauri/src", { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter((file) => /\.(ts|tsx|mjs|js|rs|css)$/.test(file));

let found = 0;
for (const file of files) {
  const text = readFileSync(file, "utf8");
  let out = "";
  for (const character of text) {
    if (!allowed.has(character) && special.test(character)) {
      found += 1;
      out += escape(character);
    } else {
      out += character;
    }
  }
  if (out !== text) {
    console.log(file);
    if (!check) writeFileSync(file, out);
  }
}
if (check && found > 0) process.exitCode = 1;
