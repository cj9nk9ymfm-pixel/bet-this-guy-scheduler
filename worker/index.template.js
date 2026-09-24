const STATIC = {
  "/": ["text/html; charset=utf-8", __HTML_PAYLOAD__],
  "/index.html": ["text/html; charset=utf-8", __HTML_PAYLOAD__],
  "/app": ["text/html; charset=utf-8", __HTML_PAYLOAD__],
  "/about": ["text/html; charset=utf-8", __LANDING_PAYLOAD__],
  "/landing.css": ["text/css; charset=utf-8", __LANDING_CSS_PAYLOAD__],
  "/legal": ["text/html; charset=utf-8", __LEGAL_PAYLOAD__],
  "/trust": ["text/html; charset=utf-8", __TRUST_PAYLOAD__],
  "/app.js": ["text/javascript; charset=utf-8", __APP_PAYLOAD__],
  "/stats.js": ["text/javascript; charset=utf-8", __STATS_PAYLOAD__],
  "/movement.js": ["text/javascript; charset=utf-8", __MOVEMENT_PAYLOAD__],
  "/live.js": ["text/javascript; charset=utf-8", __LIVE_CLIENT__],
  "/live.css": ["text/css; charset=utf-8", __LIVE_CSS__],
  "/auth.css": ["text/css; charset=utf-8", __AUTH_CSS__],
  "/auth.js": ["text/javascript; charset=utf-8", __AUTH_CLIENT__],
  "/supabase.js": ["text/javascript; charset=utf-8", __SUPABASE_CLIENT__],
  "/styles.css": ["text/css; charset=utf-8", __STYLES_PAYLOAD__],
  "/theme-blue.css": ["text/css; charset=utf-8", __THEME_PAYLOAD__],
  "/nfl.css": ["text/css; charset=utf-8", __NFL_PAYLOAD__],
  "/performance.css": ["text/css; charset=utf-8", __PERFORMANCE_PAYLOAD__],
};
const LOGO = __LOGO_PAYLOAD__;
const API_BASE = "https://api.the-odds-api.com/v4";
const BDL_BASE = "https://api.balldontlie.io";
const BDL_SPORTS = {
  NFL: { slug: "nfl", stats: "/nfl/v1/stats" },
  NCAAF: { slug: "ncaaf", stats: "/ncaaf/v1/player_stats" },
  MLB: { slug: "mlb", stats: "/mlb/v1/stats" },
  NBA: { slug: "nba", stats: "/nba/v1/stats" },
  NCAAB: { slug: "ncaab", stats: "/ncaab/v1/player_stats" },
  NHL: { slug: "nhl", stats: null },
};
const SPORTS = [
  { key: "americanfootball_nfl", label: "NFL", markets: ["player_anytime_td", "player_1st_td", "player_last_td", "player_tds", "player_tds_over", "player_assists", "player_pass_yds", "player_pass_yds_q1", "player_pass_tds", "player_pass_completions", "player_pass_attempts", "player_pass_interceptions", "player_pass_longest_completion", "player_pass_rush_yds", "player_pass_rush_reception_tds", "player_pass_rush_reception_yds", "player_rush_yds", "player_rush_attempts", "player_rush_longest", "player_rush_tds", "player_receptions", "player_reception_yds", "player_reception_longest", "player_reception_tds", "player_rush_reception_yds", "player_rush_reception_tds", "player_kicking_points", "player_field_goals", "player_pats", "player_sacks", "player_solo_tackles", "player_tackles_assists", "player_defensive_interceptions"], expandedMarkets: ["player_assists_alternate", "player_field_goals_alternate", "player_kicking_points_alternate", "player_pass_attempts_alternate", "player_pass_completions_alternate", "player_pass_interceptions_alternate", "player_pass_longest_completion_alternate", "player_pass_rush_yds_alternate", "player_pass_rush_reception_tds_alternate", "player_pass_rush_reception_yds_alternate", "player_pass_tds_alternate", "player_pass_yds_alternate", "player_pats_alternate", "player_receptions_alternate", "player_reception_longest_alternate", "player_reception_tds_alternate", "player_reception_yds_alternate", "player_rush_attempts_alternate", "player_rush_longest_alternate", "player_rush_reception_tds_alternate", "player_rush_reception_yds_alternate", "player_rush_tds_alternate", "player_rush_yds_alternate", "player_sacks_alternate", "player_solo_tackles_alternate", "player_tackles_assists_alternate"] },
];
const SPORTS_BY_LABEL = Object.fromEntries(SPORTS.map(sport => [sport.label, sport]));
const runtimeFeedCache = new Map();

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
}

function cacheKey(request, name) {
  const url = new URL(request.url);
  url.pathname = `/__feed-cache/${name}`;
  url.search = "";
  return new Request(url.toString(), { method: "GET" });
}

function cachedForClient(response, state) {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "private, max-age=60");
  headers.set("x-feed-cache", state);
  return new Response(response.clone().body, { status: response.status, headers });
}

function cacheAge(response) {
  const storedAt = Date.parse(response?.headers.get("x-cache-stored") || "");
  return Number.isFinite(storedAt) ? Date.now() - storedAt : Infinity;
}

async function readFeedCache(request, name) {
  const key = cacheKey(request, name);
  let edgeCache = null;
  // Cloudflare response streams belong to the request that created them.
  // Persist bytes/headers, never a live Response, across isolate requests.
  const memory = runtimeFeedCache.get(name);
  let response = memory ? new Response(memory.body,{status:memory.status,headers:memory.headers}) : null;
  try {
    edgeCache = globalThis.caches?.default || null;
    const edgeResponse = edgeCache ? await edgeCache.match(key) : null;
    if (edgeResponse) response = edgeResponse;
  } catch {
    edgeCache = null;
  }
  const cache = {
    async put(_key, value) {
      runtimeFeedCache.set(name, {body:await value.clone().text(),status:value.status,headers:[...value.headers]});
      if(runtimeFeedCache.size>32)runtimeFeedCache.delete(runtimeFeedCache.keys().next().value);
      if (edgeCache) {
        try { await edgeCache.put(key, value.clone()); } catch {}
      }
    },
  };
  return { cache, key, response };
}

function storedResponse(body, maxAgeSeconds) {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${maxAgeSeconds}`,
      "x-cache-stored": new Date().toISOString(),
    },
  });
}

function providerMessage(body, fallback) {
  try { return JSON.parse(body)?.message || fallback; } catch { return fallback; }
}

async function fetchSportEvents(sport, apiKey) {
  const query = new URLSearchParams({ apiKey, dateFormat: "iso" });
  const response = await fetch(`${API_BASE}/sports/${sport.key}/events?${query}`, { headers: { accept: "application/json" } });
  const body = await response.text();
  if (!response.ok) throw new Error(providerMessage(body, `${sport.label} schedule is unavailable.`));
  const events = JSON.parse(body);
  return (Array.isArray(events) ? events : []).map(event => ({ ...event, sport_label: sport.label }));
}

async function fetchEventOdds(sport, eventId, apiKey, expanded = false) {
  const query = new URLSearchParams({
    apiKey,
    regions: "us",
    markets: [...sport.markets, ...(expanded ? sport.expandedMarkets || [] : [])].join(","),
    oddsFormat: "american",
    dateFormat: "iso",
  });
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${API_BASE}/sports/${sport.key}/events/${eventId}/odds?${query}`, { headers: { accept: "application/json" } });
    const body = await response.text();
    if (response.ok) return { ...JSON.parse(body), sport_label: sport.label, eventID: `${sport.label}--${eventId}` };
    const error = new Error(providerMessage(body, `Props are not available for this ${sport.label} game.`));
    error.status = response.status;
    lastError = error;
    if (response.status !== 429 && response.status < 500) break;
    await new Promise(resolve => setTimeout(resolve, 180 * (attempt + 1)));
  }
  throw lastError;
}

function scheduleRecord(event) {
  return {
    eventID: `${event.sport_label}--${event.id}`,
    leagueID: event.sport_label,
    sportID: event.sport_key,
    teams: {
      away: { names: { short: event.away_team, medium: event.away_team } },
      home: { names: { short: event.home_team, medium: event.home_team } },
    },
    status: { startsAt: event.commence_time, live: Date.parse(event.commence_time) <= Date.now() },
  };
}

async function allUpcomingEvents(apiKey) {
  const results = await Promise.allSettled(SPORTS.map(sport => fetchSportEvents(sport, apiKey)));
  const events = results.flatMap(result => result.status === "fulfilled" ? result.value : []);
  const errors = results.filter(result => result.status === "rejected").map(result => result.reason?.message).filter(Boolean);
  return { events, errors };
}

async function liveProps(request, env, ctx) {
  if (!env.THE_ODDS_API_KEY) return json({ success: false, error: "Live feed is not configured." }, 503);
  const saved = await readFeedCache(request, "the-odds-api-live-props-nfl-v10");
  if (saved.response && cacheAge(saved.response) < 10 * 60 * 1000) return cachedForClient(saved.response, "fresh");
  try {
    const now = Date.now();
    const { events, errors: scheduleErrors } = await allUpcomingEvents(env.THE_ODDS_API_KEY);
    const slate = SPORTS.flatMap(sport => events
      .filter(event => {
        const starts = Date.parse(event.commence_time);
        return event.sport_label === sport.label && Number.isFinite(starts) && starts >= now - 4 * 60 * 60 * 1000 && starts <= now + 7 * 24 * 60 * 60 * 1000;
      })
      .sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time)));
    // Keep the opening request comfortably below the Worker memory ceiling.
    // The complete schedule is still returned by /api/schedule, and the client
    // loads any remaining game's full board through /api/event when selected or
    // when the parlay pool is expanded.
    const openingSlate = slate.slice(0, 6);
    const boards = [];
    for (let index = 0; index < openingSlate.length; index += 3) {
      boards.push(...await Promise.allSettled(openingSlate.slice(index, index + 3).map(event => fetchEventOdds(SPORTS_BY_LABEL[event.sport_label], event.id, env.THE_ODDS_API_KEY))));
    }
    let data = boards.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
    const propErrors = boards.filter(result => result.status === "rejected").map(result => result.reason?.message).filter(Boolean);
    if (saved.response && propErrors.length) {
      try {
        const previous = await saved.response.clone().json();
        const currentIDs = new Set(data.map(event => event.eventID));
        const stillScheduled = new Set(slate.map(event => `${event.sport_label}--${event.id}`));
        data = [...data, ...(previous.data || []).filter(event => stillScheduled.has(event.eventID) && !currentIDs.has(event.eventID))];
      } catch {}
    }
    if (!data.length && (scheduleErrors.length || propErrors.length)) {
      if (saved.response) return cachedForClient(saved.response, "stale");
      return json({ success: false, error: propErrors[0] || scheduleErrors[0] || "Current props are unavailable." }, 502);
    }
    const coverage = { scheduledGames: slate.length, loadedGames: data.length, failedGames: propErrors.length, complete: data.length >= slate.length && !scheduleErrors.length };
    if(env.DB)ctx.waitUntil(Promise.all(data.map(event=>saveMovementSnapshot(event,env))).catch(()=>{}));
    const body = JSON.stringify({ success: true, data, updatedAt: new Date().toISOString(), partial: scheduleErrors.length + propErrors.length + Math.max(0, slate.length - openingSlate.length), coverage });
    const stored = storedResponse(body, 6 * 60 * 60);
    stored.headers.set("x-feed-updated", new Date().toISOString());
    if (saved.cache && saved.key) ctx.waitUntil(saved.cache.put(saved.key, stored.clone()));
    return cachedForClient(stored, "miss");
  } catch (error) {
    if (saved.response) return cachedForClient(saved.response, "stale");
    return json({ success: false, error: error?.message || "The live odds service is temporarily unavailable." }, 502);
  }
}

async function futureSchedule(request, env, ctx) {
  if (!env.THE_ODDS_API_KEY) return json({ success: false, error: "Live feed is not configured." }, 503);
  const saved = await readFeedCache(request, "the-odds-api-future-schedule-v1");
  if (saved.response && cacheAge(saved.response) < 6 * 60 * 60 * 1000) return cachedForClient(saved.response, "fresh");
  try {
    const { events, errors } = await allUpcomingEvents(env.THE_ODDS_API_KEY);
    const data = events.filter(event => Date.parse(event.commence_time) > Date.now() - 4 * 60 * 60 * 1000).map(scheduleRecord);
    if (!data.length && errors.length) throw new Error(errors[0]);
    const stored = storedResponse(JSON.stringify({ success: true, data, updatedAt: new Date().toISOString(), partial: errors.length }), 7 * 24 * 60 * 60);
    if (saved.cache && saved.key) ctx.waitUntil(saved.cache.put(saved.key, stored.clone()));
    return cachedForClient(stored, "miss");
  } catch (error) {
    if (saved.response) return cachedForClient(saved.response, "stale");
    return json({ success: false, error: error?.message || "Future schedules are temporarily unavailable." }, 502);
  }
}

// Provider-cost guards. Real visitors request games from the site's own schedule,
// so a paid Odds API lookup for an unknown event ID is either a brand-new listing
// or abuse; those, and uncached player-stat lookups, are rate limited per visitor
// IP with Cloudflare's rate-limit bindings. Internal calls (the scheduler and
// shared movement on its own behalf) carry no visitor IP and are never limited.
async function allowProviderCall(request, limiter) {
  const visitor = request.headers.get("cf-connecting-ip") || "";
  if (!visitor || !limiter) return true;
  try { return (await limiter.limit({ key: visitor })).success; } catch { return true; }
}

async function scheduledEventIDs(request, env, ctx) {
  try {
    const response = await futureSchedule(new Request(new URL("/api/schedule", request.url)), env, ctx);
    if (!response.ok) return null;
    return new Set(((await response.json()).data || []).map(event => event.eventID));
  } catch {
    return null;
  }
}

// Only visitor requests on the deployed Worker (which has the limiter) pay for
// the schedule check; scheduled events are never limited.
async function allowEventLookup(request, env, ctx, eventID) {
  if (!request.headers.get("cf-connecting-ip") || !env.UNKNOWN_EVENT_LIMITER) return true;
  const known = await scheduledEventIDs(request, env, ctx);
  if (known?.has(eventID)) return true;
  return allowProviderCall(request, env.UNKNOWN_EVENT_LIMITER);
}

function tooManyRequests(saved) {
  if (saved?.response) return cachedForClient(saved.response, "stale");
  return json({ success: false, error: "Too many new lookups right now. Try again in a minute." }, 429, { "retry-after": "60" });
}

async function eventProps(request, env, ctx) {
  if (!env.THE_ODDS_API_KEY) return json({ success: false, error: "Live feed is not configured." }, 503);
  const eventID = new URL(request.url).searchParams.get("eventID") || "";
  const splitAt = eventID.indexOf("--");
  const label = eventID.slice(0, splitAt);
  const providerEventID = eventID.slice(splitAt + 2);
  const sport = SPORTS_BY_LABEL[label];
  if (!sport || !/^[A-Za-z0-9_-]{4,100}$/.test(providerEventID)) return json({ success: false, error: "Choose a valid future game." }, 400);
  const inPlay = new URL(request.url).searchParams.get("live") === "1";
  const movement = new URL(request.url).searchParams.get("movement") === "1";
  const saved = await readFeedCache(request, `the-odds-api-event-expanded-v3-${movement ? "movement-" : inPlay ? "live-" : ""}${eventID}`);
  if (saved.response && cacheAge(saved.response) < (inPlay || movement ? 60000 : 600000)) return cachedForClient(saved.response, "fresh");
  if (!await allowEventLookup(request, env, ctx, eventID)) return tooManyRequests(saved);
  try {
    const selectedSport = movement ? {...sport, markets:["player_pass_yds","player_rush_yds","player_reception_yds","player_receptions","player_pass_tds","player_anytime_td"],expandedMarkets:[]} : sport;
    const data = await fetchEventOdds(selectedSport, providerEventID, env.THE_ODDS_API_KEY, !movement);
    if(env.DB)ctx.waitUntil(saveMovementSnapshot(data,env).catch(()=>{}));
    // Books can suspend or remove in-play markets. Never resurrect the opening
    // board, or prices whose provider timestamp has stopped updating.
    if (inPlay) data.bookmakers = (data.bookmakers || []).map(book => ({ ...book, markets: (book.markets || []).filter(market => {
      const updated = Date.parse(market.last_update || book.last_update || "");
      return Number.isFinite(updated) && Date.now() - updated < 180000;
    }) })).filter(book => book.markets.length);
    const stored = storedResponse(JSON.stringify({ success: true, data: [data], updatedAt: new Date().toISOString() }), 60 * 60);
    if (saved.cache && saved.key) ctx.waitUntil(saved.cache.put(saved.key, stored.clone()));
    return cachedForClient(stored, "miss");
  } catch (error) {
    if (saved.response && !inPlay && !movement) return cachedForClient(saved.response, "stale");
    return json({ success: false, error: error?.message || "That game’s props are temporarily unavailable." }, error?.status === 429 ? 429 : 502);
  }
}

function normalizedName(value) {
  return String(value || "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/[^a-z0-9]/g, "");
}

function playerLabel(player) {
  return player?.full_name || [player?.first_name, player?.last_name].filter(Boolean).join(" ") || player?.name || "Player";
}

function playerTeamLabel(player) {
  const team = player?.team || {};
  return team.full_name || team.name || team.abbreviation || player?.team_name || "";
}

function selectPlayer(players, requestedName, teamHint) {
  const wanted = normalizedName(requestedName);
  const wantedTeam = normalizedName(teamHint);
  return players.filter(player => wanted && normalizedName(playerLabel(player)) === wanted).sort((a, b) => {
    const score = player => {
      const name = normalizedName(playerLabel(player));
      const team = normalizedName(playerTeamLabel(player));
      return (name === wanted ? 100 : name.includes(wanted) || wanted.includes(name) ? 60 : 0) + (wantedTeam && (wantedTeam.includes(team) || team.includes(wantedTeam)) ? 20 : 0);
    };
    return score(b) - score(a);
  })[0] || null;
}

async function bdlRequest(path, apiKey, signal) {
  const response = await fetch(`${BDL_BASE}${path}`, { headers: { accept: "application/json", Authorization: apiKey }, signal });
  const body = await response.text();
  if (!response.ok) {
    let provider = "";
    try { provider = JSON.parse(body)?.error || JSON.parse(body)?.message || ""; } catch {}
    const error = new Error(response.status === 429 ? "Player stats are busy. Try again in a moment." : response.status === 401 ? "The player-stats connection needs to be renewed." : response.status === 403 ? "Player stats for this sport are not included in the current plan." : provider || "Recent player stats are temporarily unavailable.");
    error.status = response.status;
    throw error;
  }
  return JSON.parse(body);
}

async function playerStats(request, env, ctx) {
  if (!env.BALLDONTLIE_API_KEY) return json({ success: false, error: "Player stats are not connected." }, 503);
  const url = new URL(request.url);
  const sportLabel = String(url.searchParams.get("sport") || "").toUpperCase();
  const name = String(url.searchParams.get("player") || "").trim();
  const team = String(url.searchParams.get("team") || "").trim();
  const config = BDL_SPORTS[sportLabel];
  if (!config || !/^[\p{L}\p{M}][\p{L}\p{M} .'’-]{1,89}$/u.test(name) || team.length > 60) return json({ success: false, error: "Choose a valid player." }, 400);
  if (/\b(d\/st|defense|defensive unit|no scorer)\b/i.test(name)) return json({ success: false, error: "Team and no-scorer markets do not have player game logs." }, 404);
  const saved = await readFeedCache(request, `player-stats-v4-completed-${sportLabel}-${normalizedName(name)}-${normalizedName(team)}`);
  if (saved.response && cacheAge(saved.response) < 24 * 60 * 60 * 1000) return cachedForClient(saved.response, "fresh");
  if (!await allowProviderCall(request, env.PLAYER_STATS_LIMITER)) return tooManyRequests(saved);
  try {
    // BALLDONTLIE's `search` filter matches within either the first-name or
    // last-name field, so a full display name can legitimately return no rows.
    // Search on the surname and use selectPlayer() to resolve the full name.
    const nameParts = name.replace(/\b(Jr\.?|Sr\.?|II|III|IV)\b/gi, "").trim().split(/\s+/).filter(Boolean);
    const search = new URLSearchParams({ search: nameParts.at(-1) || name, per_page: "25" });
    const playerPayload = await bdlRequest(`/${config.slug}/v1/players?${search}`, env.BALLDONTLIE_API_KEY);
    const player = selectPlayer(Array.isArray(playerPayload?.data) ? playerPayload.data : [], name, team);
    if (!player) return json({ success: false, error: "This player could not be matched to the stats feed yet." }, 404);
    let statPayload;
    if (config.stats) {
      // One compact page is enough for grading the most recent completed game.
      // Pulling six 100-row pages per player can exceed the Worker CPU budget
      // when the public record dashboard refreshes.
      const query = new URLSearchParams({ per_page: "50" });
      query.append("player_ids[]", String(player.id));
      if (sportLabel === "NFL") {
        query.append("season_types[]", "2");
        query.append("season_types[]", "3");
        const now = new Date();
        const season = now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
        query.append("seasons[]", String(season));
        query.append("seasons[]", String(season - 1));
        query.append("seasons[]", String(season - 2));
      }
      const pages=[];let cursor=null;
      for(let page=0;page<2;page++){
        const pageQuery=new URLSearchParams(query);
        if(cursor)pageQuery.set('cursor',String(cursor));
        const response=await bdlRequest(`${config.stats}?${pageQuery}`, env.BALLDONTLIE_API_KEY);
        pages.push(response);
        cursor=response?.meta?.next_cursor||response?.meta?.nextCursor||null;
        if(!cursor)break;
      }
      statPayload={data:pages.flatMap(page=>Array.isArray(page?.data)?page.data:page?.data?[page.data]:[]),meta:{next_cursor:null}};
    } else {
      statPayload = await bdlRequest(`/${config.slug}/v1/players/${encodeURIComponent(player.id)}/season_stats`, env.BALLDONTLIE_API_KEY);
    }
    const rawStats = Array.isArray(statPayload?.data) ? statPayload.data : statPayload?.data ? [statPayload.data] : Array.isArray(statPayload) ? statPayload : [];
    const stats = sportLabel === "NFL" ? rawStats.filter(row => {
      const game = row?.game || {};
      // Ongoing games belong in Current Game, never the historical hit rate.
      if (game.status_state && game.status_state !== "final") return false;
      if (!game.status_state && game.status && !/final|completed/i.test(game.status)) return false;
      const phase = [game.season_type, game.seasonType, game.game_type, game.gameType, game.type, row.season_type, row.game_type].filter(Boolean).join(" ").toLowerCase();
      if (/preseason|pre-season|exhibition|hall of fame/.test(phase)) return false;
      if (/pro bowl|all-star/.test(phase)) return false;
      const dateValue = game.date || game.datetime || game.start_time || row.date || row.game_date;
      const date = new Date(dateValue);
      if (!Number.isNaN(date.getTime()) && date.getUTCMonth() === 7) return false;
      return true;
    }) : rawStats;
    const stored = storedResponse(JSON.stringify({ success: true, provider: "BALLDONTLIE", player, stats, updatedAt: new Date().toISOString() }), 24 * 60 * 60);
    if (saved.cache && saved.key) ctx.waitUntil(saved.cache.put(saved.key, stored.clone()));
    return cachedForClient(stored, "miss");
  } catch (error) {
    if (saved.response) return cachedForClient(saved.response, "stale");
    return json({ success: false, error: error?.message || "Recent player stats are temporarily unavailable." }, [401, 403, 429].includes(error?.status) ? error.status : 502);
  }
}

async function playerPhoto(request) {
  const name = new URL(request.url).searchParams.get("name")?.trim() || "";
  if (!/^[A-Za-z .'-]{2,80}$/.test(name)) return new Response("", { status: 404 });
  try {
    const response = await fetch(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(name)}&limit=8`, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("Search unavailable");
    const payload = await response.json();
    const players = (payload.results || []).find(group => group.type === "player")?.contents || [];
    const exact = players.find(player => normalizedName(player.displayName) === normalizedName(name) && (player.description === "NFL" || player.defaultLeagueSlug === "nfl"));
    const imageURL = exact?.image?.default || exact?.image?.defaultDark;
    if (!imageURL) throw new Error("No image");
    const image = await fetch(imageURL);
    if (!image.ok) throw new Error("Image unavailable");
    return new Response(image.body, { headers: { "content-type": image.headers.get("content-type") || "image/png", "cache-control": "public, max-age=604800, stale-while-revalidate=86400" } });
  } catch {
    return new Response("", { status: 404, headers: { "cache-control": "public, max-age=3600" } });
  }
}

__LIVE_SERVER__
__STATS_SHARED__
__RECORDS_SERVER__
__ACCOUNTS_SERVER__

function auditRecordId(value) {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9._|:-]{8,220}$/.test(id) ? id : null;
}

const recordMarketKeys = {
  "Passing Yards": ["player_pass_yds", "player_pass_yds_q1", "player_pass_yds_alternate"],
  "Passing Touchdowns": ["player_pass_tds", "player_pass_tds_alternate"],
  "Pass Completions": ["player_pass_completions", "player_pass_completions_alternate"],
  "Pass Attempts": ["player_pass_attempts", "player_pass_attempts_alternate"],
  "Interceptions Thrown": ["player_pass_interceptions", "player_pass_interceptions_alternate"],
  "Rushing Yards": ["player_rush_yds", "player_rush_yds_alternate"],
  "Rush Attempts": ["player_rush_attempts", "player_rush_attempts_alternate"],
  "Longest Rush": ["player_rush_longest", "player_rush_longest_alternate"],
  "Receiving Yards": ["player_reception_yds", "player_reception_yds_alternate"],
  "Receptions": ["player_receptions", "player_receptions_alternate"],
  "Longest Reception": ["player_reception_longest", "player_reception_longest_alternate"],
  "Rush + Receiving Yards": ["player_rush_reception_yds", "player_rush_reception_yds_alternate"],
  "Rush + Receiving Touchdowns": ["player_rush_reception_tds", "player_rush_reception_tds_alternate"],
  "Touchdowns": ["player_tds", "player_tds_over"],
  "Anytime Touchdown": ["player_anytime_td"],
  "Sacks": ["player_sacks", "player_sacks_alternate"],
  "Solo Tackles": ["player_solo_tackles"],
  "Tackles + Assists": ["player_tackles_assists", "player_tackles_assists_alternate"],
  "Defensive Interceptions": ["player_defensive_interceptions"],
  "Field Goals": ["player_field_goals", "player_field_goals_alternate"],
  "PATs": ["player_pats", "player_pats_alternate"],
  "Kicking Points": ["player_kicking_points", "player_kicking_points_alternate"],
};

function recordStatNumber(row, keys) {
  for (const key of keys) {
    const value = BTGStats.number(row?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function recordGameDate(row) {
  const game = row?.game || {};
  return game.date || game.datetime || game.start_time || row?.date || row?.game_date || null;
}

function sameRecordGame(row, gameTime) {
  const actual = Date.parse(recordGameDate(row) || "");
  const expected = Date.parse(gameTime || "");
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  return Math.abs(actual - expected) <= 36 * 60 * 60 * 1000;
}

async function recordGameBoxscore(record,env,signal,cache){
  const time=Date.parse(record.gameTime||''),teams=String(record.team||'').split(/\s*·\s*(?:@|vs)\s*/).map(normalizedName);
  if(!Number.isFinite(time)||teams.length!==2||teams.some(team=>!team))return undefined;
  if(time>Date.now())return null;
  const day=new Date(time).toISOString().slice(0,10),key=`scoreboard|${day}`;
  if(!cache.has(key))cache.set(key,bdlRequest(`/nfl/v1/games?${new URLSearchParams({'dates[]':day,per_page:'100'})}`,env.BALLDONTLIE_API_KEY,signal));
  const payload=await cache.get(key);
  const matches=(payload?.data||[]).filter(game=>Math.abs(Date.parse(game.date)-time)<6*3600000&&[game.home_team,game.visitor_team].every(team=>teams.includes(normalizedName(team?.full_name))));
  if(matches.length!==1)return null;
  const game=matches[0];
  if(!['final','in_progress'].includes(nflGameState(game)))return null;
  const boxKey=`boxscore|${game.id}`;
  if(!cache.has(boxKey))cache.set(boxKey,(async()=>{
    const rows=[],seen=new Set();let cursor=null;
    for(let page=0;page<10;page++){
      const params=new URLSearchParams({'game_ids[]':String(game.id),per_page:'100'});if(cursor)params.set('cursor',String(cursor));
      const data=await bdlRequest(`/nfl/v1/stats?${params}`,env.BALLDONTLIE_API_KEY,signal);
      rows.push(...(data.data||[]).filter(row=>String(row.game?.id)===String(game.id)));
      cursor=data.meta?.next_cursor;if(!cursor)return rows;if(seen.has(cursor))break;seen.add(cursor);
    }
    throw new Error('Incomplete grading box score');
  })());
  const rows=await cache.get(boxKey),wanted=normalizedName(record.player),found=rows.filter(row=>normalizedName(playerLabel(row.player))===wanted);
  if(found.length!==1)return {game,scoreboardFinal:nflGameState(game)==='final',scoreboardState:nflGameState(game),missingPlayerStats:true};
  return {...found[0],scoreboardFinal:nflGameState(game)==='final',scoreboardState:nflGameState(game)};
}

async function recordPlayerStats(record, env, signal, cache=new Map()) {
  const gameRow=await recordGameBoxscore(record,env,signal,cache);
  if(gameRow!==undefined&&!gameRow?.missingPlayerStats)return gameRow;
  const sport = String(record?.sport || "NFL").toUpperCase();
  const config = BDL_SPORTS[sport];
  if (!config?.stats || !record?.player || !record?.gameTime) return null;
  const nameParts = String(record.player).replace(/\b(Jr\.?|Sr\.?|II|III|IV)\b/gi, "").trim().split(/\s+/).filter(Boolean);
  const search = new URLSearchParams({ search: nameParts.at(-1) || record.player, per_page: "25" });
  const playerPayload = await bdlRequest(`/${config.slug}/v1/players?${search}`, env.BALLDONTLIE_API_KEY, signal);
  const player = selectPlayer(Array.isArray(playerPayload?.data) ? playerPayload.data : [], record.player, record.team || "");
  if (!player) return gameRow===undefined?null:gameRow;
  if(gameRow?.missingPlayerStats)return {...gameRow,player,player_id:player.id};
  const query = new URLSearchParams({ per_page: "100" });
  query.append("player_ids[]", String(player.id));
  if (sport === "NFL") {
    query.append("season_types[]", "2");
    query.append("season_types[]", "3");
    const now = new Date();
    const season = now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
    query.append("seasons[]", String(season));
    query.append("seasons[]", String(season - 1));
  }
  const pages = [];
  let cursor = null;
  for (let page = 0; page < 6; page += 1) {
    const pageQuery = new URLSearchParams(query);
    if (cursor) pageQuery.set("cursor", String(cursor));
    const payload = await bdlRequest(`${config.stats}?${pageQuery}`, env.BALLDONTLIE_API_KEY, signal);
    pages.push(payload);
    cursor = payload?.meta?.next_cursor || payload?.meta?.nextCursor || null;
    if (!cursor) break;
  }
  const rows = pages.flatMap(page => Array.isArray(page?.data) ? page.data : page?.data ? [page.data] : []).filter(row => {
    const game = row?.game || {};
    const state = String(game.status_state || game.status || "").toLowerCase();
    const phase=String(game.season_type||game.game_type||"").toLowerCase();
    return !/preseason|exhibition|pro bowl|all.star/.test(phase) && phase!=="1" && sameRecordGame(row, record.gameTime);
  });
  return rows.sort((a, b) => Date.parse(recordGameDate(b) || "") - Date.parse(recordGameDate(a) || ""))[0] || null;
}

function touchdownPlay(play){
  const text=`${play?.type_slug||''} ${play?.type_text||''} ${play?.text||''} ${play?.short_text||''}`;
  return Boolean(play?.scoring_play&&/touchdown/i.test(text));
}

function touchdownScorerIds(play){
  const participants=Array.isArray(play?.participants)?play.participants:[];
  const preferred=participants.filter(item=>/receiver|rusher|runner|returner|interceptor|recovery|scorer/i.test(String(item?.type||'')));
  const eligible=preferred.length?preferred:participants.filter(item=>!/passer|thrower|kicker|holder|snapper/i.test(String(item?.type||'')));
  return new Set(eligible.map(item=>String(item?.player_id??item?.player?.id??'')).filter(Boolean));
}

async function recordGamePlays(row,env,signal,cache){
  const gameId=row?.game?.id;
  if(!gameId||!env.BALLDONTLIE_API_KEY)return null;
  const key=`plays|${gameId}`;
  if(!cache.has(key))cache.set(key,(async()=>{
    const plays=[],seen=new Set();let cursor=null;
    for(let page=0;page<12;page++){
      const params=new URLSearchParams({game_id:String(gameId),per_page:'100'});if(cursor)params.set('cursor',String(cursor));
      const payload=await bdlRequest(`/nfl/v1/plays?${params}`,env.BALLDONTLIE_API_KEY,signal);
      plays.push(...(payload?.data||[]));cursor=payload?.meta?.next_cursor;
      if(!cursor)return plays;if(seen.has(cursor))break;seen.add(cursor);
    }
    throw new Error('Incomplete grading play-by-play');
  })().catch(error=>{console.warn('record_plays_unavailable',{status:error.status||null,message:error.message});return null}));
  return cache.get(key);
}

async function touchdownMarketValue(leg,row,env,signal,cache){
  if(!row||!(row.scoreboardFinal||nflGameState(row.game||{})==='final'))return null;
  const plays=await recordGamePlays(row,env,signal,cache);if(!plays)return null;
  const scores=plays.filter(touchdownPlay);if(!scores.length)return 0;
  const market=String(leg.market||'').toLowerCase(),target=/d\/st$/i.test(String(leg.player||''))?null:String(row.player_id??row.player?.id??'');
  const teamName=normalizedName(String(leg.player||'').replace(/\s+d\/st$/i,''));
  const scored=play=>{
    if(target)return touchdownScorerIds(play).has(target);
    const playTeam=normalizedName(play?.team?.full_name||'');
    const defensive=/interception|fumble|kickoff|punt|blocked|return/i.test(`${play?.type_slug||''} ${play?.type_text||''} ${play?.text||''}`);
    return Boolean(teamName&&playTeam===teamName&&defensive);
  };
  if(market==='first touchdown')return scored(scores[0])?1:0;
  if(market==='last touchdown')return scored(scores.at(-1))?1:0;
  return scores.reduce((total,play)=>total+(scored(play)?1:0),0);
}

async function playByPlayMarketValue(leg,row,env,signal,cache){
  if(!row||!(row.scoreboardFinal||nflGameState(row.game||{})==='final'))return null;
  const plays=await recordGamePlays(row,env,signal,cache);if(!plays)return null;
  const market=String(leg.market||'').toLowerCase(),target=String(row.player_id??row.player?.id??'');
  const nameParts=String(leg.player||'').replace(/\b(Jr\.?|Sr\.?|II|III|IV)\b/gi,'').trim().split(/\s+/).filter(Boolean);
  const textMarker=normalizedName(`${nameParts[0]?.[0]||''}${nameParts.at(-1)||''}`);
  const hasPlayer=(play,role)=>{
    const participants=Array.isArray(play?.participants)?play.participants:[];
    if(target&&participants.some(item=>String(item?.player_id??item?.player?.id??'')===target&&(!role||role.test(String(item?.type||'')))))return true;
    const playText=normalizedName(`${play?.text||''} ${play?.short_text||''}`);
    return Boolean(textMarker&&playText.includes(textMarker));
  };
  if(market==='sacks')return plays.filter(play=>/sack/i.test(`${play?.type_slug||''} ${play?.type_text||''}`)&&hasPlayer(play,/sack|tackler|defender/i)).length;
  const fieldGoals=plays.filter(play=>play?.scoring_play&&/field.?goal/i.test(`${play?.type_slug||''} ${play?.type_text||''} ${play?.text||''}`)&&hasPlayer(play,/kick/i)).length;
  const extraPoints=plays.filter(play=>play?.scoring_play&&/extra.?point|pat/i.test(`${play?.type_slug||''} ${play?.type_text||''} ${play?.text||''}`)&&hasPlayer(play,/kick/i)).length;
  if(market==='field goals')return fieldGoals;
  if(market==='pats')return extraPoints;
  if(market==='kicking points')return fieldGoals*3+extraPoints;
  if(market==='longest reception'){
    const yards=plays.filter(play=>/pass.?reception|complete/i.test(`${play?.type_slug||''} ${play?.type_text||''}`)&&hasPlayer(play,/receiver|reception/i)).map(play=>BTGStats.number(play?.stat_yardage)).filter(value=>value!==null);
    return yards.length?Math.max(...yards):0;
  }
  return null;
}

function recordMarketValue(record, row) {
  return BTGStats.metric(record, row).value;
}

function gradeRecordSide(side, line, value) {
  return BTGStats.grade(side, line, value);
}

async function gradePublicRecord(record, env, statsCache, signal) {
  const selections=record.kind === 'parlay'?recordLegs(record):[{...recordLegs(record)[0],player:record.player,market:record.market,side:record.side,line:record.line,odds:record.odds,sport:record.sport,gameTime:record.gameTime||record.game_time}];
  const rawLegs = selections.map(leg => {const {legs_json,legs,...selection}=leg;return {...selection,gameTime:leg.gameTime||leg.game_time||record.game_time}});
  if (!rawLegs.length) return null;
  const results = [], provisionalResults = [];
  record.provisionalResult = null;
  record.gradedLegs = [];
  for (const leg of rawLegs) {
    const cacheKey = `${leg.player}|${leg.gameTime}|${leg.market}`;
    let row = statsCache.get(cacheKey);
    if (row === undefined) {
      const sharedKey = `${leg.player}|${leg.gameTime}|boxscore`;
      if (!statsCache.has(sharedKey)) statsCache.set(sharedKey, recordPlayerStats(leg, env, signal,statsCache).catch(error => { console.warn('record_stats_unavailable', {status:error.status||null, message:error.message}); return null; }));
      row = await statsCache.get(sharedKey);
      statsCache.set(cacheKey, row || null);
    }
    let finished = row && (row.scoreboardFinal||nflGameState(row.game||{}) === 'final');
    // The scoreboard can finish before the game embedded in player stats.
    if(row && !finished && row.game?.id && env.BALLDONTLIE_API_KEY){
      const day=String(recordGameDate(row)||'').slice(0,10),gameKey=`scoreboard|${day}`;
      if(/^\d{4}-\d{2}-\d{2}$/.test(day)){
        if(!statsCache.has(gameKey))statsCache.set(gameKey,bdlRequest(`/nfl/v1/games?${new URLSearchParams({'dates[]':day,per_page:'100'})}`,env.BALLDONTLIE_API_KEY,signal).catch(()=>null));
        const payload=await statsCache.get(gameKey),game=payload?.data?.find(item=>String(item.id)===String(row.game.id));
        finished=Boolean(game&&nflGameState(game)==='final');
      }
    }
    let observedValue = finished ? recordMarketValue(leg,row) : null;
    if(finished&&/^(anytime touchdown|touchdowns|first touchdown|last touchdown)$/i.test(leg.market)){
      const playValue=await touchdownMarketValue(leg,row,env,signal,statsCache);
      if(playValue!==null)observedValue=playValue;
    }
    if(finished&&observedValue===null&&/^(sacks|field goals|pats|kicking points|longest reception)$/i.test(leg.market)){
      const playValue=await playByPlayMarketValue(leg,row,env,signal,statsCache);
      if(playValue!==null)observedValue=playValue;
    }
    let minimumOnly=false;
    // Reported scoring components establish an over hit even when the feed
    // omits other touchdown categories. Missing components never imply zero.
    if(observedValue===null&&row&&/^(anytime touchdown|touchdowns)$/i.test(leg.market)){
      const components=['rushing_touchdowns','receiving_touchdowns','fumbles_touchdowns','interception_touchdowns','kick_return_touchdowns','punt_return_touchdowns'].map(key=>BTGStats.number(row[key])).filter(value=>value!==null);
      const minimum=components.reduce((sum,value)=>sum+value,0);
      if(components.length&&minimum>Number(leg.line)){observedValue=minimum;minimumOnly=true}
    }
    const value = row && nflGameState(row.game||{}) === 'final' ? observedValue : null;
    const result = gradeRecordSide(leg.side, leg.line, value);
    results.push(result);
    const provisional=gradeRecordSide(leg.side,leg.line,observedValue);
    provisionalResults.push(provisional);
    const pendingReason=!provisional?(Date.parse(leg.gameTime)>Date.now()?'Game not started':!row?'Player stats not available':!finished?'Game in progress':!BTGStats.supports(leg)?'Market needs play-by-play verification':'Required stat not reported'):null;
    record.gradedLegs.push({...leg, result:provisional||'pending', actualValue:observedValue, minimumOnly,pendingReason,boxScoreFinal:Boolean(row&&nflGameState(row.game||{})==='final')});
  }
  const aggregate=values=>values.includes('lost')?'lost':values.every(value=>value==='push')?'push':values.every(value=>value==='won'||value==='push')?'won':null;
  record.provisionalResult=record.kind==='parlay'?aggregate(provisionalResults):provisionalResults[0];
  if (record.kind === "parlay") {
    if (results.includes("lost")) return "lost";
    if (results.every(result => result === "push")) return "push";
    return results.every(result => result === "won" || result === "push") ? "won" : null;
  }
  return results[0];
}

function recordLegs(record) {
  try { return Array.isArray(record?.legs) ? record.legs : JSON.parse(record?.legs_json || "[]"); } catch { return []; }
}

function officialRecord(record) {
  return record?.source === VERIFIED_RECORD_SOURCE && ["prop","parlay"].includes(record.kind);
}

const historicalReplayRecords = [
  {
    id: "parlay|historical-replay|bills-lions|knox-palmer",
    kind: "parlay", sport: "NFL", combinedOdds: 360, gameId: "NFL--56e8897681915f7ec92baeee952bb1ae",
    gameTime: "2026-09-18T00:17:36.000Z", postedAt: "2026-09-18T15:36:36.827Z", result: "lost",
    note: "Historical replay from the recorded last-night prop snapshot; not a previously published pregame parlay.",
    legs: [
      { player: "Dawson Knox", market: "Receptions", side: "Over", line: 1.5, odds: 160, actualValue: 1, team: "Buffalo Bills", gameId: "NFL--56e8897681915f7ec92baeee952bb1ae", gameTime: "2026-09-18T00:17:36.000Z" },
      { player: "Joshua Palmer", market: "Receptions", side: "Over", line: 1.5, odds: -130, actualValue: 1, team: "Buffalo Bills", gameId: "NFL--56e8897681915f7ec92baeee952bb1ae", gameTime: "2026-09-18T00:17:36.000Z" },
    ],
  },
  {
    id: "parlay|historical-replay|bills-lions|goff-knox",
    kind: "parlay", sport: "NFL", combinedOdds: 589, gameId: "NFL--56e8897681915f7ec92baeee952bb1ae",
    gameTime: "2026-09-18T00:17:36.000Z", postedAt: "2026-09-18T15:36:36.827Z", result: "lost",
    note: "Historical replay from the recorded last-night prop snapshot; not a previously published pregame parlay.",
    legs: [
      { player: "Jared Goff", market: "Passing Touchdowns", side: "Over", line: 2.5, odds: 165, actualValue: 4, team: "Detroit Lions", gameId: "NFL--56e8897681915f7ec92baeee952bb1ae", gameTime: "2026-09-18T00:17:36.000Z" },
      { player: "Dawson Knox", market: "Receptions", side: "Over", line: 1.5, odds: 160, actualValue: 1, team: "Buffalo Bills", gameId: "NFL--56e8897681915f7ec92baeee952bb1ae", gameTime: "2026-09-18T00:17:36.000Z" },
    ],
  },
  {
    id: "parlay|historical-replay|bills-lions|goff-palmer",
    kind: "parlay", sport: "NFL", combinedOdds: 369, gameId: "NFL--56e8897681915f7ec92baeee952bb1ae",
    gameTime: "2026-09-18T00:17:36.000Z", postedAt: "2026-09-18T15:36:36.827Z", result: "lost",
    note: "Historical replay from the recorded last-night prop snapshot; not a previously published pregame parlay.",
    legs: [
      { player: "Jared Goff", market: "Passing Touchdowns", side: "Over", line: 2.5, odds: 165, actualValue: 4, team: "Detroit Lions", gameId: "NFL--56e8897681915f7ec92baeee952bb1ae", gameTime: "2026-09-18T00:17:36.000Z" },
      { player: "Joshua Palmer", market: "Receptions", side: "Over", line: 1.5, odds: -130, actualValue: 1, team: "Buffalo Bills", gameId: "NFL--56e8897681915f7ec92baeee952bb1ae", gameTime: "2026-09-18T00:17:36.000Z" },
    ],
  },
];

async function ensureHistoricalReplayRecords(env) {
  if (!env.DB) return;
  for (const record of historicalReplayRecords) {
    await env.DB.prepare("INSERT OR IGNORE INTO public_recommendations (id, kind, sport, combined_odds, game_id, game_time, legs_json, posted_at, status, result, settled_at, source, verification_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'final', ?, ?, 'historical-replay', ?)")
      .bind(record.id, record.kind, record.sport, record.combinedOdds, record.gameId, record.gameTime, JSON.stringify(record.legs), record.postedAt, record.result, "2026-09-18T16:00:00.000Z", record.note).run();
  }
}

function oddsEventId(value) {
  const text = String(value || "");
  return text.includes("--") ? text.split("--").slice(1).join("--") : text;
}

function closingOffer(event, leg) {
  const keys = Object.entries(recordLabels).filter(([,label])=>label===leg.market).flatMap(([key])=>[key,`${key}_alternate`]);
  if(!keys.length)return null;
  const wantedPlayer = normalizedName(leg.player);
  const wantedSide = String(leg.side || "").toLowerCase() === "under" ? "under" : "over";
  const offers = [];
  for (const bookmaker of event?.bookmakers || []) {
    for (const market of bookmaker.markets || []) {
      if (keys.length && !keys.includes(market.key)) continue;
      for (const outcome of market.outcomes || []) {
        const player = normalizedName(outcome.description || outcome.player || "");
        const side = String(outcome.name || "").toLowerCase();
        const point = BTGStats.number(outcome.point);
        if (!player || !wantedPlayer || !(player === wantedPlayer || player.includes(wantedPlayer) || wantedPlayer.includes(player))) continue;
        if (!side.includes(wantedSide) || Number.isFinite(Number(leg.line)) && Number.isFinite(point) && Math.abs(point - Number(leg.line)) > 0.01) continue;
        const price = Number(outcome.price);
        if (Number.isFinite(price)) offers.push({ line: Number.isFinite(point) ? point : Number(leg.line), odds: price });
      }
    }
  }
  return offers.sort((a, b) => b.odds - a.odds)[0] || null;
}

async function captureClosingLines(env) {
  if (!env.THE_ODDS_API_KEY || !env.DB) return;
  const now = Date.now();
  const pending = await env.DB.prepare("SELECT * FROM public_recommendations WHERE source = 'market-verified-v2' AND closing_captured_at IS NULL AND game_time > ? AND game_time <= ? ORDER BY game_time ASC LIMIT 24").bind(new Date(now).toISOString(),new Date(now+20*60000).toISOString()).all();
  const candidates = (pending.results || []).filter(record => {
    const kickoff = Date.parse(record.game_time);
    return Number.isFinite(kickoff) && kickoff <= now + 20 * 60 * 1000 && kickoff >= now - 6 * 60 * 60 * 1000;
  });
  const events = new Map();
  for (const record of candidates) {
    const legs = record.kind === "parlay" ? recordLegs(record) : [{ gameId: record.game_id, player: record.player, market: record.market, side: record.side, line: record.line }];
    for (const leg of legs) {
      const eventId = leg.gameId || record.game_id;
      if (!eventId || events.has(eventId)) continue;
      try { events.set(eventId, await fetchEventOdds(SPORTS_BY_LABEL.NFL, oddsEventId(eventId), env.THE_ODDS_API_KEY, true)); } catch { events.set(eventId, null); }
    }
  }
  for (const record of candidates) {
    const legs = record.kind === "parlay" ? recordLegs(record) : [{ gameId: record.game_id, player: record.player, market: record.market, side: record.side, line: record.line, odds: record.odds }];
    let captured = 0;
    const updatedLegs = legs.map(leg => {
      const offer = closingOffer(events.get(leg.gameId || record.game_id), leg);
      if (!offer) return leg;
      captured += 1;
      return { ...leg, closingLine: offer.line, closingOdds: offer.odds, closingCapturedAt: new Date().toISOString() };
    });
    if (!captured) continue;
    const capturedAt = new Date().toISOString();
    if (record.kind === "parlay") {
      await env.DB.prepare("UPDATE public_recommendations SET legs_json = ?, closing_captured_at = ? WHERE id = ? AND closing_captured_at IS NULL").bind(JSON.stringify(updatedLegs), capturedAt, record.id).run();
    } else {
      const leg = updatedLegs[0];
      await env.DB.prepare("UPDATE public_recommendations SET closing_line = ?, closing_odds = ?, closing_captured_at = ? WHERE id = ? AND closing_captured_at IS NULL").bind(leg.closingLine, leg.closingOdds, capturedAt, record.id).run();
    }
  }
}

function recordSettlementState(record,normalized,finalResult,now=Date.now()){
  const result=finalResult||normalized.provisionalResult;
  if(!result)return {status:'pending',result:null,settledAt:null,legs:normalized.gradedLegs};
  const previous=recordLegs(record),signature=legs=>JSON.stringify(legs.map(leg=>[leg.player,leg.market,leg.side,leg.line,leg.actualValue,leg.result,leg.boxScoreFinal]));
  const unchanged=record.status==='provisional'&&record.result===result&&signature(previous)===signature(normalized.gradedLegs);
  const firstChecked=unchanged?previous[0]?.firstCheckedAt:null;
  const firstAt=firstChecked&&Number.isFinite(Date.parse(firstChecked))?firstChecked:new Date(now).toISOString();
  const confirmed=Boolean(finalResult&&unchanged&&now-Date.parse(firstAt)>=5*60000);
  return {status:confirmed?'final':'provisional',result,settledAt:confirmed?new Date(now).toISOString():null,legs:normalized.gradedLegs.map(leg=>({...leg,firstCheckedAt:firstAt,checkedAt:new Date(now).toISOString()}))};
}
async function settlePublicRecords(env) {
  if (!env.DB || !env.BALLDONTLIE_API_KEY) return;
  const cutoff=new Date(Date.now()-30*60000).toISOString();
  const pending = await env.DB.prepare("SELECT * FROM public_recommendations WHERE status IN ('pending','provisional') AND source = 'market-verified-v2' AND (game_time <= ? OR EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(legs_json) THEN legs_json ELSE '[]' END) WHERE json_extract(value,'$.gameTime') <= ?)) ORDER BY COALESCE(json_extract(CASE WHEN json_valid(legs_json) THEN legs_json ELSE '[]' END, '$[0].lastAttemptAt'), ''), id ASC LIMIT 64").bind(cutoff,cutoff).all();
  const statsCache = new Map();
  const signal = AbortSignal.timeout(20000);
  await Promise.all((pending.results || []).map(async record => {
    const savedLegs=recordLegs(record);
    const legs = savedLegs.length?savedLegs:[{ player: record.player, market: record.market, side: record.side, line: record.line, sport: record.sport, gameTime: record.game_time, team: "" }];
    const times = legs.map(leg => Date.parse(leg.gameTime || record.game_time || "")).filter(Number.isFinite);
    if (!times.length || Math.min(...times) > Date.now() - 30 * 60 * 1000) return;
    const normalized = { ...record, legs };
    const result = await gradePublicRecord(normalized, env, statsCache, signal);
    // A temporary provider outage must not erase the last observed result.
    const attemptedAt=new Date().toISOString();
    if (!result&&!normalized.provisionalResult) {
      const retained=record.status==='provisional'?recordLegs(record):normalized.gradedLegs;
      await env.DB.prepare("UPDATE public_recommendations SET legs_json = ? WHERE id = ? AND status IN ('pending','provisional')").bind(JSON.stringify(retained.map(leg=>({...leg,lastAttemptAt:attemptedAt}))),record.id).run();
      return;
    }
    const update=recordSettlementState(record,normalized,result);
    await env.DB.prepare("UPDATE public_recommendations SET status = ?, result = ?, settled_at = ?, legs_json = ? WHERE id = ? AND status IN ('pending','provisional')").bind(update.status,update.result,update.settledAt,JSON.stringify(update.legs.map(leg=>({...leg,lastAttemptAt:attemptedAt}))),record.id).run();
  }));
}

let recordMaintenancePromise=null, recordMaintenanceAt=0, closingMaintenanceAt=0;
// Publishing, grading and closing-line capture run on the GitHub scheduler and
// the closing-line cron. Visitor traffic only triggers them as a fallback when
// the Worker variable VISITOR_MAINTENANCE is set to "on", which saves provider calls.
function visitorMaintenanceEnabled(env){return env.VISITOR_MAINTENANCE==='on'}

function queueRecordMaintenance(env,ctx){
  if(!env.DB||!env.BALLDONTLIE_API_KEY||!ctx?.waitUntil)return;
  if(Date.now()-closingMaintenanceAt>60000){closingMaintenanceAt=Date.now();ctx.waitUntil(captureClosingLines(env).catch(error=>console.warn('closing_capture_failed',error.message)))}
  if(recordMaintenancePromise){ctx.waitUntil(recordMaintenancePromise);return}
  if(Date.now()-recordMaintenanceAt<15000)return;
  recordMaintenanceAt=Date.now();
  recordMaintenancePromise=settlePublicRecords(env).catch(error=>console.error('record_settlement_failed',error.message)).finally(()=>{recordMaintenancePromise=null});
  ctx.waitUntil(recordMaintenancePromise);
}

function recordOddsBucket(value) {
  const odds = Number(value);
  if (!Number.isFinite(odds)) return "Unpriced";
  if (odds >= 300) return "+300 and longer";
  if (odds >= 100) return "+100 to +299";
  if (odds >= 0) return "Even to +99";
  if (odds > -150) return "-149 to -1";
  return "-150 or shorter";
}

async function publicRecord(request, env, ctx) {
  if (!env.DB) return json({ success: false, error: "The public record database is not connected yet." }, 503);
  if (request.method === "GET") {
    try {
      // Preserve legacy rows without seeding or including them in verified totals.
      // Reads must not wait for external providers or be canceled with grading.
      if(visitorMaintenanceEnabled(env))queueRecordMaintenance(env,ctx);
      const [summary, recent, analytics] = await Promise.all([
        env.DB.prepare("SELECT kind, status, result, COUNT(*) AS count FROM public_recommendations WHERE source = 'market-verified-v2' AND kind IN ('prop','parlay') GROUP BY kind, status, result ORDER BY kind, status, result").all(),
        env.DB.prepare("SELECT id, kind, sport, player, market, side, line, odds, combined_odds, edge, game_id, game_time, posted_at, status, result, settled_at, closing_line, closing_odds, closing_captured_at, source, verification_note, legs_json FROM public_recommendations WHERE source = 'market-verified-v2' AND kind IN ('prop','parlay') ORDER BY posted_at DESC LIMIT 500").all(),
        env.DB.prepare("SELECT id, source, legs_json, kind, market, posted_at, odds, combined_odds, result, status FROM public_recommendations WHERE source = 'market-verified-v2' AND kind IN ('prop','parlay') ORDER BY posted_at ASC LIMIT 5000").all(),
      ]);
      return json({ success: true, summary: summary.results || [], recent: recent.results || [], analytics: analytics.results || [], updatedAt: new Date().toISOString() });
    } catch (error) {
      return json({ success: false, error: "The public record is temporarily unavailable." }, 503);
    }
  }
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
  // This endpoint accepts selection requests, not client-authored official rows.
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin)return json({success:false,error:'Cross-site record submissions are not allowed.'},403);
  if(!env.THE_ODDS_API_KEY)return json({success:false,error:'Verified record posting is unavailable.'},403);
  try {
    const raw=await request.text();
    if(raw.length>64000)return json({success:false,error:'Record request too large.'},413);
    const body=JSON.parse(raw),records=body.records;
    if(!Array.isArray(records)||!records.length||records.length>24)return json({success:false,error:'Choose 1–24 records.'},400);
    const verified=await verifiedRecordStatements(records,request,env,ctx);
    await env.DB.batch(verified.statements);
    return json({success:true,accepted:verified.ids.length,ids:verified.ids,source:VERIFIED_RECORD_SOURCE});
  } catch {
    return json({success:false,accepted:0,error:'Not recorded: a market is unavailable, changed, started, or could not be verified. Refresh the board and try again.'},409);
  }
}

__MOVEMENT_SERVER__

// External scheduler entrypoint. No client-supplied picks or grades are accepted.
const scheduledJobs=new Map();
async function maintenanceAuthorized(request,env){
  const expected=env.MAINTENANCE_TOKEN,header=request.headers.get('authorization')||'';
  if(!expected||expected.length<32||header.length>512||!header.startsWith('Bearer '))return false;
  const hashes=await Promise.all([header.slice(7),expected].map(value=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
  const a=new Uint8Array(hashes[0]),b=new Uint8Array(hashes[1]);let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]^b[i];return difference===0;
}
async function scheduledMaintenance(request,env,ctx){
  if(request.method!=='POST')return json({success:false,error:'Method not allowed'},405,{allow:'POST'});
  if(!await maintenanceAuthorized(request,env))return json({success:false,error:'Unauthorized'},401);
  if(!env.DB||!env.THE_ODDS_API_KEY||!env.BALLDONTLIE_API_KEY)return json({success:false,error:'Maintenance configuration incomplete'},503);
  const job=new URL(request.url).searchParams.get('job');
  const jobs={publish:()=>publishOfficialPicks(request,env,ctx),grade:()=>settlePublicRecords(env),closing:()=>captureClosingLines(env)};
  if(!Object.hasOwn(jobs,job))return json({success:false,error:'Unknown maintenance job'},400);
  let work=scheduledJobs.get(job);
  if(!work){work=Promise.resolve().then(jobs[job]).finally(()=>scheduledJobs.delete(job));scheduledJobs.set(job,work)}
  try{await work;console.log('scheduled_maintenance_completed',job);return json({success:true,job,completedAt:new Date().toISOString()})}
  catch(error){console.error('scheduled_maintenance_failed',job);return json({success:false,job,error:'Maintenance failed; retry required'},503)}
}

// Filled in by scripts/build-worker.mjs with each asset's content fingerprint.
const ASSET_VERSIONS = /*__ASSET_VERSIONS__*/{};
const SITE_URL = "https://betthisguy.com";
const ROBOTS_TXT = `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${["/", "/about", "/trust", "/legal"].map(path => `  <url><loc>${SITE_URL}${path}</loc></url>`).join("\n")}\n</urlset>\n`;
const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=31536000",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

const NOT_FOUND_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#04091a">
  <meta name="robots" content="noindex">
  <title>Page not found — Bet This Guy</title>
  <style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#04091a;color:#f6f9ff;font:16px/1.6 "DM Sans",system-ui,sans-serif;text-align:center}main{padding:32px 20px;max-width:440px}img{width:190px;height:auto}h1{font:700 30px/1.2 "Space Grotesk",system-ui,sans-serif;margin:28px 0 8px}p{color:#9fb3d9;margin:0 0 26px}a.button{display:inline-block;padding:12px 22px;border-radius:12px;background:linear-gradient(90deg,#1c6cff,#00c7ff);color:#fff;font-weight:700;text-decoration:none}a.home{display:block;margin-top:16px;color:#9fb3d9}</style>
</head>
<body>
  <main>
    <a href="/"><img src="/bet-this-guy-logo-v3.png" alt="Bet This Guy"></a>
    <h1>This line isn't on the board.</h1>
    <p>The page you're looking for doesn't exist or has moved.</p>
    <a class="button" href="/app">Open the board →</a>
    <a class="home" href="/about">About Bet This Guy</a>
  </main>
</body>
</html>
`;

// Copies the response so proxied responses with immutable headers can be changed too.
function withSecurityHeaders(response) {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!secured.headers.has(name)) secured.headers.set(name, value);
  }
  return secured;
}

async function routeRequest(request, env, ctx) {
    const url = new URL(request.url);
    if(url.pathname==='/api/me'||url.pathname.startsWith('/api/me/'))return accountApi(request,env,ctx);
    if(url.pathname==="/api/maintenance")return scheduledMaintenance(request,env,ctx);
    if(visitorMaintenanceEnabled(env)&&request.method==='GET'&&['/api/props','/api/live-games','/api/record'].includes(url.pathname))queueRecordMaintenance(env,ctx);
    if(visitorMaintenanceEnabled(env)&&request.method==='GET'&&['/api/props','/api/record'].includes(url.pathname))queueOfficialPicks(request,env,ctx);
    if (url.pathname === "/api/props") return liveProps(request, env, ctx);
    if (url.pathname === "/api/movement") return sharedMovement(request, env, ctx);
    if (url.pathname === "/api/schedule") return futureSchedule(request, env, ctx);
    if (url.pathname === "/api/event") return eventProps(request, env, ctx);
    if (url.pathname === "/api/player-stats") return playerStats(request, env, ctx);
    if (url.pathname === "/api/live-games") return liveGames(request, env, ctx);
    if (url.pathname === "/api/live-player") return livePlayer(request, env, ctx);
    if (url.pathname === "/api/live-game-stats") return liveGameStats(request, env, ctx);
    if (url.pathname === "/api/player-photo") return playerPhoto(request);
    if (url.pathname === "/api/feed-status") return json({ configured: Boolean(env.THE_ODDS_API_KEY), provider: "The Odds API" });
    if (url.pathname === "/api/record") return publicRecord(request, env, ctx);
    if (url.pathname === "/robots.txt") return new Response(ROBOTS_TXT, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" } });
    if (url.pathname === "/sitemap.xml") return new Response(SITEMAP_XML, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=86400" } });
    if (url.pathname === "/bet-this-guy-logo-v3.png") {
      const bytes = Uint8Array.from(atob(LOGO), char => char.charCodeAt(0));
      return new Response(bytes, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
    }
    const asset = STATIC[url.pathname];
    if (asset) {
      const fingerprinted = ASSET_VERSIONS[url.pathname] && url.searchParams.get("v") === ASSET_VERSIONS[url.pathname];
      const cacheControl = asset[0].startsWith("text/html") ? "no-cache" : fingerprinted ? "public, max-age=31536000, immutable" : "public, max-age=3600";
      return new Response(asset[1], { headers: { "content-type": asset[0], "cache-control": cacheControl } });
    }
    if (url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });
    return new Response(NOT_FOUND_HTML, { status: 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
}

export default {
  async fetch(request, env, ctx) {
    return withSecurityHeaders(await routeRequest(request, env, ctx));
  },
};
