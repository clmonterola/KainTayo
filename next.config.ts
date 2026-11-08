import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

/**
 * Build output directory (`.next` by default).
 *
 * OneDrive rewrites everything inside the synced folder as a cloud "reparse
 * point", and Next.js calls `fs.readlink` on the previous build output while
 * starting up. On those OneDrive placeholders the call fails with EINVAL and
 * the dev server / build crashes. Pointing `NEXT_DIST_DIR` (set in
 * `.env.local`, which is git-ignored) outside the synced folder keeps
 * `npm run dev` and `npm run build` reliable.
 *
 * Everything here is inert without that variable: the default remains `.next`,
 * so a fresh clone and any deploy behave exactly as usual.
 */
function prepareDistDir(absoluteDist: string): void {
  const projectModules = path.join(process.cwd(), "node_modules");

  // The link deliberately lives one level ABOVE the build directory: `next dev`
  // wipes the build directory when it hands over from a production build, and
  // a link inside it would be deleted before it is ever used.
  const base = path.dirname(absoluteDist);
  const link = path.join(base, "node_modules");

  try {
    fs.mkdirSync(base, { recursive: true });
  } catch (error) {
    console.warn(
      `[next.config] could not create ${base}: ${(error as Error).message}`,
    );
    return;
  }

  // Already linked (a junction reports as a symlink), or a real directory that
  // is not ours — leave both alone.
  try {
    fs.lstatSync(link);
    return;
  } catch {
    // Not there yet: link it below.
  }

  try {
    // A junction needs no admin rights and lets the compiled output and the
    // generated route types resolve `react` / `next` as usual.
    fs.symlinkSync(
      projectModules,
      link,
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    console.warn(
      `[next.config] could not link node_modules into ${base}: ${
        (error as Error).message
      }`,
    );
  }
}

function resolveDistDir(): string {
  const configured = process.env.NEXT_DIST_DIR?.trim();
  if (!configured) return ".next";

  const absolute = path.resolve(configured);
  const relative = path.relative(process.cwd(), absolute);

  // Next joins the project directory with this value, so it must be relative
  // (and on the same drive) to survive.
  if (!relative || path.isAbsolute(relative)) return ".next";

  prepareDistDir(absolute);
  return relative;
}

const nextConfig: NextConfig = {
  distDir: resolveDistDir(),
  eslint: { ignoreDuringBuilds: true },
  images: { remotePatterns: [] },
  poweredByHeader: false,
};

export default nextConfig;
