#!/usr/bin/env node
/**
 * Accessibility and viewport checks against a running Daythread, in a real browser.
 *
 *   node scripts/qa/a11y.mjs --base http://localhost:3100 [--token <session>] [--onboarding-token <session>]
 *                            [--booking <id>] [--conversation <id>] [--client <id>]
 *                            [--routes routes.json] [--out qa-report.json]
 *
 * For every route: axe-core (WCAG 2.0/2.1/2.2 A and AA rules) at a phone and a desktop width,
 * and at every width in VIEWPORTS: horizontal overflow of the page, clipped text inside
 * fixed-width controls, and tap targets under 24px (WCAG 2.2 target size minimum). Pages
 * are loaded with prefers-reduced-motion on, so scroll-linked scenes show their resting,
 * fully readable state.
 *
 * Exit code 1 when any page has a serious or critical axe violation or overflows at any
 * width, so it can gate a deploy. Needs Google Chrome (CHROME to override the path). Signed-in
 * routes need a session token; pass none and those routes are skipped, not faked.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "1"]] : acc), [])
);
const BASE = args.base ?? "http://localhost:3000";
const TOKEN = args.token ?? process.env.QA_SESSION_TOKEN ?? null;
const ONBOARDING_TOKEN = args["onboarding-token"] ?? process.env.QA_ONBOARDING_TOKEN ?? null;
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VIEWPORTS = [320, 375, 390, 768, 1280, 1440];
const AXE_AT = [375, 1280];

const DEFAULT_ROUTES = [
  { name: "landing", path: "/" },
  { name: "signup", path: "/start" },
  { name: "login", path: "/login" },
  { name: "booking form", path: "/book/alex-photo" },
  { name: "onboarding", path: "/onboarding", auth: "onboarding" },
  { name: "today", path: "/dashboard", auth: "app" },
  { name: "inbox", path: "/dashboard/inbox", auth: "app" },
  { name: "calendar", path: "/dashboard/calendar", auth: "app" },
  { name: "bookings", path: "/dashboard/bookings", auth: "app" },
  { name: "people", path: "/dashboard/clients", auth: "app" },
  { name: "settings", path: "/dashboard/settings?tab=business", auth: "app" },
  { name: "integrations", path: "/dashboard/settings?tab=channels", auth: "app" },
];
// Detail pages need a real id from the deployment under test: pass them, or they are skipped.
if (args.booking) DEFAULT_ROUTES.push({ name: "booking detail", path: `/dashboard/bookings/${args.booking}`, auth: "app" });
if (args.conversation) DEFAULT_ROUTES.push({ name: "thread", path: `/dashboard/inbox?c=${args.conversation}`, auth: "app" });
if (args.client) DEFAULT_ROUTES.push({ name: "person", path: `/dashboard/clients/${args.client}`, auth: "app" });
const routes = args.routes ? JSON.parse(readFileSync(args.routes, "utf8")) : DEFAULT_ROUTES;
const axeSource = readFileSync(path.join(process.cwd(), "node_modules/axe-core/axe.min.js"), "utf8");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9700 + Math.floor(Math.random() * 200);
const profile = mkdtempSync(path.join(tmpdir(), "daythread-a11y-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const cleanup = () => { try { chrome.kill("SIGKILL"); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on("exit", cleanup);

let target;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {}
}
if (!target) { console.error("Chrome did not start (set CHROME to its path)."); process.exit(2); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let seq = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++seq;
  const t = setTimeout(() => { pending.delete(id); resolve({ timedOut: true }); }, 30000);
  pending.set(id, (m) => { clearTimeout(t); resolve(m); });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
const host = new URL(BASE).hostname;

async function useSession(token) {
  await send("Network.clearBrowserCookies");
  if (token) await send("Network.setCookie", { name: "lf_session", value: token, domain: host, path: "/", httpOnly: true });
}

async function load(url, width) {
  await send("Emulation.setDeviceMetricsOverride", { width, height: width < 768 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 768 });
  await send("Page.navigate", { url });
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    if ((await evaluate("document.readyState")) === "complete") break;
  }
  await sleep(1200);
}

const LAYOUT_PROBE = `(() => {
  const vw = innerWidth;
  const overflow = document.documentElement.scrollWidth > vw + 1;
  const offenders = overflow ? [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > vw + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('[aria-hidden="true"]'); }).slice(0, 5).map((e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + '.' + String(e.className).split(' ').slice(0, 2).join('.')) : [];
  const controls = [...document.querySelectorAll('a[href], button, [role=button], input:not([type=hidden]), select, textarea')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[aria-hidden="true"]'); });
  const hitArea = (e) => {
    // What a finger actually lands on: the label a checkbox sits in, the row a stretched link covers.
    const label = e.matches('input') ? e.closest('label') : null;
    if (label) return label.getBoundingClientRect();
    if (getComputedStyle(e, '::after').position === 'absolute' && e.parentElement) return (e.closest('li, [class*="relative"]') ?? e.parentElement).getBoundingClientRect();
    return e.getBoundingClientRect();
  };
  const visuallyHidden = (e) => { const r = e.getBoundingClientRect(); return r.width <= 1 || r.height <= 1 || getComputedStyle(e).clip === 'rect(0px, 0px, 0px, 0px)'; };
  const small = controls.filter((e) => { if (visuallyHidden(e)) return false; const r = hitArea(e); if (r.width >= 24 && r.height >= 24) return false; const inline = e.tagName === 'A' && getComputedStyle(e).display === 'inline'; return !inline; }).slice(0, 8).map((e) => (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 40));
  const clipped = controls.filter((e) => !visuallyHidden(e) && !e.matches('input, select, textarea') && e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible' && !/truncate|text-ellipsis/.test(String(e.className))).slice(0, 5).map((e) => (e.textContent || '').trim().slice(0, 40));
  return { overflow, scrollWidth: document.documentElement.scrollWidth, offenders, smallTargets: small, clipped, h1: document.querySelectorAll('h1').length, path: location.pathname };
})()`;

const report = [];
let failed = false;
for (const route of routes) {
  const token = route.auth === "app" ? TOKEN : route.auth === "onboarding" ? ONBOARDING_TOKEN : null;
  if (route.auth && !token) { report.push({ route: route.name, skipped: "no session token given" }); continue; }
  await useSession(token);
  const entry = { route: route.name, path: route.path, viewports: {}, axe: {} };
  for (const width of VIEWPORTS) {
    await load(BASE + route.path, width);
    const layout = await evaluate(LAYOUT_PROBE);
    if (layout?.path && route.auth && /^\/login/.test(layout.path)) { entry.redirectedToLogin = true; break; }
    entry.viewports[width] = layout;
    if (layout?.overflow) failed = true;
    if (AXE_AT.includes(width)) {
      await evaluate(`${JSON.stringify(axeSource)}.length && (window.eval(${JSON.stringify(axeSource)}), true)`);
      const result = await evaluate(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] }, resultTypes: ['violations'] }).then((r) => r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) })))`);
      entry.axe[width] = result ?? [{ id: "axe-did-not-run", impact: "serious", help: "axe did not return", nodes: 0, targets: [] }];
      if ((entry.axe[width] ?? []).some((v) => v.impact === "serious" || v.impact === "critical")) failed = true;
    }
  }
  report.push(entry);
  const axeCount = Object.values(entry.axe).flat().length;
  const overflowAt = Object.entries(entry.viewports).filter(([, v]) => v?.overflow).map(([w]) => w);
  console.log(`${route.name.padEnd(14)} axe violations: ${String(axeCount).padStart(2)}  overflow at: ${overflowAt.join(",") || "none"}${entry.redirectedToLogin ? "  (session rejected)" : ""}`);
  for (const [w, list] of Object.entries(entry.axe)) for (const v of list) console.log(`   ${w}px  [${v.impact}] ${v.id}: ${v.help} (${v.nodes}) ${v.targets.join(" | ")}`);
  const small = new Map();
  for (const [w, v] of Object.entries(entry.viewports)) for (const t of v?.smallTargets ?? []) small.set(t, [...(small.get(t) ?? []), w]);
  for (const [t, ws] of small) console.log(`   target under 24px: "${t}" at ${ws.join(",")}`);
  for (const [w, v] of Object.entries(entry.viewports)) for (const c of v?.clipped ?? []) console.log(`   ${w}px  text clipped inside a control: "${c}"`);
}

writeFileSync(args.out ?? "qa-a11y-report.json", JSON.stringify(report, null, 2));
ws.close();
cleanup();
process.exit(failed ? 1 : 0);
