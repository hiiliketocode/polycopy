import type { Metadata } from "next";
import { createClient } from '@supabase/supabase-js';

interface Props {
  params: Promise<{
    wallet: string;
  }>;
}

// Generate dynamic metadata for each trader profile
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params;
  
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { data: trader } = await supabase
      .from('traders')
      .select('wallet_address, display_name, pnl, volume, follower_count, total_trades, win_rate, profile_image')
      .eq('wallet_address', wallet.toLowerCase())
      .single();

    if (!trader) {
      let fallbackName = `Trader ${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
      try {
        const pmRes = await fetch(`https://gamma-api.polymarket.com/public-profile?address=${wallet}`, {
          next: { revalidate: 3600 },
        });
        if (pmRes.ok) {
          const pmData = await pmRes.json();
          if (pmData?.username) fallbackName = pmData.username;
        }
      } catch {
        // Silent — use abbreviated wallet
      }

      return {
        title: `${fallbackName} - Polymarket Trader Profile | Polycopy`,
        description: `View ${fallbackName}'s Polymarket trading profile, positions, and performance history on Polycopy.`,
        alternates: {
          canonical: `https://polycopy.app/trader/${wallet}`,
        },
        robots: {
          index: false,
          follow: true,
        }
      };
    }

    // Format trader name
    const displayName = trader.display_name && trader.display_name.trim() && 
                       !/^0x[a-fA-F0-9]{40}$/.test(trader.display_name.trim())
      ? trader.display_name.trim()
      : `Trader ${wallet.slice(0, 6)}...${wallet.slice(-4)}`;

    // Calculate ROI
    const roi = trader.volume > 0 ? ((trader.pnl / trader.volume) * 100).toFixed(1) : '0';
    const pnlFormatted = trader.pnl > 0 ? `+$${Math.abs(trader.pnl).toLocaleString()}` : `-$${Math.abs(trader.pnl).toLocaleString()}`;
    const volumeFormatted = `$${trader.volume.toLocaleString()}`;
    const winRateFormatted = trader.win_rate ? `${(trader.win_rate * 100).toFixed(1)}%` : 'N/A';

    const title = `${displayName} - Polymarket Trader Profile | Polycopy`;
    const description = `${displayName} on Polymarket: ${pnlFormatted} PnL, ${roi}% ROI, ${volumeFormatted} volume, ${winRateFormatted} win rate. ${trader.total_trades || 0} total trades. Copy this trader's strategies on Polycopy.`;

    return {
      title,
      description,
      keywords: [
        displayName,
        'Polymarket trader',
        'Polymarket profile',
        'copy trading',
        'prediction market trader',
        'Polymarket statistics',
        'trader performance',
        'Polymarket leaderboard',
      ],
      openGraph: {
        title,
        description,
        url: `https://polycopy.app/trader/${wallet}`,
        siteName: 'Polycopy',
        type: 'profile',
        images: trader.profile_image ? [
          {
            url: trader.profile_image,
            width: 400,
            height: 400,
            alt: `${displayName} profile picture`,
          }
        ] : [
          {
            url: '/og-image.png',
            width: 1200,
            height: 630,
            alt: `${displayName} - Polymarket Trader Profile`,
          }
        ],
      },
      twitter: {
        card: 'summary',
        title,
        description: `${displayName}: ${pnlFormatted} PnL, ${roi}% ROI. Copy this Polymarket trader on Polycopy.`,
        images: trader.profile_image ? [trader.profile_image] : ['/og-image.png'],
      },
      alternates: {
        canonical: `https://polycopy.app/trader/${wallet}`,
      },
      robots: {
        index: true,
        follow: true,
      },
    };
  } catch (error) {
    console.error('Error generating trader metadata:', error);
    const fallbackName = `Trader ${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
    return {
      title: `${fallbackName} - Polymarket Trader Profile | Polycopy`,
      description: `View ${fallbackName}'s Polymarket trading profile on Polycopy.`,
      alternates: {
        canonical: `https://polycopy.app/trader/${wallet}`,
      },
      robots: {
        index: false,
        follow: true,
      },
    };
  }
}

export default function V2TraderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
