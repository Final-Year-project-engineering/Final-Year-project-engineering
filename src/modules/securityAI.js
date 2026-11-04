// ============================================================
// SECURITY AI ORCHESTRATOR & UI SUITE
// Integrates AnomalyEngine, CrowdTracker, IncidentStore,
// AlertEngine, ModelEvaluator, and ReportExporter.
// ============================================================

import { CentroidTracker, ZoneManager, HeatmapRenderer } from './crowdTracker.js';
import { AnomalyEngine } from './anomalyEngine.js';
import { IncidentStore } from './incidentStore.js';
import { AlertEngine } from './alertEngine.js';
import { ModelEvaluator } from './modelEvaluator.js';
import { ReportExporter } from './reportExporter.js';

export class SecurityAISuite {
  constructor() {
    this.zoneManager = new ZoneManager();
    this.incidentStore = new IncidentStore();
    this.alertEngine = new AlertEngine();
    this.anomalyEngine = new AnomalyEngine(this.zoneManager, this.incidentStore, this.alertEngine);
    this.modelEvaluator = new ModelEvaluator();
    this.reportExporter = new ReportExporter(this.incidentStore, this.zoneManager);

    // Trackers and heatmaps per camera stream
    this.trackers = {
      cam1: new CentroidTracker(15, 90),
      cam2: new CentroidTracker(20, 80),
      cam3: new CentroidTracker(20, 80),
      cam4: new CentroidTracker(20, 80)
    };

    this.heatmaps = {
      cam1: new HeatmapRenderer(),
      cam2: new HeatmapRenderer(),
      cam3: new HeatmapRenderer(),
      cam4: new HeatmapRenderer()
    };

    // Toggle states for visual overlays
    this.overlayState = {
      cam1: { heatmap: false, zones: true, tracking: true },
      cam2: { heatmap: false, zones: true, tracking: true },
      cam3: { heatmap: false, zones: true, tracking: true },
      cam4: { heatmap: false, zones: true, tracking: true }
    };

    // Cache latest zone stats for live telemetry
    this.latestZoneStats = {};

    this.init();
  }

  init() {
    // Listen to incident changes to update badges and UI
    this.incidentStore.subscribe(() => {
      this.updateIncidentBadges();
      this.refreshIncidentsTable();
      this.refreshAnalyticsDashboard();
    });

    // Setup global listeners after DOM loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.bindUI());
    } else {
      this.bindUI();
    }
  }

  bindUI() {
    this.bindOverlayToggles();
    this.bindIncidentsUI();
    this.bindCrowdAnalyticsUI();
    this.bindModelEvaluationUI();
    this.bindReportsUI();
    this.bindSettingsExtension();
    this.updateIncidentBadges();
  }

  /**
   * Process a single video frame for a camera feed
   * Called from each camera's detection loop without modifying existing mask logic
   */
  processFrame(cameraKey, cameraName, detections, drawCanvas, videoElement) {
    if (!detections || !drawCanvas || !videoElement) return;

    const width = drawCanvas.width;
    const height = drawCanvas.height;
    if (width <= 0 || height <= 0) return;

    const ctx = drawCanvas.getContext('2d');
    const tracker = this.trackers[cameraKey];
    const heatmap = this.heatmaps[cameraKey];
    const state = this.overlayState[cameraKey] || { heatmap: false, zones: true, tracking: true };

    // 1. Extract bounding boxes from detections
    const boxes = detections.map(d => {
      if (d.detection && d.detection.box) return d.detection.box;
      if (d.box) return d.box;
      return { x: 0, y: 0, width: 0, height: 0 };
    }).filter(b => b.width > 0 && b.height > 0);

    // 2. Update Centroid Tracker
    const trackedPersons = tracker.update(boxes);

    // 3. Accumulate Heatmap Points
    const points = trackedPersons.map(p => [p.centroid[0], p.centroid[1], 1.0]);
    heatmap.addPoints(points);

    // 4. Draw Zones Overlay if active
    if (state.zones) {
      this.zoneManager.drawZones(ctx, cameraKey, width, height);
    }

    // 5. Render Heatmap if active
    if (state.heatmap) {
      heatmap.render(ctx, width, height, 40);
    }

    // 6. Draw Tracking Reticles & IDs if active
    if (state.tracking) {
      ctx.save();
      for (const p of trackedPersons) {
        const [cx, cy] = p.centroid;

        // Draw Centroid Dot & Trail
        ctx.fillStyle = '#22d3ee';
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();

        // Draw Motion Trail History
        if (p.history.length > 1) {
          ctx.beginPath();
          ctx.moveTo(p.history[0].x, p.history[0].y);
          for (let i = 1; i < p.history.length; i++) {
            ctx.lineTo(p.history[i].x, p.history[i].y);
          }
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Draw Track Badge above person
        const topY = Math.max(16, p.box.y - 6);
        ctx.font = '600 10px monospace';
        const badgeText = `ID#${p.id} · ${p.dwellSeconds}s`;
        const textW = ctx.measureText(badgeText).width;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.fillRect(p.box.x, topY - 10, textW + 6, 12);
        ctx.fillStyle = p.dwellSeconds > 8 ? '#f59e0b' : '#22d3ee';

        const isMirrored = cameraKey === 'cam1' || (ctx.canvas && (ctx.canvas.id === 'webcam' || ctx.canvas.style?.transform?.includes('scaleX(-1)')));
        if (isMirrored) {
          ctx.save();
          ctx.translate(p.box.x + textW + 6, topY - 1);
          ctx.scale(-1, 1);
          ctx.fillText(badgeText, 3, 0);
          ctx.restore();
        } else {
          ctx.fillText(badgeText, p.box.x + 3, topY - 1);
        }
      }
      ctx.restore();
    }

    // 7. Execute Anomaly Engine
    this.anomalyEngine.evaluateFrame(cameraKey, cameraName, trackedPersons, videoElement, width, height);

    // 8. Cache Zone Stats for UI
    this.latestZoneStats[cameraKey] = this.zoneManager.calculateZoneOccupancy(cameraKey, trackedPersons, width, height);
  }

  // ============================================================
  // CAMERA CARD CONTROLS (Heatmap & Zone Toggles)
  // ============================================================

  bindOverlayToggles() {
    ['cam1', 'cam2', 'cam3', 'cam4'].forEach(key => {
      const card = document.getElementById(`${key}-card`);
      if (!card) return;

      const controls = card.querySelector('.feed-controls');
      if (!controls) return;

      // Check if buttons already injected
      if (card.querySelector('.btn-toggle-heatmap')) return;

      const heatBtn = document.createElement('button');
      heatBtn.className = 'control-btn btn-toggle-heatmap';
      heatBtn.title = 'Toggle Density Heatmap';
      heatBtn.innerHTML = "<i class='bx bx-radar'></i>";
      heatBtn.onclick = () => {
        this.overlayState[key].heatmap = !this.overlayState[key].heatmap;
        heatBtn.classList.toggle('active', this.overlayState[key].heatmap);
      };

      const zoneBtn = document.createElement('button');
      zoneBtn.className = 'control-btn btn-toggle-zones active';
      zoneBtn.title = 'Toggle Security Polygon Zones';
      zoneBtn.innerHTML = "<i class='bx bx-polygon'></i>";
      zoneBtn.onclick = () => {
        this.overlayState[key].zones = !this.overlayState[key].zones;
        zoneBtn.classList.toggle('active', this.overlayState[key].zones);
      };

      controls.insertBefore(heatBtn, controls.firstChild);
      controls.insertBefore(zoneBtn, controls.firstChild);
    });
  }

  // ============================================================
  // INCIDENT MANAGEMENT UI
  // ============================================================

  bindIncidentsUI() {
    // Filter controls
    const searchInput = document.getElementById('incident-search');
    const categorySelect = document.getElementById('incident-filter-category');
    const severitySelect = document.getElementById('incident-filter-severity');
    const statusSelect = document.getElementById('incident-filter-status');
    const cameraSelect = document.getElementById('incident-filter-camera');
    const exportBtn = document.getElementById('incident-export-btn');

    const update = () => this.refreshIncidentsTable();

    searchInput?.addEventListener('input', update);
    categorySelect?.addEventListener('change', update);
    severitySelect?.addEventListener('change', update);
    statusSelect?.addEventListener('change', update);
    cameraSelect?.addEventListener('change', update);

    exportBtn?.addEventListener('click', () => {
      const filter = this.getIncidentFilterFromDOM();
      this.incidentStore.exportCSV(filter);
    });

    // Close Modal Button
    document.getElementById('incident-modal-close')?.addEventListener('click', () => {
      document.getElementById('incident-detail-modal')?.classList.add('hidden');
    });
    document.getElementById('incident-modal-backdrop')?.addEventListener('click', () => {
      document.getElementById('incident-detail-modal')?.classList.add('hidden');
    });

    // Modal Status Save Button
    document.getElementById('incident-modal-save-btn')?.addEventListener('click', () => {
      const id = document.getElementById('incident-modal-id')?.textContent;
      const newStatus = document.getElementById('incident-modal-status-select')?.value;
      const operator = document.getElementById('incident-modal-operator')?.value;
      const notes = document.getElementById('incident-modal-notes')?.value;

      if (id && newStatus) {
        this.incidentStore.updateIncident(id, {
          status: newStatus,
          operator: operator || 'Unassigned',
          resolutionNotes: notes
        });
        document.getElementById('incident-detail-modal')?.classList.add('hidden');
      }
    });

    this.refreshIncidentsTable();
  }

  getIncidentFilterFromDOM() {
    return {
      search: document.getElementById('incident-search')?.value || '',
      category: document.getElementById('incident-filter-category')?.value || 'all',
      severity: document.getElementById('incident-filter-severity')?.value || 'all',
      status: document.getElementById('incident-filter-status')?.value || 'all',
      camera: document.getElementById('incident-filter-camera')?.value || 'all'
    };
  }

  updateIncidentBadges() {
    const stats = this.incidentStore.getStats();
    const navBadge = document.getElementById('nav-incident-badge');
    if (navBadge) {
      navBadge.textContent = stats.open;
      navBadge.style.display = stats.open > 0 ? 'inline-block' : 'none';
    }

    const totalEl = document.getElementById('incidents-kpi-total');
    const openEl = document.getElementById('incidents-kpi-open');
    const criticalEl = document.getElementById('incidents-kpi-critical');
    const resolvedEl = document.getElementById('incidents-kpi-resolved');

    if (totalEl) totalEl.textContent = stats.total;
    if (openEl) openEl.textContent = stats.open;
    if (criticalEl) criticalEl.textContent = stats.critical;
    if (resolvedEl) resolvedEl.textContent = stats.resolved;
  }

  refreshIncidentsTable() {
    const tbody = document.getElementById('incidents-tbody');
    if (!tbody) return;

    const filter = this.getIncidentFilterFromDOM();
    const incidents = this.incidentStore.getIncidents(filter);

    if (incidents.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center;padding:2.5rem;color:var(--text-secondary);">
            <i class='bx bx-check-shield' style="font-size:2.5rem;color:var(--accent-green);display:block;margin-bottom:0.5rem;"></i>
            No incidents found matching the specified filters. All zones nominal.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = incidents.map(inc => {
      const sevClass = inc.severity.toLowerCase();
      const statusClass = inc.status.toLowerCase();
      return `
        <tr data-id="${inc.id}">
          <td><strong><code>${inc.id}</code></strong></td>
          <td>${new Date(inc.timestamp).toLocaleTimeString()} <small style="color:var(--text-secondary);display:block;">${new Date(inc.timestamp).toLocaleDateString()}</small></td>
          <td>
            <strong>${inc.category}</strong>
            <div style="font-size:0.75rem;color:var(--text-secondary);max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${inc.title}</div>
          </td>
          <td>${inc.zone} <small style="color:var(--text-secondary);display:block;">${inc.camera.split(':')[0]}</small></td>
          <td><span class="severity-pill sev-${sevClass}">${inc.severity}</span></td>
          <td><span class="status-pill status-${statusClass}">${inc.status}</span></td>
          <td>
            ${inc.evidence ? `
              <img src="${inc.evidence}" class="incident-thumb-img" title="Click to inspect evidence" />
            ` : `<span style="font-size:0.75rem;color:var(--text-secondary);">Live Stream</span>`}
          </td>
          <td>
            <button class="btn btn-outline btn-sm incident-inspect-btn" data-id="${inc.id}">
              <i class='bx bx-search-alt'></i> Review
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Attach click events for inspector modal
    tbody.querySelectorAll('.incident-inspect-btn, .incident-thumb-img').forEach(el => {
      el.addEventListener('click', (e) => {
        const row = e.target.closest('tr');
        const id = row?.getAttribute('data-id');
        if (id) this.openIncidentModal(id);
      });
    });
  }

  openIncidentModal(id) {
    const inc = this.incidentStore.getIncidentById(id);
    if (!inc) return;

    const modal = document.getElementById('incident-detail-modal');
    if (!modal) return;

    document.getElementById('incident-modal-id').textContent = inc.id;
    document.getElementById('incident-modal-title').textContent = inc.title;
    document.getElementById('incident-modal-time').textContent = new Date(inc.timestamp).toLocaleString();
    document.getElementById('incident-modal-category').textContent = inc.category;
    document.getElementById('incident-modal-zone').textContent = `${inc.zone} (${inc.camera})`;
    document.getElementById('incident-modal-confidence').textContent = `${inc.confidence}% (Neural Confidence)`;
    document.getElementById('incident-modal-severity').className = `severity-pill sev-${inc.severity.toLowerCase()}`;
    document.getElementById('incident-modal-severity').textContent = inc.severity;
    document.getElementById('incident-modal-desc').textContent = inc.description;
    document.getElementById('incident-modal-metrics').textContent = inc.metricDetails || 'Real-time telemetry event';

    const snapImg = document.getElementById('incident-modal-evidence');
    if (snapImg) {
      if (inc.evidence) {
        snapImg.src = inc.evidence;
        snapImg.style.display = 'block';
      } else {
        snapImg.style.display = 'none';
      }
    }

    const statusSelect = document.getElementById('incident-modal-status-select');
    if (statusSelect) statusSelect.value = inc.status;

    const opInput = document.getElementById('incident-modal-operator');
    if (opInput) opInput.value = inc.operator !== 'Unassigned' ? inc.operator : 'Officer Aryan KS';

    const notesInput = document.getElementById('incident-modal-notes');
    if (notesInput) notesInput.value = inc.resolutionNotes || '';

    modal.classList.remove('hidden');
  }

  // ============================================================
  // CROWD ANALYTICS UI
  // ============================================================

  bindCrowdAnalyticsUI() {
    this.refreshCrowdAnalyticsView();
    // Re-render periodically
    setInterval(() => {
      if (!document.getElementById('view-crowd-analytics')?.classList.contains('hidden')) {
        this.refreshCrowdAnalyticsView();
      }
    }, 2000);
  }

  refreshCrowdAnalyticsView() {
    const container = document.getElementById('crowd-zones-grid');
    if (!container) return;

    // Build zone cards
    const allZones = [];
    ['cam1', 'cam2', 'cam3', 'cam4'].forEach(k => {
      const stats = this.latestZoneStats[k] || this.zoneManager.calculateZoneOccupancy(k, [], 640, 360);
      stats.forEach(s => allZones.push({ ...s, cameraKey: k }));
    });

    container.innerHTML = allZones.map(z => {
      const pct = z.capacity > 0 ? Math.min(100, Math.round(z.occupancyRatio * 100)) : (z.currentCount > 0 ? 100 : 0);
      const isOver = z.status === 'overcrowded' || z.status === 'intrusion';
      return `
        <div class="stat-card glass-panel ${isOver ? 'alert-stat' : ''}">
          <div class="stat-header">
            <h3>${z.isRestricted ? '⛔ RESTRICTED' : '📍 ' + z.name}</h3>
            <span class="status-pill status-${z.status}">${z.status.toUpperCase()}</span>
          </div>
          <div style="display:flex;align-items:baseline;gap:8px;margin:8px 0;">
            <span class="stat-value" style="font-size:1.8rem;color:${z.statusColor};">${z.currentCount}</span>
            <span style="font-size:0.85rem;color:var(--text-secondary);">${z.capacity > 0 ? `/ ${z.capacity} Capacity` : 'Zero Tolerance'}</span>
          </div>
          <div class="progress-bar" style="margin-top:6px;">
            <div class="progress-fill" style="width:${pct}%;background:${z.statusColor};"></div>
          </div>
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:6px;">
            Camera: ${z.cameraKey.toUpperCase()} &middot; Load: ${pct}%
          </div>
        </div>
      `;
    }).join('');
  }

  // ============================================================
  // MODEL EVALUATION UI
  // ============================================================

  bindModelEvaluationUI() {
    const exportBtn = document.getElementById('eval-export-btn');
    const jsonBtn = document.getElementById('eval-export-json');

    exportBtn?.addEventListener('click', () => this.modelEvaluator.exportBenchmarkCSV());
    jsonBtn?.addEventListener('click', () => this.modelEvaluator.exportBenchmarkJSON());

    this.renderEvaluationCards();
  }

  renderEvaluationCards() {
    const mask = this.modelEvaluator.getMaskMetrics();
    const id = this.modelEvaluator.getIdCardMetrics();
    const anomaly = this.modelEvaluator.getAnomalyMetrics();

    // Populate KPI numbers
    const elMaskP = document.getElementById('eval-mask-precision');
    const elMaskR = document.getElementById('eval-mask-recall');
    const elMaskF1 = document.getElementById('eval-mask-f1');

    if (elMaskP) elMaskP.textContent = `${mask.precision}%`;
    if (elMaskR) elMaskR.textContent = `${mask.recall}%`;
    if (elMaskF1) elMaskF1.textContent = `${mask.f1}%`;

    const elIdP = document.getElementById('eval-id-precision');
    const elIdR = document.getElementById('eval-id-recall');
    const elIdF1 = document.getElementById('eval-id-f1');

    if (elIdP) elIdP.textContent = `${id.precision}%`;
    if (elIdR) elIdR.textContent = `${id.recall}%`;
    if (elIdF1) elIdF1.textContent = `${id.f1}%`;

    const elAnomP = document.getElementById('eval-anom-precision');
    const elAnomR = document.getElementById('eval-anom-recall');
    const elAnomF1 = document.getElementById('eval-anom-f1');

    if (elAnomP) elAnomP.textContent = `${anomaly.precision}%`;
    if (elAnomR) elAnomR.textContent = `${anomaly.recall}%`;
    if (elAnomF1) elAnomF1.textContent = `${anomaly.f1}%`;

    // Populate Baseline vs Proposed Comparison Table
    const compTable = document.getElementById('eval-comparison-tbody');
    if (compTable) {
      compTable.innerHTML = this.modelEvaluator.benchmarkData.baselineComparison.map(c => `
        <tr>
          <td><strong>${c.metric}</strong></td>
          <td style="color:var(--text-secondary);">${c.baseline}</td>
          <td style="color:var(--accent-green);font-weight:700;">${c.proposed}</td>
          <td><span class="severity-pill sev-low" style="color:var(--accent-cyan);background:rgba(34,211,238,0.1);">${c.delta}</span></td>
        </tr>
      `).join('');
    }
  }

  // ============================================================
  // AUTOMATED REPORTS UI
  // ============================================================

  bindReportsUI() {
    const btnCSV = document.getElementById('report-download-csv');
    const btnPDF = document.getElementById('report-download-pdf');
    const periodSelect = document.getElementById('report-period-select');

    const triggerRefresh = () => {
      const period = periodSelect?.value || 'daily';
      const preview = this.reportExporter.generateReportData({ period });
      this.renderReportPreview(preview);
    };

    btnCSV?.addEventListener('click', () => {
      const period = periodSelect?.value || 'daily';
      this.reportExporter.exportCSV({ period });
    });

    btnPDF?.addEventListener('click', () => {
      const period = periodSelect?.value || 'daily';
      this.reportExporter.printPDFReport({ period });
    });

    periodSelect?.addEventListener('change', triggerRefresh);
    triggerRefresh();
  }

  renderReportPreview(data) {
    const elTitle = document.getElementById('report-preview-title');
    const elTime = document.getElementById('report-preview-time');
    const elScreened = document.getElementById('report-preview-screened');
    const elMask = document.getElementById('report-preview-mask');
    const elId = document.getElementById('report-preview-id');
    const elRate = document.getElementById('report-preview-rate');

    if (elTitle) elTitle.textContent = data.periodLabel;
    if (elTime) elTime.textContent = `Generated: ${data.generatedAt}`;
    if (elScreened) elScreened.textContent = data.totalScreened.toLocaleString();
    if (elMask) elMask.textContent = `${data.maskCompliancePct}%`;
    if (elId) elId.textContent = `${data.idCompliancePct}%`;
    if (elRate) elRate.textContent = `${data.stats.resolutionRate}%`;

    const catTbody = document.getElementById('report-preview-cat-tbody');
    if (catTbody) {
      catTbody.innerHTML = `
        <tr><td>Restricted Area Intrusion</td><td><strong>${data.categoryCounts.intrusion}</strong></td><td><span class="severity-pill sev-critical">Critical</span></td></tr>
        <tr><td>Fall / Medical Collapse Event</td><td><strong>${data.categoryCounts.fall}</strong></td><td><span class="severity-pill sev-critical">Critical</span></td></tr>
        <tr><td>Zone Overcrowding Breaches</td><td><strong>${data.categoryCounts.overcrowding}</strong></td><td><span class="severity-pill sev-high">High</span></td></tr>
        <tr><td>Suspicious Loitering Alerts</td><td><strong>${data.categoryCounts.loitering}</strong></td><td><span class="severity-pill sev-high">High</span></td></tr>
        <tr><td>ID Card Badge Violations</td><td><strong>${data.categoryCounts.idCard}</strong></td><td><span class="severity-pill sev-medium">Medium</span></td></tr>
        <tr><td>Mask Protocol Violations</td><td><strong>${data.categoryCounts.mask}</strong></td><td><span class="severity-pill sev-medium">Medium</span></td></tr>
      `;
    }
  }

  // ============================================================
  // SETTINGS EXTENSION
  // ============================================================

  bindSettingsExtension() {
    // Loitering slider
    const loiterRange = document.getElementById('setting-loiter-threshold');
    const loiterVal = document.getElementById('setting-loiter-val');
    if (loiterRange) {
      loiterRange.value = this.anomalyEngine.config.loiteringDwellThresholdSec;
      if (loiterVal) loiterVal.textContent = `${loiterRange.value}s`;
      loiterRange.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (loiterVal) loiterVal.textContent = `${val}s`;
        this.anomalyEngine.updateConfig({ loiteringDwellThresholdSec: val });
      });
    }

    // Email notification settings
    const emailToggle = document.getElementById('setting-email-toggle');
    const emailInput = document.getElementById('setting-email-recipients');
    const emailEndpoint = document.getElementById('setting-email-endpoint');
    const emailSaveBtn = document.getElementById('setting-email-save-btn');
    const emailTestBtn = document.getElementById('setting-email-test-btn');

    if (emailToggle) {
      emailToggle.checked = this.alertEngine.emailConfig.enabled;
      emailToggle.addEventListener('change', (e) => {
        this.alertEngine.emailConfig.enabled = e.target.checked;
        this.alertEngine.saveEmailConfig();
      });
    }

    if (emailInput) {
      emailInput.value = this.alertEngine.emailConfig.recipientEmails;
    }

    if (emailEndpoint) {
      emailEndpoint.value = this.alertEngine.emailConfig.endpoint || '';
    }

    emailSaveBtn?.addEventListener('click', () => {
      this.alertEngine.emailConfig.recipientEmails = emailInput?.value || '';
      this.alertEngine.emailConfig.endpoint = emailEndpoint?.value || '';
      this.alertEngine.saveEmailConfig();
      alert('Email notification preferences saved successfully.');
    });

    emailTestBtn?.addEventListener('click', () => {
      this.alertEngine.dispatchAlert({
        id: `TEST-${Date.now()}`,
        category: 'Restricted Intrusion',
        title: 'Diagnostic Test Notification',
        description: 'Simulated security alert to verify notification pipeline.',
        camera: 'Cam 01: Live Entrance (Webcam)',
        zone: 'Zone Alpha',
        severity: 'Critical'
      });
      alert('Test alert dispatched! Check the Alert History and Notification Log.');
    });
  }

  refreshAnalyticsDashboard() {
    // If DashboardSim is present, keep its stats in sync with real incidents
    if (window._dashSim) {
      const stats = this.incidentStore.getStats();
      const alertStatEl = document.getElementById('active-alerts');
      if (alertStatEl) alertStatEl.textContent = stats.open;
    }
  }
}

// Instantiate and expose globally
export const securityAI = new SecurityAISuite();
window.SecurityAI = securityAI;
