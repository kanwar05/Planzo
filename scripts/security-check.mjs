import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rules = [
  ["private_key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["github_token", /\b(?:gh[pousr]_[A-Za-z0-9]{30,255}|github_pat_[A-Za-z0-9_]{60,255})\b/],
  ["aws_access_key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["npm_token", /\bnpm_[A-Za-z0-9]{36}\b/],
  ["google_api_key", /\bAIza[A-Za-z0-9_-]{35}\b/],
  ["stripe_secret", /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/],
  ["literal_jwt", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}\b/],
];
const privateEnv = (filename) => /^\.env(?:\.|$)/.test(path.posix.basename(filename)) &&
  ![".env.example", ".env.template"].includes(path.posix.basename(filename));
const textFile = (filename) => /(?:\.(?:[cm]?js|jsx|ts|tsx|json|ya?ml|md|txt|html|css|sh|ps1|toml|ini|conf|pem|key)|\.env\.(?:example|template)|\.npmrc|\.nvmrc|\.gitignore)$/.test(filename);

export function scanText(text) {
  const found = rules.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  const credentialUris = text.match(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+:[^\s"'<>]+@[^\s"'<>]+/g) || [];
  for (const uri of credentialUris) {
    let placeholder = false;
    try {
      const parsed = new URL(uri);
      placeholder = /(?:\.invalid|\.example)$/.test(parsed.hostname) ||
        ["username", "user", "placeholder", "<username>"].includes(decodeURIComponent(parsed.username));
    } catch { /* A malformed credential URI still needs review. */ }
    if (!placeholder) found.push("mongodb_credential_uri");
  }
  return [...new Set(found)];
}

function git(args, cwd, maximum = 32 * 1024 * 1024) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: maximum, windowsHide: true });
  if (result.status !== 0 || result.error) throw new Error("Repository scan could not complete a Git read.");
  return result.stdout;
}

export function scanRepository({ cwd = root, includeUntracked = false, history = false } = {}) {
  const issues = new Map();
  const add = (filename, rule, scope) => issues.set(`${scope}:${filename}:${rule}`, { file: filename, rule, scope });
  const files = git(["ls-files", "-z", "--cached", ...(includeUntracked ? ["--others", "--exclude-standard"] : [])], cwd)
    .split("\0").filter(Boolean);
  let scanned = 0;
  for (const filename of [...new Set(files)]) {
    if (privateEnv(filename)) {
      add(filename, "private_env_file", "working_tree");
      continue; // Never read private environment-file contents.
    }
    if (!textFile(filename)) continue;
    const absolute = path.resolve(cwd, filename);
    if (!absolute.startsWith(path.resolve(cwd) + path.sep)) throw new Error("Unsafe repository path.");
    let size;
    try { size = statSync(absolute).size; } catch { continue; } // A staged deletion has no working copy.
    if (size > 2 * 1024 * 1024) {
      add(filename, "text_file_exceeds_scan_limit", "working_tree");
      continue;
    }
    const contents = readFileSync(absolute, "utf8");
    for (const rule of scanText(contents)) add(filename, rule, "working_tree");
    scanned += 1;
  }
  if (history) {
    // Paths only: detect private env files without reading their historical values.
    const names = git(["log", "--all", "--format=", "--name-only", "-z"], cwd).split("\0").map((name) => name.trim()).filter(Boolean);
    for (const filename of names) if (privateEnv(filename)) add(filename, "private_env_file", "history");
    // Bounded full local history, excluding private env files and lockfile churn.
    // Only file names/rule names leave this process, never patch/matching text.
    const patch = git(["log", "--all", "--format=", "--no-ext-diff", "-p", "--", ".",
      ":(exclude)**/.env*", ":(exclude).env*", ":(exclude)**/package-lock.json", ":(exclude)package-lock.json"], cwd);
    let filename = "unknown";
    for (const line of patch.split("\n")) {
      if (line.startsWith("+++ b/") || line.startsWith("--- a/")) filename = line.slice(6).trim();
      else if (/^[+-]/.test(line) && !line.startsWith("+++ ") && !line.startsWith("--- ")) {
        for (const rule of scanText(line.slice(1))) add(filename, rule, "history");
      }
    }
  }
  return { scannedTextFiles: scanned, historyScanned: history, issues: [...issues.values()] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some((argument) => !["--all-files", "--history"].includes(argument))) throw new Error("Invalid scanner argument.");
    const result = scanRepository({ includeUntracked: args.includes("--all-files"), history: args.includes("--history") });
    console.log(JSON.stringify({ event: "repository_secret_scan", ...result }));
    if (result.issues.length) process.exitCode = 1;
  } catch {
    console.error(JSON.stringify({ event: "repository_secret_scan", error: "scan_incomplete" }));
    process.exitCode = 1;
  }
}
