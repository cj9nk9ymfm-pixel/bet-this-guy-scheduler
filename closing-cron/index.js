// Closing-line capture on Cloudflare's cron, which fires on time; GitHub's
// schedule can run 5-10 minutes late. Publishing and grading stay on GitHub.
const ENDPOINT = "https://betthisguy.com/api/maintenance?job=closing";

// Same UTC windows as .github/workflows/btg-maintenance.yml.
export function activeWindow(date) {
  const weekday = (date.getUTCDay() + 6) % 7, hour = date.getUTCHours();
  return (
    (weekday === 2 && hour >= 12)
    || weekday === 3
    || (weekday === 4 && hour < 8)
    || (weekday === 5 && hour >= 12)
    || weekday === 6 || weekday === 0
    || (weekday === 1 && hour < 8)
  );
}

export async function captureClosing(env, fetchImpl = fetch, wait = ms => new Promise(r => setTimeout(r, ms))) {
  const token = env.MAINTENANCE_TOKEN || "";
  if (token.length < 32) throw new Error("MAINTENANCE_TOKEN must be configured");
  let lastError = "unknown error";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetchImpl(ENDPOINT, {
        method: "POST",
        redirect: "manual",
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/json",
          "User-Agent": "BetThisGuy-Maintenance/1.0",
        },
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const result = await response.json();
      if (result.success !== true) throw new Error("Job did not complete");
      console.log("closing: completed");
      return;
    } catch (error) {
      lastError = error.message || error.name;
      console.log("closing: " + lastError);
      if (attempt === 0) await wait(10_000);
    }
  }
  throw new Error("Closing-line capture failed: " + lastError);
}

export default {
  async scheduled(controller, env) {
    const now = new Date(controller.scheduledTime);
    if (!activeWindow(now)) {
      console.log("quiet period: no provider calls needed");
      return;
    }
    await captureClosing(env);
  },
};
