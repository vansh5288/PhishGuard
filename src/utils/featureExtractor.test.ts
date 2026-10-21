import test from 'node:test';
import assert from 'node:assert/strict';
import { extractModelFeatures, MODEL_FEATURE_NAMES, normalizeUrl } from './featureExtractor.ts';

test('normalizes scheme-less input like the model preprocessing pipeline', () => {
  assert.equal(normalizeUrl(' example.com/login '), 'http://example.com/login');
  assert.equal(normalizeUrl('//example.com'), 'http://example.com');
});

test('extracts the exact ordered ten-feature model vector', () => {
  const url = 'https://secure-login-paypal.com/cgi-bin/auth-dispatch?id=42';
  const features = extractModelFeatures(url);

  assert.deepEqual(Object.keys(features), MODEL_FEATURE_NAMES);
  assert.equal(features.url_length, url.length);
  assert.equal(features.hostname_length, 'secure-login-paypal.com'.length);
  assert.equal(features.path_length, '/cgi-bin/auth-dispatch'.length);
  assert.equal(features.dot_count, 1);
  assert.equal(features.hyphen_count, 4);
  assert.equal(features.digit_count, 2);
  assert.equal(features.subdirectory_count, 1);
  assert.equal(features.has_https, 1);
  assert.equal(features.query_length, 'id=42'.length);
});

test('matches the model path and digit features for root URLs', () => {
  const features = extractModelFeatures('https://example.com?code=²');

  assert.equal(features.path_length, 0);
  assert.equal(features.subdirectory_count, 0);
  assert.equal(features.digit_count, 1);
});
