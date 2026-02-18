#!/usr/bin/env node
/**
 * One-off: convert BQ ML.WEIGHTS tab-separated export to poly_predictor_v11_weights.json
 * Paste the export into weights-export.txt (or pass path) and run:
 *   node scripts/convert-bq-weights-to-json.js [weights-export.txt]
 * Output: lib/ml/poly_predictor_v11_weights.json
 */

const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2] || path.join(__dirname, 'weights-export.txt');
const outputPath = path.join(__dirname, '..', 'lib', 'ml', 'poly_predictor_v11_weights.json');

let raw = process.argv[2] ? fs.readFileSync(inputPath, 'utf-8') : null;
if (!raw && process.stdin.isTTY) {
  console.error('Usage: node convert-bq-weights-to-json.js < weights-export.txt');
  console.error('   or: node convert-bq-weights-to-json.js path/to/weights-export.txt');
  process.exit(1);
}
if (!raw) {
  raw = fs.readFileSync(0, 'utf-8');
}

// Split into row blocks: each row starts with a field name (or __INTERCEPT__) followed by tab
const blocks = raw.split(/\n(?=[a-zA-Z0-9_]+\t)/);
const rows = [];
for (let b = 1; b < blocks.length; b++) {
  const block = blocks[b].trimEnd();
  const tab1 = block.indexOf('\t');
  if (tab1 === -1) continue;
  const processed_input = block.slice(0, tab1).trim();
  const rest = block.slice(tab1 + 1);
  const tab2 = rest.indexOf('\t');
  let weightStr;
  let catStr;
  if (tab2 === -1) {
    weightStr = rest.trim();
    catStr = '';
  } else {
    weightStr = rest.slice(0, tab2).trim();
    catStr = rest.slice(tab2 + 1).trim();
  }
  // Unescape BQ JSON ("" -> ")
  const catJson = catStr.replace(/""/g, '"').replace(/^"|"$/g, '').trim();
  let weight = null;
  if (weightStr !== '' && weightStr !== 'null') {
    const w = Number(weightStr);
    if (Number.isFinite(w)) weight = w;
  }
  let category_weights = [];
  if (catJson && catJson !== '{}') {
    try {
      const parsed = JSON.parse(catJson);
      const arr = parsed?.category_weights || [];
      category_weights = (Array.isArray(arr) ? arr : []).map((c) => ({
        category: c?.category ?? '',
        weight: typeof c?.weight === 'number' ? c.weight : Number(c?.weight),
      })).filter((c) => !Number.isNaN(c.weight));
    } catch (_) {
      // keep []
    }
  }
  rows.push({
    processed_input: processed_input || null,
    weight: weight,
    category_weights: category_weights.length ? category_weights : [],
  });
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(rows, null, 2), 'utf-8');
console.log('Wrote', rows.length, 'rows to', outputPath);
