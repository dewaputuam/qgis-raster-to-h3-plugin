# Raster to H3 Converter — QGIS Plugin

Convert raster data into **Uber H3 hexagonal grids** directly inside QGIS, with an optimized engine, real-time logging, and multi-resolution hierarchy aggregation.

![Version](https://img.shields.io/badge/version-1.3-blue)
![QGIS](https://img.shields.io/badge/QGIS-3.x-green)
![Python](https://img.shields.io/badge/Python-3.x-yellow)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## Features

### Core Conversion
- Convert any raster layer loaded in QGIS into H3 hexagonal polygons
- Select H3 resolution level (0–15) with a slider
- Choose output type: **Geometry** (full hexagon polygon) or **Centroid** (point)
- NoData pixels are automatically skipped — only valid data cells are processed
- Export output as **GeoJSON**, **CSV**, or directly to **PostgreSQL**

### Optimized Engine (v1.3)
- **5-stage chunked-vectorized pipeline** with per-stage timing in the log
- NumPy-based NoData pre-filtering before the H3 loop — significantly reduces computation on sparse rasters
- Vectorized CSV export using pandas (replaces slow row-by-row iteration)
- Progress feedback at every processing stage — no more "stuck at 100%" ambiguity

### Hierarchy Builder
- Aggregate child-level H3 hexagons up to any parent resolution
- Supported statistics: `mean`, `median`, `sum`, `min`, `max`, `std`, `count`, `skewness`
- Stores child H3 indices and values per parent for traceability
- Outputs result as GeoJSON with parent-level hexagons

### UI & Usability
- Built-in **Help Panel** with full H3 resolution reference table (level 0–15) including approximate cell area
- **Dynamic time estimation** — updates as you move the H3 level slider, based on valid pixel count
- Valid pixel count and NoData summary shown in metadata panel
- Auto-naming of output files based on input raster name and H3 level
- All activity logged to `~/h3_conversion.log`
- Automatic dependency installation via `pip` on first run

---

## H3 Resolution Reference

| Level | Avg Cell Area | Typical Use |
|-------|--------------|-------------|
| 0 | ~4,357,449 km² | Global/continental |
| 3 | ~12,393 km² | Country-level |
| 5 | ~252 km² | Regional |
| 7 | ~5.16 km² | City district |
| 8 | ~0.74 km² | Neighborhood ✓ |
| 9 | ~0.10 km² | Block level ✓ |
| 10 | ~0.015 km² | Building level ✓ |
| 11 | ~0.002 km² | Parcel level |
| 15 | ~0.0000009 km² | Ultra fine |

> Levels 8–10 are recommended for most geospatial analysis use cases.

---

## Installation

### Option 1 — Manual (copy to QGIS plugins folder)

**macOS:**
```bash
git clone https://github.com/dewaputuam/qgis-raster-to-h3-plugin.git
cp -r qgis-raster-to-h3-plugin ~/Library/Application\ Support/QGIS/QGIS3/profiles/default/python/plugins/raster_to_h3_plugin
```

**Windows:**
```
git clone https://github.com/dewaputuam/qgis-raster-to-h3-plugin.git
xcopy qgis-raster-to-h3-plugin %APPDATA%\QGIS\QGIS3\profiles\default\python\plugins\raster_to_h3_plugin /E /I
```

**Linux:**
```bash
git clone https://github.com/dewaputuam/qgis-raster-to-h3-plugin.git
cp -r qgis-raster-to-h3-plugin ~/.local/share/QGIS/QGIS3/profiles/default/python/plugins/raster_to_h3_plugin
```

### Option 2 — QGIS Plugin Manager
1. Open QGIS → **Plugins** → **Manage and Install Plugins**
2. Go to **Install from ZIP** tab
3. Download the ZIP from this repository and install

After installing, enable the plugin from the Plugins menu — it will appear in the toolbar.

---

## Dependencies

The plugin will attempt to auto-install missing dependencies on first run via `pip`. You can also install them manually:

```bash
pip install h3 geopandas rasterio shapely pyproj pandas requests scipy psycopg2
```

---

## Usage

### Basic Conversion
1. Load a raster layer into QGIS
2. Open the plugin from **Plugins → Raster to H3 Converter**
3. Select your raster layer and output folder
4. Set H3 resolution level using the slider (refer to the Help Panel on the right)
5. Choose output format: GeoJSON or CSV
6. Click **Convert** — the result will be added to QGIS canvas automatically

### PostgreSQL Export
1. Check **Export to PostgreSQL** in the dialog
2. Fill in host, port, database, user, password, and table name
3. The plugin uses upsert — safe to re-run without duplicating data

### Hierarchy Builder
1. After conversion, click **Open Hierarchy Builder**
2. Select the output GeoJSON as input
3. Choose target parent resolution and aggregation method
4. Run — the aggregated layer will be saved and added to canvas

---

## Changelog

### v1.3 (2025-02-12)
- Optimized chunked-vectorized engine with 5-stage pipeline and per-stage timing
- NoData-aware processing using NumPy pre-filtering
- PostgreSQL export with upsert support
- Help panel with full H3 resolution reference table (level 0–15)
- Dynamic time estimation based on valid pixel count and H3 level
- Progress feedback at every stage — no more ambiguous "stuck at 100%"
- Vectorized CSV export (replaced slow iterrows loop)
- Cleaned up duplicate imports and global variable risks

### v1.2
- Hierarchy builder for aggregating child H3 values to parent resolution
- Added statistical methods: mean, median, sum, min, max, std, count, skewness
- Child H3 index/value tracking per parent hexagon

### v1.0
- Initial release
- Real-time progress tracking and logging
- Toggle between geometry (polygon) and centroid output
- Auto-naming based on input raster and H3 level
- Automated pip-based dependency installation

---

## Credits

Developed by **Dewa Putu Adikarma Mandala**
AI-assisted by **ChatGPT (GPT-4o)** and **Claude (Anthropic)**

---

## License

MIT License — free to use, modify, and distribute with attribution.
