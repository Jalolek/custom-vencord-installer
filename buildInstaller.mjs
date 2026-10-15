#!/usr/bin/env node
/**
 * Build a single self-contained CustomVencordInstaller.exe:
 * 1) Fetch public plugin list from https://jalolek.pro/public-plugins.php
 * 2) Sync those plugins into ./Vencord
 * 3) pnpm build
 * 4) Embed dist + compile Go installer with plugin checkboxes
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

import {
    BRAND,
    INSTALLER_BIN_DIR,
    INSTALLER_EXE_BASE,
    INSTALLER_SRC_DIR,
    USERPLUGINS_TARGET,
    VENCORD_DIR,
    WORK_ROOT
} from "./lib/paths.mjs";
import { DEFAULT_PLUGINS_API, fetchPublicPlugins } from "./lib/publicPluginsApi.mjs";
import {
    applyToastsCompat,
    distFileSizeMb,
    fail,
    log,
    run,
    setupWorkRepos,
    syncPluginsByIds
} from "./lib/util.mjs";

const DIST_FILES = ["patcher.js", "preload.js", "renderer.js", "renderer.css"];

setupWorkRepos();
applyToastsCompat();

const embedDir = join(INSTALLER_SRC_DIR, "vencord_dist");
const vencordDist = join(VENCORD_DIR, "dist");

log(`Fetching public plugins from ${DEFAULT_PLUGINS_API}`);
let api;
try {
    api = await fetchPublicPlugins(DEFAULT_PLUGINS_API);
} catch (e) {
    fail(e.message);
}
log(`API plugins (${api.ids.length}): ${api.ids.join(", ")}`);

log("Syncing API plugins into build Vencord...");
const synced = syncPluginsByIds(api.ids);

if (!existsSync(join(VENCORD_DIR, "node_modules"))) {
    log("pnpm install...");
    run("pnpm", ["install"], { cwd: VENCORD_DIR });
}

log(`Building Vencord with ${synced.length} plugin(s)...`);
run("pnpm", ["build"], { cwd: VENCORD_DIR });

for (const f of DIST_FILES) {
    if (!existsSync(join(vencordDist, f))) {
        fail(`Missing ${f} in ${vencordDist} after build`);
    }
}

if (!readdirSync(USERPLUGINS_TARGET).length) {
    fail(`No plugins under ${USERPLUGINS_TARGET} after sync`);
}

log("Preparing embed folder for Go...");
rmSync(embedDir, { recursive: true, force: true });
mkdirSync(embedDir, { recursive: true });
for (const f of DIST_FILES) {
    cpSync(join(vencordDist, f), join(embedDir, f));
}

for (const f of ["custom_env.go", "zz_custom_embed.go", "custom_plugins.go"]) {
    const src = join(WORK_ROOT, f);
    if (!existsSync(src)) fail(`Missing ${src}`);
    cpSync(src, join(INSTALLER_SRC_DIR, f));
}

for (const stale of [
    "chatencrypt_env.go",
    "zz_chatencrypt_embed.go",
    "chatencrypt_hook.go",
    "goonboy_env.go",
    "zz_goonboy_embed.go"
]) {
    const p = join(INSTALLER_SRC_DIR, stale);
    if (existsSync(p)) rmSync(p, { force: true });
}

mkdirSync(INSTALLER_BIN_DIR, { recursive: true });

const cli = process.argv.includes("--cli");
const exeName = process.platform === "win32"
    ? (cli ? `${INSTALLER_EXE_BASE}Cli.exe` : `${INSTALLER_EXE_BASE}.exe`)
    : (cli ? `${INSTALLER_EXE_BASE}Cli` : INSTALLER_EXE_BASE);
const out = join(INSTALLER_BIN_DIR, exeName);

run("go", ["version"], { cwd: INSTALLER_SRC_DIR });

const args = ["build", "-trimpath"];
if (cli) args.push("-tags", "cli");
args.push("-o", out);

log(`Compiling single-file installer (${cli ? "cli" : "gui"}) with plugin select UI...`);
log(`Embedded: ${readdirSync(embedDir).join(", ")}`);
log(`Plugins: ${synced.join(", ")}`);
run("go", args, { cwd: INSTALLER_SRC_DIR });

if (!existsSync(out)) fail(`Build did not produce ${out}`);

log(`Built ${out} (${distFileSizeMb(out)} MB)`);
log("This exe is standalone - recipients only need the .exe (Node/pnpm/git not required).");

writeFileSync(
    join(INSTALLER_BIN_DIR, "BUILD_INFO.txt"),
    `${BRAND} single-exe\n${new Date().toISOString()}\napi: ${DEFAULT_PLUGINS_API}\nplugins: ${synced.join(", ")}\n`,
    "utf8"
);
