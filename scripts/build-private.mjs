#!/usr/bin/env node
// Encrypts each private project page so it can be hosted anywhere (GitHub Pages, Vercel)
// without the plaintext ever being published.
//
//   private/<slug>.html  --(AES-256-GCM, key = PBKDF2-SHA256(password))-->  p/<slug>/index.html
//
// Passwords come from environment variables (STRATUS_PASSWORD, GUAPP_PASSWORD, ...) or from
// the gitignored .env.local file. Run `node scripts/build-private.mjs --new-passwords` once to
// generate strong passwords into .env.local.
//
// The plaintext sources in private/ are gitignored. Keep a backup of them — the repo only
// ever contains the encrypted output.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { webcrypto, randomBytes, createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// Keys are 20 random characters (~100 bits), so security comes from the key itself, not from
// slow hashing. A modest iteration count keeps unlocking quick on low-end phones.
const ITERATIONS = 100000;

// One entry per private page. `envVar` holds its password; `src` and `out` default to the slug.
const PROJECTS = [
  { slug: "stratus", title: "Stratus", envVar: "STRATUS_PASSWORD" },
  { slug: "guapp", title: "Guapp", envVar: "GUAPP_PASSWORD" },
  { slug: "onefold", title: "Onefold", envVar: "ONEFOLD_PASSWORD" },
  { slug: "paceline", title: "Paceline", envVar: "PACELINE_PASSWORD" },
  { slug: "mirra", title: "Mirra", envVar: "MIRRA_PASSWORD" },
  // Extra pages share their project's key (and slug, so a key remembered on a device unlocks both).
  { slug: "paceline", title: "Paceline · Screen flow", envVar: "PACELINE_PASSWORD", src: "paceline-flow", out: "paceline/flow" },
  { slug: "mirra", title: "Mirra · Screen flow", envVar: "MIRRA_PASSWORD", src: "mirra-flow", out: "mirra/flow" },
  { slug: "stratus", title: "Stratus · Screen flow", envVar: "STRATUS_PASSWORD", src: "stratus-flow", out: "stratus/flow" },
  { slug: "onefold", title: "Onefold · Screen flow", envVar: "ONEFOLD_PASSWORD", src: "onefold-flow", out: "onefold/flow" },
];

const ENV_FILE = join(ROOT, ".env.local");

function loadEnvFile() {
  if (!existsSync(ENV_FILE)) return {};
  const out = {};
  for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function generatePassword() {
  // 20 chars from an unambiguous alphabet (~100 bits), grouped for readability.
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(20);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return chars.match(/.{5}/g).join("-");
}

if (process.argv.includes("--new-passwords")) {
  const existing = loadEnvFile();
  const lines = [];
  for (const p of PROJECTS) {
    const pw = existing[p.envVar] || generatePassword();
    lines.push(`${p.envVar}=${pw}`);
  }
  writeFileSync(ENV_FILE, lines.join("\n") + "\n", { mode: 0o600 });
  console.log(`Wrote ${ENV_FILE} (existing passwords kept).`);
}

const fileEnv = loadEnvFile();
const b64 = (buf) => Buffer.from(buf).toString("base64");

async function encrypt(plaintext, password, slug) {
  // Salt is fixed per project (the IV stays random) so the derived key is stable across
  // rebuilds — a key remembered on a collaborator's device keeps working after updates.
  const salt = createHash("sha256").update(`vexon-labs:${slug}`).digest().subarray(0, 16);
  const iv = randomBytes(12);
  const baseKey = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await webcrypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  const ct = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return { salt: b64(salt), iv: b64(iv), ct: b64(ct), iter: ITERATIONS };
}

const gate = readFileSync(join(ROOT, "scripts", "gate.html"), "utf8");
let built = 0;

for (const p of PROJECTS) {
  const src = join(ROOT, "private", `${p.src || p.slug}.html`);
  const out = p.out || p.slug;
  const password = process.env[p.envVar] || fileEnv[p.envVar];
  if (!existsSync(src)) { console.warn(`skip ${p.slug}: ${src} not found`); continue; }
  if (!password) { console.error(`missing ${p.envVar} — set it or run with --new-passwords`); process.exitCode = 1; continue; }
  if (password.length < 20) { console.error(`${p.envVar} is too short (min 20 chars) — use --new-passwords`); process.exitCode = 1; continue; }

  const payload = await encrypt(readFileSync(src, "utf8"), password, p.slug);
  // gate.html links assets as ../../ (right for p/<slug>/); deeper pages need more levels.
  const up = "../".repeat(out.split("/").length + 1);
  const html = gate
    .replaceAll("../../", up)
    .replaceAll("__TITLE__", p.title)
    .replaceAll("__SLUG__", p.slug)
    .replace("__PAYLOAD__", JSON.stringify(payload));
  const outDir = join(ROOT, "p", out);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "index.html"), html);
  built++;
  console.log(`encrypted  private/${p.src || p.slug}.html  ->  p/${out}/index.html`);
}

console.log(`${built} private page(s) built.`);
