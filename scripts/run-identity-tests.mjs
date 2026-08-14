import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const outputDirectory = mkdtempSync(join(tmpdir(), "sayback-identity-tests-"));

try {
  execFileSync(
    join(process.cwd(), "node_modules", ".bin", "tsc"),
    [
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--esModuleInterop",
      "--strict",
      "--skipLibCheck",
      "--types",
      "node",
      "--outDir",
      outputDirectory,
      "--rootDir",
      process.cwd(),
      "lib/visitor-identity.ts",
      "lib/visitor-account-link.ts",
      "tests/visitor-identity.test.ts",
    ],
    { stdio: "inherit" },
  );

  execFileSync(process.execPath, ["--test", join(outputDirectory, "tests", "visitor-identity.test.js")], {
    stdio: "inherit",
  });
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
