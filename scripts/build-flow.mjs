#!/usr/bin/env node
// Assembles a project's screen-flow page from its dossier: private/<slug>-flow.tpl.html gets the
// dossier's styles, icon sprite and existing screens spliced in, and is written to
// private/<slug>-flow.html (gitignored). build-private.mjs then encrypts it.
//
//   node scripts/build-flow.mjs paceline
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2] || "paceline";
const dossier = readFileSync(join(ROOT, "private", `${slug}.html`), "utf8");
let tpl = readFileSync(join(ROOT, "private", `${slug}-flow.tpl.html`), "utf8");

const style = dossier.match(/<style>[\s\S]*?<\/style>/)[0];
const sprite = dossier.match(/<svg width="0" height="0"[\s\S]*?\n<\/svg>/)[0];
const screens = [...dossier.matchAll(/<div class="device"><div class="screen">[\s\S]*?<\/div><\/div>(?=\s*<figcaption)/g)].map((m) => m[0]);
const browser = dossier.match(/<div class="browser[^"]*">[\s\S]*?(?=\n\s*<p class="[a-z]+-small" style="margin-top:12px">)/)[0].replace(/ reveal/, "");

// Dossier screen order: welcome, drive, over, overlay, map, report, summary, notice check.
const names = ["WELCOME", "DRIVE", "OVER", "OVERLAY", "MAP", "REPORT", "SUMMARY", "NOTICE"];
if (screens.length < names.length) throw new Error(`expected ${names.length} screens, found ${screens.length}`);
tpl = tpl.replace("{{STYLE}}", style).replace("{{SPRITE}}", sprite).replace("{{FLEET}}", browser);
names.forEach((n, i) => { tpl = tpl.replace(`{{S_${n}}}`, screens[i]); });
const left = tpl.match(/\{\{[A-Z_]+\}\}/g);
if (left) throw new Error(`unfilled placeholders: ${left.join(", ")}`);
writeFileSync(join(ROOT, "private", `${slug}-flow.html`), tpl);
console.log(`built private/${slug}-flow.html (${screens.length} screens reused)`);
