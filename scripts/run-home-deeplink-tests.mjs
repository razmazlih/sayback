import { mkdtempSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const outputDirectory = mkdtempSync(join(tmpdir(), "sayback-deeplink-tests-"));
try {
  cpSync("lib/home-deeplink.ts", join(outputDirectory, "lib", "home-deeplink.ts"), { recursive: false });
  cpSync("tests/home-deeplink.test.ts", join(outputDirectory, "tests", "home-deeplink.test.ts"), { recursive: false });
  cpSync("lib/attribution.ts", join(outputDirectory, "lib", "attribution.ts"), { recursive: false });
  cpSync("tests/attribution.test.ts", join(outputDirectory, "tests", "attribution.test.ts"), { recursive: false });
  const build = spawnSync("npx", ["tsc", "--target", "es2022", "--module", "nodenext", "--moduleResolution", "nodenext", "--outDir", outputDirectory, join(outputDirectory, "lib", "home-deeplink.ts"), join(outputDirectory, "lib", "attribution.ts"), join(outputDirectory, "tests", "home-deeplink.test.ts"), join(outputDirectory, "tests", "attribution.test.ts")], { stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
  const run = spawnSync("node", ["--test", join(outputDirectory, "tests", "home-deeplink.test.js"), join(outputDirectory, "tests", "attribution.test.js")], { stdio: "inherit" });
  process.exitCode = run.status ?? 1;
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
