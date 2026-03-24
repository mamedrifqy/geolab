/**
 * ============================================================
// ── Carbon Emission Estimation from Mangrove Forests ────────────────────────────────────────
 *  Description : Estimates above-ground carbon stock and CO₂ emissions
 *                from mangrove rehabilitation areas using Sentinel-2
 *                spectral indices and a regional biomass allometric model
 *                (PPIU Riau calibration).  The script produces per-pixel
 *                carbon stock maps, summary statistics per class, and
 *                exports all results to Google Drive.
 *
 *  Author      : GeoLab — Muhammad Rifqy
 *  Date        : 2026-03-24
 *
 *  Inputs (define as Assets in the GEE Code Editor before running):
 *    • peatlands  — ee.FeatureCollection  — Peatland boundary polygon
 *    • concession — ee.FeatureCollection  — Concession boundary (excluded zone)
 *    • prm        — ee.FeatureCollection  — Indicative rehabilitation polygon
 *
 *  Outputs (written to Google Drive folder "GEE_Emission"):
 *    • Carbon_Stock_Mg_ha    — Raster: above-ground carbon (Mg C ha⁻¹)
 *    • CO2_Emission_Mg_ha    — Raster: CO₂-equivalent emission potential
 *    • Emission_Summary.csv  — Table:  area & total carbon per cover class
 * ============================================================
 */

// ── SECTION: Visualization Parameters ────────────────────────────────────────

// A shared diverging palette (black → red → yellow → green) used for all
// continuous index layers.  Defining it once keeps the code DRY.
var SPECTRAL_PALETTE = [
  '000000', 'a50026', 'd73027', 'f46d43', 'fdae61', 'fee08b',
  'ffffbf', 'd9ef8b', 'a6d96a', '66bd63', '1a9850', '006837'
];

// Visualization parameter objects — passed directly to Map.addLayer()
var VIS_TRUE_COLOR  = { bands: ['B4', 'B3', 'B2'], min: 0, max: 0.25 };
var VIS_FALSE_COLOR = { bands: ['B8', 'B4', 'B3'], min: 0, max: 0.25 };
var VIS_EVI         = { min: 0.00, max: 0.60, palette: SPECTRAL_PALETTE };
var VIS_CARBON      = { min: 0,    max: 200,  palette: SPECTRAL_PALETTE };
var VIS_CO2         = { min: 0,    max: 700,  palette: SPECTRAL_PALETTE };

// ── SECTION: Cloud Masking Function ──────────────────────────────────────────

/**
 * Masks clouds and cloud shadows in a Sentinel-2 Surface Reflectance image,
 * then scales raw digital numbers to physical reflectance (0–1).
 *
 * GEE concept — .map():
 *   Applying a function over every image in a collection is done with .map().
 *   The function receives a single ee.Image and must return a single ee.Image.
 *
 * How the mask works:
 *   Sentinel-2 Level-2A products include a Scene Classification Layer (SCL).
 *   Specific SCL values indicate clouds and shadows:
 *     3  = Cloud shadow
 *     7  = Unclassified (often thin cloud)
 *     8  = Medium probability cloud
 *     9  = High probability cloud
 *    10  = Thin cirrus
 *   We build a binary mask that is 0 (masked) wherever ANY of those classes
 *   appear and 1 (valid) everywhere else.
 *
 * @param  {ee.Image} image  A single Sentinel-2 SR Harmonized image.
 * @return {ee.Image}        Cloud-free, reflectance-scaled image (bands B2–B12).
 */
function maskS2Clouds(image) {
  var scl  = image.select('SCL');
  // Build the cloud/shadow mask: 0 = bad pixel, 1 = good pixel
  var mask = scl.eq(3).or(scl.gte(7).and(scl.lte(10))).eq(0);
  // Select all spectral bands (B2–B12), divide by 10 000 to get reflectance,
  // then apply the mask so cloudy pixels become transparent
  return image.select(['B.*']).divide(10000).updateMask(mask);
}

// ── SECTION: Image Collection & Compositing ───────────────────────────────────

// GEE concept — ImageCollection:
//   GEE stores satellite data as ImageCollections — a stack of images over
//   time and space.  We narrow that stack down using filter methods:
//     .filterBounds() — keep only images that overlap our study area
//     .filterDate()   — keep only images from a given date range
//   This avoids loading the entire global archive into memory.
//
// GEE concept — .median():
//   After cloud-masking, we collapse the remaining images into one composite
//   by taking the per-pixel median.  The median is preferred over the mean
//   because it is robust to outliers (residual thin clouds, shadows).
//   Each pixel in the composite is drawn from whichever image had the median
//   reflectance — not an average that blends real surface types.

var sentinel2_collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  // (1) Limit to images that spatially overlap the peatland boundary.
  //     Without this, GEE would scan the entire globe.
  .filterBounds(peatlands)
  // (2) Choose a cloud-light season in Riau Province (Jan–Jun 2025).
  //     Adjust this window if you see gaps in your study area.
  .filterDate('2025-01-01', '2025-06-30')
  // (3) Apply the cloud masking function to every image in the collection
  .map(maskS2Clouds)
  // (4) Reduce the filtered, masked collection to a single cloud-free image
  //     by taking the per-pixel median across all remaining images
  .median();

// Clip the composite to the peatland boundary so only the study area is shown.
// GEE concept — .clip():
//   Restricts a raster to a polygon geometry.  Pixels outside the polygon
//   become masked (transparent).  This is a purely cosmetic operation and
//   does not affect computations unless the raster is used in reduceRegion.
var peatland_composite = sentinel2_collection
  .clip(peatlands)
  // Remove pixels that fall inside the concession boundary (excluded zone).
  // .updateMask() sets pixels to transparent where the mask value equals 0.
  // ee.Image.constant(1).clip(concession).mask() creates a 1/0 raster that
  // is 1 inside the concession; .not() inverts it so concession pixels = 0.
  .updateMask(
    ee.Image.constant(1).clip(concession).mask().not()
  );

// ── SECTION: Band Selection ───────────────────────────────────────────────────

// Give the raw band codes human-readable names for the calculations below.
// These correspond to the Sentinel-2 MSI band definitions:
//   B2  = Blue  (490 nm)   | B3  = Green (560 nm) | B4  = Red (665 nm)
//   B8  = NIR   (842 nm)   | B8A = Narrow NIR (865 nm)
//   B11 = SWIR-1 (1610 nm) | B12 = SWIR-2 (2190 nm)
var blue  = peatland_composite.select('B2');
var green = peatland_composite.select('B3');
var red   = peatland_composite.select('B4');
var nir   = peatland_composite.select('B8');
var swir1 = peatland_composite.select('B11');
var swir2 = peatland_composite.select('B12');

// ── SECTION: Spectral Indices ─────────────────────────────────────────────────

// --- A. Enhanced Vegetation Index (EVI) ---
// EVI improves on NDVI by correcting for atmospheric disturbance and
// soil background effects, making it better suited for dense canopy areas
// such as mangrove forests.
//
// Formula: EVI = 2.5 × (NIR − RED) / (NIR + 6×RED − 7.5×BLUE + 1)
//
// GEE arithmetic note:
//   GEE does not support standard operators (+, -, *, /) directly on Images.
//   You must use the methods .add(), .subtract(), .multiply(), .divide().
//   All operations are applied per pixel across the entire raster.

var evi = nir.subtract(red)
  .divide(
    nir.add(red.multiply(6))
       .subtract(blue.multiply(7.5))
       .add(1)
  )
  .multiply(2.5)
  .rename('EVI');

// --- B. Mangrove Vegetation Index (MVI) ---
// MVI targets the unique spectral signature of mangrove canopy by combining
// NIR and green (chlorophyll) against SWIR-1 (liquid water in leaves).
// Higher MVI values correlate strongly with mangrove density.
//
// Formula: MVI = (NIR − GREEN) / (SWIR1 − GREEN)

var mvi = nir.subtract(green)
  .divide(swir1.subtract(green))
  .rename('MVI');

// --- C. Modified MVI (MVIqy) ---
// A variant that substitutes SWIR-2 for NIR in the numerator, improving
// separation between degraded and healthy mangrove stands.
//
// Formula: MVIqy = (GREEN − SWIR2) / (SWIR1 − GREEN)

var mvi_modified = green.subtract(swir2)
  .divide(swir1.subtract(green))
  .rename('MVIqy');

// ── SECTION: Biomass & Carbon Stock Estimation ───────────────────────────────

// The PPIU Riau regional calibration provides two models that convert EVI
// to above-ground dry biomass (Mg ha⁻¹):
//
//   Linear model     : Y      =  0.7592 × EVI − 0.1016
//   Polynomial model : Ypol   = −0.055 × EVI² + 0.8729 × EVI − 0.0498
//
// The polynomial model is preferred here because it captures the saturation
// effect observed in dense canopy — EVI plateaus at high biomass but the
// polynomial corrects for the non-linearity.

// --- Polynomial biomass model (Mg dry matter ha⁻¹) ---
// .pow(2) raises EVI to the power of 2 (squaring) on a per-pixel basis.
var biomass_Mg_ha = evi.pow(2).multiply(-0.055)   // quadratic term
  .add(evi.multiply(0.8729))                         // linear term
  .subtract(0.0498)                                  // intercept
  .max(0)          // clamp negative predictions to 0 (water / bare soil)
  .rename('Biomass_Mg_ha');

// --- Above-ground carbon stock (Mg C ha⁻¹) ---
// IPCC Tier 1 default: 47 % of dry biomass is carbon.
// This is the standard conversion fraction used in national GHG inventories.
var carbon_stock_Mg_ha = biomass_Mg_ha.multiply(0.47)
  .rename('Carbon_Stock_Mg_ha');

// --- CO₂-equivalent emission potential (Mg CO₂ ha⁻¹) ---
// If the forest is cleared, the stored carbon is oxidised to CO₂.
// The molecular weight ratio CO₂/C = 44/12 ≈ 3.667 converts carbon to CO₂.
var co2_emission_Mg_ha = carbon_stock_Mg_ha.multiply(3.667)
  .rename('CO2_Emission_Mg_ha');

// ── SECTION: Area Statistics ──────────────────────────────────────────────────

// GEE concept — reduceRegion():
//   Aggregates raster pixel values over a geometry using a reducer
//   (e.g., sum, mean, median).  The output is a Dictionary keyed by band name.
//   Always set maxPixels to a large value to avoid computation errors.
//   Use scale: 10 for Sentinel-2 (10 m native resolution).

// Total area of the study region (m²), converted to hectares (÷ 10 000)
var study_area_ha = peatlands.geometry()
  .area()                          // returns area in square metres
  .divide(10000);                  // convert to hectares

// ee.Image.pixelArea() returns the area of each pixel in m².
// Multiplying a mask by pixelArea() then summing gives the total area of
// pixels that equal 1 (i.e., pixels where the condition is true).
var pixel_area_m2 = ee.Image.pixelArea();

// Sum of total carbon stock (Mg C) across the entire study area
var total_carbon_sum = carbon_stock_Mg_ha
  .multiply(pixel_area_m2)        // convert per-hectare values to per-pixel
  .divide(10000)                   // pixel area is in m²; 1 ha = 10 000 m²
  .reduceRegion({
    reducer:   ee.Reducer.sum(),
    geometry:  peatlands.geometry(),
    scale:     10,
    maxPixels: 1e13
  })
  .get('Carbon_Stock_Mg_ha');

// Sum of total CO₂ emission potential (Mg CO₂) across the study area
var total_co2_sum = co2_emission_Mg_ha
  .multiply(pixel_area_m2)
  .divide(10000)
  .reduceRegion({
    reducer:   ee.Reducer.sum(),
    geometry:  peatlands.geometry(),
    scale:     10,
    maxPixels: 1e13
  })
  .get('CO2_Emission_Mg_ha');

// Print summary statistics to the GEE Console (top-right panel)
print('═══ Carbon & Emission Summary ═══');
print('Study Area (ha):',        study_area_ha);
print('Total Carbon Stock (Mg C):',   ee.Number(total_carbon_sum).round());
print('Total CO₂ Potential (Mg CO₂):', ee.Number(total_co2_sum).round());
print('─ EVI image structure:',   evi);
print('─ Biomass image structure:', biomass_Mg_ha);

// ── SECTION: Map Visualisation ────────────────────────────────────────────────

// GEE concept — Map.centerObject():
//   Pans and zooms the interactive map to fit the given geometry.
//   The second argument is the zoom level (1 = world, 22 = street-level).
Map.centerObject(peatlands, 10);

// Base imagery composites — set visible: false so the map loads quickly;
// the user can toggle them on in the Layers panel on the right
Map.addLayer(peatland_composite, VIS_TRUE_COLOR,  'S2 — True Colour',       false);
Map.addLayer(peatland_composite, VIS_FALSE_COLOR, 'S2 — False Colour (NIR)', false);

// Spectral indices
Map.addLayer(evi,          VIS_EVI, 'EVI (Enhanced Vegetation Index)');
Map.addLayer(mvi,          { min: -1, max: 2, palette: SPECTRAL_PALETTE }, 'MVI (Mangrove Vegetation Index)',  false);
Map.addLayer(mvi_modified, { min: -1, max: 2, palette: SPECTRAL_PALETTE }, 'MVIqy (Modified MVI)', false);

// Carbon and emission layers
Map.addLayer(biomass_Mg_ha,     VIS_CARBON, 'Biomass (Mg DM ha⁻¹)',        false);
Map.addLayer(carbon_stock_Mg_ha, VIS_CARBON, 'Carbon Stock (Mg C ha⁻¹)');
Map.addLayer(co2_emission_Mg_ha, VIS_CO2,   'CO₂ Emission Potential (Mg CO₂ ha⁻¹)');

// Study area overlay — transparent fill so the boundary is visible without
// obscuring the underlying layers
var styled_peatlands = peatlands.style({
  color:     'FFFFFF',   // white border
  fillColor: '00000000', // fully transparent fill
  width:     2
});
Map.addLayer(styled_peatlands, {}, 'Peatland Boundary');

// Indicative rehabilitation polygon
if (typeof prm !== 'undefined') {
  var styled_prm = prm.style({
    color:     'FF0000',   // red border
    fillColor: '00000000', // transparent fill
    width:     2
  });
  Map.addLayer(styled_prm, {}, 'PRM — Indicative Polygon');
}

// ── SECTION: Export to Google Drive ──────────────────────────────────────────

// GEE concept — Export.image.toDrive():
//   Queues an export task that runs in GEE's servers.
//   After running the script, open the Tasks panel (⏱ icon, top-right) and
//   click RUN next to each task.  The file will appear in your Google Drive
//   under the specified folder once complete.
//
//   Key parameters:
//     scale     — output pixel size in metres (10 m = Sentinel-2 native)
//     crs       — coordinate reference system (EPSG:4326 = WGS 84 geographic)
//     maxPixels — safety ceiling; raise this if the export fails for large areas

// Export 1: Carbon stock map
Export.image.toDrive({
  image:       carbon_stock_Mg_ha,
  description: 'Carbon_Stock_Mg_ha',
  folder:      'GEE_Emission',
  region:      peatlands.geometry(),
  scale:       10,
  crs:         'EPSG:4326',
  maxPixels:   1e13,
  fileFormat:  'GeoTIFF'
});

// Export 2: CO₂ emission potential map
Export.image.toDrive({
  image:       co2_emission_Mg_ha,
  description: 'CO2_Emission_Mg_ha',
  folder:      'GEE_Emission',
  region:      peatlands.geometry(),
  scale:       10,
  crs:         'EPSG:4326',
  maxPixels:   1e13,
  fileFormat:  'GeoTIFF'
});

// Export 3: Full multi-band analysis stack
// Stacking all outputs into one file allows post-processing in QGIS/R
// without managing multiple files.
var export_stack = ee.Image.cat([
  peatland_composite.select(['B4', 'B3', 'B2', 'B8', 'B11', 'B12']).float(), // Sentinel-2 bands
  evi.float(),                // EVI
  mvi.float(),                // MVI
  mvi_modified.float(),       // MVIqy
  biomass_Mg_ha.float(),      // Above-ground biomass
  carbon_stock_Mg_ha.float(), // Carbon stock
  co2_emission_Mg_ha.float()  // CO₂ emission potential
]);

Export.image.toDrive({
  image:       export_stack,
  description: 'Emission_Analysis_Full_Stack',
  folder:      'GEE_Emission',
  region:      peatlands.geometry(),
  scale:       10,
  crs:         'EPSG:4326',
  maxPixels:   1e13,
  fileFormat:  'GeoTIFF'
});

print('✅ Export tasks queued — open the Tasks panel to run them.');
