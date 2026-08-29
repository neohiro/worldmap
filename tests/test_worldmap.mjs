/**
 * Tests for neohiro/worldmap. Uses node:test (no external deps).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    getVisibleLayers, listAllLayers, canSeeLayer,
    getStarredLayers, encodeViewportState, decodeViewportState,
    ROLES, LAYERS,
} from '../src/worldmap.js';

test('public role sees public layers only', () => {
    const layers = getVisibleLayers('public');
    const ids = layers.map(l => l.id);
    assert.ok(ids.includes('tailnet'));
    assert.ok(ids.includes('repos'));
    assert.ok(!ids.includes('exit-nodes'));
    assert.ok(!ids.includes('dns-chain'));
    assert.ok(!ids.includes('visitors'));
});

test('user role sees public + user layers', () => {
    const layers = getVisibleLayers('user');
    const ids = layers.map(l => l.id);
    assert.ok(ids.includes('tailnet'));
    assert.ok(ids.includes('exit-nodes'));
    assert.ok(ids.includes('heart'));
    assert.ok(!ids.includes('dns-chain'));
    assert.ok(!ids.includes('visitors'));
});

test('admin role sees public + user + admin layers', () => {
    const layers = getVisibleLayers('admin');
    const ids = layers.map(l => l.id);
    assert.ok(ids.includes('tailnet'));
    assert.ok(ids.includes('exit-nodes'));
    assert.ok(ids.includes('dns-chain'));
    assert.ok(ids.includes('ci-regions'));
    assert.ok(!ids.includes('visitors'));
});

test('godadmin sees everything', () => {
    const layers = getVisibleLayers('godadmin');
    const ids = layers.map(l => l.id);
    assert.ok(ids.includes('visitors'));
    assert.ok(ids.includes('audit'));
    assert.ok(ids.includes('tailnet'));
});

test('canSeeLayer respects role hierarchy', () => {
    assert.equal(canSeeLayer('public', 'tailnet'), true);
    assert.equal(canSeeLayer('public', 'exit-nodes'), false);
    assert.equal(canSeeLayer('user', 'exit-nodes'), true);
    assert.equal(canSeeLayer('user', 'dns-chain'), false);
    assert.equal(canSeeLayer('admin', 'visitors'), false);
    assert.equal(canSeeLayer('godadmin', 'visitors'), true);
});

test('canSeeLayer returns false for unknown layer', () => {
    assert.equal(canSeeLayer('godadmin', 'non-existent-layer'), false);
});

test('getStarredLayers filters out layers not visible to role', () => {
    const visible = getStarredLayers('public', ['tailnet', 'visitors', 'repos']);
    const ids = visible.map(l => l.id);
    assert.ok(ids.includes('tailnet'));
    assert.ok(ids.includes('repos'));
    assert.ok(!ids.includes('visitors'), 'godadmin layer must be filtered out');
});

test('encodeViewportState includes role and timestamp', () => {
    const state = encodeViewportState(
        { center: [0, 51], zoom: 4 },
        ['tailnet', 'exit-nodes'],
        'user'
    );
    assert.deepEqual(state.viewport.center, [0, 51]);
    assert.equal(state.viewport.zoom, 4);
    assert.equal(state.role, 'user');
    assert.ok(state.saved_at);
    // Starred layers include exit-nodes (visible to user)
    assert.ok(state.starred_layers.includes('exit-nodes'));
    // If a user starred godadmin layers, they should be removed
    const state2 = encodeViewportState(
        { center: [0, 51], zoom: 4 },
        ['tailnet', 'visitors'],
        'user'
    );
    assert.ok(!state2.starred_layers.includes('visitors'),
        'godadmin-only layer must be filtered from user starred list');
});

test('decodeViewportState accepts valid JSON', () => {
    const original = encodeViewportState(
        { center: [4.9, 52.3], zoom: 8, pitch: 30 },
        ['tailnet'],
        'admin'
    );
    const json = JSON.stringify(original);
    const decoded = decodeViewportState(json);
    assert.deepEqual(decoded, original);
});

test('decodeViewportState rejects invalid input', () => {
    assert.equal(decodeViewportState('not json'), null);
    assert.equal(decodeViewportState(null), null);
    assert.equal(decodeViewportState('{}'), null);
    // Missing viewport entirely
    assert.equal(decodeViewportState('{"role": "public"}'), null);
    // Unknown role
    assert.equal(decodeViewportState('{"role": "hacker", "viewport": {"center": [1, 2], "zoom": 5}}'), null);
});

test('decodeViewportState rejects invalid viewport', () => {
    // Missing zoom
    assert.equal(decodeViewportState('{"role":"public","viewport":{"center":[1,2]}}'), null);
    // Wrong center length
    assert.equal(decodeViewportState('{"role":"public","viewport":{"center":[1],"zoom":5}}'), null);
});

test('all layers are reachable from godadmin', () => {
    const allIds = new Set(listAllLayers().map(l => l.id));
    for (const id of allIds) {
        assert.equal(canSeeLayer('godadmin', id), true, `godadmin must see ${id}`);
    }
});
