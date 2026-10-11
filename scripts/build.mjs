#!/usr/bin/env node
/**
 * `pnpm run build`: picks the bundler the build machine can run.
 *
 * Next 16 builds with Turbopack, which needs Next's native compiler. Some hosts (Hostinger's
 * Node.js builds) run an old glibc (< 2.29), where the native compiler can't load and only the
 * WebAssembly one does: there Turbopack refuses to run, so we build with webpack instead. Those
 * hosts also don't let you change the build command, hence the detection here.
 *
 * Overrides: NEXT_BUNDLER=webpack | turbopack. Extra args are passed to `next build`.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

/** "2.28" -> true when older than 2.29 (the glibc Next's linux-x64-gnu compiler needs). */
export function glibcTooOld(version) {
  if (typeof version !== "string") return false;
  const [major, minor] = version.split(".").map(Number);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return false;
  return major < 2 || (major === 2 && minor < 29);
}

/** True when one of Next's native compiler packages for this machine loads (Linux only; elsewhere assume yes). */
export function nativeCompilerLoads(platform = process.platform, arch = process.arch) {
  if (platform !== "linux") return true;
  let req;
  try {
    // Resolve from next's own location: pnpm keeps the platform packages next to it, not at the top level.
    req = createRequire(createRequire(import.meta.url).resolve("next/package.json"));
  } catch {
    return true; // can't tell: let `next build` decide
  }
  for (const pkg of [`@next/swc-linux-${arch}-gnu`, `@next/swc-linux-${arch}-musl`]) {
    try {
      req(pkg);
      return true;
    } catch {
      // not installed, or can't load on this system (e.g. GLIBC_2.29 not found)
    }
  }
  return false;
}

export function chooseBundler(env = process.env, platform = process.platform, glibc = process.report?.getReport?.().header?.glibcVersionRuntime, nativeLoads = nativeCompilerLoads) {
  const forced = (env.NEXT_BUNDLER ?? "").toLowerCase();
  if (forced === "webpack" || forced === "turbopack") return { bundler: forced, reason: "NEXT_BUNDLER" };
  if (platform === "linux" && glibcTooOld(glibc)) return { bundler: "webpack", reason: `glibc ${glibc} is older than 2.29 (no native Next.js compiler)` };
  if (!nativeLoads()) return { bundler: "webpack", reason: "Next's native compiler can't load on this machine" };
  return { bundler: "turbopack", reason: "default" };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { bundler, reason } = chooseBundler();
  const args = ["build", ...(bundler === "webpack" ? ["--webpack"] : []), ...process.argv.slice(2)];
  console.log(`> next ${args.join(" ")}   (${bundler}: ${reason})`);
  const child = spawn(process.platform === "win32" ? "next.cmd" : "next", args, { stdio: "inherit", env: process.env });
  child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
  child.on("error", (err) => {
    console.error(err);
    process.exit(1);
  });
}
