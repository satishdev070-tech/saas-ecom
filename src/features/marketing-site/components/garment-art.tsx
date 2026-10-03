import type { PlateArt } from "../content";

/** Flat "studio plate" illustration for demo products (decorative; no text). */
export function GarmentArt({ art, className }: { art: PlateArt; className?: string }) {
  const { garment, backdrop, ink, detail } = art;
  return (
    <svg viewBox="0 0 120 150" className={className} aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid slice">
      <rect width="120" height="150" fill={backdrop} />
      <ellipse cx="60" cy="140" rx="34" ry="5" fill="#000" opacity="0.06" />
      {garment === "saree" ? (
        <g>
          <path d="M38 22h44l10 112H28z" fill={ink} />
          <path d="M82 22 28 110v24l64-90z" fill={detail} opacity="0.85" />
          <path d="M28 128h64v6H28z" fill={detail} />
        </g>
      ) : garment === "lehenga" ? (
        <g>
          <path d="M44 20h32l4 34H40z" fill={detail} />
          <path d="M40 54h40l26 80H14z" fill={ink} />
          <path d="M14 126h92l2 8H12z" fill={detail} />
          <path d="M60 58v74M40 60l-14 70M80 60l14 70" stroke={detail} strokeWidth="1.5" opacity="0.6" />
        </g>
      ) : garment === "jhumka" ? (
        <g>
          <circle cx="60" cy="40" r="8" fill={detail} />
          <path d="M60 48v10" stroke={ink} strokeWidth="2" />
          <path d="M36 92a24 30 0 0 1 48 0z" fill={ink} />
          <path d="M36 92h48" stroke={detail} strokeWidth="3" />
          {[40, 48, 56, 64, 72, 80].map((x) => (
            <circle key={x} cx={x} cy="100" r="3" fill={detail} />
          ))}
        </g>
      ) : garment === "potli" ? (
        <g>
          <path d="M44 50c-12 18-14 60 16 64 30-4 28-46 16-64z" fill={ink} />
          <path d="M44 50h32l-6-10H50z" fill={detail} />
          <path d="M52 40c-8-14 24-14 16 0" stroke={detail} strokeWidth="2" fill="none" />
          <circle cx="60" cy="84" r="9" fill="none" stroke={detail} strokeWidth="2" />
        </g>
      ) : garment === "shirt" ? (
        <g>
          <path d="M42 22 22 36l8 18 10-6v82h40V48l10 6 8-18-20-14c-4 8-10 10-18 10s-14-2-18-10z" fill={ink} />
          <path d="M60 32v98" stroke={detail} strokeWidth="1.5" />
          {[50, 70, 90, 110].map((y) => (
            <circle key={y} cx="63" cy={y} r="1.6" fill={detail} />
          ))}
        </g>
      ) : (
        <g>
          <path d={garment === "anarkali" ? "M44 20h32l6 30 26 84H12l26-84z" : "M44 20h32l14 12-8 14-4-4v92H42V42l-4 4-8-14z"} fill={ink} />
          <path d="M52 20c2 8 14 8 16 0" stroke={detail} strokeWidth="2" fill="none" />
          <path d="M60 28v26" stroke={detail} strokeWidth="1.5" />
          {garment === "anarkali" ? <path d="M16 126h88" stroke={detail} strokeWidth="4" /> : <path d="M42 126h36" stroke={detail} strokeWidth="4" />}
          {[64, 82, 100].map((y) => (
            <circle key={y} cx={50} cy={y} r="2" fill={detail} opacity="0.7" />
          ))}
          {[72, 90, 108].map((y) => (
            <circle key={y} cx={70} cy={y} r="2" fill={detail} opacity="0.7" />
          ))}
        </g>
      )}
    </svg>
  );
}
