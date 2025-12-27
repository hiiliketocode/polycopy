export type FeatureTier = 'anon' | 'registered' | 'premium' | 'admin';

export interface FeatureProfile {
  is_premium?: boolean | null;
  is_admin?: boolean | null;
}

export function resolveFeatureTier(hasSession: boolean, profile?: FeatureProfile | null): FeatureTier {
  if (!hasSession) return 'anon';
  if (profile?.is_admin) return 'admin';
  if (profile?.is_premium) return 'premium';
  return 'registered';
}

export function tierHasPremiumAccess(tier: FeatureTier): boolean {
  return tier === 'premium' || tier === 'admin';
}
