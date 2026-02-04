// Debug Function Node: Check Input Structure
// Place this RIGHT AFTER Agent Node to see what structure you're getting
// Then you can adjust the Format Function Node accordingly

const inputData = $input.all();

console.log('=== INPUT DEBUG ===');
console.log('Number of input items:', inputData.length);
console.log('First item keys:', Object.keys(inputData[0]?.json || {}));
console.log('First item structure:', JSON.stringify(inputData[0]?.json || {}, null, 2));

// Check for different possible structures
const firstItem = inputData[0]?.json || {};

if (firstItem.all_trades) {
  console.log('Found: all_trades array with', firstItem.all_trades.length, 'trades');
}
if (firstItem.selected_trades) {
  console.log('Found: selected_trades array with', firstItem.selected_trades.length, 'trades');
}
if (firstItem.trade_id) {
  console.log('Found: Single trade object');
}
if (Array.isArray(firstItem)) {
  console.log('Found: Input is already an array');
}

// Return the input as-is so you can see it
return inputData.map(item => ({
  json: {
    debug_info: 'Input structure check',
    input_keys: Object.keys(item.json || {}),
    sample_data: item.json
  }
}));
