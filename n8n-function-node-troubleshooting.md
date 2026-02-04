# n8n Function Node: No Output Troubleshooting

## Problem: "No output data returned"

This happens when the Function Node doesn't return data in the correct format.

## Solution: Proper Return Format

In n8n Code nodes, you MUST return data in this format:

```javascript
// For multiple items (Run Once for All Items)
return [
  { json: { field1: 'value1', field2: 'value2' } },
  { json: { field1: 'value3', field2: 'value4' } }
];

// For single item (Run Once for Each Item)
return { json: { field1: 'value1', field2: 'value2' } };
```

## Common Mistakes

### ❌ Wrong: Returning raw array
```javascript
return [{ field1: 'value1' }]; // Missing 'json' wrapper
```

### ✅ Correct: Wrapped in json property
```javascript
return [{ json: { field1: 'value1' } }];
```

### ❌ Wrong: Returning object directly
```javascript
return { field1: 'value1' }; // Missing 'json' wrapper
```

### ✅ Correct: Wrapped in json property
```javascript
return { json: { field1: 'value1' } };
```

## Fixed Function Node Code

Use `n8n-function-node-format-final-output-fixed.js` which:
1. Uses `$input.all()` correctly
2. Returns data in proper format: `[{ json: {...} }]`
3. Includes debug logging
4. Handles different input structures

## Node Settings

**Mode:** "Run Once for All Items" (recommended)
- Processes all trades at once
- Returns array of formatted rows

**OR**

**Mode:** "Run Once for Each Item"
- Processes one trade at a time
- Returns single object: `{ json: {...} }`

## Debug Steps

1. **Add console.log statements:**
   ```javascript
   console.log('Input items:', $input.all().length);
   console.log('First item:', $input.all()[0]?.json);
   ```

2. **Check browser console:**
   - Open browser DevTools (F12)
   - Go to Console tab
   - Run the node
   - Check console.log output

3. **Verify return format:**
   ```javascript
   const result = [{ json: { test: 'value' } }];
   console.log('Returning:', result);
   return result;
   ```

## Quick Test

Replace your Function Node code with this minimal test:

```javascript
// Test: Return sample data
return [
  {
    json: {
      tweet_main: "Test tweet",
      polycopy_url: "https://polycopy.app/trader/0x123...",
      trade_id: "test123"
    }
  }
];
```

If this works, the issue is with data extraction. If it doesn't, check node settings.

## Node Settings Checklist

- [ ] Mode: "Run Once for All Items" (or "Run Once for Each Item")
- [ ] Language: JavaScript
- [ ] Code returns array: `[{ json: {...} }]`
- [ ] No syntax errors
- [ ] Using `$input.all()` or `$input.item.json` correctly

The fixed code in `n8n-function-node-format-final-output-fixed.js` should work!
