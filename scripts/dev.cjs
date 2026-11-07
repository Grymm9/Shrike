const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const root = path.join(__dirname, "..");
// Vite 8 no longer exports ./bin/vite.js; resolve the package root instead.
const viteBin = path.join(path.dirname(require.resolve("vite/package.json")), "bin", "vite.js");
const electronPath = require("electron");

const vite = spawn(process.execPath, [viteBin, "--port", "5173", "--strictPort"], {
  cwd: root,
  stdio: "inherit",
});

let launched = false;

function launch() {
  if (launched) return;
  launched = true;
  const child = spawn(electronPath, ["."], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, VITE_DEV_SERVER_URL: "http://localhost:5173" },
  });
  child.on("exit", (code) => {
    try {
      vite.kill();
    } catch {
      /* ignore */
    }
    process.exit(code ?? 0);
  });
}

function waitForServer() {
  const req = http.get("http://localhost:5173", (res) => {
    res.resume();
    launch();
  });
  req.on("error", () => setTimeout(waitForServer, 250));
  req.setTimeout(1000, () => req.destroy());
}

vite.on("exit", (code) => {
  if (!launched) process.exit(code ?? 0);
});

waitForServer();
