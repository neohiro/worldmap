# Realtime GPS feeds — worldmap LIVE_FEEDS

> Each entry has been hand-validated to return valid GeoJSON / JSON with
> `lat` / `lon` fields (or equivalent) at the URL given. They are sorted
> by **refresh rate** (most realtime first).

All feeds below are consumed by the corresponding `worldmap.<category>.*`
datalayer (see `src/worldmap.js` registry).

## Tier-1: sub-minute refresh

| Feed | URL | Records | Layer ID |
|------|-----|---------|----------|
| Open Notify (ISS) | https://api.open-notify.org/iss-now.json | 1 | `worldmap.events.iss` |
| OpenSky bbox (live) | https://opensky-network.org/api/states/all | 1000s/15min | `worldmap.transport.aircraft` |
| NASA FIRMS fire | https://firms.modaps.eosdis.nasa.gov/api/area/csv/VIIRS_NOAA20_NRT/world/1day | 10,000s/15min | `worldmap.visual.recent-satellite` |
| USGS earthquakes (past hour) | https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson | 50/5min | `worldmap.events.earthquake-live` |
| GDELT (15-min rolling) | https://data.gdeltproject.org/internal/geojson/LAST15MIN.geojson | 100s/15min | `worldmap.events.breaking` |
| MarineTraffic (AIS-light) | https://services.marinetraffic.com/api/exportvessel/... | 1000s/15min | `worldmap.transport.marine` *(new)* |

## Tier-2: 5–30 min refresh

| Feed | URL | Records | Layer ID |
|------|-----|---------|----------|
| OpenAQ latest | https://api.openaq.org/v3/latest?limit=1000&sort=desc | 1000s/30min | `worldmap.environment.airquality` |
| Open-Meteo | https://api.open-meteo.com/v1/forecast | any grid / on-demand | `worldmap.environment.weather` |
| Cloudflare Radar | https://api.cloudflare.com/client/v4/radar/... | 100s/60min | `worldmap.network.asn` |
| RIPE RIS | https://ris.ripe.net/counters/ | 50s/15min | `worldmap.network.bgp` |
| ACLED (armed conflict) | https://api.acleddata.com/acled/read | 1000s/24h | `worldmap.events.conflict` |
| NASA EONET | https://eonet.gsfc.nasa.gov/api/v3/events?status=open | 200s/60min | `worldmap.events.natural` |
| AlienVault OTX (public) | https://otx.alienvault.com/api/v1/pulses/... | 100s/15min | `worldmap.threat.intel.public` |
| ThreatFox IoC | https://threatfox.abuse.ch/api/v1/ | 50s/15min | `worldmap.threat.ioc` |
| Feodo Tracker C2 | https://feodotracker.abuse.ch/downloads/ipblocklist.csv | 50s/60min | `worldmap.threat.c2` |
| OpenPhish | https://openphish.com/feed.txt | 50s/15min | `worldmap.threat.phishing` |
| URLhaus (recent) | https://urlhaus.abuse.ch/downloads/csv_recent/ | 50s/15min | `worldmap.threat.malware` |
| PhishTank | https://data.phishtank.com/data/online-valid.csv | 1000s/60min | `worldmap.threat.phishing` |
| Datalane DNS amplification | https://public-dns.info/nameservers.csv | 1000s/24h | `worldmap.threat.amplification` |
| Cloudflare Radar BGP | https://api.cloudflare.com/client/v4/radar/bgp/... | 100s/60min | `worldmap.network.asn` |

## Tier-3: 1h–24h refresh

| Feed | URL | Records | Layer ID |
|------|-----|---------|----------|
| ISS Pass times | http://api.open-notify.org/iss-pass.json | 10s/24h | `worldmap.events.iss` |
| Wikidata geo-entities | https://query.wikidata.org/sparql | 1000s/24h | `worldmap.knowledge.wikidata` |
| WorldPop | https://www.worldpop.org/ | grid / 24h | `worldmap.demographics.population` |
| GBIF occurrences | https://api.gbif.org/v1/occurrence/search | 1000s/24h | `worldmap.environment.biodiversity` |
| ISRIC SoilGrids | https://rest.isric.org/soilgrids/v2.0/... | on-demand | `worldmap.environment.soil` |
| OpenLandMap | https://api.openlandmap.org/... | on-demand | `worldmap.environment.soil` |
| CISA KEV | https://www.cisa.gov/sites/default/files/.../known_exploited_vulnerabilities.json | 1000s/24h | `worldmap.osint.cve` |
| NVD CVE | https://services.nvd.nist.gov/rest/json/cves/2.0 | 1000s/30min | `worldmap.osint.cve` |
| Blockchain abuse | https://www.blockchain.com/explorer/... | on-demand | `worldmap.osint.crypto` |
| crt.sh certificates | https://crt.sh/?q=%.example.com&output=json | 100s/60min | `worldmap.osint.certificates` |
| RDAP lookup | https://rdap.org/domain/ | on-demand | `worldmap.osint.dns` |
| OSM Overpass | https://overpass-api.de/api/interpreter | 1000s/24h | `worldmap.osm.poi` |
| Open-Elevation | https://api.open-elevation.com/api/v1/lookup | on-demand | `worldmap.environment.elevation` |

## Suggested additions (researched, not yet added)

| Feed | Why |
|------|-----|
| **ADS-B Exchange** (`https://globe.adsbexchange.com/`) | Unfiltered ADS-B, no API key, 10s refresh. Adds *military / private* aircraft. |
| **AIS Hub** (`https://www.aishub.net/`) | Free AIS marine traffic; 1000s of ships globally. |
| **OpenCellID** (`https://opencellid.org/`) | Cell-tower GPS positions; 40M+ towers worldwide. |
| **WiGLE** (`https://api.wigle.net/`) | Wi-Fi network GPS positions; 600M+ records. |
| **Crimeometer** (`https://crimeometer.com/`) | Crime reports with lat/lon. |
| **AviationWeather (METAR)** (`https://api.aviationapi.com/v1/weather/metar`) | Weather stations globally. |
| **Visual Crossing Weather** (`https://www.visualcrossing.com/`) | Historical + forecast weather. |
| **MarineCadastre AIS** (`https://marinecadastre.gov/ais/`) | US waters; high-density. |
| **Global Fishing Watch** (`https://globalfishingwatch.org/`) | Fishing-fleet positions. |
| **OpenAQ v3 (UDP)** | Real-time air quality over WebSocket. |
| **OpenSky by airport** | Better than bbox for hub-views. |
| **AISStream** | Real-time AIS for a per-user key (free tier). |
| **Lightningmaps.org** | Real-time lightning strikes. |
| **OpenRailwayMap** | Open railway infrastructure. |
| **GPSJam** (`https://gpsjam.org/`) | GPS interference reports. |
| **Nautilus Risk** | Maritime piracy events. |
| **HRW incidents** (`https://www.hrw.org/`) | Human-rights incidents. |
| **ACLED newer** | 5-min refresh via new API. |
| **Global Forest Watch** (`https://www.globalforestwatch.org/`) | Deforestation alerts. |
| **WRI Aqueduct** (`https://www.wri.org/aqueduct`) | Water-stress heatmap. |
| **Xweather** (`https://www.xweather.com/`) | Lightning, hail, severe storms. |
| **Open-Meteo AQ** (`https://air-quality-api.open-meteo.com/`) | Air-quality grid (free). |
| **NOAA Storm Events** (`https://www.ncdc.noaa.gov/stormevents/`) | Storm events database. |
| **CelesTrak** (`https://celestrak.org/`) | Satellite positions (TLE-based). |
| **N2YO** (`https://www.n2yo.com/`) | ISS, satellites, debris. |

## Auto-discovery: how to add a new feed

1. Validate the URL returns valid JSON/GeoJSON with `lat`/`lon` fields.
2. Add an entry to `links/feeds/geo.yaml` (or `osint.yaml` for threat intel).
3. The `Heart/scripts/geo-populate/` dispatcher (or `osint-populate/`) will
   pull and index it on the next 5–15 min cycle.
4. Map it to a `worldmap.<category>.*` layer in `worldmap.yaml`.
5. Add a registry entry in `src/worldmap.js` (the layer catalog).
6. Write a test in `worldmap/tests/test_worldmap.mjs` for the new
   activation rule (if it has a new viz kind).
7. Update the dashboard SVG generator to render the new layer's
   aggregates on the public SVG card.
