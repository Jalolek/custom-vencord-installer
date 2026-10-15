#!/usr/bin/env node
/**
 * Make a .vencordpack for one plugin folder.
 *
 *   node makePack.mjs vc_chat_encrypt
 *   node makePack.mjs vc-tenor
 *
 * Output: packs/<id>.vencordpack
 */
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

import { PACKS_DIR, USERPLUGINS_SOURCE, assertLiveVencord } from "./lib/paths.mjs";
import { PACK_EXT, packPlugin } from "./lib/vencordpack.mjs";
import { fail, log } from "./lib/util.mjs";

const id = process.argv[2];
if (!id) {
    fail("Usage: node makePack.mjs <plugin-folder-name>");
}

try {
    assertLiveVencord();
} catch (e) {
    fail(e.message);
}

const src = join(USERPLUGINS_SOURCE, id);
if (!existsSync(src)) {
    fail(`Plugin folder not found: ${src}`);
}

mkdirSync(PACKS_DIR, { recursive: true });
const out = join(PACKS_DIR, `${id}${PACK_EXT}`);

log(`Packing ${src}`);
const result = packPlugin(src, out);
const mb = (result.bytes / (1024 * 1024)).toFixed(2);
log(`Wrote ${out}`);
log(`  ${result.manifest.name} v${result.manifest.version} (${mb} MB, ${Object.keys(result.manifest.files).length} files)`);
