// supabase/functions/predict-trade/classifier.ts

// 1. DETERMINE BET STRUCTURE (From Title)
export function getBetStructure(payloadStructure: string | undefined, title: string): string {
  const pStruct = (payloadStructure || '').toUpperCase();
  const t = (title || '').toLowerCase();

  // Trust the app if it sends specific types
  if (pStruct.includes('SPREAD') || pStruct.includes('HANDICAP')) return 'SPREAD';
  if (pStruct.includes('OVER') || pStruct.includes('UNDER') || pStruct.includes('TOTAL')) return 'OVER_UNDER';
  
  // Regex Fallback
  if (t.includes('over') || t.includes('under') || t.includes('o/u')) return 'OVER_UNDER';
  if (t.includes('spread') || t.includes('handicap') || t.includes(' -') || t.includes(' +')) return 'SPREAD';
  if (t.includes('will') || t.includes('winner') || t.includes('champion') || t.includes('win')) return 'WINNER';
  
  return 'STANDARD';
}

// 2. DETERMINE NICHE (From Tags + DB Dictionary)
export async function getMarketClassification(supabase: any, tags: string[], title: string) {
  const cleanTags = (tags || []).map(t => t.toLowerCase().trim());
  
  // Fast Lookup in Supabase Dictionary Table
  const { data: mappings } = await supabase
    .from('semantic_mapping')
    .select('*')
    .in('original_tag', cleanTags);

  // Default: OTHER
  let bestMatch = { clean_niche: 'OTHER', type: 'OTHER', score: 99 };

  if (mappings && mappings.length > 0) {
    // Sort: Score 1 (Best) -> Score 3 (Worst)
    mappings.sort((a: any, b: any) => a.specificity_score - b.specificity_score);
    bestMatch = mappings[0];
  }

  // Safety Net: Catch viral topics not in DB yet
  const tLower = (title || '').toLowerCase();
  if (bestMatch.score > 1) {
    if (tLower.includes('trump')) return { clean_niche: 'TRUMP', type: 'POLITICS', score: 1 };
    if (tLower.includes('bitcoin')) return { clean_niche: 'BITCOIN', type: 'CRYPTO', score: 1 };
  }

  return bestMatch;
}
