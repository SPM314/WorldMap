# WorldMap - Rings & Stripes

Interactive world map visualization for CSV data with latitude/longitude coordinates, showing points colored by band types (ring, stripe, both, none) with automatic shading of 10° grid bands.

## Features

- **CSV Upload**: Load data with latitude, longitude, label, and band type columns
- **Example Dataset**: Click "Example" to instantly load the World Wonders dataset
- **Drag & Drop**: Drop CSV files directly onto the map area
- **Smart Labels**: Non-overlapping label placement with yellow leader lines when needed
- **Band Filtering**: Show/hide different band types with live counts
- **Shaded Statistics**: View completion progress for rings (18 total) and stripes (36 total)
- **Data Export**: Download normalized CSV with band bins

## Usage

1. **Upload Data**: Use "Choose CSV" button or drag a CSV file onto the map
2. **Try Example**: Click "Example" to load World Wonders dataset
3. **View Results**: Points are colored by band type, labels auto-arranged to avoid overlap
4. **Filter Data**: Use checkboxes to show/hide band types (counts shown in labels)
5. **See Progress**: Check shaded stats to see ring/stripe completion percentages
6. **Export Data**: Download normalized CSV with processed band information

## CSV Format

Required columns (case-insensitive):
- `lat` or `latitude`: Latitude (-90 to 90)
- `lon`, `lng`, or `longitude`: Longitude (-180 to 180)  
- `label` or `name`: Display name for the point
- `band_type`, `band`, `type`: Band type (ring, stripe, both, none)

Band types accept abbreviations and are case-insensitive (e.g., 'r', 'Ring', 'STRIPE' all work).

## Band Types

- **Ring** (blue): Shades 10° latitude bands
- **Stripe** (orange): Shades 10° longitude bands  
- **Both** (purple): Shades both latitude and longitude bands
- **None** (gray): No shading applied
