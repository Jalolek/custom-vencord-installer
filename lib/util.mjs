import { spawnSync } from "child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { dirname, join } from "path";

import {
    BRAND,
    INSTALLER_BIN_DIR,
    INSTALLER_REPO,
    INSTALLER_SRC_DIR,
    PLUGIN_SKIP_NAMES,
    USERPLUGINS_SOURCE,
    USERPLUGINS_TARGET,
    VENCORD_DIR,
    VENCORD_REPO,
    WORK_ROOT,
    assertLiveVencord
} from "./paths.mjs";
const SHOW_TOAST_LINE =
    'export const showToast: t.showToast = findByCodeLazy(".currentToastMap.has(");';
const TOASTS_MARKER = "Custom installer: legacy Toasts";

export function log(msg) {
    console.log(`[${BRAND}] ${msg}`);
}

export function fail(msg) {
    console.error(`[${BRAND}] ERROR: ${msg}`);
    process.exit(1);
}

export function run(cmd, args, opts = {}) {
    const result = spawnSync(cmd, args, {
        cwd: opts.cwd ?? process.cwd(),
        stdio: "inherit",
        shell: process.platform === "win32",
        env: { ...process.env, ...opts.env }
    });
    if (result.status !== 0) {
        fail(`Command failed: ${cmd} ${args.join(" ")}`);
    }
}

export function requireTools() {
    for (const tool of ["git", "node", "pnpm"]) {
        if (spawnSync(tool, ["--version"], { shell: true }).status !== 0) {
            fail(`${tool} is required but was not found on PATH`);
        }
    }
}

export function cloneOrPull(dir, repo, label) {
    if (existsSync(join(dir, ".git"))) {
        log(`Updating ${label}...`);
        run("git", ["pull", "--ff-only"], { cwd: dir });
        return;
    }
    if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
    }
    mkdirSync(dirname(dir), { recursive: true });
    log(`Cloning ${label}...`);
    run("git", ["clone", "--depth", "1", repo, dir]);
}

/**
 * Copy selected plugin folders from live Vencord into the build tree.
 * Skips work/, .git, node_modules, dist inside each plugin.
 */
export function syncPluginsByIds(ids) {
    try {
        assertLiveVencord();
    } catch (e) {
        fail(e.message);
    }

    if (!Array.isArray(ids) || !ids.length) {
        fail("No plugin ids to sync");
    }

    log(`Syncing ${ids.length} plugin(s) from ${USERPLUGINS_SOURCE}`);

    if (existsSync(USERPLUGINS_TARGET)) {
        rmSync(USERPLUGINS_TARGET, { recursive: true, force: true });
    }
    mkdirSync(USERPLUGINS_TARGET, { recursive: true });

    const synced = [];
    for (const name of ids) {
        const src = join(USERPLUGINS_SOURCE, name);
        if (!existsSync(src)) {
            fail(`Plugin folder missing for API id "${name}": ${src}`);
        }
        const hasIndex =
            existsSync(join(src, "index.tsx")) ||
            existsSync(join(src, "index.ts")) ||
            existsSync(join(src, "index.jsx")) ||
            existsSync(join(src, "index.js"));
        if (!hasIndex) {
            fail(`Plugin "${name}" has no index file`);
        }

        const dst = join(USERPLUGINS_TARGET, name);
        mkdirSync(dst, { recursive: true });

        for (const child of readdirSync(src)) {
            if (PLUGIN_SKIP_NAMES.has(child)) continue;
            cpSync(join(src, child), join(dst, child), { recursive: true });
        }
        synced.push(name);
    }

    log(`Synced: ${synced.join(", ")}`);
    return synced;
}

/**
 * Current Vencord dropped the Toasts helper. Userplugins still import it.
 * Replace the new showToast export with a dual-compat implementation.
 */
export function applyToastsCompat() {
    const utilsPath = join(VENCORD_DIR, "src", "webpack", "common", "utils.ts");
    if (!existsSync(utilsPath)) {
        fail(`Missing ${utilsPath}`);
    }

    let src = readFileSync(utilsPath, "utf8");
    if (src.includes(TOASTS_MARKER) || src.includes("export const Toasts =")) {
        log("Toasts compat already present in Vencord webpack utils");
        return;
    }

    if (!src.includes(SHOW_TOAST_LINE)) {
        fail(`Could not find showToast export in ${utilsPath} to patch`);
    }

    const snippetPath = join(WORK_ROOT, "patches", "toastsCompat.snippet.ts");
    if (!existsSync(snippetPath)) {
        fail(`Missing ${snippetPath}`);
    }
    const snippet = readFileSync(snippetPath, "utf8").trimEnd() + "\n";

    src = src.replace(SHOW_TOAST_LINE, snippet);
    writeFileSync(utilsPath, src, "utf8");
    log("Patched webpack/common/utils.ts with Toasts compat");
}

export function setupWorkRepos() {
    requireTools();
    // Drop local patches so git pull can fast-forward, then re-apply.
    const utilsPath = join(VENCORD_DIR, "src", "webpack", "common", "utils.ts");
    if (existsSync(join(VENCORD_DIR, ".git")) && existsSync(utilsPath)) {
        spawnSync("git", ["checkout", "--", "src/webpack/common/utils.ts"], {
            cwd: VENCORD_DIR,
            shell: true,
            stdio: "ignore"
        });
    }
    if (existsSync(join(INSTALLER_SRC_DIR, ".git"))) {
        spawnSync("git", ["checkout", "--", "gui.go"], {
            cwd: INSTALLER_SRC_DIR,
            shell: true,
            stdio: "ignore"
        });
    }
    cloneOrPull(VENCORD_DIR, VENCORD_REPO, "Vencord");
    cloneOrPull(INSTALLER_SRC_DIR, INSTALLER_REPO, "Vencord Installer (source)");
    applyToastsCompat();
    writeInstallerOverlay();
    mkdirSync(INSTALLER_BIN_DIR, { recursive: true });
}

export function writeInstallerOverlay() {
    for (const f of ["custom_env.go", "zz_custom_embed.go", "custom_plugins.go"]) {
        const src = join(WORK_ROOT, f);
        const dst = join(INSTALLER_SRC_DIR, f);
        if (!existsSync(src)) {
            fail(`Missing ${src}`);
        }
        copyFileSync(src, dst);
    }

    const embedDir = join(INSTALLER_SRC_DIR, "vencord_dist");
    mkdirSync(embedDir, { recursive: true });
    const keep = join(embedDir, ".gitkeep");
    if (!existsSync(keep)) {
        writeFileSync(keep, "", "utf8");
    }

    for (const stale of [
        "chatencrypt_env.go",
        "zz_chatencrypt_embed.go",
        "chatencrypt_hook.go",
        "install-chatencrypt.mjs",
        "install-chatencrypt.ps1",
        "goonboy_env.go",
        "zz_goonboy_embed.go",
        "goonboy_hook.go"
    ]) {
        const p = join(INSTALLER_SRC_DIR, stale);
        if (existsSync(p)) rmSync(p, { force: true });
    }

    applyGuiPluginSelectPatch();
    log("Wrote single-exe installer overlay into Installer/");
}

/** Insert plugin checkboxes + settings write into upstream gui.go */
export function applyGuiPluginSelectPatch() {
    const guiPath = join(INSTALLER_SRC_DIR, "gui.go");
    if (!existsSync(guiPath)) {
        fail(`Missing ${guiPath}`);
    }

    // Reset first so pull/re-run stays clean
    spawnSync("git", ["checkout", "--", "gui.go"], {
        cwd: INSTALLER_SRC_DIR,
        shell: true,
        stdio: "ignore"
    });

    let src = readFileSync(guiPath, "utf8");
    const nl = src.includes("\r\n") ? "\r\n" : "\n";

    src = src.replace(
        'win = g.NewMasterWindow("Vencord Installer", 1200, 800, 0)',
        'win = g.NewMasterWindow("Custom Vencord Installer", 1200, 900, 0)'
    );

    if (!src.includes("RenderPluginSelect()")) {
        const needle =
            `\t\tg.Dummy(0, 20),${nl}${nl}` +
            `\t\tg.Style().SetFontSize(20).To(${nl}` +
            `\t\t\tg.Row(`;
        const insert =
            `\t\tg.Dummy(0, 20),${nl}${nl}` +
            `\t\tRenderPluginSelect(),${nl}${nl}` +
            `\t\tg.Dummy(0, 20),${nl}${nl}` +
            `\t\tg.Style().SetFontSize(20).To(${nl}` +
            `\t\t\tg.Row(`;
        if (!src.includes(needle)) {
            fail("Could not find Install button row in gui.go to insert plugin select");
        }
        src = src.replace(needle, insert);
    }

    if (!src.includes("ApplySelectedPluginSettings()")) {
        const needle = `\t} else {${nl}\t\tg.OpenPopup("#patched")${nl}\t}`;
        const insert =
            `\t} else {${nl}` +
            `\t\tApplySelectedPluginSettings()${nl}` +
            `\t\tg.OpenPopup("#patched")${nl}\t}`;
        if (!src.includes(needle)) {
            fail("Could not find Patch success handler in gui.go");
        }
        src = src.replace(needle, insert);
    }

    writeFileSync(guiPath, src, "utf8");
    log("Patched Installer/gui.go for plugin selection");
}

export function distFileSizeMb(filePath) {
    return (statSync(filePath).size / (1024 * 1024)).toFixed(1);
}
