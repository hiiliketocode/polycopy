/**
 * Test classifying markets that exist but have no classification
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Copy normalizeTags from ensure API
function normalizeTags(rawTags) {
  if (!rawTags) return [];
  if (Array.isArray(rawTags)) {
    return rawTags
      .map((t) => (typeof t === 'string' ? t : String(t)))
      .map((t) => t.trim().toLowerCase()) // ADD LOWERCASE!
      .filter((t) => t.length > 0);
  }
  if (typeof rawTags === 'string') {
    try {
      const parsed = JSON.parse(rawTags);
      if (Array.isArray(parsed)) {
        return parsed
          .map((t) => (typeof t === 'string' ? t : String(t)))
          .map((t) => t.trim().toLowerCase()) // ADD LOWERCASE!
          .filter((t) => t.length > 0);
      }
    } catch {
      // Not JSON
    }
    const single = rawTags.trim().toLowerCase();
    return single.length > 0 ? [single] : [];
  }
  return [];
}

async function inferNicheFromTags(tags) {
  const cleanTags = tags
    .map((t) => t.toLowerCase().trim())
    .filter((t) => t.length > 0);

  if (cleanTags.length === 0) {
    return { niche: null, marketType: null, source: 'no_tags' };
  }

  // Try case-sensitive match first
  let { data: mappings, error } = await supabase
    .from('semantic_mapping')
    .select('clean_niche, type, specificity_score, original_tag')
    .in('original_tag', cleanTags);

  // If no matches, try case-insensitive
  if ((!mappings || mappings.length === 0) && cleanTags.length > 0) {
    const allCiMappings = [];
    for (const tag of cleanTags) {
      const { data: ciMappings, error: ciError } = await supabase
        .from('semantic_mapping')
        .select('clean_niche, type, specificity_score, original_tag')
        .ilike('original_tag', tag);
      
      if (!ciError && ciMappings && ciMappings.length > 0) {
        allCiMappings.push(...ciMappings);
      }
    }
    
    if (allCiMappings.length > 0) {
      mappings = allCiMappings;
    }
  }

  if (error) {
    return { niche: null, marketType: null, source: 'semantic_mapping_error' };
  }

  if (mappings && mappings.length > 0) {
    mappings.sort((a, b) => (a.specificity_score || 99) - (b.specificity_score || 99));
    const best = mappings[0];
    const cleanNiche = (best?.clean_niche || '').toUpperCase();
    const marketType = (best?.type || '').toUpperCase() || null;
    return {
      niche: cleanNiche || null,
      marketType: marketType || null,
      source: 'semantic_mapping',
      fromTag: best?.original_tag,
    };
  }

  return { niche: null, marketType: null, source: 'no_match' };
}

async function testClassifyExistingMarkets() {
  console.log('🧪 Testing classification of existing markets\n');
  
  // Find markets with tags but no classification
  const { data: markets, error } = await supabase
    .from('markets')
    .select('condition_id, tags, market_subtype, bet_structure, market_type, title')
    .not('tags', 'is', null)
    .is('market_subtype', null)
    .limit(10);
  
  if (error) {
    console.error('❌ Error querying markets:', error);
    return;
  }
  
  if (!markets || markets.length === 0) {
    console.log('✅ No markets found without classification');
    return;
  }
  
  console.log(`Found ${markets.length} markets without classification\n`);
  
  for (const market of markets) {
    console.log(`\n📊 Market: ${market.title?.substring(0, 60) || 'N/A'}`);
    console.log(`   conditionId: ${market.condition_id.substring(0, 30)}...`);
    console.log(`   Tags (raw): ${JSON.stringify(market.tags)}`);
    
    const normalizedTags = normalizeTags(market.tags);
    console.log(`   Tags (normalized): ${JSON.stringify(normalizedTags)}`);
    
    if (normalizedTags.length === 0) {
      console.log(`   ⚠️  No tags after normalization`);
      continue;
    }
    
    const result = await inferNicheFromTags(normalizedTags);
    console.log(`   Result:`, result);
    
    if (result.niche) {
      // Update the market
      const updateData = {
        market_subtype: result.niche,
      };
      if (result.marketType) {
        updateData.market_type = result.marketType;
      }
      
      const { error: updateError } = await supabase
        .from('markets')
        .update(updateData)
        .eq('condition_id', market.condition_id);
      
      if (updateError) {
        console.log(`   ❌ Update failed:`, updateError.message);
      } else {
        console.log(`   ✅ Updated: market_subtype=${result.niche}, market_type=${result.marketType || 'NULL'}`);
      }
    } else {
      console.log(`   ⚠️  No niche found for tags: ${normalizedTags.join(', ')}`);
    }
  }
}

testClassifyExistingMarkets().catch(console.error);
