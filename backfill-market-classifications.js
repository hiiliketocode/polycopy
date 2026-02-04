/**
 * Backfill market classifications for all markets with tags but no classification
 * This script will classify all markets that have tags but missing market_subtype
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

function normalizeTags(rawTags) {
  if (!rawTags) return [];
  if (Array.isArray(rawTags)) {
    return rawTags
      .map((t) => (typeof t === 'string' ? t : String(t)))
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);
  }
  if (typeof rawTags === 'string') {
    try {
      const parsed = JSON.parse(rawTags);
      if (Array.isArray(parsed)) {
        return parsed
          .map((t) => (typeof t === 'string' ? t : String(t)))
          .map((t) => t.trim().toLowerCase())
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

function inferBetStructure(title) {
  const t = (title || '').toLowerCase();
  if (t.includes('over') || t.includes('under') || t.includes('o/u')) return 'OVER_UNDER';
  if (t.includes('spread') || t.includes('handicap')) return 'SPREAD';
  if (t.includes('will') || t.includes('winner')) return 'WINNER';
  return 'STANDARD';
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

async function backfillClassifications() {
  console.log('🔄 Starting market classification backfill...\n');
  
  let offset = 0;
  const batchSize = 100;
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  
  while (true) {
    // Fetch markets with tags but no classification
    const { data: markets, error } = await supabase
      .from('markets')
      .select('condition_id, tags, market_subtype, bet_structure, market_type, title')
      .not('tags', 'is', null)
      .is('market_subtype', null)
      .range(offset, offset + batchSize - 1);
    
    if (error) {
      console.error('❌ Error querying markets:', error);
      break;
    }
    
    if (!markets || markets.length === 0) {
      console.log('\n✅ No more markets to process');
      break;
    }
    
    console.log(`\n📦 Processing batch ${Math.floor(offset / batchSize) + 1}: ${markets.length} markets`);
    
    for (const market of markets) {
      totalProcessed++;
      
      const normalizedTags = normalizeTags(market.tags);
      
      if (normalizedTags.length === 0) {
        continue; // Skip markets with no valid tags
      }
      
      // Infer niche and market type
      const nicheResult = await inferNicheFromTags(normalizedTags);
      
      // Infer bet structure from title
      const betStructure = inferBetStructure(market.title);
      
      // Prepare update
      const updateData = {};
      if (nicheResult.niche && !market.market_subtype) {
        updateData.market_subtype = nicheResult.niche;
      }
      if (nicheResult.marketType && !market.market_type) {
        updateData.market_type = nicheResult.marketType;
      }
      if (betStructure && !market.bet_structure) {
        updateData.bet_structure = betStructure;
      }
      
      if (Object.keys(updateData).length > 0) {
        const { error: updateError } = await supabase
          .from('markets')
          .update(updateData)
          .eq('condition_id', market.condition_id);
        
        if (updateError) {
          console.error(`  ❌ Failed to update ${market.condition_id.substring(0, 20)}...:`, updateError.message);
          totalFailed++;
        } else {
          totalUpdated++;
          if (totalUpdated % 10 === 0) {
            console.log(`  ✅ Updated ${totalUpdated} markets...`);
          }
        }
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    offset += batchSize;
    
    // Progress update
    console.log(`\n📊 Progress: ${totalProcessed} processed, ${totalUpdated} updated, ${totalFailed} failed`);
    
    // If we got fewer than batchSize, we're done
    if (markets.length < batchSize) {
      break;
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ BACKFILL COMPLETE');
  console.log('='.repeat(80));
  console.log(`Total processed: ${totalProcessed}`);
  console.log(`Total updated: ${totalUpdated}`);
  console.log(`Total failed: ${totalFailed}`);
}

backfillClassifications().catch(console.error);
