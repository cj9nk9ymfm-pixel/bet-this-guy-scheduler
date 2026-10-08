"""Compare fair prices from every licensed book vs the big five only, on the
live site's current NFL odds. Read-only: public endpoints only."""
import json, os, time, urllib.request
from collections import defaultdict

SITE = os.environ.get("SITE", "https://betthisguy.com")
BIG = {"draftkings", "fanduel", "betmgm", "williamhill_us", "fanatics"}

def get(path):
    with urllib.request.urlopen(urllib.request.Request(SITE + path, headers={"User-Agent": "BetThisGuy-Smoke/1.0"}), timeout=90) as r:
        return json.loads(r.read().decode())

def dec(o): return 1 + o / 100 if o > 0 else 1 + 100 / abs(o)

sched = get("/api/schedule").get("data") or []
now = time.time()
games = [g for g in sched if g.get("eventID") and (g.get("status") or {}).get("startsAt") and time.mktime(time.strptime(g["status"]["startsAt"][:19], "%Y-%m-%dT%H:%M:%S")) > now + 300][:16]
print(f"{len(games)} upcoming games")
tot = defaultdict(int); diffs = []; book_count = defaultdict(int)
for g in games:
    try: body = get(f"/api/event?eventID={g['eventID']}")
    except Exception as e: print("  skip", g["eventID"], e); continue
    ev = body.get("data") or {}
    if isinstance(ev, list): ev = ev[0] if ev else {}
    pairs = defaultdict(dict)
    for b in ev.get("bookmakers") or []:
        book_count[b.get("key")] += 1
        for m in b.get("markets") or []:
            if m.get("key", "").endswith("_alternate") or not m.get("key", "").startswith("player_"): continue
            for o in m.get("outcomes") or []:
                side = str(o.get("name", "")).lower()
                if side not in ("over", "under") or o.get("point") is None or not o.get("description"): continue
                pairs[(m["key"], o["description"], o["point"])].setdefault(b["key"], {})[side] = o["price"]
    for key, books in pairs.items():
        full = {k: v for k, v in books.items() if "over" in v and "under" in v and abs(v["over"]) >= 100 and abs(v["under"]) >= 100}
        if not full: continue
        tot["props"] += 1
        nv = {k: (1/dec(v["over"])) / (1/dec(v["over"]) + 1/dec(v["under"])) for k, v in full.items()}
        def best(use):
            sel = [k for k in full if k in use]
            if len(sel) < 3: return None
            fair = sum(nv[k] for k in sel) / len(sel)
            opts = [(100*(fair - 1/dec(full[k]["over"])), k, "Over") for k in full if k in BIG] + [(100*((1-fair) - 1/dec(full[k]["under"])), k, "Under") for k in full if k in BIG]
            return max(opts) if opts else None
        a = best(set(full)); b = best(BIG)
        if a: tot["rated_all"] += 1
        if b: tot["rated_big5"] += 1
        if a and not b: tot["lost_rating"] += 1
        qa = bool(a and 1 <= a[0] <= 12); qb = bool(b and 1 <= b[0] <= 12)
        tot["qual_all"] += qa; tot["qual_big5"] += qb
        if a and b:
            tot["shift_n"] += 1; tot["shift_sum"] += abs(a[0] - b[0])
            ga = "good" if a[0] >= 1 else "over" if a[0] <= -3.5 else "fair"; gb = "good" if b[0] >= 1 else "over" if b[0] <= -3.5 else "fair"
            if ga != gb: tot["verdict_changed"] += 1
        if qa != qb:
            prices = ", ".join("%s %s/%s" % (k, v["over"], v["under"]) for k, v in full.items())
            fmt = lambda x: "%.1f%% %s %s" % x if x else "not rated"
            diffs.append(f"  {key[1]} {key[0]} {key[2]}: all books {fmt(a)} | big 5 {fmt(b)} | {prices}")
print("books seen (games):", dict(book_count))
print({k: (round(v, 2) if isinstance(v, float) else v) for k, v in tot.items() if k not in ("shift_sum",)}, "avg edge shift:", round(tot["shift_sum"]/max(1, tot["shift_n"]), 3))
print("qualifying-pick differences:"); print("\n".join(diffs) or "  none")
