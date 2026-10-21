# PhishGuard — Data Cleaning & Quality Audit Report

## 1. Source Dataset Overview

- **Source File**: `ml/data/raw/malicious_phish.csv` (Preserved strictly untouched in accordance with immutability standards)
- **Raw Row Count**: 651,191 parsed records (2 columns: `url`, `type`)
- **Output Cleaned File**: `ml/data/processed/cleaned_urls.csv` (632,912 rows)
- **Output Feature Matrix**: `ml/data/processed/feature_dataset.csv` (632,912 rows, 10 lexical features + integer `label`)
- **Schema Mapping**:
  * Input column `url` -> Standardized string URL
  * Input column `type` -> Normalized target class label

## 2. Target Label Mapping & Standardization

Raw target values were normalized using a canonical alias registry to avoid label drift or accidental conversion into a binary task:

| Raw Label in Source | Standard Class | Assigned Code | Role in PhishGuard |
| :--- | :--- | :---: | :--- |
| `benign`, `safe`, `legitimate`, `legit` | **Legitimate** | `0` | Baseline benign traffic |
| `phishing`, `phish`, `malicious` | **Phishing** | `1` | Credential theft / impersonation |
| `defacement` | **Defacement** | `2` | Unauthorized visual/content alteration |
| `malware` | **Malware** | `3` | Drive-by downloads, exploit kits |

*Validation*: Zero unknown or unmapped label values were detected. Contiguous class codes `[0, 1, 2, 3]` are enforced across all preprocessing and downstream ML code.

## 3. Data Quality Issues Identified

A comprehensive audit of the 651,191 raw records identified the following data quality issues:

1. **Scheme Absence / Formatting Errors**:
   - **463,194 records (71.1%)** omitted the URL transport scheme (e.g., `paypal.com/signin` instead of `http://paypal.com/signin`).
   - *Action*: Normalized with default `http://` prefix prior to lexical parsing, ensuring identical authority/path separation between offline training and live inference.
2. **Missing or Null Values**:
   - Zero rows contained empty or null URL/type fields.
3. **Exact Duplicate Records**:
   - **10,066 exact duplicates** (identical URL and identical label).
   - An additional 3,946 duplicate URL entries existed with non-identical labels.
4. **Conflicting Label Groups (Data Inconsistency)**:
   - **3,946 URL groups** (totaling **7,897 records**) appeared multiple times with conflicting target labels (e.g., marked both `benign` and `phishing` across different collection crawls).
   - *Action*: Excluded all 7,897 ambiguous records to eliminate noisy training signals.
5. **Invalid / Unprocessable URL Syntax**:
   - **321 records** contained unparseable syntax, missing hostnames, unescaped whitespace, or invalid ports (e.g., port numbers exceeding 65535).
   - *Action*: Excluded after verifying they could not be reliably parsed into lexical tokens.
6. **Outlier Distributions (Preserved)**:
   - Extreme URL lengths (> 210 characters, 9,226 rows, max 2,182 characters).
   - High digit counts (> 28 digits, 17,729 rows, max 1,204 digits).
   - High special character counts (> 35 characters, 5,704 rows).
   - *Action*: **Deliberately preserved**. In cybersecurity, abnormally long URLs, hex-encoded query tokens, and repetitive delimiter chains are primary indicators of obfuscated attack payloads.

## 4. Rows Retained, Removed & Corrected

| Step / Filter | Rows Examined | Rows Excluded | Rows Remaining | Percentage Retained |
| :--- | :---: | :---: | :---: | :---: |
| **Initial Raw Load** | 651,191 | 0 | 651,191 | 100.0% |
| **Scheme Normalization** | 651,191 | 0 (463,194 modified) | 651,191 | 100.0% |
| **Invalid Syntax Exclusion** | 651,191 | 321 | 650,870 | 99.95% |
| **Conflicting Label Exclusion**| 650,870 | 7,897 | 642,973 | 98.74% |
| **Exact Deduplication** | 642,973 | 10,061 | **632,912** | **97.19%** |
| **Total Pipeline Output** | **651,191** | **18,279** | **632,912** | **97.19%** |

## 5. Class Distribution & Imbalance Analysis

| Class Name | Cleaned Count | Percentage | Imbalance Ratio vs. Legitimate | Class Weight in Production Baseline |
| :--- | :---: | :---: | :---: | :---: |
| **Legitimate** | 423,980 | 66.99% | 1.00 : 1 | `1.0` |
| **Phishing** | 90,002 | 14.22% | 4.71 : 1 | `1.5` |
| **Defacement** | 95,285 | 15.06% | 4.45 : 1 | `1.5` |
| **Malware** | 23,645 | 3.74% | 17.93 : 1 | `2.0` |
| **Total** | **632,912** | **100.00%** | — | — |

### Imbalance Mitigation Strategy
- Evaluated both natural distribution and class-weighted cost functions.
- Production models utilize inverse-frequency cost penalties (`class_weight={0: 1.0, 1: 1.5, 2: 1.5, 3: 2.0}` or `"balanced"`), prioritizing phishing and malware recall while preventing synthetic distortion of the test evaluation distribution.

## 6. Data Leakage Safeguards
1. **Deduplication Prior to Splitting**: All duplicate URLs were removed before creating train and test splits to prevent memorization.
2. **Cross-Partition Domain Overlap**: Identified 14,418 near-identical URL groups sharing `host + path` (e.g. `youtube.com/watch?v=...`). These were audited and tested using hostname-grouped cross-validation (`StratifiedGroupKFold`) in `ml/evaluation/domain_robustness.py`.
3. **Strict Split Isolation**: Preprocessing scaling parameters (`StandardScaler`) are fit exclusively on the training partition and applied to validation/testing without looking ahead.

## 7. Known Limitations
- The dataset relies purely on lexical URL strings; it does not contain HTML DOM, screenshot, or DNS response history.
- Rapidly mutating domains that mimic legitimate structures without distinctive lexical tokens require the supporting Brand Protection registry and Uncertainty Assessment safeguards implemented in the application layer.
