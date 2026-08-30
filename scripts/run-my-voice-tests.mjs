import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const outputDirectory = mkdtempSync(join(tmpdir(), "sayback-my-voice-tests-"));

try {
  execFileSync(
    join(process.cwd(), "node_modules", ".bin", "tsc"),
    [
      "--target", "ES2022",
      "--module", "NodeNext",
      "--moduleResolution", "NodeNext",
      "--esModuleInterop",
      "--strict",
      "--skipLibCheck",
      "--types", "node",
      "--outDir", outputDirectory,
      "--rootDir", process.cwd(),
      "lib/my-voice-types.ts",
      "lib/my-voice-logic.ts",
      "lib/my-voice-validation.ts",
      "lib/persisted-usage-privacy.ts",
      "tests/my-voice.test.ts",
    ],
    { stdio: "inherit" },
  );

  execFileSync(
    process.execPath,
    ["--test", join(outputDirectory, "tests", "my-voice.test.js")],
    { stdio: "inherit" },
  );
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
