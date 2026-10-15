import { hostname } from "os";

/** Hardcoded public plugins API. */
export const DEFAULT_PLUGINS_API = "https://jalolek.pro/public-plugins.php";

export function getPluginsApiUrl() {
    return (process.env.CUSTOM_PLUGINS_API || DEFAULT_PLUGINS_API).trim();
}

/**
 * Fetch public plugin list from the PHP API (which also logs the hit).
 */
export async function fetchPublicPlugins(apiUrl = getPluginsApiUrl()) {
    const url = new URL(apiUrl);
    const host = hostname() || "unknown";

    const res = await fetch(url, {
        method: "GET",
        headers: {
            Accept: "application/json",
            "X-Client": "Vencord installer",
            "X-Client-Version": host,
            "User-Agent": `Vencord installer/${host}`
        }
    });

    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(`Plugins API returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }

    if (!res.ok || !data?.ok) {
        throw new Error(`Plugins API error (HTTP ${res.status}): ${data?.error || text.slice(0, 200)}`);
    }

    const plugins = Array.isArray(data.plugins) ? data.plugins : [];
    const ids = plugins
        .map(p => (typeof p === "string" ? p : p?.id))
        .filter(Boolean)
        .map(String);

    if (!ids.length) {
        throw new Error("Plugins API returned an empty plugin list");
    }

    return {
        apiUrl: url.toString(),
        ids,
        plugins,
        requestId: data.requestId ?? null,
        updatedAt: data.updatedAt ?? null
    };
}
