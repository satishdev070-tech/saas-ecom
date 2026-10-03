// Original, procedurally drawn demo artwork for the dev seed store (no third-party imagery).
// Garment silhouettes filled with hand-block-print style repeat patterns, lit like a studio shot.

/** Repeat patterns keyed by print technique. Each returns an SVG <pattern> body for a tile of `size`. */
const PATTERNS = {
  dabu: (c) => ({
    size: 96,
    body: `<rect width="96" height="96" fill="${c.ground}"/>
      <g fill="${c.ink}" opacity=".92">
        <circle cx="24" cy="24" r="9"/><circle cx="72" cy="72" r="9"/>
        ${[0, 60, 120, 180, 240, 300].map((a) => `<circle cx="${24 + 16 * Math.cos((a * Math.PI) / 180)}" cy="${24 + 16 * Math.sin((a * Math.PI) / 180)}" r="3"/>`).join("")}
        ${[30, 90, 150, 210, 270, 330].map((a) => `<circle cx="${72 + 16 * Math.cos((a * Math.PI) / 180)}" cy="${72 + 16 * Math.sin((a * Math.PI) / 180)}" r="3"/>`).join("")}
        <circle cx="72" cy="24" r="2.2"/><circle cx="24" cy="72" r="2.2"/>
      </g>
      <g fill="${c.ground}"><circle cx="24" cy="24" r="3.5"/><circle cx="72" cy="72" r="3.5"/></g>`,
  }),
  sanganeri: (c) => ({
    size: 110,
    body: `<rect width="110" height="110" fill="${c.ground}"/>
      ${[[28, 30], [83, 85]].map(([x, y]) => `
        <g transform="translate(${x} ${y})">
          <path d="M0 6 C-10 14 -12 22 -4 26" stroke="${c.leaf}" stroke-width="2.2" fill="none"/>
          <ellipse cx="-7" cy="18" rx="6" ry="3" transform="rotate(-40 -7 18)" fill="${c.leaf}"/>
          <ellipse cx="5" cy="15" rx="6" ry="3" transform="rotate(35 5 15)" fill="${c.leaf}"/>
          ${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-7" rx="5.5" ry="8" transform="rotate(${a})" fill="${c.ink}"/>`).join("")}
          <circle r="3.4" fill="${c.accent}"/>
        </g>`).join("")}
      <circle cx="83" cy="28" r="2" fill="${c.leaf}"/><circle cx="28" cy="83" r="2" fill="${c.leaf}"/>`,
  }),
  bagru: (c) => ({
    size: 84,
    body: `<rect width="84" height="84" fill="${c.ground}"/>
      <g transform="translate(42 42)">
        ${[0, 45, 90, 135].map((a) => `<rect x="-3" y="-17" width="6" height="34" rx="3" transform="rotate(${a})" fill="${c.ink}"/>`).join("")}
        <circle r="7" fill="${c.accent}"/><circle r="3" fill="${c.ground}"/>
      </g>
      <g fill="${c.accent}" opacity=".85">${[[0, 0], [84, 0], [0, 84], [84, 84]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6"/>`).join("")}</g>
      <path d="M42 0 V10 M42 74 V84 M0 42 H10 M74 42 H84" stroke="${c.ink}" stroke-width="2"/>`,
  }),
  ajrakh: (c) => ({
    size: 100,
    body: `<rect width="100" height="100" fill="${c.ground}"/>
      <rect x="6" y="6" width="88" height="88" fill="none" stroke="${c.ink}" stroke-width="3"/>
      <g transform="translate(50 50)">
        <path d="${star(8, 34, 15)}" fill="${c.ink}"/>
        <path d="${star(8, 20, 10)}" fill="${c.accent}"/>
        <circle r="6" fill="${c.ground}"/>
      </g>
      <g fill="${c.accent}">${[[6, 6], [94, 6], [6, 94], [94, 94]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5"/>`).join("")}</g>`,
  }),
  // Seamless: wave period = tile width, 5 bands x 24px = tile height. Rotated diagonally where used.
  leheriya: (c) => ({
    size: 120,
    body: `<rect width="120" height="120" fill="${c.ground}"/>
      <g fill="none" stroke-width="8" stroke-linecap="butt">
        ${[0, 1, 2, 3, 4].map((i) => `<path d="M0 ${12 + i * 24} Q 30 ${2 + i * 24} 60 ${12 + i * 24} T 120 ${12 + i * 24}" stroke="${[c.ink, c.accent, c.leaf, c.accent, c.ink][i]}" opacity=".85"/>`).join("")}
      </g>`,
    rotate: -28,
  }),
  kalamkari: (c) => ({
    size: 150,
    body: `<rect width="150" height="150" fill="${c.ground}"/>
      ${[[40, 45, 0], [112, 118, 180]].map(([x, y, r]) => `
        <g transform="translate(${x} ${y}) rotate(${r})">
          <path d="M0 -26 C 22 -26 26 6 6 18 C -8 26 -22 16 -18 2 C -14 -10 0 -8 0 0" fill="${c.ink}"/>
          <path d="M0 -18 C 14 -18 16 2 4 10" fill="none" stroke="${c.ground}" stroke-width="2"/>
          <circle cx="-4" cy="2" r="4" fill="${c.accent}"/>
        </g>`).join("")}
      <path d="M100 30 c 10 6 10 16 0 22 M50 110 c -10 6 -10 16 0 22" stroke="${c.leaf}" stroke-width="3" fill="none"/>
      <g fill="${c.leaf}"><circle cx="118" cy="40" r="3"/><circle cx="32" cy="122" r="3"/></g>`,
  }),
  paisley: (c) => ({
    size: 130,
    body: `<rect width="130" height="130" fill="${c.ground}"/>
      ${[[38, 40, -20], [100, 104, 160]].map(([x, y, r]) => `
        <g transform="translate(${x} ${y}) rotate(${r})">
          <path d="M0 -28 C 20 -28 24 0 10 14 C 2 22 -12 22 -16 12 C -22 -2 -8 -8 0 -2 C 6 2 4 10 -2 10" fill="none" stroke="${c.ink}" stroke-width="3"/>
          <path d="M0 -28 C -14 -20 -18 -6 -16 12" fill="none" stroke="${c.ink}" stroke-width="3"/>
          <circle cx="2" cy="-8" r="4" fill="${c.accent}"/>
          ${[-22, -14, -6, 2].map((yy, i) => `<circle cx="${14 - i}" cy="${yy}" r="1.6" fill="${c.leaf}"/>`).join("")}
        </g>`).join("")}
      <g fill="${c.leaf}" opacity=".7"><circle cx="100" cy="30" r="2.5"/><circle cx="30" cy="100" r="2.5"/></g>`,
  }),
  bandhani: (c) => ({
    size: 72,
    body: `<rect width="72" height="72" fill="${c.ground}"/>
      ${[[18, 18], [54, 54]].map(([x, y]) => `<g transform="translate(${x} ${y})" fill="${c.ink}">${[0, 60, 120, 180, 240, 300].map((a) => `<circle cx="${9 * Math.cos((a * Math.PI) / 180)}" cy="${9 * Math.sin((a * Math.PI) / 180)}" r="2"/>`).join("")}<circle r="2.2" fill="${c.accent}"/></g>`).join("")}
      <g fill="${c.ink}" opacity=".7"><circle cx="54" cy="18" r="1.6"/><circle cx="18" cy="54" r="1.6"/></g>`,
  }),
  ikat: (c) => ({
    size: 96,
    body: `<rect width="96" height="96" fill="${c.ground}"/>
      <g opacity=".9">${[0, 48].map((y) => `<path d="M0 ${y + 24} L24 ${y} L48 ${y + 24} L72 ${y} L96 ${y + 24} L72 ${y + 48} L48 ${y + 24} L24 ${y + 48} Z" fill="none" stroke="${c.ink}" stroke-width="6" stroke-dasharray="10 4"/>`).join("")}</g>
      <g fill="${c.accent}"><circle cx="48" cy="24" r="4"/><circle cx="0" cy="72" r="4"/><circle cx="96" cy="72" r="4"/></g>`,
  }),
  zari: (c) => ({
    size: 110,
    body: `<rect width="110" height="110" fill="${c.ground}"/>
      <g fill="${c.accent}">
        <g transform="translate(27 27)"><path d="M0 -7 L2 -2 L7 0 L2 2 L0 7 L-2 2 L-7 0 L-2 -2 Z"/></g>
        <g transform="translate(82 82)"><path d="M0 -7 L2 -2 L7 0 L2 2 L0 7 L-2 2 L-7 0 L-2 -2 Z"/></g>
      </g>`,
  }),
  chevron: (c) => ({
    size: 80,
    body: `<rect width="80" height="80" fill="${c.ground}"/>
      ${[0, 1, 2, 3].map((i) => `<path d="M0 ${10 + i * 20} L20 ${i * 20} L40 ${10 + i * 20} L60 ${i * 20} L80 ${10 + i * 20}" fill="none" stroke="${[c.ink, c.accent][i % 2]}" stroke-width="5"/>`).join("")}`,
  }),
  stripes: (c) => ({
    size: 60,
    body: `<rect width="60" height="60" fill="${c.ground}"/><rect x="0" width="10" height="60" fill="${c.ink}"/><rect x="30" width="4" height="60" fill="${c.accent}"/>`,
    rotate: 0,
  }),
  check: (c) => ({
    size: 64,
    body: `<rect width="64" height="64" fill="${c.ground}"/>
      <g opacity=".75"><rect x="0" y="0" width="64" height="12" fill="${c.ink}"/><rect x="0" y="0" width="12" height="64" fill="${c.ink}"/></g>
      <g opacity=".5"><rect x="0" y="36" width="64" height="3" fill="${c.accent}"/><rect x="36" y="0" width="3" height="64" fill="${c.accent}"/></g>`,
  }),
  polka: (c) => ({
    size: 56,
    body: `<rect width="56" height="56" fill="${c.ground}"/><circle cx="14" cy="14" r="6" fill="${c.ink}"/><circle cx="42" cy="42" r="6" fill="${c.ink}"/>`,
  }),
  bigfloral: (c) => ({
    size: 180,
    body: `<rect width="180" height="180" fill="${c.ground}"/>
      ${[[50, 55, 1], [135, 130, 0.8]].map(([x, y, k]) => `<g transform="translate(${x} ${y}) scale(${k})">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-22" rx="14" ry="22" transform="rotate(${a})" fill="${c.ink}"/>`).join("")}<circle r="12" fill="${c.accent}"/></g>`).join("")}
      <path d="M100 40 q 20 10 10 30 M30 140 q -10 -20 10 -30" stroke="${c.leaf}" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  }),
  solid: (c) => ({
    size: 40,
    body: `<rect width="40" height="40" fill="${c.ground}"/><path d="M0 20 H40" stroke="${c.ink}" stroke-opacity=".05" stroke-width="1"/>`,
  }),
  vine: (c) => ({
    size: 90,
    body: `<rect width="90" height="90" fill="${c.ground}"/>
      <path d="M0 45 C 22 20 45 70 90 45" stroke="${c.ink}" stroke-width="2.5" fill="none"/>
      <g fill="${c.ink}"><ellipse cx="22" cy="34" rx="7" ry="3.2" transform="rotate(-30 22 34)"/><ellipse cx="60" cy="56" rx="7" ry="3.2" transform="rotate(25 60 56)"/></g>
      <circle cx="45" cy="47" r="4" fill="${c.accent}"/>`,
  }),
};

function star(points, outer, inner) {
  let d = "";
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI * i) / points - Math.PI / 2;
    d += `${i ? "L" : "M"}${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
  }
  return d + "Z";
}

/** Garment silhouettes on a 1200×1500 canvas. Each is a list of {d, pattern?} parts (back to front). */
const SILHOUETTES = {
  kurtaStraight: () => [
    { d: "M470 250 Q600 330 730 250 L860 300 L960 640 L870 670 L800 470 L805 1310 Q600 1340 395 1310 L400 470 L330 670 L240 640 L340 300 Z" },
    { d: "M560 262 Q600 300 640 262 L640 330 Q600 350 560 330 Z", shade: 0.18 },
  ],
  kurtaAline: () => [
    { d: "M475 250 Q600 330 725 250 L850 300 L945 620 L860 650 L795 470 L880 1310 Q600 1350 320 1310 L405 470 L340 650 L255 620 L350 300 Z" },
    { d: "M470 470 Q600 500 730 470 L735 520 Q600 550 465 520 Z", shade: 0.05 },
  ],
  suitSet: () => [
    { d: "M470 1040 L730 1040 L760 1400 L640 1400 L600 1130 L560 1400 L440 1400 Z", alt: true },
    { d: "M480 230 Q600 300 720 230 L830 280 L920 600 L840 625 L780 450 L790 1080 Q600 1105 410 1080 L420 450 L360 625 L280 600 L370 280 Z" },
    { d: "M330 260 C 420 420 560 520 720 700 C 790 780 860 900 900 1120 L960 1110 C 930 880 850 740 770 650 C 610 470 470 350 390 230 Z", dupatta: true },
  ],
  saree: () => [
    { d: "M470 560 L730 560 L820 1400 Q600 1440 380 1400 Z" },
    ...[0, 1, 2, 3, 4].map((i) => ({ d: `M${520 + i * 34} 820 L${505 + i * 36} 1405 L${530 + i * 36} 1406 L${540 + i * 34} 820 Z`, shade: 0.14 })),
    { d: "M500 300 Q600 350 700 300 L760 340 L750 560 L450 560 L440 340 Z", alt: true },
    { d: "M700 300 C 820 380 860 600 880 900 L900 1180 L820 1200 C 800 900 760 640 640 520 C 600 480 560 440 520 420 Z", pallu: true },
  ],
  dupatta: () => [
    { d: "M300 250 L900 250", rod: true },
    { d: "M330 262 L870 262 C 880 600 900 900 930 1330 Q 780 1370 640 1320 Q 520 1380 380 1330 Q 300 1350 270 1330 C 300 900 320 600 330 262 Z" },
    ...Array.from({ length: 14 }, (_, i) => ({ d: `M${290 + i * 46} 1335 l -4 60 l 8 0 Z`, tassel: true })),
  ],
  coord: () => [
    { d: "M470 980 L730 980 L790 1400 L640 1400 L600 1080 L560 1400 L410 1400 Z", alt: true },
    { d: "M470 240 L560 240 L600 300 L640 240 L730 240 L850 290 L950 560 L870 590 L790 430 L800 1010 Q600 1030 400 1010 L410 430 L330 590 L250 560 L350 290 Z" },
    { d: "M560 240 L600 300 L640 240 L660 260 L600 340 L540 260 Z", shade: 0.25 },
    ...[400, 520, 640, 760, 880].map((y) => ({ d: `M595 ${y} a7 7 0 1 0 0.1 0 Z`, button: true })),
  ],
  anarkali: () => [
    { d: "M480 240 Q600 310 720 240 L820 290 L900 600 L825 620 L775 450 L760 560 C 900 800 980 1100 1000 1390 Q600 1450 200 1390 C 220 1100 300 800 440 560 L425 450 L375 620 L300 600 L380 290 Z" },
    { d: "M440 540 Q600 590 760 540 L766 580 Q600 630 434 580 Z", shade: 0.2 },
  ],
  lehenga: () => [
    { d: "M470 620 L730 620 C 860 900 960 1150 1010 1400 Q600 1460 190 1400 C 240 1150 340 900 470 620 Z" },
    ...[0, 1, 2, 3, 4, 5].map((i) => ({ d: `M${520 + i * 30} 660 L${360 + i * 96} 1405 L${375 + i * 96} 1410 L${535 + i * 30} 660 Z`, shade: 0.08 })),
    { d: "M480 340 Q600 390 720 340 L760 360 L750 560 Q600 600 450 560 L440 360 Z", alt: true },
    { d: "M740 350 C 860 420 900 640 930 900 L960 1250 L880 1270 C 860 960 820 700 700 560 Z", dupatta: true },
  ],
  shawl: () => [
    { d: "M250 300 L950 300 L950 330 C 900 700 880 1000 900 1300 L300 1300 C 320 1000 300 700 250 330 Z" },
    { d: "M250 300 L950 300 L950 360 L250 360 Z", alt: true },
    { d: "M300 1240 L900 1240 L900 1300 L300 1300 Z", alt: true },
    ...Array.from({ length: 18 }, (_, i) => ({ d: `M${312 + i * 33} 1300 l -3 50 l 6 0 Z`, tassel: true })),
  ],
  jacket: () => [
    { d: "M470 240 L560 240 L600 300 L640 240 L730 240 L840 290 L860 1080 Q600 1110 340 1080 L360 290 Z" },
    { d: "M560 240 L600 300 L640 240 L650 250 L604 1100 L596 1100 L550 250 Z", shade: 0.3 },
    ...[420, 520, 620, 720, 820, 920].map((y) => ({ d: `M612 ${y} a7 7 0 1 0 0.1 0 Z`, button: true })),
  ],
  tee: () => [
    { d: "M460 260 Q600 320 740 260 L900 340 L960 520 L850 560 L800 470 L800 1150 Q600 1180 400 1150 L400 470 L350 560 L240 520 L300 340 Z" },
    { d: "M520 272 Q600 320 680 272 L672 300 Q600 340 528 300 Z", shade: 0.25 },
  ],
  maxi: () => [
    { d: "M500 250 Q600 290 700 250 L720 300 L700 520 C 820 800 900 1100 920 1400 Q600 1450 280 1400 C 300 1100 380 800 500 520 L480 300 Z" },
    { d: "M490 250 L520 180 M710 250 L680 180", strap: true },
    { d: "M500 510 Q600 545 700 510 L702 545 Q600 580 498 545 Z", shade: 0.15 },
  ],
  palazzoSet: () => [
    { d: "M450 900 L750 900 L820 1400 L620 1400 L600 1020 L580 1400 L380 1400 Z", alt: true },
    { d: "M480 240 Q600 310 720 240 L830 290 L920 600 L840 625 L780 450 L790 960 Q600 990 410 960 L420 450 L360 625 L280 600 L370 290 Z" },
  ],
  dress: () => [
    { d: "M480 240 Q600 300 720 240 L820 290 L870 470 L800 490 L770 400 L760 620 L900 1350 Q600 1400 300 1350 L440 620 L430 400 L400 490 L330 470 L380 290 Z" },
    { d: "M480 240 L760 620 L720 640 L470 300 Z", shade: 0.2 },
    { d: "M440 610 Q600 650 760 610 L762 650 Q600 690 438 650 Z", shade: 0.22 },
  ],
};

/** Studio product shot: silhouette filled with the print, soft light, floor shadow. */
export function productSvg({ silhouette, print, colors, backdrop, view = "front" }) {
  const W = 1200;
  const H = 1500;
  if (view === "detail") return detailSvg({ print, colors, W, H });
  const p = PATTERNS[print](colors);
  const alt = PATTERNS[colors.altPrint ?? print]({ ...colors, ground: colors.altGround ?? colors.ground });
  const parts = SILHOUETTES[silhouette]();
  const scale = view === "back" ? 1.18 : 1;
  const shapes = parts
    .map((part) => {
      if (part.rod) return `<path d="${part.d}" stroke="#6b5a48" stroke-width="10" stroke-linecap="round"/>`;
      if (part.tassel) return `<path d="${part.d}" fill="${colors.accent}"/>`;
      if (part.button) return `<path d="${part.d}" fill="${colors.ground}" stroke="rgba(0,0,0,.25)" stroke-width="2"/>`;
      if (part.shade) return `<path d="${part.d}" fill="#000" opacity="${part.shade}"/>`;
      if (part.strap) return `<path d="${part.d}" stroke="${colors.ground}" stroke-width="8" stroke-linecap="round"/>`;
      const fill = part.alt ? "url(#alt)" : part.dupatta || part.pallu ? "url(#drape)" : "url(#print)";
      return `<path d="${part.d}" fill="${fill}"/><path d="${part.d}" fill="url(#fold)"/>`;
    })
    .join("");
  const drape = PATTERNS[colors.drapePrint ?? "leheriya"]({ ...colors, ground: colors.drapeGround ?? colors.accent });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="80%"><stop offset="0" stop-color="${backdrop[0]}"/><stop offset="1" stop-color="${backdrop[1]}"/></radialGradient>
    <linearGradient id="fold" x1="0" x2="1">
      <stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset=".18" stop-color="#fff" stop-opacity=".06"/>
      <stop offset=".42" stop-color="#000" stop-opacity=".08"/><stop offset=".6" stop-color="#fff" stop-opacity=".1"/>
      <stop offset=".82" stop-color="#000" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".26"/>
    </linearGradient>
    <pattern id="print" width="${p.size}" height="${p.size}" patternUnits="userSpaceOnUse" patternTransform="scale(${view === "back" ? 1.25 : 0.9}) rotate(${p.rotate ?? 0})">${p.body}</pattern>
    <pattern id="alt" width="${alt.size}" height="${alt.size}" patternUnits="userSpaceOnUse" patternTransform="scale(.6)">${alt.body}</pattern>
    <pattern id="drape" width="${drape.size}" height="${drape.size}" patternUnits="userSpaceOnUse" patternTransform="scale(.7) rotate(20)">${drape.body}</pattern>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="28"/></filter>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .05 0"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <ellipse cx="600" cy="1420" rx="380" ry="46" fill="#000" opacity=".16" filter="url(#soft)"/>
  <g transform="translate(600 800) scale(${scale}) translate(-600 -800)">
    <g transform="translate(14 22)" opacity=".18" filter="url(#soft)">${parts.filter((x) => !x.rod && !x.tassel && !x.shade && !x.button && !x.strap).map((x) => `<path d="${x.d}" fill="#000"/>`).join("")}</g>
    ${shapes}
  </g>
  <rect width="${W}" height="${H}" filter="url(#grain)"/>
</svg>`;
}

/** Fabric close-up: the print, gently draped with light and shadow bands. */
function detailSvg({ print, colors, W, H }) {
  const p = PATTERNS[print](colors);
  const bands = Array.from({ length: 7 }, (_, i) => {
    const x = -200 + i * 240;
    return `<path d="M${x} 0 C ${x + 140} 400 ${x - 60} 900 ${x + 120} ${H} L ${x + 250} ${H} C ${x + 70} 900 ${x + 270} 400 ${x + 130} 0 Z" fill="${i % 2 ? "#fff" : "#000"}" opacity="${i % 2 ? 0.07 : 0.13}"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <pattern id="print" width="${p.size}" height="${p.size}" patternUnits="userSpaceOnUse" patternTransform="scale(2.1) rotate(${(p.rotate ?? 0) - 8})">${p.body}</pattern>
    <filter id="blur"><feGaussianBlur stdDeviation="30"/></filter>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .07 0"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#print)"/>
  <g filter="url(#blur)">${bands}</g>
  <rect width="${W}" height="${H}" filter="url(#grain)"/>
</svg>`;
}

/** Wide editorial banner: hanging printed fabric panels, darker on the left for overlay text. */
export function bannerSvg({ panels, backdrop, width = 2400, height = 1200, textSide = "left" }) {
  const n = panels.length;
  const startX = textSide === "left" ? width * 0.42 : width * 0.06;
  const span = width * 0.52;
  const pw = span / n;
  const defs = panels
    .map((c, i) => {
      const p = PATTERNS[c.print](c);
      return `<pattern id="p${i}" width="${p.size}" height="${p.size}" patternUnits="userSpaceOnUse" patternTransform="scale(1.1) rotate(${p.rotate ?? 0})">${p.body}</pattern>`;
    })
    .join("");
  const cloth = panels
    .map((_, i) => {
      const x = startX + i * pw;
      const top = 120 + (i % 2) * 40;
      const d = `M${x} ${top} L${x + pw - 24} ${top} C ${x + pw} ${height * 0.5} ${x + pw - 50} ${height * 0.8} ${x + pw - 10} ${height + 20} L ${x - 20} ${height + 20} C ${x + 20} ${height * 0.8} ${x - 30} ${height * 0.5} ${x} ${top} Z`;
      return `<path d="${d}" transform="translate(18 26)" fill="#000" opacity=".22" filter="url(#soft)"/><path d="${d}" fill="url(#p${i})"/><path d="${d}" fill="url(#fold)"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1"><stop offset="0" stop-color="${backdrop[1]}"/><stop offset="1" stop-color="${backdrop[0]}"/></linearGradient>
    <linearGradient id="fold" x1="0" x2="1">
      <stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset=".3" stop-color="#fff" stop-opacity=".08"/>
      <stop offset=".65" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".32"/>
    </linearGradient>
    ${defs}
    <filter id="soft"><feGaussianBlur stdDeviation="22"/></filter>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="11"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .05 0"/></filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <path d="M${startX - 60} 110 L${startX + span + 40} 110" stroke="#5c4a39" stroke-width="12" stroke-linecap="round"/>
  ${cloth}
  <rect width="${width}" height="${height}" filter="url(#grain)"/>
</svg>`;
}
