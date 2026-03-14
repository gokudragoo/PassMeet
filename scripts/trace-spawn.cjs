// Debug helper: prints child_process spawn/fork/execFile calls.
// Use with: NODE_OPTIONS="--require=./scripts/trace-spawn.cjs" next build
// Keep lightweight and side-effect free for normal runs (only active when required).

const cp = require("node:child_process");

function safe(v) {
  try {
    return typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function wrap(fnName) {
  const orig = cp[fnName];
  if (typeof orig !== "function") return;
  cp[fnName] = function (...args) {
    const [command, argv] = args;
    const cmdStr = safe(command);
    const argsStr = Array.isArray(argv) ? argv.map(safe).join(" ") : safe(argv);
    // eslint-disable-next-line no-console
    console.log(`[trace-spawn] ${fnName}: ${cmdStr} ${argsStr}`);
    return orig.apply(this, args);
  };
}

wrap("spawn");
wrap("spawnSync");
wrap("execFile");
wrap("execFileSync");
wrap("fork");

