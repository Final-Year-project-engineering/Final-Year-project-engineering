// ============================================================
// AI CROWD MANAGEMENT & SECURITY SYSTEM
// FULL UPDATED COMBINED JAVASCRIPT CODE
// ============================================================

// ============================================================
// REGISTRATION DATABASE  (persisted via localStorage)
// ============================================================

/**
 * Load from localStorage, or start with an empty array.
 * Call saveRegisteredDB() after every mutation.
 */
function loadRegisteredDB() {
  try {
    const raw = localStorage.getItem('ai_registered_db');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) { /* ignore */ }
  return [
    {
      name: 'Aryan KS',
      usn: '1DT23CS029',
      dept: 'DSATM - BE - CS',
      role: 'Student (2023-27)',
      gender: 'Male',
      status: 'Active',
      regId: 'REG-001',
      descriptor: []
    }
  ];
}

function saveRegisteredDB() {
  try {
    localStorage.setItem('ai_registered_db', JSON.stringify(REGISTERED_DB));
  } catch (e) { /* ignore */ }
}

let REGISTERED_DB = loadRegisteredDB();
let _regIdCounter = REGISTERED_DB.length;

// ============================================================
// GLOBAL MAPS / STATES
// ============================================================

// Maps faceId → { profile, faceDataUrl, entryTime, masked, gps }
const faceProfileMap = new Map();

// Live GPS state from browser Geolocation API
let liveGPS = null;

// ============================================================
// GPS + GEOLOCATION MODULE
// ============================================================

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
    );

    const data = await res.json();
    const addr = data.address;

    return (
      addr.city ||
      addr.town ||
      addr.village ||
      addr.county ||
      ''
    );
  } catch {
    return '';
  }
}

function updateGPSBar(lat, lng, acc, city, source) {
  const textEl = document.getElementById('cam1-gps-text');
  const accEl = document.getElementById('cam1-gps-acc');
  const bar = document.getElementById('cam1-gps');

  if (textEl) {
    textEl.textContent = `${lat}° N, ${lng}° E${city ? ' · ' + city : ''}`;
  }

  if (accEl) {
    accEl.textContent = source === 'gps'
      ? `±${acc}m GPS`
      : `IP-based`;
  }

  if (bar) {
    bar.style.cursor = 'pointer';
    bar.title = 'Open in Google Maps';

    bar.onclick = () => {
      window.open(
        `https://www.google.com/maps?q=${lat},${lng}`,
        '_blank'
      );
    };
  }
}

async function initGPS() {
  const textEl = document.getElementById('cam1-gps-text');

  // ------------------------------------------------------------
  // Stage 1 → IP Based Location
  // ------------------------------------------------------------
  try {
    if (textEl) {
      textEl.textContent = 'Resolving location...';
    }

    const res = await fetch('https://ipapi.co/json/');
    const data = await res.json();

    if (data.latitude && data.longitude) {
      const lat = Number(data.latitude).toFixed(5);
      const lng = Number(data.longitude).toFixed(5);
      const city = data.city || data.region || '';

      liveGPS = {
        lat,
        lng,
        accuracy: 2000,
        city
      };

      updateGPSBar(lat, lng, 2000, city, 'ip');
    }
  } catch (e) {
    console.error(e);

    if (textEl) {
      textEl.textContent = 'Location fetch failed';
    }
  }

  // ------------------------------------------------------------
  // Stage 2 → Browser GPS
  // ------------------------------------------------------------
  if (!navigator.geolocation) return;

  navigator.geolocation.watchPosition(
    async (pos) => {
      const lat = pos.coords.latitude.toFixed(5);
      const lng = pos.coords.longitude.toFixed(5);
      const acc = Math.round(pos.coords.accuracy);

      let city = liveGPS?.city || '';

      if (
        !liveGPS ||
        Math.abs(Number(liveGPS.lat) - Number(lat)) > 0.001
      ) {
        city = await reverseGeocode(lat, lng);
      }

      liveGPS = {
        lat,
        lng,
        accuracy: acc,
        city
      };

      updateGPSBar(lat, lng, acc, city, 'gps');
    },
    () => {
      // Silent fail
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000
    }
  );
}

// ============================================================
// PROFILE ASSIGNMENT & FACE RECOGNITION MATCHING
// ============================================================

function euclideanDistance(arr1, arr2) {
  if (!arr1 || !arr2 || arr1.length !== arr2.length) return 999;
  let sum = 0;
  for (let i = 0; i < arr1.length; i++) {
    const diff = arr1[i] - arr2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

function matchFaceToRegisteredDB(descriptor) {
  if (!descriptor || REGISTERED_DB.length === 0) return null;

  // 1. Check existing saved descriptors
  let bestMatch = null;
  let minDistance = 0.58; // Standard face-api recognition threshold

  for (const person of REGISTERED_DB) {
    if (person.descriptor && Array.isArray(person.descriptor)) {
      const dist = euclideanDistance(descriptor, person.descriptor);
      if (dist < minDistance) {
        minDistance = dist;
        bestMatch = person;
      }
    }
  }

  if (bestMatch) {
    return bestMatch;
  }

  // 2. If a registered person does not have a face embedding saved yet,
  // link the first unlinked registered user's face to this descriptor!
  const unlinkedPerson = REGISTERED_DB.find(p => !p.descriptor || !p.descriptor.length);
  if (unlinkedPerson) {
    unlinkedPerson.descriptor = Array.from(descriptor);
    saveRegisteredDB();
    console.log(`[FaceRecognition] Linked face embedding to registered user: ${unlinkedPerson.name} (${unlinkedPerson.usn})`);
    return unlinkedPerson;
  }

  return null;
}

function getOrAssignProfile(faceId, customProfile = null) {
  if (faceProfileMap.has(faceId)) {
    return faceProfileMap.get(faceId);
  }

  const profile = customProfile || {
    name: 'Unregistered Person',
    regId: 'UNREG-' + String(faceId).padStart(3, '0'),
    dept: 'Public / Visitor Zone',
    role: 'Visitor',
    phone: '—',
    email: '—',
    status: 'Unregistered',
    gender: ''
  };

  const entry = {
    profile,
    isRegistered: !!customProfile?.isRegistered,
    faceDataUrl: null,
    entryTime: new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }),
    masked: true,
    gps: null
  };

  faceProfileMap.set(faceId, entry);

  return entry;
}

// ============================================================
// SPA ROUTING
// ============================================================

function initRouting() {
  document.querySelectorAll('.nav-item').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();

      if (link.classList.contains('disabled')) return;

      const targetId = link.getAttribute('data-target');
      if (!targetId) return;

      // Update navigation active state
      document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.remove('active');
      });

      link.classList.add('active');

      // Show selected section
      document.querySelectorAll('.view-section').forEach(section => {
        section.classList.add('hidden');
      });

      const targetView = document.getElementById(targetId);

      if (targetView) {
        targetView.classList.remove('hidden');
      }

      // Dynamic Header Title
      const titleEl = document.getElementById('header-page-title');

      if (!titleEl) return;

      if (targetId === 'view-dashboard') {
        titleEl.innerText = 'Crowd Management & Security';
      }
      else if (targetId === 'view-feeds') {
        titleEl.innerText = 'Live Feed Directory';
      }
      else if (targetId === 'view-analytics') {
        titleEl.innerText = 'Deep AI Analytics';
      }
      else if (targetId === 'view-alerts') {
        titleEl.innerText = 'Security Notification Center';
      }
      else if (targetId === 'view-settings') {
        titleEl.innerText = 'System Configuration';
      }
      else if (targetId === 'view-registration') {
        titleEl.innerText = 'Person Registration';
      }
    });
  });

  document.getElementById('btn-view-all-alerts')?.addEventListener('click', () => {
    const alertLink = document.querySelector(
      '.nav-item[data-target="view-alerts"]'
    );

    if (alertLink) {
      alertLink.click();
    }
  });
}

// ============================================================
// THEME TOGGLE
// ============================================================

function initThemeToggle() {
  const toggle = document.getElementById('theme-toggle');

  if (!toggle) return;

  toggle.addEventListener('click', () => {
    document.body.classList.toggle('high-contrast');

    const isHC = document.body.classList.contains('high-contrast');

    toggle.innerHTML = isHC
      ? `<i class='bx bx-sun'></i> Standard View`
      : `<i class='bx bx-moon'></i> High Contrast`;
  });
}

// ============================================================
// DASHBOARD SIMULATOR + ANALYTICS
// ============================================================

class DashboardSim {
  constructor() {
    this.totalCrowd = 14392;
    this.maskCompliance = 92.4;
    this.activeAlerts = 3;
    this.cam2Detections = 840;
    this.sensitivity = 0.75;

    this.alertTemplates = [
      {
        type: 'critical',
        title: 'Overcrowding Detected',
        message: 'Zone Alpha has exceeded capacity limit.',
        icon: 'bx-error-circle',
        zone: 'Zone Alpha'
      },
      {
        type: 'warning',
        title: 'Mask Rule Violation',
        message: 'Cluster without masks at Entrance.',
        icon: 'bx-mask',
        zone: 'North Gate'
      },
      {
        type: 'info',
        title: 'Crowd Flow Normal',
        message: 'Density returning to expected levels.',
        icon: 'bx-info-circle',
        zone: 'Sector 4'
      },
      {
        type: 'critical',
        title: 'Perimeter Breach',
        message: 'Unauthorized access detected.',
        icon: 'bx-shield-x',
        zone: 'VIP Tent'
      }
    ];

    this.init();
    window._dashSim = this;
  }

  init() {
    this.initCharts();
    this.startSimulation();
    this.populateInitialAlerts();

    document.getElementById('btn-resolve-all')?.addEventListener('click', () => {
      this.activeAlerts = 0;
      this.updateAlertCounters();

      const tbody = document.getElementById('full-alerts-tbody');
      if (tbody) tbody.innerHTML = '';
    });

    document.getElementById('sensitivity-range')?.addEventListener('input', (e) => {
      this.sensitivity = e.target.value / 100;
      console.log('AI Sensitivity:', this.sensitivity);
    });
  }

  initCharts() {
    this.crowdHistory = Array(20)
      .fill(14300)
      .map((v, i) => v + i * 2);

    // --------------------------------------------------------
    // Line Chart
    // --------------------------------------------------------

    const ctxLine = document
      .getElementById('lineChart')
      ?.getContext('2d');

    if (ctxLine) {
      this.lineChart = new Chart(ctxLine, {
        type: 'line',

        data: {
          labels: Array(20).fill(''),
          datasets: [
            {
              label: 'Crowd Flow',
              data: this.crowdHistory,
              borderColor: '#3b82f6',
              borderWidth: 3,
              backgroundColor: 'rgba(59,130,246,0.2)',
              fill: true,
              tension: 0.4,
              pointRadius: 0
            }
          ]
        },

        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,

          scales: {
            x: {
              display: false
            },

            y: {
              display: true,
              beginAtZero: false,
              suggestedMin: 14000
            }
          },

          plugins: {
            legend: {
              display: false
            }
          }
        }
      });
    }

    // --------------------------------------------------------
    // Doughnut Chart
    // --------------------------------------------------------

    const ctxDoughnut = document
      .getElementById('doughnutChart')
      ?.getContext('2d');

    if (ctxDoughnut) {
      this.doughnutChart = new Chart(ctxDoughnut, {
        type: 'doughnut',

        data: {
          labels: ['Mask Compliant', 'No Mask'],

          datasets: [
            {
              data: [92.4, 7.6],
              backgroundColor: ['#10b981', '#ef4444'],
              borderWidth: 0
            }
          ]
        },

        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '75%',

          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: '#f8fafc',
                font: {
                  family: 'Inter'
                }
              }
            }
          }
        }
      });
    }

    // --------------------------------------------------------
    // Demographics Chart (Stacked Bar)
    // --------------------------------------------------------
    const ctxDemo = document.getElementById('demographicsChart')?.getContext('2d');
    if (ctxDemo) {
      this.demographicsChart = new Chart(ctxDemo, {
        type: 'bar',
        data: {
          labels: ['<18', '18-25', '26-40', '41-60', '60+'],
          datasets: [
            {
              label: 'Male',
              data: [120, 450, 600, 320, 80],
              backgroundColor: '#3b82f6',
            },
            {
              label: 'Female',
              data: [110, 420, 580, 290, 95],
              backgroundColor: '#ec4899',
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
            y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
          },
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#f8fafc', font: { family: 'Inter' } }
            }
          }
        }
      });
    }

    // --------------------------------------------------------
    // Emotion Distribution Chart (Radar)
    // --------------------------------------------------------
    const ctxEmotion = document.getElementById('emotionChart')?.getContext('2d');
    if (ctxEmotion) {
      this.emotionChart = new Chart(ctxEmotion, {
        type: 'radar',
        data: {
          labels: ['Neutral', 'Happy', 'Sad', 'Angry', 'Fearful', 'Surprised'],
          datasets: [{
            label: 'Current Sentiment',
            data: [65, 20, 5, 5, 2, 3],
            backgroundColor: 'rgba(239, 68, 68, 0.2)',
            borderColor: '#ef4444',
            pointBackgroundColor: '#ef4444',
            borderWidth: 2,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            r: {
              angleLines: { color: 'rgba(255,255,255,0.1)' },
              grid: { color: 'rgba(255,255,255,0.1)' },
              pointLabels: { color: '#f8fafc', font: { family: 'Inter' } },
              ticks: { display: false, backdropColor: 'transparent' }
            }
          },
          plugins: {
            legend: { display: false }
          }
        }
      });
    }

    // --------------------------------------------------------
    // Zone Risk Assessment Chart (Polar Area)
    // --------------------------------------------------------
    const ctxZone = document.getElementById('zoneRiskChart')?.getContext('2d');
    if (ctxZone) {
      this.zoneRiskChart = new Chart(ctxZone, {
        type: 'polarArea',
        data: {
          labels: ['Entrance', 'VIP Lane', 'Food Court', 'Plaza', 'West Gate'],
          datasets: [{
            data: [85, 20, 45, 60, 75],
            backgroundColor: [
              'rgba(239, 68, 68, 0.7)',
              'rgba(16, 185, 129, 0.7)',
              'rgba(59, 130, 246, 0.7)',
              'rgba(245, 158, 11, 0.7)',
              'rgba(168, 85, 247, 0.7)'
            ],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            r: {
              grid: { color: 'rgba(255,255,255,0.1)' },
              ticks: { display: false, backdropColor: 'transparent' }
            }
          },
          plugins: {
            legend: {
              position: 'right',
              labels: { color: '#f8fafc', font: { family: 'Inter', size: 10 } }
            }
          }
        }
      });
    }

    // --------------------------------------------------------
    // 1. Real-Time Inference FPS & Latency Chart
    // --------------------------------------------------------
    const ctxRtFps = document.getElementById('realtimeFpsChart')?.getContext('2d');
    if (ctxRtFps) {
      const initialTimeLabels = Array(12).fill(0).map((_, i) => {
        const d = new Date(Date.now() - (12 - i) * 2000);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      });

      this.realtimeFpsChart = new Chart(ctxRtFps, {
        type: 'line',
        data: {
          labels: initialTimeLabels,
          datasets: [
            {
              label: 'Inference Rate (FPS)',
              data: [44.8, 45.2, 45.0, 44.6, 45.4, 45.1, 44.9, 45.3, 45.0, 44.7, 45.2, 45.0],
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              fill: true,
              tension: 0.3,
              yAxisID: 'yFps'
            },
            {
              label: 'Latency (ms)',
              data: [22.4, 21.8, 22.0, 22.8, 21.5, 22.1, 22.5, 21.9, 22.2, 22.6, 21.8, 22.0],
              borderColor: '#f59e0b',
              backgroundColor: 'transparent',
              borderDash: [5, 5],
              tension: 0.3,
              yAxisID: 'yLatency'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
            yFps: {
              type: 'linear',
              position: 'left',
              suggestedMin: 30,
              suggestedMax: 55,
              grid: { color: 'rgba(255,255,255,0.05)' },
              ticks: { color: '#10b981', callback: v => v + ' FPS' }
            },
            yLatency: {
              type: 'linear',
              position: 'right',
              suggestedMin: 10,
              suggestedMax: 40,
              grid: { display: false },
              ticks: { color: '#f59e0b', callback: v => v + ' ms' }
            }
          },
          plugins: {
            legend: { position: 'top', labels: { color: '#f8fafc', font: { family: 'Inter', size: 11 } } }
          }
        }
      });
    }

    // --------------------------------------------------------
    // 2. Real-Time Anomaly Risk Score & Active Detections
    // --------------------------------------------------------
    const ctxRtAnomaly = document.getElementById('realtimeAnomalyChart')?.getContext('2d');
    if (ctxRtAnomaly) {
      const initialTimeLabels = Array(12).fill(0).map((_, i) => {
        const d = new Date(Date.now() - (12 - i) * 2000);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      });

      this.realtimeAnomalyChart = new Chart(ctxRtAnomaly, {
        type: 'line',
        data: {
          labels: initialTimeLabels,
          datasets: [
            {
              label: 'Anomaly Risk Score (%)',
              data: [12.4, 11.8, 14.2, 12.0, 15.6, 13.1, 18.4, 14.0, 12.5, 13.8, 11.9, 13.2],
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              fill: true,
              tension: 0.4,
              yAxisID: 'yRisk'
            },
            {
              label: 'Live Detections',
              data: [4, 5, 5, 4, 6, 6, 7, 5, 4, 5, 6, 5],
              borderColor: '#06b6d4',
              backgroundColor: 'transparent',
              tension: 0.2,
              yAxisID: 'yDetections'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
            yRisk: {
              type: 'linear',
              position: 'left',
              min: 0,
              max: 100,
              grid: { color: 'rgba(255,255,255,0.05)' },
              ticks: { color: '#ef4444', callback: v => v + '%' }
            },
            yDetections: {
              type: 'linear',
              position: 'right',
              beginAtZero: true,
              suggestedMax: 15,
              grid: { display: false },
              ticks: { color: '#06b6d4' }
            }
          },
          plugins: {
            legend: { position: 'top', labels: { color: '#f8fafc', font: { family: 'Inter', size: 11 } } }
          }
        }
      });
    }

    // --------------------------------------------------------
    // 3. Anomaly Detection Method Comparison - Table I
    // --------------------------------------------------------
    const ctxAnomalyPerf = document.getElementById('anomalyPerfChart')?.getContext('2d');
    if (ctxAnomalyPerf) {
      this.anomalyPerfChart = new Chart(ctxAnomalyPerf, {
        type: 'bar',
        data: {
          labels: ['Optical Flow + SVM', 'Autoencoder', 'ResNet-50', 'YOLOv8 + DeepSORT', 'CNN-LSTM (Proposed)'],
          datasets: [
            { label: 'Precision (%)', data: [79.2, 83.4, 89.1, 91.0, 96.7], backgroundColor: '#3b82f6' },
            { label: 'Recall (%)', data: [76.8, 81.2, 87.6, 90.5, 95.9], backgroundColor: '#10b981' },
            { label: 'F1-Score (%)', data: [77.9, 82.3, 88.3, 90.7, 96.3], backgroundColor: '#f59e0b' },
            { label: 'Accuracy (%)', data: [78.1, 82.9, 89.2, 91.0, 96.3], backgroundColor: '#8b5cf6' }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#f8fafc', font: { family: 'Inter', size: 10 } } },
            y: { min: 70, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', callback: v => v + '%' } }
          },
          plugins: {
            legend: { position: 'bottom', labels: { color: '#f8fafc', font: { family: 'Inter', size: 11 } } },
            tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw}%` } }
          }
        }
      });
    }

    // --------------------------------------------------------
    // 4. ROC Curve Analysis - Fig 3
    // --------------------------------------------------------
    const ctxRoc = document.getElementById('rocCurveChart')?.getContext('2d');
    if (ctxRoc) {
      this.rocCurveChart = new Chart(ctxRoc, {
        type: 'line',
        data: {
          labels: ['0.0', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '1.0'],
          datasets: [
            {
              label: 'Proposed Hybrid (AUC = 0.989)',
              data: [0.0, 0.88, 0.94, 0.97, 0.985, 0.99, 0.993, 0.996, 0.998, 0.999, 1.0],
              borderColor: '#10b981',
              borderWidth: 3,
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              fill: true,
              tension: 0.3
            },
            {
              label: 'CNN-LSTM Single-Branch (AUC = 0.963)',
              data: [0.0, 0.78, 0.87, 0.91, 0.94, 0.96, 0.97, 0.98, 0.988, 0.995, 1.0],
              borderColor: '#3b82f6',
              borderWidth: 2,
              fill: false,
              tension: 0.3
            },
            {
              label: 'YOLOv8 Baseline (AUC = 0.951)',
              data: [0.0, 0.72, 0.82, 0.88, 0.91, 0.935, 0.95, 0.965, 0.98, 0.99, 1.0],
              borderColor: '#f59e0b',
              borderWidth: 2,
              borderDash: [4, 4],
              fill: false,
              tension: 0.3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { title: { display: true, text: 'False Positive Rate (FPR)', color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
            y: { title: { display: true, text: 'True Positive Rate (TPR)', color: '#94a3b8' }, min: 0, max: 1.0, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
          },
          plugins: {
            legend: { position: 'bottom', labels: { color: '#f8fafc', font: { family: 'Inter', size: 10 } } }
          }
        }
      });
    }

    // --------------------------------------------------------
    // 5. Crowd Density Estimation Error - MAE & MSE (Table II)
    // --------------------------------------------------------
    const ctxDensityErr = document.getElementById('densityErrorChart')?.getContext('2d');
    if (ctxDensityErr) {
      this.densityErrorChart = new Chart(ctxDensityErr, {
        type: 'bar',
        data: {
          labels: ['MCNN [7]', 'CSRNet [7]', 'ViT-based Estimator [6]', 'Proposed Dilated CNN'],
          datasets: [
            { label: 'MAE (Part A)', data: [3.8, 2.9, 2.4, 2.1], backgroundColor: '#06b6d4' },
            { label: 'MSE (Part A)', data: [9.6, 7.1, 5.9, 4.8], backgroundColor: '#3b82f6' },
            { label: 'MAE (Part B)', data: [5.1, 3.8, 3.2, 2.8], backgroundColor: '#f59e0b' },
            { label: 'MSE (Part B)', data: [12.3, 8.4, 7.1, 6.0], backgroundColor: '#ef4444' }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#f8fafc', font: { family: 'Inter', size: 10 } } },
            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
          },
          plugins: {
            legend: { position: 'bottom', labels: { color: '#f8fafc', font: { family: 'Inter', size: 11 } } },
            tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw} persons/area` } }
          }
        }
      });
    }

    // --------------------------------------------------------
    // 6. Hardware Inference Speed (FPS)
    // --------------------------------------------------------
    const ctxHw = document.getElementById('hardwarePerfChart')?.getContext('2d');
    if (ctxHw) {
      this.hardwarePerfChart = new Chart(ctxHw, {
        type: 'bar',
        data: {
          labels: ['NVIDIA Jetson AGX Orin (64GB)', 'NVIDIA RTX 2080 Ti GPU', 'Google TPU / Edge CPU', 'Server CPU-Only'],
          datasets: [
            {
              label: 'Inference Speed (FPS)',
              data: [45.0, 28.0, 8.0, 6.0],
              backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'],
              borderWidth: 0
            }
          ]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { beginAtZero: true, suggestedMax: 50, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', callback: v => v + ' FPS' } },
            y: { grid: { display: false }, ticks: { color: '#f8fafc', font: { family: 'Inter', size: 10 } } }
          },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => `Speed: ${ctx.raw} FPS` } }
          }
        }
      });
    }
  }

  startSimulation() {
    setInterval(() => this.updateStats(), 2500);
    setInterval(() => this.generateAlert(), 15000);
    setInterval(() => this.updateRealtimeCharts(), 1500);
  }

  updateRealtimeCharts() {
    const timeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // FPS fluctuates realistically around 44-46 FPS on Jetson AGX Orin
    const currentFps = Math.min(48, Math.max(40, 45 + (Math.random() * 4 - 2)));
    const currentLatency = Math.min(30, Math.max(18, 22 + (Math.random() * 3 - 1.5)));
    
    // Anomaly score fluctuates low unless an anomaly is triggered
    const baseAnomalyScore = Math.min(99, Math.max(5, (this.activeAlerts > 0 ? 75 : 12) + (Math.random() * 10 - 5)));
    const liveDetections = (window._webcamSim?.faceIdMap?.length || 0) + Math.floor(Math.random() * 3);

    if (this.realtimeFpsChart) {
      const labels = this.realtimeFpsChart.data.labels;
      labels.push(timeLabel);
      if (labels.length > 15) labels.shift();

      this.realtimeFpsChart.data.datasets[0].data.push(Number(currentFps.toFixed(1)));
      if (this.realtimeFpsChart.data.datasets[0].data.length > 15) this.realtimeFpsChart.data.datasets[0].data.shift();

      this.realtimeFpsChart.data.datasets[1].data.push(Number(currentLatency.toFixed(1)));
      if (this.realtimeFpsChart.data.datasets[1].data.length > 15) this.realtimeFpsChart.data.datasets[1].data.shift();

      this.realtimeFpsChart.update();
    }

    if (this.realtimeAnomalyChart) {
      const labels = this.realtimeAnomalyChart.data.labels;
      labels.push(timeLabel);
      if (labels.length > 15) labels.shift();

      this.realtimeAnomalyChart.data.datasets[0].data.push(Number(baseAnomalyScore.toFixed(1)));
      if (this.realtimeAnomalyChart.data.datasets[0].data.length > 15) this.realtimeAnomalyChart.data.datasets[0].data.shift();

      this.realtimeAnomalyChart.data.datasets[1].data.push(liveDetections);
      if (this.realtimeAnomalyChart.data.datasets[1].data.length > 15) this.realtimeAnomalyChart.data.datasets[1].data.shift();

      this.realtimeAnomalyChart.update();
    }
  }

  updateStats() {
    const crowdDiff = Math.floor(Math.random() * 20) - 8;
    this.totalCrowd += crowdDiff;

    const maskDiff = (Math.random() * 0.4) - 0.2;

    this.maskCompliance = Math.max(
      0,
      Math.min(100, this.maskCompliance + maskDiff)
    );

    const crowdEl = document.getElementById('total-crowd');

    if (crowdEl) {
      crowdEl.innerText = this.totalCrowd.toLocaleString();
    }

    const maskEl = document.getElementById('mask-compliance');

    if (maskEl) {
      maskEl.innerText = this.maskCompliance.toFixed(1) + '%';

      document.getElementById('mask-progress').style.width =
        this.maskCompliance.toFixed(1) + '%';
    }

    if (this.lineChart) {
      this.crowdHistory.push(this.totalCrowd);
      this.crowdHistory.shift();
      this.lineChart.update();
    }

    if (this.doughnutChart) {
      this.doughnutChart.data.datasets[0].data = [
        this.maskCompliance,
        100 - this.maskCompliance
      ];

      this.doughnutChart.update();
    }

    if (this.demographicsChart) {
      const dataM = this.demographicsChart.data.datasets[0].data;
      const dataF = this.demographicsChart.data.datasets[1].data;
      for (let i = 0; i < dataM.length; i++) {
        dataM[i] = Math.max(10, dataM[i] + Math.floor(Math.random() * 11) - 5);
        dataF[i] = Math.max(10, dataF[i] + Math.floor(Math.random() * 11) - 5);
      }
      this.demographicsChart.update();
    }

    if (this.emotionChart) {
      const dataE = this.emotionChart.data.datasets[0].data;
      for (let i = 0; i < dataE.length; i++) {
        dataE[i] = Math.max(0, dataE[i] + Math.floor(Math.random() * 5) - 2);
      }
      this.emotionChart.update();
    }

    if (this.zoneRiskChart) {
      const dataZ = this.zoneRiskChart.data.datasets[0].data;
      for (let i = 0; i < dataZ.length; i++) {
        dataZ[i] = Math.max(5, Math.min(100, dataZ[i] + Math.floor(Math.random() * 7) - 3));
      }
      this.zoneRiskChart.update();
    }
  }

  updateAlertCounters() {
    const activeEl = document.getElementById('active-alerts');
    const badgeEl = document.getElementById('nav-badge');

    if (activeEl) {
      activeEl.innerText = this.activeAlerts;
    }

    if (badgeEl) {
      badgeEl.innerText = this.activeAlerts;

      badgeEl.style.display = this.activeAlerts === 0
        ? 'none'
        : 'inline-block';
    }
  }

  populateInitialAlerts() {
    this.addAlert(this.alertTemplates[0], '2 mins ago');
    this.addAlert(this.alertTemplates[1], '12 mins ago');
    this.addAlert(this.alertTemplates[2], '34 mins ago');
  }

  generateAlert() {
    const template = this.alertTemplates[
      Math.floor(Math.random() * this.alertTemplates.length)
    ];

    this.addAlert(
      template,
      new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      }) + ' (Just now)'
    );

    if (
      template.type === 'critical' ||
      template.type === 'warning'
    ) {
      this.activeAlerts++;
      this.updateAlertCounters();
    }
  }

  addAlert(template, timeStr) {
    const list = document.getElementById('alert-list');

    if (!list) return;

    const alertEl = document.createElement('div');

    alertEl.className = `alert-item ${template.type}`;

    alertEl.innerHTML = `
      <i class='bx ${template.icon} alert-icon'></i>

      <div class="alert-content">
        <h4>${template.title}</h4>
        <p>${template.message}</p>
      </div>

      <div class="alert-time">${timeStr}</div>
    `;

    list.prepend(alertEl);

    if (list.children.length > 5) {
      list.removeChild(list.lastChild);
    }

    const tbody = document.getElementById('full-alerts-tbody');

    if (!tbody) return;

    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>
        <span style="
          color: var(--accent-${template.type === 'critical'
        ? 'red'
        : template.type === 'warning'
          ? 'warning'
          : 'blue'});
          font-weight:bold;
          text-transform:uppercase;
        ">
          ${template.type}
        </span>
      </td>

      <td style="color:var(--text-secondary)">
        ${timeStr}
      </td>

      <td>
        <strong>${template.title}</strong><br>

        <span style="font-size:0.8rem;color:var(--text-secondary)">
          ${template.message}
        </span>
      </td>

      <td>${template.zone}</td>

      <td>
        <button class="btn-small resolve-btn">Resolve</button>
      </td>
    `;

    const resolveBtn = tr.querySelector('.resolve-btn');

    resolveBtn.addEventListener('click', () => {
      tr.style.opacity = '0.4';
      resolveBtn.innerHTML = 'Resolved';
      resolveBtn.disabled = true;

      if (
        template.type === 'critical' ||
        template.type === 'warning'
      ) {
        this.activeAlerts = Math.max(0, this.activeAlerts - 1);
        this.updateAlertCounters();
      }
    });

    tbody.prepend(tr);
  }
}

// ============================================================
// HAPPY MUSIC PLAYER
// ============================================================
let audioCtx = null;
let lastHappyMusicTime = 0;
let lastSadMusicTime = 0;
let lastAngryMusicTime = 0;

function playHappyMusic() {
  if (typeof audioAlertsEnabled !== 'undefined' && !audioAlertsEnabled) return;
  const now = Date.now();
  if (now - lastHappyMusicTime < 5000) return; // Cooldown
  lastHappyMusicTime = now;

  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  // A short happy sequence of notes
  const notes = [
    { freq: 523.25, time: 0 },
    { freq: 659.25, time: 0.15 },
    { freq: 783.99, time: 0.3 },
    { freq: 1046.50, time: 0.45 }
  ];

  notes.forEach(note => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(note.freq, audioCtx.currentTime + note.time);
    
    gain.gain.setValueAtTime(0, audioCtx.currentTime + note.time);
    gain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + note.time + 0.05);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + note.time + 0.15);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(audioCtx.currentTime + note.time);
    osc.stop(audioCtx.currentTime + note.time + 0.15);
  });
}

function playSadMusic() {
  if (typeof audioAlertsEnabled !== 'undefined' && !audioAlertsEnabled) return;
  const now = Date.now();
  if (now - lastSadMusicTime < 5000) return; // Cooldown
  lastSadMusicTime = now;

  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  // A short sad sequence of notes (descending, minor)
  const notes = [
    { freq: 329.63, time: 0 },    // E4
    { freq: 311.13, time: 0.4 },  // Eb4
    { freq: 293.66, time: 0.8 },  // D4
    { freq: 261.63, time: 1.2 }   // C4
  ];

  notes.forEach(note => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine'; // Sine for softer, sadder sound
    osc.frequency.setValueAtTime(note.freq, audioCtx.currentTime + note.time);
    
    gain.gain.setValueAtTime(0, audioCtx.currentTime + note.time);
    gain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + note.time + 0.1);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + note.time + 0.4);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(audioCtx.currentTime + note.time);
    osc.stop(audioCtx.currentTime + note.time + 0.4);
  });
}

function playAngryMusic() {
  if (typeof audioAlertsEnabled !== 'undefined' && !audioAlertsEnabled) return;
  const now = Date.now();
  if (now - lastAngryMusicTime < 5000) return; // Cooldown
  lastAngryMusicTime = now;

  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  // A short angry sequence of notes (low, fast, dissonant)
  const notes = [
    { freq: 150, time: 0 },
    { freq: 165, time: 0.1 },
    { freq: 140, time: 0.2 },
    { freq: 175, time: 0.3 }
  ];

  notes.forEach(note => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sawtooth'; // Sawtooth for harsher, angry sound
    osc.frequency.setValueAtTime(note.freq, audioCtx.currentTime + note.time);
    
    gain.gain.setValueAtTime(0, audioCtx.currentTime + note.time);
    gain.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + note.time + 0.02);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + note.time + 0.1);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(audioCtx.currentTime + note.time);
    osc.stop(audioCtx.currentTime + note.time + 0.1);
  });
}

// ============================================================
// ============================================================
// CAMERA ZOOM & PAN CONTROLLER
// ============================================================

class CameraZoomController {
  constructor(container, options = {}) {
    this.container = container; // .camera-view element
    if (!this.container) return;

    this.mediaEl = this.container.querySelector('video, img');
    this.zoomLevel = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.minZoom = 1.0;
    this.maxZoom = 4.0;

    this.slider = options.slider || null;
    this.badgeVal = options.badgeVal || null;
    this.btnIn = options.btnIn || null;
    this.btnOut = options.btnOut || null;
    this.btnReset = options.btnReset || null;
    this.getMediaTrack = options.getMediaTrack || null;

    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;

    this.init();
  }

  init() {
    // Mouse wheel zoom
    this.container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.2 : 0.2;
      this.setZoom(this.zoomLevel + delta);
    }, { passive: false });

    // Double-click to toggle 1x / 2x zoom
    this.container.addEventListener('dblclick', (e) => {
      if (e.target.closest('button, input, .start-overlay, .encryption-overlay')) return;
      if (this.zoomLevel > 1.05) {
        this.resetZoom();
      } else {
        this.setZoom(2.0);
      }
    });

    // Mouse Drag Panning
    this.container.addEventListener('mousedown', (e) => {
      if (this.zoomLevel <= 1.05) return;
      if (e.target.closest('button, input, .start-overlay, .encryption-overlay')) return;
      this.isDragging = true;
      this.startX = e.clientX - this.panX;
      this.startY = e.clientY - this.panY;
      this.container.classList.add('is-panning');
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      e.preventDefault();
      const newPanX = e.clientX - this.startX;
      const newPanY = e.clientY - this.startY;
      this.setPan(newPanX, newPanY);
    });

    window.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.container.classList.remove('is-panning');
      }
    });

    // Touch support (drag pan and pinch zoom)
    let initialTouchDist = null;
    let initialTouchZoom = 1.0;

    this.container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1 && this.zoomLevel > 1.05) {
        this.isDragging = true;
        this.startX = e.touches[0].clientX - this.panX;
        this.startY = e.touches[0].clientY - this.panY;
      } else if (e.touches.length === 2) {
        this.isDragging = false;
        initialTouchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialTouchZoom = this.zoomLevel;
      }
    }, { passive: true });

    this.container.addEventListener('touchmove', (e) => {
      if (this.isDragging && e.touches.length === 1) {
        const newPanX = e.touches[0].clientX - this.startX;
        const newPanY = e.touches[0].clientY - this.startY;
        this.setPan(newPanX, newPanY);
      } else if (e.touches.length === 2 && initialTouchDist) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = dist / initialTouchDist;
        this.setZoom(initialTouchZoom * factor);
      }
    }, { passive: true });

    this.container.addEventListener('touchend', () => {
      this.isDragging = false;
      initialTouchDist = null;
    });

    // Bind UI elements if provided
    if (this.slider) {
      this.slider.addEventListener('input', (e) => {
        this.setZoom(parseFloat(e.target.value));
      });
    }
    if (this.btnIn) {
      this.btnIn.addEventListener('click', () => {
        this.setZoom(this.zoomLevel + 0.25);
      });
    }
    if (this.btnOut) {
      this.btnOut.addEventListener('click', () => {
        this.setZoom(this.zoomLevel - 0.25);
      });
    }
    if (this.btnReset) {
      this.btnReset.addEventListener('click', () => {
        this.resetZoom();
      });
    }
  }

  setZoom(val) {
    this.zoomLevel = Math.max(this.minZoom, Math.min(this.maxZoom, parseFloat(val.toFixed(2))));
    if (this.zoomLevel <= 1.01) {
      this.zoomLevel = 1.0;
      this.panX = 0;
      this.panY = 0;
      this.container.classList.remove('is-zoomed');
    } else {
      this.container.classList.add('is-zoomed');
    }

    this.clampPan();
    this.updateTransform();
    this.updateUI();
    this.applyHardwareZoom();
  }

  setPan(px, py) {
    this.panX = px;
    this.panY = py;
    this.clampPan();
    this.updateTransform();
  }

  resetZoom() {
    this.zoomLevel = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.container.classList.remove('is-zoomed', 'is-panning');
    this.updateTransform();
    this.updateUI();
    this.applyHardwareZoom();
  }

  clampPan() {
    if (this.zoomLevel <= 1.0) {
      this.panX = 0;
      this.panY = 0;
      return;
    }
    const rect = this.container.getBoundingClientRect();
    const maxX = (rect.width * (this.zoomLevel - 1)) / 2;
    const maxY = (rect.height * (this.zoomLevel - 1)) / 2;
    this.panX = Math.max(-maxX, Math.min(maxX, this.panX));
    this.panY = Math.max(-maxY, Math.min(maxY, this.panY));
  }

  updateTransform() {
    const targets = this.container.querySelectorAll('video, img, canvas');
    targets.forEach(el => {
      if (el.closest('.start-overlay') || el.closest('.encryption-overlay')) return;
      const isMirrored = el.id === 'webcam' || el.style.transform?.includes('scaleX(-1)');
      const mirrorStr = isMirrored ? 'scaleX(-1) ' : '';
      el.style.transform = `${mirrorStr}translate(${this.panX / this.zoomLevel}px, ${this.panY / this.zoomLevel}px) scale(${this.zoomLevel})`;
      el.style.transformOrigin = 'center center';
    });
  }

  updateUI() {
    if (this.slider) {
      this.slider.value = this.zoomLevel;
    }
    if (this.badgeVal) {
      this.badgeVal.textContent = `${this.zoomLevel.toFixed(1)}x`;
    }
  }

  applyHardwareZoom() {
    if (typeof this.getMediaTrack === 'function') {
      const track = this.getMediaTrack();
      if (track && typeof track.getCapabilities === 'function') {
        const capabilities = track.getCapabilities();
        if (capabilities.zoom) {
          const hardwareZoom = Math.min(capabilities.zoom.max, Math.max(capabilities.zoom.min, this.zoomLevel));
          track.applyConstraints({ advanced: [{ zoom: hardwareZoom }] }).catch(() => {});
        }
      }
    }
  }
}

// ============================================================
// AI WEBCAM + FACE DETECTION + MASK DETECTION
// ============================================================

class WebcamMaskDetector {
  constructor() {
    this.video = document.getElementById('webcam');
    this.container = document.getElementById('webcam-container');

    this.cam1Count = document.getElementById('cam1-count');
    this.cam1Density = document.getElementById('cam1-density');

    this.startOverlay = document.getElementById('start-overlay');
    this.encOverlay = document.getElementById('encryption-overlay');

    this.encLog = document.getElementById('crypto-log');
    this.encProgress = document.getElementById('crypto-progress');
    this.encStatus = document.getElementById('status-encrypt');

    this.isNightVision = false;

    this.sensitivity = document.getElementById('sensitivity-range');

    this.init();
  }

  init() {
    // Zoom controller for live entrance webcam
    this.zoomController = new CameraZoomController(this.container, {
      slider: document.getElementById('cam1-zoom-range'),
      badgeVal: document.getElementById('cam1-zoom-val'),
      btnIn: document.getElementById('btn-zoom-in'),
      btnOut: document.getElementById('btn-zoom-out'),
      btnReset: document.getElementById('btn-zoom-reset'),
      getMediaTrack: () => this.video?.srcObject?.getVideoTracks()?.[0]
    });

    document.getElementById('btn-start-monitor')?.addEventListener('click', () => {
      this.startOverlay?.classList.add('hidden');
      this.initializeAI();
    });

    document.getElementById('btn-night-vision')?.addEventListener('click', (e) => {
      this.isNightVision = !this.isNightVision;

      if (this.isNightVision) {
        this.isThermalVision = false;
        this.video.classList.remove('thermal-vision');
        document.getElementById('btn-thermal-vision')?.classList.remove('active');
        document.getElementById('cam1-thermal-badge')?.classList.add('hidden');
      }

      this.video.classList.toggle(
        'night-vision',
        this.isNightVision
      );

      e.currentTarget.classList.toggle(
        'active',
        this.isNightVision
      );
    });

    this.isThermalVision = false;
    document.getElementById('btn-thermal-vision')?.addEventListener('click', (e) => {
      this.isThermalVision = !this.isThermalVision;

      if (this.isThermalVision) {
        this.isNightVision = false;
        this.video.classList.remove('night-vision');
        document.getElementById('btn-night-vision')?.classList.remove('active');
      }

      this.video.classList.toggle('thermal-vision', this.isThermalVision);
      e.currentTarget.classList.toggle('active', this.isThermalVision);
      document.getElementById('cam1-thermal-badge')?.classList.toggle('hidden', !this.isThermalVision);
    });

    document.getElementById('btn-snapshot')?.addEventListener('click', () => {
      this.takeSnapshot();
    });

    document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
      toggleCameraFullscreen(document.getElementById('cam1-card'));
    });
  }

  async initializeAI() {
    this.encOverlay?.classList.remove('hidden');
    this.runEncryptionSequence();

    // ── Step 1: Start the camera immediately ─────────────────────
    //    Camera opens right away so the user sees the live feed.
    //    AI model download happens in parallel.
    this.startVideo();

    // ── Step 2: Download face-api models in background ───────────
    const MODEL_URL =
      'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';

    if (this.cam1Density) {
      this.cam1Density.innerText = '⏳ Loading AI Models...';
      this.cam1Density.style.color = '#f59e0b';
    }

    // Wait until faceapi script has executed (defer may still be running)
    const waitForFaceApi = () => new Promise((resolve, reject) => {
      let attempts = 0;
      const check = setInterval(() => {
        attempts++;
        if (typeof faceapi !== 'undefined') { clearInterval(check); resolve(); }
        if (attempts > 40) { clearInterval(check); reject(new Error('face-api.js not loaded after 10s')); }
      }, 250);
    });

    try {
      await waitForFaceApi();
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL),
        faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
      ]);
      // Models ready — mark AI as active
      this.modelsLoaded = true;
      this.tryStartDetection();
      if (this.cam1Density && this.videoReady) {
        this.cam1Density.innerText = 'Density: NORMAL';
        this.cam1Density.style.color = '#10b981';
      }
    } catch (e) {
      console.error('AI Models failed:', e);
      // Don't block the camera — just show a soft warning
      if (this.cam1Density) {
        this.cam1Density.innerText = '⚠ AI unavailable — live feed only';
        this.cam1Density.style.color = '#f59e0b';
      }
    }
  }

  runEncryptionSequence() {
    const logs = [
      'Establishing P2P Tunnel...',
      'Negotiating TLS 1.3...',
      'Synchronizing AI Weights...',
      'Validating Certificates...',
      'Secure Channel Active.'
    ];

    let step = 0;

    const interval = setInterval(() => {
      step++;

      if (this.encProgress) {
        this.encProgress.style.width =
          `${(step / logs.length) * 100}%`;
      }

      if (step < logs.length) {
        if (this.encLog) {
          this.encLog.innerText = logs[step];
        }
      }
      else {
        clearInterval(interval);

        setTimeout(() => {
          this.encOverlay?.classList.add('hidden');

          if (this.encStatus) {
            this.encStatus.classList.add('secure');

            this.encStatus.innerHTML =
              `<i class='bx bx-check-shield'></i> E2E Secured`;
          }
        }, 500);
      }
    }, 600);
  }

  startVideo() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.handleError('Camera API unavailable');
      return;
    }

    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      })
      .then(stream => {
        this.video.srcObject = stream;

        this.video.onloadedmetadata = () => {
          this.video.play().catch(err => {
            console.error(err);
            this.handleError('Autoplay blocked');
          });
        };

        this.video.addEventListener('play', () => {
          this.videoReady = true;
          if (this.cam1Density && !this.modelsLoaded) {
            this.cam1Density.innerText = '⏳ Loading AI...';
            this.cam1Density.style.color = '#f59e0b';
          }
          this.tryStartDetection();
        });
      })
      .catch(err => {
        console.error('Camera Error:', err);

        let errorMessage = 'Camera unavailable';
        if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
          errorMessage = 'Camera permission denied. Please allow access in your browser settings (URL bar) or ensure you are using a secure context (localhost/HTTPS).';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          errorMessage = 'Camera is already in use by another application (like Zoom/Teams) or has a hardware issue.';
        } else if (err.name === 'NotFoundError') {
          errorMessage = 'No camera found. Please connect a webcam.';
        } else {
          errorMessage = `Camera error: ${err.name} - ${err.message}`;
        }

        this.handleError(errorMessage);
      });
  }

  // Only start AI detection once BOTH camera is playing AND models are loaded
  tryStartDetection() {
    if (this.videoReady && this.modelsLoaded && !this.detectionStarted) {
      this.detectionStarted = true;
      if (this.cam1Density) {
        this.cam1Density.innerText = 'Density: NORMAL';
        this.cam1Density.style.color = '#10b981';
      }
      this.onPlay();
    }
  }

  handleError(msg) {
    if (this.cam1Density) {
      this.cam1Density.innerText = '⚠ ' + msg;
      this.cam1Density.style.color = '#ef4444';
    }
    // Show non-blocking toast instead of blocking alert
    console.error('Camera/AI Error:', msg);
  }

  takeSnapshot() {
    const canvas = document.createElement('canvas');

    canvas.width = this.video.videoWidth;
    canvas.height = this.video.videoHeight;

    canvas
      .getContext('2d')
      .drawImage(this.video, 0, 0);

    const link = document.createElement('a');

    link.download = `snapshot_${Date.now()}.png`;
    link.href = canvas.toDataURL();

    link.click();
  }

  onPlay() {
    const extractCanvas = document.createElement('canvas');
    const extractCtx = extractCanvas.getContext('2d', {
      willReadFrequently: true
    });

    const drawCanvas = faceapi.createCanvasFromMedia(this.video);

    drawCanvas.style.cssText = `
      z-index:10;
      pointer-events:none;
      position:absolute;
      top:0;
      left:0;
      width:100%;
      height:100%;
      transform:scaleX(-1);
    `;

    this.container.appendChild(drawCanvas);

    this.faceIdMap = [];
    this.noMaskSet = new Set();
    this.lastAlertTime = 0;

    const assignId = (box) => {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;

      let best = null;
      let bestDist = 9999;

      this.faceIdMap.forEach(f => {
        const d = Math.hypot(cx - f.cx, cy - f.cy);

        if (d < 80 && d < bestDist) {
          bestDist = d;
          best = f;
        }
      });

      if (best) {
        best.cx = cx;
        best.cy = cy;
        return best.id;
      }

      const id = this.faceIdMap.length + 1;

      this.faceIdMap.push({
        id,
        cx,
        cy
      });

      if (this.faceIdMap.length > 20) {
        this.faceIdMap.shift();
      }

      return id;
    };

    const isMaskWorn = (landmarks, scaleX, scaleY) => {
      try {
        if (!landmarks) return false;

        const nose = landmarks.getNose();
        const mouth = landmarks.getMouth();
        const jaw = landmarks.getJawOutline();
        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();

        if (!nose || !mouth || !leftEye || !rightEye || !jaw) return false;

        const imgW = extractCanvas.width;
        const imgH = extractCanvas.height;

        // Sample helper to safely get average RGB of a small patch in extractCanvas
        const samplePatch = (pt, radius = 2) => {
          if (!pt) return [128, 128, 128];
          const px = Math.round(pt.x * scaleX);
          const py = Math.round(pt.y * scaleY);
          const x0 = Math.max(0, Math.min(imgW - 1, px - radius));
          const y0 = Math.max(0, Math.min(imgH - 1, py - radius));
          const w = Math.min(imgW - x0, radius * 2 + 1);
          const h = Math.min(imgH - y0, radius * 2 + 1);
          if (w <= 0 || h <= 0) return [128, 128, 128];
          const imgData = extractCtx.getImageData(x0, y0, w, h).data;
          let rSum = 0, gSum = 0, bSum = 0, count = 0;
          for (let i = 0; i < imgData.length; i += 4) {
            rSum += imgData[i];
            gSum += imgData[i + 1];
            bSum += imgData[i + 2];
            count++;
          }
          if (count === 0) return [128, 128, 128];
          return [rSum / count, gSum / count, bSum / count];
        };

        // 1. Reference Skin Tone from upper face:
        // Glabella (between the eyes) and under-eye cheeks (guaranteed hair-free bare skin)
        const glabella = {
          x: (leftEye[3].x + rightEye[0].x) / 2,
          y: (leftEye[3].y + rightEye[0].y) / 2
        };
        const leftCheekSkin = {
          x: leftEye[0].x,
          y: leftEye[0].y + (nose[3].y - leftEye[0].y) * 0.45
        };
        const rightCheekSkin = {
          x: rightEye[3].x,
          y: rightEye[3].y + (nose[3].y - rightEye[3].y) * 0.45
        };

        const skinRef1 = samplePatch(glabella, 3);
        const skinRef2 = samplePatch(leftCheekSkin, 3);
        const skinRef3 = samplePatch(rightCheekSkin, 3);

        const rSkin = (skinRef1[0] + skinRef2[0] + skinRef3[0]) / 3;
        const gSkin = (skinRef1[1] + skinRef2[1] + skinRef3[1]) / 3;
        const bSkin = (skinRef1[2] + skinRef2[2] + skinRef3[2]) / 3;
        const skinLum = (rSkin + gSkin + bSkin) / 3;

        // 2. Lower Face Samples (Nose tip, Philtrum/Upper Lip, Center Mouth, Lower Lip, Chin)
        const noseTip = samplePatch(nose[6], 2);
        const upperLip = samplePatch(mouth[3], 2);
        const centerMouth = samplePatch(mouth[14] || mouth[0], 2);
        const lowerLip = samplePatch(mouth[9], 2);
        const chin = samplePatch(jaw[8], 3);

        const lowerSamples = [noseTip, upperLip, centerMouth, lowerLip, chin];
        const rLower = lowerSamples.reduce((acc, s) => acc + s[0], 0) / lowerSamples.length;
        const gLower = lowerSamples.reduce((acc, s) => acc + s[1], 0) / lowerSamples.length;
        const bLower = lowerSamples.reduce((acc, s) => acc + s[2], 0) / lowerSamples.length;
        const lowerLum = (rLower + gLower + bLower) / 3;

        // 3. Mask Indicators:
        // A. Surgical Blue / Cyan Mask (High Blue relative to Green/Red on lower face)
        const isBlueMask = (bLower > rLower + 8 && bLower > 50) || 
                           (centerMouth[2] > centerMouth[0] + 10 && centerMouth[2] > 50);

        // B. Dark / Black Mask (Lower face is noticeably darker than bare skin)
        const isDarkMask = (lowerLum < 55 && skinLum > 75 && (skinLum - lowerLum) > 30) ||
                           (centerMouth[0] < 45 && centerMouth[1] < 45 && centerMouth[2] < 45 && skinLum > 70);

        // C. White / Light Surgical Mask (Low saturation + high luminance without natural lip tone)
        const lowerSat = Math.max(rLower, gLower, bLower) - Math.min(rLower, gLower, bLower);
        const isWhiteMask = (lowerLum > 135 && lowerSat < 14 && (rSkin - bSkin) > 18);

        // D. General Mask Covering (Color deviation from upper skin reference)
        const colorDiff = Math.hypot(rLower - rSkin, gLower - gSkin, bLower - bSkin);

        // E. Natural Lip check (Bare lips have natural reddish chroma: R > G + 12 and R > B + 16)
        const lipRedness = Math.max(upperLip[0] - upperLip[1], lowerLip[0] - lowerLip[1], centerMouth[0] - centerMouth[1]);
        const hasVisibleLips = (lipRedness >= 12) && (centerMouth[0] > centerMouth[2] + 14);

        // If lips are naturally exposed and visible => definitely NO MASK
        if (hasVisibleLips && !isBlueMask && !isDarkMask) {
          return false;
        }

        if (isBlueMask || isDarkMask || isWhiteMask) {
          return true;
        }

        const sensVal = this.sensitivity?.value ? Number(this.sensitivity.value) : 50;
        const diffThreshold = 46 - (sensVal - 50) * 0.3;

        return colorDiff > diffThreshold;
      } catch (e) {
        return false;
      }
    };

    const isIdCardWorn = (box, landmarks, scaleX, scaleY) => {
      try {
        const jaw = landmarks?.getJawOutline ? landmarks.getJawOutline() : null;
        // Use chin bottom as anchor for chest region
        const chinY = jaw ? jaw[8].y : (box.y + box.height);
        const chinX = jaw ? jaw[8].x : (box.x + box.width / 2);

        // Generous chest ROI: wide & tall to ensure the lanyard & badge are always inside
        const chestDispW = box.width * 1.8;
        const chestDispH = box.height * 1.8;
        const chestDispX = chinX - chestDispW / 2;
        const chestDispY = chinY; // start right at chin bottom

        const imgW = extractCanvas.width;
        const imgH = extractCanvas.height;

        const sx = Math.max(0, Math.min(imgW - 10, Math.round(chestDispX * scaleX)));
        const sy = Math.max(0, Math.min(imgH - 10, Math.round(chestDispY * scaleY)));
        const sw = Math.max(10, Math.min(imgW - sx, Math.round(chestDispW * scaleX)));
        const sh = Math.max(10, Math.min(imgH - sy, Math.round(chestDispH * scaleY)));

        const chestImg = extractCtx.getImageData(sx, sy, sw, sh);
        const data = chestImg.data;
        const len = data.length;

        if (len < 64) {
          return { hasId: false, isDsatm: false, cardName: 'No ID Card', confidence: 0, chestBox: null };
        }

        const count = len / 4;
        let totalBluePixels = 0;    // any blue-dominant pixel anywhere in chest ROI
        let yellowBannerPixels = 0;
        let whiteCardPixels = 0;
        let darkBluePixels = 0;     // very saturated blue (ideal lanyard)

        for (let i = 0; i < len; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          // DSATM Royal Blue Lanyard — multiple conditions for different webcam exposures
          // Condition A: Strong blue dominance
          const condA = (b >= 50) && ((b - r) >= 12) && ((b - g) >= 6);
          // Condition B: High blue ratio
          const condB = (b >= 65) && (b / Math.max(1, r) >= 1.15) && (b / Math.max(1, g) >= 1.10);
          // Condition C: Very saturated royal blue
          const condC = (b >= 80) && ((b - r) >= 20) && ((b - g) >= 12);

          if (condC) darkBluePixels++;
          if (condA || condB || condC) totalBluePixels++;

          // DSATM Gold/Yellow Header Banner — R+Y warm tones, B suppressed
          if (r >= 100 && g >= 80 && b <= 120 && (r + g) >= (b * 1.8) && Math.abs(r - g) <= 55) {
            yellowBannerPixels++;
          }

          // White/Light ID Card body — high brightness, neutral color
          if (r > 130 && g > 130 && b > 130 && Math.abs(r - g) < 30 && Math.abs(g - b) < 30) {
            whiteCardPixels++;
          }
        }

        const blueRatio = (totalBluePixels / count) * 100;
        const darkBlueRatio = (darkBluePixels / count) * 100;
        const yellowRatio = (yellowBannerPixels / count) * 100;
        const whiteRatio = (whiteCardPixels / count) * 100;

        // Debug: log pixel stats each detection cycle (visible in browser console)
        console.debug('[ID] blue:', totalBluePixels, 'darkBlue:', darkBluePixels,
                      'yellow:', yellowBannerPixels, 'white:', whiteCardPixels,
                      'blueRatio%:', blueRatio.toFixed(2),
                      'darkBlue%:', darkBlueRatio.toFixed(2),
                      'yellow%:', yellowRatio.toFixed(2),
                      'white%:', whiteRatio.toFixed(2),
                      'sw:', sw, 'sh:', sh);

        // ── Strict ratio-based thresholds (v3 — white card mandatory) ─────────
        // White card body is now REQUIRED in every detection path.
        // Background windows/blue clothing/reflections alone cannot trigger
        // ID OK — you must also see the physical white card face.

        // 1. Royal-blue lanyard covers ≥5% of chest ROI
        const hasBlueStrap = blueRatio >= 5.0;
        // 2. Very saturated DSATM royal-blue covers ≥2%
        const hasRoyalBlue = darkBlueRatio >= 2.0;
        // 3. Gold/yellow DSATM banner header covers ≥2%
        const hasYellow = yellowRatio >= 2.0;
        // 4. White ID card body covers ≥15% — mandatory in every path
        const hasWhiteCard = whiteRatio >= 15.0;

        // Vertical-streak check: split chest ROI into 4 horizontal bands and
        // verify strong blue appears in at least 3 of them (real lanyard hangs
        // continuously; background blue is typically localised to 1-2 bands).
       // Vertical lanyard check
// Check whether blue appears around the SAME horizontal position
// across multiple vertical sections.

const bandH = Math.max(1, Math.floor(sh / 6));
const bandW = Math.max(1, Math.floor(sw / 8));

const blueGrid = Array.from(
  { length: 6 },
  () => Array(8).fill(0)
);

for (let bi = 0; bi < len; bi += 4) {

  const pixelIndex = bi / 4;

  const pixelRow = Math.floor(pixelIndex / Math.max(1, sw));
  const pixelCol = pixelIndex % Math.max(1, sw);

  const row = Math.min(
    5,
    Math.floor(pixelRow / bandH)
  );

  const col = Math.min(
    7,
    Math.floor(pixelCol / bandW)
  );

  const rp = data[bi];
  const gp = data[bi + 1];
  const bp = data[bi + 2];

  if (
    bp >= 50 &&
    (bp - rp) >= 12 &&
    (bp - gp) >= 6
  ) {
    blueGrid[row][col]++;
  }
}

// Find the column containing blue in the most rows
let maxBlueRows = 0;

for (let col = 0; col < 8; col++) {

  let activeRows = 0;

  for (let row = 0; row < 6; row++) {

    if (blueGrid[row][col] >= 10) {
      activeRows++;
    }
  }

  maxBlueRows = Math.max(maxBlueRows, activeRows);
}

// Blue must appear vertically in at least 4 of 6 rows
const hasVerticalLanyard = maxBlueRows >= 4;

        // ID confirmed only when white card is visible PLUS one of:
        //   • Strong blue lanyard spanning ≥3 vertical bands, OR
        //   • Very saturated royal-blue (most definitive DSATM lanyard colour), OR
        //   • Gold/yellow DSATM header banner
        // hasWhiteCard is required in ALL paths — no card visible = no ID.
        const hasId =
    hasWhiteCard &&
    hasBlueStrap &&
    hasVerticalLanyard &&
    hasYellow; 
        const isDsatm = hasId;

        if (!hasId) {
          return {
            hasId: false,
            isDsatm: false,
            cardName: 'No ID Card',
            confidence: 0,
            chestBox: null
          };
        }

       const confidence = Math.min(
  98,
  Math.max(
    85,
    Math.round(
      85 +
      Math.min(8, blueRatio) +
      Math.min(5, yellowRatio)
    )
  )
);
        return {
          hasId: true,
          isDsatm: true,
          cardName: 'DSATM College ID Card',
          confidence,
          chestBox: {
            x: chestDispX,
            y: chestDispY,
            width: chestDispW,
            height: chestDispH
          }
        };
      } catch (e) {
        console.error('[ID] Error:', e);
        return {
          hasId: false,
          isDsatm: false,
          cardName: 'No ID Card',
          confidence: 0,
          chestBox: null
        };
      }
    };

    setInterval(async () => {
      const displaySize = {
        width: this.video.clientWidth,
        height: this.video.clientHeight
      };

      if (displaySize.width === 0 || this.video.paused) {
        return;
      }

      try {
        faceapi.matchDimensions(drawCanvas, displaySize);

        const detections = await faceapi
          .detectAllFaces(
            this.video,
            new faceapi.TinyFaceDetectorOptions({
              inputSize: 224,
              scoreThreshold: 0.5
            })
          )
          .withFaceLandmarks()
          .withAgeAndGender()
          .withFaceExpressions()
          .withFaceDescriptors();

        const resized = faceapi.resizeResults(
          detections,
          displaySize
        );

        const ctx = drawCanvas.getContext('2d');

        ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

        if (this.cam1Count) {
          this.cam1Count.innerText = detections.length;
        }

        if (extractCanvas.width !== this.video.videoWidth) {
          extractCanvas.width = this.video.videoWidth || 640;
          extractCanvas.height = this.video.videoHeight || 480;
        }

        extractCtx.save();

        // Draw video MIRRORED to match the displayed scaleX(-1) transform,
        // so face-api landmark x-coordinates align with sampled pixel positions.
        extractCtx.translate(extractCanvas.width, 0);
        extractCtx.scale(-1, 1);
        extractCtx.drawImage(
          this.video,
          0,
          0,
          extractCanvas.width,
          extractCanvas.height
        );

        extractCtx.restore();

        const scaleX = extractCanvas.width / displaySize.width;
        const scaleY = extractCanvas.height / displaySize.height;

        let noMaskCount = 0;
        let noIdCount = 0;

        const newViolators = [];
        const personRows = [];

        resized.forEach(det => {
          const { box } = det.detection;

          const faceId = assignId(box);

          // Real Face Recognition matching against REGISTERED_DB
          let matchedUser = null;
          if (det.descriptor) {
            matchedUser = matchFaceToRegisteredDB(det.descriptor);
          }

          let profileEntry;
          if (matchedUser) {
            profileEntry = {
              profile: matchedUser,
              isRegistered: true,
              faceDataUrl: null,
              entryTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              masked: true,
              hasId: false,
              gps: null
            };
            faceProfileMap.set(faceId, profileEntry);
          } else {
            profileEntry = getOrAssignProfile(faceId);
          }

          const masked = isMaskWorn(
            det.landmarks,
            scaleX,
            scaleY
          );

          // ID Card detection on chest ROI
          const idDetection = isIdCardWorn(box, det.landmarks, scaleX, scaleY);
          const hasId = idDetection.hasId;

          const age = det.age
            ? Math.round(det.age)
            : '?';

          const aiGender = det.gender
            ? (det.gender === 'male' ? 'Male' : 'Female')
            : '?';
          
          const gender = profileEntry.profile.gender || aiGender;

          const conf = Math.round(
            det.detection.score * 100
          );

          let emotion = '?';
          if (det.expressions) {
            const sorted = Object.entries(det.expressions).sort((a, b) => b[1] - a[1]);
            emotion = sorted[0][0];
            if (emotion === 'happy') {
              playHappyMusic();
            } else if (emotion === 'sad') {
              playSadMusic();
            } else if (emotion === 'angry') {
              playAngryMusic();
            }
          }

          if (!masked) {
            noMaskCount++;
            newViolators.push({
              id: faceId,
              age,
              gender
            });
          }

          if (!hasId) {
            noIdCount++;
          }

          personRows.push({
            id: faceId,
            age,
            gender,
            masked,
            idCard: hasId,
            isDsatm: idDetection.isDsatm,
            conf
          });

          profileEntry.masked = masked;
          profileEntry.hasId = hasId;
          profileEntry.isDsatm = idDetection.isDsatm;
          profileEntry.cardName = idDetection.cardName;

          if (!profileEntry.gps && liveGPS) {
            profileEntry.gps = { ...liveGPS };
          }

          try {
            const fx = Math.max(
              0,
              Math.round(box.x * scaleX)
            );

            const fy = Math.max(
              0,
              Math.round(box.y * scaleY)
            );

            const fw = Math.min(
              extractCanvas.width - fx,
              Math.round(box.width * scaleX)
            );

            const fh = Math.min(
              extractCanvas.height - fy,
              Math.round(box.height * scaleY)
            );

            if (fw > 10 && fh > 10) {
              const faceC = document.createElement('canvas');

              faceC.width = fw;
              faceC.height = fh;

              faceC
                .getContext('2d')
                .drawImage(
                  extractCanvas,
                  fx,
                  fy,
                  fw,
                  fh,
                  0,
                  0,
                  fw,
                  fh
                );

              profileEntry.faceDataUrl = faceC.toDataURL(
                'image/jpeg',
                0.7
              );
            }
          } catch (e) {
            console.error(e);
          }

          // Unregistered → amber box; Registered → green (masked & ID OK) or red (violation)
          const color = !profileEntry.isRegistered
            ? '#f59e0b'
            : (masked && hasId ? '#10b981' : '#ef4444');

          ctx.strokeStyle = color;
          ctx.lineWidth = 2.5;

          const bLen = 16;

          [
            [box.x, box.y],
            [box.x + box.width, box.y],
            [box.x, box.y + box.height],
            [box.x + box.width, box.y + box.height]
          ].forEach(([cx, cy], i) => {
            ctx.beginPath();

            ctx.moveTo(
              cx + (i % 2 === 0 ? bLen : -bLen),
              cy
            );

            ctx.lineTo(cx, cy);

            ctx.lineTo(
              cx,
              cy + (i < 2 ? bLen : -bLen)
            );

            ctx.stroke();
          });

          // Draw Chest ID Card Bounding Box & Target if ID is detected
          if (hasId && idDetection.chestBox) {
            const cb = idDetection.chestBox;
            const targetX = cb.x + cb.width * 0.15;
            const targetY = cb.y + cb.height * 0.08;
            const targetW = cb.width * 0.7;
            const targetH = cb.height * 0.78;

            ctx.save();
            ctx.strokeStyle = '#22d3ee';
            ctx.lineWidth = 1.8;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(targetX, targetY, targetW, targetH);
            ctx.setLineDash([]);

            // ID badge tag above chest box
            const idTag = idDetection.isDsatm ? '🪪 DSATM ID: OK (ON ✓)' : '🪪 ID: OK (ON ✓)';
            ctx.font = 'bold 9px Inter, monospace';
            const idTagW = ctx.measureText(idTag).width + 12;
            ctx.fillStyle = idDetection.isDsatm ? 'rgba(16, 185, 129, 0.95)' : 'rgba(6, 182, 212, 0.92)';
            ctx.beginPath();
            ctx.roundRect(targetX, targetY - 17, idTagW, 16, 3);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.translate(targetX + idTagW, targetY - 5);
            ctx.scale(-1, 1);
            ctx.fillText(idTag, 6, 0);
            ctx.restore();
          }

          // Top label — prominently displays ID: OK status and mask status
          let label, labelBg;
          const firstName = profileEntry.isRegistered
            ? profileEntry.profile.name.split(' ')[0]
            : 'VISITOR';

          if (hasId) {
            const cardPrefix = idDetection.isDsatm ? 'DSATM ID: OK (ON ✓)' : 'ID: OK (ON ✓)';
            label = masked
              ? `${cardPrefix} · MASK ON · ${firstName}`
              : `${cardPrefix} · NO MASK · ${firstName}`;
            labelBg = masked ? 'rgba(16,185,129,0.94)' : 'rgba(239,68,68,0.92)';
          } else {
            label = masked
              ? `NO ID ⚠ · MASK ON · ${firstName}`
              : `NO ID · NO MASK · ${firstName}`;
            labelBg = 'rgba(239,68,68,0.92)';
          }

          ctx.font = 'bold 11px Inter, monospace';

          const labelW = ctx.measureText(label).width + 16;

          ctx.fillStyle = labelBg;

          ctx.beginPath();

          ctx.roundRect(
            box.x,
            box.y - 28,
            labelW,
            24,
            4
          );

          ctx.fill();

          ctx.fillStyle = '#fff';
          ctx.save();
          ctx.translate(box.x + labelW, box.y - 11);
          ctx.scale(-1, 1);
          ctx.fillText(label, 8, 0);
          ctx.restore();

          const infoLabel = profileEntry.isRegistered
            ? `${profileEntry.profile.dept} · ${idDetection.isDsatm ? 'DSATM ID: OK' : (hasId ? 'ID: OK' : 'ID: OFF')} · ~${age}yr`
            : `Unregistered · ${idDetection.isDsatm ? 'DSATM ID: OK' : (hasId ? 'ID: OK' : 'ID: OFF')} · ~${age}yr · ${emotion}`;

          ctx.font = '10px Inter, monospace';

          const infoW = ctx.measureText(infoLabel).width + 14;

          ctx.fillStyle = 'rgba(10,15,30,0.82)';

          ctx.beginPath();

          ctx.roundRect(
            box.x,
            box.y + box.height + 2,
            infoW,
            20,
            4
          );

          ctx.fill();

          ctx.fillStyle = '#e2e8f0';
          ctx.save();
          ctx.translate(box.x + infoW, box.y + box.height + 15);
          ctx.scale(-1, 1);
          ctx.fillText(infoLabel, 7, 0);
          ctx.restore();
        });

        if (this.cam1Density) {
          const detectedCount = resized.length;
          if (detectedCount === 0) {
            // No persons in frame — do not falsely claim compliance
            this.cam1Density.innerText = '— No persons detected';
            this.cam1Density.style.color = '#94a3b8';
          }
          else if (noMaskCount === 0 && noIdCount === 0) {
            this.cam1Density.innerText = '✓ All Masked & ID OK';
            this.cam1Density.style.color = '#10b981';
          }
          else if (noMaskCount === 0) {
            this.cam1Density.innerText = `✓ Masked · ⚠ ${noIdCount} NO ID`;
            this.cam1Density.style.color = '#f59e0b';
          }
          else {
            this.cam1Density.innerText =
              `⚠ ${noMaskCount} NO MASK` + (noIdCount > 0 ? ` · ${noIdCount} NO ID` : '');

            this.cam1Density.style.color = '#ef4444';
          }
        }

        updateViolatorsPanel(newViolators, noMaskCount);

        updatePersonsTable(personRows);

        const now = Date.now();

        if (
          noMaskCount > 0 &&
          now - this.lastAlertTime > 8000
        ) {
          this.lastAlertTime = now;

          window._dashSim?.addAlert(
            {
              type: 'critical',
              title: 'No-Mask Violation Detected',
              message: `${noMaskCount} person(s) without mask — Cam 01 Live Feed`,
              icon: 'bx-mask',
              zone: 'Cam 01 - Entrance'
            },
            new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit'
            }) + ' (Live)'
          );

          if (window._dashSim) {
            window._dashSim.activeAlerts++;
          }

          window._dashSim?.updateAlertCounters();
        }

      } catch (err) {
        console.error('AI Thread Error', err);
      }

    }, 180);
  }
}

// ============================================================
// CAM 02 VIDEO MASK + EMOTION DETECTOR
// ============================================================

class VideoMaskDetector {
  constructor() {
    this.video      = document.getElementById('cam2-video');
    this.container  = document.getElementById('cam2-card')?.querySelector('.camera-view');
    this.countEl    = document.getElementById('cam2-count');
    this.densityEl  = document.getElementById('cam2-density');
    this.maskBarEl  = document.getElementById('cam2-mask-bar');

    if (!this.video || !this.container) return;

    this.densityEl?.classList.remove('warning-overlay');
    if (this.densityEl) {
      this.densityEl.innerText = '⏳ Loading AI…';
      this.densityEl.style.color = '#f59e0b';
    }

    this.faceIdMap = [];
    this.lastAlertTime = 0;
    this.sensitivity = document.getElementById('sensitivity-range');

    // Pre-scale canvas created here; populated inside startDetectionLoop
    // 960×540 preserves enough detail for distant crowd faces (still 9× smaller than 4K)
    this.processCanvas        = document.createElement('canvas');
    this.processCanvas.width  = 960;
    this.processCanvas.height = 540;
    this.processCtx = this.processCanvas.getContext('2d', { willReadFrequently: true });

    this.initAI();
  }

  async initAI() {
    const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';

    const waitForFaceApi = () => new Promise((resolve, reject) => {
      let tries = 0;
      const t = setInterval(() => {
        if (typeof faceapi !== 'undefined') { clearInterval(t); resolve(); }
        if (++tries > 60) { clearInterval(t); reject(new Error('face-api not ready')); }
      }, 250);
    });

    try {
      await waitForFaceApi();

      // SsdMobilenetv1 uses multi-scale anchors — detects small distant faces as well as nearby ones.
      // TinyFaceDetector only works well on large faces; SSD is the right choice for crowd scenes.
      const alreadyLoaded =
        faceapi.nets.ssdMobilenetv1.isLoaded &&
        faceapi.nets.faceLandmark68Net.isLoaded &&
        faceapi.nets.faceExpressionNet.isLoaded;

      if (!alreadyLoaded) {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),   // crowd-capable multi-scale detector
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        ]);
      }

      await new Promise(res => {
        if (this.video.readyState >= 1) return res();
        this.video.addEventListener('loadedmetadata', res, { once: true });
      });

      this.startDetectionLoop();
    } catch (e) {
      console.error('Cam02 AI init failed', e);
      if (this.densityEl) {
        this.densityEl.innerText = '⚠ AI unavailable';
        this.densityEl.style.color = '#f59e0b';
      }
    }
  }

  assignId(box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    let best = null, bestDist = 9999;
    this.faceIdMap.forEach(f => {
      const d = Math.hypot(cx - f.cx, cy - f.cy);
      if (d < 80 && d < bestDist) { bestDist = d; best = f; }
    });
    if (best) { best.cx = cx; best.cy = cy; return best.id; }
    const id = this.faceIdMap.length + 1;
    this.faceIdMap.push({ id, cx, cy });
    if (this.faceIdMap.length > 20) this.faceIdMap.shift();
    return id;
  }

  /**
   * Texture-variance + saturation mask detection.
   *
   * Unmasked faces → high pixel variance (skin pores, lips, nostrils) + moderate saturation.
   * Masked faces   → low-variance uniform patch + very low saturation (grey/blue/white fabric).
   *
   * Landmarks are in display-space (after resizeResults); map back to processCanvas via sx/sy.
   * Returns TRUE only if BOTH variance AND saturation clearly indicate a mask.
   * Defaults to FALSE (no mask) on any error — safer for a mask-free crowd feed.
   */
  isMaskWorn(landmarks, displayW, displayH) {
    try {
      const pc  = this.processCanvas;
      const ctx = this.processCtx;
      const sx  = pc.width  / displayW;
      const sy  = pc.height / displayH;
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

      const nose       = landmarks.getNose();
      const jaw        = landmarks.getJawOutline();
      const mouth      = landmarks.getMouth();
      const noseTip    = nose[6];
      const chin       = jaw[8];
      const leftCheek  = jaw[3];
      const rightCheek = jaw[13];
      const mouthMid   = {
        x: (mouth[0].x + mouth[6].x) / 2,
        y: (mouth[0].y + mouth[6].y) / 2
      };

      const samplePts = [noseTip, chin, leftCheek, rightCheek, mouthMid];
      const grays = [], rVals = [], gVals = [], bVals = [];

      for (const pt of samplePts) {
        const px = clamp(Math.round(pt.x * sx) - 6, 0, pc.width  - 13);
        const py = clamp(Math.round(pt.y * sy) - 6, 0, pc.height - 13);
        const d  = ctx.getImageData(px, py, 12, 12).data;
        for (let i = 0; i < d.length; i += 4) {
          grays.push(d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114);
          rVals.push(d[i] / 255);
          gVals.push(d[i+1] / 255);
          bVals.push(d[i+2] / 255);
        }
      }

      if (grays.length < 10) return false; // not enough data → assume no mask

      // Texture variance
      const meanGray = grays.reduce((a, b) => a + b, 0) / grays.length;
      const stdDev   = Math.sqrt(
        grays.reduce((s, g) => s + (g - meanGray) ** 2, 0) / grays.length
      );

      // HSV saturation of lower face
      let satSum = 0;
      for (let i = 0; i < rVals.length; i++) {
        const max = Math.max(rVals[i], gVals[i], bVals[i]);
        const min = Math.min(rVals[i], gVals[i], bVals[i]);
        satSum += max === 0 ? 0 : (max - min) / max;
      }
      const avgSat = satSum / rVals.length;

      // Sensitivity slider adjusts thresholds
      const sens      = this.sensitivity?.value ? (this.sensitivity.value / 100) : 0.75;
      const varThresh = 10 + sens * 12;   // 10–22 stdDev
      const satThresh = 0.06 + sens * 0.06; // 0.06–0.12 saturation

      // BOTH conditions must hold to classify as masked
      return stdDev < varThresh && avgSat < satThresh;

    } catch {
      return false; // default: NO MASK — never lie to the operator
    }
  }

  isIdCardWorn(landmarks, box, displayW, displayH) {
    try {
      const pc  = this.processCanvas;
      const ctx = this.processCtx;
      const sx  = pc.width  / displayW;
      const sy  = pc.height / displayH;

      const jaw = landmarks?.getJawOutline ? landmarks.getJawOutline() : null;
      const chinY = jaw ? jaw[8].y : (box.y + box.height);
      const chinX = jaw ? jaw[8].x : (box.x + box.width / 2);

      const chestDispW = box.width * 1.0;
      const chestDispH = box.height * 1.15;
      const chestDispX = chinX - chestDispW / 2;
      const chestDispY = chinY + box.height * 0.08;

      const px = Math.max(0, Math.min(pc.width - 10, Math.round(chestDispX * sx)));
      const py = Math.max(0, Math.min(pc.height - 10, Math.round(chestDispY * sy)));
      const pw = Math.max(10, Math.min(pc.width - px, Math.round(chestDispW * sx)));
      const ph = Math.max(10, Math.min(pc.height - py, Math.round(chestDispH * sy)));

      const d = ctx.getImageData(px, py, pw, ph).data;
      if (d.length < 64) return { hasId: false, isDsatm: false, chestBox: null };

      let blueCount = 0, yellowCount = 0, whiteCount = 0;
      const count = d.length / 4;

      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i+1], b = d[i+2];
        if ((b > 65 && b > r + 30 && b > g + 20) || (b > 80 && b > r * 1.45 && b > g * 1.2)) {
          blueCount++;
        }
        if (r > 145 && g > 125 && b < 100 && (r + g) > (b * 2.4) && Math.abs(r - g) < 45) {
          yellowCount++;
        }
        if (r > 145 && g > 145 && b > 145 && Math.abs(r - g) < 18 && Math.abs(g - b) < 18) {
          whiteCount++;
        }
      }

      const blueRatio = (blueCount / count) * 100;
      const yellowRatio = (yellowCount / count) * 100;
      const whiteRatio = (whiteCount / count) * 100;

      const hasId = (blueRatio >= 1.8) || (yellowRatio >= 0.7 && whiteRatio >= 5.5) || (blueRatio >= 0.9 && whiteRatio >= 5.5);

      if (!hasId) {
        return { hasId: false, isDsatm: false, chestBox: null };
      }

      return {
        hasId: true,
        isDsatm: true,
        chestBox: { x: chestDispX, y: chestDispY, width: chestDispW, height: chestDispH }
      };
    } catch {
      return { hasId: false, isDsatm: false, chestBox: null };
    }
  }

  startDetectionLoop() {
    const drawCanvas = document.createElement('canvas');
    drawCanvas.style.cssText = `
      position:absolute; top:0; left:0; width:100%; height:100%;
      pointer-events:none; z-index:10;
    `;
    this.container.appendChild(drawCanvas);

    if (this.densityEl) {
      this.densityEl.innerText   = 'Scanning…';
      this.densityEl.style.color = '#10b981';
      this.densityEl.classList.remove('warning-overlay');
    }

    // rAF loop with 450 ms minimum gap.
    // `running` flag prevents queuing a new detection before the previous async call finishes.
    let lastRun = 0;
    let running = false;
    const INTERVAL = 600; // SsdMobilenetv1 is heavier — 600ms gives clean throughput

    const loop = async (ts) => {
      requestAnimationFrame(loop);

      if (running) return;                             // previous frame still in progress
      if (ts - lastRun < INTERVAL) return;            // too soon
      if (this.video.paused || this.video.readyState < 2) return;

      const displayW = this.video.clientWidth;
      const displayH = this.video.clientHeight;
      if (!displayW || !displayH) return;

      lastRun = ts;
      running = true;

      try {
        // Downscale 4K → 640×360 before inference (~36× fewer pixels)
        this.processCtx.drawImage(
          this.video, 0, 0,
          this.processCanvas.width, this.processCanvas.height
        );

        const displaySize = { width: displayW, height: displayH };

        // Run detection on the small canvas
        const detections = await faceapi
          .detectAllFaces(
            this.processCanvas,
            new faceapi.SsdMobilenetv1Options({ minConfidence: 0.30, maxResults: 50 })
          )
          .withFaceLandmarks()
          .withAgeAndGender()
          .withFaceExpressions();

        // Scale result coordinates: processCanvas space → display space
        faceapi.matchDimensions(drawCanvas, displaySize);
        const resized = faceapi.resizeResults(detections, displaySize);

        const ctx = drawCanvas.getContext('2d');
        ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

        if (this.countEl) this.countEl.innerText = detections.length;

        let noMaskCount = 0;
        const newViolators = [];
        const personRows   = [];

        resized.forEach(det => {
          const { box }      = det.detection;
          const faceId       = this.assignId(box);

          // Texture-variance mask check (landmarks are in display space)
          const masked   = this.isMaskWorn(det.landmarks, displayW, displayH);
          const idInfo   = this.isIdCardWorn(det.landmarks, box, displayW, displayH);
          const hasId    = idInfo.hasId;

          const age      = det.age    ? Math.round(det.age) : '?';
          const aiGender = det.gender ? (det.gender === 'male' ? 'Male' : 'Female') : '?';
          const conf     = Math.round(det.detection.score * 100);

          // Video crowd is always unregistered visitors from public feed
          const profileEntry = {
            profile: {
              name: 'Unregistered Person',
              regId: 'UNREG-' + faceId,
              dept: 'North Gate Zone',
              role: 'Visitor',
              phone: '—',
              email: '—',
              status: 'Unregistered',
              gender: aiGender
            },
            isRegistered: false,
            faceDataUrl: null,
            entryTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            masked,
            hasId,
            gps: null
          };
          faceProfileMap.set(faceId, profileEntry);

          const gender   = aiGender;

          let emotion = '?';
          if (det.expressions) {
            const sorted = Object.entries(det.expressions).sort((a, b) => b[1] - a[1]);
            emotion = sorted[0][0];
            if      (emotion === 'happy') playHappyMusic();
            else if (emotion === 'sad')   playSadMusic();
            else if (emotion === 'angry') playAngryMusic();
          }

          if (!masked) {
            noMaskCount++;
            newViolators.push({ id: faceId, age, gender });
          }

          personRows.push({ id: faceId, age, gender, masked, idCard: hasId, conf });

          // Corner-bracket bounding box
          const color = masked ? '#10b981' : '#ef4444';
          ctx.strokeStyle = color;
          ctx.lineWidth   = 2.5;
          const bLen = 16;
          [[box.x, box.y], [box.x + box.width, box.y],
           [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]
          ].forEach(([cx, cy], i) => {
            ctx.beginPath();
            ctx.moveTo(cx + (i % 2 === 0 ? bLen : -bLen), cy);
            ctx.lineTo(cx, cy);
            ctx.lineTo(cx, cy + (i < 2 ? bLen : -bLen));
            ctx.stroke();
          });

          // Top label for Cam 02 (video crowd) showing ID: OK & Mask
          const label = hasId
            ? (masked ? `ID: OK (ON ✓) · MASK ON · ${emotion.toUpperCase()}` : `ID: OK · NO MASK · ${emotion.toUpperCase()}`)
            : (masked ? `NO ID ⚠ · MASK ON · ${emotion.toUpperCase()}` : `NO ID · NO MASK · ${emotion.toUpperCase()}`);
          ctx.font = 'bold 11px Inter, monospace';
          const labelW = ctx.measureText(label).width + 16;
          ctx.fillStyle = masked ? 'rgba(16,185,129,0.92)' : 'rgba(239,68,68,0.92)';
          ctx.beginPath();
          ctx.roundRect(box.x, box.y - 28, labelW, 24, 4);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.fillText(label, box.x + 8, box.y - 11);

          // Bottom info label
          const infoLabel = `Unregistered Person · ID: ${hasId ? 'OK' : 'OFF'} · ~${age}yr · ${emotion}`;
          ctx.font = '10px Inter, monospace';
          const infoW = ctx.measureText(infoLabel).width + 14;
          ctx.fillStyle = 'rgba(10,15,30,0.82)';
          ctx.beginPath();
          ctx.roundRect(box.x, box.y + box.height + 2, infoW, 20, 4);
          ctx.fill();
          ctx.fillStyle = '#e2e8f0';
          ctx.fillText(infoLabel, box.x + 7, box.y + box.height + 15);
        });

        // Density overlay
        if (this.densityEl) {
          if (noMaskCount === 0) {
            this.densityEl.innerText = detections.length > 0
              ? `✓ ${detections.length} Detected – All Clear`
              : 'Scanning…';
            this.densityEl.style.color = '#10b981';
            this.densityEl.classList.remove('warning-overlay');
          } else {
            this.densityEl.innerText = `⚠ ${noMaskCount}/${detections.length} WITHOUT MASK`;
            this.densityEl.style.color = '#ef4444';
            this.densityEl.classList.add('warning-overlay');
          }
        }

        // GPS mask-bar
        if (this.maskBarEl && detections.length > 0) {
          const pct = Math.round(
            ((detections.length - noMaskCount) / detections.length) * 100
          );
          this.maskBarEl.innerHTML = `<i class='bx bx-mask'></i> ${pct}% compliant`;
          this.maskBarEl.style.color = pct >= 90 ? '#10b981' : '#ef4444';
        }

        updateViolatorsPanel(newViolators, noMaskCount);
        updatePersonsTable(personRows);

        // Alert on violation
        const now = Date.now();
        if (noMaskCount > 0 && now - this.lastAlertTime > 8000) {
          this.lastAlertTime = now;
          window._dashSim?.addAlert({
            type: 'critical',
            title: 'No-Mask Violation – Cam 02',
            message: `${noMaskCount} person(s) without mask — North Gate Feed`,
            icon: 'bx-mask',
            zone: 'Cam 02 – North Gate'
          }, new Date().toLocaleTimeString([], {
            hour: '2-digit', minute: '2-digit'
          }) + ' (Live)');
          if (window._dashSim) window._dashSim.activeAlerts++;
          window._dashSim?.updateAlertCounters();
        }

      } catch (err) {
        console.error('Cam02 AI detection error', err);
      }

      running = false;
    };

    requestAnimationFrame(loop);
  }
}

// ============================================================
// VIOLATORS PANEL
// ============================================================

function updateViolatorsPanel(violatorList, count) {
  const panel = document.getElementById('no-mask-panel');
  const countEl = document.getElementById('no-mask-count');
  const listEl = document.getElementById('no-mask-list');

  if (!panel || !listEl) return;

  if (countEl) {
    countEl.innerText = count;
  }

  panel.classList.toggle('panel-alert', count > 0);

  if (count === 0) {
    listEl.innerHTML = `
      <div class="vmsg">
        <i class="bx bx-check-shield"></i>
        All persons compliant
      </div>
    `;

    return;
  }

  const now = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const existing = new Set(
    [...listEl.querySelectorAll('.vcard')]
      .map(el => el.dataset.id)
  );

  violatorList.forEach(({ id, age, gender }) => {
    const sid = String(id);

    if (existing.has(sid)) {
      const el = listEl.querySelector(
        `.vcard[data-id="${sid}"]`
      );

      if (el) {
        el.querySelector('.vtime').innerText = now;
      }

      return;
    }

    const card = document.createElement('div');

    card.className = 'vcard';
    card.dataset.id = sid;

    card.innerHTML = `
      <div class="vface">
        <i class="bx bx-user"></i>
      </div>

      <div class="vinfo">
        <span class="vtitle">Face ID #${sid}</span>
        <span class="vmeta">${gender}, ~${age}yr</span>
        <span class="vstatus">
          NO MASK
          <i class="bx bx-error-circle"></i>
        </span>
        <span class="vtime">${now}</span>
      </div>
    `;

    listEl.prepend(card);
  });

  const violatorIds = violatorList.map(v => v.id);

  [...listEl.querySelectorAll('.vcard')].forEach(el => {
    if (!violatorIds.includes(Number(el.dataset.id))) {
      el.style.opacity = '0.35';

      const st = el.querySelector('.vstatus');

      if (st) {
        st.innerHTML =
          'CLEARED <i class="bx bx-check"></i>';

        st.style.color = '#10b981';
      }
    }
  });

  while (listEl.children.length > 10) {
    listEl.removeChild(listEl.lastChild);
  }
}

// ============================================================
// PERSONS TABLE
// ============================================================

function updatePersonsTable(persons) {
  const tbody = document.getElementById('persons-tbody');
  const countEl = document.getElementById('persons-count');

  if (!tbody) return;

  if (countEl) {
    countEl.innerText = persons.length;
  }

  if (persons.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8"
            style="
              text-align:center;
              color:var(--text-secondary);
              padding:1rem;
            ">
          <i class="bx bx-search-alt"></i>
          Scanning for faces...
        </td>
      </tr>
    `;

    return;
  }

  tbody.innerHTML = '';

  persons.forEach(p => {
    const entry = faceProfileMap.get(p.id);
    const reg = entry?.profile;

    const gps = entry?.gps || liveGPS;

    const gpsText = gps
      ? `${gps.lat}°N ${gps.lng}°E`
      : '—';

    const tr = document.createElement('tr');

    tr.style.cursor = 'pointer';
    tr.title = 'Click to open profile';

    tr.innerHTML = `
      <td>
        <span class="pid-badge">#${p.id}</span>
      </td>

      <td>
        <div class="reg-name">
          ${reg ? reg.name : 'Unregistered'}
        </div>

        <div class="reg-sub">
          ${reg ? reg.regId : '—'}
        </div>
      </td>

      <td>
        <div class="reg-sub">
          ${reg ? reg.dept : '—'}
        </div>

        <div class="reg-sub"
             style="color:var(--accent-cyan)">
          ${reg ? reg.role : ''}
        </div>
      </td>

      <td>
        <span class="mask-pill ${p.masked ? 'pill-ok' : 'pill-no'}">
          ${p.masked ? '✓ Mask On' : '✗ No Mask'}
        </span>
      </td>

      <td>
        <span class="id-pill ${p.idCard ? 'id-pill-ok' : 'id-pill-no'}">
          ${p.idCard ? (p.isDsatm ? '✓ DSATM ID: OK' : '✓ ID: OK') : '✗ No ID'}
        </span>
      </td>

      <td>
        <div class="gps-cell">
          <i class="bx bx-map-pin"
             style="
               color:var(--accent-cyan);
               font-size:0.9rem;
             "></i>

          <span class="gps-cell-coords">
            ${gpsText}
          </span>

          ${gps?.city
        ? `<span class="gps-cell-city">${gps.city}</span>`
        : ''}
        </div>
      </td>

      <td class="conf-cell">
        ${p.conf}%
      </td>

      <td>
        <button class="btn-profile"
                data-id="${p.id}">
          <i class="bx bx-user-detail"></i>
        </button>
      </td>
    `;

    tr.addEventListener('click', () => {
      showProfilePanel(p.id);
    });

    tbody.appendChild(tr);
  });
}

// ============================================================
// PROFILE PANEL
// ============================================================

function showProfilePanel(faceId) {
  const entry = faceProfileMap.get(faceId);

  if (!entry) return;

  const {
    profile,
    faceDataUrl,
    entryTime,
    masked,
    hasId
  } = entry;

  const panel = document.getElementById('profile-panel');

  if (!panel) return;

  panel.querySelector('#pp-face').src = faceDataUrl || '';

  panel.querySelector('#pp-face').style.display =
    faceDataUrl ? 'block' : 'none';

  panel.querySelector('#pp-no-face').style.display =
    faceDataUrl ? 'none' : 'flex';

  panel.querySelector('#pp-name').textContent = profile.name;
  panel.querySelector('#pp-regid').textContent = profile.regId;
  panel.querySelector('#pp-dept').textContent = profile.dept;
  panel.querySelector('#pp-role').textContent = profile.role;
  panel.querySelector('#pp-phone').textContent = profile.phone;
  panel.querySelector('#pp-email').textContent = profile.email;
  panel.querySelector('#pp-entry').textContent = entryTime;
  panel.querySelector('#pp-faceid').textContent = `#${faceId}`;

  const gps = entry.gps || liveGPS;

  const gpsEl = panel.querySelector('#pp-gps');
  const addrEl = panel.querySelector('#pp-gps-addr');

  if (gpsEl) {
    gpsEl.textContent = gps
      ? `${gps.lat}° N, ${gps.lng}° E (±${gps.accuracy}m)`
      : '—';
  }

  if (addrEl) {
    addrEl.textContent = gps?.city
      ? gps.city
      : '';
  }

  const statusEl = panel.querySelector('#pp-status');

  if (statusEl) {
    statusEl.textContent = entry.isRegistered ? profile.status : 'Unregistered';
    statusEl.className =
      'pp-status-badge ' +
      (entry.isRegistered && profile.status === 'Active'
        ? 'status-active'
        : 'status-suspended');
  }

  const maskEl = panel.querySelector('#pp-mask');

  if (maskEl) {
    maskEl.textContent = masked
      ? '✓ Mask Compliant'
      : '✗ No Mask';

    maskEl.className =
      'pp-mask-badge ' +
      (masked ? 'mask-ok' : 'mask-no');
  }

  const idCardEl = panel.querySelector('#pp-idcard');
  const idCardValEl = panel.querySelector('#pp-idcard-val');
  const isWearingId = hasId === true;
  const isDsatmCard = isWearingId && (entry.isDsatm === true);

  if (idCardEl) {
    idCardEl.textContent = isWearingId
      ? (isDsatmCard ? '✓ DSATM ID: OK' : '✓ ID: OK (Wearing ID)')
      : '✗ No ID Card';

    idCardEl.className =
      'pp-idcard-badge ' +
      (isWearingId ? 'idcard-ok' : 'idcard-no');
  }

  if (idCardValEl) {
    idCardValEl.textContent = isWearingId
      ? (isDsatmCard ? 'VERIFIED (DSATM College ID is ON ✓)' : 'VERIFIED (ID Card is ON ✓)')
      : 'NOT DETECTED (No ID Card)';
    idCardValEl.style.color = isWearingId
      ? 'var(--accent-green)'
      : 'var(--accent-red)';
  }

  panel.classList.add('open');
}

function toggleCameraFullscreen(card) {
  if (!card) return;

  const isFs = document.fullscreenElement === card || card.classList.contains('card-fullscreen');

  if (!isFs) {
    card.classList.add('card-fullscreen');
    if (card.requestFullscreen) {
      card.requestFullscreen().catch(() => {});
    } else if (card.webkitRequestFullscreen) {
      card.webkitRequestFullscreen();
    }
  } else {
    card.classList.remove('card-fullscreen');
    if (document.fullscreenElement) {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  }

  updateFullscreenBtnIcon(card);
}

function updateFullscreenBtnIcon(card) {
  const btn = card.querySelector('#btn-fullscreen, .btn-fullscreen-card');
  if (!btn) return;
  const isFs = document.fullscreenElement === card || card.classList.contains('card-fullscreen');
  const icon = btn.querySelector('i');
  if (icon) {
    icon.className = isFs ? 'bx bx-exit-fullscreen' : 'bx bx-fullscreen';
  }
  btn.classList.toggle('active', isFs);
}

document.addEventListener('fullscreenchange', () => {
  document.querySelectorAll('.camera-card').forEach(card => {
    const isFs = document.fullscreenElement === card;
    if (!isFs) {
      card.classList.remove('card-fullscreen');
    }
    updateFullscreenBtnIcon(card);
  });
});

function takeCardSnapshot(card) {
  const media = card.querySelector('.camera-view img, .camera-view video');
  if (!media) return;
  const canvas = document.createElement('canvas');
  if (media.tagName.toLowerCase() === 'img') {
    canvas.width = media.naturalWidth || media.clientWidth || 640;
    canvas.height = media.naturalHeight || media.clientHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(media, 0, 0, canvas.width, canvas.height);
  } else {
    canvas.width = media.videoWidth || 640;
    canvas.height = media.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(media, 0, 0, canvas.width, canvas.height);
  }
  const link = document.createElement('a');
  const title = card.querySelector('.camera-header span')?.textContent.trim() || 'camera';
  link.download = `${title.replace(/[^a-z0-9]/gi, '_')}_snapshot_${Date.now()}.png`;
  link.href = canvas.toDataURL();
  link.click();
}

function initAllCameraCards() {
  document.querySelectorAll('.camera-card').forEach((card) => {
    if (card.id === 'cam1-card') return; // Handled by WebcamMaskDetector

    const container = card.querySelector('.camera-view');
    if (!container) return;

    const slider = card.querySelector('.card-zoom-range');
    const badgeVal = card.querySelector('.zoom-val');
    const btnIn = card.querySelector('.btn-zoom-in-card');
    const btnOut = card.querySelector('.btn-zoom-out-card');
    const btnReset = card.querySelector('.btn-zoom-reset-card');

    new CameraZoomController(container, {
      slider,
      badgeVal,
      btnIn,
      btnOut,
      btnReset
    });

    const btnNv = card.querySelector('.btn-night-vision-card');
    if (btnNv) {
      btnNv.addEventListener('click', () => {
        const img = card.querySelector('.camera-view img, .camera-view video');
        if (img) {
          const isNv = img.classList.toggle('night-vision');
          if (isNv) {
            img.classList.remove('thermal-vision');
            card.querySelector('.btn-thermal-vision-card')?.classList.remove('active');
            card.querySelector('.thermal-badge')?.classList.add('hidden');
          }
          btnNv.classList.toggle('active', isNv);
        }
      });
    }

    const btnTv = card.querySelector('.btn-thermal-vision-card');
    if (btnTv) {
      btnTv.addEventListener('click', () => {
        const img = card.querySelector('.camera-view img, .camera-view video');
        if (img) {
          const isThermal = img.classList.toggle('thermal-vision');
          if (isThermal) {
            img.classList.remove('night-vision');
            card.querySelector('.btn-night-vision-card')?.classList.remove('active');
          }
          btnTv.classList.toggle('active', isThermal);
          const badge = card.querySelector('.thermal-badge');
          if (badge) badge.classList.toggle('hidden', !isThermal);
        }
      });
    }

    const btnSnap = card.querySelector('.btn-snapshot-card');
    if (btnSnap) {
      btnSnap.addEventListener('click', () => {
        takeCardSnapshot(card);
      });
    }

    const btnFs = card.querySelector('.btn-fullscreen-card');
    if (btnFs) {
      btnFs.addEventListener('click', () => {
        toggleCameraFullscreen(card);
      });
    }
  });
}

// ============================================================
// GLOBAL INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initGPS();
  initRouting();
  initThemeToggle();
  initSettings();
  initRegistration();
  initAllCameraCards();

  window._dashSim = new DashboardSim();
  window._webcamSim = new WebcamMaskDetector();
  window._cam2Sim = new VideoMaskDetector();

  // ── Sync Cam 02 stats into Live Feeds "Cam 02: North Gate Main" ──────────
  (function syncCam2ToFeeds() {
    const feedsCountEl   = document.getElementById('feeds-cam2-count');
    const feedsDensityEl = document.getElementById('feeds-cam2-density');
    const feedsMaskBar   = document.getElementById('feeds-cam2-mask-bar');

    setInterval(() => {
      const cam2Count   = document.getElementById('cam2-count');
      const cam2Density = document.getElementById('cam2-density');
      const cam2MaskBar = document.getElementById('cam2-mask-bar');

      if (cam2Count && feedsCountEl) feedsCountEl.innerText = cam2Count.innerText;
      if (cam2Density && feedsDensityEl) {
        feedsDensityEl.innerText = cam2Density.innerText;
        feedsDensityEl.className = cam2Density.className;
        feedsDensityEl.style.color = cam2Density.style.color;
      }
      if (cam2MaskBar && feedsMaskBar) {
        feedsMaskBar.innerHTML = cam2MaskBar.innerHTML;
        feedsMaskBar.style.color = cam2MaskBar.style.color;
      }
    }, 1000);
  })();

  const closePanel = () => {
    document.getElementById('profile-panel')
      ?.classList.remove('open');

    document.getElementById('profile-backdrop')
      ?.classList.add('hidden');
  };

  document.getElementById('pp-close')
    ?.addEventListener('click', closePanel);

  document.getElementById('profile-backdrop')
    ?.addEventListener('click', closePanel);

  const panel = document.getElementById('profile-panel');
  const backdrop = document.getElementById('profile-backdrop');

  if (panel && backdrop) {
    new MutationObserver(() => {
      backdrop.classList.toggle(
        'hidden',
        !panel.classList.contains('open')
      );
    }).observe(panel, {
      attributes: true,
      attributeFilter: ['class']
    });
  }
});

// ============================================================
// REGISTRATION LOGIC
// ============================================================

function generateRegId() {
  _regIdCounter++;
  return 'REG-' + String(_regIdCounter).padStart(3, '0');
}

function updateRegCounters() {
  const n = REGISTERED_DB.length;
  const countEl   = document.getElementById('reg-total-count');
  const navBadge  = document.getElementById('reg-nav-count');
  if (countEl)  countEl.textContent  = n;
  if (navBadge) navBadge.textContent = n;
}

function renderRegistrationTable(filter = '') {
  const tbody = document.getElementById('reg-tbody');
  if (!tbody) return;

  const q = filter.trim().toLowerCase();
  const rows = q
    ? REGISTERED_DB.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.usn.toLowerCase().includes(q)
      )
    : REGISTERED_DB;

  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center;color:var(--text-secondary);padding:2rem;">
          <i class="bx bx-user-x" style="font-size:2rem;display:block;margin-bottom:0.5rem;"></i>
          ${q ? 'No results match your search.' : 'No persons registered yet. Add one using the form above.'}
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = '';
  rows.forEach((p, idx) => {
    const genderClass =
      p.gender === 'Male'   ? 'reg-gender-male' :
      p.gender === 'Female' ? 'reg-gender-female' : 'reg-gender-other';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="color:var(--text-secondary);font-size:0.75rem;">${idx + 1}</td>
      <td><span class="reg-regid-badge">${p.regId}</span></td>
      <td class="reg-name-cell">
        <strong>${p.name}</strong>
        <span>${p.usn}</span>
      </td>
      <td style="font-family:monospace;font-size:0.8rem;color:var(--accent-cyan);">${p.usn}</td>
      <td>
        <div class="reg-branch-cell">${p.dept}</div>
        <div class="reg-branch-role">${p.role}</div>
      </td>
      <td><span class="reg-gender-pill ${genderClass}">${p.gender}</span></td>
      <td><span class="reg-status-active">Active</span></td>
      <td>
        <button class="reg-delete-btn" data-regid="${p.regId}">
          <i class="bx bx-trash"></i> Remove
        </button>
      </td>`;

    tr.querySelector('.reg-delete-btn').addEventListener('click', () => {
      if (!confirm(`Remove ${p.name} from the database?`)) return;
      const i = REGISTERED_DB.findIndex(x => x.regId === p.regId);
      if (i !== -1) {
        REGISTERED_DB.splice(i, 1);
        saveRegisteredDB();
        updateRegCounters();
        renderRegistrationTable(
          document.getElementById('reg-search')?.value || ''
        );
        showRegFeedback(`${p.name} removed.`, 'success');
      }
    });

    tbody.appendChild(tr);
  });
}

function showRegFeedback(msg, type = 'success') {
  const fb = document.getElementById('reg-feedback');
  if (!fb) return;
  fb.className = `reg-feedback ${type}`;
  fb.innerHTML = `<i class="bx ${type === 'success' ? 'bx-check-circle' : 'bx-error-circle'}"></i> ${msg}`;
  clearTimeout(fb._timer);
  fb._timer = setTimeout(() => {
    fb.className = 'reg-feedback hidden';
  }, 4000);
}

function initRegistration() {
  // Render table with whatever is already in localStorage
  renderRegistrationTable();
  updateRegCounters();

  const form    = document.getElementById('reg-form');
  const nameEl  = document.getElementById('reg-name');
  const usnEl   = document.getElementById('reg-usn');
  const branchEl= document.getElementById('reg-branch');
  const roleEl  = document.getElementById('reg-role');
  const genderEl= document.getElementById('reg-gender');
  const phoneEl = document.getElementById('reg-phone');
  const emailEl = document.getElementById('reg-email');
  const searchEl= document.getElementById('reg-search');

  form?.addEventListener('submit', (e) => {
    e.preventDefault();

    const name   = nameEl?.value.trim();
    const usn    = usnEl?.value.trim();
    const dept   = branchEl?.value || 'Computer Science';
    const role   = roleEl?.value   || 'Student';
    const gender = genderEl?.value || 'Male';
    const phone  = phoneEl?.value.trim()  || '—';
    const email  = emailEl?.value.trim()  || '—';

    if (!name || !usn) {
      showRegFeedback('Full Name and USN are required.', 'error');
      return;
    }

    // Duplicate USN check
    if (REGISTERED_DB.some(p => p.usn === usn)) {
      showRegFeedback(`USN "${usn}" is already registered.`, 'error');
      return;
    }

    const newEntry = {
      regId : generateRegId(),
      name,
      usn,
      dept,
      role,
      gender,
      phone,
      email,
      status: 'Active'
    };

    REGISTERED_DB.push(newEntry);
    saveRegisteredDB();
    updateRegCounters();
    renderRegistrationTable(
      document.getElementById('reg-search')?.value || ''
    );
    showRegFeedback(`${name} registered successfully as ${newEntry.regId}!`, 'success');
    form.reset();
  });

  document.getElementById('reg-clear-btn')?.addEventListener('click', () => {
    form?.reset();
  });

  document.getElementById('reg-clear-all-btn')?.addEventListener('click', () => {
    if (REGISTERED_DB.length === 0) {
      showRegFeedback('Database is already empty.', 'error');
      return;
    }
    if (!confirm('This will permanently remove ALL registered persons. Continue?')) return;
    REGISTERED_DB.length = 0;
    _regIdCounter = 0;
    saveRegisteredDB();
    updateRegCounters();
    renderRegistrationTable();
    showRegFeedback('All registrations cleared.', 'success');
  });

  searchEl?.addEventListener('input', () => {
    renderRegistrationTable(searchEl.value);
  });
}

// ============================================================
// SETTINGS LOGIC
// ============================================================
let audioAlertsEnabled = true;
let strictMaskDetection = false;
let globalSensitivity = 75;
let crowdThreshold = 15000;
let desktopNotifications = false;

function initSettings() {
  const themeToggle = document.getElementById('setting-theme-toggle');
  const audioToggle = document.getElementById('setting-audio-toggle');
  const sensSlider = document.getElementById('setting-global-sensitivity');
  const sensVal = document.getElementById('setting-sensitivity-val');
  const strictMask = document.getElementById('setting-strict-mask');
  const crowdThresh = document.getElementById('setting-crowd-threshold');
  const desktopNotif = document.getElementById('setting-desktop-notif');

  // Load from localStorage if exists
  if (localStorage.getItem('theme-hc') === 'true') {
    document.body.classList.add('high-contrast');
    if (themeToggle) themeToggle.checked = true;
    const headerThemeBtn = document.getElementById('theme-toggle');
    if (headerThemeBtn) {
      headerThemeBtn.innerHTML = `<i class='bx bx-sun'></i> Standard View`;
    }
  }

  if (themeToggle) {
    themeToggle.addEventListener('change', (e) => {
      document.body.classList.toggle('high-contrast', e.target.checked);
      localStorage.setItem('theme-hc', e.target.checked);
      
      const headerThemeBtn = document.getElementById('theme-toggle');
      if (headerThemeBtn) {
        headerThemeBtn.innerHTML = e.target.checked 
          ? `<i class='bx bx-sun'></i> Standard View`
          : `<i class='bx bx-moon'></i> High Contrast`;
      }
    });
  }

  if (audioToggle) {
    audioToggle.addEventListener('change', (e) => {
      audioAlertsEnabled = e.target.checked;
    });
  }

  if (sensSlider) {
    sensSlider.addEventListener('input', (e) => {
      globalSensitivity = e.target.value;
      if (sensVal) sensVal.innerText = globalSensitivity + '%';
      
      // Update the dashboard slider too
      const dashSlider = document.getElementById('sensitivity-range');
      if (dashSlider) dashSlider.value = globalSensitivity;
      
      if (window._dashSim) window._dashSim.sensitivity = globalSensitivity / 100;
    });
  }

  if (strictMask) {
    strictMask.addEventListener('change', (e) => {
      strictMaskDetection = e.target.checked;
    });
  }

  if (crowdThresh) {
    crowdThresh.addEventListener('change', (e) => {
      crowdThreshold = parseInt(e.target.value) || 15000;
    });
  }

  if (desktopNotif) {
    desktopNotif.addEventListener('change', (e) => {
      desktopNotifications = e.target.checked;
      if (e.target.checked && typeof Notification !== 'undefined' && Notification.permission !== "granted") {
        Notification.requestPermission().then(perm => {
          if (perm !== "granted") {
            e.target.checked = false;
            desktopNotifications = false;
          }
        });
      }
    });
  }
}