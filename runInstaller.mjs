#!/usr/bin/env node
import { execFileSync } from "child_process";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { BRAND, INSTALLER_BIN_DIR, INSTALLER_EXE_BASE } from "./lib/paths.mjs";
import { fail } from "./lib/util.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const exeName = process.platform === "win32"
    ? `${INSTALLER_EXE_BASE}.exe`
    : INSTALLER_EXE_BASE;
const exePath = join(INSTALLER_BIN_DIR, exeName);

const args = process.argv.indexOf("--") === -1
    ? []
    : process.argv.slice(process.argv.indexOf("--") + 1);

if (!args.length) {
    console.log(`[${BRAND}] Usage: node runInstaller.mjs -- --install|--repair|--uninstall`);
    process.exit(0);
}

if (!existsSync(exePath)) {
    console.log(`[${BRAND}] Custom installer not built yet. Building now...`);
    execFileSync("node", [join(__dirname, "buildInstaller.mjs")], {
        stdio: "inherit",
        shell: process.platform === "win32"
    });
}

try {
    execFileSync(exePath, args, {
        stdio: "inherit",
        shell: process.platform === "win32"
    });
} catch {
    fail("Installer flow failed. Close Discord and try again.");
}
