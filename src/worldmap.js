/**
 * neohiro/worldmap — dynamic global data layers
 *
 * The worldmap is the body of the organism. It shows:
 *   - Tailnet peers (live location)
 *   - Active exit nodes
 *   - DNS resolver chain (DNSCrypt, Tor, etc.)
 *   - GitHub Actions regions
 *   - Visitor heatmap (only for godadmin)
 *
 * Layers are role-gated:
 *   - public:    only network + repos
 *   - user:      + tailnet + exit nodes
 *   - admin:     + DNS chain + visitor count (no IPs)
 *   - godadmin:  + visitor heatmap (with IPs)
 *
 * The map state is persisted per-user in localStorage (last viewport,
 * active layers).  The whole state is also saved to the userdata repo
 * for cross-device sync.
 */

import { readFileSync } from 'node:fs';

const ROLES = ['public', 'user', 'admin', 'godadmin'];
const ROLE_RANK = { public: 0, user: 1, admin: 2, godadmin: 3 };

const LAYERS = {
    public: [
        { id: 'tailnet', name: 'Tailnet peers', icon: '🌐', minRole: 'public' },
        { id: 'repos', name: 'Public repos', icon: '📚', minRole: 'public' },
        { id: 'egress', name: 'Egress paths', icon: '🚪', minRole: 'public' },
    ],
    user: [
        { id: 'exit-nodes', name: 'Active exit nodes', icon: '🚪', minRole: 'user' },
        { id: 'latency', name: 'Peer latency', icon: '⏱️', minRole: 'user' },
        { id: 'heart', name: 'Heart status', icon: '❤️', minRole: 'user' },
    ],
    admin: [
        { id: 'dns-chain', name: 'DNS resolver chain', icon: '🔒', minRole: 'admin' },
        { id: 'ci-regions', name: 'CI workflow regions', icon: '⚙️', minRole: 'admin' },
        { id: 'errors', name: 'Error hotspots', icon: '⚠️', minRole: 'admin' },
    ],
    godadmin: [
        { id: 'visitors', name: 'Visitor heatmap', icon: '👁️', minRole: 'godadmin' },
        { id: 'audit', name: 'Audit trail', icon: '📜', minRole: 'godadmin' },
    ],
};

/**
 * Get the layers visible to a given role.
 */
export function getVisibleLayers(role) {
    if (!ROLES.includes(role)) {
        throw new Error(`Unknown role: ${role}`);
    }
    const rank = ROLE_RANK[role];
    const all = [];
    for (const minRole of Object.keys(LAYERS)) {
        if (ROLE_RANK[minRole] <= rank) {
            all.push(...LAYERS[minRole]);
        }
    }
    return all;
}

/**
 * Get the list of available layers for a role.
 * Sorted by min role ascending, then alphabetically.
 */
export function listAllLayers() {
    const all = [];
    for (const minRole of Object.keys(LAYERS)) {
        all.push(...LAYERS[minRole]);
    }
    return all;
}

/**
 * Check whether a role can see a layer.
 */
export function canSeeLayer(role, layerId) {
    for (const minRole of Object.keys(LAYERS)) {
        for (const layer of LAYERS[minRole]) {
            if (layer.id === layerId) {
                return ROLE_RANK[role] >= ROLE_RANK[minRole];
            }
        }
    }
    return false;
}

/**
 * Build a "starred layers" list — the user's preferred set.
 * Validates that each layer is visible to the role.
 */
export function getStarredLayers(role, starredIds) {
    const visible = getVisibleLayers(role);
    const visibleIds = new Set(visible.map(l => l.id));
    return visible.filter(l => starredIds.includes(l.id) && visibleIds.has(l.id));
}

/**
 * Persist viewport state. Pure-data; storage is the caller's responsibility.
 */
export function encodeViewportState(viewport, starredLayers, role) {
    return {
        viewport: {
            center: viewport.center,        // [lon, lat]
            zoom: viewport.zoom,            // 0-22
            pitch: viewport.pitch || 0,
            bearing: viewport.bearing || 0,
        },
        starred_layers: starredLayers.filter(id => canSeeLayer(role, id)),
        role,
        saved_at: new Date().toISOString(),
    };
}

/**
 * Decode a persisted viewport state. Returns null on parse error.
 */
export function decodeViewportState(json) {
    try {
        const data = typeof json === 'string' ? JSON.parse(json) : json;
        if (!data || typeof data !== 'object') return null;
        if (!data.viewport || !data.role) return null;
        if (!Array.isArray(data.viewport.center) || data.viewport.center.length !== 2) return null;
        if (typeof data.viewport.zoom !== 'number') return null;
        if (!ROLES.includes(data.role)) return null;
        return data;
    } catch (e) {
        return null;
    }
}

export { ROLES, ROLE_RANK, LAYERS };
