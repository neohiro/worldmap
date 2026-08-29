/**
 * neohiro/worldmap Cloudflare Pages function
 *
 * GET  /api/worldmap      → load the current viewer's viewport state
 * POST /api/worldmap      → save the current viewer's viewport state
 *
 * Auth: requires GitHub OAuth session token (validated against
 * /api/oauth/me). On 401, the function returns an empty state.
 *
 * Storage: KV namespace WORLDMAP_KV. Key: `viewport:${login}`.
 */

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function onRequestGet(context) {
    const auth = context.request.headers.get("Authorization");
    if (!auth) {
        return new Response(JSON.stringify({ error: "missing auth" }), {
            status: 401, headers: JSON_HEADERS
        });
    }

    const meRes = await fetch("https://api.github.com/user", {
        headers: {
            Authorization: auth,
            "User-Agent": "neohiro-worldmap/1.0",
            Accept: "application/vnd.github+json"
        }
    });
    if (!meRes.ok) {
        return new Response(JSON.stringify({ error: "invalid token" }), {
            status: 401, headers: JSON_HEADERS
        });
    }
    const me = await meRes.json();
    const login = me.login;

    const kv = context.env.WORLDMAP_KV;
    const stored = await kv.get(`viewport:${login}`);
    if (!stored) {
        return new Response(JSON.stringify({ viewport: null }), {
            status: 200, headers: JSON_HEADERS
        });
    }
    return new Response(stored, { status: 200, headers: JSON_HEADERS });
}

export async function onRequestPost(context) {
    const auth = context.request.headers.get("Authorization");
    if (!auth) {
        return new Response(JSON.stringify({ error: "missing auth" }), {
            status: 401, headers: JSON_HEADERS
        });
    }

    const body = await context.request.json();
    const { viewport, starred_layers, role } = body;
    if (!viewport || !role) {
        return new Response(JSON.stringify({ error: "missing fields" }), {
            status: 400, headers: JSON_HEADERS
        });
    }

    // Validate role
    const ROLES = ["public", "user", "admin", "godadmin"];
    if (!ROLES.includes(role)) {
        return new Response(JSON.stringify({ error: "invalid role" }), {
            status: 400, headers: JSON_HEADERS
        });
    }

    const meRes = await fetch("https://api.github.com/user", {
        headers: {
            Authorization: auth,
            "User-Agent": "neohiro-worldmap/1.0",
            Accept: "application/vnd.github+json"
        }
    });
    if (!meRes.ok) {
        return new Response(JSON.stringify({ error: "invalid token" }), {
            status: 401, headers: JSON_HEADERS
        });
    }
    const me = await meRes.json();
    const login = me.login;

    const state = {
        viewport,
        starred_layers: Array.isArray(starred_layers) ? starred_layers : [],
        role,
        saved_at: new Date().toISOString(),
        login
    };

    const kv = context.env.WORLDMAP_KV;
    await kv.put(`viewport:${login}`, JSON.stringify(state));

    return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: JSON_HEADERS
    });
}
