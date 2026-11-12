// PreToolUse hook (matcher: Bash). Runs typecheck + tests just before a `git commit`.
// Exit code 2 blocks the command and feeds stderr back to Claude.
import { spawnSync } from "node:child_process";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let command = "";
try {
  command = JSON.parse(raw)?.tool_input?.command ?? "";
} catch {
  process.exit(0);
}

if (!/\bgit\s+(-\S+\s+)*commit\b/.test(command)) process.exit(0);

for (const script of ["typecheck", "test"]) {
  const r = spawnSync("npm", ["run", script, "--silent"], {
    encoding: "utf8",
    shell: true,
  });
  if (r.status !== 0) {
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n").slice(-40).join("\n");
    console.error(`Commit blocked: "npm run ${script}" failed.\n${out}`);
    process.exit(2);
  }
}
process.exit(0);
