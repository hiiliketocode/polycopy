import type { Metadata } from "next";
import { createClient } from '@supabase/supabase-js';

interface Props {
  params: Promise<{
    id: string;
  }>;
}

// Generate dynamic metadata for each bot profile
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  
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

    const { data: wallet } = await supabase
      .from('ft_wallets')
      .select('*')
      .eq('wallet_id', id)
      .single();

    if (!wallet) {
      return {
        title: 'Trading Bot | Polycopy',
        description: 'View trading bot performance, strategy, and statistics on Polycopy.',
        alternates: {
          canonical: `https://polycopy.app/bots/${id}`,
        },
        robots: {
          index: false,
          follow: true,
        }
      };
    }

    const displayName = wallet.display_name || 'Trading Bot';
    const pnl = wallet.current_balance - wallet.starting_balance;
    const pnlFormatted = pnl >= 0 ? `+$${Math.abs(pnl).toFixed(0)}` : `-$${Math.abs(pnl).toFixed(0)}`;
    const roi = wallet.starting_balance > 0 
      ? ((pnl / wallet.starting_balance) * 100).toFixed(1) 
      : '0';
    const winRate = (wallet.won + wallet.lost) > 0
      ? ((wallet.won / (wallet.won + wallet.lost)) * 100).toFixed(1)
      : '0';

    const title = `${displayName} - Polymarket Trading Bot | Polycopy`;
    const description = `${displayName}: ${pnlFormatted} PnL, ${roi}% ROI, ${winRate}% win rate. Automated Polymarket trading strategy with real-time performance tracking.`;

    return {
      title,
      description,
      keywords: [
        displayName,
        'Polymarket bot',
        'trading bot',
        'automated trading',
        'copy trading bot',
        'Polymarket strategy',
      ],
      alternates: {
        canonical: `https://polycopy.app/bots/${id}`,
      },
      openGraph: {
        title,
        description,
        url: `https://polycopy.app/bots/${id}`,
        siteName: 'Polycopy',
        type: 'profile',
        images: [
          {
            url: '/og-image.png',
            width: 1200,
            height: 630,
            alt: `${displayName} - Polymarket Trading Bot`,
          }
        ],
      },
      twitter: {
        card: 'summary',
        title,
        description: `${displayName}: ${pnlFormatted} PnL, ${roi}% ROI. Automated Polymarket bot.`,
        images: ['/og-image.png'],
      },
      robots: {
        index: true,
        follow: true,
      },
    };
  } catch (error) {
    console.error('Error generating bot metadata:', error);
    return {
      title: 'Trading Bot | Polycopy',
      description: 'View trading bot performance and strategy on Polycopy.',
      alternates: {
        canonical: `https://polycopy.app/bots/${id}`,
      },
      robots: {
        index: false,
        follow: true,
      },
    };
  }
}

export default function V2BotLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
