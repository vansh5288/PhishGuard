import { MODEL_FEATURE_NAMES } from '../utils/featureExtractor';

export type Prediction = 'LEGITIMATE' | 'PHISHING' | 'DEFACEMENT' | 'MALWARE';

export interface FeatureValues {
  [feature: string]: number;
}

export interface ShapExplanation {
  feature: string;
  value: number;
  shap_value: number;
  impact: 'positive' | 'negative';
}

export interface BrandAssessment {
  status: string | null;
  hostname?: string | null;
  matched_brand?: string | null;
  matched_domain?: string | null;
  reasons: string[];
}

export interface UncertaintyAssessment {
  review_required: boolean;
  predicted_class: string;
  max_class_probability: number;
  top_two_probability_margin: number;
  reasons: string[];
}

export interface StabilityCheck {
  check_id: string;
  name: string;
  description: string;
  transformed_url: string;
  predicted_class: string;
  probability: number;
  consistent: boolean;
}

export interface StabilitySkippedCheck {
  check_id: string;
  name: string;
  reason: string;
}

export interface StabilityAssessment {
  status: 'stable' | 'unstable' | 'unavailable';
  original_prediction: string;
  prediction_stability: number | null;
  transformations_tested: number;
  consistent_predictions: number;
  checks: StabilityCheck[];
  skipped_checks: StabilitySkippedCheck[];
  explanation: string;
  limitations: string;
  summary: string;
}

export interface ScanRecord {
  id: number;
  url: string;
  prediction: Prediction;
  probability: number;
  probabilities?: Record<string, number>;
  malicious_probability: number;
  risk_score: number;
  risk: string;
  confidence?: number | null;
  confidence_margin?: number | null;
  entropy?: number | null;
  needs_review?: boolean | null;
  features?: FeatureValues | null;
  explanation: ShapExplanation[];
  uncertainty?: UncertaintyAssessment | null;
  brand_assessment?: BrandAssessment | null;
  stability_assessment?: StabilityAssessment | null;
  created_at: string;
}

export interface ScanHistoryPage {
  scans: ScanRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface StatsResponse {
  total_scans: number;
  legitimate_scans: number;
  phishing_scans: number;
  defacement_scans: number;
  malware_scans: number;
  malicious_scans: number;
  safe_scans: number;
  suspicious_scans: number;
  average_probability: number;
  recent_trend: Array<{
    date: string;
    malicious: number;
    legitimate: number;
    total: number;
  }>;
  threat_distribution: Record<'critical' | 'high' | 'medium' | 'low', number>;
  model_info: {
    name: string;
    feature_count: number;
    class_labels: string[];
    metrics: Record<string, number>;
    prediction_time?: number;
  };
}

export interface BrandRegistryResponse {
  registry: {
    title?: string;
    description?: string;
    generated_at?: string;
    verification_method?: string;
    notes?: string;
  };
  brands: Array<{
    id: string;
    name: string;
    official_domains: string[];
    aliases: string[];
    verification?: {
      method?: string;
      source?: string;
      verified_at?: string;
      notes?: string;
    };
  }>;
}

export type JsonArtifact = Record<string, unknown>;

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 30_000;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly endpoint: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function requireNonNegativeNumber(value: unknown, field: string): number {
  if (!isFiniteNumber(value) || value < 0) {
    throw new Error(`Backend returned an invalid ${field}`);
  }
  return value;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const endpoint = `${API_BASE_URL}${path}`;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      let message = `Backend returned HTTP ${response.status}`;
      try {
        const body: unknown = await response.json();
        if (isRecord(body) && typeof body.detail === 'string') message = body.detail;
      } catch {
        // Keep the HTTP status message when error responses are not JSON.
      }
      throw new ApiError(message, endpoint, response.status);
    }

    try {
      return await response.json() as T;
    } catch (error) {
      throw new ApiError(
        `Backend returned malformed JSON: ${error instanceof Error ? error.message : 'invalid response'}`,
        endpoint,
        response.status,
      );
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`, endpoint);
    }
    throw new ApiError(
      `Unable to connect to the PhishGuard API at ${API_BASE_URL}: ${error instanceof Error ? error.message : 'network error'}`,
      endpoint,
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

function isPrediction(value: unknown): value is Prediction {
  return value === 'LEGITIMATE' || value === 'PHISHING' || value === 'DEFACEMENT' || value === 'MALWARE';
}

function normalizeScan(value: unknown): ScanRecord {
  if (!isRecord(value) || !isPrediction(value.prediction) || typeof value.url !== 'string') {
    throw new Error('Backend returned a scan with an invalid URL or prediction');
  }
  const id = Number(value.id ?? value.scan_id);
  const probability = Number(value.probability ?? value.confidence);
  const maliciousProbability = Number(value.malicious_probability);
  if (
    !Number.isSafeInteger(id) || id < 1 ||
    !Number.isFinite(probability) || probability < 0 || probability > 1 ||
    !Number.isFinite(maliciousProbability) || maliciousProbability < 0 || maliciousProbability > 1
  ) {
    throw new Error('Backend returned invalid scan probability or identifier values');
  }

  const features = isRecord(value.features) &&
    Object.values(value.features).every((feature) => typeof feature === 'number' && Number.isFinite(feature))
    ? value.features as FeatureValues
    : null;
  const explanation = Array.isArray(value.explanation)
    ? value.explanation.filter((item): item is ShapExplanation =>
      isRecord(item) && typeof item.feature === 'string' &&
      typeof item.shap_value === 'number' && Number.isFinite(item.shap_value) &&
      (item.impact === 'positive' || item.impact === 'negative') &&
      typeof item.value === 'number' && Number.isFinite(item.value))
    : [];
  const uncertaintyValue = isRecord(value.uncertainty) ? value.uncertainty : null;
  const uncertainty = uncertaintyValue &&
    typeof uncertaintyValue.review_required === 'boolean' &&
    typeof uncertaintyValue.predicted_class === 'string' &&
    typeof uncertaintyValue.max_class_probability === 'number' &&
    typeof uncertaintyValue.top_two_probability_margin === 'number'
    ? {
      review_required: uncertaintyValue.review_required,
      predicted_class: uncertaintyValue.predicted_class,
      max_class_probability: uncertaintyValue.max_class_probability,
      top_two_probability_margin: uncertaintyValue.top_two_probability_margin,
      reasons: Array.isArray(uncertaintyValue.reasons)
        ? uncertaintyValue.reasons.filter((reason): reason is string => typeof reason === 'string')
        : [],
    }
    : null;
  const brandValue = isRecord(value.brand_assessment) ? value.brand_assessment : null;
  const brandAssessment = brandValue
    ? {
      status: typeof brandValue.status === 'string' ? brandValue.status : null,
      hostname: typeof brandValue.hostname === 'string' ? brandValue.hostname : null,
      matched_brand: typeof brandValue.matched_brand === 'string' ? brandValue.matched_brand : null,
      matched_domain: typeof brandValue.matched_domain === 'string' ? brandValue.matched_domain : null,
      reasons: Array.isArray(brandValue.reasons)
        ? brandValue.reasons.filter((reason): reason is string => typeof reason === 'string')
        : [],
    }
    : null;

  const stabilityValue = isRecord(value.stability_assessment) ? value.stability_assessment : null;
  const stabilityAssessment: StabilityAssessment | null = stabilityValue &&
    (stabilityValue.status === 'stable' || stabilityValue.status === 'unstable' || stabilityValue.status === 'unavailable')
    ? {
      status: stabilityValue.status as 'stable' | 'unstable' | 'unavailable',
      original_prediction: typeof stabilityValue.original_prediction === 'string' ? stabilityValue.original_prediction : String(value.prediction || ''),
      prediction_stability: typeof stabilityValue.prediction_stability === 'number' ? stabilityValue.prediction_stability : null,
      transformations_tested: typeof stabilityValue.transformations_tested === 'number' ? stabilityValue.transformations_tested : 0,
      consistent_predictions: typeof stabilityValue.consistent_predictions === 'number' ? stabilityValue.consistent_predictions : 0,
      checks: Array.isArray(stabilityValue.checks)
        ? stabilityValue.checks
            .filter((c): c is Record<string, unknown> => isRecord(c))
            .map((c) => ({
              check_id: String(c.check_id || ''),
              name: String(c.name || ''),
              description: String(c.description || ''),
              transformed_url: String(c.transformed_url || ''),
              predicted_class: String(c.predicted_class || ''),
              probability: typeof c.probability === 'number' ? c.probability : 0,
              consistent: Boolean(c.consistent),
            }))
        : [],
      skipped_checks: Array.isArray(stabilityValue.skipped_checks)
        ? stabilityValue.skipped_checks
            .filter((c): c is Record<string, unknown> => isRecord(c))
            .map((c) => ({
              check_id: String(c.check_id || ''),
              name: String(c.name || ''),
              reason: String(c.reason || ''),
            }))
        : [],
      explanation: typeof stabilityValue.explanation === 'string' ? stabilityValue.explanation : '',
      limitations: typeof stabilityValue.limitations === 'string' ? stabilityValue.limitations : '',
      summary: typeof stabilityValue.summary === 'string' ? stabilityValue.summary : '',
    }
    : null;

  const probabilities = isRecord(value.probabilities) &&
    Object.values(value.probabilities).every((score) =>
      typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 1)
    ? value.probabilities as Record<string, number>
    : undefined;
  if (probabilities && Math.abs(Object.values(probabilities).reduce((sum, score) => sum + score, 0) - 1) >= 0.01) {
    throw new Error('Backend returned a non-normalized class probability distribution');
  }
  const riskScore = Number(value.risk_score ?? maliciousProbability);
  if (!Number.isFinite(riskScore) || riskScore < 0 || riskScore > 1) {
    throw new Error('Backend returned an invalid risk score');
  }

  return {
    id,
    url: value.url,
    prediction: value.prediction,
    probability,
    probabilities,
    malicious_probability: maliciousProbability,
    risk_score: riskScore,
    risk: typeof value.risk === 'string' ? value.risk : 'UNAVAILABLE',
    confidence: typeof value.confidence === 'number' ? value.confidence : null,
    confidence_margin: typeof value.confidence_margin === 'number' ? value.confidence_margin : null,
    entropy: typeof value.entropy === 'number' ? value.entropy : null,
    needs_review: typeof value.needs_review === 'boolean' ? value.needs_review : null,
    features,
    explanation,
    uncertainty,
    brand_assessment: brandAssessment,
    stability_assessment: stabilityAssessment,
    created_at: typeof value.created_at === 'string' ? value.created_at : '',
  };
}

export async function analyzeUrl(url: string): Promise<ScanRecord> {
  const response = await requestJson<unknown>('/api/analyze', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
  const scan = normalizeScan(response);
  if (!scan.probabilities) throw new Error('Backend response did not include class probabilities');
  const requiredClasses: Prediction[] = ['LEGITIMATE', 'PHISHING', 'DEFACEMENT', 'MALWARE'];
  if (!requiredClasses.every((label) => label in scan.probabilities!)) {
    throw new Error('Backend response did not include all four model classes');
  }
  if (!scan.features || !MODEL_FEATURE_NAMES.every((feature) => feature in scan.features!)) {
    throw new Error('Backend response did not include the complete model feature vector');
  }
  if (!scan.explanation.length || !scan.uncertainty || !scan.brand_assessment || !scan.stability_assessment) {
    throw new Error('Backend response omitted model explanation or supporting assessments');
  }
  return scan;
}

export async function fetchHistory(options: {
  limit?: number;
  offset?: number;
  prediction?: string;
  search?: string;
} = {}): Promise<ScanHistoryPage> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? 50),
    offset: String(options.offset ?? 0),
  });
  if (options.prediction && options.prediction !== 'all') params.set('prediction', options.prediction);
  if (options.search) params.set('search', options.search);
  const response = await requestJson<unknown>(`/api/history?${params}`);
  if (!isRecord(response) || !Array.isArray(response.scans)) {
    throw new Error('Backend returned malformed scan history');
  }
  const total = Number(response.total);
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error('Backend returned an invalid scan-history total');
  }
  return {
    scans: response.scans.map(normalizeScan),
    total,
    limit: Number(response.limit ?? options.limit ?? 50),
    offset: Number(response.offset ?? options.offset ?? 0),
  };
}

export function fetchScanDetail(id: number): Promise<ScanRecord> {
  return requestJson<unknown>(`/api/history/${id}`).then(normalizeScan);
}

export function deleteScan(id: number): Promise<{ message: string; scan_id: number }> {
  return requestJson(`/api/history/${id}`, { method: 'DELETE' });
}

export async function fetchStats(): Promise<StatsResponse> {
  const response: unknown = await requestJson('/api/stats');
  if (!isRecord(response) || !isRecord(response.threat_distribution) || !isRecord(response.model_info)) {
    throw new Error('Backend returned malformed analytics');
  }
  const rawThreatDistribution = response.threat_distribution;
  const counts = [
    'total_scans',
    'legitimate_scans',
    'phishing_scans',
    'defacement_scans',
    'malware_scans',
    'malicious_scans',
    'safe_scans',
    'suspicious_scans',
  ] as const;
  const normalizedCounts = Object.fromEntries(
    counts.map((key) => [key, requireNonNegativeNumber(response[key], key)]),
  ) as Pick<StatsResponse, typeof counts[number]>;
  const threatLevels = ['critical', 'high', 'medium', 'low'] as const;
  const threatDistribution = Object.fromEntries(
    threatLevels.map((key) => [key, requireNonNegativeNumber(rawThreatDistribution[key], `threat_distribution.${key}`)]),
  ) as StatsResponse['threat_distribution'];
  const modelInfo = response.model_info;
  if (
    typeof modelInfo.name !== 'string' ||
    !Array.isArray(modelInfo.class_labels) ||
    !modelInfo.class_labels.every((label) => typeof label === 'string') ||
    !isRecord(modelInfo.metrics) ||
    !Object.values(modelInfo.metrics).every(isFiniteNumber)
  ) {
    throw new Error('Backend returned malformed model metadata');
  }
  const recentTrend = response.recent_trend;
  if (!Array.isArray(recentTrend) || !recentTrend.every((day) =>
    isRecord(day) && typeof day.date === 'string' &&
    isFiniteNumber(day.malicious) && isFiniteNumber(day.legitimate) && isFiniteNumber(day.total))) {
    throw new Error('Backend returned malformed scan trends');
  }
  return {
    ...normalizedCounts,
    average_probability: requireNonNegativeNumber(response.average_probability, 'average_probability'),
    recent_trend: recentTrend as StatsResponse['recent_trend'],
    threat_distribution: threatDistribution,
    model_info: {
      name: modelInfo.name,
      feature_count: requireNonNegativeNumber(modelInfo.feature_count, 'model_info.feature_count'),
      class_labels: modelInfo.class_labels as string[],
      metrics: modelInfo.metrics as Record<string, number>,
      prediction_time: isFiniteNumber(modelInfo.prediction_time) ? modelInfo.prediction_time : undefined,
    },
  };
}

export async function fetchBrandRegistry(): Promise<BrandRegistryResponse> {
  const response: unknown = await requestJson('/api/brands');
  if (!isRecord(response) || !isRecord(response.registry) || !Array.isArray(response.brands)) {
    throw new Error('Backend returned a malformed brand registry');
  }
  const brands = response.brands.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.name !== 'string' ||
      !Array.isArray(item.official_domains) ||
      !item.official_domains.every((domain) => typeof domain === 'string') ||
      !Array.isArray(item.aliases) ||
      !item.aliases.every((alias) => typeof alias === 'string')
    ) {
      throw new Error('Backend returned an invalid brand registry entry');
    }
    return item as BrandRegistryResponse['brands'][number];
  });
  return {
    registry: response.registry as BrandRegistryResponse['registry'],
    brands,
  };
}

export async function fetchModelEvaluation(): Promise<JsonArtifact> {
  const response: unknown = await requestJson('/api/evaluation');
  if (!isRecord(response)) throw new Error('Backend returned a malformed evaluation artifact');
  return response;
}

export async function fetchRobustnessResults(): Promise<JsonArtifact> {
  const response: unknown = await requestJson('/api/robustness');
  if (!isRecord(response)) throw new Error('Backend returned a malformed robustness artifact');
  return response;
}

export async function fetchApplicationConfig(): Promise<JsonArtifact> {
  const response: unknown = await requestJson('/api/config');
  if (
    !isRecord(response) ||
    typeof response.application !== 'string' ||
    typeof response.classifier !== 'string' ||
    !Array.isArray(response.feature_names) ||
    !response.feature_names.every((feature) => typeof feature === 'string') ||
    !Array.isArray(response.class_labels) ||
    !response.class_labels.every((label) => typeof label === 'string') ||
    typeof response.url_fetching_enabled !== 'boolean'
  ) {
    throw new Error('Backend returned malformed application configuration');
  }
  return response;
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}
