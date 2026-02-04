// Function Node: Clean JSON Output from Agent
// Place this between Agent Node and Format Final Output
// Removes markdown code blocks and ensures complete data

const agentOutput = $input.item.json;

// Extract the output text (might be wrapped in markdown)
let jsonString = '';
if (agentOutput.output) {
  jsonString = agentOutput.output;
} else if (agentOutput.text) {
  jsonString = agentOutput.text;
} else {
  jsonString = JSON.stringify(agentOutput);
}

// Remove markdown code blocks if present
jsonString = jsonString
  .replace(/^```json\s*/i, '')  // Remove opening ```json
  .replace(/^```\s*/i, '')      // Remove opening ```
  .replace(/\s*```$/i, '')      // Remove closing ```
  .trim();

// Parse JSON
let parsed;
try {
  parsed = JSON.parse(jsonString);
} catch (e) {
  // If parsing fails, try to extract JSON from the string
  const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    parsed = JSON.parse(jsonMatch[0]);
  } else {
    throw new Error('Could not parse JSON from agent output');
  }
}

// Get original trades from BigQuery (should be in workflow context)
// If you have access to original trades, merge them here
// Otherwise, the agent should have included all fields

return {
  json: parsed
};
