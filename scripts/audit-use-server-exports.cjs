/**
 * Fail if a file-level "use server" module exports a non-async-function value.
 */
const fs = require("fs");
const path = require("path");

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}

const root = path.join(__dirname, "..", "src");
const bad = [];

for (const file of walk(root)) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\n/);
  const fileLevel = lines
    .slice(0, 8)
    .some((l) => /^\s*["']use server["']\s*;?\s*$/.test(l));
  if (!fileLevel) continue;

  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (!/^export\s/.test(L)) continue;
    if (/^export\s+async\s+function\b/.test(L)) continue;
    if (/^export\s+type\b/.test(L)) continue;
    if (/^export\s+interface\b/.test(L)) continue;
    if (/^export\s+type\s*\{/.test(L)) continue;
    // export { type Foo } only — allow if every specifier is type-only
    if (/^export\s*\{/.test(L)) {
      const body = L.replace(/^export\s*\{/, "").replace(/\}.*$/, "");
      const parts = body.split(",").map((s) => s.trim()).filter(Boolean);
      if (parts.length && parts.every((p) => /^type\s+/.test(p))) continue;
    }
    bad.push(`${path.relative(root, file)}:${i + 1}: ${L.trim()}`);
  }
}

if (bad.length) {
  console.error("INVALID use-server exports:\n" + bad.join("\n"));
  process.exit(1);
}
console.log("use-server export audit: OK");
