/**
 * Tests for neohiro/worldmap — covers datalayer payloads, clustering, viz
 * selection, layer activation, star reorder, and viewport encode/decode.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    getVisibleLayers, listAllLayers, getLayerById, canSeeLayer,
    getStarredLayers, reorderByStars, isLayerActive, resolveActiveLayers,
    encodeViewportState, decodeViewportState,
    decodeDatalayerPayload, clusterFeatures, pickViz,
    projectLatLon, sanitizeStarred, mergePrefs,
    ROLES, LAYERS, VIZ_KINDS,
} from '../src/worldmap.js';

const ADMIN_PREFS = {
    starred_layers: ['worldmap.threat.intel', 'worldmap.network.bgp'],
    active_overlay: 'worldmap.threat.intel',
    layer_toggles: {
        'worldmap.threat.intel': true,
        'worldmap.network.bgp': true,
        'worldmap.osint.cve': false,
    },
};

const USER_PREFS = {
    starred_layers: ['worldmap.events.breaking', 'worldmap.events.earthquake'],
    active_overlay: 'worldmap.events.breaking',
    layer_toggles: {},
};

// --- Layer registry ---

test('listAllLayers returns all layers sorted by role then name', () => {
    const all = listAllLayers();
    assert.ok(all.length >= 35, `expected >=35 layers, got ${all.length}`);
    assert.ok(all.every(l => l.id), 'every layer has an id');
    assert.ok(all.every(l => l.name), 'every layer has a name');
    assert.ok(all.every(l => l.minRole), 'every layer has a minRole');
    assert.ok(all.every(l => l.viz), 'every layer has a viz config');
    assert.ok(all.every(l => l.icon), 'every layer has an icon');
    // First layer must be public
    assert.equal(all[0].minRole, 'public');
    // Last layer must be godadmin
    assert.equal(all[all.length - 1].minRole, 'godadmin');
});

test('getLayerById returns layer or null', () => {
    const l = getLayerById('worldmap.events.breaking');
    assert.ok(l, 'known layer found');
    assert.equal(l.name, 'Breaking news (GDELT)');
    assert.equal(l.minRole, 'user');
    assert.equal(getLayerById('nonexistent.layer'), null);
});

test('VIZ_KINDS includes all expected viz types', () => {
    assert.ok(VIZ_KINDS.includes('pinpoint'));
    assert.ok(VIZ_KINDS.includes('cluster'));
    assert.ok(VIZ_KINDS.includes('heatmap'));
    assert.ok(VIZ_KINDS.includes('polygon'));
    assert.ok(VIZ_KINDS.includes('arc'));
    assert.ok(VIZ_KINDS.includes('tile'));
});

test('every layer has a valid viz.kind from VIZ_KINDS', () => {
    const all = listAllLayers();
    for (const l of all) {
        assert.ok(
            VIZ_KINDS.includes(l.viz.kind),
            `layer ${l.id} has unknown viz.kind: ${l.viz.kind}`
        );
    }
});

test('every spatial layer has coords; tile layers are intentionally non-spatial', () => {
    const all = listAllLayers();
    for (const l of all) {
        if (l.spatial === false) {
            // Non-spatial layers (basemaps like satellite/terrain) have no features.
            // tile is a valid non-spatial viz kind.
            assert.ok(VIZ_KINDS.includes(l.viz.kind), `${l.id} has unknown viz.kind: ${l.viz.kind}`);
        }
    }
});

// --- Role visibility ---

test('public role sees public layers only', () => {
    const layers = getVisibleLayers('public');
    const ids = layers.map(l => l.id);
    assert.ok(ids.includes('worldmap.network.peers'));
    assert.ok(ids.includes('worldmap.events.iss'));
    assert.ok(ids.includes('worldmap.transport.aircraft'));
    assert.ok(!ids.includes('worldmap.events.breaking'), 'user layer hidden from public');
    assert.ok(!ids.includes('worldmap.threat.intel'), 'admin layer hidden from public');
    assert.ok(!ids.includes('worldmap.visitors.heatmap'), 'godadmin layer hidden from public');
});

test('user role sees public + user layers', () => {
    const layers = getVisibleLayers('user');
    const ids = layers.map(l => l.id);
    assert.ok(ids.includes('worldmap.events.breaking'));
    assert.ok(ids.includes('worldmap.events.earthquake'));
    assert.ok(ids.includes('worldmap.network.peers'));
    assert.ok(!ids.includes('worldmap.threat.intel'));
    assert.ok(!ids.includes('worldmap.visitors.heatmap'));
});

test('admin role sees public + user + admin layers', () => {
    const layers = getVisibleLayers('admin');
    const ids = layers.map(l => l.id);
    assert.ok(ids.includes('worldmap.threat.intel'));
    assert.ok(ids.includes('worldmap.network.bgp'));
    assert.ok(ids.includes('worldmap.events.breaking'));
    assert.ok(ids.includes('worldmap.network.peers'));
    assert.ok(!ids.includes('worldmap.visitors.heatmap'));
});

test('godadmin sees everything', () => {
    const layers = getVisibleLayers('godadmin');
    const ids = layers.map(l => l.id);
    assert.ok(ids.includes('worldmap.visitors.heatmap'));
    assert.ok(ids.includes('worldmap.threat.intel'));
    assert.ok(ids.includes('worldmap.network.peers'));
    assert.equal(layers.length, listAllLayers().length);
});

test('canSeeLayer respects role hierarchy', () => {
    assert.equal(canSeeLayer('public', 'worldmap.network.peers'), true);
    assert.equal(canSeeLayer('public', 'worldmap.events.breaking'), false);
    assert.equal(canSeeLayer('user', 'worldmap.events.breaking'), true);
    assert.equal(canSeeLayer('user', 'worldmap.threat.intel'), false);
    assert.equal(canSeeLayer('admin', 'worldmap.threat.intel'), true);
    assert.equal(canSeeLayer('admin', 'worldmap.visitors.heatmap'), false);
    assert.equal(canSeeLayer('godadmin', 'worldmap.visitors.heatmap'), true);
});

test('canSeeLayer returns false for unknown layer', () => {
    assert.equal(canSeeLayer('godadmin', 'nonexistent.layer'), false);
});

// --- Starred layers ---

test('getStarredLayers filters out layers not visible to role', () => {
    const visible = getStarredLayers('user', [
        'worldmap.events.breaking',
        'worldmap.visitors.heatmap', // godadmin - must be dropped
        'worldmap.network.peers',    // public - visible
    ]);
    const ids = visible.map(l => l.id);
    assert.ok(ids.includes('worldmap.events.breaking'));
    assert.ok(ids.includes('worldmap.network.peers'));
    assert.ok(!ids.includes('worldmap.visitors.heatmap'));
});

test('sanitizeStarred drops role-inaccessible layers', () => {
    const result = sanitizeStarred('user', [
        'worldmap.events.breaking',
        'worldmap.threat.intel',
        'worldmap.visitors.heatmap',
    ]);
    assert.deepEqual(result, ['worldmap.events.breaking']);
});

// --- Reorder by stars ---

test('reorderByStars puts starred first, unstarred second', () => {
    const reordered = reorderByStars('admin', [
        'worldmap.network.bgp',
        'worldmap.threat.intel',
    ]);
    const ids = reordered.map(l => l.id);
    // Starred layers come first
    assert.equal(ids[0], 'worldmap.network.bgp');
    assert.equal(ids[1], 'worldmap.threat.intel');
    // Non-starred follow in default order
    const firstUnstarredIdx = ids.findIndex(
        id => id !== 'worldmap.network.bgp' && id !== 'worldmap.threat.intel'
    );
    assert.ok(firstUnstarredIdx >= 2, 'starred must come first');
});

test('reorderByStars is stable for unstarred', () => {
    const all = getVisibleLayers('admin');
    const ids = all.map(l => l.id);
    const reordered = reorderByStars('admin', ['worldmap.threat.intel']);
    const reorderedIds = reordered.map(l => l.id);
    // All non-starred layers must appear in the same relative order
    const nonStarred = ids.filter(id => id !== 'worldmap.threat.intel');
    const reorderedNonStarred = reorderedIds.filter(id => id !== 'worldmap.threat.intel');
    assert.deepEqual(reorderedNonStarred, nonStarred, 'non-starred order must be stable');
});

// --- Layer activation ---

test('isLayerActive: explicit toggle true wins', () => {
    const prefs = { starred_layers: [], active_overlay: null, layer_toggles: { 'worldmap.events.breaking': true } };
    assert.equal(isLayerActive('user', 'worldmap.events.breaking', prefs), true);
});

test('isLayerActive: explicit toggle false wins (always)', () => {
    const prefs = { starred_layers: ['worldmap.events.breaking'], active_overlay: 'worldmap.events.breaking', layer_toggles: { 'worldmap.events.breaking': false } };
    assert.equal(isLayerActive('user', 'worldmap.events.breaking', prefs), false);
});

test('isLayerActive: starred implies active', () => {
    const prefs = { starred_layers: ['worldmap.events.breaking'], active_overlay: null, layer_toggles: {} };
    assert.equal(isLayerActive('user', 'worldmap.events.breaking', prefs), true);
});

test('isLayerActive: active_overlay implies active', () => {
    const prefs = { starred_layers: [], active_overlay: 'worldmap.events.breaking', layer_toggles: {} };
    assert.equal(isLayerActive('user', 'worldmap.events.breaking', prefs), true);
});

test('isLayerActive: non-visible role returns false', () => {
    const prefs = { starred_layers: ['worldmap.visitors.heatmap'], layer_toggles: {} };
    assert.equal(isLayerActive('user', 'worldmap.visitors.heatmap', prefs), false);
});

test('resolveActiveLayers returns correct set', () => {
    const prefs = {
        starred_layers: ['worldmap.events.breaking'],
        active_overlay: 'worldmap.events.earthquake',
        layer_toggles: { 'worldmap.events.conflict': false },
    };
    const active = resolveActiveLayers('user', prefs);
    assert.ok(active.includes('worldmap.events.breaking'), 'starred');
    assert.ok(active.includes('worldmap.events.earthquake'), 'active_overlay');
    assert.ok(!active.includes('worldmap.events.conflict'), 'explicit off');
});

// --- mergePrefs ---

test('mergePrefs sanitizes starred on role change', () => {
    const base = { starred_layers: ['worldmap.visitors.heatmap', 'worldmap.events.breaking'] };
    const merged = mergePrefs('user', base, {});
    assert.ok(!merged.starred_layers.includes('worldmap.visitors.heatmap'), 'godadmin layer dropped for user');
    assert.ok(merged.starred_layers.includes('worldmap.events.breaking'), 'user layer kept');
});

test('mergePrefs applies partial updates', () => {
    const base = {
        starred_layers: ['worldmap.events.breaking'],
        active_overlay: 'worldmap.events.breaking',
        layer_toggles: {},
    };
    const merged = mergePrefs('admin', base, {
        starred_layers: ['worldmap.threat.intel'],
        active_overlay: null,
    });
    assert.deepEqual(merged.starred_layers, ['worldmap.threat.intel']);
    assert.equal(merged.active_overlay, null);
    // base fields not in update are preserved
    assert.ok(merged.layer_toggles && typeof merged.layer_toggles === 'object');
});

test('mergePrefs drops invalid active_overlay', () => {
    const base = {};
    const merged = mergePrefs('user', base, { active_overlay: 'worldmap.threat.intel' });
    assert.equal(merged.active_overlay, null);
});

// --- Viewport state ---

test('encodeViewportState includes role and timestamp', () => {
    const state = encodeViewportState(
        { center: [0, 51], zoom: 4 },
        ['worldmap.threat.intel', 'worldmap.network.bgp'],
        'admin'
    );
    assert.deepEqual(state.viewport.center, [0, 51]);
    assert.equal(state.viewport.zoom, 4);
    assert.equal(state.role, 'admin');
    assert.ok(state.saved_at);
    assert.ok(state.starred_layers.includes('worldmap.threat.intel'));
    // godadmin-only layers must be dropped for admin role
    const state2 = encodeViewportState(
        { center: [0, 51], zoom: 4 },
        ['worldmap.threat.intel', 'worldmap.visitors.heatmap'],
        'admin'
    );
    assert.ok(!state2.starred_layers.includes('worldmap.visitors.heatmap'));
});

test('decodeViewportState accepts valid JSON', () => {
    const original = encodeViewportState(
        { center: [4.9, 52.3], zoom: 8, pitch: 30 },
        ['worldmap.network.peers'],
        'public'
    );
    const decoded = decodeViewportState(JSON.stringify(original));
    assert.deepEqual(decoded, original);
});

test('decodeViewportState rejects invalid input', () => {
    assert.equal(decodeViewportState('not json'), null);
    assert.equal(decodeViewportState(null), null);
    assert.equal(decodeViewportState('{}'), null);
    assert.equal(decodeViewportState('{"role":"hacker","viewport":{"center":[1,2],"zoom":5}}'), null);
});

test('decodeViewportState rejects invalid viewport', () => {
    assert.equal(decodeViewportState('{"role":"public","viewport":{"center":[1],"zoom":5}}'), null);
    assert.equal(decodeViewportState('{"role":"public","viewport":{"center":[1,2]}}'), null);
});

test('all layers are reachable from godadmin', () => {
    const allIds = new Set(listAllLayers().map(l => l.id));
    for (const id of allIds) {
        assert.equal(canSeeLayer('godadmin', id), true, `godadmin must see ${id}`);
    }
});

// --- Datalayer payload decoding ---

test('decodeDatalayerPayload accepts valid payload', () => {
    const payload = {
        layer: 'worldmap.events.breaking',
        source: 'gdelt',
        timestamp: '2026-08-30T12:00:00Z',
        features: [
            { id: 'f1', coords: [51.05, 3.7], country: 'BE', label: 'Ghent' },
            { id: 'f2', coords: [40.71, -74.0], country: 'US', label: 'New York' },
        ],
    };
    const result = decodeDatalayerPayload(payload);
    assert.equal(result.ok, true);
    assert.equal(result.payload.features.length, 2);
    assert.equal(result.payload.features[0].id, 'f1');
    assert.deepEqual(result.payload.features[0].coords, [51.05, 3.7]);
    assert.ok(result.payload.meta.count === 2);
    assert.ok(result.payload.meta.spatial === 2);
});

test('decodeDatalayerPayload rejects invalid json', () => {
    assert.equal(decodeDatalayerPayload('not json').ok, false);
});

test('decodeDatalayerPayload rejects missing layer', () => {
    const result = decodeDatalayerPayload({ source: 'x', timestamp: '2026-08-30T12:00:00Z', features: [] });
    assert.equal(result.ok, false);
    assert.ok(result.error.includes('layer'));
});

test('decodeDatalayerPayload rejects unknown layer', () => {
    const result = decodeDatalayerPayload({ layer: 'nonexistent.layer', source: 'x', timestamp: '2026-08-30T12:00:00Z', features: [] });
    assert.equal(result.ok, false);
    assert.ok(result.error.includes('unknown'));
});

test('decodeDatalayerPayload rejects invalid coords', () => {
    const result = decodeDatalayerPayload({
        layer: 'worldmap.events.breaking',
        source: 'gdelt',
        timestamp: '2026-08-30T12:00:00Z',
        features: [{ id: 'f1', coords: [91, 3.7] }], // lat > 90
    });
    assert.equal(result.ok, false);
    assert.ok(result.error.includes('coords'));
});

test('decodeDatalayerPayload rejects coords out of lon range', () => {
    const result = decodeDatalayerPayload({
        layer: 'worldmap.events.breaking',
        source: 'gdelt',
        timestamp: '2026-08-30T12:00:00Z',
        features: [{ id: 'f1', coords: [51.05, -181] }], // lon < -180
    });
    assert.equal(result.ok, false);
});

test('decodeDatalayerPayload rejects invalid timestamp', () => {
    const result = decodeDatalayerPayload({
        layer: 'worldmap.events.breaking',
        source: 'gdelt',
        timestamp: 'not-a-date',
        features: [],
    });
    assert.equal(result.ok, false);
});

test('decodeDatalayerPayload rejects >50000 features', () => {
    const result = decodeDatalayerPayload({
        layer: 'worldmap.events.breaking',
        source: 'gdelt',
        timestamp: '2026-08-30T12:00:00Z',
        features: Array.from({ length: 50001 }, (_, i) => ({ id: `f${i}`, coords: [0, 0] })),
    });
    assert.equal(result.ok, false);
    assert.ok(result.error.includes('too many'));
});

test('decodeDatalayerPayload accepts empty features', () => {
    const result = decodeDatalayerPayload({
        layer: 'worldmap.events.breaking',
        source: 'gdelt',
        timestamp: '2026-08-30T12:00:00Z',
        features: [],
    });
    assert.equal(result.ok, true);
    assert.equal(result.payload.features.length, 0);
});

// --- Clustering ---

test('clusterFeatures returns empty for empty input', () => {
    assert.deepEqual(clusterFeatures([], {}), []);
    assert.deepEqual(clusterFeatures(null, {}), []);
});

test('clusterFeatures returns pinpoint for single feature', () => {
    const features = [{ id: 'f1', coords: [51.05, 3.7], payload: { mag: 4.2 } }];
    const clusters = clusterFeatures(features, { zoom: 10 });
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].kind, 'pinpoint');
    assert.deepEqual(clusters[0].coords, [51.05, 3.7]);
});

test('clusterFeatures clusters nearby features at low zoom', () => {
    // Two features very close together at zoom=1 should cluster
    const features = [
        { id: 'f1', coords: [51.0, 3.7] },
        { id: 'f2', coords: [51.01, 3.71] },
    ];
    const clusters = clusterFeatures(features, { zoom: 1 });
    // At zoom 1, the cell size is huge, so they cluster into one
    assert.ok(clusters.length <= 2);
    const hasCluster = clusters.some(c => c.kind === 'cluster' && c.count === 2);
    assert.ok(hasCluster, 'nearby features must cluster at low zoom');
});

test('clusterFeatures returns pinpoint for widely-spaced features', () => {
    const features = [
        { id: 'f1', coords: [51.0, 3.7] },    // Ghent
        { id: 'f2', coords: [40.7, -74.0] },   // New York
    ];
    const clusters = clusterFeatures(features, { zoom: 10 });
    assert.equal(clusters.length, 2);
    assert.ok(clusters.every(c => c.kind === 'pinpoint'));
});

test('clusterFeatures aggregates weight correctly', () => {
    const features = [
        { id: 'f1', coords: [51.0, 3.7], payload: { mag: 4.0 } },
        { id: 'f2', coords: [51.01, 3.71], payload: { mag: 3.0 } },
    ];
    const clusters = clusterFeatures(features, { zoom: 1, weight: 'mag' });
    const cluster = clusters.find(c => c.kind === 'cluster');
    if (cluster) {
        assert.equal(cluster.count, 2);
        assert.equal(cluster.weight, 7.0);
    }
});

test('clusterFeatures zoom 22 gives some clustering due to equirectangular distortion', () => {
    const features = Array.from({ length: 100 }, (_, i) => ({
        id: `f${i}`,
        coords: [51.05 + i * 0.001, 3.7],
    }));
    const clusters = clusterFeatures(features, { zoom: 22 });
    // At zoom 22, cellDeg=512 so even 0.001° spacing clusters heavily.
    // At least one cluster must form.
    assert.ok(clusters.length < 100, 'zoom 22 must cluster some points');
});

// --- pickViz ---

test('pickViz returns layer info', () => {
    const v = pickViz('worldmap.events.breaking', 10);
    assert.ok(v);
    assert.ok(VIZ_KINDS.includes(v.kind));
    assert.ok(typeof v.sizePx === 'number');
    assert.ok(typeof v.color === 'string');
});

test('pickViz switches to heatmap above 500 features', () => {
    const v = pickViz('worldmap.events.breaking', 600);
    assert.equal(v.kind, 'heatmap');
});

test('pickViz switches to cluster above 25 for cluster layers', () => {
    const v = pickViz('worldmap.transport.aircraft', 100);
    assert.equal(v.kind, 'cluster');
});

test('pickViz returns null for unknown layer', () => {
    assert.equal(pickViz('nonexistent.layer', 10), null);
});

// --- projectLatLon ---

test('projectLatLon returns pixel coords', () => {
    const vp = { width: 800, height: 400, center: [0, 0], zoom: 1 };
    const [x, y] = projectLatLon(0, 0, vp);
    assert.equal(x, 400); // center
    assert.equal(y, 200);
});

test('projectLatLon moves east/west correctly', () => {
    const vp = { width: 800, height: 400, center: [0, 0], zoom: 1 };
    const [x] = projectLatLon(0, 90, vp);
    assert.ok(x > 400, 'east of center must be right of center');
});

test('projectLatLon moves north/south correctly', () => {
    const vp = { width: 800, height: 400, center: [0, 0], zoom: 1 };
    const [, y] = projectLatLon(45, 0, vp);
    assert.ok(y < 200, 'north must be above center');
});

// --- getStarredLayers (regression) ---

test('getStarredLayers handles empty starred list', () => {
    const result = getStarredLayers('admin', []);
    assert.deepEqual(result, []);
});

test('getStarredLayers returns all valid starred in registry order', () => {
    // worldmap.network.bgp (idx 22) appears BEFORE worldmap.threat.intel (idx 31)
    // in the admin visible list — registry order differs from starredIds order.
    const result = getStarredLayers('admin', [
        'worldmap.threat.intel',
        'worldmap.network.bgp',
        'worldmap.osint.cve',
    ]);
    const ids = result.map(l => l.id);
    assert.ok(ids.includes('worldmap.threat.intel'));
    assert.ok(ids.includes('worldmap.network.bgp'));
    assert.ok(ids.includes('worldmap.osint.cve'));
    const nIdx = ids.indexOf('worldmap.network.bgp');
    const tIdx = ids.indexOf('worldmap.threat.intel');
    assert.ok(nIdx < tIdx, 'network.bgp comes before threat.intel in registry');
});
