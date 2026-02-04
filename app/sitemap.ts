import { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 3600 // Revalidate sitemap once per hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://polycopy.app'
  
  console.log('[Sitemap] Starting sitemap generation...')
  
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
      url: `${baseUrl}/copy-trading`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/top-traders`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
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

  console.log(`[Sitemap] Added ${staticPages.length} static pages`)

  // Dynamic trader profile pages (with quality filters)
  let traderPages: MetadataRoute.Sitemap = []
  
  try {
    // Include traders with relaxed criteria for better coverage
    // - Limit to top 1,000 traders by follower count
    // - No minimum trade count (any activity is good)
    // - No minimum follower count (discoverable profiles are valuable)
    // - No recency filter (all traders remain in sitemap)
    
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

    console.log('[Sitemap] Fetching traders from Supabase...')

    const { data: traders, error } = await supabase
      .from('traders')
      .select('wallet_address, updated_at')
      .order('follower_count', { ascending: false })
      .limit(1000)

    if (error) {
      console.error('[Sitemap] Supabase error:', JSON.stringify(error))
    } else if (!traders || traders.length === 0) {
      console.warn('[Sitemap] No traders found in database')
    } else {
      traderPages = traders.map((trader) => ({
        url: `${baseUrl}/trader/${trader.wallet_address}`,
        lastModified: new Date(trader.updated_at),
        changeFrequency: 'daily' as const,
        priority: 0.7,
      }))
      
      console.log(`[Sitemap] Successfully added ${traderPages.length} trader profiles`)
    }
  } catch (error) {
    console.error('[Sitemap] Exception while fetching traders:', error)
    // Continue without trader pages if there's an error
  }

  console.log(`[Sitemap] Returning ${staticPages.length + traderPages.length} total URLs`)
  return [...staticPages, ...traderPages]
}
