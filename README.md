# neohiro/worldmap

**Private.** Dynamic global data layers for the neohiro dashboard.

```
   ┌────────────────────────────────────────────────────────────────┐
   │                    Body Anatomy (ASCII)                          │
   │                                                                │
   │   ┌──────────────────────────────────────────┐                 │
   │   │              Worldmap 🗺️                 │                 │
   │   │   Layers are the body's sensory map:      │                 │
   │   │                                          │                 │
   │   │   🌐 tailnet peers    (public)         │                 │
   │   │   📚 repos            (public)         │                 │
   │   │   🚪 egress paths     (user)            │                 │
   │   │   🔓 exit nodes      (user)            │                 │
   │   │   🔒 DNS chain       (admin)           │                 │
   │   │   👁️ visitors         (godadmin)        │                 │
   │   │   📜 audit trail     (godadmin)        │                 │
   │   └──────────────────────────────────────────┘                 │
   │                                                                │
   │   Role hierarchy: public < user < admin < godadmin             │
   │   Each layer is only visible to the minimum required role.     │
   │                                                                │
   └────────────────────────────────────────────────────────────────┘
```

## Architecture

- `src/worldmap.js` — role-gated layer definitions, viewport state
  encoding/decoding, persistence helpers (no external deps)
- `functions/worldmap.js` — Cloudflare Pages function: GET/POST
  `/api/worldmap` with KV storage per-user
- `tests/test_worldmap.mjs` — 12 tests using node:test

## Layers

| Layer | Role | Description |
|-------|------|-------------|
| Tailnet peers | public | Live Tailscale device locations |
| Public repos | public | GitHub repo activity |
| Egress paths | user | SOCKS5/Dante exit node routes |
| Exit nodes | user | Active exit node health |
| DNS chain | admin | DNSCrypt → Tor resolver chain |
| Visitor heatmap | godadmin | GeoIP heatmap (no PII) |
| Audit trail | godadmin | Last 100 auth events |

## State persistence

Viewport state (center, zoom, pitch, bearing, starred layers) is:

1. Saved to localStorage immediately on every interaction
2. Synced to Cloudflare KV via `/api/worldmap` (server-authoritative)

Cross-device sync: the server KV is the source of truth. On load, the
server state is merged with localStorage (local wins for viewport, server
wins for starred layers).

## Running

```sh
# Local dev
node --test tests/

# Deploy to Cloudflare Pages
wrangler pages deploy functions/ --project-name=neohiro-worldmap
```

## Dashboard integration

The dashboard loads `assets/worldmap.js` which exposes `NeoWorldmap` on
the global window. The dashboard's `initWorldmap()` uses these helpers to
build layer toggles and persist state.
