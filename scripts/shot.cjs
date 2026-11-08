const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");
const electronPath = require("electron");

const out = path.resolve(root, process.argv[2] || "shots/app.png");
const view = process.argv[3] || "bounties";

const child = spawn(electronPath, ["."], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    SHRIKE_SCREENSHOT: out,
    SHRIKE_INITIAL_VIEW: view,
  },
});

child.on("exit", (code) => process.exit(code ?? 0));
