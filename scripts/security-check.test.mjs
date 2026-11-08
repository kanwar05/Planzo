import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { scanRepository, scanText } from "./security-check.mjs";

test("secret scanner detects credential shapes without returning matching contents", () => {
  const token = ["ghp_", "a".repeat(36)].join("");
  assert.deepEqual(scanText(`const credential = '${token}'`), ["github_token"]);
  assert.deepEqual(scanText("mongodb://private:secret@unreachable.invalid/staging"), []);
  assert.deepEqual(scanText(["mongodb://", "actual-user:actual-secret@", "database.internal/app"].join("")), ["mongodb_credential_uri"]);
});

test("repository scan covers untracked source and deleted history while reporting private env paths only", () => {
  const prefix = path.join(tmpdir(), "planzo-secret-scan-");
  const cwd = mkdtempSync(prefix);
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, "Fixture Git command failed.");
  };
  try {
    git("init", "--quiet");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.invalid");
    writeFileSync(path.join(cwd, ".env.production"), "PRIVATE_SENTINEL=do-not-return-this-value\n");
    writeFileSync(path.join(cwd, "old.js"), `export const token = '${["ghp_", "x".repeat(36)].join("")}';\n`);
    git("add", ".");
    git("commit", "--quiet", "-m", "Fixture historical files");
    git("rm", "--quiet", ".env.production", "old.js");
    git("commit", "--quiet", "-m", "Fixture removes files");
    mkdirSync(path.join(cwd, "src"));
    writeFileSync(path.join(cwd, "src", "new.js"), `export const token = '${["npm_", "z".repeat(36)].join("")}';\n`);
    const result = scanRepository({ cwd, includeUntracked: true, history: true });
    assert.ok(result.issues.some((issue) => issue.file === ".env.production" && issue.scope === "history" && issue.rule === "private_env_file"));
    assert.ok(result.issues.some((issue) => issue.file === "old.js" && issue.scope === "history" && issue.rule === "github_token"));
    assert.ok(result.issues.some((issue) => issue.file === "src/new.js" && issue.scope === "working_tree" && issue.rule === "npm_token"));
    assert.doesNotMatch(JSON.stringify(result), /do-not-return|PRIVATE_SENTINEL|ghp_x{36}|npm_z{36}/);
  } finally {
    if (!path.resolve(cwd).startsWith(path.resolve(prefix))) throw new Error("Unsafe fixture cleanup path.");
    rmSync(cwd, { recursive: true, force: true });
  }
});
