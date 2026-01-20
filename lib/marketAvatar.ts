const MARKET_AVATAR_KEYS = [
  'market_avatar',
  'market_avatar_url',
  'marketAvatar',
  'marketAvatarUrl',
  'market_image',
  'market_image_url',
  'marketImage',
  'marketImageUrl',
  'market_icon',
  'market_icon_url',
  'marketIcon',
  'marketIconUrl',
  'icon_url',
  'iconUrl',
  'icon',
  'image',
  'image_url',
  'imageUrl',
  'event_image',
  'event_image_url',
  'eventImage',
  'eventImageUrl',
  'logo',
  'logo_url',
  'logoUrl',
  'twitter_card_image',
  'twitterCardImage',
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

  const nestedCandidates = [
    record?.market,
    record?.event,
    Array.isArray(record?.events) ? record?.events?.[0] : null,
    record?.metadata,
    record?.raw_gamma,
    record?.rawGamma,
    record?.raw,
    record?.raw?.market,
    record?.raw?.event,
    Array.isArray(record?.raw?.events) ? record?.raw?.events?.[0] : null,
    record?.market?.event,
    Array.isArray(record?.market?.events) ? record?.market?.events?.[0] : null,
    record?.market?.metadata,
  ];

  for (const candidate of nestedCandidates) {
    const nested = findAvatar(candidate);
    if (nested) {
      return nested;
    }
  }

  return null;
}
