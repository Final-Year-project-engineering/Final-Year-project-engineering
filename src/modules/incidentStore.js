// ============================================================
// PERSISTENT INCIDENT MANAGEMENT DATABASE MODULE
// IndexedDB persistence with localStorage fallback, audit trail,
// filtering, evidence retrieval, and operator resolution workflow.
// ============================================================

const DB_NAME = 'SecuritySurveillanceDB';
const DB_VERSION = 1;
const STORE_NAME = 'incidents';

export class IncidentStore {
  constructor() {
    this.memoryCache = [];
    this.db = null;
    this.isReady = false;
    this.listeners = new Set();
    this.idCounter = 1001;

    this.initDB();
  }

  async initDB() {
    return new Promise((resolve) => {
      // 1. Load from localStorage cache first for instant synchronous availability
      try {
        const cached = localStorage.getItem('ai_incidents_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.memoryCache = parsed;
            this.idCounter = Math.max(...parsed.map(i => parseInt(i.id.replace(/\D/g, '') || 1000, 10))) + 1;
          }
        }
      } catch { /* ignore */ }

      // Seed baseline operational incidents if empty
      if (this.memoryCache.length === 0) {
        this.memoryCache = this.getSeedIncidents();
        this.saveCache();
      }

      // 2. Open IndexedDB for durable local persistence
      if (typeof window === 'undefined' || !window.indexedDB) {
        this.isReady = true;
        resolve(false);
        return;
      }

      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('category', 'category', { unique: false });
            store.createIndex('severity', 'severity', { unique: false });
            store.createIndex('status', 'status', { unique: false });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };

        req.onsuccess = (e) => {
          this.db = e.target.result;
          this.isReady = true;
          this.syncFromIndexedDB();
          resolve(true);
        };

        req.onerror = () => {
          this.isReady = true;
          resolve(false);
        };
      } catch {
        this.isReady = true;
        resolve(false);
      }
    });
  }

  getSeedIncidents() {
    const baseTime = Date.now() - 3600000 * 3;
    return [
      {
        id: 'INC-2026-1001',
        category: 'Restricted Intrusion',
        title: 'Perimeter Breach: Restricted Turnstile Perimeter',
        description: 'Unauthorized subject entered restricted maintenance boundary near Cam 01 without security clearance.',
        camera: 'Cam 01: Live Entrance (Webcam)',
        zone: 'Restricted Turnstile Perimeter',
        confidence: 94,
        severity: 'Critical',
        status: 'Open',
        timestamp: new Date(baseTime + 1800000).toISOString(),
        evidence: '',
        operator: 'Unassigned',
        resolutionNotes: 'Awaiting dispatched officer verification on ground.',
        metricDetails: 'Track ID #104 | Dwell: 14s | Zone: Turnstile'
      },
      {
        id: 'INC-2026-1002',
        category: 'Overcrowding',
        title: 'Capacity Exceeded in Zone Bravo',
        description: 'Occupancy reached 18 persons exceeding nominal threshold of 12 at North Concourse.',
        camera: 'Cam 02: North Gate Main',
        zone: 'Zone Bravo - North Concourse',
        confidence: 97,
        severity: 'High',
        status: 'Investigating',
        timestamp: new Date(baseTime + 3600000).toISOString(),
        evidence: '',
        operator: 'Officer Aryan KS',
        resolutionNotes: 'Redirecting pedestrian flow to auxiliary turnstiles.',
        metricDetails: 'Count: 18 / Capacity: 12 (150% load)'
      },
      {
        id: 'INC-2026-1003',
        category: 'No ID Card',
        title: 'ID Card Violation at Checkpoint',
        description: 'Subject attempted transit through West Gate perimeter without institutional ID badge or lanyard.',
        camera: 'Cam 03: Sector 7 - West Gate',
        zone: 'Zone Charlie - West Checkpoint',
        confidence: 91,
        severity: 'Medium',
        status: 'Acknowledged',
        timestamp: new Date(baseTime + 5400000).toISOString(),
        evidence: '',
        operator: 'Desk Guard',
        resolutionNotes: 'Subject directed to Visitor Registration desk.',
        metricDetails: 'Missing badge & lanyard in upper chest ROI'
      },
      {
        id: 'INC-2026-1004',
        category: 'Loitering Alert',
        title: 'Suspicious Loitering in Central Dining Area',
        description: 'Individual lingering stationary for over 45 seconds near service exit without purchasing food.',
        camera: 'Cam 04: Sector 2 - Food Court',
        zone: 'Zone Delta - Central Dining',
        confidence: 89,
        severity: 'High',
        status: 'Resolved',
        timestamp: new Date(baseTime + 7200000).toISOString(),
        evidence: '',
        operator: 'Officer Aryan KS',
        resolutionNotes: 'Patrol confirmed individual was waiting for maintenance technician.',
        metricDetails: 'Dwell: 47s | Displacement: 22px'
      }
    ];
  }

  saveCache() {
    try {
      localStorage.setItem('ai_incidents_cache', JSON.stringify(this.memoryCache));
    } catch { /* storage full */ }
  }

  syncFromIndexedDB() {
    if (!this.db) return;
    try {
      const tx = this.db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        if (req.result && req.result.length > 0) {
          this.memoryCache = req.result.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          this.saveCache();
          this.notifyListeners();
        } else {
          // Push existing cache into IndexedDB
          this.syncToIndexedDB();
        }
      };
    } catch { /* fallback */ }
  }

  syncToIndexedDB() {
    if (!this.db) return;
    try {
      const tx = this.db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const item of this.memoryCache) {
        store.put(item);
      }
    } catch { /* ignore */ }
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners() {
    for (const cb of this.listeners) {
      try { cb(this.memoryCache); } catch { /* ignore */ }
    }
  }

  // Generate unique formatted incident ID
  generateId() {
    const yr = new Date().getFullYear();
    const id = `INC-${yr}-${this.idCounter++}`;
    return id;
  }

  /**
   * Add a new incident record
   */
  addIncident(data) {
    const record = {
      id: data.id || this.generateId(),
      category: data.category || 'General Anomaly',
      title: data.title || 'Security Anomaly Detected',
      description: data.description || 'Automated computer vision detection alert.',
      camera: data.camera || 'Edge Camera',
      zone: data.zone || 'Zone Alpha',
      confidence: data.confidence || 90,
      severity: data.severity || 'Medium', // Critical, High, Medium, Low
      status: data.status || 'Open',       // Open, Acknowledged, Investigating, Resolved
      timestamp: data.timestamp || new Date().toISOString(),
      evidence: data.evidence || '',
      operator: data.operator || 'Unassigned',
      resolutionNotes: data.resolutionNotes || '',
      metricDetails: data.metricDetails || ''
    };

    // Prepend to memory cache
    this.memoryCache.unshift(record);
    if (this.memoryCache.length > 300) {
      this.memoryCache.pop(); // keep latest 300 incidents
    }

    this.saveCache();

    // Persist to IndexedDB
    if (this.db) {
      try {
        const tx = this.db.transaction([STORE_NAME], 'readwrite');
        tx.objectStore(STORE_NAME).put(record);
      } catch { /* ignore */ }
    }

    this.notifyListeners();
    return record;
  }

  /**
   * Update status of an incident with audit notes
   */
  updateIncident(id, updates) {
    const item = this.memoryCache.find(i => i.id === id);
    if (!item) return null;

    Object.assign(item, updates);
    if (updates.status === 'Resolved' && !item.resolvedAt) {
      item.resolvedAt = new Date().toISOString();
    }

    this.saveCache();

    if (this.db) {
      try {
        const tx = this.db.transaction([STORE_NAME], 'readwrite');
        tx.objectStore(STORE_NAME).put(item);
      } catch { /* ignore */ }
    }

    this.notifyListeners();
    return item;
  }

  getIncidentById(id) {
    return this.memoryCache.find(i => i.id === id) || null;
  }

  /**
   * Query incidents with search and multi-criteria filters
   */
  getIncidents(filter = {}) {
    let results = [...this.memoryCache];

    if (filter.search) {
      const q = filter.search.toLowerCase();
      results = results.filter(i =>
        i.id.toLowerCase().includes(q) ||
        i.title.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q) ||
        i.zone.toLowerCase().includes(q) ||
        i.camera.toLowerCase().includes(q) ||
        (i.operator && i.operator.toLowerCase().includes(q))
      );
    }

    if (filter.category && filter.category !== 'all') {
      results = results.filter(i => i.category === filter.category);
    }

    if (filter.severity && filter.severity !== 'all') {
      results = results.filter(i => i.severity.toLowerCase() === filter.severity.toLowerCase());
    }

    if (filter.status && filter.status !== 'all') {
      results = results.filter(i => i.status.toLowerCase() === filter.status.toLowerCase());
    }

    if (filter.camera && filter.camera !== 'all') {
      results = results.filter(i => i.camera.includes(filter.camera));
    }

    if (filter.startDate) {
      const start = new Date(filter.startDate).getTime();
      results = results.filter(i => new Date(i.timestamp).getTime() >= start);
    }

    if (filter.endDate) {
      const end = new Date(filter.endDate).getTime() + 86400000;
      results = results.filter(i => new Date(i.timestamp).getTime() <= end);
    }

    return results;
  }

  /**
   * Aggregated statistics for dashboard cards & metrics
   */
  getStats() {
    const all = this.memoryCache;
    const total = all.length;
    const open = all.filter(i => i.status === 'Open').length;
    const acknowledged = all.filter(i => i.status === 'Acknowledged').length;
    const investigating = all.filter(i => i.status === 'Investigating').length;
    const resolved = all.filter(i => i.status === 'Resolved').length;

    const critical = all.filter(i => i.severity === 'Critical').length;
    const high = all.filter(i => i.severity === 'High').length;
    const medium = all.filter(i => i.severity === 'Medium').length;
    const low = all.filter(i => i.severity === 'Low').length;

    // Categories breakdown
    const categories = {};
    for (const i of all) {
      categories[i.category] = (categories[i.category] || 0) + 1;
    }

    // Zone breakdown
    const zones = {};
    for (const i of all) {
      zones[i.zone] = (zones[i.zone] || 0) + 1;
    }

    // Calculate Resolution Rate
    const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 100;

    return {
      total,
      open,
      acknowledged,
      investigating,
      resolved,
      critical,
      high,
      medium,
      low,
      categories,
      zones,
      resolutionRate
    };
  }

  exportCSV(filter = {}) {
    const list = this.getIncidents(filter);
    const headers = ['Incident ID', 'Timestamp', 'Category', 'Severity', 'Status', 'Camera', 'Zone', 'Confidence', 'Operator', 'Description', 'Resolution Notes'];
    const rows = list.map(i => [
      `"${i.id}"`,
      `"${new Date(i.timestamp).toLocaleString()}"`,
      `"${i.category}"`,
      `"${i.severity}"`,
      `"${i.status}"`,
      `"${i.camera}"`,
      `"${i.zone}"`,
      `"${i.confidence}%"`,
      `"${i.operator || 'Unassigned'}"`,
      `"${(i.description || '').replace(/"/g, '""')}"`,
      `"${(i.resolutionNotes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Security_Incidents_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
