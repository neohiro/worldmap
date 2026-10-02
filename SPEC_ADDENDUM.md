# worldmap/SPEC_ADDENDUM.md — datalayer GPS matrix + per-user overlay prefs + Login flow

> **Status: spec.** The `worldmap/` repo is the body of the organism.
> This addendum extends `src/worldmap.js` with:
>
> 1. A **datalayer GPS coordinate matrix** — typed datalayer payloads
>    that all share a common `{layer, source, timestamp, features[]}`
>    shape.
> 2. **Per-user overlay preferences** — a `prefs` subtree on the shared
>    drive (`/shared/brain/prefs/worldmap/<login>.yaml`) that remembers
>    each user's last viewport, starred layers, active overlay, and
>    layer toggles.
> 3. **Login flow on FPM / neohiro / openstageisland pages** — every
>    page on the three orgs has a Login button that links into the
>    dashboard's OAuth flow; the worldmap is only on the dashboard.
>
> See also:
> - `links/feeds/worldmap.yaml` — feed registry that the layers consume
> - `private-assistant/tools/groundings/worldmap.yaml` — tool entries
> - `Heart/schedules/REGISTRY.yaml` — heartbeat cadence for the
>   datalayer refresh scripts

## 1. Datalayer GPS coordinate matrix

Each datalayer payload is a JSON object with this exact shape:

```ts
type DatalayerPayload = {
  layer: string;          // e.g. "worldmap.events.breaking"
  source: string;         // e.g. "gdelt"
  timestamp: string;      // ISO-8601 UTC
  features: Array<{
    id: string;           // unique per feature
    coords: [number, number];   // [lat, lon] — WGS84
    country?: string;     // ISO 3166-1 alpha-2
    region?: string;
    label?: string;
    type?: string;        // "news" | "earthquake" | "iss" | "asn" | ...
    payload?: unknown;    // source-specific extra data
  }>;
};
```

A datalayer without GPS coordinates uses `coords: [0, 0]` as a sentinel
and a `type: "non-spatial"` field. The render path ignores spatial
projection for those.

### 1.1 Dashboard layout (map + legend panel)

The worldmap section is rendered as a **full-bleed side-by-side layout** on
the `neohiro-dashboard`. The section breaks out of `<main>`'s 1400 px
max-width to span the full viewport:

```
┌─────────────────────────────────────────────────┬───────────────────┐
│                                                 │  DATALAYERS       │
│              Map (Leaflet)                      │  [All][None][★]   │
│  (75vh / 600px min, Esri World Imagery          │  ☀️ Day/Night     │
│   satellite tiles, maxZoom 19)                  │  ┌─────────────┐  │
│                                                 │  │▼Public  (13)│  │
│                                                 │  │▼User    (12)│  │
│                                                 │  │▼Admin   (16)│  │
│                                                 │  │▼Godadmin (1)│  │
│                                                 │  │🛰 ISS      ▷│  │
│                                                 │  │✈ Aircraft  ▷│  │
│                                                 │  │… 42 layers  │  │
└─────────────────────────────────────────────────┴───────────────────┘
```

Grid: `grid-template-columns: 1fr 300px`; on screens ≤ 1080 px the
legend shrinks to 260 px; on screens ≤ 780 px the layout collapses to
a single column with the legend capped at 380 px.

**Basemap switcher** (top toolbar): Satellite (default, Esri World
Imagery) · Sat + Roads · Topo · Terrain · Dark · Streets. The active
basemap is persisted to `state.basemap` and round-trips through the
prefs YAML.

**Day / Night terminator** (top toolbar): clicking `☀️ Day/Night`
overlays a navy polygon (`#000028`, 55% opacity) on the night hemisphere
of the Earth. The terminator is computed from solar declination and
subsolar longitude (`subsolarLongitude`, `solarDeclination`) and is
recomputed every 60 s. Toggle state persists to
`localStorage['neohiro_worldmap_daynight']`. The terminator is anchored
at the polar cap corresponding to the night hemisphere (June solstice →
south pole, December solstice → north pole, equinoxes → 90° offset
from subsolar longitude).

**Legend controls**: a live filter (`<input type="search">`), `All` /
`None` bulk toggle, and `★` to filter to starred-only. Layer counts
update live (`12 / 42 layers`).

**Layer rows** render `icon name [★]`, grouped under a colored
`Public / User / Admin / Godadmin` heading. The grouping is role-gated
exactly like `getVisibleLayers` — a user never sees a row they cannot
toggle. Basemap/visual descriptors (`worldmap.visual.*`) are filtered
out of the data legend since they belong in the basemap switcher.

## 2. Datalayer types

| Layer ID | Source(s) | Min role | Refresh |
|----------|-----------|----------|---------|
| `worldmap.network.peers` | tailscale status | public | 60m |
| `worldmap.network.egress` | tailscale status | public | 60m |
| `worldmap.network.probes` | RIPE Atlas | public | 60m |
| `worldmap.events.breaking` | GDELT 15-min | user | 15m |
| `worldmap.events.earthquake` | USGS | user | 5m |
| `worldmap.events.iss` | wheretheiss.at | public | 60s |
| `worldmap.events.conflict` | ACLED | user | 24h |
| `worldmap.events.humanitarian` | UNHCR, ReliefWeb | user | 60m |
| `worldmap.network.bgp` | RIPE RIS, CAIDA | admin | 15m |
| `worldmap.osint.dns` | RDAP, IANA | admin | on-demand |
| `worldmap.osint.certificates` | crt.sh | admin | 60m |
| `worldmap.osint.footprint` | Shodan | admin | on-demand |
| `worldmap.osint.threat` | VirusTotal, AbuseIPDB | admin | on-demand |
| `worldmap.threat.intel` | AlienVault OTX | admin | 30m |
| `worldmap.threat.blocklist` | Emerging Threats | admin | 60m |
| `worldmap.threat.malware` | URLhaus | admin | 15m |
| `worldmap.network.asn` | Cloudflare Radar | admin | 60m |
| `worldmap.visitors.heatmap` | neohiro-dashboard analytics | godadmin | 15m |

The default map camera: 2D equirectangular Leaflet projection centered
on `[20, 0]` (mid-Atlantic), zoom 2. (Leaflet 1.9.4 does not support 3D
pitch/bearing — the previous spec line `pitch: 30` was aspirational
and never wired up. `pitch` and `bearing` are kept in the prefs schema
for forward-compat with MapLibre/Mapbox GL.)

## 3. Per-user overlay preferences

Stored at `/shared/brain/prefs/worldmap/<login>.yaml`. Mirrored to
`localStorage` by the dashboard's `encodeViewportState()`.

```yaml
id: prefs-worldmap-wout
login: neohiro
role: godadmin
updated: 2026-08-30T12:00:00Z

viewport:
  center: [3.7, 51.05]   # lon, lat (Ghent, BE)
  zoom: 4
  pitch: 30              # tilt-backwards default
  bearing: 0

starred_layers:
  - worldmap.network.peers
  - worldmap.events.breaking
  - worldmap.network.bgp

active_overlay: worldmap.events.breaking

layer_toggles:
  worldmap.network.peers: true
  worldmap.network.egress: true
  worldmap.network.probes: false
  worldmap.events.breaking: true
  worldmap.events.conflict: false
  worldmap.network.bgp: true
  worldmap.threat.intel: false
  worldmap.visitors.heatmap: false

auto_resume: true
```

When a user toggles a layer, the dashboard writes the prefs to
`/shared/brain/prefs/worldmap/<login>.yaml` via HMAC-signed POST
(see `Brain/src/godadmin_verify.go` for the verify path).

The **on/off toggle** in the UI has a clear precedence:

1. `layer_toggles.<id>` is the **authoritative** visibility flag.
   A `false` value ALWAYS hides the layer, regardless of `starred_layers`.
2. `starred_layers` is a **display order hint** — the UI sorts starred
   layers first but does NOT override a `layer_toggles.<id>: false`.
3. On read, the render applies: `visible = layer_toggles[id] == true
   AND canSeeLayer(role, id) == true`.
4. The UI must NOT write a `layer_toggles` entry for a layer the
   user cannot see (role-gated). The `getStarredLayers` filter
   (`worldmap/src/worldmap.js:96`) is applied first; the result is
   what the toggle UI can edit.

This resolves the contradictory state where a user "stars" a layer
they don't have role access to and the dashboard silently shows it.
Such stars are dropped on write.

The **last worldmap settings are memorized on overlay activation**:
when the user clicks an overlay button (e.g. "Show events.breaking"),
the dashboard sets `active_overlay` and writes the prefs. Writes are
serialized with a `ts` field; on read, the writer with the highest
`ts` wins (last-writer-wins). This is intentionally simple — if
concurrent writes become a problem, add an HMAC + monotonic counter
(see `Brain/90_SECURITY.md`).

## 4. Login flow on FPM / neohiro / openstageisland pages

Every page on the three orgs MUST include:

1. A **Login** button in the nav (top-right). The link is:
   `https://github.com/login/oauth/authorize?client_id=<OAUTH_APP_ID>&scope=read:user&state=<csrf>`
2. A **Dashboard** link in the nav. The link is:
   `https://transhumanists.github.io/dashboard/`
3. The worldmap is **only** on the dashboard. The org pages link to it
   but do not embed it.

### Pages that must include Login + Dashboard

| Org | Page | URL |
|-----|------|-----|
| neohiro | neohiro.github.io | `https://neohiro.github.io/` |
| neohiro | wingman-hub | `github.com/neohiro/wingman-hub` |
| FrenzyPenguin | frenzypenguin.media | `https://frenzypenguin.media/` |
| openstageisland | openstageisland.github.io | `https://openstageisland.github.io/` |
| transhumanists | transhumanists.github.io | `https://transhumanists.github.io/` |
| transhumanists | dashboard | `https://transhumanists.github.io/dashboard/#worldmap` |

### Auth flow

1. User clicks **Login** on an org page.
2. Browser navigates to GitHub OAuth.
3. GitHub redirects to `https://transhumanists.github.io/dashboard/oauth-callback?code=...&state=...`.
4. Dashboard exchanges code for a token via the GitHub OAuth App.
5. Dashboard writes a `userdata/<login>/session.yaml` with the token
   (encrypted at rest, see `network/SPEC_ADDENDA.md § 1`).
6. Dashboard redirects to the worldmap.
7. Worldmap reads `/shared/brain/prefs/worldmap/<login>.yaml` and
   applies the saved state.
8. On every layer toggle / viewport change, the worldmap writes
   back to the same path.

## 5. Heart cadence for datalayer refresh

| Scope | Cadence | Reference |
|-------|---------|-----------|
| `news-populate` | every 5 minutes | `Heart/schedules/REGISTRY.yaml` |
| `osint-populate` | every 15 minutes | same |
| `links-validate` | every 1 hour | same |
| `tools-populate` | every 6 hours | same |

These scripts run as the proposal Heart process. The live Heart
(`wingman-hub`) runs the same logical cadence via GitHub Actions cron
(see `wingman-hub/.github/workflows/`).

## 7. Known limitations

- **Day/night terminator is Leaflet-only on the original render path.**
  MapLibre GL JS now has its own day/night renderer
  (`NeoWorldmapMaplibre.renderDayNight`), but the SVG-fallback path
  (both CDNs unreachable) still has no visible terminator — no warning
  is shown. A future revision should draw a `day-night.svg` overlay on
  the fallback.
- **MapTiler vector basemaps require a free API key.** The renderer ships
  with a placeholder sentinel key. Until `window.MAP_TILER_KEY` is set
  (before `worldmap.js` loads), `_resolveStyle()` returns the raster fallback.
  If a real key is configured but MapTiler returns 401/403, the error handler
  catches the failure and falls back to raster automatically. The Terrain
  button is only effective on vector styles; on raster it is a no-op.
- **SSE auto-reconnect is 5s linear backoff.** No exponential backoff or
  jitter. If the upstream is down, the client fires a request every
  5s indefinitely. The new NDJSON live feed (`LiveDatalayerFeed`) does
  implement exponential backoff (1s → 30s, doubling), but the SSE scroll
  log does not.
- **`/worldmap/src/worldmap.js` cross-reference (§6) is a forward target.**
  The only existing implementation today is
  `neohiro-dashboard/assets/worldmap.js`. The `worldmap/` repo will
  host the server-side helpers when it lands; until then, the file
  referenced in §6 is aspirational.

## 8. Live NDJSON feed (2026-08-31)

Layers with `viz.streaming: true` (iss, aircraft, marine, lightning)
connect to a streaming endpoint:

```
GET /api/worldmap/layer/:id/stream
Content-Type: application/x-ndjson
```

Each line is a JSON object with one of three shapes:

```json
{"add":    [{"id": "...", "coords": [lat, lng], "label": "...", "country": "..."}]}
{"update": [{"id": "...", "coords": [lat, lng]}]}
{"remove": [{"id": "..."}]}
```

The browser (`LiveDatalayerFeed` in `worldmap.js`) keeps a `Map<id, marker>`
for the active layer and applies the events incrementally. Reconnection
uses exponential backoff (1s → 30s, doubling). The non-streaming
endpoints (`GET /api/worldmap/layer/:id`) keep working for one-shot
snapshots.

Layers that opt in (`worldmap.events.iss`, `worldmap.transport.aircraft`,
`worldmap.transport.marine`, `worldmap.events.lightning`) automatically
use the streaming feed when toggled on. All others fall back to the
one-shot fetch.

## 9. Mobile bottom-sheet legend (2026-08-31)

On viewports ≤780px wide, the legend panel collapses into a draggable
bottom sheet. The sheet has two states:

- **Peek** (default): only the legend header (with a drag handle) is
  visible. The rest is hidden via `transform: translateY(calc(100% - 56px))`.
- **Expanded**: full sheet, scrollable layer toggles, backdrop covers
  the map.

A floating action button (FAB) at bottom-right always shows the active
layer count and toggles the sheet. A backdrop element with
`position: fixed; inset: 0` covers the map when the sheet is expanded
and collapses it on click. `Escape` key also collapses the sheet.

CSS lives in `assets/style.css` (`.legend-fab`, `.legend-backdrop`,
`@media (max-width: 780px) .legend-panel`). The JS lives in
`worldmap.js:initBottomSheet()` (called from `initLegendControls`).


## 6. Cross-references

- `worldmap/src/worldmap.js` — server-side helpers (`encodeViewportState`,
  `decodeViewportState`, `mergePrefs`, `getStarredLayers`)
- `neohiro-dashboard/tests/test_worldmap.mjs` — 33 tests (node:test) for
  the browser-side `NeoWorldmap` module (auth, layers, basemaps,
  viewport state, day/night, URL overrides, MapLibre params, NDJSON feed,
  feed lifecycle + close, O(1) layer index, viz size coercion,
  terrain localStorage persistence, MapTiler vector-style key guard,
  terrain button hidden-by-default, NDJSON clean-close backoff,
  NDJSON catch race, day/night timer clear on disable)
- `neohiro-dashboard/tests/test_worldmap_e2e.mjs` — 8 Playwright smoke
  tests (Leaflet init, legend ≥42 rows, basemap persist, day/night
  persist, `?basemap=dark`, `?dn=1`, `?layer=`, mobile bottom sheet)
- `links/feeds/worldmap.yaml` — datalayer feed registry
- `private-assistant/tools/groundings/worldmap.yaml` — tool entries
- `Heart/schedules/REGISTRY.yaml` — heartbeat cadence
- `network/SPEC_ADDENDA.md § 1` — shared drive subtree list
- `userdata/PHILOSOPHY.md` — userdata privacy contract
- `neohiro-dashboard/index.html` — § worldmap-section (map + legend panel layout)
- `neohiro-dashboard/assets/style.css` — `.worldmap-layout`, `.legend-panel`, `.legend-group`, `#worldmap-section` (full-bleed breakout), `.legend-fab`, `.legend-backdrop` (mobile bottom sheet)
- `neohiro-dashboard/assets/worldmap.js` — `BASEMAPS`, `renderLayerToggles`, `setBasemap`, `initLegendControls`, `initBottomSheet`, `computeTerminatorCoords`, `toggleDayNight`, `initMapLibreMap`, `LiveDatalayerFeed`
- `neohiro-dashboard/assets/worldmap.maplibre.js` — MapLibre GL JS 3D renderer
  (activated via `?renderer=maplibre&pitch=30&bearing=15`); API:
  `initMap`, `remove`, `setTerrain`, `getTerrainEnabled`, `getHasTerrain`,
  `renderDayNight`, `addLayerFeatures`, `removeLayerFeatures`; MapTiler key
  via `window.MAP_TILER_KEY`; terrain-rgb source auto-added on vector styles;
  error handler falls back to raster on 401/403
- `neohiro-dashboard/assets/app.js` — `initWorldmap` (delegates to NeoWorldmap)

## 10. MapTiler vector basemaps + 3D terrain (2026-08-31)

When the URL flag `?renderer=maplibre` is set, the dashboard switches
from Leaflet raster basemaps to MapLibre GL JS. By default, the renderer
uses raster basemaps (Esri / CARTO / OSM) that work out of the box.

To unlock **vector tiles** (crisp labels, native hillshade) and **3D
terrain elevation**, set a MapTiler free-tier key:

1. Get a free key at https://cloud.maptiler.com (100 000 map loads/month).
2. Set `window.MAP_TILER_KEY = 'your-key'` before `worldmap.js` loads,
   e.g. in a `<script>` tag in `index.html` above the worldmap scripts.
3. Remove the placeholder sentinel `get_your_own_OpIi9ZULNHzrESv6T2vL`
   in `assets/worldmap.maplibre.js`.

When a real key is configured, `_resolveStyle()` returns the MapTiler
style URL and MapLibre fetches the vector style at runtime. The terrain
source `mapbox-elev` is auto-added on the `load` event and
`setTerrain({ source, exaggeration: 1.4 })` is called.

The **Terrain** toolbar button (id `terrain-toggle`) is hidden by
default in HTML and only revealed by `initMapLibreMap()` after the
MapLibre renderer is active. Clicking it toggles 3D terrain on/off;
the state is persisted to localStorage (`neohiro_worldmap_terrain`) and
restored on subsequent loads.

**If the MapTiler style URL fails to load** (e.g. 401 from a bad key),
the renderer's `error` listener detects the status and falls back to
the raster style. The page does not break, but vector features are
unavailable. The `error` listener also resets `ML_STATE.hasTerrain` to
`false` so a re-toggle won't crash.

**Raster fallback behavior**: on raster style basemaps, `setTerrain()`
is a no-op (the dem source is not added because raster basemaps do not
support 3D terrain). The Terrain button is still visible but stays
inactive if the user has not configured a MapTiler key.

This unlocks:
- 3D camera (pitch + bearing already in §1, now with vector labels that
  don't pixelate when the user tilts the view)
- 3D terrain extrusion (mountains, valleys visible at zoom > 5)
- Native building extrusion at zoom > 14 (MapTiler hybrid style
  includes a 3D buildings layer)
- Improved typography (vector text vs raster labels)

The 3D terrain feature is opt-in per user (toggle button); the default
remains flat. The default `?renderer=maplibre&pitch=30&bearing=-45`
flag still produces a tilted view but without terrain extrusion.
