/**
 * Sentinel-2 Image Processing & Spectral Indices Calculator
 * Description: Processes Sentinel-2 SR imagery, applies cloud masking, 
 * filters by geometry, and calculates EVI, MVI, and custom polynomial indices.
 * * Note: 'peatlands', 'concession', and 'prm' must be defined as FeatureCollections/Geometries 
 * in your Earth Engine Code Editor imports before running this script.
 */

// ==========================================
// 1. CONSTANTS & VISUALIZATION PARAMETERS
// ==========================================

// Shared color palette for all spectral indices
var INDEX_PALETTE = [
    '000000', 'a50026', 'd73027', 'f46d43', 'fdae61', 'fee08b',
    'ffffbf', 'd9ef8b', 'a6d96a', '66bd63', '1a9850', '006837'
];

// Visualization parameters
var VIS_MULTISPECTRAL = { min: 0, max: 0.25 };
var VIS_EVI = { min: 0.00, max: 0.50, palette: INDEX_PALETTE };
var VIS_MVI = { min: -1.00, max: 1.00, palette: INDEX_PALETTE };

// ==========================================
// 2. FUNCTIONS
// ==========================================

/**
 * Masks clouds and cloud shadows in Sentinel-2 Surface Reflectance (SR) images.
 * Also scales the pixel values to surface reflectance (0-1) by dividing by 10000.
 *
 * @param {ee.Image} image - The input Sentinel-2 image.
 * @return {ee.Image} The cloud-masked and scaled image.
 */
function maskS2Clouds(image) {
    var scl = image.select('SCL');
    // SCL 3 = Cloud shadows, 7 = Unclassified clouds, 8-10 = Cloud types
    var mask = scl.eq(3).or(scl.gte(7).and(scl.lte(10))).eq(0);
    return image.select(['B.*']).divide(10000).updateMask(mask);
}

// ==========================================
// 3. IMAGE COLLECTION FILTERING
// ==========================================

// Define, filter, and process the Sentinel-2 SR Harmonized collection
var s2Median = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterDate('2025-01-01', '2025-07-31')
    .map(maskS2Clouds)
    .median()
    // Clip Raster to peatlands (keep areas INSIDE peatlands)
    .clip(peatlands)
    // Inverse Clipping: Remove areas that overlap with the concession shapefile
    .updateMask(ee.Image.constant(1).clip(concession).mask().not());

// ==========================================
// 4. BAND DEFINITIONS & COMPOSITES
// ==========================================

// Select individual bands used for calculating spectral indices
var blue = s2Median.select('B2');
var green = s2Median.select('B3');
var red = s2Median.select('B4');
var nir = s2Median.select('B8');
var nnir = s2Median.select('B8A');
var swir1 = s2Median.select('B11');
var swir2 = s2Median.select('B12');

// Define specific Band Composites
var multispectral = s2Median.select(['B4', 'B3', 'B2', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B11', 'B12']);
var falseColor = s2Median.select(['B8', 'B4', 'B3']);
var trueColor = s2Median.select(['B4', 'B3', 'B2']);
var allBands = s2Median.select(['B2', 'B3', 'B4', 'B8', 'B8A', 'B11', 'B12']);

// ==========================================
// 5. SPECTRAL INDICES COMPUTATION
// ==========================================

// A. Enhanced Vegetation Index (EVI)
// Formula: 2.5 * (NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1)
var evi = nir.subtract(red)
    .divide(nir.add(red.multiply(6)).subtract(blue.multiply(7.5)).add(1))
    .multiply(2.5)
    .rename('EVI');

// B. Mangrove Vegetation Index (MVI)
// Formula: (NIR - GREEN) / (SWIR1 - GREEN)
var mvi = nir.subtract(green)
    .divide(swir1.subtract(green))
    .rename('MVI');

// C. Modified Mangrove Vegetation Index (MVIqy)
// Formula: (GREEN - SWIR2) / (SWIR1 - GREEN)
var mviQy = green.subtract(swir2)
    .divide(swir1.subtract(green))
    .rename('MVIqy');

// D. Custom PPIU Riau Algorithm - Linear (Y)
// Formula: Y = 0.7592 * EVI - 0.1016
var yLinear = evi.multiply(0.7592)
    .subtract(0.1016)
    .rename('Y');

// E. Custom PPIU Riau Algorithm - Polynomial (Ypol)
// Formula: Ypol = -0.055 * (EVI)^2 + 0.8729 * EVI - 0.0498
var yPol = evi.pow(2).multiply(-0.055)    // Quadratic term
    .add(evi.multiply(0.8729))              // Linear term
    .subtract(0.0498)                       // Constant term
    .rename('Ypol');

// ==========================================
// 6. MAP VISUALIZATION
// ==========================================

// Center Map on the Region of Interest
Map.centerObject(peatlands, 10);

// Add Image Composites to Map (set to 'false' to hide by default and save memory)
Map.addLayer(multispectral, VIS_MULTISPECTRAL, 'Sentinel 2 - Multispectral', false);
Map.addLayer(falseColor, VIS_MULTISPECTRAL, 'Sentinel 2 - False Color', false);
Map.addLayer(trueColor, VIS_MULTISPECTRAL, 'Sentinel 2 - True Color', false);
Map.addLayer(allBands, VIS_MULTISPECTRAL, 'Sentinel 2 - All Bands', false);

// Add Spectral Indices to Map
Map.addLayer(evi, VIS_EVI, 'Sentinel 2 - EVI');
Map.addLayer(mvi, VIS_MVI, 'Sentinel 2 - MVI', false);
Map.addLayer(mviQy, VIS_MVI, 'Sentinel 2 - MVIqy', false);
Map.addLayer(yLinear, VIS_EVI, 'Sentinel 2 - Y (Linear)', false);
Map.addLayer(yPol, VIS_EVI, 'Sentinel 2 - Ypol (Polynomial)');

// Display Indicative Polygon outline (transparent fill)
var styledPRM = prm.style({ fillColor: '00000000', color: 'FF0000', width: 2 });
Map.addLayer(styledPRM, {}, 'Polygon Indikatif');

// Print resulting polynomial data properties to the Console
print('Ypol Data Structure:', yPol);

// ==========================================
// 7. DATA EXPORTS
// ==========================================

// Export EVI Data to Google Drive
Export.image.toDrive({
    image: evi,
    description: 'EVI_Export',
    folder: 'GEE_Exports',
    region: peatlands,
    scale: 10,
    maxPixels: 1e13,
    crs: 'EPSG:4326'
});

// Export Ypol Data to Google Drive
Export.image.toDrive({
    image: yPol,
    description: 'Ypol_Export',
    folder: 'GEE_Exports',
    region: peatlands,
    scale: 10,
    maxPixels: 1e13,
    crs: 'EPSG:4326'
});