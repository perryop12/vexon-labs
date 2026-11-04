#!/usr/bin/env node
// Assembles a project's screen-flow page from its dossier: private/<slug>-flow.tpl.html gets the
// dossier's styles, icon sprite and existing screens spliced in, and is written to
// private/<slug>-flow.html (gitignored). build-private.mjs then encrypts it.
//
//   node scripts/build-flow.mjs paceline   (or mirra, stratus, onefold, guapp)
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
// Every browser mock-up in the dossier, each cut out as one balanced <div class="browser…"> element.
function balancedDiv(html, start) {
  const re = /<\/?div\b[^>]*>/g;
  re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(html))) {
    depth += m[0][1] === "/" ? -1 : 1;
    if (depth === 0) return html.slice(start, re.lastIndex);
  }
  throw new Error("unbalanced <div> in dossier");
}
const browsers = [...dossier.matchAll(/<div class="browser[^"]*">/g)].map((m) => balancedDiv(dossier, m.index).replace(/ reveal/, ""));

// Placeholder name for each dossier screen, in the order the dossier shows them.
const SCREENS = {
  paceline: ["WELCOME", "DRIVE", "OVER", "OVERLAY", "MAP", "REPORT", "SUMMARY", "NOTICE"],
  mirra: ["WELCOME", "TWIN", "PRODUCT", "FIT", "HOME", "AUCTION", "RUNWAY", "CAPTURE"],
  stratus: ["ONBOARD", "HOME", "DRILL", "MOMENT", "CHAT", "CHECK", "PATH", "FAMILY"],
  onefold: ["WELCOME", "TODAY", "DEVOTION", "PREP", "ROTA", "GIVE", "CARE", "LEDGER"],
  guapp: ["WELCOME", "VERIFYUS", "CARD", "LIVENESS", "HOME", "DISCOVER", "STOCK", "REVIEW", "DEPOSIT", "RECURRING", "WITHDRAW", "ACTIVITY", "WAITLIST", "TOGETHER", "COMPOUND", "GOLD", "SEND"],
};
const names = SCREENS[slug];
if (!names) throw new Error(`no screen list for ${slug}`);
if (screens.length < names.length) throw new Error(`expected ${names.length} screens, found ${screens.length}`);
tpl = tpl.replace("{{STYLE}}", style).replace("{{SPRITE}}", sprite).replace("{{FLEET}}", browsers[0]).replace("{{WEB}}", browsers[0]).replace("{{WEB2}}", browsers[1] || "");
names.forEach((n, i) => { tpl = tpl.replace(`{{S_${n}}}`, screens[i]); });
const left = tpl.match(/\{\{[A-Z_]+\}\}/g);
if (left) throw new Error(`unfilled placeholders: ${left.join(", ")}`);
writeFileSync(join(ROOT, "private", `${slug}-flow.html`), tpl);
console.log(`built private/${slug}-flow.html (${screens.length} screens reused)`);
