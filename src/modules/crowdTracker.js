// ============================================================
// SMART CROWD MANAGEMENT & CENTROID TRACKER MODULE
// Real-time tracking across frames, multi-zone occupancy,
// and Gaussian density heatmap generation.
// ============================================================

export class CentroidTracker {
  constructor(maxDisappeared = 20, maxDistance = 90) {
    this.nextObjectId = 1;
    this.objects = new Map(); // id -> { id, centroid: [x,y], box, firstSeen, lastSeen, history: [], velocity: 0, dwellSeconds: 0 }
    this.disappeared = new Map(); // id -> frameCount
    this.maxDisappeared = maxDisappeared;
    this.maxDistance = maxDistance;
  }

  register(centroid, box, timestamp = Date.now()) {
    const id = this.nextObjectId++;
    this.objects.set(id, {
      id,
      centroid: [...centroid],
      box: { ...box },
      firstSeen: timestamp,
      lastSeen: timestamp,
      history: [ { x: centroid[0], y: centroid[1], time: timestamp } ],
      velocity: 0,
      dwellSeconds: 0,
      aspectRatio: box.width / Math.max(1, box.height)
    });
    this.disappeared.set(id, 0);
    return id;
  }

  deregister(objectId) {
    this.objects.delete(objectId);
    this.disappeared.delete(objectId);
  }

  update(detectedBoxes, timestamp = Date.now()) {
    // If no detections in this frame
    if (!detectedBoxes || detectedBoxes.length === 0) {
      for (const [id, count] of this.disappeared.entries()) {
        const newCount = count + 1;
        this.disappeared.set(id, newCount);
        if (newCount > this.maxDisappeared) {
          this.deregister(id);
        }
      }
      return Array.from(this.objects.values());
    }

    // Compute input centroids
    const inputCentroids = detectedBoxes.map(b => [
      Math.round(b.x + b.width / 2),
      Math.round(b.y + b.height / 2)
    ]);

    // If no existing objects tracked, register all
    if (this.objects.size === 0) {
      for (let i = 0; i < detectedBoxes.length; i++) {
        this.register(inputCentroids[i], detectedBoxes[i], timestamp);
      }
      return Array.from(this.objects.values());
    }

    // Match existing objects with input centroids using Euclidean distance
    const objectIds = Array.from(this.objects.keys());
    const objectCentroids = objectIds.map(id => this.objects.get(id).centroid);

    // Build distance matrix
    const distances = [];
    for (let i = 0; i < objectCentroids.length; i++) {
      distances[i] = [];
      for (let j = 0; j < inputCentroids.length; j++) {
        const dx = objectCentroids[i][0] - inputCentroids[j][0];
        const dy = objectCentroids[i][1] - inputCentroids[j][1];
        distances[i][j] = Math.hypot(dx, dy);
      }
    }

    // Greedy matching based on lowest distance
    const usedObjects = new Set();
    const usedInputs = new Set();

    // Flatten and sort pairs by distance
    const pairs = [];
    for (let i = 0; i < objectCentroids.length; i++) {
      for (let j = 0; j < inputCentroids.length; j++) {
        pairs.push({ objIdx: i, inIdx: j, dist: distances[i][j] });
      }
    }
    pairs.sort((a, b) => a.dist - b.dist);

    for (const pair of pairs) {
      if (usedObjects.has(pair.objIdx) || usedInputs.has(pair.inIdx)) continue;
      if (pair.dist > this.maxDistance) break;

      const objId = objectIds[pair.objIdx];
      const newCentroid = inputCentroids[pair.inIdx];
      const newBox = detectedBoxes[pair.inIdx];
      const obj = this.objects.get(objId);

      // Compute velocity (pixels per second)
      const dt = Math.max(0.05, (timestamp - obj.lastSeen) / 1000);
      const disp = Math.hypot(newCentroid[0] - obj.centroid[0], newCentroid[1] - obj.centroid[1]);
      const instantVelocity = disp / dt;
      // Exponential moving average for velocity
      obj.velocity = Math.round(obj.velocity * 0.6 + instantVelocity * 0.4);

      // Update dwell time
      obj.dwellSeconds = Math.round((timestamp - obj.firstSeen) / 1000);
      obj.aspectRatio = newBox.width / Math.max(1, newBox.height);

      obj.centroid = [...newCentroid];
      obj.box = { ...newBox };
      obj.lastSeen = timestamp;
      obj.history.push({ x: newCentroid[0], y: newCentroid[1], time: timestamp });
      if (obj.history.length > 30) obj.history.shift();

      this.disappeared.set(objId, 0);
      usedObjects.add(pair.objIdx);
      usedInputs.add(pair.inIdx);
    }

    // For unmatched existing objects, increment disappeared count
    for (let i = 0; i < objectIds.length; i++) {
      if (!usedObjects.has(i)) {
        const objId = objectIds[i];
        const newCount = (this.disappeared.get(objId) || 0) + 1;
        this.disappeared.set(objId, newCount);
        if (newCount > this.maxDisappeared) {
          this.deregister(objId);
        }
      }
    }

    // For unmatched new detections, register new object
    for (let j = 0; j < inputCentroids.length; j++) {
      if (!usedInputs.has(j)) {
        this.register(inputCentroids[j], detectedBoxes[j], timestamp);
      }
    }

    return Array.from(this.objects.values());
  }
}

// ============================================================
// CONFIGURABLE ZONE MANAGER
// ============================================================

export class ZoneManager {
  constructor() {
    this.zones = this.loadConfiguredZones();
  }

  getDefaultZones() {
    return {
      cam1: [
        {
          id: 'zone-cam1-main',
          name: 'Zone Alpha - Main Portal',
          capacity: 6,
          isRestricted: false,
          polygon: [ [0.05, 0.20], [0.95, 0.20], [0.95, 0.95], [0.05, 0.95] ]
        },
        {
          id: 'zone-cam1-restricted',
          name: 'Restricted Turnstile Perimeter',
          capacity: 0,
          isRestricted: true,
          polygon: [ [0.65, 0.45], [0.95, 0.45], [0.95, 0.85], [0.65, 0.85] ]
        }
      ],
      cam2: [
        {
          id: 'zone-cam2-concourse',
          name: 'Zone Bravo - North Concourse',
          capacity: 12,
          isRestricted: false,
          polygon: [ [0.05, 0.15], [0.95, 0.15], [0.95, 0.95], [0.05, 0.95] ]
        },
        {
          id: 'zone-cam2-perimeter',
          name: 'Restricted Security Corridor',
          capacity: 0,
          isRestricted: true,
          polygon: [ [0.70, 0.15], [0.98, 0.15], [0.98, 0.70], [0.70, 0.70] ]
        }
      ],
      cam3: [
        {
          id: 'zone-cam3-checkpoint',
          name: 'Zone Charlie - West Checkpoint',
          capacity: 8,
          isRestricted: false,
          polygon: [ [0.10, 0.20], [0.90, 0.20], [0.90, 0.95], [0.10, 0.95] ]
        },
        {
          id: 'zone-cam3-barrier',
          name: 'Authorized Personnel Only',
          capacity: 0,
          isRestricted: true,
          polygon: [ [0.10, 0.20], [0.45, 0.20], [0.45, 0.65], [0.10, 0.65] ]
        }
      ],
      cam4: [
        {
          id: 'zone-cam4-dining',
          name: 'Zone Delta - Central Dining',
          capacity: 15,
          isRestricted: false,
          polygon: [ [0.05, 0.15], [0.95, 0.15], [0.95, 0.95], [0.05, 0.95] ]
        },
        {
          id: 'zone-cam4-service',
          name: 'Kitchen / Staff Entryway',
          capacity: 0,
          isRestricted: true,
          polygon: [ [0.75, 0.20], [0.98, 0.20], [0.98, 0.75], [0.75, 0.75] ]
        }
      ]
    };
  }

  loadConfiguredZones() {
    try {
      const stored = localStorage.getItem('ai_configured_zones');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch { /* fallback to default */ }
    return this.getDefaultZones();
  }

  saveZones() {
    try {
      localStorage.setItem('ai_configured_zones', JSON.stringify(this.zones));
    } catch { /* ignore */ }
  }

  getZonesForCamera(camKey) {
    return this.zones[camKey] || [];
  }

  updateZoneCapacity(camKey, zoneId, capacity) {
    const list = this.zones[camKey] || [];
    const z = list.find(item => item.id === zoneId);
    if (z) {
      z.capacity = Math.max(0, parseInt(capacity, 10) || 0);
      this.saveZones();
    }
  }

  // Ray-casting algorithm to test point in polygon
  // point = [x, y], polygon = [ [normX, normY], ... ] scaled by canvasW, canvasH
  isPointInPolygon(px, py, polygon, width, height) {
    if (!polygon || polygon.length < 3) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0] * width,  yi = polygon[i][1] * height;
      const xj = polygon[j][0] * width,  yj = polygon[j][1] * height;

      const intersect = ((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi + 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Evaluate which zones contain a person centroid
  evaluatePersonZones(px, py, camKey, width, height) {
    const matched = [];
    const zones = this.getZonesForCamera(camKey);
    for (const z of zones) {
      if (this.isPointInPolygon(px, py, z.polygon, width, height)) {
        matched.push(z);
      }
    }
    return matched;
  }

  // Compute live occupancy statistics for all zones in a camera feed
  calculateZoneOccupancy(camKey, trackedPersons, width, height) {
    const zones = this.getZonesForCamera(camKey);
    return zones.map(zone => {
      let count = 0;
      for (const p of trackedPersons) {
        if (this.isPointInPolygon(p.centroid[0], p.centroid[1], zone.polygon, width, height)) {
          count++;
        }
      }
      const cap = zone.capacity;
      const ratio = cap > 0 ? count / cap : (count > 0 ? 9.99 : 0);
      let status = 'normal'; // green
      let statusColor = '#10b981';
      if (zone.isRestricted && count > 0) {
        status = 'intrusion';
        statusColor = '#ef4444';
      } else if (ratio >= 1.0) {
        status = 'overcrowded'; // red
        statusColor = '#ef4444';
      } else if (ratio >= 0.7) {
        status = 'elevated'; // amber
        statusColor = '#f59e0b';
      }

      return {
        ...zone,
        currentCount: count,
        occupancyRatio: ratio,
        status,
        statusColor
      };
    });
  }

  // Draw zone boundaries onto the overlay canvas
  drawZones(ctx, camKey, width, height) {
    const zones = this.getZonesForCamera(camKey);
    ctx.save();
    for (const z of zones) {
      const poly = z.polygon;
      if (!poly || poly.length < 3) continue;

      ctx.beginPath();
      ctx.moveTo(poly[0][0] * width, poly[0][1] * height);
      for (let i = 1; i < poly.length; i++) {
        ctx.lineTo(poly[i][0] * width, poly[i][1] * height);
      }
      ctx.closePath();

      if (z.isRestricted) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
        ctx.setLineDash([6, 4]);
      } else {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.10)';
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.75)';
        ctx.setLineDash([]);
      }
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();

      // Zone Label Badge
      const startX = poly[0][0] * width + 6;
      const startY = poly[0][1] * height + 16;
      ctx.font = '600 11px Inter, sans-serif';
      const label = `${z.isRestricted ? '⛔ RESTRICTED: ' : '📍 '}${z.name}`;
      const textWidth = ctx.measureText(label).width;
      const badgeW = textWidth + 8;

      ctx.fillStyle = z.isRestricted ? 'rgba(239, 68, 68, 0.9)' : 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(startX - 4, startY - 12, badgeW, 16);
      ctx.fillStyle = '#ffffff';

      const isMirrored = camKey === 'cam1' || (ctx.canvas && (ctx.canvas.id === 'webcam' || ctx.canvas.style?.transform?.includes('scaleX(-1)')));
      if (isMirrored) {
        ctx.save();
        ctx.translate(startX - 4 + badgeW, startY);
        ctx.scale(-1, 1);
        ctx.fillText(label, 4, 0);
        ctx.restore();
      } else {
        ctx.fillText(label, startX, startY);
      }
    }
    ctx.restore();
  }
}

// ============================================================
// REAL-TIME GAUSSIAN CROWD HEATMAP RENDERER
// Generates computer vision density field from tracked person centroids
// ============================================================

export class HeatmapRenderer {
  constructor() {
    this.historyBuffer = []; // { x, y, weight, timestamp }
    this.bufferDurationMs = 7000; // retain heat traces for 7 seconds
    this.gradient = this.createColorGradient();
  }

  createColorGradient() {
    // 256-step color lookup canvas for smooth thermal rendering
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0.0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(0.2, 'rgba(0, 80, 255, 0.3)');   // Deep Blue
    grad.addColorStop(0.4, 'rgba(0, 230, 255, 0.6)');  // Cyan
    grad.addColorStop(0.65, 'rgba(0, 255, 120, 0.8)'); // Green
    grad.addColorStop(0.85, 'rgba(255, 220, 0, 0.9)'); // Yellow
    grad.addColorStop(1.0, 'rgba(255, 40, 0, 0.95)');  // Bright Red

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 1);
    return ctx.getImageData(0, 0, 256, 1).data;
  }

  addPoints(points, timestamp = Date.now()) {
    for (const pt of points) {
      this.historyBuffer.push({
        x: pt[0],
        y: pt[1],
        weight: pt[2] || 1.0,
        timestamp
      });
    }
    // Prune stale points
    const cutoff = timestamp - this.bufferDurationMs;
    while (this.historyBuffer.length > 0 && this.historyBuffer[0].timestamp < cutoff) {
      this.historyBuffer.shift();
    }
  }

  // Render smooth density map onto target 2D context
  render(targetCtx, width, height, radius = 45) {
    if (this.historyBuffer.length === 0 || width <= 0 || height <= 0) return;

    // Step 1: Draw radial Gaussian intensity circles onto offscreen canvas (alpha accumulation)
    const offCanvas = document.createElement('canvas');
    offCanvas.width = width;
    offCanvas.height = height;
    const offCtx = offCanvas.getContext('2d');
    if (!offCtx) return;

    const now = Date.now();
    for (const pt of this.historyBuffer) {
      const ageRatio = Math.max(0, 1 - (now - pt.timestamp) / this.bufferDurationMs);
      const alpha = 0.25 * pt.weight * ageRatio;

      const radGrad = offCtx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, radius);
      radGrad.addColorStop(0, `rgba(0,0,0,${alpha})`);
      radGrad.addColorStop(1, 'rgba(0,0,0,0)');

      offCtx.fillStyle = radGrad;
      offCtx.beginPath();
      offCtx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
      offCtx.fill();
    }

    // Step 2: Colorize alpha values using thermal gradient lookup
    const imgData = offCtx.getImageData(0, 0, width, height);
    const pixels = imgData.data;
    const len = pixels.length;

    for (let i = 3; i < len; i += 4) {
      const a = pixels[i]; // Alpha value 0-255 corresponds to density
      if (a > 3) {
        const offset = a * 4;
        pixels[i - 3] = this.gradient[offset];     // R
        pixels[i - 2] = this.gradient[offset + 1]; // G
        pixels[i - 1] = this.gradient[offset + 2]; // B
        pixels[i]     = Math.min(210, Math.round(a * 1.3)); // Smooth display alpha
      }
    }

    offCtx.putImageData(imgData, 0, 0);

    // Step 3: Composite onto target canvas
    targetCtx.save();
    targetCtx.globalAlpha = 0.85;
    targetCtx.drawImage(offCanvas, 0, 0);
    targetCtx.restore();
  }
}
