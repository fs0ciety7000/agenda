"""Musique originale de la vidéo Tandem : 120 BPM, 20 s, synthétisée en code (numpy).

Ré mineur / Fa majeur : Dm7 – B♭maj7 – Fmaj7 – C, kick 4/4, clap, charleston, basse,
nappe, arpège. Les bruitages (impacts, whooshes, clics d'interface) tombent sur les temps
lus dans timeline.json, les mêmes que l'animation.

    python3 music.py  → ../out/music.wav (48 kHz, stéréo, 16 bits)
"""

import json
import wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
TL = json.loads((HERE / "timeline.json").read_text())
SR = 48000
BPM = TL["bpm"]
BEAT = 60 / BPM
DUR = TL["duration"]
N = int(SR * (DUR + 0.5))
rng = np.random.default_rng(7)

L = np.zeros(N)
R = np.zeros(N)


def add(sig, t, gain=1.0, pan=0.0):
    """Ajoute un signal mono à l'instant t (s), panoramique -1 … 1."""
    i = int(t * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    L[i : i + len(sig)] += sig * np.sqrt((1 - pan) / 2) * 1.414
    R[i : i + len(sig)] += sig * np.sqrt((1 + pan) / 2) * 1.414


def tt(d):
    return np.arange(int(d * SR)) / SR


def hz(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def lowpass(x, cutoff):
    """Passe-bas à un pôle ; cutoff scalaire ou tableau (balayage)."""
    c = np.broadcast_to(np.asarray(cutoff, float), x.shape)
    a = 1 - np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x)
    acc = 0.0
    for n in range(len(x)):
        acc += a[n] * (x[n] - acc)
        y[n] = acc
    return y


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


def saw(f, t):
    # Dent de scie adoucie (somme d'harmoniques limitée) : pas de repliement.
    out = np.zeros_like(t)
    for k in range(1, 14):
        if f * k > SR / 2.2:
            break
        out += ((-1) ** (k + 1)) * np.sin(2 * np.pi * f * k * t) / k
    return out * 0.6


# ---------------------------------------------------------------- sons de base
def kick():
    t = tt(0.45)
    f = 48 + 110 * np.exp(-t * 32)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 7.5) + 0.25 * rng.standard_normal(len(t)) * np.exp(-t * 300)


def clap():
    t = tt(0.3)
    n = highpass(rng.standard_normal(len(t)), 900)
    env = np.exp(-t * 22) + sum(np.exp(-np.maximum(t - d, 0) * 90) * (t >= d) for d in (0.0, 0.011, 0.022)) * 0.6
    return n * env * 0.5


def hat(open_=False):
    t = tt(0.25 if open_ else 0.05)
    n = highpass(rng.standard_normal(len(t)), 7000)
    return n * np.exp(-t * (14 if open_ else 70)) * 0.35


def click():
    t = tt(0.05)
    return (np.sin(2 * np.pi * 2400 * t) * 0.6 + np.sin(2 * np.pi * 5200 * t) * 0.3) * np.exp(-t * 180) + highpass(rng.standard_normal(len(t)), 4000) * np.exp(-t * 400) * 0.4


def tick():
    t = tt(0.04)
    return np.sin(2 * np.pi * 3200 * t) * np.exp(-t * 220) * 0.5


def whoosh(d=0.55):
    t = tt(d)
    x = t / d
    n = rng.standard_normal(len(t))
    sweep = 300 + 6000 * np.sin(np.pi * x) ** 2
    y = highpass(lowpass(n, sweep), 150)
    return y * np.sin(np.pi * x) ** 1.5 * 0.9


def impact():
    t = tt(0.7)
    f = 42 + 90 * np.exp(-t * 18)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5)
    crack = lowpass(rng.standard_normal(len(t)), 2500) * np.exp(-t * 16)
    return boom * 0.9 + crack * 0.8


def boom():
    t = tt(1.6)
    f = 36 + 60 * np.exp(-t * 10)
    b = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.4)
    tail = lowpass(rng.standard_normal(len(t)), 1200 * np.exp(-t * 2) + 100) * np.exp(-t * 3)
    return b + tail * 0.6


def riser(d):
    t = tt(d)
    x = t / d
    n = highpass(rng.standard_normal(len(t)), 800 + 7000 * x)
    tone = np.sin(2 * np.pi * np.cumsum(220 + 900 * x**2) / SR)
    return (n * 0.5 + tone * 0.25) * x**2


# ---------------------------------------------------------------- harmonie
# Accord par mesure (2 s) : notes MIDI.
CHORDS = {
    "Dm7": [50, 53, 57, 60],
    "Bbmaj7": [46, 50, 53, 57],
    "Fmaj7": [53, 57, 60, 64],
    "C": [48, 52, 55, 60],
}
PROG = ["Dm7", "Bbmaj7", "Fmaj7", "C", "Dm7", "Bbmaj7", "Fmaj7", "C", "Bbmaj7", "Fmaj7"]


def chord_at(t):
    return CHORDS[PROG[min(int(t // (4 * BEAT)), len(PROG) - 1)]]


music = np.zeros(N)  # bus mélodique (sidechainé par le kick)
music_R = np.zeros(N)


def add_music(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    sig = sig[: N - i] * gain
    music[i : i + len(sig)] += sig * (1 - max(pan, 0))
    music_R[i : i + len(sig)] += sig * (1 + min(pan, 0))


# Nappe : trois dents de scie désaccordées, filtre qui s'ouvre au « drop » (3 s).
for bar, name in enumerate(PROG):
    t0 = bar * 4 * BEAT
    d = 4 * BEAT + 0.05
    tt_ = tt(d)
    pad = sum(saw(hz(n) * det, tt_) for n in CHORDS[name] for det in (0.995, 1.0, 1.006))
    cutoff = 700 if t0 < 3 else 1800 if t0 < 15.5 else 1100
    pad = lowpass(pad, cutoff) * np.minimum(tt_ / 0.25, 1) * np.minimum((d - tt_) / 0.1, 1)
    add_music(pad, t0, 0.035)

# Basse : croches, racine + octave sur les contretemps, à partir de 3 s.
eighth = BEAT / 2
for i in range(int(DUR / eighth)):
    t0 = i * eighth
    if t0 < 3 or 15.5 <= t0 < 17.5 or t0 >= 19.5:
        continue
    root = chord_at(t0)[0] - 12
    note = root + (12 if i % 2 else 0)
    x = tt(eighth * 0.95)
    b = lowpass(saw(hz(note), x) + 0.6 * np.sin(2 * np.pi * hz(note) * x), 600) * np.exp(-x * 3)
    add_music(b, t0, 0.33)

# Arpège (doubles croches) de 6,5 à 15,5 s, en ping-pong.
sixteenth = BEAT / 4
for i in range(int(6.5 / sixteenth), int(15.5 / sixteenth)):
    t0 = i * sixteenth
    ch = chord_at(t0)
    note = ch[[0, 1, 2, 3, 2, 1][i % 6]] + 24
    x = tt(0.2)
    pl = np.sign(np.sin(2 * np.pi * hz(note) * x)) * 0.3 + np.sin(2 * np.pi * hz(note) * x)
    pl = lowpass(pl, 3500) * np.exp(-x * 22)
    add_music(pl, t0, 0.06, pan=0.6 if i % 2 else -0.6)

# Accroche : accords piqués sur chaque mot, puis accord final tenu sur le logo.
for t0 in TL["sfx"]["impact"][:5]:
    x = tt(0.35)
    st = lowpass(sum(saw(hz(n + 12), x) for n in CHORDS["Dm7"]), 2200) * np.exp(-x * 9)
    add_music(st, t0, 0.07)
x = tt(2.5)
final = sum(saw(hz(n + 12) * det, x) for n in CHORDS["Fmaj7"] for det in (0.996, 1.004))
add_music(lowpass(final, 2400) * np.exp(-x * 1.1), 17.5, 0.06)

# Sidechain : la musique « respire » sous chaque kick.
duck = np.ones(N)
kicks = [i * BEAT for i in range(int(DUR / BEAT)) if 3 <= i * BEAT < 15.5 or 17.5 <= i * BEAT < 19.5]
for t0 in kicks:
    i = int(t0 * SR)
    x = tt(0.3)
    seg = 1 - 0.65 * np.exp(-x * 14)
    duck[i : i + len(seg)] = np.minimum(duck[i : i + len(seg)], seg[: N - i])
L += music * duck
R += music_R * duck

# ---------------------------------------------------------------- batterie
K = kick()
for t0 in kicks:
    add(K, t0, 0.95)
for t0 in TL["sfx"]["impact"][:5]:
    add(K, t0, 0.9)
C = clap()
for i in range(int(DUR / BEAT)):
    t0 = i * BEAT
    if 3 <= t0 < 15.5 and i % 2 == 1:
        add(C, t0, 0.55, pan=0.1)
# Roulement de clap vers le chiffre, puis montée vers le logo.
for i in range(8):
    add(C, 14.5 + i * (BEAT / 4) * (1 - i * 0.05), 0.15 + i * 0.05)
for i in range(8):
    add(C, 16.5 + i * BEAT / 4, 0.12 + i * 0.06, pan=-0.2 if i % 2 else 0.2)
add(riser(1.25), 16.25, 0.3)
HC, HO = hat(), hat(True)
for i in range(int(DUR / eighth)):
    t0 = i * eighth
    if 3 <= t0 < 15.5 or 17.5 <= t0 < 19.5:
        add(HO if i % 2 else HC, t0, 0.5 if i % 2 else 0.35, pan=0.35)

# ---------------------------------------------------------------- bruitages
S = TL["sfx"]
for t0 in S["impact"]:
    add(impact(), t0, 0.55)
for t0 in S["boom"]:
    add(boom(), t0, 0.7)
for t0 in S["whoosh"]:
    add(whoosh(), t0 - 0.05, 0.45, pan=-0.3)
for t0 in S["tick"]:
    add(tick(), t0, 0.35, pan=0.4)
for t0 in S["click"]:
    add(click(), t0, 0.6, pan=0.15)
for a, b in S["riser"]:
    add(riser(b - a), a, 0.35)

# ---------------------------------------------------------------- mastering
mix = np.stack([L, R], 1)[: int(DUR * SR)]
fade = np.minimum(1, (DUR - np.arange(len(mix)) / SR) / 0.4)[:, None]
mix = np.tanh(mix * 1.6) * fade
mix /= np.max(np.abs(mix)) + 1e-9
mix *= 0.89  # ≈ -1 dBFS

out = HERE.parent / "out"
out.mkdir(exist_ok=True)
with wave.open(str(out / "music.wav"), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print("ok", out / "music.wav", f"{len(mix) / SR:.2f} s")
