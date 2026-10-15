#!/usr/bin/env node
/**
 * Pack every public plugin (from PHP API) into packs/<id>.vencordpack
 *
 *   node packPublic.mjs
 *   node packPublic.mjs vc_chat_encrypt
 */
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

import { BRAND, PACKS_DIR, USERPLUGINS_SOURCE, assertLiveVencord } from "./lib/paths.mjs";
import { DEFAULT_PLUGINS_API, fetchPublicPlugins } from "./lib/publicPluginsApi.mjs";
import { PACK_EXT, packPlugin } from "./lib/vencordpack.mjs";
import { fail, log } from "./lib/util.mjs";

try {
    assertLiveVencord();
} catch (e) {
    fail(e.message);
}

const only = process.argv.slice(2).filter(a => !a.startsWith("-"));

let ids;
let meta = null;
if (only.length) {
    ids = only;
    log(`Packing explicit id(s): ${ids.join(", ")}`);
} else {
    log(`Fetching public plugins from ${DEFAULT_PLUGINS_API}`);
    try {
        meta = await fetchPublicPlugins(DEFAULT_PLUGINS_API);
    } catch (e) {
        fail(e.message);
    }
    ids = meta.ids;
    log(`API ok (requestId=${meta.requestId || "?"}, ${ids.length} plugin(s)): ${ids.join(", ")}`);
}

mkdirSync(PACKS_DIR, { recursive: true });

const built = [];
for (const id of ids) {
    const src = join(USERPLUGINS_SOURCE, id);
    if (!existsSync(src)) {
        fail(`Public plugin folder missing: ${src}`);
    }
    const out = join(PACKS_DIR, `${id}${PACK_EXT}`);
    log(`Packing ${id} -> ${out}`);
    const result = packPlugin(src, out);
    const mb = (result.bytes / (1024 * 1024)).toFixed(2);
    log(`  ${result.manifest.name} v${result.manifest.version} (${mb} MB, ${Object.keys(result.manifest.files).length} files)`);
    built.push({
        id,
        file: `${id}${PACK_EXT}`,
        name: result.manifest.name,
        version: result.manifest.version,
        bytes: result.bytes
    });
}

writeFileSync(
    join(PACKS_DIR, "index.json"),
    JSON.stringify({
        brand: BRAND,
        createdAt: new Date().toISOString(),
        api: meta
            ? { url: meta.apiUrl, requestId: meta.requestId, updatedAt: meta.updatedAt }
            : null,
        packs: built
    }, null, 2),
    "utf8"
);

log(`Done. ${built.length} pack(s) in ${PACKS_DIR}`);
