# Sound for btg-nba-robinson.mp4, made from scratch (no samples, nothing to license):
# a 96 BPM beat and pad, whooshes on each step, a tick when the price moves,
# a chime per assist, a crowd swell while live, and a cash hit when it cashes.
# python3 sound.py  ->  sound.wav (22.5 s, 44.1 kHz stereo)
import wave
import numpy as np
from scipy.signal import butter, sosfilt

SR, DUR = 44100, 22.5
N = int(SR * DUR)
rng = np.random.default_rng(7)
t_all = np.arange(N) / SR
mix = np.zeros((N, 2))

def at(sec): return int(sec * SR)

def add(sig, start, gain=1.0, pan=0.0):
    i = at(start)
    if i >= N: return
    sig = sig[: N - i]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    mix[i:i + len(sig), 0] += sig * gain * l * 1.414
    mix[i:i + len(sig), 1] += sig * gain * r * 1.414

def env(n, a, d):  # attack/decay in seconds, exponential decay
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)

def bp(x, lo, hi, order=2): return sosfilt(butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x)
def lp(x, f, order=2): return sosfilt(butter(order, f, 'lowpass', fs=SR, output='sos'), x)
def hp(x, f, order=2): return sosfilt(butter(order, f, 'highpass', fs=SR, output='sos'), x)

def kick():
    n = at(0.35); t = np.arange(n) / SR
    f = 50 + 90 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.12)

def hat(open_=False):
    n = at(0.12 if open_ else 0.04)
    return hp(rng.standard_normal(n), 7000) * env(n, 0.001, 0.05 if open_ else 0.012)

def clap():
    n = at(0.2)
    return bp(rng.standard_normal(n), 900, 2500) * env(n, 0.002, 0.06)

def saw(freq, n):
    t = np.arange(n) / SR
    return 2 * ((t * freq) % 1) - 1

def pad(freqs, dur):
    n = at(dur); x = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.12):
            x += saw(f * 2 ** (det / 12), n)
    x = lp(x, 1400) / (len(freqs) * 2)
    a = np.minimum(1, np.arange(n) / at(0.4)); r = np.minimum(1, (n - np.arange(n)) / at(0.5))
    return x * a * r

def bass(freq, dur):
    n = at(dur); t = np.arange(n) / SR
    x = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(4 * np.pi * freq * t)
    return x * np.minimum(1, t / 0.01) * np.minimum(1, (n - np.arange(n)) / at(0.05))

def whoosh(dur=0.6, up=True):
    n = at(dur); x = rng.standard_normal(n); out = np.zeros(n); seg = at(0.02)
    for k in range(0, n, seg):
        p = k / n if up else 1 - k / n
        c = 400 + 5000 * p ** 1.5
        out[k:k + seg] = bp(x[max(0, k - 2000):k + seg], c * 0.6, min(c * 1.6, 18000))[-len(out[k:k + seg]):]
    return out * np.sin(np.pi * np.arange(n) / n) ** 2

def impact():
    n = at(1.2); t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * np.cumsum(40 + 60 * np.exp(-t * 12)) / SR) * env(n, 0.003, 0.35)
    crack = lp(rng.standard_normal(n), 3000) * env(n, 0.001, 0.05)
    return boom + 0.4 * crack

def bell(freq, dur=1.4):
    n = at(dur); t = np.arange(n) / SR; x = np.zeros(n)
    for m, g, d in ((1, 1, 0.9), (2.0, 0.5, 0.5), (2.76, 0.35, 0.35), (5.4, 0.15, 0.15)):
        x += g * np.sin(2 * np.pi * freq * m * t) * np.exp(-t / d)
    return x * np.minimum(1, t / 0.002) / 2

def tick():
    n = at(0.05)
    return bp(rng.standard_normal(n), 2500, 6000) * env(n, 0.0005, 0.008)

def riser(dur):
    n = at(dur); t = np.arange(n) / SR
    f = 200 * 2 ** (t / dur * 3)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.3
    noise = hp(rng.standard_normal(n), 2000) * 0.5
    return (tone + noise) * (t / dur) ** 2

def crowd(dur):
    n = at(dur); x = bp(rng.standard_normal(n), 300, 2500, 3)
    t = np.arange(n) / SR
    wob = 0.75 + 0.25 * np.sin(2 * np.pi * 0.7 * t) * np.sin(2 * np.pi * 0.23 * t + 1)
    fade = np.minimum(1, t / 1.0) * np.minimum(1, (n - np.arange(n)) / at(1.0))
    return x * wob * fade

# ---- music: 96 BPM, Am F C G, two bars each; kept under the effects ----
MUS = 0.5
BEAT = 60 / 96
chords = [(220.0, 261.63, 329.63), (174.61, 220.0, 261.63), (130.81, 196.0, 261.63), (196.0, 246.94, 293.66)]
roots = [55.0, 43.65, 65.41, 49.0]
music = np.zeros((N, 2))
start_beats, end_beat = 0, int(19.4 / BEAT)
for b in range(int(DUR / BEAT) + 1):
    s = b * BEAT
    if s >= DUR: break
    bar = b // 4
    full = s >= 3.6 and s < 19.4
    if s < 19.4:
        if b % 8 == 0:
            ch = (b // 8) % 4
            add(pad(chords[ch], BEAT * 8), s, MUS * (0.22 if full else 0.14))
            if full: add(bass(roots[ch], BEAT * 8 - 0.05), s, MUS * 0.35)
        if full:
            add(kick(), s, MUS * 0.9)
            add(hat(), s + BEAT / 2, MUS * 0.18, 0.3)
            if b % 4 == 3: add(hat(True), s + BEAT * 0.75, MUS * 0.12, -0.3)
            if b % 2 == 1: add(clap(), s, MUS * 0.35)
# ---- hook ----
add(impact(), 0.1, 0.8)
add(whoosh(0.5), 1.25, 0.25, 0.4)
add(riser(1.5), 2.1, 0.35)
# ---- each step ----
for s in (3.6, 7.6, 11.4, 15.4):
    add(whoosh(0.55), s - 0.35, 0.35, -0.2)
add(impact(), 3.6, 0.55)
# price moves: ticks like a ticker, then a low drop
for k in range(5): add(tick(), 7.75 + k * 0.07, 1.6, 0.5)
add(bell(330, 0.8), 8.15, 0.25)
# live: crowd bed, a swell and a chime per assist
add(crowd(4.0), 11.4, 0.11)
add(crowd(1.6), 11.7, 0.12)
add(bell(1046.5), 12.0, 0.85, -0.2)
add(crowd(1.8), 13.0, 0.18)
add(bell(1318.5), 13.3, 0.95, 0.2); add(bell(1568.0), 13.38, 0.6, 0.2)
# cashed: cash-register hit
add(impact(), 15.4, 0.8)
add(tick(), 15.4, 0.9); add(tick(), 15.47, 0.9)
for f, d in ((2093.0, 0.0), (2637.0, 0.05), (3136.0, 0.1)): add(bell(f, 1.6), 15.45 + d, 0.35)
add(crowd(2.5), 15.4, 0.2)
# close: one hit and a held chord
add(whoosh(0.6), 19.1, 0.3)
add(impact(), 19.4, 0.6)
add(pad(chords[0], 3.1), 19.4, 0.3)
add(bell(880, 2.5), 19.45, 0.25)

out = mix
out[-at(1.2):] *= np.linspace(1, 0, at(1.2))[:, None]
out = np.tanh(out * 0.9)
out *= 0.89 / np.max(np.abs(out))
pcm = (out * 32767).astype('<i2')
with wave.open('sound.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('sound.wav', round(DUR, 1), 's')
