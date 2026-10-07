import { ScanHistoryItem, StatsResponse } from '../types';

const STORAGE_KEY_SCANS = 'phishguard_scan_history_v1';

export function getLocalScans(): ScanHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SCANS);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalScan(scan: ScanHistoryItem): ScanHistoryItem[] {
  const current = getLocalScans();
  const filtered = current.filter((item) => item.id !== scan.id);
  const updated = [scan, ...filtered];
  try {
    localStorage.setItem(STORAGE_KEY_SCANS, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save to localStorage:', err);
  }
  return updated;
}

export function clearLocalScans(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_SCANS);
  } catch (err) {
    console.error('Failed to clear localStorage:', err);
  }
}

export function computeStatsFromScans(scans: ScanHistoryItem[]): StatsResponse {
  const total = scans.length;
  const phishing = scans.filter((s) => s.prediction.toLowerCase() === 'phishing').length;
  const defacement = scans.filter((s) => s.prediction.toLowerCase() === 'defacement').length;
  const malware = scans.filter((s) => s.prediction.toLowerCase() === 'malware').length;
  const legitimate = scans.filter((s) => s.prediction.toLowerCase() === 'legitimate').length;
  const malicious = phishing + defacement + malware;

  const distribution = {
    critical: scans.filter((s) => s.threat_level?.toUpperCase() === 'CRITICAL').length,
    high: scans.filter((s) => s.threat_level?.toUpperCase() === 'HIGH').length,
    medium: scans.filter((s) => s.threat_level?.toUpperCase() === 'MEDIUM').length,
    low: scans.filter((s) => s.threat_level?.toUpperCase() === 'LOW' || !s.threat_level).length,
  };
  const trendByDate = new Map<string, { malicious: number; legitimate: number; total: number }>();
  scans.forEach((scan) => {
    const date = new Date(scan.timestamp).toLocaleDateString();
    const counts = trendByDate.get(date) || { malicious: 0, legitimate: 0, total: 0 };
    counts.total += 1;
    if (scan.prediction === 'legitimate') {
      counts.legitimate += 1;
    } else {
      counts.malicious += 1;
    }
    trendByDate.set(date, counts);
  });

  return {
    total_scans: total,
    malicious_detected: malicious,
    phishing_detected: phishing,
    defacement_detected: defacement,
    malware_detected: malware,
    safe_urls: legitimate,
    detection_accuracy: 0,
    class_distribution: { legitimate, phishing, defacement, malware },
    threat_distribution: distribution,
    recent_trend: Array.from(trendByDate, ([date, counts]) => ({ date, ...counts })),
  };
}
