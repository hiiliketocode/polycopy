import { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 86400 // Revalidate sitemap once per day (24 hours)

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://polycopy.app'
  
  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 1,
    },
    {
      url: `${baseUrl}/discover`,
      lastModified: new Date(),
      changeFrequency: 'hourly' as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/faq`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/login`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.2,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.2,
    },
  ]

  // Category-specific discover pages for better SEO targeting
  const categories = [
    'POLITICS',
    'SPORTS',
    'CRYPTO',
    'CULTURE',
    'FINANCE',
    'ECONOMICS',
    'TECH',
    'WEATHER',
  ]

  const categoryPages: MetadataRoute.Sitemap = categories.map(category => ({
    url: `${baseUrl}/discover?category=${category}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.7,
  }))

  // Dynamic trader profile pages (with quality filters)
  let traderPages: MetadataRoute.Sitemap = []
  
  try {
    // Only include traders who meet quality criteria:
    // - Have at least 10 completed trades
    // - Have at least 1 follower
    // - Have been active in the last 30 days
    // - Limit to top 1,000 traders by follower count
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: traders, error } = await supabase
      .from('traders')
      .select('wallet_address, updated_at, follower_count, total_trades')
      .gte('total_trades', 10) // At least 10 trades
      .gte('follower_count', 1) // At least 1 follower
      .gte('updated_at', thirtyDaysAgo.toISOString()) // Active in last 30 days
      .order('follower_count', { ascending: false })
      .limit(1000)

    if (!error && traders && traders.length > 0) {
      traderPages = traders.map((trader) => ({
        url: `${baseUrl}/trader/${trader.wallet_address}`,
        lastModified: new Date(trader.updated_at),
        changeFrequency: 'daily' as const,
        priority: 0.7, // High priority for quality trader profiles
      }))
      
      console.log(`[Sitemap] Added ${traderPages.length} quality trader profiles`)
    } else if (error) {
      console.error('[Sitemap] Error fetching traders:', error)
    }
  } catch (error) {
    console.error('[Sitemap] Failed to fetch trader profiles:', error)
    // Continue without trader pages if there's an error
  }

  return [...staticPages, ...categoryPages, ...traderPages]
}
