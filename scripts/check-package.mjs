import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const npm = process.env.npm_execpath;
const tsc = fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url));
const directory = await mkdtemp(join(tmpdir(), "snow-letters-package-"));

try {
  const metadata = execFileSync(
    process.execPath,
    [npm, "pack", "--json", "--pack-destination", directory],
    {
      encoding: "utf8",
    },
  );
  const [pack] = JSON.parse(metadata);
  assert.deepEqual(pack.files.map(({ path }) => path).sort(), [
    "LICENSE",
    "README.md",
    "dist/snowLetters.d.ts",
    "dist/snowLetters.js",
    "package.json",
  ]);

  const tarball = join(directory, pack.filename);
  execFileSync(
    process.execPath,
    [npm, "install", "--ignore-scripts", "--no-package-lock", "--offline", tarball],
    {
      cwd: directory,
      stdio: "inherit",
    },
  );
  await writeFile(
    join(directory, "check.mjs"),
    `
    import assert from 'node:assert/strict';
    import { startSnowLetters } from '${pack.name}';
    assert.equal(typeof startSnowLetters, 'function');
  `,
  );
  await writeFile(
    join(directory, "check.mts"),
    `
    import { startSnowLetters, type SnowLettersOptions } from '${pack.name}';
    const options: SnowLettersOptions = { selector: 'h1' };
    const stop: () => void = startSnowLetters(options);
  `,
  );
  execFileSync(process.execPath, ["check.mjs"], { cwd: directory, stdio: "inherit" });
  execFileSync(
    process.execPath,
    [tsc, "--noEmit", "--strict", "--module", "nodenext", "check.mts"],
    {
      cwd: directory,
      stdio: "inherit",
    },
  );
  console.log(`Verified ${pack.id} tarball, ESM export, and TypeScript declarations.`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
