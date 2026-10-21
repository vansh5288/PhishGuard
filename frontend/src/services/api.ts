import { AnalysisRequest, AnalysisResponse, BrandAssessment, Prediction, ScanHistoryItem, StatsResponse, UncertaintyAssessment, UrlFeatures } from '../types';

export const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

export class ApiConnectionError extends Error {
  public endpoint: string;
  public status?: number;
  public isNetworkError: boolean;

  constructor(message: string, endpoint: string, isNetworkError = false, status?: number) {
    super(message);
    this.name = 'ApiConnectionError';
    this.endpoint = endpoint;
    this.isNetworkError = isNetworkError;
    this.status = status;
  }
}

function normalizeThreatLevel(maliciousProbability: number): string {
  if (maliciousProbability >= 0.8) return 'CRITICAL';
  if (maliciousProbability >= 0.6) return 'HIGH';
  if (maliciousProbability > 0.3) return 'MEDIUM';
  return 'LOW';
}

function normalizePrediction(prediction?: string): Prediction {
  switch (String(prediction || '').toLowerCase()) {
    case 'legitimate':
      return 'legitimate';
    case 'phishing':
      return 'phishing';
    case 'defacement':
      return 'defacement';
    case 'malware':
      return 'malware';
    default:
      throw new Error(`Unsupported model prediction: ${String(prediction)}`);
  }
}

function normalizeExplanation(explanation?: Array<Record<string, unknown>>): string[] {
  if (!Array.isArray(explanation)) return [];

  return explanation.slice(0, 5).map((item) => {
    const feature = String(item.feature || 'signal');
    const value = item.value;
    if (value !== undefined && value !== null) {
      return `${feature}=${String(value)} contributed to the verdict`;
    }
    return `${feature} contributed to the verdict`;
  });
}

function normalizeFeatures(value: unknown): UrlFeatures | undefined {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (typeof parsed !== 'object' || parsed === null) return undefined;

  const candidate = parsed as Record<string, unknown>;
  const featureNames: (keyof UrlFeatures)[] = [
    'url_length',
    'hostname_length',
    'path_length',
    'dot_count',
    'hyphen_count',
    'digit_count',
    'special_character_count',
    'subdirectory_count',
    'has_https',
    'query_length',
  ];
  if (!featureNames.every((name) => typeof candidate[name] === 'number' && Number.isFinite(candidate[name]))) {
    return undefined;
  }

  return {
    url_length: candidate.url_length as number,
    hostname_length: candidate.hostname_length as number,
    path_length: candidate.path_length as number,
    dot_count: candidate.dot_count as number,
    hyphen_count: candidate.hyphen_count as number,
    digit_count: candidate.digit_count as number,
    special_character_count: candidate.special_character_count as number,
    subdirectory_count: candidate.subdirectory_count as number,
    has_https: candidate.has_https as number,
    query_length: candidate.query_length as number,
  };
}

function finiteNumber(value: unknown): number | undefined {
  if (
    value === null ||
    value === undefined ||
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeUncertainty(record: Record<string, any>): UncertaintyAssessment | undefined {
  const uncertainty =
    typeof record.uncertainty === 'object' && record.uncertainty !== null
      ? record.uncertainty as Record<string, unknown>
      : {};
  const reviewRequired = uncertainty.review_required ?? uncertainty.needs_review ?? record.needs_review;
  const predictedClass = uncertainty.predicted_class ?? uncertainty.prediction ?? record.prediction ?? record.result;
  const maxProbability = finiteNumber(
    uncertainty.max_class_probability ?? uncertainty.confidence ?? record.confidence ?? record.probability,
  );
  const probabilityMargin = finiteNumber(
    uncertainty.top_two_probability_margin ?? uncertainty.confidence_margin ?? record.confidence_margin,
  );

  if (
    typeof reviewRequired !== 'boolean' &&
    reviewRequired !== 0 &&
    reviewRequired !== 1
  ) {
    return undefined;
  }
  if (
    typeof predictedClass !== 'string' ||
    !predictedClass ||
    maxProbability === undefined ||
    maxProbability < 0 ||
    maxProbability > 1 ||
    probabilityMargin === undefined ||
    probabilityMargin < 0 ||
    probabilityMargin > 1
  ) {
    return undefined;
  }

  const rawReasons =
    uncertainty.reasons ??
    uncertainty.reason ??
    record.uncertainty_reasons;
  const reasons = Array.isArray(rawReasons)
    ? rawReasons.filter((reason): reason is string => typeof reason === 'string' && reason.trim().length > 0)
    : typeof rawReasons === 'string' && rawReasons.trim()
      ? [rawReasons]
      : [];

  return {
    review_required: reviewRequired === true || reviewRequired === 1,
    predicted_class: predictedClass.toLowerCase(),
    max_class_probability: maxProbability,
    top_two_probability_margin: probabilityMargin,
    reasons,
  };
}

function normalizeBrandAssessment(record: Record<string, any>): BrandAssessment | undefined {
  const source = record.brand_assessment;
  if (typeof source !== 'object' || source === null || typeof source.status !== 'string') {
    return undefined;
  }
  const reasons = Array.isArray(source.reasons)
    ? source.reasons.filter((reason: unknown): reason is string => typeof reason === 'string')
    : [];

  return {
    status: source.status,
    hostname: typeof source.hostname === 'string' ? source.hostname : null,
    matched_brand: typeof source.matched_brand === 'string' ? source.matched_brand : null,
    matched_domain: typeof source.matched_domain === 'string' ? source.matched_domain : null,
    reasons,
  };
}

function normalizeScanRecord(record: Record<string, any>): ScanHistoryItem {
  const probability = Number(record.probability ?? record.confidence ?? 0);
  const url = String(record.url || '');
  const prediction = normalizePrediction(record.prediction || record.result);
  const inferredMaliciousProbability =
    prediction === 'legitimate' ? 1 - probability : probability;
  const maliciousProbability = Number(
    record.malicious_probability ?? inferredMaliciousProbability,
  );
  const riskScore = Math.max(
    0,
    Math.min(100, Math.round(maliciousProbability * 100 || 0)),
  );
  const features = normalizeFeatures(record.features ?? record.features_json);

  return {
    id: String(record.scan_id ?? record.id ?? `scan_${Date.now()}`),
    url,
    prediction,
    risk_score: riskScore,
    confidence: Number.isFinite(probability) ? probability : 0.5,
    malicious_probability: maliciousProbability,
    threat_level: normalizeThreatLevel(maliciousProbability),
    reasons: normalizeExplanation(record.explanation),
    timestamp: String(record.created_at || record.timestamp || new Date().toISOString()),
    features,
    uncertainty: normalizeUncertainty(record),
    brand_assessment: normalizeBrandAssessment(record),
    stability_assessment: record.stability_assessment,
  };
}

function normalizeStatsRecord(data: Record<string, any>): StatsResponse {
  const totalScans = Number(data.total_scans ?? data.total ?? 0);
  const classDistribution = {
    legitimate: Number(data.legitimate_scans ?? data.class_distribution?.legitimate ?? 0),
    phishing: Number(data.phishing_scans ?? data.class_distribution?.phishing ?? 0),
    defacement: Number(data.defacement_scans ?? data.class_distribution?.defacement ?? 0),
    malware: Number(data.malware_scans ?? data.class_distribution?.malware ?? 0),
  };
  const maliciousDetected = Number(
    data.malicious_scans ??
      data.malicious_detected ??
      classDistribution.phishing + classDistribution.defacement + classDistribution.malware,
  );
  const modelInfo = data.model_info
    ? {
        name: String(data.model_info.name || 'Unknown'),
        feature_count: Number(data.model_info.feature_count || 0),
        class_labels: Array.isArray(data.model_info.class_labels)
          ? data.model_info.class_labels.map(String)
          : [],
        metrics: Object.fromEntries(
          Object.entries(data.model_info.metrics || {}).map(([key, value]) => [
            key,
            Number(value),
          ]),
        ),
        prediction_time:
          data.model_info.prediction_time === undefined
            ? undefined
            : Number(data.model_info.prediction_time),
      }
    : undefined;

  return {
    total_scans: totalScans,
    malicious_detected: maliciousDetected,
    phishing_detected: classDistribution.phishing,
    defacement_detected: classDistribution.defacement,
    malware_detected: classDistribution.malware,
    safe_urls: classDistribution.legitimate,
    detection_accuracy: Number(modelInfo?.metrics.Accuracy ?? data.detection_accuracy ?? 0) * 100,
    class_distribution: classDistribution,
    threat_distribution: {
      critical: Number(data.threat_distribution?.critical ?? 0),
      high: Number(data.threat_distribution?.high ?? 0),
      medium: Number(data.threat_distribution?.medium ?? 0),
      low: Number(data.threat_distribution?.low ?? 0),
    },
    recent_trend: data.recent_trend || undefined,
    common_threat_vectors: data.common_threat_vectors || undefined,
    model_info: modelInfo,
  };
}

/**
 * Analyzes a URL by sending POST /api/analyze to the FastAPI backend.
 */
export async function analyzeUrl(url: string): Promise<AnalysisResponse> {
  const endpoint = `${API_BASE_URL}/api/analyze`;
  const body: AnalysisRequest = { url };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorDetail = `Backend returned HTTP ${response.status}`;
      try {
        const errJson = await response.json();
        if (errJson.detail) {
          errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
        } else if (errJson.message) {
          errorDetail = errJson.message;
        }
      } catch {
        // ignore json parse error
      }
      throw new ApiConnectionError(errorDetail, endpoint, false, response.status);
    }

    const data = await response.json();
    const normalized = normalizeScanRecord(data);

    return {
      ...normalized,
      id: normalized.id,
      timestamp: normalized.timestamp,
      features: normalized.features,
      reasons: normalized.reasons,
    };
  } catch (error: unknown) {
    if (error instanceof ApiConnectionError) {
      throw error;
    }

    const msg = (error as Error)?.message || 'Failed to fetch';
    throw new ApiConnectionError(
      `Unable to connect to PhishGuard API at ${API_BASE_URL}: ${msg}`,
      endpoint,
      true
    );
  }
}

/**
 * Fetches dashboard and model statistics from GET /api/stats.
 */
export async function fetchStats(): Promise<StatsResponse> {
  const endpoint = `${API_BASE_URL}/api/stats`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new ApiConnectionError(`HTTP ${response.status}`, endpoint, false, response.status);
    }

    const data = await response.json();
    return normalizeStatsRecord(data || {});
  } catch (error: unknown) {
    if (error instanceof ApiConnectionError) throw error;
    throw new ApiConnectionError(
      `Unable to connect to PhishGuard API at ${API_BASE_URL}`,
      endpoint,
      true
    );
  }
}

/**
 * Fetches scan history from GET /api/history.
 */
export async function fetchHistory(): Promise<ScanHistoryItem[]> {
  const endpoint = `${API_BASE_URL}/api/history`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new ApiConnectionError(`HTTP ${response.status}`, endpoint, false, response.status);
    }

    const data = await response.json();
    const records = Array.isArray(data) ? data : Array.isArray(data?.scans) ? data.scans : [];
    return records.map(normalizeScanRecord);
  } catch (error: unknown) {
    if (error instanceof ApiConnectionError) throw error;
    throw new ApiConnectionError(
      `Unable to connect to PhishGuard API at ${API_BASE_URL}`,
      endpoint,
      true
    );
  }
}

/**
 * Deletes a scan by ID from the FastAPI backend (DELETE /api/history/{scan_id}).
 */
export async function deleteScan(scanId: string | number): Promise<void> {
  const numericId = typeof scanId === 'number' ? scanId : parseInt(scanId, 10);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return;
  }

  const endpoint = `${API_BASE_URL}/api/history/${numericId}`;
  try {
    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok && response.status !== 404) {
      throw new ApiConnectionError(`HTTP ${response.status}`, endpoint, false, response.status);
    }
  } catch (error: unknown) {
    if (error instanceof ApiConnectionError) throw error;
    console.warn(`Could not delete scan ${scanId} from backend:`, error);
  }
}

/**
 * Fetches specific scan details from GET /api/history/{scan_id}.
 */
export async function fetchScanDetail(scanId: string | number): Promise<ScanHistoryItem> {
  const numericId = typeof scanId === 'number' ? scanId : parseInt(scanId, 10);
  const endpoint = `${API_BASE_URL}/api/history/${numericId}`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new ApiConnectionError(`HTTP ${response.status}`, endpoint, false, response.status);
    }

    const data = await response.json();
    return normalizeScanRecord(data);
  } catch (error: unknown) {
    if (error instanceof ApiConnectionError) throw error;
    throw new ApiConnectionError(
      `Unable to fetch scan detail from ${endpoint}`,
      endpoint,
      true
    );
  }
}

/**
 * Health check helper to verify if the FastAPI backend is running.
 */
export async function checkBackendHealth(): Promise<{ isOnline: boolean; latencyMs?: number; error?: string }> {
  const start = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(`${API_BASE_URL}/`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      return { isOnline: false, error: `HTTP ${res.status}` };
    }
    const latencyMs = Math.round(performance.now() - start);
    return { isOnline: true, latencyMs };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    return {
      isOnline: false,
      error: (err as Error)?.message || 'Connection refused',
    };
  }
}
