const MARKET_AVATAR_KEYS = [
  'market_avatar',
  'market_avatar_url',
  'marketAvatar',
  'marketAvatarUrl',
  'icon',
  'market_icon',
  'marketIcon',
  'image',
  'image_url',
  'imageUrl',
];

function findAvatar(record: Record<string, any> | null | undefined) {
  if (!record) {
    return null;
  }

  for (const key of MARKET_AVATAR_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return null;
}

export function extractMarketAvatarUrl(record: Record<string, any> | null | undefined) {
  const direct = findAvatar(record);
  if (direct) {
    return direct;
  }

  const nested = record?.market;
  return findAvatar(nested);
}
