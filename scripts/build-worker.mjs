import { mkdir, readFile, writeFile } from "node:fs/promises";

const files = await Promise.all([
  readFile("dist/index.html", "utf8"),
  readFile("dist/landing.html", "utf8"),
  readFile("dist/landing.css", "utf8"),
  readFile("dist/legal.html", "utf8"),
  readFile("dist/trust.html", "utf8"),
  readFile("dist/app.js", "utf8"),
  readFile("dist/styles.css", "utf8"),
  readFile("dist/theme-blue.css", "utf8"),
  readFile("dist/nfl.css", "utf8"),
  readFile("dist/performance.css", "utf8"),
  readFile("dist/bet-this-guy-logo-v3.png"),
  readFile("worker/index.template.js", "utf8"),
  readFile("dist/live.js", "utf8"),
  readFile("dist/live.css", "utf8"),
  readFile("worker/live.js", "utf8"),
  readFile("dist/auth.js", "utf8"),
  readFile("dist/auth.css", "utf8"),
  readFile("node_modules/@supabase/supabase-js/dist/umd/supabase.js", "utf8"),
]);

const [html, landing, landingCss, legal, trust, app, styles, theme, nfl, performance, logo, template, live, liveCss, liveServer, authClient, authCss, supabaseClient] = files;
const stats = await readFile("dist/stats.js", "utf8");
const records = await readFile("worker/records.js", "utf8");
const accounts = await readFile("worker/accounts.js", "utf8");
const movement = await readFile("dist/movement.js", "utf8");
const movementServer = await readFile("worker/movement.js", "utf8");
const output = template
  .replaceAll("__SUPABASE_CLIENT__", () => JSON.stringify(supabaseClient))
  .replaceAll("__AUTH_CLIENT__", () => JSON.stringify(authClient))
  .replaceAll("__AUTH_CSS__", () => JSON.stringify(authCss))
  .replaceAll("__ACCOUNTS_SERVER__", () => accounts)
  .replaceAll("__MOVEMENT_SERVER__", () => movementServer)
  .replaceAll("__MOVEMENT_PAYLOAD__", () => JSON.stringify(movement))
  .replaceAll("__RECORDS_SERVER__", () => records)
  .replaceAll("__STATS_SHARED__", () => stats)
  .replaceAll("__STATS_PAYLOAD__", () => JSON.stringify(stats))
  .replaceAll("__LIVE_SERVER__", () => liveServer)
  .replaceAll("__LIVE_CLIENT__", () => JSON.stringify(live))
  .replaceAll("__LIVE_CSS__", () => JSON.stringify(liveCss))
  .replaceAll("__HTML_PAYLOAD__", () => JSON.stringify(html))
  .replaceAll("__LANDING_PAYLOAD__", () => JSON.stringify(landing))
  .replaceAll("__LANDING_CSS_PAYLOAD__", () => JSON.stringify(landingCss))
  .replaceAll("__LEGAL_PAYLOAD__", () => JSON.stringify(legal))
  .replaceAll("__TRUST_PAYLOAD__", () => JSON.stringify(trust))
  .replaceAll("__APP_PAYLOAD__", () => JSON.stringify(app))
  .replaceAll("__STYLES_PAYLOAD__", () => JSON.stringify(styles))
  .replaceAll("__THEME_PAYLOAD__", () => JSON.stringify(theme))
  .replaceAll("__NFL_PAYLOAD__", () => JSON.stringify(nfl))
  .replaceAll("__PERFORMANCE_PAYLOAD__", () => JSON.stringify(performance))
  .replaceAll("__LOGO_PAYLOAD__", () => JSON.stringify(logo.toString("base64")));

await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
await writeFile("dist/server/index.js", output);
await writeFile("dist/.openai/hosting.json", await readFile(".openai/hosting.json"));
