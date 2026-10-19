import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function filesIn(directory) {
  return readdirSync(path.join(root, directory), {
    withFileTypes: true,
  }).flatMap((item) => {
    const filename = path.join(directory, item.name);
    return item.isDirectory()
      ? filesIn(filename)
      : filename.endsWith(".js")
        ? [filename]
        : [];
  });
}
const files = [
  "server.js",
  "admin.js",
  ...filesIn("src"),
  ...filesIn("scripts"),
  ...filesIn("test"),
];
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`Syntax checked ${files.length} JavaScript files.`);
