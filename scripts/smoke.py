"""Smoke test against the live site: the NBA (or NFL) feeds, player stats and
live tracker, printed compactly for the Actions log. Optionally polls one live
game for N minutes to measure how often its box score actually changes.
Read-only: public endpoints only, no credentials."""
import json, os, sys, time, urllib.parse, urllib.request

SITE = os.environ.get("SITE", "https://betthisguy.com")
SPORT = os.environ.get("SPORT", "NBA")
MINUTES = float(os.environ.get("POLL_MINUTES", "0") or 0)
q = "?sport=NBA" if SPORT == "NBA" else ""
a = "&sport=NBA" if SPORT == "NBA" else ""

def get(path):
    started = time.time()
    try:
        with urllib.request.urlopen(urllib.request.Request(SITE + path, headers={"User-Agent": "BetThisGuy-Smoke/1.0"}), timeout=60) as r:
            body = json.loads(r.read().decode())
            return r.status, body, round(time.time() - started, 2)
    except urllib.error.HTTPError as e:
        try: body = json.loads(e.read().decode())
        except Exception: body = {}
        return e.code, body, round(time.time() - started, 2)
    except Exception as e:
        return 0, {"error": type(e).__name__ + ": " + str(e)}, round(time.time() - started, 2)

def show(label, status, body, secs, extra=""):
    print(f"\n== {label}: HTTP {status} in {secs}s {extra}")
    if status != 200 or body.get("success") is False: print("   error:", body.get("error"))

s, sched, t = get(f"/api/schedule{q}")
games = sched.get("data") or []
show("schedule", s, sched, t, f"{len(games)} games")
for g in games[:5]: print("  ", g.get("eventID"), (g.get("teams") or {}).get("away", {}).get("names", {}).get("short"), "@", (g.get("teams") or {}).get("home", {}).get("names", {}).get("short"), g.get("status", {}).get("startsAt"))

s, board, t = get(f"/api/props{q}")
events = board.get("data") or []
show("odds board", s, board, t, f"{len(events)} events, coverage={board.get('coverage')}")
players = []
for e in events[:3]:
    books = e.get("bookmakers") or []
    markets = sorted({m.get("key") for b in books for m in b.get("markets") or []})
    print("  ", e.get("eventID"), e.get("away_team"), "@", e.get("home_team"), "| books:", ",".join(b.get("key") for b in books), "| markets:", len(markets), markets[:8])
    for b in books[:1]:
        for m in (b.get("markets") or [])[:1]:
            for o in (m.get("outcomes") or [])[:4]:
                if o.get("description") and o["description"] not in [p[0] for p in players]: players.append((o["description"], e.get("home_team")))

# No odds posted yet (preseason): look up named players instead.
if not players:
    players = [tuple(x.split("|", 1)) for x in (os.environ.get("PLAYERS") or ("Jayson Tatum|Boston Celtics;Nikola Jokic|Denver Nuggets;Jalen Brunson|New York Knicks" if SPORT == "NBA" else "Josh Allen|Buffalo Bills;Saquon Barkley|Philadelphia Eagles")).split(";") if "|" in x]
for name, team in players[:3]:
    s, stats, t = get(f"/api/player-stats?{urllib.parse.urlencode({'sport': SPORT, 'player': name, 'team': team})}")
    rows = stats.get("stats") or []
    show(f"player stats: {name}", s, stats, t, f"{len(rows)} games, player={(stats.get('player') or {}).get('first_name')} {(stats.get('player') or {}).get('last_name')}")
    for r in rows[:3]:
        g = r.get("game") or {}
        keys = ["pts", "reb", "ast", "fg3m", "min"] if SPORT == "NBA" else ["passing_yards", "rushing_yards", "receiving_yards", "receptions"]
        print("   ", g.get("date"), g.get("status"), {k: r.get(k) for k in keys})

s, live, t = get(f"/api/live-games{q}")
lg = live.get("games") or []
show("live games", s, live, t, f"{len(lg)} games, stale={live.get('stale')}")
for g in lg[:8]: print("  ", g.get("id"), (g.get("away") or {}).get("abbreviation"), g.get("awayScore"), "@", (g.get("home") or {}).get("abbreviation"), g.get("homeScore"), "|", g.get("state"), g.get("status"), "P", g.get("period"), g.get("clock"))
pick = next((g for g in lg if g.get("state") == "in_progress"), None) or next((g for g in lg if g.get("state") == "final"), None)
if pick:
    s, box, t = get(f"/api/live-game-stats?game_id={pick['id']}{a}")
    rows = box.get("stats") or []
    show(f"box score game {pick['id']} ({pick.get('state')})", s, box, t, f"{len(rows)} player rows")
    for r in sorted(rows, key=lambda r: -(r.get("pts") or 0))[:3] if SPORT == "NBA" else rows[:3]:
        print("   ", (r.get("player") or {}).get("last_name"), {k: r.get(k) for k in (["pts", "reb", "ast", "fg3m", "min"] if SPORT == "NBA" else ["passing_yards", "rushing_yards", "receiving_yards"])})

if MINUTES and pick and pick.get("state") == "in_progress":
    print(f"\n== polling game {pick['id']} every 20s for {MINUTES} min: when does the box score change?")
    last, changes, end = None, [], time.time() + MINUTES * 60
    while time.time() < end:
        s, box, _ = get(f"/api/live-game-stats?game_id={pick['id']}{a}")
        sg, lv, _ = get(f"/api/live-games{q}")
        game = next((g for g in lv.get("games") or [] if g.get("id") == pick["id"]), {})
        total = sum((r.get("pts") or 0) for r in box.get("stats") or []) if SPORT == "NBA" else sum((r.get("passing_yards") or 0) + (r.get("rushing_yards") or 0) for r in box.get("stats") or [])
        snap = (total, game.get("homeScore"), game.get("awayScore"))
        stamp = time.strftime("%H:%M:%S", time.gmtime())
        if snap != last:
            changes.append(stamp)
            print(f"   {stamp} box total={total} score {game.get('awayScore')}-{game.get('homeScore')} P{game.get('period')} {game.get('clock')} (box updatedAt {box.get('updatedAt')})")
            last = snap
        time.sleep(20)
    print(f"   {len(changes)} distinct box-score states in {MINUTES} min")
elif MINUTES:
    print("\n== no game in progress right now; nothing to poll")
