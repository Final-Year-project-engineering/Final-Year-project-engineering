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
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return [];
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
// PROFILE ASSIGNMENT
// ============================================================

function getOrAssignProfile(faceId) {
  if (faceProfileMap.has(faceId)) {
    return faceProfileMap.get(faceId);
  }

  // Use a registered profile if available, otherwise create an unregistered placeholder
  const registeredProfile =
    REGISTERED_DB.length > 0
      ? REGISTERED_DB[(faceId - 1) % REGISTERED_DB.length]
      : null;

  const profile = registeredProfile || {
    name: 'Unregistered',
    regId: '—',
    dept: 'Unknown',
    role: 'Visitor',
    phone: '—',
    email: '—',
    status: 'Unknown',
    gender: ''
  };

  const entry = {
    profile,
    isRegistered: !!registeredProfile,
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
  }

  startSimulation() {
    setInterval(() => this.updateStats(), 2500);
    setInterval(() => this.generateAlert(), 15000);
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

      this.video.classList.toggle(
        'night-vision',
        this.isNightVision
      );

      e.currentTarget.classList.toggle(
        'active',
        this.isNightVision
      );
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
        const nose = landmarks.getNose();
        const jaw = landmarks.getJawOutline();

        const noseTip = nose[6];
        const chin = jaw[8];
        const leftCheek = jaw[3];
        const rightCheek = jaw[13];

        const leftEye = landmarks.getLeftEye()[0];
        const rightEye = landmarks.getRightEye()[0];

        const foreheadX = Math.round(
          ((leftEye.x + rightEye.x) / 2) * scaleX
        );

        const foreheadY = Math.round(
          (leftEye.y - 35) * scaleY
        );

        const noseTipPx = extractCtx.getImageData(
          Math.round(noseTip.x * scaleX),
          Math.round(noseTip.y * scaleY),
          4,
          4
        ).data;

        const chinPx = extractCtx.getImageData(
          Math.round(chin.x * scaleX),
          Math.round(chin.y * scaleY),
          4,
          4
        ).data;

        const foreheadPx = extractCtx.getImageData(
          foreheadX,
          foreheadY,
          4,
          4
        ).data;

        const leftPx = extractCtx.getImageData(
          Math.round(leftCheek.x * scaleX),
          Math.round(leftCheek.y * scaleY),
          4,
          4
        ).data;

        const rightPx = extractCtx.getImageData(
          Math.round(rightCheek.x * scaleX),
          Math.round(rightCheek.y * scaleY),
          4,
          4
        ).data;

        const avg = d => (d[0] + d[1] + d[2]) / 3;

        const skinRef = avg(foreheadPx);

        const noseDiff = Math.abs(avg(noseTipPx) - skinRef);
        const chinDiff = Math.abs(avg(chinPx) - skinRef);
        const leftDiff = Math.abs(avg(leftPx) - skinRef);
        const rightDiff = Math.abs(avg(rightPx) - skinRef);

        const threshold = 30 + (
          this.sensitivity?.value
            ? (100 - this.sensitivity.value) * 0.5
            : 12
        );

        const avgLowerDiff = (
          noseDiff +
          chinDiff +
          leftDiff +
          rightDiff
        ) / 4;

        return avgLowerDiff > threshold;

      } catch (e) {
        return true;
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
          .withFaceExpressions();

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

        const newViolators = [];
        const personRows = [];

        resized.forEach(det => {
          const { box } = det.detection;

          const faceId = assignId(box);
          const profileEntry = getOrAssignProfile(faceId);

          const masked = isMaskWorn(
            det.landmarks,
            scaleX,
            scaleY
          );

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

          personRows.push({
            id: faceId,
            age,
            gender,
            masked,
            conf
          });

          profileEntry.masked = masked;

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

          const color = masked
            ? '#10b981'
            : '#ef4444';

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

          const regName = profileEntry.isRegistered
            ? profileEntry.profile.name.split(' ')[0]
            : 'UNKNOWN';

          const label = masked
            ? `MASK ON · ${emotion.toUpperCase()} · ${regName}`
            : `NO MASK · ${emotion.toUpperCase()} · ${regName}`;

          ctx.font = 'bold 11px Inter, monospace';

          const labelW = ctx.measureText(label).width + 16;

          ctx.fillStyle = masked
            ? 'rgba(16,185,129,0.92)'
            : 'rgba(239,68,68,0.92)';

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
            ? `${profileEntry.profile.dept} · ~${age}yr · ${emotion}`
            : `Unregistered · ~${age}yr · ${emotion}`;

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
          if (noMaskCount === 0) {
            this.cam1Density.innerText = '✓ All Masked';
            this.cam1Density.style.color = '#10b981';
          }
          else {
            this.cam1Density.innerText =
              `⚠ ${noMaskCount} WITHOUT MASK`;

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
        <td colspan="7"
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
    masked
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
          img.classList.toggle('night-vision');
          btnNv.classList.toggle('active', img.classList.contains('night-vision'));
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