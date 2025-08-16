# World Map — Rings & Stripes

This app plots your places on a world map and shows which 10° “rings” (latitude bands) and “stripes” (longitude bands) you’ve visited. It supports CSV import/export, duplicate row merging, automatic band_type inference from dates, configurable marker shapes and colors, stable curved leader lines, and high‑quality screenshots.

Notes
- Stripe numbers appear across the top.
- Ring numbers appear inside stripe 1 (center longitude −175) by design.

---

## Quick start

1) Open the app in your browser.  
2) Load data:
- Drag a CSV onto the map, or
- Click “Choose File”, or
- Click “Example” to load a demo dataset.
3) Use the Ring/Stripe/Both/None filter chips to control visibility.
4) Click the gear → Settings to customize Colors and Shapes.
5) “Save As” to export a normalized CSV or a Picture (PNG/JPEG/WEBP).

Tip: Right‑click on the map to add a marker at that position, or right‑click an existing marker to edit it.

---

## CSV format

Minimum required columns (case‑insensitive, synonyms supported):
- lat or latitude
- lon, lng, long, or longitude
- label, name, or title

Optional columns:
- band_type (synonyms: band, type, stripe, ring)
- date
- comment (synonyms: notes, note, description)

Only these columns are recognized. All other columns are skipped and reported (see “Skipped columns and rows”).

Example
```csv
lat,lon,label,band_type,date,comment
48.8584,2.2945,Eiffel Tower,stripe,2023-06-01,Paris
61.2181,-149.9003,Anchorage,ring,2022-08-11,Alaska
-22.9519,-43.2105,Christ the Redeemer,,2021-02-14,No band_type provided
```

---

## Duplicate handling (“Set” combining)

Rows that share the same GPS and label are grouped into a Set and combined into a single marker.

How a Set is identified
- Longitude is normalized into −180..180.
- Coordinates are rounded to 6 decimals to avoid floating noise.
- Label match is case‑insensitive.

What goes into the combined marker
- lat, lon: from the Set key (normalized).
- label: from the Set key.
- date: earliest valid date found in the Set. If the Set has no valid dates, the first row’s date value is used as‑is.
- comment: unique non‑empty comments joined with “ | ”.
- band_type: resolved by the rules below.
- lat_bin, lon_bin: the 10° bins used for ring/stripe indices.
- set_rows: number of CSV rows merged into this marker (shown in the popup).

---

## band_type resolution

A. When a Set contains explicit band_type values
- Valid explicit values (case‑insensitive): ring, stripe, both, none.
- If all explicit values agree → use that value.
- If there are exactly two values and one is none → use the other value.
- If values include two or more among {stripe, ring, both} → use both.

B. When a Set has no explicit band_type values (i.e., blank/invalid in all rows)
- If the Set has no valid date → band_type = none.
- Otherwise, use the Set’s earliest valid date and compare it against the entire dataset (all combined markers):
  1) If it is the earliest date in its stripe (lon_bin) AND also the earliest in its ring (lat_bin), set band_type = both.
  2) Else if it is the earliest date in its stripe, set band_type = stripe.
  3) Else if it is the earliest date in its ring, set band_type = ring.
  4) Else set band_type = none.

Additional notes
- “Valid date” means the browser can parse it (Date.parse). ISO 8601 (YYYY‑MM‑DD) is recommended.
- Ties: when multiple markers share the exact same earliest timestamp in a stripe and/or ring, each of them qualifies for that claim.
- band_type values are normalized internally so that colors, shapes, shading, and filters work consistently.

---

## Skipped columns and rows

- Unknown columns (anything besides lat/lon/label/band_type/date/comment with their synonyms) are ignored.
- Skipped columns are reported in the “Skipped …” status line after loading a CSV.
- Rows with invalid or out‑of‑range lat/lon are skipped and reported with their row numbers.

---

## Filters and counters

- The Ring/Stripe/Both/None chips filter markers and shading.
- Each chip shows a live counter of the number of combined markers of that type (after Set combining and band_type resolution).
- If you uncheck all chips, a small warning reminds you that at least one must be selected.

---

## Settings

Open the gear in the top‑right corner.

1) Colors
- Choose colors for Stripe, Ring, and Both.
- “Restore Defaults” resets the palette.
- Choices are saved in localStorage.

2) Shapes
- Choose a default marker symbol and size for each band_type: Stripe, Ring, Both, None.
- Supported symbols: circle, triangle, diamond, square, star (5‑point), star (6‑point), and pin.
- Size range: 12–48 px.  
- “Restore Defaults” resets shapes and sizes to the built‑in values.
- Choices are saved in localStorage and applied immediately to all markers.

Notes about shapes
- All shapes are centered on the marker (LatLng). The “pin” is drawn as a centered icon to keep leader lines consistent.

---

## Shading logic

- The world is divided into 10° latitude rings (−90..+90) and 10° longitude stripes (−180..+180).
- A band is shaded if you have at least one combined marker that “claims” it:
  - ring or both contributes to the ring (latitude) band.
  - stripe or both contributes to the stripe (longitude) band.
- Shading colors match your configured band colors.

---

## Labels and curved leader lines

- Non‑overlapping label placement chooses a nearby free spot on the screen for each visible marker.
- A curved leader line connects the label to the exact center of the marker.
- Several curve candidates are tested to avoid intersecting nearby markers; the minimal‑intersection curve is chosen.
- Lines are drawn in a stable, map‑sized SVG overlay so they remain consistent while panning/zooming and in screenshots.

---

## Save As

CSV export
- Exports one row per combined marker (after Set merging and band_type resolution).
- Columns: lat, lon, label, band_type, lat_bin, lon_bin.

Picture export
- Exports the current view as PNG, JPEG, or WEBP.
- A statistics badge (Rings/Stripes visited and percentages) is placed near the left edge of stripe 2 to avoid ring labels.
- The app waits for tiles to finish loading and a couple of frames to settle so the image is crisp and aligned.

---

## Context menu and editing

- Right‑click the map to add a marker at the clicked location.
- Right‑click a marker to edit it.
- After edits, counts, shading, and the normalized CSV are rebuilt automatically.

---

## Troubleshooting

- Counters show 0
  - Verify your CSV has lat, lon, and label columns.
  - Ensure band_type can be resolved: if all band_type fields are blank and no dates parse, the result is “None”.
  - Try a hard refresh (Shift+Reload) to clear cached scripts.

- Shapes dialog didn’t appear
  - Ensure you clicked gear → Settings → Shapes (it opens a modal).
  - If you are running from local files, make sure both style.css and the shapes styles (styles.css) are loaded.

- Picture export looks misaligned or incomplete
  - Wait a second after moving the map and try again; the app waits for tiles, but slow networks can need an extra attempt.
  - If tiles are blocked by CORS on your network, PNG/JPEG usually still work after retrying.

---

## Change log (recent)

- Set combining: rows with identical GPS (normalized lon) and label are merged.
- CSV tolerance: lon normalized into −180..180; lat/lon rounded to 6 decimals for grouping.
- Unknown columns: skipped and reported; recognized columns are lat/lon/label/band_type/date/comment (with synonyms).
- band_type inference (global): when a Set has no explicit band_type:
  - No valid date → None.
  - Earliest date in both its stripe and its ring → Both.
  - Else earliest in its stripe → Stripe.
  - Else earliest in its ring → Ring.
  - Else → None.
- Counters: live Ring/Stripe/Both/None counts reflect combined markers after resolution; updates after load/edit.
- Shapes settings: per‑type symbol and size (circle, triangle, diamond, square, star, 6‑point star, pin); persisted; applied live.
- Leader lines: anchored at the true marker center; curves chosen to reduce intersections; stable during pan/zoom and in screenshots.
- Screenshot export: waits for tiles/frames; adds stats badge; colors match current Settings.

---

## License and attribution

- Map tiles: © OpenStreetMap contributors.
- App: © Sagy Pundak Mintz & Ron Paz. All Rights Reserved.