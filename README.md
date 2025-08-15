# WorldMap User Guide

## How to Use

1. Upload Your CSV File
   - Click the "Choose CSV" button and select your file, or drag and drop it anywhere on the map area.
   - Your CSV should contain latitude, longitude, label, and band type columns.
   - Leading whitespace in header names is ignored (e.g., "  label" is treated as "label").
   - Optional columns supported: `date` and `comment`.

2. Example Dataset
   - Click the "Example" button to instantly load the World Wonders dataset without selecting a file.
   - This loads [data/sample.csv](data/sample.csv) which contains 20 world landmarks with a mix of band types.

3. Viewing the Map
   - Points will be displayed by type (Ring, Stripe, Both, None) with color-coded shading.
   - Labels are automatically arranged to avoid overlap, with yellow lines connecting them to their points.
   - Click any marker to view all of its data (all CSV columns for that row, plus computed fields like lat_bin/lon_bin).

4. Filtering
   - Use the checkboxes to show/hide each band type. The number of points per band is shown next to each filter.

5. Stats Panel
   - View real-time statistics in the compact stats panel:
     - **Total markers**: Number of currently loaded and visible markers
     - **Type counts**: Ring-only (R), Stripe-only (S), Both (B), None (N) markers
     - **Ring stats**: Number of shaded 10° latitude bands and markers within them
     - **Stripe stats**: Number of shaded 10° longitude bands and markers within them
   - Stats update automatically when you load data, change filters, or modify shading.

6. Disable Clustering
   - Check "Disable clustering" to show all markers individually without clustering/spiderfying.
   - When disabled, overlapping markers will simply overlap; you can still click them to see popups.
   - When enabled (default), nearby markers are clustered and can be expanded by clicking.

7. Shaded Info
   - To the left of the filters, you can see how many rings and stripes have been shaded, and the percentage completed for each (out of 18 for rings, 36 for stripes).

8. Download Normalized Data
   - Click the "Download" button to save a normalized version of your data. The export includes `date` and `comment` columns when available.

9. Getting Help
   - Click the "Help" button to view this guide in a modal dialog.

## CSV Format

Your CSV file should have these columns (case-insensitive, leading whitespace ignored):

### Required Columns
- **lat** (or latitude): Latitude coordinate (-90 to 90)
- **lon** (or lng, long, longitude): Longitude coordinate (-180 to 180)
- **label** (or name, title): Display name for the marker
- **band_type** (or band, type, stripe, ring): One of:
  - `ring` or `r`: Creates latitude band shading
  - `stripe` or `s`: Creates longitude band shading  
  - `both` or `b` or `rs` or `sr`: Creates both latitude and longitude shading
  - `none` or `n`: No shading (default if column missing)

### Optional Columns
- **date**: Any date information (displayed in popup and included in exports)
- **comment** (or notes, note, description): Additional notes (displayed in popup and included in exports)

### Example CSV Structure
```csv
lat,lon,label,band_type,date,comment
40.7589,-73.9851,Statue of Liberty,ring,1886-10-28,Symbol of freedom
51.5014,-0.1419,Big Ben,stripe,1859-05-31,Famous clock tower
48.8584,2.2945,Eiffel Tower,both,1889-03-31,Iron lattice tower
25.1972,55.2744,Burj Khalifa,none,2010-01-04,Tallest building in the world
```

## Features

- **10° Grid System**: Displays latitude and longitude bands at 10-degree intervals
- **Color-coded Markers**: Blue (ring), Orange (stripe), Purple (both), Gray (none)
- **Smart Clustering**: Groups nearby markers with expandable clusters (can be disabled)
- **Band Shading**: Visual highlighting of 10° bands containing markers
- **Interactive Popups**: Click markers to see all data including computed 10° bin coordinates
- **Real-time Stats**: Live statistics panel showing counts and band information
- **Responsive Design**: Works on desktop and mobile devices
- **Accessibility**: Keyboard navigation and screen reader support
