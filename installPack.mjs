#!/usr/bin/env node
/**
 * Install one or more .vencordpack files into a Vencord userplugins folder.
 *
 *   node installPack.mjs packs\vc_chat_encrypt.vencordpack
 *   node installPack.mjs packs\*.vencordpack
 *
 * Optional:
 *   CUSTOM_VENCORD_DIR=C:\path\to\Vencord
 */
import { existsSync, readdirSync, statSync } from "fs";
import { basename, join, resolve } from "path";

import { BRAND, PACKS_DIR, USERPLUGINS_SOURCE, assertLiveVencord } from "./lib/paths.mjs";
import { PACK_EXT, unpackPlugin } from "./lib/vencordpack.mjs";
import { fail, log } from "./lib/util.mjs";

const args = process.argv.slice(2).filter(a => !a.startsWith("-"));
if (!args.length) {
    console.log(`[${BRAND}] Usage: node installPack.mjs <file.vencordpack> [more...]`);
    console.log(`[${BRAND}]        node installPack.mjs --all`);
    process.exit(0);
}

try {
    assertLiveVencord();
} catch (e) {
    fail(e.message);
}

let packs = [];
if (args.includes("--all") || args[0] === "--all") {
    if (!existsSync(PACKS_DIR)) fail(`No packs dir at ${PACKS_DIR}. Run: node packPublic.mjs`);
    packs = readdirSync(PACKS_DIR)
        .filter(f => f.endsWith(PACK_EXT))
        .map(f => join(PACKS_DIR, f));
} else {
    for (const a of args) {
        const p = resolve(a);
        if (!existsSync(p)) fail(`Not found: ${p}`);
        const st = statSync(p);
        if (st.isDirectory()) {
            packs.push(
                ...readdirSync(p).filter(f => f.endsWith(PACK_EXT)).map(f => join(p, f))
            );
        } else {
            packs.push(p);
        }
    }
}

if (!packs.length) fail("No .vencordpack files to install");

for (const pack of packs) {
    if (!basename(pack).endsWith(PACK_EXT)) {
        fail(`Not a ${PACK_EXT}: ${pack}`);
    }
    log(`Installing ${basename(pack)} into ${USERPLUGINS_SOURCE}`);
    const { dest, manifest } = unpackPlugin(pack, USERPLUGINS_SOURCE);
    log(`  -> ${dest} (${manifest.name} v${manifest.version})`);
}

log("Rebuild / reinject Vencord for changes to load.");
