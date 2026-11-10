import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Discover every suite, including attribution and entitlements, which do not
// belong to one of the focused feature runners. Keep generated JS out of Git.
const files = readdirSync("tests").sort();
const typescriptTests = files.filter((file) => file.endsWith(".test.ts"));
const javascriptTests = files.filter((file) => file.endsWith(".test.mjs"));
const outputDirectory = mkdtempSync(join(tmpdir(), "sayback-tests-"));

try {
  execFileSync(join(process.cwd(), "node_modules", ".bin", "tsc"), [
    "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext",
    "--esModuleInterop", "--strict", "--skipLibCheck", "--types", "node",
    "--outDir", outputDirectory, "--rootDir", process.cwd(),
    ...typescriptTests.map((file) => join("tests", file)),
  ], { stdio: "inherit" });

  execFileSync(process.execPath, ["--test",
    ...typescriptTests.map((file) => join(outputDirectory, "tests", file.replace(/\.ts$/, ".js"))),
    ...javascriptTests.map((file) => join("tests", file)),
  ], { stdio: "inherit" });
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
