# WorldMap User Guide

## How to Use

1. Upload Your CSV File
   - Click the "Choose CSV" button and select your file, or drag and drop it anywhere on the map area.
   - Your CSV should contain latitude, longitude, label, and band type columns.
   - Leading whitespace in header names is ignored (e.g., "  label" is treated as "label").
   - Optional columns supported: `date` and `comment`.

2. Example Dataset
   - Click the "Example" button to instantly load the World Wonders dataset without selecting a file.

3. Viewing the Map
   - Points will be displayed by type (Ring, Stripe, Both, None) with color-coded shading.
   - Labels are automatically arranged to avoid overlap, with yellow lines connecting them to their points.
   - Click any marker to view all of its data (all CSV columns for that row, plus computed fields like lat_bin/lon_bin).

4. Filtering
   - Use the checkboxes to show/hide each band type. The number of points per band is shown next to each filter.

5. Shaded Info
   - To the left of the filters, you can see how many rings and stripes have been shaded, and the percentage completed for each (out of 18 for rings, 36 for stripes).

6. Download Normalized Data
   - Click the "Download" button to save a normalized version of your data. The export includes `date` and `comment` columns when available.

7. Getting Help
   - Click the "Help" button to view this guide in a modal dialog.
