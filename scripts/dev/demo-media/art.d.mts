type ArtColors = { ground: string; ink: string; accent: string; leaf: string; altGround?: string; altPrint?: string; drapePrint?: string; drapeGround?: string };
export function productSvg(spec: { silhouette: string; print: string; colors: ArtColors; backdrop: [string, string]; view?: "front" | "back" | "detail" }): string;
export function bannerSvg(spec: { panels: (ArtColors & { print: string })[]; backdrop: [string, string]; width?: number; height?: number; textSide?: "left" | "right" }): string;
