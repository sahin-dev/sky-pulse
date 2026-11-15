# SkyPulse — Live Flight Tracker

A modern flight-tracking site built with **Next.js 16** (App Router, Cache Components), **Tailwind CSS 4**,
**Motion** animations and **Leaflet** maps, powered by the [aviationstack](https://aviationstack.com) API.

## Features

- **Animated hero globe.** A canvas-rendered dotted Earth (every dot is a real airport) with flight arcs.
- **Live radar.** An interactive dark map of airborne flights. Click a plane to see its great-circle route, altitude, speed and heading.
- **Flight detail page** (`/flight/BA117`):
  - Animated progress track, with distance flown and distance left
  - Route map that splits the flown and remaining legs, with a rotating aircraft marker
  - Departure and arrival cards showing terminal, gate, baggage belt and delays
  - Live telemetry: altitude, ground speed, compass heading and vertical speed
  - Journey timeline, aircraft info, and other dates for the same flight number
- **Search** for a flight number (`EK203`), a route (`JFK-LHR`), airport departures or arrivals (`DXB`), or an airline name (`Lufthansa`). Airport fields autocomplete from 6,000+ airports.
- **Runs on free data.** With no paid API, flights come from ADS-B positions (OpenSky, adsb.lol) plus an open
  callsign → route database. An aviationstack key is optional and adds schedules, gates and delays.

## Getting started

```bash
npm install
cp .env.example .env.local   # then add your key
npm run dev                  # http://localhost:3000
```

### Environment variables

| Variable | Description |
| --- | --- |
| `FLIGHT_DATA` | `free`, `aviationstack` or `demo`. Default: `aviationstack` when a key is set, otherwise `free`. |
| `AVIATIONSTACK_API_KEY` | Optional key from the [aviationstack dashboard](https://aviationstack.com/dashboard). Leave it empty to run on free data only. |
| `AVIATIONSTACK_BASE_URL` | Defaults to the APILayer gateway `https://api.apilayer.net/aviationstack/v1` (per the official OpenAPI spec). Keys issued on apilayer.com only work on this host. |

| `AVIATIONSTACK_PAGE_LIMIT` | Results per request. `100` below the Professional plan, up to `1000` on Professional and above. |
| `AVIATIONSTACK_SNAPSHOT_PAGES` | Pages of airborne flights in the global radar snapshot (default `1`). |
| `AVIATIONSTACK_REGION_AIRPORTS` | Busiest airports queried when you zoom into a region (default `2`, `0` turns it off). |

| `POSITIONS_PROVIDER` | Live ADS-B positions: `auto` (default), `opensky`, `adsblol` or `off`. |
| `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` | Optional free OpenSky API client. Raises the daily limit from about 400 to about 4,000 credits. |

The key is only used on the server. It is never sent to the browser.

## Data modes

| | `free` (no key) | `aviationstack` (key set) | `demo` |
| --- | --- | --- | --- |
| Live positions | ADS-B | ADS-B, plus aviationstack | ADS-B traffic only |
| Routes | Open callsign database (inferred) | Airline schedule | Simulated |
| Departure / arrival times | Observed takeoff; estimated arrival | Scheduled, estimated, actual | Simulated |
| Gates, terminals, baggage, delays, cancellations | Not available | Yes | Simulated |
| Cost | Free | aviationstack plan | Free |

**Automatic fallback.** In `aviationstack` mode, if aviationstack refuses requests, the site switches to free mode.
This covers an exhausted plan (`HTTP 429 "Plan limit reached"`), an invalid or missing key, and an inactive account.
It then stops calling aviationstack for a while: 6 hours after a quota error, 1 hour after a key error, 5 minutes
after a rate limit. Pages show a notice explaining the switch (see `src/lib/flights.ts`). To use free data
permanently, set `FLIGHT_DATA=free`.

### How free mode builds a flight (`src/lib/free/`)

1. ADS-B gives every aircraft's position, callsign (e.g. `BAW212`) and ICAO address.
2. The callsign is looked up in the **open route database** (Virtual Radar Server standing data, CC0, about 625,000
   routes), e.g. `BAW212 → BOS-LHR`.
3. **Sanity checks.** The aircraft must be near the route and heading towards the destination. Otherwise the route is
   treated as unknown, because callsigns get reused and the database can be stale. On a multi-stop route, the leg the
   aircraft is on is chosen from its position.
4. **Status.** On the ground at the origin is shown as *Scheduled*, airborne as *In flight*, and on the ground at the
   destination as *Landed*.
5. **Times.** Departure is the observed takeoff from the ADS-B track (OpenSky). Arrival is estimated from remaining
   distance and ground speed, plus approach time. Both are labelled *observed* or *estimated* in the UI.
6. **Flight numbers.** `BA117` is turned into callsign `BAW117` using the airline table. Many airlines fly under the
   flight number, but not all: Qatar uses `QTR31T`. Searching the callsign directly always works, and radar
   links use the callsign plus the aircraft's ICAO address.
7. **Searches.** A route (`JFK-LHR`) lists the callsigns that operate it, live ones first. An airport (`DXB`) lists
   flights airborne from or to it right now. An airline lists its aircraft in the air.

Everything inferred is marked in the UI: an "inferred route" notice, plus *observed* and *estimated* labels.

## Accurate positions: ADS-B fusion

aviationstack has live positions for only a few percent of flights. Measured on this project: 4 of 91 airborne flights.
The rest used to be estimated from the schedule. SkyPulse now adds **ADS-B** data: aircraft broadcast their own
position, and community receiver networks publish it for free.

| Source | Used for | Notes |
| --- | --- | --- |
| [adsb.lol](https://api.adsb.lol/docs) | Zoomed-in radar views (point + radius ≤ 250 NM), single-aircraft lookups | No key, positions seconds old, includes registration and type. ODbL. |
| [OpenSky Network](https://openskynetwork.github.io/opensky-api/rest.html) | Wide views (bounding box, or the whole world), flown tracks | Free for non-commercial use. Daily credits: a world view costs 4. |

How it fits together (`src/lib/positions/`):

- **Matching.** Scheduled flights are matched to ADS-B aircraft by ICAO 24-bit address (`aircraft.icao24`), falling
  back to the operating flight's ICAO callsign (the codeshare's operating callsign where relevant). In a test, 11 of
  45 real aviationstack flights matched a live aircraft an hour after capture.
- **Traffic.** Aircraft that don't match a scheduled flight still appear on the radar, coloured by altitude. They show
  an airline when the callsign identifies one, and a guessed flight number to look up.
- **Dead reckoning.** Positions keep moving between updates along their heading at ground speed, for up to 10 minutes.
  A fix older than 20 minutes falls back to the schedule estimate (`src/lib/geo.ts`).
- **Confidence in the UI.** Every position is labelled *Live ADS-B · 4s ago*, *Airline position · 8m ago* or
  *Estimated from schedule*. Estimated planes are translucent on the radar and get an uncertainty halo on the flight
  page.
- **Flight page.** Airborne flights get their ADS-B position on load, refresh it every 15 seconds via
  `/api/aircraft` (no aviationstack quota), and draw the **actual flown track** from OpenSky instead of an idealised
  great circle.
- **Resilience.** If aviationstack fails (e.g. quota used up), the radar still shows ADS-B traffic. If one ADS-B
  provider fails, the other is tried.
- **Demo mode.** Simulated flights are never matched to real aircraft. Real ADS-B traffic is still shown.

## Reference data

- `src/data/airports.json`: [OurAirports](https://ourairports.com/data/) (public domain, updated daily). Provides
  names, coordinates, and airport size used to pick regional hubs. IANA time zones come from
  [OpenFlights](https://openflights.org/data).
- `src/data/routes.txt`: callsign → route from the [standing data](https://github.com/vradarserver/standing-data)
  of Virtual Radar Server (CC0). About 625,000 routes in about 10 MB, kept as one sorted string with binary-search
  lookups, so memory stays low.
- `src/data/airlines.json`: ICAO → IATA and name. From the same standing data (maintained), with OpenFlights as a
  fallback for designators it lacks.

Refresh both with:

```bash
npm run data:routes
```

This downloads the latest standing data. Callsign routes change with airline schedule seasons, so refresh every few
weeks. The routes file is read from disk at runtime; `outputFileTracingIncludes` in `next.config.ts` ships it with
deployments.

## How the live radar loads flights for the map area

aviationstack has **no geographic filter**: `/flights` can't be asked for "flights in this map area". So when you pan
or zoom the radar, the browser calls `GET /api/flights/area?s=&w=&n=&e=` (debounced, older requests cancelled).
The server then combines two sources:

1. **Global snapshot.** `SNAPSHOT_PAGES` × `PAGE_LIMIT` airborne flights, cached and shared by all visitors,
   filtered to the visible box. Panning reuses the cache, so it costs no extra API requests.
2. **Regional boost.** Once the view is narrower than 90° of longitude, it also fetches live departures from the
   `REGION_AIRPORTS` busiest hubs inside the box. aviationstack *can* filter by departure airport, so this fills
   in the region you're looking at. Each airport is one request, cached for 10 minutes.

Each flight is placed by its live GPS position when aviationstack provides one, or otherwise estimated from the
schedule along the great-circle route. It's kept if that position falls inside the box. Boxes that cross the
date line are handled.

**Quota math:** with the defaults, one snapshot refresh is 1 request per 10 minutes of activity, plus up to 2
requests per newly explored region. On the free plan (100 requests/month), set `AVIATIONSTACK_REGION_AIRPORTS=0`
if you share the site widely. On paid plans, raise `SNAPSHOT_PAGES` / `PAGE_LIMIT` for denser global coverage.

## Saving API quota

The aviationstack free plan allows about **100 requests per month**, so every API call is cached on the server with
`"use cache"` and `cacheLife` (see `src/lib/aviationstack.ts`):

| Data | Server revalidate |
| --- | --- |
| Live radar (active flights) | 10 min |
| Flight / search lookups | 3 min |
| Errors | 30 s |

Every visitor shares one cached result. On the flight page, aircraft movement between refreshes is interpolated
in the browser, so the plane keeps moving without new API calls. Auto-refresh is off by default.

## How it works

```
src/
  app/
    page.tsx               Home: hero, live radar, features
    search/page.tsx        Search results (flight / route / airport / airline)
    flight/[code]/page.tsx Flight detail
    api/airports/route.ts  Airport autocomplete (local dataset, no API quota)
  components/
    HeroGlobe.tsx          Canvas globe animation
    LiveRadar.tsx          Radar map + flight list
    FlightDetail.tsx       Flight detail UI
    map/                   Leaflet maps (client-only, lazy-loaded)
  lib/
    aviationstack.ts       API client, caching, normalisation
    mock.ts                Demo data in aviationstack's response shape
    geo.ts                 Great-circle maths, progress, interpolation
    time.ts                Airport-local time handling
  data/
    airports.json          OpenFlights airport coordinates (IATA → lat/lon/tz)
```

**Note on aviationstack times:** the API returns airport-*local* wall-clock times labelled `+00:00`.
`lib/time.ts` converts them to real UTC instants using each airport's IANA time zone, which keeps progress
and countdowns correct. Times are shown in local airport time, as on airport boards.

**Airport coordinates:** flight responses don't include coordinates, so they come from the bundled
OpenFlights dataset. This also keeps airport lookups off the API quota.

## Credits

Positions: The OpenSky Network, adsb.lol (ODbL) · Routes and airlines: Virtual Radar Server standing data (CC0) · Airports: OurAirports (public domain), OpenFlights (ODbL) · Optional schedules: aviationstack · Map tiles: Esri, OpenStreetMap contributors
