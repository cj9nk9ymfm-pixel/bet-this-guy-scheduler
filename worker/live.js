// Real-time snapshots share the existing server-side credential and edge cache.
// No per-player stat requests are made until a visitor opens Current Game.
let playAccessRetryAt = 0;

async function liveSnapshot(request, name, ttl, fetcher, ctx) {
  const saved = await readFeedCache(request, name);
  if (saved.response && cacheAge(saved.response) < ttl) return saved.response.json();
  return (async () => {
    try {
      const result = { success: true, ...await fetcher(), updatedAt: new Date().toISOString(), stale: false };
      await saved.cache.put(saved.key, storedResponse(JSON.stringify(result), 3600));
      return result;
    } catch (error) {
      if (saved.response) return { ...await saved.response.clone().json(), stale: true };
      throw error;
    }
  })();
}

function nflGameState(game) {
  if (game.status_state) return game.status_state;
  const text = String(game.status || "");
  if (/final|completed/i.test(text)) return "final";
  if (/postponed/i.test(text)) return "postponed";
  if (/cancel/i.test(text)) return "canceled";
  if (/suspend/i.test(text)) return "suspended";
  if (/delay/i.test(text)) return "delayed";
  if (/halftime|in progress|quarter|q[1-4]|[1-4](st|nd|rd|th)|overtime|\bOT\b/i.test(text)) return "in_progress";
  return "scheduled";
}

function reportedGameClock(game) {
  const status = String(game.status || "");
  const match = status.match(/\b(?:Q([1-4])|([1-4])(?:st|nd|rd|th)(?:\s+quarter)?)\b/i);
  const period = Number(game.period) || (match ? Number(match[1] || match[2]) : /overtime|\bOT\b/i.test(status) ? 5 : null);
  const clock = String(game.clock_display || status.match(/\b\d{1,2}:\d{2}\b/)?.[0] || "");
  return { period, clock: /^\d{1,2}:\d{2}$/.test(clock) ? clock : null, halftime: /half\s*time/i.test(status) };
}

async function latestPlayClock(request, game, env, ctx) {
  if (Date.now() < playAccessRetryAt) return null;
  const name = `nfl-play-clock-v1-${game.id}`, saved = await readFeedCache(request, name);
  let previous = saved.response ? await saved.response.json() : null;
  if (saved.response && cacheAge(saved.response) < 10000) return previous;
  try {
    let cursor = previous?.cursor || null, latest = previous?.latest || null;
    const visited = new Set();
    for (let page = 0; page < 6; page++) {
      const query = new URLSearchParams({ game_id: String(game.id), per_page: "100" });
      if (cursor) query.set("cursor", String(cursor));
      const payload = await bdlRequest(`/nfl/v1/plays?${query}`, env.BALLDONTLIE_API_KEY);
      for (const play of payload.data || []) {
        if (String(play.game?.id) !== String(game.id) || !play.period) continue;
        latest = { period: play.period, clock: play.clock_display || null, wallclock: play.wallclock || null };
      }
      const next = payload.meta?.next_cursor;
      if (!next || visited.has(next)) {
        // Re-read the last page on the next tick to pick up appended plays.
        const result = { latest, cursor, checkedAt: new Date().toISOString() };
        await saved.cache.put(saved.key, storedResponse(JSON.stringify(result), 21600));
        return result;
      }
      visited.add(next); cursor = next;
    }
    return null; // Never mistake an early page of plays for the current clock.
  } catch (error) {
    if ([401, 403].includes(error.status)) playAccessRetryAt = Date.now() + 1800000;
    return null;
  }
}

async function liveGames(request, env, ctx) {
  if (!env.BALLDONTLIE_API_KEY) return json({ success: false, error: "Live scores are not connected yet." }, 503);
  try {
    const result = await liveSnapshot(request, "nfl-live-games-v1", 8000, async () => {
      const query = new URLSearchParams({ per_page: "100" });
      // Include both sides of midnight for visitors in any time zone.
      for (const offset of [-1, 0, 1]) query.append("dates[]", new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10));
      query.append("season_types[]", "2"); query.append("season_types[]", "3");
      const payload = await bdlRequest(`/nfl/v1/games?${query}`, env.BALLDONTLIE_API_KEY);
      const games = (payload.data || []).map(game => ({
        id: game.id, startsAt: game.date, away: game.visitor_team, home: game.home_team,
        awayScore: game.visitor_team_score ?? null, homeScore: game.home_team_score ?? null,
        state: nflGameState(game), status: game.status || "", ...reportedGameClock(game),
      }));
      // Most feeds include quarter/clock in status. Plays supply it when available.
      const missing = games.filter(game => game.state === "in_progress" && !game.halftime && (!game.period || !game.clock));
      await Promise.all(missing.map(async game => {
        const saved = await readFeedCache(request, `nfl-play-clock-v1-${game.id}`);
        const play = saved.response && cacheAge(saved.response) < 10000 ? (await saved.response.json()).latest : null;
        if (play) { game.period = play.period; game.clock = play.clock; game.clockSource = "last_play"; game.clockAt = play.wallclock; }
      }));
      // Play history must never delay the score response or initial board.
      ctx.waitUntil((async () => {
        for (let i = 0; i < missing.length; i += 3) await Promise.all(missing.slice(i, i + 3).map(game => latestPlayClock(request, game, env, ctx)));
      })());
      return { games, provider: "BALLDONTLIE" };
    }, ctx);
    return json(result);
  } catch (error) {
    return json({ success: false, error: [401, 403].includes(error.status) ? "The live score connection is unavailable." : "Live scores are temporarily unavailable. Retrying shortly." }, 503);
  }
}

async function livePlayer(request, env, ctx) {
  if (!env.BALLDONTLIE_API_KEY) return json({ success: false, error: "Live player stats are not connected yet." }, 503);
  const query = new URL(request.url).searchParams, gameID = query.get("game_id"), playerID = query.get("player_id");
  if (!/^[1-9]\d{0,11}$/.test(gameID || "") || !/^[1-9]\d{0,11}$/.test(playerID || "")) return json({ success: false, error: "Choose a valid game and player." }, 400);
  try {
    // One box score per game is shared by every player profile and visitor.
    const result = await fetchLiveBoxScore(request, gameID, env, ctx);
    return json({ success: true, gameID: Number(gameID), playerID: Number(playerID), stat: result.stats.find(row => String(row.player?.id) === playerID) || null, updatedAt: result.updatedAt, stale: result.stale, provider: "BALLDONTLIE" });
  } catch (error) {
    return json({ success: false, error: error.status === 403 ? "Live player stats are not included in the connected stats plan." : "Current-game stats are temporarily unavailable. Retrying shortly." }, 503);
  }
}

async function fetchLiveBoxScore(request, gameID, env, ctx) {
  return liveSnapshot(request, `nfl-live-boxscore-v2-${gameID}`, 6000, async () => {
    const stats = [], visited = new Set();
    let cursor = null;
    for (let page = 0; page < 4; page++) {
      const params = new URLSearchParams({ per_page: "100", "game_ids[]": gameID });
      params.append("season_types[]", "2"); params.append("season_types[]", "3");
      if (cursor) params.set("cursor", String(cursor));
      const payload = await bdlRequest(`/nfl/v1/stats?${params}`, env.BALLDONTLIE_API_KEY);
      stats.push(...(payload.data || []).filter(row => String(row.game?.id) === gameID));
      cursor = payload.meta?.next_cursor;
      if (!cursor || visited.has(cursor)) return { stats };
      visited.add(cursor);
    }
    throw new Error("Incomplete box score");
  }, ctx);
}

async function liveGameStats(request, env, ctx) {
  if (!env.BALLDONTLIE_API_KEY) return json({ success: false, error: "Live player stats are not connected yet." }, 503);
  const gameID = new URL(request.url).searchParams.get("game_id");
  if (!/^[1-9]\d{0,11}$/.test(gameID || "")) return json({ success: false, error: "Choose a valid game." }, 400);
  try {
    const result = await fetchLiveBoxScore(request, gameID, env, ctx);
    return json({ success: true, gameID: Number(gameID), stats: result.stats, updatedAt: result.updatedAt, stale: result.stale, provider: "BALLDONTLIE" });
  } catch (error) {
    return json({ success: false, error: error.status === 403 ? "Live player stats are not included in the connected stats plan." : "Live player stats are temporarily unavailable. Retrying shortly." }, 503);
  }
}
