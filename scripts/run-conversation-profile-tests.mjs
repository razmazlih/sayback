import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const outputDirectory = mkdtempSync(join(tmpdir(), "sayback-conversation-tests-"));

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
      "lib/generator-options.ts",
      "lib/conversation-profile-types.ts",
      "lib/conversation-profile-validation.ts",
      "lib/conversation-profile-parser.ts",
      "lib/relationship-memory.ts",
      "tests/conversation-profile-validation.test.ts",
      "tests/relationship-memory.test.ts",
    ],
    { stdio: "inherit" },
  );

  execFileSync(
    process.execPath,
    ["--test",
      join(outputDirectory, "tests", "conversation-profile-validation.test.js"),
      join(outputDirectory, "tests", "relationship-memory.test.js")],
    { stdio: "inherit" },
  );
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
