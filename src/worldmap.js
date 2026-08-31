/**
 * neohiro/worldmap — dynamic global data layers
 *
 * The worldmap is the body of the organism. It shows real-time global
 * phenomena — earthquakes, flights, conflicts, weather, threats, visitors —
 * as overlayable, role-gated, fittable datalayers.
 *
 * This module is the SSOT for:
 *   - Layer registry (35+ layers, role-gated, with viz hints)
 *   - Datalayer payload schema (typed, validated)
 *   - Heatmap / cluster / pinpoint selection per-layer
 *   - Per-layer activation state (on/off/starred)
 *   - Starred-priority reorder algorithm
 *   - Viewport state encode/decode
 *
 * Browser-side rendering lives in the dashboard's `worldmap.js` asset
 * (a sibling file in `neohiro-dashboard/assets/`). This module is the
 * data + logic layer; the browser is the view.
 */

const ROLES = ['public', 'user', 'admin', 'godadmin'];
const ROLE_RANK = Object.freeze({ public: 0, user: 1, admin: 2, godadmin: 3 });

const VIZ_KINDS = ['pinpoint', 'cluster', 'heatmap', 'polygon', 'arc', 'tile', 'point-cluster'];

/**
 * LAYERS — full registry. Mirrors `links/feeds/worldmap.yaml` and
 * `worldmap/SPEC_ADDENDUM.md § 2`, with visualization hints and
 * supported features.
 *
 * Each layer is either:
 *   - 'spatial': features have real coords, render with leaflet or SVG
 *   - 'basemap':  a tile basemap (e.g. satellite); no features of its own
 *
 * `viz.kind`:
 *   pinpoint      — each feature is a marker (one circle)
 *   cluster       — features auto-cluster when zoomed out
 *   point-cluster — alias of cluster, used for clarity
 *   heatmap       — features are weighted; rendered as a heat layer
 *   polygon       — features are polygons (e.g. countries, ASN ranges)
 *   arc           — features connect two points (e.g. BGP, flight route)
 *   tile          — a basemap layer
 */
const LAYERS = Object.freeze({
    public: [
        { id: 'worldmap.events.iss',                  name: 'ISS Position',            icon: '🛰️', minRole: 'public',  spatial: true,  viz: { kind: 'pinpoint', size: 14, color: '#2f81f7', pulse: true,  heatmap: false } },
        { id: 'worldmap.transport.aircraft',         name: 'Aircraft (ADS-B)',        icon: '✈️', minRole: 'public',  spatial: true,  viz: { kind: 'cluster',  size:  4, color: '#1e90ff', heatmap: true,  heat_radius: 18, weight: 'altitude' } },
        { id: 'worldmap.transport.marine',           name: 'Marine AIS',              icon: '🚢', minRole: 'public',  spatial: true,  viz: { kind: 'cluster',  size:  4, color: '#1e90ff', heatmap: true,  heat_radius: 16, weight: 'speed' } },
        { id: 'worldmap.transport.rail',             name: 'OpenRailwayMap',          icon: '🚆', minRole: 'public',  spatial: true,  viz: { kind: 'arc',      size:  2, color: '#7d8590' } },
        { id: 'worldmap.events.lightning',           name: 'Lightning (real-time)',   icon: '⚡', minRole: 'public',  spatial: true,  viz: { kind: 'cluster',  size:  4, color: '#ffd700', heatmap: true,  heat_radius: 14, weight: 'intensity' } },
        { id: 'worldmap.events.satellites',          name: 'Satellites (CelesTrak)',  icon: '🛸', minRole: 'public',  spatial: true,  viz: { kind: 'pinpoint', size:  4, color: '#7d8590' } },
        { id: 'worldmap.network.celltowers',         name: 'Cell towers (OpenCellID)',icon: '📶', minRole: 'public',  spatial: true,  viz: { kind: 'cluster',  size:  3, color: '#7d8590', heatmap: true,  heat_radius: 12 } },
        { id: 'worldmap.network.wifi',               name: 'Wi-Fi (WiGLE)',           icon: '📡', minRole: 'public',  spatial: true,  viz: { kind: 'cluster',  size:  3, color: '#7d8590', heatmap: true,  heat_radius: 10 } },
        { id: 'worldmap.osm.poi',                    name: 'OSM POIs',                icon: '🗺️', minRole: 'public',  spatial: true,  viz: { kind: 'cluster',  size:  4, color: '#7d8590', heatmap: true,  heat_radius: 16 } },
        { id: 'worldmap.osm.density',                 name: 'OSM Density',             icon: '🧭', minRole: 'public',  spatial: true,  viz: { kind: 'heatmap',  size:  6, color: '#3fb950', heat_radius: 24, weight: 'count' } },
        { id: 'worldmap.environment.elevation',       name: 'Elevation',               icon: '⛰️', minRole: 'public',  spatial: true,  viz: { kind: 'heatmap',  size:  4, color: '#d29922', heat_radius: 12, weight: 'meters' } },
        { id: 'worldmap.visual.terrain',              name: 'Terrain basemap',         icon: '🗻', minRole: 'public',  spatial: false, viz: { kind: 'tile',     color: '#5a3a1f' } },
        { id: 'worldmap.visual.satellite',            name: 'Satellite basemap',       icon: '🌍', minRole: 'public',  spatial: false, viz: { kind: 'tile',     color: '#0d3a52' } },
        { id: 'worldmap.visual.recent-satellite',     name: 'FIRMS hotspots',          icon: '🔥', minRole: 'public',  spatial: true,  viz: { kind: 'cluster',  size:  5, color: '#ff4500', heatmap: true,  heat_radius: 14, weight: 'brightness' } },
        { id: 'worldmap.network.peers',               name: 'Tailnet peers',           icon: '🌐', minRole: 'public',  spatial: true,  viz: { kind: 'cluster',  size:  6, color: '#2f81f7' } },
        { id: 'worldmap.network.egress',              name: 'Egress paths',            icon: '🚪', minRole: 'public',  spatial: true,  viz: { kind: 'arc',      size:  2, color: '#3fb950' } },
        { id: 'worldmap.network.probes',              name: 'RIPE Atlas anchors',      icon: '📡', minRole: 'public',  spatial: true,  viz: { kind: 'pinpoint', size:  4, color: '#7d8590' } },
    ],
    user: [
        { id: 'worldmap.events.breaking',             name: 'Breaking news (GDELT)',   icon: '📰', minRole: 'user',    spatial: true,  viz: { kind: 'cluster',  size:  4, color: '#d29922', heatmap: true,  heat_radius: 18, weight: 'tone' } },
        { id: 'worldmap.events.earthquake',           name: 'Earthquakes (USGS)',      icon: '🌋', minRole: 'user',    spatial: true,  viz: { kind: 'pinpoint', size: 'magnitude', color: '#f85149', heatmap: true,  heat_radius: 20, weight: 'mag' } },
        { id: 'worldmap.events.earthquake-live',      name: 'Earthquakes (live)',      icon: '🌋', minRole: 'user',    spatial: true,  viz: { kind: 'pinpoint', size: 'magnitude', color: '#ff1744', heatmap: true,  heat_radius: 18, weight: 'mag' } },
        { id: 'worldmap.events.conflict',             name: 'Armed conflict (ACLED)',  icon: '⚔️', minRole: 'user',    spatial: true,  viz: { kind: 'pinpoint', size:  5, color: '#ff1744', heatmap: true,  heat_radius: 16, weight: 'fatalities' } },
        { id: 'worldmap.events.humanitarian',         name: 'Humanitarian crises',     icon: '🏚️', minRole: 'user',    spatial: true,  viz: { kind: 'cluster',  size:  5, color: '#e040fb', heatmap: true,  heat_radius: 18, weight: 'severity' } },
        { id: 'worldmap.events.natural',              name: 'Natural events (EONET)',  icon: '🌪️', minRole: 'user',    spatial: true,  viz: { kind: 'pinpoint', size:  5, color: '#ff9100', heatmap: true,  heat_radius: 16, weight: 'magnitude' } },
        { id: 'worldmap.environment.airquality',      name: 'Air quality (OpenAQ)',    icon: '🌫️', minRole: 'user',    spatial: true,  viz: { kind: 'cluster',  size:  5, color: '#9e9e9e', heatmap: true,  heat_radius: 16, weight: 'pm25' } },
        { id: 'worldmap.environment.weather',         name: 'Weather (Open-Meteo)',    icon: '☀️', minRole: 'user',    spatial: true,  viz: { kind: 'pinpoint', size:  4, color: '#1e90ff', heatmap: true,  heat_radius: 14, weight: 'temp' } },
        { id: 'worldmap.environment.biodiversity',    name: 'Biodiversity (GBIF)',     icon: '🦋', minRole: 'user',    spatial: true,  viz: { kind: 'cluster',  size:  4, color: '#3fb950', heatmap: true,  heat_radius: 12, weight: 'count' } },
        { id: 'worldmap.demographics.population',    name: 'Population (WorldPop)',   icon: '👥', minRole: 'user',    spatial: true,  viz: { kind: 'heatmap',  size:  8, color: '#ffd700', heat_radius: 28, weight: 'pop' } },
        { id: 'worldmap.events.lightning',          name: 'Lightning (global)',      icon: '⚡', minRole: 'user',    spatial: true,  viz: { kind: 'cluster',  size:  4, color: '#ffd700', heatmap: true,  heat_radius: 14, weight: 'intensity' } },
        { id: 'worldmap.knowledge.wikidata',         name: 'Wikidata geo-entities',   icon: '📚', minRole: 'user',    spatial: true,  viz: { kind: 'cluster',  size:  4, color: '#7d8590', heatmap: false } },
        { id: 'worldmap.transport.marine',           name: 'Marine AIS',              icon: '🚢', minRole: 'user',    spatial: true,  viz: { kind: 'cluster',  size:  4, color: '#1e90ff', heatmap: true,  heat_radius: 16, weight: 'speed' } },
    ],
    admin: [
        { id: 'worldmap.network.bgp',                 name: 'BGP routes (RIPE RIS)',   icon: '🛣️', minRole: 'admin',   spatial: true,  viz: { kind: 'arc',      size:  2, color: '#2f81f7' } },
        { id: 'worldmap.network.celltowers',        name: 'Cell towers (OpenCellID)',icon: '📶', minRole: 'admin',   spatial: true,  viz: { kind: 'cluster',  size:  3, color: '#7d8590', heatmap: true,  heat_radius: 12 } },
        { id: 'worldmap.network.wifi',              name: 'Wi-Fi geodata (WiGLE)', icon: '📡', minRole: 'admin',   spatial: true,  viz: { kind: 'cluster',  size:  3, color: '#7d8590', heatmap: true,  heat_radius: 10 } },
        { id: 'worldmap.network.asn',                name: 'ASN traffic (CF Radar)',  icon: '🌐', minRole: 'admin',   spatial: true,  viz: { kind: 'polygon',  size:  3, color: '#2f81f7' } },
        { id: 'worldmap.osint.dns',                 name: 'RDAP DNS intel',         icon: '🔒', minRole: 'admin',   spatial: true,  viz: { kind: 'pinpoint', size:  4, color: '#3fb950' } },
        { id: 'worldmap.osint.certificates',          name: 'Cert transparency',       icon: '📜', minRole: 'admin',   spatial: true,  viz: { kind: 'cluster',  size:  4, color: '#7d8590' } },
        { id: 'worldmap.osint.footprint',             name: 'Shodan footprint',        icon: '🛰️', minRole: 'admin',   spatial: true,  viz: { kind: 'cluster',  size:  4, color: '#d29922', heatmap: true,  heat_radius: 16, weight: 'ports' } },
        { id: 'worldmap.osint.threat',                name: 'IP reputation',           icon: '⚠️', minRole: 'admin',   spatial: true,  viz: { kind: 'pinpoint', size:  5, color: '#f85149', heatmap: true,  heat_radius: 14, weight: 'abuse_score' } },
        { id: 'worldmap.osint.cve',                   name: 'CVEs (NVD+MITRE)',        icon: '🩹', minRole: 'admin',   spatial: true,  viz: { kind: 'pinpoint', size:  4, color: '#ff9100' } },
        { id: 'worldmap.osint.cve.oss',               name: 'OSS CVEs (OSV.dev)',      icon: '🩹', minRole: 'admin',   spatial: true,  viz: { kind: 'pinpoint', size:  4, color: '#ff9100' } },
        { id: 'worldmap.osint.crypto',                name: 'Crypto abuse',            icon: '₿',  minRole: 'admin',   spatial: true,  viz: { kind: 'pinpoint', size:  5, color: '#f7931a' } },
        { id: 'worldmap.threat.intel',                name: 'Threat intel (OTX)',      icon: '🎯', minRole: 'admin',   spatial: true,  viz: { kind: 'cluster',  size:  5, color: '#f85149', heatmap: true,  heat_radius: 18, weight: 'pulses' } },
        { id: 'worldmap.threat.intel.public',         name: 'OTX public pulses',       icon: '🎯', minRole: 'admin',   spatial: true,  viz: { kind: 'cluster',  size:  5, color: '#f85149', heatmap: true,  heat_radius: 18, weight: 'pulses' } },
        { id: 'worldmap.threat.ioc',                  name: 'Indicators of compromise',icon: '☣️', minRole: 'admin',   spatial: true,  viz: { kind: 'cluster',  size:  4, color: '#f85149', heatmap: true,  heat_radius: 14, weight: 'confidence' } },
        { id: 'worldmap.threat.c2',                   name: 'C2 botnet tracker',       icon: '🕸️', minRole: 'admin',   spatial: true,  viz: { kind: 'pinpoint', size:  6, color: '#7d0000' } },
        { id: 'worldmap.threat.phishing',             name: 'Active phishing',         icon: '🎣', minRole: 'admin',   spatial: true,  viz: { kind: 'pinpoint', size:  4, color: '#d29922' } },
        { id: 'worldmap.threat.blocklist',            name: 'Blocklist (ET)',          icon: '🚫', minRole: 'admin',   spatial: true,  viz: { kind: 'cluster',  size:  4, color: '#f85149' } },
        { id: 'worldmap.threat.malware',              name: 'Malware URLs (URLhaus)',  icon: '🦠', minRole: 'admin',   spatial: true,  viz: { kind: 'pinpoint', size:  4, color: '#7d0000' } },
        { id: 'worldmap.threat.amplification',        name: 'Amp. attack sources',     icon: '💥', minRole: 'admin',   spatial: true,  viz: { kind: 'pinpoint', size:  4, color: '#ff1744' } },
        { id: 'worldmap.environment.soil',            name: 'Soil (ISRIC SoilGrids)',  icon: '🌱', minRole: 'admin',   spatial: true,  viz: { kind: 'pinpoint', size:  4, color: '#a1887f' } },
    ],
    godadmin: [
        { id: 'worldmap.visitors.heatmap',            name: 'Visitor heatmap',         icon: '👁️', minRole: 'godadmin', spatial: true,  viz: { kind: 'heatmap',  size:  8, color: '#ffd700', heat_radius: 24, weight: 'count' } },
    ],
});

const ALL_LAYERS = (() => {
    const out = [];
    for (const minRole of Object.keys(LAYERS)) {
        out.push(...LAYERS[minRole]);
    }
    return out;
})();

const LAYER_BY_ID = new Map(ALL_LAYERS.map(l => [l.id, l]));

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
 * Get the list of all layers. Sorted by min role ascending, then name.
 */
export function listAllLayers() {
    return [...ALL_LAYERS].sort((a, b) => {
        const ra = ROLE_RANK[a.minRole];
        const rb = ROLE_RANK[b.minRole];
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name);
    });
}

/**
 * Look up a single layer by id. Returns null if not found.
 */
export function getLayerById(id) {
    return LAYER_BY_ID.get(id) || null;
}

/**
 * Check whether a role can see a layer.
 */
export function canSeeLayer(role, layerId) {
    const layer = LAYER_BY_ID.get(layerId);
    if (!layer) return false;
    return ROLE_RANK[role] >= ROLE_RANK[layer.minRole];
}

/**
 * Build a "starred layers" list — the user's preferred set.
 * Validates that each layer is visible to the role AND that starred
 * layers that are not visible are dropped on write (not just hidden).
 */
export function getStarredLayers(role, starredIds) {
    const visible = getVisibleLayers(role);
    const visibleIds = new Set(visible.map(l => l.id));
    return visible.filter(l => starredIds.includes(l.id) && visibleIds.has(l.id));
}

/**
 * Apply a starred-priority reorder. Returns a *new* list of visible
 * layers where starred layers come first (in the order given), then
 * non-starred layers (in the registry's default order).
 *
 * The returned list is in the order the UI should render.
 *
 * The reorder is stable: two layers with the same star status retain
 * their relative order from `getVisibleLayers(role)`.
 */
export function reorderByStars(role, starredIds) {
    const visible = getVisibleLayers(role);
    const starredSet = new Set(starredIds.filter(id => canSeeLayer(role, id)));
    const head = [];
    const tail = [];
    for (const layer of visible) {
        if (starredSet.has(layer.id)) head.push(layer);
        else tail.push(layer);
    }
    return [...head, ...tail];
}

/**
 * Resolve the activation state for a single layer.
 *
 *   effective = (toggles[id] !== false)         -- explicit off wins
 *            && (starredIds.includes(id)        -- starred or
 *                || activeOverlay === id        -- active overlay
 *                || toggles[id] === true)       -- explicit on
 *            && canSeeLayer(role, id)
 *
 * This is the single rule for "is this layer showing right now?".
 */
export function isLayerActive(role, layerId, prefs) {
    if (!canSeeLayer(role, layerId)) return false;
    const toggles = (prefs && prefs.layer_toggles) || {};
    const starred = (prefs && prefs.starred_layers) || [];
    const active = (prefs && prefs.active_overlay) || null;
    if (toggles[layerId] === false) return false;
    if (toggles[layerId] === true) return true;
    if (starred.includes(layerId)) return true;
    if (active === layerId) return true;
    return false;
}

/**
 * Apply prefs to a list of layer ids and return the *effective* set
 * (dropping layers the user can't see, applying on/off).
 */
export function resolveActiveLayers(role, prefs) {
    const all = getVisibleLayers(role);
    return all
        .filter(l => isLayerActive(role, l.id, prefs))
        .map(l => l.id);
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

/**
 * Validate a DatalayerPayload per SPEC_ADDENDUM.md § 1.
 *
 *   { layer, source, timestamp, features: [{id, coords, ...}] }
 *
 * Returns:
 *   { ok: true, payload: <normalized> } on success
 *   { ok: false, error: <string> } on failure
 */
export function decodeDatalayerPayload(json) {
    let data;
    try {
        data = typeof json === 'string' ? JSON.parse(json) : json;
    } catch (e) {
        return { ok: false, error: 'invalid json' };
    }
    if (!data || typeof data !== 'object') {
        return { ok: false, error: 'not an object' };
    }
    if (typeof data.layer !== 'string' || data.layer.length === 0) {
        return { ok: false, error: 'missing layer id' };
    }
    if (typeof data.source !== 'string' || data.source.length === 0) {
        return { ok: false, error: 'missing source' };
    }
    if (typeof data.timestamp !== 'string') {
        return { ok: false, error: 'missing timestamp' };
    }
    if (Number.isNaN(Date.parse(data.timestamp))) {
        return { ok: false, error: 'invalid timestamp' };
    }
    if (!Array.isArray(data.features)) {
        return { ok: false, error: 'features is not an array' };
    }
    if (data.features.length > 50000) {
        return { ok: false, error: 'too many features (>50000)' };
    }
    const layer = LAYER_BY_ID.get(data.layer);
    if (!layer) {
        return { ok: false, error: `unknown layer ${data.layer}` };
    }
    if (!layer.spatial && data.features.length > 0) {
        return { ok: false, error: `non-spatial layer ${data.layer} cannot have features` };
    }
    const out = [];
    let spatial = 0;
    for (let i = 0; i < data.features.length; i++) {
        const f = data.features[i];
        if (!f || typeof f !== 'object') {
            return { ok: false, error: `feature[${i}] not an object` };
        }
        if (typeof f.id !== 'string' || f.id.length === 0) {
            return { ok: false, error: `feature[${i}] missing id` };
        }
        if (layer.spatial) {
            if (!Array.isArray(f.coords) || f.coords.length !== 2) {
                return { ok: false, error: `feature[${i}] invalid coords` };
            }
            const [lat, lon] = f.coords;
            if (typeof lat !== 'number' || typeof lon !== 'number') {
                return { ok: false, error: `feature[${i}] coords not numbers` };
            }
            if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
                return { ok: false, error: `feature[${i}] coords out of range` };
            }
            spatial += 1;
        } else {
            f.coords = [0, 0];
        }
        out.push(f);
    }
    return {
        ok: true,
        payload: {
            layer: data.layer,
            source: data.source,
            timestamp: data.timestamp,
            features: out,
            meta: { count: out.length, spatial, viz: layer.viz },
        },
    };
}

/**
 * Cluster a set of features into a smaller set of cluster points.
 *
 * Inputs: features = [{id, coords:[lat,lon], ...}, ...]
 *         opts.zoom    — current zoom level (0-22); smaller = cluster more
 *         opts.kind    — viz kind, e.g. 'cluster' / 'heatmap'
 *         opts.weight  — property name to use as weight (heatmap)
 *
 * Algorithm: equirectangular grid clustering. Pixels per cell is
 * `2 ** (22 - zoom) * PIXELS_PER_DEGREE` clamped to [4, 256].
 * Single-feature cells return a pinpoint; multi-feature cells return
 * a synthetic cluster with `count` and `weight` aggregated.
 *
 * Pure function; no DOM.
 */
export function clusterFeatures(features, opts) {
    const { zoom = 4, kind = 'cluster', weight = null } = opts || {};
    if (!Array.isArray(features) || features.length === 0) return [];
    if (kind === 'pinpoint') {
        return features.map(f => ({
            kind: 'pinpoint',
            id: f.id,
            coords: f.coords,
            weight: weight && f.payload ? Number(f.payload[weight]) || 0 : 0,
            payload: f.payload || null,
        }));
    }
    const PIXELS_PER_DEGREE = 0.5;
    const cellPx = Math.min(256, Math.max(4, 2 ** (22 - zoom) * PIXELS_PER_DEGREE));
    const cellDeg = cellPx / PIXELS_PER_DEGREE;
    const cells = new Map();
    for (const f of features) {
        const [lat, lon] = f.coords;
        const cx = Math.floor(lon / cellDeg);
        const cy = Math.floor(lat / cellDeg);
        const key = `${cx},${cy}`;
        let bucket = cells.get(key);
        if (!bucket) {
            bucket = { count: 0, sumLat: 0, sumLon: 0, sumWeight: 0, ids: [] };
            cells.set(key, bucket);
        }
        bucket.count += 1;
        bucket.sumLat += lat;
        bucket.sumLon += lon;
        if (weight && f.payload && typeof f.payload[weight] === 'number') {
            bucket.sumWeight += f.payload[weight];
        } else if (weight && typeof f[weight] === 'number') {
            bucket.sumWeight += f[weight];
        }
        bucket.ids.push(f.id);
    }
    const out = [];
    for (const [key, b] of cells) {
        if (b.count === 1) {
            out.push({
                kind: 'pinpoint',
                id: b.ids[0],
                coords: [b.sumLat, b.sumLon],
                weight: b.sumWeight,
            });
        } else {
            out.push({
                kind: 'cluster',
                id: `cluster:${key}`,
                coords: [b.sumLat / b.count, b.sumLon / b.count],
                count: b.count,
                weight: b.sumWeight,
            });
        }
    }
    return out;
}

/**
 * Decide which viz kind to use given a layer and a feature count.
 *
 * Most layers advertise `viz.kind` (cluster / pinpoint / heatmap / ...).
 * But some layers are smarter: if a layer advertises both cluster and
 * heatmap, we pick based on the feature count.
 *
 * Rule:
 *   - count <= 25   → use the layer's `viz.kind`
 *   - 25 < count ≤ 500 → switch to cluster (if available) or heatmap
 *   - count > 500   → switch to heatmap
 *
 * Returns the chosen kind and a sizing hint the renderer uses to
 * scale markers (in pixels, before any DPR scaling).
 */
export function pickViz(layerId, featureCount) {
    const layer = LAYER_BY_ID.get(layerId);
    if (!layer) return null;
    const base = layer.viz;
    const fc = featureCount | 0;
    let kind = base.kind;
    if (base.heatmap && fc > 500) kind = 'heatmap';
    else if (base.kind === 'cluster' && fc > 25) kind = 'cluster';
    let sizePx = 6;
    if (base.size === 'magnitude') {
        sizePx = 8;
    } else if (typeof base.size === 'number') {
        sizePx = base.size;
    }
    return {
        kind,
        sizePx,
        color: base.color,
        heatmap: base.heatmap && kind !== 'heatmap' ? false : !!base.heatmap,
        heat_radius: base.heat_radius || 16,
        weight: base.weight || null,
        pulse: !!base.pulse,
    };
}

/**
 * Project a [lat, lon] pair to viewport pixel coordinates using a
 * simple equirectangular projection. Used by the SVG renderer and
 * for the dashboard fallback when Leaflet is not loaded.
 *
 *   viewport = { width, height, center:[lon,lat], zoom }
 *
 * Pixel size at zoom z (256px tiles): 256 * 2^z
 * Returns [x, y] in pixels relative to the viewport top-left.
 */
export function projectLatLon(lat, lon, viewport) {
    const { width, height, center, zoom } = viewport;
    const scale = 256 * 2 ** zoom;
    const [cLon, cLat] = center;
    const x = ((lon - cLon) * scale / 360) + (width / 2);
    const latRad = lat * Math.PI / 180;
    const cLatRad = cLat * Math.PI / 180;
    const y = ((cLatRad - latRad) * scale / (2 * Math.PI)) + (height / 2);
    return [x, y];
}

/**
 * Validate a list of starred layer ids. Drops any that the role
 * can't see. Returns a clean list, preserving order.
 */
export function sanitizeStarred(role, starredIds) {
    return (starredIds || []).filter(id => canSeeLayer(role, id));
}

/**
 * Merge a default prefs object with a partial update. Returns a new
 * object (does not mutate). Drops invalid layer ids.
 */
export function mergePrefs(role, current, update) {
    const base = current || {
        viewport: { center: [0, 51], zoom: 3, pitch: 0, bearing: 0 },
        starred_layers: [],
        active_overlay: null,
        layer_toggles: {},
    };
    const merged = { ...base, ...update };
    if (update && update.starred_layers !== undefined) {
        merged.starred_layers = Array.isArray(update.starred_layers)
            ? sanitizeStarred(role, update.starred_layers)
            : [];
    } else if (current && Array.isArray(current.starred_layers)) {
        // On every merge, re-sanitize existing starred list against current role.
        merged.starred_layers = sanitizeStarred(role, current.starred_layers);
    }
    if (update && update.active_overlay !== undefined) {
        if (update.active_overlay === null || canSeeLayer(role, update.active_overlay)) {
            merged.active_overlay = update.active_overlay;
        } else {
            merged.active_overlay = null;
        }
    }
    if (update && update.layer_toggles) {
        const t = { ...(base.layer_toggles || {}) };
        for (const [k, v] of Object.entries(update.layer_toggles)) {
            if (canSeeLayer(role, k)) {
                t[k] = !!v;
            }
        }
        merged.layer_toggles = t;
    }
    return merged;
}

export { ROLES, ROLE_RANK, LAYERS, VIZ_KINDS };
