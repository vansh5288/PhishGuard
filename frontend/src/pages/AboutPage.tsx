import React, { useState } from 'react';
import {
  Shield,
  Layers,
  Cpu,
  Database,
  Terminal,
  Code2,
  CheckCircle2,
  BookOpen,
  Server,
  Workflow,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import { API_BASE_URL } from '../services/api';

export const AboutPage: React.FC = () => {
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedEndpoint(id);
    setTimeout(() => setCopiedEndpoint(null), 2000);
  };

  const sampleAnalyzeCurl = `curl -X POST "${API_BASE_URL}/api/analyze" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com/"}'`;

  const sampleStatsCurl = `curl "${API_BASE_URL}/api/stats"`;

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Hero Header */}
      <div className="rounded-xl bg-gradient-to-r from-[#141b2b] via-[#111827] to-[#0c1322] border border-[#1F2937] p-6 sm:p-8 relative overflow-hidden">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono bg-[#06B6D4]/10 border border-[#06B6D4]/30 text-[#22D3EE] mb-3">
            <Layers className="w-3.5 h-3.5" />
            3rd-Year B.Tech CSE / Data Science Project
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#F9FAFB] tracking-tight">
            About PhishGuard Threat Intelligence
          </h1>
          <p className="mt-2 text-sm text-[#9CA3AF] max-w-3xl leading-relaxed">
            PhishGuard classifies submitted URLs as legitimate, phishing, defacement, or malware using a trained model and explains each prediction with SHAP.
          </p>
        </div>
      </div>

      {/* Project Objectives & Core Pillars */}
      <div>
        <h2 className="text-base font-bold text-[#F9FAFB] flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-[#3B82F6]" />
          Project Objectives
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-[#111827] border border-[#1F2937]">
            <div className="w-8 h-8 rounded bg-[#3B82F6]/10 text-[#3B82F6] flex items-center justify-center font-mono font-bold text-sm mb-3">
              01
            </div>
            <h3 className="text-sm font-semibold text-[#F9FAFB]">Four-Class URL Classification</h3>
            <p className="text-xs text-[#9CA3AF] mt-1.5 leading-relaxed">
              Uses ten lexical and structural URL features from the same ordered feature set used to train the model.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-[#111827] border border-[#1F2937]">
            <div className="w-8 h-8 rounded bg-[#06B6D4]/10 text-[#06B6D4] flex items-center justify-center font-mono font-bold text-sm mb-3">
              02
            </div>
            <h3 className="text-sm font-semibold text-[#F9FAFB]">Held-Out Model Evaluation</h3>
            <p className="text-xs text-[#9CA3AF] mt-1.5 leading-relaxed">
              The model is evaluated on a stratified 20% test split. Current measured metrics are shown on the analytics page.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-[#111827] border border-[#1F2937]">
            <div className="w-8 h-8 rounded bg-[#10B981]/10 text-[#10B981] flex items-center justify-center font-mono font-bold text-sm mb-3">
              03
            </div>
            <h3 className="text-sm font-semibold text-[#F9FAFB]">Explainable Security ML</h3>
            <p className="text-xs text-[#9CA3AF] mt-1.5 leading-relaxed">
              Returns the top five SHAP feature contributions for the predicted class, alongside the model's class probabilities.
            </p>
          </div>
        </div>
      </div>

      {/* How the System Works (5-Step Pipeline) */}
      <div className="rounded-lg bg-[#111827] border border-[#1F2937] p-5 sm:p-6">
        <h2 className="text-base font-bold text-[#F9FAFB] flex items-center gap-2 mb-4">
          <Workflow className="w-4 h-4 text-[#06B6D4]" />
          How the System Works (Detection Pipeline)
        </h2>

        <div className="space-y-4">
          <div className="flex items-start gap-3.5 p-3 rounded bg-[#0B0F19] border border-[#1F2937]">
            <div className="w-6 h-6 rounded-full bg-[#3B82F6]/20 text-[#3B82F6] flex items-center justify-center text-xs font-mono font-bold shrink-0 mt-0.5">
              1
            </div>
            <div>
              <h3 className="text-xs font-semibold text-[#F9FAFB]">URL Ingestion & Canonicalization</h3>
              <p className="text-xs text-[#9CA3AF] mt-0.5">
                The API trims the input and adds an HTTP scheme when it is omitted, then validates the URL before feature extraction.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 p-3 rounded bg-[#0B0F19] border border-[#1F2937]">
            <div className="w-6 h-6 rounded-full bg-[#06B6D4]/20 text-[#06B6D4] flex items-center justify-center text-xs font-mono font-bold shrink-0 mt-0.5">
              2
            </div>
            <div>
              <h3 className="text-xs font-semibold text-[#F9FAFB]">Lexical & Structural Feature Extraction</h3>
              <p className="text-xs text-[#9CA3AF] mt-0.5">
                The backend extracts the ten features in the saved model contract, including URL, hostname, and path lengths; character counts; HTTPS; and query length.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 p-3 rounded bg-[#0B0F19] border border-[#1F2937]">
            <div className="w-6 h-6 rounded-full bg-[#F59E0B]/20 text-[#F59E0B] flex items-center justify-center text-xs font-mono font-bold shrink-0 mt-0.5">
              3
            </div>
            <div>
              <h3 className="text-xs font-semibold text-[#F9FAFB]">URL Safety Validation</h3>
              <p className="text-xs text-[#9CA3AF] mt-0.5">
                Rejects malformed, non-HTTP(S), localhost, private, or non-public IP destinations. The application does not fetch the target page.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 p-3 rounded bg-[#0B0F19] border border-[#1F2937]">
            <div className="w-6 h-6 rounded-full bg-[#10B981]/20 text-[#10B981] flex items-center justify-center text-xs font-mono font-bold shrink-0 mt-0.5">
              4
            </div>
            <div>
              <h3 className="text-xs font-semibold text-[#F9FAFB]">Machine Learning Classification</h3>
              <p className="text-xs text-[#9CA3AF] mt-0.5">
                StandardScaler transforms the feature vector before the trained Logistic Regression classifier predicts one of four classes.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 p-3 rounded bg-[#0B0F19] border border-[#1F2937]">
            <div className="w-6 h-6 rounded-full bg-[#EF4444]/20 text-[#EF4444] flex items-center justify-center text-xs font-mono font-bold shrink-0 mt-0.5">
              5
            </div>
            <div>
              <h3 className="text-xs font-semibold text-[#F9FAFB]">Threat Scoring & Telemetry Dispatch</h3>
              <p className="text-xs text-[#9CA3AF] mt-0.5">
                Returns the predicted-class probability, malicious probability, SHAP explanation, and feature values, then stores the result in SQLite.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Technology Stack Grid */}
      <div>
        <h2 className="text-base font-bold text-[#F9FAFB] flex items-center gap-2 mb-4">
          <Cpu className="w-4 h-4 text-[#3B82F6]" />
          Technology Stack
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Frontend */}
          <div className="p-4 rounded-lg bg-[#111827] border border-[#1F2937]">
            <h3 className="text-xs font-mono uppercase text-[#06B6D4] font-semibold mb-3 flex items-center gap-2">
              <Code2 className="w-4 h-4" /> Frontend Client
            </h3>
            <ul className="space-y-2 text-xs text-[#9CA3AF]">
              <li className="flex items-center justify-between">
                <span>Framework</span>
                <span className="font-mono text-[#F9FAFB]">React 19 + TypeScript</span>
              </li>
              <li className="flex items-center justify-between">
                <span>Build Tool</span>
                <span className="font-mono text-[#F9FAFB]">Vite 8</span>
              </li>
              <li className="flex items-center justify-between">
                <span>Styling Engine</span>
                <span className="font-mono text-[#F9FAFB]">Tailwind CSS (Dark Theme)</span>
              </li>
              <li className="flex items-center justify-between">
                <span>Visual Analytics</span>
                <span className="font-mono text-[#F9FAFB]">Recharts</span>
              </li>
              <li className="flex items-center justify-between">
                <span>Iconography</span>
                <span className="font-mono text-[#F9FAFB]">Lucide React</span>
              </li>
            </ul>
          </div>

          {/* Backend target */}
          <div className="p-4 rounded-lg bg-[#111827] border border-[#1F2937]">
            <h3 className="text-xs font-mono uppercase text-[#3B82F6] font-semibold mb-3 flex items-center gap-2">
              <Server className="w-4 h-4" /> FastAPI Backend Target
            </h3>
            <ul className="space-y-2 text-xs text-[#9CA3AF]">
              <li className="flex items-center justify-between">
                <span>Web Framework</span>
                <span className="font-mono text-[#F9FAFB]">FastAPI (Python)</span>
              </li>
              <li className="flex items-center justify-between">
                <span>ASGI Server</span>
                <span className="font-mono text-[#F9FAFB]">Uvicorn</span>
              </li>
              <li className="flex items-center justify-between">
                <span>ML Algorithms</span>
                <span className="font-mono text-[#F9FAFB]">Logistic Regression + StandardScaler</span>
              </li>
              <li className="flex items-center justify-between">
                <span>Data Pipelines</span>
                <span className="font-mono text-[#F9FAFB]">Scikit-Learn, Pandas, NumPy</span>
              </li>
              <li className="flex items-center justify-between">
                <span>Target Port</span>
                <span className="font-mono text-[#22D3EE]">:8000 (localhost)</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Backend Integration Contract & Developer Guide */}
      <div className="rounded-lg bg-[#111827] border border-[#1F2937] p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1F2937] pb-3">
          <div>
            <h2 className="text-base font-bold text-[#F9FAFB] flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#10B981]" />
              Backend Integration Specification
            </h2>
            <p className="text-xs text-[#6B7280]">
              Requests handled by the existing FastAPI backend
            </p>
          </div>
          <span className="font-mono text-xs text-[#22D3EE] bg-[#0B0F19] px-2 py-1 rounded border border-[#1F2937]">
            POST /api/analyze
          </span>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs text-[#9CA3AF] mb-1.5">
            <span>Terminal cURL Execution:</span>
            <button
              onClick={() => handleCopy(sampleAnalyzeCurl, 'curl')}
              className="text-[#3B82F6] hover:text-white flex items-center gap-1 font-mono text-[11px]"
            >
              {copiedEndpoint === 'curl' ? <Check className="w-3 h-3 text-[#10B981]" /> : <Copy className="w-3 h-3" />}
              <span>{copiedEndpoint === 'curl' ? 'Copied' : 'Copy cURL'}</span>
            </button>
          </div>
          <pre className="p-3 bg-[#0B0F19] rounded border border-[#1F2937] text-xs font-mono text-[#DCE2F7] overflow-x-auto">
            {sampleAnalyzeCurl}
          </pre>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs text-[#9CA3AF] mb-1.5">
            <span>Read scan and model statistics:</span>
            <button
              onClick={() => handleCopy(sampleStatsCurl, 'stats')}
              className="text-[#3B82F6] hover:text-white flex items-center gap-1 font-mono text-[11px]"
            >
              {copiedEndpoint === 'stats' ? <Check className="w-3 h-3 text-[#10B981]" /> : <Copy className="w-3 h-3" />}
              <span>{copiedEndpoint === 'stats' ? 'Copied' : 'Copy cURL'}</span>
            </button>
          </div>
          <pre className="p-3 bg-[#0B0F19] rounded border border-[#1F2937] text-xs font-mono text-[#9CA3AF] overflow-x-auto max-h-64">
            {sampleStatsCurl}
          </pre>
        </div>
      </div>
    </div>
  );
};
