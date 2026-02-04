// Function Node: Mark Trades as Processed in BigQuery
// Purpose: Update last_processed_at for trades that have tweets generated
// Mode: "Run Once for All Items"
// Input: Array of trades with trade_id field
// Output: SQL query to update BigQuery

const inputItems = $input.all();

if (inputItems.length === 0) {
  return [{ json: { error: 'No input received' } }];
}

// Extract trade_ids from formatted output
const tradeIds = inputItems
  .map(item => {
    const json = item.json || item;
    return json.trade_id;
  })
  .filter(id => id && id.trim() !== '');

if (tradeIds.length === 0) {
  return [{ json: { error: 'No trade_ids found' } }];
}

// Build SQL UPDATE query
const tradeIdsList = tradeIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',\n  ');

const updateQuery = `
UPDATE \`gen-lang-client-0299056258.polycopy_v1.i_wish_i_copied_that\`
SET last_processed_at = CURRENT_TIMESTAMP()
WHERE trade_id IN (
  ${tradeIdsList}
);
`;

return [{
  json: {
    query: updateQuery,
    trade_ids: tradeIds,
    count: tradeIds.length
  }
}];
