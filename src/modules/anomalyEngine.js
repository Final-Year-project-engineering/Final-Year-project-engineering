// ============================================================
// ADVANCED REAL-TIME ANOMALY DETECTION ENGINE
// Intrusion, Loitering, Fall Detection, Unusual Movement,
// and Duplicate-Alert Suppression with Snapshot Evidence.
// ============================================================

export class AnomalyEngine {
  constructor(zoneManager, incidentStore, alertEngine) {
    this.zoneManager = zoneManager;
    this.incidentStore = incidentStore;
    this.alertEngine = alertEngine;

    // Configurable thresholds
    this.config = this.loadConfig();

    // Duplicate alert suppression cooldowns: key -> timestamp
    // key: `${cameraKey}:${trackId || 'global'}:${anomalyType}:${zoneId || 'all'}`
    this.alertCooldowns = new Map();
  }

  getDefaultConfig() {
    return {
      loiteringDwellThresholdSec: 8,       // Person lingering > 8s is flagged for loitering
      loiteringMaxDisplacementPx: 45,      // If displacement is less than 45px over dwell time
      runningVelocityThresholdPxSec: 160,  // Velocity threshold for sudden running / rushing
      fallAspectRatioThreshold: 1.15,      // Bounding box width / height > 1.15 (fallen prone)
      fallHeightCollapseRatio: 0.40,       // Vertical bounding box collapse > 40% in short interval
      duplicateCooldownSec: 25,            // 25s suppression between duplicate incidents
      soundAlertsEnabled: true
    };
  }

  loadConfig() {
    try {
      const stored = localStorage.getItem('ai_anomaly_config');
      if (stored) {
        return { ...this.getDefaultConfig(), ...JSON.parse(stored) };
      }
    } catch { /* use default */ }
    return this.getDefaultConfig();
  }

  saveConfig() {
    try {
      localStorage.setItem('ai_anomaly_config', JSON.stringify(this.config));
    } catch { /* ignore */ }
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();
  }

  isSuppressed(cameraKey, trackId, anomalyType, zoneId = 'all', now = Date.now()) {
    const key = `${cameraKey}:${trackId || 'general'}:${anomalyType}:${zoneId}`;
    if (!this.alertCooldowns.has(key)) {
      this.alertCooldowns.set(key, now);
      return false;
    }
    const lastTime = this.alertCooldowns.get(key);
    const cooldownMs = this.config.duplicateCooldownSec * 1000;
    if (now - lastTime < cooldownMs) {
      return true;
    }
    this.alertCooldowns.set(key, now);
    return false;
  }

  /**
   * Evaluates a frame of tracked persons and detections for anomalies
   * @param {string} cameraKey - 'cam1' | 'cam2' | 'cam3' | 'cam4'
   * @param {string} cameraName - e.g. 'Cam 01: Live Entrance (Webcam)'
   * @param {Array} trackedPersons - from CentroidTracker
   * @param {HTMLCanvasElement|HTMLVideoElement} videoSource - for snapshot capture
   * @param {number} width - canvas display width
   * @param {number} height - canvas display height
   */
  evaluateFrame(cameraKey, cameraName, trackedPersons, videoSource, width, height) {
    const now = Date.now();
    const anomalies = [];

    // 1. Zone Occupancy & Intrusion Checks
    const zoneStats = this.zoneManager.calculateZoneOccupancy(cameraKey, trackedPersons, width, height);

    for (const z of zoneStats) {
      // Overcrowding Check
      if (!z.isRestricted && z.capacity > 0 && z.currentCount > z.capacity) {
        if (!this.isSuppressed(cameraKey, 'zone', 'Overcrowding', z.id, now)) {
          const snapshot = this.captureSnapshot(videoSource, width, height);
          const incident = {
            category: 'Overcrowding',
            title: `Capacity Exceeded in ${z.name}`,
            description: `Occupancy reached ${z.currentCount} persons against maximum safety threshold of ${z.capacity} in ${z.name}.`,
            camera: cameraName,
            zone: z.name,
            confidence: 96,
            severity: 'High',
            evidence: snapshot,
            metricDetails: `Count: ${z.currentCount} / Capacity: ${z.capacity} (${Math.round(z.occupancyRatio * 100)}%)`
          };
          this.recordAnomaly(incident);
          anomalies.push(incident);
        }
      }
    }

    // 2. Person-Level Anomaly Checks (Intrusion, Loitering, Fall, Rapid Movement)
    for (const person of trackedPersons) {
      const px = person.centroid[0];
      const py = person.centroid[1];
      const matchedZones = this.zoneManager.evaluatePersonZones(px, py, cameraKey, width, height);

      // Check A: Restricted-Area Intrusion
      for (const mz of matchedZones) {
        if (mz.isRestricted) {
          if (!this.isSuppressed(cameraKey, person.id, 'Restricted Intrusion', mz.id, now)) {
            const snapshot = this.captureSnapshot(videoSource, width, height, person.box);
            const incident = {
              category: 'Restricted Intrusion',
              title: `Intrusion Detected: ${mz.name}`,
              description: `Tracked Subject #${person.id} penetrated restricted boundary [${mz.name}] at coordinates (${Math.round(px)}, ${Math.round(py)}).`,
              camera: cameraName,
              zone: mz.name,
              confidence: 95,
              severity: 'Critical',
              evidence: snapshot,
              metricDetails: `Track ID #${person.id} | Dwell: ${person.dwellSeconds}s | Zone: ${mz.name}`
            };
            this.recordAnomaly(incident);
            anomalies.push(incident);
          }
        }
      }

      // Check B: Loitering Detection (Person remaining in an area beyond threshold with low overall displacement)
      if (person.dwellSeconds >= this.config.loiteringDwellThresholdSec && person.history.length >= 8) {
        // Calculate displacement from initial entry point to current position
        const initialPt = person.history[0];
        const netDisplacement = Math.hypot(px - initialPt.x, py - initialPt.y);

        if (netDisplacement < this.config.loiteringMaxDisplacementPx) {
          const zoneName = matchedZones.length > 0 ? matchedZones[0].name : 'General Concourse';
          if (!this.isSuppressed(cameraKey, person.id, 'Loitering Alert', zoneName, now)) {
            const snapshot = this.captureSnapshot(videoSource, width, height, person.box);
            const incident = {
              category: 'Loitering Alert',
              title: `Suspicious Loitering in ${zoneName}`,
              description: `Subject #${person.id} observed stationary or circling within a ${Math.round(netDisplacement)}px radius for ${person.dwellSeconds} seconds without purposeful transit.`,
              camera: cameraName,
              zone: zoneName,
              confidence: 91,
              severity: 'High',
              evidence: snapshot,
              metricDetails: `Dwell Time: ${person.dwellSeconds}s (Threshold: ${this.config.loiteringDwellThresholdSec}s) | Displacement: ${Math.round(netDisplacement)}px`
            };
            this.recordAnomaly(incident);
            anomalies.push(incident);
          }
        }
      }

      // Check C: Fall Detection (Kinematic aspect ratio shift + vertical collapse)
      const isProneOrientation = person.aspectRatio >= this.config.fallAspectRatioThreshold;
      let verticalCollapseDetected = false;
      if (person.history.length >= 4) {
        const prevH = person.history[0].boxHeight || person.box.height;
        if (prevH > 0 && (prevH - person.box.height) / prevH >= this.config.fallHeightCollapseRatio) {
          verticalCollapseDetected = true;
        }
      }
      person.history[person.history.length - 1].boxHeight = person.box.height;

      if ((isProneOrientation || verticalCollapseDetected) && person.box.y > height * 0.35) {
        const zoneName = matchedZones.length > 0 ? matchedZones[0].name : 'Floor Area';
        if (!this.isSuppressed(cameraKey, person.id, 'Fall Detected', zoneName, now)) {
          const snapshot = this.captureSnapshot(videoSource, width, height, person.box);
          const incident = {
            category: 'Fall Detected',
            title: `Medical / Safety Fall Event Detected in ${zoneName}`,
            description: `Sudden posture transition to horizontal orientation (Aspect Ratio: ${person.aspectRatio.toFixed(2)}) detected at ground level. Immediate operator assistance required.`,
            camera: cameraName,
            zone: zoneName,
            confidence: 89,
            severity: 'Critical',
            evidence: snapshot,
            metricDetails: `Aspect Ratio: ${person.aspectRatio.toFixed(2)} | Vertical Shift: Ground Plane`
          };
          this.recordAnomaly(incident);
          anomalies.push(incident);
        }
      }

      // Check D: Unusual Movement / Panic Running
      if (person.velocity >= this.config.runningVelocityThresholdPxSec && person.history.length >= 3) {
        const zoneName = matchedZones.length > 0 ? matchedZones[0].name : 'Transit Corridor';
        if (!this.isSuppressed(cameraKey, person.id, 'Unusual Movement', zoneName, now)) {
          const snapshot = this.captureSnapshot(videoSource, width, height, person.box);
          const incident = {
            category: 'Unusual Movement',
            title: `Rapid Velocity / Running Movement in ${zoneName}`,
            description: `Subject #${person.id} observed sprinting or moving abnormally at ${Math.round(person.velocity)} px/s, significantly deviating from nominal crowd transit velocity.`,
            camera: cameraName,
            zone: zoneName,
            confidence: 88,
            severity: 'Medium',
            evidence: snapshot,
            metricDetails: `Velocity: ${Math.round(person.velocity)} px/s (Threshold: ${this.config.runningVelocityThresholdPxSec} px/s)`
          };
          this.recordAnomaly(incident);
          anomalies.push(incident);
        }
      }
    }

    return anomalies;
  }

  /**
   * Helper to evaluate mask & ID violations from existing detectors and log incidents
   */
  evaluateComplianceViolation(cameraKey, cameraName, violationType, details, videoSource, width, height, box = null) {
    const now = Date.now();
    const zoneName = details.zone || 'Entrance Zone';
    if (this.isSuppressed(cameraKey, details.subjectId || 'violator', violationType, zoneName, now)) {
      return null;
    }

    const snapshot = this.captureSnapshot(videoSource, width, height, box);
    const incident = {
      category: violationType, // 'Mask Violation' | 'No ID Card'
      title: `${violationType} Detected at ${cameraName}`,
      description: details.description || `${violationType} logged during live multi-factor compliance screening.`,
      camera: cameraName,
      zone: zoneName,
      confidence: details.confidence || 93,
      severity: violationType === 'No ID Card' ? 'Medium' : 'Medium',
      evidence: snapshot,
      metricDetails: details.metricDetails || `${violationType} audit triggered`
    };

    this.recordAnomaly(incident);
    return incident;
  }

  recordAnomaly(incident) {
    // 1. Persist to Incident Store
    if (this.incidentStore) {
      this.incidentStore.addIncident(incident);
    }
    // 2. Dispatch to Alert Engine
    if (this.alertEngine) {
      this.alertEngine.dispatchAlert(incident);
    }
  }

  // Capture a snapshot frame from the video source or canvas
  captureSnapshot(videoSource, width, height, highlightBox = null) {
    try {
      if (!videoSource) return '';
      const snapCanvas = document.createElement('canvas');
      snapCanvas.width = 360;
      snapCanvas.height = 200;
      const ctx = snapCanvas.getContext('2d');
      if (!ctx) return '';

      // Draw downscaled frame
      ctx.drawImage(videoSource, 0, 0, snapCanvas.width, snapCanvas.height);

      // If bounding box provided, draw evidence highlight target
      if (highlightBox && width > 0 && height > 0) {
        const sx = snapCanvas.width / width;
        const sy = snapCanvas.height / height;
        const bx = highlightBox.x * sx;
        const by = highlightBox.y * sy;
        const bw = highlightBox.width * sx;
        const bh = highlightBox.height * sy;

        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, bh);

        // Reticle corners
        ctx.fillStyle = '#ef4444';
        const cs = 6;
        ctx.fillRect(bx - 1, by - 1, cs, 2);
        ctx.fillRect(bx - 1, by - 1, 2, cs);
        ctx.fillRect(bx + bw - cs + 1, by - 1, cs, 2);
        ctx.fillRect(bx + bw - 1, by - 1, 2, cs);
      }

      // Add watermark
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.fillRect(0, snapCanvas.height - 18, snapCanvas.width, 18);
      ctx.fillStyle = '#22d3ee';
      ctx.font = '10px monospace';
      ctx.fillText(`AI EVIDENCE · ${new Date().toLocaleTimeString()} · SECURE LOG`, 6, snapCanvas.height - 5);

      return snapCanvas.toDataURL('image/jpeg', 0.80);
    } catch {
      return '';
    }
  }
}
