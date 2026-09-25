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
import { webcrypto, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ITERATIONS = 600000;

// One entry per private project. `envVar` holds its password.
const PROJECTS = [
  { slug: "stratus", title: "Stratus", envVar: "STRATUS_PASSWORD" },
  { slug: "guapp", title: "Guapp", envVar: "GUAPP_PASSWORD" },
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

async function encrypt(plaintext, password) {
  const salt = randomBytes(16);
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
  const src = join(ROOT, "private", `${p.slug}.html`);
  const password = process.env[p.envVar] || fileEnv[p.envVar];
  if (!existsSync(src)) { console.warn(`skip ${p.slug}: ${src} not found`); continue; }
  if (!password) { console.error(`missing ${p.envVar} — set it or run with --new-passwords`); process.exitCode = 1; continue; }
  if (password.length < 12) { console.error(`${p.envVar} is too short (min 12 chars)`); process.exitCode = 1; continue; }

  const payload = await encrypt(readFileSync(src, "utf8"), password);
  const html = gate
    .replaceAll("__TITLE__", p.title)
    .replaceAll("__SLUG__", p.slug)
    .replace("__PAYLOAD__", JSON.stringify(payload));
  const outDir = join(ROOT, "p", p.slug);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "index.html"), html);
  built++;
  console.log(`encrypted  private/${p.slug}.html  ->  p/${p.slug}/index.html`);
}

console.log(`${built} private page(s) built.`);
