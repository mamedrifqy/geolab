// ============================================================
// Mangrove Shoreline Change Detection
// Google Earth Engine Script
// Author: Mamed Rifqy
// Description: Detects annual shoreline change in mangrove
//              rehabilitation areas using Landsat imagery.
// ============================================================

// ── SECTION: Study Area ──────────────────────────────────────

// Load the study area polygon from an uploaded asset
var studyArea = ee.FeatureCollection('users/mamedrifqy/PRM_RIAU_2026');

// Buffer each polygon by 1000 metres to capture surrounding water/land
var buffered = studyArea.map(function(feature) {
  return feature.buffer(1000);
});

// Centre the map on the study area
Map.centerObject(studyArea, 10);
Map.addLayer(studyArea, {color: '2d5a3d'}, 'Study Area');

// ── SECTION: Image Collection ────────────────────────────────

// Define the year range for shoreline change analysis
var startYear = 2017;
var endYear   = 2025;

// Helper: get a cloud-masked Landsat 8 median composite for one year
function getAnnualComposite(year) {
  var start = ee.Date.fromYMD(year, 1, 1);
  var end   = ee.Date.fromYMD(year, 12, 31);

  return ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
    .filterBounds(studyArea)
    .filterDate(start, end)
    .filter(ee.Filter.lt('CLOUD_COVER', 20))
    .map(function(img) {
      // Apply scaling factors required by Collection 2
      var optical = img.select('SR_B.').multiply(0.0000275).add(-0.2);
      var thermal = img.select('ST_B.*').multiply(0.00341802).add(149.0);
      return img.addBands(optical, null, true)
                .addBands(thermal, null, true);
    })
    .median()
    .clip(buffered);
}

// ── SECTION: NDVI & Water Masking ────────────────────────────

// Compute NDVI to separate vegetation from water/bare soil
function addNDVI(image) {
  var ndvi = image.normalizedDifference(['SR_B5', 'SR_B4'])
                  .rename('NDVI');
  return image.addBands(ndvi);
}

// Water mask: pixels where NDWI > 0 are classified as water
function waterMask(image) {
  var ndwi = image.normalizedDifference(['SR_B3', 'SR_B5']);
  return ndwi.gt(0).rename('water');
}

// ── SECTION: Shoreline Extraction ────────────────────────────

// Extract the shoreline as the boundary between water and land
function extractShoreline(year) {
  var composite = getAnnualComposite(year);
  var water     = waterMask(composite);

  // Detect edges of the water mask — these are the shorelines
  var shoreline = water.focal_max(1).neq(water.focal_min(1))
                       .selfMask()
                       .rename('shoreline');

  return shoreline.set('year', year);
}

// Build a list of annual shoreline images
var years = ee.List.sequence(startYear, endYear);
var shorelines = ee.ImageCollection(
  years.map(function(y) { return extractShoreline(y); })
);

print('Shoreline collection:', shorelines);

// ── SECTION: Visualisation ───────────────────────────────────

// Display the first and last year shorelines to compare visually
var first = extractShoreline(startYear);
var last  = extractShoreline(endYear);

Map.addLayer(first, {palette: ['3b82f6']}, 'Shoreline ' + startYear);
Map.addLayer(last,  {palette: ['ef4444']}, 'Shoreline ' + endYear);

// ── SECTION: Export ──────────────────────────────────────────

// Export the final year shoreline to Google Drive as a GeoTIFF
Export.image.toDrive({
  image:       last,
  description: 'shoreline_' + endYear,
  folder:      'GEE_Exports',
  region:      studyArea.geometry().bounds(),
  scale:       30,
  crs:         'EPSG:4326',
  maxPixels:   1e13
});

print('Export task created. Check the Tasks panel to run it.');
