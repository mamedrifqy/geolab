// ============================================================
//  KUALA SELAT INUNDATION & COCONUT SUITABILITY ANALYSIS
//  Combines: Double-Bounce SAR | Backscatter+DEM Depth |
//            Bi-temporal Flood | S2 Spectral Indices
//  Author  : Muhammad Rifqy
//  Updated : 2026
// ============================================================

// ── 0. AREA OF INTEREST ─────────────────────────────────────

// Peatland boundary (must be defined as an imported asset)
// var peatlands = ... (your imported asset)
// Fallback: use roi if peatlands is not defined
var aoi = (typeof peatlands !== 'undefined') ? peatlands : roi;

Map.centerObject(aoi, 11);

// ── 1. FABDEM (Bare-Earth DEM — removes canopy & buildings) ─
var fabdem = ee.ImageCollection("projects/sat-io/open-datasets/FABDEM")
    .filterBounds(aoi)
    .mosaic()
    .clip(aoi);

// ── 2. SENTINEL-2 (Cloud-masked, SR Harmonized) ─────────────
var s2_mask = function (image) {
    var scl = image.select('SCL');
    var mask = scl.eq(3).or(scl.gte(7).and(scl.lte(10))).eq(0);
    return image.select(['B.*']).divide(10000).updateMask(mask);
};

var sentinel2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(aoi)
    .filterDate('2024-01-01', '2024-06-30')   // ← safe lag-free window
    .map(s2_mask)
    .median()
    .clip(aoi);

var Blue = sentinel2.select('B2');
var Green = sentinel2.select('B3');
var Red = sentinel2.select('B4');
var NIR = sentinel2.select('B8');
var SWIR1 = sentinel2.select('B11');
var SWIR2 = sentinel2.select('B12');

// ── 3. SENTINEL-1 SAR COLLECTIONS ───────────────────────────
//  Baseline : 2024 dry season (well within GEE archive)
//  Inundated: 2024 wet season (avoids processing lag)
var s1_base = ee.ImageCollection('COPERNICUS/S1_GRD')
    .filterBounds(aoi)
    .filterDate('2024-01-01', '2024-06-30')
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
    .filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'))
    .select(['VV', 'VH']);

var s1_flood = ee.ImageCollection('COPERNICUS/S1_GRD')
    .filterBounds(aoi)
    .filterDate('2024-10-01', '2025-01-31')
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
    .filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'))
    .select(['VV', 'VH']);

// Guard: print collection sizes before computing
print('S1 Baseline count:', s1_base.size());
print('S1 Flood count:', s1_flood.size());
print('S2 image count:',
    ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(aoi).filterDate('2024-01-01', '2024-06-30').size());

// Safe median composites (fallback constant if empty)
var makeMedian = function (col, bands) {
    return ee.Image(ee.Algorithms.If(
        col.size().eq(0),
        ee.Image.constant(ee.List.repeat(0, bands.length)).rename(bands),
        col.median().clip(aoi)
    ));
};

var baseline = makeMedian(s1_base, ['VV', 'VH']);
var inundated = makeMedian(s1_flood, ['VV', 'VH']);

// ── 4. SPECKLE FILTERING ─────────────────────────────────────
//  focal_median (50 m radius) → better edge preservation than focal_mean
var SMOOTH_M = 50;
var base_f = baseline.focal_median(SMOOTH_M, 'circle', 'meters');
var flood_f = inundated.focal_median(SMOOTH_M, 'circle', 'meters');

var VV_base = base_f.select('VV');
var VH_base = base_f.select('VH');
var VV_flood = flood_f.select('VV');
var VH_flood = flood_f.select('VH');

// ── 5. SPECTRAL INDICES (S2) ─────────────────────────────────

// NDWI — water detection
var NDWI = Green.subtract(NIR).divide(Green.add(NIR)).rename('NDWI');

// EVI — vegetation vigour
var EVI = NIR.subtract(Red)
    .divide(NIR.add(Red.multiply(6)).subtract(Blue.multiply(7.5)).add(1))
    .multiply(2.5).rename('EVI');

// MVI — mangrove vegetation index
var MVI = NIR.subtract(Green).divide(SWIR1.subtract(Green)).rename('MVI');
var MVIqy = Green.subtract(SWIR2).divide(SWIR1.subtract(Green)).rename('MVIqy');

// Yield models (PPIU Riau calibration)
var Y = EVI.multiply(0.7592).subtract(0.1016).rename('Y_Linear');
var Ypol = EVI.pow(2).multiply(-0.055)
    .add(EVI.multiply(0.8729))
    .subtract(0.0498).rename('Y_Polynomial');

// ── 6. SAR-DERIVED INDICES ───────────────────────────────────

// RVI — Radar Vegetation Index (2024 flood period)
var VV_lin = ee.Image(10).pow(VV_flood.divide(10));
var VH_lin = ee.Image(10).pow(VH_flood.divide(10));
var RVI = VH_lin.multiply(4).divide(VV_lin.add(VH_lin)).rename('RVI');

// Bi-temporal delta (flood event signal)
var delta_VV = VV_flood.subtract(VV_base).rename('Delta_VV');
var delta_VH = VH_flood.subtract(VH_base).rename('Delta_VH');

// ── 7. INUNDATION MASKS ──────────────────────────────────────

// A) S2 water mask (NDWI > 0)
var s2_water = NDWI.gt(0).rename('S2_Water');

// B) S1 open-water mask — specular reflection (low backscatter)
//    Used for open/bare water surfaces
var s1_open_water = VV_flood.lt(-16)
    .and(VH_flood.lt(-23))
    .rename('S1_Open_Water');

//    Water under canopy increases backscatter vs baseline
//    Threshold: +3 dB increase AND brighter than -15 dB
var double_bounce = delta_VH.gt(3)
    .and(VH_flood.gt(-15))
    .rename('S1_Double_Bounce');

// D) Combined inundation (open water OR double-bounce OR S2)
var inundation_mask = s1_open_water
    .or(double_bounce)
    .or(s2_water)
    .rename('Inundation_Combined');

// E) Bi-temporal flood mask — NEW events vs 2024 baseline
var flood_mask = delta_VV.lt(-2).rename('Flood_BiTemporal');

// F) Stress zone — near-water but not yet inundated
var stress_raw = NDWI.gt(-0.1).and(NDWI.lte(0));
var stress_clean = stress_raw
    .and(inundation_mask.not())
    .and(flood_mask.not())
    .rename('Stress_Zone');

// ── 8. INUNDATION DEPTH (Topographic Intersection) ──────────
//  Applicable for open-water zones (not canopy-covered pixels)
var open_flood_mask = s1_open_water.or(s2_water);

// Extract elevation at flood boundary edges
var edge = open_flood_mask.focal_max(1).subtract(open_flood_mask);
var edgeElev = fabdem.updateMask(edge);

var waterLevelDict = edgeElev.reduceRegion({
    reducer: ee.Reducer.median(),
    geometry: aoi,
    scale: 30,
    maxPixels: 1e9
});

// Safe extraction with 0 m fallback
var wlRaw = waterLevelDict.values().get(0);
var waterLevel = ee.Number(ee.Algorithms.If(
    ee.Algorithms.IsEqual(wlRaw, null), 0, wlRaw
));

// Depth only where open water is detected
var inundation_depth = ee.Image(waterLevel)
    .subtract(fabdem)
    .updateMask(open_flood_mask)
    .max(ee.Image(0))          // clip negative values (DEM noise)
    .rename('Inundation_Depth_m');

print('Estimated Water Surface Elevation (m):', waterLevel);

// ── 9. MANGROVE SUITABILITY MAP ──────────────────────────────
// Ecological logic:
//   Mangroves NEED periodic tidal inundation but DIE if permanently submerged.
//   Double-bounce = active flooded-forest signal = ONLY reliable mangrove indicator.
//   Open water WITHOUT double-bounce = backlogged/stagnant = mangroves absent (field-validated).
//   Depth > 1.5m = permanent submergence = lethal zone.

// Depth thresholds (metres)
var DEPTH_OPTIMAL_MAX = 1.5;  // above this = permanent submergence → unsuitable
var DEPTH_OPTIMAL_MIN = 0.2;  // below this = rarely flooded → marginal

// Boolean depth helpers
var permanently_submerged = inundation_depth.gte(DEPTH_OPTIMAL_MAX)
    .rename('Permanent_Submergence');

var optimal_depth = inundation_depth.gte(DEPTH_OPTIMAL_MIN)
    .and(inundation_depth.lt(DEPTH_OPTIMAL_MAX))
    .rename('Optimal_Depth');

// Backlogged tidal water: open water present but NO living tree structure (double-bounce absent)
// Field-validated: mangroves are dead/absent in these zones in Kuala Selat
var backlogged_water = s1_open_water
    .or(s2_water)
    .and(double_bounce.not())
    .rename('Backlogged_Water');

// Class 5 — Optimal: double-bounce confirmed + depth in healthy tidal range
var class5_optimal = double_bounce
    .and(optimal_depth)
    .and(permanently_submerged.not())
    .rename('Class5_Optimal');

// Class 4 — Suitable: double-bounce present but depth outside optimal range
// Living mangrove confirmed by SAR but slightly stressed by depth
var class4_suitable = double_bounce
    .and(class5_optimal.not())
    .and(permanently_submerged.not())
    .rename('Class4_Suitable');

// Class 3 — Marginal: moisture stress zone, no inundation or tree signal
// Landward fringe — possible propagule establishment but not ideal
var class3_marginal = stress_clean
    .and(double_bounce.not())
    .and(backlogged_water.not())
    .rename('Class3_Marginal');

// Class 2 — Backlogged / Dead Zone: open water but no double-bounce
// Field observation confirmed: chronic standing water, mangroves absent
var class2_backlogged = backlogged_water
    .and(permanently_submerged.not())
    .rename('Class2_Backlogged');

// Class 1 — Permanently Submerged: depth ≥ 1.5m, subtidal zone
var class1_submerged = permanently_submerged
    .rename('Class1_Submerged');

// Build suitability (class 1 always overrides everything else)
var mangrove_suitability = ee.Image(0)
    .where(class3_marginal.eq(1), ee.Image(3))
    .where(class4_suitable.eq(1), ee.Image(4))
    .where(class5_optimal.eq(1), ee.Image(5))
    .where(class2_backlogged.eq(1), ee.Image(2))
    .where(class1_submerged.eq(1), ee.Image(1))
    .clip(aoi)
    .rename('Mangrove_Suitability');

// ── 10. VISUALIZATION ────────────────────────────────────────
var ms_vis = { min: 0, max: 0.25 };
Map.addLayer(sentinel2.select(['B4', 'B3', 'B2']), ms_vis, 'S2 True Color');
Map.addLayer(sentinel2.select(['B8', 'B4', 'B3']), ms_vis, 'S2 False Color (NIR)');

Map.addLayer(VV_flood, { min: -25, max: 0 }, 'S1 VV Flood Period');
Map.addLayer(VV_base, { min: -25, max: 0 }, 'S1 VV Baseline');
Map.addLayer(delta_VV, {
    min: -10, max: 5,
    palette: ['FF0000', 'white', '0000FF']
}, 'Delta VV (Flood−Base)');
Map.addLayer(RVI, {
    min: 0, max: 1,
    palette: ['blue', 'white', 'green']
}, 'S1 RVI');

Map.addLayer(NDWI, {
    min: -1, max: 1,
    palette: ['brown', 'white', 'blue']
}, 'S2 NDWI');
Map.addLayer(EVI, {
    min: 0, max: 0.5,
    palette: ['000000', 'a50026', 'd73027', 'f46d43', 'fdae61',
        'fee08b', 'ffffbf', 'd9ef8b', 'a6d96a', '66bd63', '1a9850', '006837']
}, 'S2 EVI');
Map.addLayer(MVI, {
    min: -1, max: 1,
    palette: ['000000', 'a50026', 'd73027', 'f46d43', 'fdae61',
        'fee08b', 'ffffbf', 'd9ef8b', 'a6d96a', '66bd63', '1a9850', '006837']
}, 'S2 MVI');
Map.addLayer(Ypol, {
    min: 0, max: 0.5,
    palette: ['000000', 'a50026', 'd73027', 'f46d43', 'fdae61',
        'fee08b', 'ffffbf', 'd9ef8b', 'a6d96a', '66bd63', '1a9850', '006837']
}, 'S2 Yield (Polynomial)');

// Inundation diagnostic layers
Map.addLayer(s1_open_water.selfMask(), { palette: ['00BFFF'] }, 'Open Water (S1 Specular)');
Map.addLayer(double_bounce.selfMask(), { palette: ['FF00FF'] }, '🌴 Flooded Mangrove (Double-Bounce)');
Map.addLayer(s2_water.selfMask(), { palette: ['0000FF'] }, 'Water (S2 NDWI)');
Map.addLayer(inundation_mask.selfMask(), { palette: ['1a237e'] }, 'Inundation Combined (S1+S2)');
Map.addLayer(flood_mask.selfMask(), { palette: ['FF6F00'] }, 'Flood — New Events (Bi-temporal)');
Map.addLayer(stress_clean.selfMask(), { palette: ['FFD600'] }, '⚠ Stress Zone');
Map.addLayer(backlogged_water.selfMask(), { palette: ['8B0000'] }, '🚫 Backlogged Tidal Water');
Map.addLayer(permanently_submerged.selfMask(), { palette: ['000000'] }, '☠ Permanently Submerged (>1.5m)');

// Depth layer
Map.addLayer(inundation_depth, {
    min: 0, max: 3,
    palette: ['eff3ff', '6baed6', '2171b5', '084594']
}, 'Inundation Depth (m)');

// Individual suitability class layers
Map.addLayer(class5_optimal.selfMask(), { palette: ['006400'] }, '🌿 Class 5 — Optimal Tidal Habitat');
Map.addLayer(class4_suitable.selfMask(), { palette: ['90EE90'] }, '✅ Class 4 — Suitable (Double-Bounce)');
Map.addLayer(class3_marginal.selfMask(), { palette: ['FFFF00'] }, '⚠ Class 3 — Marginal Fringe');
Map.addLayer(class2_backlogged.selfMask(), { palette: ['8B0000'] }, '🚫 Class 2 — Backlogged Dead Zone');
Map.addLayer(class1_submerged.selfMask(), { palette: ['000080'] }, '☠ Class 1 — Permanently Submerged');

// Final suitability map
Map.addLayer(mangrove_suitability, {
    min: 1, max: 5,
    palette: [
        '000080',  // 1 = Permanently submerged (deep navy)
        '8B0000',  // 2 = Backlogged / dead zone (dark red)
        'FFFF00',  // 3 = Marginal fringe (yellow)
        '90EE90',  // 4 = Suitable double-bounce (light green)
        '006400'   // 5 = Optimal tidal habitat (dark green)
    ]
}, '🌿 Mangrove Suitability Map');

// PRM 2026 overlay
if (typeof prm26 !== 'undefined') {
    Map.addLayer(
        ee.FeatureCollection(prm26).style({ color: 'FF0000', fillColor: '00000000', width: 3 }),
        {}, 'PRM 2026'
    );
}

// ── 11. AREA STATISTICS ───────────────────────────────────────
var px = ee.Image.pixelArea();
var calcArea = function (mask, name) {
    var result = mask.multiply(px).reduceRegion({
        reducer: ee.Reducer.sum(), geometry: aoi, scale: 10, maxPixels: 1e13
    });
    return ee.Number(result.get(name)).divide(10000);
};

print('─── Mangrove Suitability Area Summary (ha) ───');
print('🌿 Class 5 — Optimal Tidal Habitat (ha):', calcArea(class5_optimal, 'Class5_Optimal'));
print('✅ Class 4 — Suitable Double-Bounce (ha):', calcArea(class4_suitable, 'Class4_Suitable'));
print('⚠ Class 3 — Marginal Landward Fringe (ha):', calcArea(class3_marginal, 'Class3_Marginal'));
print('🚫 Class 2 — Backlogged / Dead Zone (ha):', calcArea(class2_backlogged, 'Class2_Backlogged'));
print('☠ Class 1 — Permanently Submerged (ha):', calcArea(class1_submerged, 'Class1_Submerged'));

// ── 12. EXPORTS ───────────────────────────────────────────────
// Cast all bands to Float32 for compatibility before stacking

var export_stack = ee.Image.cat([
    mangrove_suitability.float(),   // Band 1: Mangrove_Suitability (1-5 class)
    inundation_depth.float(),       // Band 2: Inundation_Depth_m
    inundation_mask.float(),        // Band 3: Inundation_Combined (0/1)
    double_bounce.float(),          // Band 4: S1_Double_Bounce (0/1)
    backlogged_water.float(),       // Band 5: Backlogged_Water (0/1)
    permanently_submerged.float(),  // Band 6: Permanent_Submergence (0/1)
    flood_mask.float(),             // Band 7: Flood_BiTemporal (0/1)
    stress_clean.float(),           // Band 8: Stress_Zone (0/1)
    delta_VV.float(),               // Band 9: Delta_VV (dB)
    RVI.float(),                    // Band 10: RVI (0-1)
    EVI.float(),                    // Band 11: EVI
    MVI.float(),                    // Band 12: MVI
    Ypol.float(),                   // Band 13: Y_Polynomial
    class5_optimal.float(),         // Band 14: Class5_Optimal (0/1)
    class4_suitable.float(),        // Band 15: Class4_Suitable (0/1)
    class3_marginal.float(),        // Band 16: Class3_Marginal (0/1)
    class2_backlogged.float(),      // Band 17: Class2_Backlogged (0/1)
    class1_submerged.float()        // Band 18: Class1_Submerged (0/1)
]).clip(aoi);

print('Export stack bands:', export_stack.bandNames());

Export.image.toDrive({
    image: export_stack,
    description: 'KualaSelat_Mangrove_Analysis_Full',
    folder: 'GEE_KualaSelat',
    region: aoi,
    scale: 10,
    maxPixels: 1e13,
    crs: 'EPSG:4326',
    fileFormat: 'GeoTIFF'
});

Export.image.toDrive({
    image: inundation_depth,
    description: 'inundationdepth',
    folder: 'GEE_KualaSelat',
    region: aoi,
    scale: 10,
    maxPixels: 1e13,
    crs: 'EPSG:4326',
    fileFormat: 'GeoTIFF'
});

Export.image.toDrive({
    image: inundation_depth,
    description: 'inundationdepth',
    folder: 'GEE_KualaSelat',
    region: aoi,
    scale: 10,
    maxPixels: 1e13,
    crs: 'EPSG:4326',
    fileFormat: 'GeoTIFF'
});