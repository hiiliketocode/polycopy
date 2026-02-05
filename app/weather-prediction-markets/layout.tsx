import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Weather Prediction Markets: Temperature, Hurricanes & Climate Trading 2026 | Polycopy',
  description: 'Trade weather prediction markets on Polymarket. Follow meteorology experts profiting from temperature records, hurricane forecasts, snowfall, and extreme weather. Copy expert strategies.',
  keywords: ['weather prediction markets', 'temperature markets', 'hurricane markets', 'weather trading', 'meteorology', 'weather traders', 'polymarket weather'],
  alternates: {
    canonical: 'https://polycopy.app/weather-prediction-markets',
  },
  openGraph: {
    title: 'Weather Prediction Markets: Temperature, Hurricanes & Climate Trading 2026',
    description: 'Follow top weather traders on Polymarket and copy their strategies.',
    type: 'website',
    url: 'https://polycopy.app/weather-prediction-markets',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Weather Prediction Markets | Polycopy',
    description: 'Trade temperature, hurricanes, and weather markets',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
