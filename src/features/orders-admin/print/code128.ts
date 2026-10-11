/**
 * Code 128 (subset B) barcode as bar widths. PURE, unit tested. Used on printed shipping labels
 * so couriers and the seller can scan the order number. Subset B covers printable ASCII 32–126.
 */

// Bar/space widths for symbol values 0–106 (each 6 elements; STOP has 7, handled separately).
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232",
];
const START_B = 104;
const STOP = "2331112";

/** Element widths (bar, space, bar, …) for `text`, or null if it has characters outside subset B. */
export function code128B(text: string): number[] | null {
  if (!text || text.length > 48) return null;
  const values: number[] = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) return null;
    values.push(code - 32);
  }
  let checksum = START_B;
  values.forEach((v, i) => (checksum += v * (i + 1)));
  const symbols = [START_B, ...values, checksum % 103];
  const widths: number[] = [];
  for (const s of symbols) for (const c of PATTERNS[s]!) widths.push(Number(c));
  for (const c of STOP) widths.push(Number(c));
  return widths;
}

/** Bars as {x, w} rectangles in module units, plus the total width (incl. 10-module quiet zones). */
export function code128Bars(text: string): { bars: { x: number; w: number }[]; width: number } | null {
  const widths = code128B(text);
  if (!widths) return null;
  const quiet = 10;
  let x = quiet;
  const bars: { x: number; w: number }[] = [];
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  });
  return { bars, width: x + quiet };
}
