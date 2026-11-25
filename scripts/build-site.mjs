import { cp, mkdir, rm } from "node:fs/promises";

const output = new URL("../dist-site/", import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output);
await cp(new URL("../site/", import.meta.url), output, { recursive: true });
await cp(new URL("../dist/snowLetters.js", import.meta.url), new URL("snowLetters.js", output));
