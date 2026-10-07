export type ThreatLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Prediction = 'phishing' | 'legitimate' | 'defacement' | 'malware';

export interface AnalysisRequest {
  url: string;
}

export interface UrlFeatures {
  url_length: number;
  hostname_length: number;
  path_length: number;
  dot_count: number;
  hyphen_count: number;
  digit_count: number;
  special_character_count: number;
  subdirectory_count: number;
  has_https: number;
  query_length: number;
}

export interface AnalysisResponse {
  url: string;
  prediction: Prediction | string;
  risk_score: number;
  confidence: number;
  malicious_probability?: number;
  threat_level: ThreatLevel | string;
  reasons: string[];
  id?: string;
  timestamp?: string;
  features?: UrlFeatures;
}

export interface StatsResponse {
  total_scans: number;
  malicious_detected: number;
  phishing_detected: number;
  defacement_detected: number;
  malware_detected: number;
  safe_urls: number;
  detection_accuracy: number;
  class_distribution: {
    legitimate: number;
    phishing: number;
    defacement: number;
    malware: number;
  };
  threat_distribution: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  recent_trend?: Array<{
    date: string;
    malicious: number;
    legitimate: number;
    total: number;
  }>;
  common_threat_vectors?: Array<{
    factor: string;
    count: number;
    percentage: number;
  }>;
  model_info?: {
    name: string;
    feature_count: number;
    class_labels: string[];
    metrics: Record<string, number>;
    prediction_time?: number;
  };
}

export interface ScanHistoryItem extends AnalysisResponse {
  id: string;
  timestamp: string;
}

export type ActiveTab = 'dashboard' | 'analyze' | 'history' | 'analytics' | 'about';
