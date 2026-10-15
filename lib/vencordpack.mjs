import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { basename, dirname, join, relative, resolve } from "path";
import { deflateRawSync, inflateRawSync } from "zlib";

import { PLUGIN_SKIP_NAMES } from "./paths.mjs";

export const PACK_EXT = ".vencordpack";
export const MANIFEST_NAME = "vencordpack.json";
export const FORMAT_VERSION = 1;

function crc32(buf) {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
        c ^= buf[i];
        for (let k = 0; k < 8; k++) {
            c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
        }
    }
    return ~c >>> 0;
}

function walkFiles(root, skipNames = PLUGIN_SKIP_NAMES) {
    const out = [];
    function walk(dir) {
        for (const name of readdirSync(dir)) {
            if (skipNames.has(name)) continue;
            if (name.endsWith(PACK_EXT)) continue;
            const full = join(dir, name);
            const st = statSync(full);
            if (st.isDirectory()) walk(full);
            else if (st.isFile()) out.push(full);
        }
    }
    walk(root);
    return out;
}

/** Build an in-memory zip (deflate) from { name: Buffer|string }. */
export function zipBuffers(entries) {
    const locals = [];
    const centrals = [];
    let offset = 0;

    for (const [name, data] of Object.entries(entries)) {
        const nameBuf = Buffer.from(name.replace(/\\/g, "/"), "utf8");
        const raw = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
        const compressed = deflateRawSync(raw);
        const crc = crc32(raw);
        const useStore = compressed.length >= raw.length;
        const payload = useStore ? raw : compressed;
        const method = useStore ? 0 : 8;

        const local = Buffer.alloc(30 + nameBuf.length);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0, 6);
        local.writeUInt16LE(method, 8);
        local.writeUInt16LE(0, 10);
        local.writeUInt16LE(0, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(payload.length, 18);
        local.writeUInt32LE(raw.length, 22);
        local.writeUInt16LE(nameBuf.length, 26);
        local.writeUInt16LE(0, 28);
        nameBuf.copy(local, 30);

        const central = Buffer.alloc(46 + nameBuf.length);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0, 8);
        central.writeUInt16LE(method, 10);
        central.writeUInt16LE(0, 12);
        central.writeUInt16LE(0, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(payload.length, 20);
        central.writeUInt32LE(raw.length, 24);
        central.writeUInt16LE(nameBuf.length, 28);
        central.writeUInt16LE(0, 30);
        central.writeUInt16LE(0, 32);
        central.writeUInt16LE(0, 34);
        central.writeUInt16LE(0, 36);
        central.writeUInt32LE(0, 38);
        central.writeUInt32LE(offset, 42);
        nameBuf.copy(central, 46);

        locals.push(local, payload);
        centrals.push(central);
        offset += local.length + payload.length;
    }

    const centralDir = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(centrals.length, 8);
    end.writeUInt16LE(centrals.length, 10);
    end.writeUInt32LE(centralDir.length, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(0, 20);

    return Buffer.concat([...locals, centralDir, end]);
}

/** Minimal zip reader -> { name: Buffer }. */
export function unzipBuffers(zipBuf) {
    const out = {};
    let i = 0;
    while (i + 4 <= zipBuf.length) {
        const sig = zipBuf.readUInt32LE(i);
        if (sig !== 0x04034b50) break;
        const method = zipBuf.readUInt16LE(i + 8);
        const compSize = zipBuf.readUInt32LE(i + 18);
        const uncompSize = zipBuf.readUInt32LE(i + 22);
        const nameLen = zipBuf.readUInt16LE(i + 26);
        const extraLen = zipBuf.readUInt16LE(i + 28);
        const name = zipBuf.subarray(i + 30, i + 30 + nameLen).toString("utf8");
        const start = i + 30 + nameLen + extraLen;
        const payload = zipBuf.subarray(start, start + compSize);
        let raw;
        if (method === 0) raw = Buffer.from(payload);
        else if (method === 8) raw = inflateRawSync(payload);
        else throw new Error(`Unsupported zip method ${method} for ${name}`);
        if (raw.length !== uncompSize) {
            // some writers lie; keep inflated bytes
        }
        out[name] = raw;
        i = start + compSize;
    }
    return out;
}

export function readPluginMeta(pluginDir) {
    const indexCandidates = ["index.tsx", "index.ts", "index.jsx", "index.js"];
    let indexPath = null;
    let src = "";
    for (const f of indexCandidates) {
        const p = join(pluginDir, f);
        if (existsSync(p)) {
            indexPath = p;
            src = readFileSync(p, "utf8");
            break;
        }
    }
    if (!indexPath) {
        throw new Error(`No index file in ${pluginDir}`);
    }

    const nameMatch = src.match(/\bname:\s*["'`]([^"'`]+)["'`]/);
    const descMatch = src.match(/\bdescription:\s*["'`]([^"'`]+)["'`]/);
    const verMatch = src.match(/\bversion:\s*["'`]([^"'`]+)["'`]/);

    return {
        id: basename(pluginDir),
        name: nameMatch?.[1] ?? basename(pluginDir),
        description: descMatch?.[1] ?? "",
        version: verMatch?.[1] ?? "0.0.0",
        indexFile: basename(indexPath)
    };
}

export function buildManifest(pluginDir, meta, fileList) {
    const files = {};
    for (const abs of fileList) {
        const rel = relative(pluginDir, abs).replace(/\\/g, "/");
        const buf = readFileSync(abs);
        files[rel] = {
            size: buf.length,
            sha256: createHash("sha256").update(buf).digest("hex")
        };
    }
    return {
        format: "vencordpack",
        formatVersion: FORMAT_VERSION,
        id: meta.id,
        name: meta.name,
        description: meta.description,
        version: meta.version,
        author: "Jalolek",
        createdAt: new Date().toISOString(),
        indexFile: meta.indexFile,
        files
    };
}

/**
 * Pack a plugin folder into plugin_id.vencordpack (zip + vencordpack.json).
 * Zip layout:
 *   vencordpack.json
 *   plugin/<files...>
 */
export function packPlugin(pluginDir, outPath) {
    pluginDir = resolve(pluginDir);
    const meta = readPluginMeta(pluginDir);
    const fileList = walkFiles(pluginDir);
    if (!fileList.length) throw new Error(`No files to pack in ${pluginDir}`);

    const manifest = buildManifest(pluginDir, meta, fileList);
    const entries = {
        [MANIFEST_NAME]: Buffer.from(JSON.stringify(manifest, null, 2), "utf8")
    };
    for (const abs of fileList) {
        const rel = relative(pluginDir, abs).replace(/\\/g, "/");
        entries[`plugin/${rel}`] = readFileSync(abs);
    }

    const zip = zipBuffers(entries);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, zip);
    return { outPath, manifest, bytes: zip.length };
}

/**
 * Unpack a .vencordpack into destDir/<id>/
 */
export function unpackPlugin(packPath, destParent) {
    const zip = readFileSync(packPath);
    const entries = unzipBuffers(zip);
    const manifestRaw = entries[MANIFEST_NAME];
    if (!manifestRaw) throw new Error(`${packPath} missing ${MANIFEST_NAME}`);
    const manifest = JSON.parse(manifestRaw.toString("utf8"));
    if (manifest.format !== "vencordpack") {
        throw new Error(`Not a vencordpack: ${packPath}`);
    }

    const id = manifest.id || basename(packPath, PACK_EXT);
    const dest = join(destParent, id);
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });

    for (const [name, buf] of Object.entries(entries)) {
        if (name === MANIFEST_NAME) continue;
        if (!name.startsWith("plugin/")) continue;
        const rel = name.slice("plugin/".length);
        if (!rel || rel.includes("..")) continue;
        const out = join(dest, rel);
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, buf);
    }

    writeFileSync(join(dest, MANIFEST_NAME), manifestRaw);
    return { dest, manifest };
}
