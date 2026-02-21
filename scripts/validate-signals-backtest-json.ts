#!/usr/bin/env npx tsx
/**
 * Validate signals-backtest-results.json shape. Use in CI or after running signals-backtest.
 * Exit 0 if valid, 1 otherwise.
 *
 * Run: npx tsx scripts/validate-signals-backtest-json.ts [path]
 *      npx tsx scripts/validate-signals-backtest-json.ts public/data/signals-backtest-results.json
 */
import fs from 'fs';
import path from 'path';

const defaultPath = path.resolve(process.cwd(), 'public/data/signals-backtest-results.json');
const jsonPath = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : defaultPath;

function validateBucketRow(r: unknown): boolean {
  if (!r || typeof r !== 'object') return false;
  const o = r as Record<string, unknown>;
  return (
    typeof o.label === 'string' &&
    typeof o.trades === 'number' &&
    typeof o.winRatePct === 'number' &&
    typeof o.unitRoiPct === 'number' &&
    typeof o.profitFactor === 'number'
  );
}

function main(): number {
  if (!fs.existsSync(jsonPath)) {
    console.error('File not found:', jsonPath);
    return 1;
  }
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch (e) {
    console.error('Invalid JSON:', e);
    return 1;
  }
  if (!data || typeof data !== 'object') {
    console.error('Root must be an object');
    return 1;
  }
  const root = data as Record<string, unknown>;
  const meta = root.meta;
  if (!meta || typeof meta !== 'object') {
    console.error('Missing or invalid meta');
    return 1;
  }
  const m = meta as Record<string, unknown>;
  if (typeof m.uniqueTrades !== 'number') {
    console.error('meta must have uniqueTrades (number)');
    return 1;
  }
  if (m.generatedAt != null && typeof m.generatedAt !== 'string') {
    console.error('meta.generatedAt must be string or null');
    return 1;
  }
  const buckets = ['byMlScore', 'byWinRate', 'byConviction', 'byTraderRoi', 'byTradeCount'] as const;
  const optionalBuckets = ['byPrice', 'bySize'] as const;
  for (const key of buckets) {
    const arr = root[key];
    if (!Array.isArray(arr)) {
      console.error('Missing or non-array:', key);
      return 1;
    }
    for (const row of arr) {
      if (!validateBucketRow(row)) {
        console.error('Invalid bucket row in', key, row);
        return 1;
      }
    }
  }
  for (const key of optionalBuckets) {
    const arr = root[key];
    if (arr != null && !Array.isArray(arr)) {
      console.error('Invalid (non-array):', key);
      return 1;
    }
    if (Array.isArray(arr)) {
      for (const row of arr) {
        if (!validateBucketRow(row)) {
          console.error('Invalid bucket row in', key, row);
          return 1;
        }
      }
    }
  }
  console.log('Valid:', jsonPath, '| trades:', (m.uniqueTrades as number).toLocaleString());
  return 0;
}

process.exit(main());
