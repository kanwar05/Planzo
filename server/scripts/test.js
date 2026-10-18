import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cache = process.env.MONGOMS_DOWNLOAD_DIR || path.join(root, ".cache", "mongodb");
mkdirSync(cache, { recursive: true });
const files = process.argv.slice(2);
const tests = files.length ? files : readdirSync(path.join(root, "test")).filter((name) => name.endsWith(".test.js")).map((name) => path.join("test", name));
const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...tests], {
  cwd: root, stdio: "inherit",
  env: { ...process.env, NODE_ENV: "test", MONGOMS_DOWNLOAD_DIR: cache },
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
