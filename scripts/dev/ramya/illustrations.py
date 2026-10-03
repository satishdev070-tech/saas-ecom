"""Regenerates the original line motifs in public/illustrations/ (peacock feather, bansuri, lotus, kadamba vine).  python3 scripts/dev/ramya/illustrations.py"""
import math, os

OUT = os.path.join(os.path.dirname(__file__), "../../../public/illustrations")
os.makedirs(OUT, exist_ok=True)
STYLE = 'fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round"'


def f(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


def svg(name, w, h, body, sw=1.6):
    s = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><g {STYLE} stroke-width="{sw}">{body}</g></svg>\n'
    open(os.path.join(OUT, name), "w").write(s)
    print(name, len(s), "bytes")


# ---------------------------------------------------------------- peacock feather (vertical)
def feather(cx=60, top=26, length=372, eye=1.0, barbs=True):
    p = []
    # quill
    p.append(f'<path d="M{f(cx)} {f(top+length)} C{f(cx+3)} {f(top+length*0.7)} {f(cx-3)} {f(top+length*0.45)} {f(cx)} {f(top+100*eye)}"/>')
    # eye: three nested teardrops + core
    for k, (a, b, c) in enumerate([(0, 30, 108), (18, 22, 88), (36, 13, 70)]):
        t = top + a * eye
        wv = b * eye
        bot = top + c * eye
        mid = (t + bot) / 2
        p.append(f'<path d="M{f(cx)} {f(t)} C{f(cx+wv*1.05)} {f(t+(mid-t)*0.55)} {f(cx+wv)} {f(mid+(bot-mid)*0.6)} {f(cx)} {f(bot)} C{f(cx-wv)} {f(mid+(bot-mid)*0.6)} {f(cx-wv*1.05)} {f(t+(mid-t)*0.55)} {f(cx)} {f(t)}Z"/>')
    p.append(f'<ellipse cx="{f(cx)}" cy="{f(top+58*eye)}" rx="{f(5*eye)}" ry="{f(7*eye)}"/>')
    if barbs:
        # wisps radiating around the eye
        ecx, ecy = cx, top + 60 * eye
        for i in range(19):
            ang = math.radians(195 + i * (150 / 18))
            r0, r1 = 46 * eye, 66 * eye + (6 if i % 2 else 0)
            x0, y0 = ecx + r0 * math.cos(ang) * 0.78, ecy + r0 * math.sin(ang)
            x1, y1 = ecx + r1 * math.cos(ang) * 0.85, ecy + r1 * math.sin(ang)
            qx, qy = (x0 + x1) / 2 + 4 * math.sin(ang), (y0 + y1) / 2 - 3
            p.append(f'<path d="M{f(x0)} {f(y0)} Q{f(qx)} {f(qy)} {f(x1)} {f(y1)}"/>')
        # barbs along the shaft, tapering towards the base
        y = top + 118 * eye
        end = top + length - 40
        while y < end:
            t = (y - top) / length
            wv = 5 + 40 * (1 - t) ** 1.15
            for side in (-1, 1):
                p.append(f'<path d="M{f(cx)} {f(y)} C{f(cx+side*wv*0.3)} {f(y-wv*0.08)} {f(cx+side*wv*0.78)} {f(y-wv*0.22)} {f(cx+side*wv)} {f(y-wv*0.75)}"/>')
            y += 8 + 6 * t
    return "".join(p)


svg("peacock-feather.svg", 120, 400, feather())


# ---------------------------------------------------------------- bansuri (flute) with a tucked feather and tassel
def bansuri():
    p = []
    x0, x1, yc, r = 24, 396, 156, 6.5
    p.append(f'<path d="M{x0} {yc-r} H{x1} a{r} {r} 0 0 1 0 {2*r} H{x0} a{r} {r} 0 0 1 0 {-2*r}Z"/>')
    for x in (52, 58, 64, 352, 358, 364):  # thread bindings
        p.append(f'<path d="M{x} {yc-r-1.5} V{yc+r+1.5}"/>')
    p.append(f'<ellipse cx="96" cy="{yc}" rx="4" ry="2.6"/>')  # blow hole
    for i in range(6):
        p.append(f'<circle cx="{170+i*24}" cy="{yc}" r="2.7"/>')
    # tassel hanging from the right binding
    p.append(f'<path d="M358 {yc+r+1} C360 {yc+22} 352 {yc+30} 356 {yc+40}"/>')
    p.append(f'<path d="M350 {yc+40} H362 M352 {yc+44} H360"/>')
    for k in range(5):
        p.append(f'<path d="M{351+k*2.5} {yc+45} C{350+k*2.5} {yc+56} {353+k*2.5} {yc+62} {351+k*3} {yc+70}"/>')
    # a small peacock feather tucked at the left binding, leaning back
    p.append(f'<g transform="translate(118 {yc}) rotate(-30) scale(0.48) translate(-60 -310)">{feather(cx=60, top=10, length=300, eye=1.0)}</g>')
    return "".join(p)


svg("bansuri.svg", 420, 236, bansuri(), sw=1.5)


# ---------------------------------------------------------------- lotus
def lotus():
    p = []
    bx, by = 110, 128

    def petal(h, w, rot):
        tip = by - h
        return f'<path transform="rotate({rot} {bx} {by})" d="M{bx} {by} C{f(bx-w)} {f(by-h*0.35)} {f(bx-w*0.55)} {f(tip+h*0.18)} {bx} {f(tip)} C{f(bx+w*0.55)} {f(tip+h*0.18)} {f(bx+w)} {f(by-h*0.35)} {bx} {by}Z"/>'

    for rot, h, w in [(-72, 66, 20), (72, 66, 20), (-48, 84, 24), (48, 84, 24), (-22, 98, 26), (22, 98, 26), (0, 108, 28)]:
        p.append(petal(h, w, rot))
    # petal veins on the centre petal
    p.append(f'<path d="M{bx} {by-8} V{by-90}"/>')
    # water lines and a lily pad
    p.append(f'<path d="M36 {by+8} Q{bx} {by+20} 184 {by+8}"/>')
    p.append(f'<path d="M58 {by+20} Q{bx} {by+30} 162 {by+20}"/>')
    p.append(f'<path d="M86 {by+31} Q{bx} {by+36} 134 {by+31}"/>')
    # rising dots (pollen)
    for (x, y, r) in [(110, 6, 1.8), (96, 12, 1.3), (124, 12, 1.3)]:
        p.append(f'<circle cx="{x}" cy="{y}" r="{r}"/>')
    return "".join(p)


svg("lotus.svg", 220, 170, lotus())


# ---------------------------------------------------------------- kadamba vine (horizontal)
def kadamba():
    p = []
    W, mid, amp = 520, 46, 12
    pts = []
    for i in range(0, W + 1, 4):
        pts.append((i, mid + amp * math.sin(i / W * math.pi * 3)))
    p.append('<path d="M' + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + '"/>')

    def leaf(x, y, ang, L=26):
        a = math.radians(ang)
        ex, ey = x + L * math.cos(a), y + L * math.sin(a)
        nx, ny = -math.sin(a) * L * 0.32, math.cos(a) * L * 0.32
        mx, my = (x + ex) / 2, (y + ey) / 2
        return f'<path d="M{f(x)} {f(y)} Q{f(mx+nx)} {f(my+ny)} {f(ex)} {f(ey)} Q{f(mx-nx)} {f(my-ny)} {f(x)} {f(y)}Z M{f(x)} {f(y)} L{f(ex*0.85+x*0.15)} {f(ey*0.85+y*0.15)}"/>'

    for i, x in enumerate(range(30, W - 20, 38)):
        y = mid + amp * math.sin(x / W * math.pi * 3)
        up = i % 2 == 0
        p.append(leaf(x, y, -55 if up else 55))

    def blossom(x, y, r=11):
        s = [f'<circle cx="{f(x)}" cy="{f(y)}" r="{r}"/>', f'<circle cx="{f(x)}" cy="{f(y)}" r="{r*0.45}"/>']
        for k in range(22):
            a = k / 22 * math.tau
            s.append(f'<path d="M{f(x+r*math.cos(a))} {f(y+r*math.sin(a))} L{f(x+(r+6)*math.cos(a))} {f(y+(r+6)*math.sin(a))}"/>')
            if k % 2 == 0:
                s.append(f'<circle cx="{f(x+(r+8.5)*math.cos(a))}" cy="{f(y+(r+8.5)*math.sin(a))}" r="0.9"/>')
        return "".join(s)

    for bx in (95, 262, 430):
        y = mid + amp * math.sin(bx / W * math.pi * 3)
        side = 1
        p.append(f'<path d="M{bx} {f(y)} Q{bx+8} {f(y+12)} {bx+4} {f(y+28)}"/>')
        p.append(blossom(bx + 4, y + 46))
    return "".join(p)


svg("kadamba-vine.svg", 520, 130, kadamba(), sw=1.4)
