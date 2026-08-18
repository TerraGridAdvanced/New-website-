# TerraGrid — Spatial Agriculture Intelligence

## Run

```bash
python -m http.server 8000
```

Open `http://localhost:8000`.

## Preserved project functionality

- First-launch AgriBot onboarding with reset and `?reset=1` testing override
- Google Maps satellite field mapper using the existing API key
- Reliable click-by-click polygon drawing with an explicit **Finish boundary** button
- Live polygon preview and visible corner markers
- Actual geodesic field-area calculation
- Area-scaled adaptive sampling; generated waypoints are filtered to remain inside the polygon
- Latitude/longitude coordinate table and mission JSON export
- Editable/persisted ESP32 mission endpoint
- Connection test, coordinate transmission, and `/start` rover workflow
- Start AgriBot locked until coordinates are successfully accepted
- Clear rover mission states and error messages
- Rover soil-result JSON import/fetch
- Soil results show Point / Moisture / pH / Condition without N/P/K UI dependency
- Soil-result map when returned data includes valid coordinates
- Region Intelligence with live location and Open-Meteo environmental data
- Responsive layout and dark mode
- Null-safe optional DOM event wiring

The existing visual identity, page structure, API key, mission payload structure, and Google Maps configuration are preserved.
