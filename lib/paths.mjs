import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const WORK_ROOT = resolve(__dirname, "..");

/** Live Vencord tree that already has all your userplugins. */
export const VENCORD_LIVE =
    process.env.CUSTOM_VENCORD_DIR
        ? resolve(process.env.CUSTOM_VENCORD_DIR)
        : resolve(WORK_ROOT, "..", "Vencord");

export const USERPLUGINS_SOURCE = join(VENCORD_LIVE, "src", "userplugins");

export const VENCORD_DIR = join(WORK_ROOT, "Vencord");
export const INSTALLER_SRC_DIR = join(WORK_ROOT, "Installer");
/** Compiled CustomVencordInstaller.exe goes here (separate from Go source). */
export const INSTALLER_BIN_DIR = join(WORK_ROOT, "bin");

export const VENCORD_REPO = "https://github.com/Vendicated/Vencord.git";
export const INSTALLER_REPO = "https://github.com/Vencord/Installer.git";

export const USERPLUGINS_TARGET = join(VENCORD_DIR, "src", "userplugins");

/** Folders skipped inside each plugin when copying (build trees, git, deps). */
export const PLUGIN_SKIP_NAMES = new Set(["work", ".git", "node_modules", "dist"]);

export const BRAND = "Custom";
export const INSTALLER_EXE_BASE = "CustomVencordInstaller";

/** Built .vencordpack files for public plugins. */
export const PACKS_DIR = join(WORK_ROOT, "packs");

export function isVencordDir(dir) {
    try {
        const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
        return pkg.name === "vencord";
    } catch {
        return false;
    }
}

export function assertLiveVencord() {
    if (!existsSync(USERPLUGINS_SOURCE)) {
        throw new Error(
            `Userplugins not found at ${USERPLUGINS_SOURCE}. ` +
            `Set CUSTOM_VENCORD_DIR to your Vencord root, or keep ../Vencord next to this folder.`
        );
    }
}
