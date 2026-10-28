// ============================================================
// AUTOMATED TEST SUITE FOR UPGRADED SURVEILLANCE SYSTEM
// Verifies CentroidTracker, ZoneManager, AnomalyEngine,
// IncidentStore, AlertEngine, ModelEvaluator, ReportExporter.
// ============================================================

import { CentroidTracker, ZoneManager, HeatmapRenderer } from './src/modules/crowdTracker.js';
import { AnomalyEngine } from './src/modules/anomalyEngine.js';
import { IncidentStore } from './src/modules/incidentStore.js';
import { AlertEngine } from './src/modules/alertEngine.js';
import { ModelEvaluator } from './src/modules/modelEvaluator.js';
import { ReportExporter } from './src/modules/reportExporter.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('\n--- 1. Testing CentroidTracker ---');
const tracker = new CentroidTracker(5, 100);
// Frame 1: 2 persons detected
let tracked = tracker.update([
  { x: 100, y: 100, width: 50, height: 100 },
  { x: 300, y: 200, width: 40, height: 90 }
], 1000);
assert(tracked.length === 2, 'Tracks 2 persons initially');
assert(tracked[0].id === 1 && tracked[1].id === 2, 'Assigns sequential IDs #1 and #2');

// Frame 2: Person 1 moves slightly to x=105, y=105; Person 2 to x=305, y=205
tracked = tracker.update([
  { x: 105, y: 105, width: 50, height: 100 },
  { x: 305, y: 205, width: 40, height: 90 }
], 2000);
assert(tracked.length === 2, 'Maintains 2 tracked persons in frame 2');
assert(tracked[0].id === 1 && tracked[1].id === 2, 'Retains persistent IDs across frames');
assert(tracked[0].dwellSeconds === 1, 'Calculates dwell time accurately (1s)');

// Frame 3 to 10: Person 2 disappears
for (let f = 3; f <= 10; f++) {
  tracked = tracker.update([{ x: 110, y: 110, width: 50, height: 100 }], f * 1000);
}
assert(tracked.length === 1, 'Deregisters disappeared person after maxDisappeared frames');
assert(tracked[0].id === 1, 'Keeps active person #1 tracked');


console.log('\n--- 2. Testing ZoneManager & Polygon Ray-Casting ---');
const zm = new ZoneManager();
const cam1Zones = zm.getZonesForCamera('cam1');
assert(cam1Zones.length >= 2, 'Cam 01 has configured zones (Main + Restricted)');

// Test point inside restricted polygon: Cam 1 Restricted is [[0.65, 0.45], [0.95, 0.45], [0.95, 0.85], [0.65, 0.85]]
// For 1000x1000 canvas, point (800, 600) is inside; point (200, 200) is outside
const inside = zm.isPointInPolygon(800, 600, cam1Zones[1].polygon, 1000, 1000);
const outside = zm.isPointInPolygon(200, 200, cam1Zones[1].polygon, 1000, 1000);
assert(inside === true, 'Ray-casting correctly identifies point INSIDE polygon');
assert(outside === false, 'Ray-casting correctly identifies point OUTSIDE polygon');

// Test occupancy calculation
const dummyPersons = [
  { centroid: [800, 600], id: 1 },
  { centroid: [820, 620], id: 2 },
  { centroid: [200, 300], id: 3 }
];
const occ = zm.calculateZoneOccupancy('cam1', dummyPersons, 1000, 1000);
const restrictedZone = occ.find(z => z.isRestricted);
assert(restrictedZone && restrictedZone.currentCount === 2, 'Counts persons inside restricted zone');
assert(restrictedZone.status === 'intrusion', 'Flags restricted zone status as "intrusion"');


console.log('\n--- 3. Testing IncidentStore & Persistence ---');
const store = new IncidentStore();
const initialCount = store.getIncidents().length;
const newInc = store.addIncident({
  category: 'Restricted Intrusion',
  title: 'Test Perimeter Breach',
  description: 'Test intrusion event.',
  camera: 'Cam 01: Live Entrance (Webcam)',
  zone: 'Restricted Turnstile Perimeter',
  confidence: 96,
  severity: 'Critical',
  operator: 'Officer Test'
});
assert(newInc.id.startsWith('INC-'), 'Generates valid incident ID (INC-YYYY-XXXX)');
assert(store.getIncidents().length === initialCount + 1, 'Appends incident to persistent store');

// Test update
const updated = store.updateIncident(newInc.id, {
  status: 'Resolved',
  resolutionNotes: 'Verified resolved.'
});
assert(updated.status === 'Resolved', 'Updates incident status to Resolved');
assert(updated.resolutionNotes === 'Verified resolved.', 'Records operator resolution notes');

// Test filters
const filtered = store.getIncidents({ status: 'Resolved' });
assert(filtered.some(i => i.id === newInc.id), 'Filters incidents by status');


console.log('\n--- 4. Testing AlertEngine & Explainable Risk Scoring ---');
const alertEngine = new AlertEngine();
const criticalScore = alertEngine.calculateRiskScore('Restricted Intrusion');
const mediumScore = alertEngine.calculateRiskScore('Mask Violation');
assert(criticalScore.severity === 'Critical' && criticalScore.score >= 90, 'Restricted Intrusion scored as Critical (>=90)');
assert(mediumScore.severity === 'Medium' && mediumScore.score === 55, 'Mask Violation scored as Medium');
assert(criticalScore.explanation.length > 10, 'Provides clear explainable risk rule rationale');

const dispatched = alertEngine.dispatchAlert(newInc);
assert(dispatched.incidentId === newInc.id, 'Dispatches alert correlated with incident');


console.log('\n--- 5. Testing AnomalyEngine ---');
const anomalyEngine = new AnomalyEngine(zm, store, alertEngine);
// Suppress cooldown test
const isSup1 = anomalyEngine.isSuppressed('cam1', 1, 'Intrusion', 'zone1', 1000);
const isSup2 = anomalyEngine.isSuppressed('cam1', 1, 'Intrusion', 'zone1', 2000);
assert(isSup1 === false, 'First anomaly trigger is not suppressed');
assert(isSup2 === true, 'Immediate subsequent anomaly trigger within cooldown is suppressed');


console.log('\n--- 6. Testing ModelEvaluator (Academic Research Benchmark) ---');
const evaluator = new ModelEvaluator();
const maskMetrics = evaluator.getMaskMetrics();
assert(parseFloat(maskMetrics.f1) > 90, `Mask Detection F1-Score (${maskMetrics.f1}%) exceeds 90% benchmark`);
assert(parseFloat(maskMetrics.precision) > 90, `Mask Precision (${maskMetrics.precision}%) meets threshold`);

const idMetrics = evaluator.getIdCardMetrics();
assert(parseFloat(idMetrics.precision) > 90, `ID-Card Precision (${idMetrics.precision}%) exceeds 90% benchmark`);

const anomalyMetrics = evaluator.getAnomalyMetrics();
assert(parseFloat(anomalyMetrics.accuracy) > 90, `Anomaly Classifier Accuracy (${anomalyMetrics.accuracy}%) meets threshold`);

assert(evaluator.benchmarkData.detectionMapMetrics.mAP50 >= 0.90, 'mAP@0.50 meets research standard (>=90%)');
assert(evaluator.benchmarkData.baselineComparison.length >= 5, 'Baseline vs Proposed comparative study has complete metrics');


console.log('\n--- 7. Testing ReportExporter ---');
const reportExporter = new ReportExporter(store, zm);
const report = reportExporter.generateReportData({ period: 'daily' });
assert(report.totalScreened > 0, 'Report computes total screened pedestrians');
assert(parseFloat(report.maskCompliancePct) > 80, 'Report calculates mask compliance percentage');
assert(parseFloat(report.idCompliancePct) > 80, 'Report calculates ID-card compliance percentage');
assert(report.methodology.length > 20, 'Report includes documented computer vision methodology');
assert(report.limitations.length > 20, 'Report includes documented operational limitations');


console.log(`\n========================================`);
console.log(`TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log(`========================================\n`);

if (failed > 0) process.exit(1);
