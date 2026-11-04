// ============================================================
// INTELLIGENT ALERTS & RISK PRIORITIZATION ENGINE
// Severity scoring, explainable prioritization rules, audio cues,
// desktop notifications, and email/webhook dispatch with history.
// ============================================================

export class AlertEngine {
  constructor() {
    this.alertHistory = this.loadHistory();
    this.emailConfig = this.loadEmailConfig();
    this.notificationLog = this.loadNotificationLog();
    this.audioContext = null;
  }

  loadHistory() {
    try {
      const stored = localStorage.getItem('ai_alert_history');
      if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return [];
  }

  saveHistory() {
    try {
      localStorage.setItem('ai_alert_history', JSON.stringify(this.alertHistory.slice(0, 100)));
    } catch { /* ignore */ }
  }

  loadEmailConfig() {
    try {
      const stored = localStorage.getItem('ai_email_config');
      if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return {
      enabled: false,
      endpoint: '', // Webhook or SMTP API URL
      recipientEmails: 'security-duty@dsatm.edu',
      notifyOnCritical: true,
      notifyOnHigh: true,
      notifyOnMedium: false,
      authToken: ''
    };
  }

  saveEmailConfig() {
    try {
      localStorage.setItem('ai_email_config', JSON.stringify(this.emailConfig));
    } catch { /* ignore */ }
  }

  loadNotificationLog() {
    try {
      const stored = localStorage.getItem('ai_notification_dispatch_log');
      if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return [];
  }

  saveNotificationLog() {
    try {
      localStorage.setItem('ai_notification_dispatch_log', JSON.stringify(this.notificationLog.slice(0, 50)));
    } catch { /* ignore */ }
  }

  // Explainable Risk Scoring Matrix
  calculateRiskScore(category, details = {}) {
    let baseScore = 50;
    let severity = 'Medium';
    let explanation = '';

    switch (category) {
      case 'Restricted Intrusion':
        baseScore = 95;
        severity = 'Critical';
        explanation = 'Physical breach of secured perimeter without authorization presents immediate security threat.';
        break;
      case 'Fall Detected':
        baseScore = 92;
        severity = 'Critical';
        explanation = 'Sudden horizontal posture transition indicates medical collapse or physical injury requiring immediate first aid.';
        break;
      case 'Overcrowding':
        baseScore = 82;
        severity = 'High';
        explanation = 'Density exceeds architectural safety threshold, escalating crush/stampede hazards.';
        break;
      case 'Loitering Alert':
        baseScore = 74;
        severity = 'High';
        explanation = 'Protracted stationary presence in high-security buffer zone violates transit protocols.';
        break;
      case 'No ID Card':
        baseScore = 60;
        severity = 'Medium';
        explanation = 'Unverified credential in controlled sector breaches campus access policy.';
        break;
      case 'Mask Violation':
        baseScore = 55;
        severity = 'Medium';
        explanation = 'Health compliance protocol non-adherence in shared enclosed public area.';
        break;
      case 'Unusual Movement':
        baseScore = 50;
        severity = 'Low';
        explanation = 'Kinematic velocity anomaly deviated from mean crowd movement patterns.';
        break;
      default:
        baseScore = 40;
        severity = 'Low';
        explanation = 'Nominal security telemetry event.';
    }

    return { score: baseScore, severity, explanation };
  }

  dispatchAlert(incident) {
    const risk = this.calculateRiskScore(incident.category);
    const alertEntry = {
      id: `ALT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      incidentId: incident.id,
      title: incident.title,
      description: incident.description,
      category: incident.category,
      severity: incident.severity || risk.severity,
      riskScore: risk.score,
      explanation: risk.explanation,
      camera: incident.camera,
      zone: incident.zone,
      timestamp: new Date().toISOString(),
      acknowledged: false
    };

    this.alertHistory.unshift(alertEntry);
    this.saveHistory();

    // 1. Play synthesized alert audio tone
    this.playAudioCue(alertEntry.severity);

    // 2. Trigger desktop notification if permitted
    this.showDesktopNotification(alertEntry);

    // 3. Dispatch external email / webhook notification if configured
    this.dispatchExternalNotification(alertEntry);

    // 4. Update UI DOM elements if present
    this.updateDomBadge();
    this.prependAlertToDOM(alertEntry);

    return alertEntry;
  }

  playAudioCue(severity) {
    try {
      const audioPref = localStorage.getItem('ai_setting_audio');
      if (audioPref === 'false') return;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.audioContext) {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      osc.connect(gain);
      gain.connect(this.audioContext.destination);

      const now = this.audioContext.currentTime;
      if (severity === 'Critical') {
        // High double beep
        osc.frequency.setValueAtTime(880, now); // A5
        osc.frequency.setValueAtTime(1174.66, now + 0.12); // D6
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (severity === 'High') {
        // Warning chime
        osc.frequency.setValueAtTime(659.25, now); // E5
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch { /* audio not allowed or failed */ }
  }

  showDesktopNotification(alert) {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(`[${alert.severity.toUpperCase()}] ${alert.title}`, {
          body: `${alert.description} (${alert.zone})`,
          icon: '/favicon.svg'
        });
      }
    } catch { /* ignore */ }
  }

  async dispatchExternalNotification(alert) {
    if (!this.emailConfig.enabled) return;

    // Check severity rule filter
    if (alert.severity === 'Critical' && !this.emailConfig.notifyOnCritical) return;
    if (alert.severity === 'High' && !this.emailConfig.notifyOnHigh) return;
    if (alert.severity === 'Medium' && !this.emailConfig.notifyOnMedium) return;

    const payload = {
      timestamp: alert.timestamp,
      incidentId: alert.incidentId,
      severity: alert.severity,
      title: alert.title,
      zone: alert.zone,
      camera: alert.camera,
      recipients: this.emailConfig.recipientEmails,
      explanation: alert.explanation
    };

    const logEntry = {
      id: `DISP-${Date.now()}`,
      timestamp: new Date().toISOString(),
      recipients: this.emailConfig.recipientEmails,
      subject: `[SECURITY ALERT - ${alert.severity}] ${alert.title}`,
      severity: alert.severity,
      status: 'Dispatched',
      details: `Dispatched to ${this.emailConfig.recipientEmails}`
    };

    if (this.emailConfig.endpoint && this.emailConfig.endpoint.startsWith('http')) {
      try {
        const res = await fetch(this.emailConfig.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.emailConfig.authToken ? { 'Authorization': `Bearer ${this.emailConfig.authToken}` } : {})
          },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        logEntry.status = 'Delivered (HTTP 200)';
      } catch (err) {
        logEntry.status = `Failed: ${err.message}`;
      }
    } else {
      // Simulated secure SMTP dispatch when no remote endpoint specified
      logEntry.status = 'Simulated Delivery (Local SMTP Queue)';
    }

    this.notificationLog.unshift(logEntry);
    this.saveNotificationLog();
  }

  updateDomBadge() {
    if (typeof document === 'undefined') return;
    const unacknowledgedCount = this.alertHistory.filter(a => !a.acknowledged).length;
    const badge = document.getElementById('nav-badge');
    if (badge) {
      badge.textContent = unacknowledgedCount;
      badge.style.display = unacknowledgedCount > 0 ? 'inline-block' : 'none';
    }
  }

  prependAlertToDOM(alert) {
    if (typeof document === 'undefined') return;
    const alertList = document.getElementById('alert-list');
    if (!alertList) return;

    const div = document.createElement('div');
    const colorClass = alert.severity === 'Critical' ? 'critical' : (alert.severity === 'High' ? 'warning' : 'info');
    const iconClass = alert.severity === 'Critical' ? 'bx-error-circle' : (alert.severity === 'High' ? 'bx-error' : 'bx-info-circle');

    div.className = `alert-item ${colorClass}`;
    div.innerHTML = `
      <i class='bx ${iconClass}'></i>
      <div class="alert-content">
        <div class="alert-title">${alert.title}</div>
        <div class="alert-time"><i class='bx bx-time'></i> ${new Date(alert.timestamp).toLocaleTimeString()} &middot; ${alert.zone}</div>
        <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:2px;">${alert.description}</div>
      </div>
      <button class="btn-text alert-ack-btn" data-id="${alert.id}" title="Acknowledge"><i class='bx bx-check'></i></button>
    `;

    alertList.insertBefore(div, alertList.firstChild);
    while (alertList.children.length > 15) {
      alertList.removeChild(alertList.lastChild);
    }
  }
}
