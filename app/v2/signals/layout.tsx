import type { Metadata } from "next";
import { getAdminSessionUser } from "@/lib/admin";

export const metadata: Metadata = {
  title: "Polycopy Signals | How Our Intelligence Gives You Edge",
  description:
    "Learn how Polycopy classifies traders and uses ML score, win rate, conviction, experience, and ROI—backtested on top Polymarket traders—to power manual trading and copy bots.",
  keywords: [
    "Polycopy signals",
    "Polymarket copy trading",
    "prediction market signals",
    "trader intelligence",
    "ML score",
    "conviction score",
  ],
  openGraph: {
    title: "Polycopy Signals | Trader Intelligence That Gives You Edge",
    description: "Proven signals backtested on top traders. Learn how we help you trade smarter.",
    url: "https://polycopy.app/v2/signals",
  },
};

export const dynamic = "force-dynamic";

export default async function SignalsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const adminUser = await getAdminSessionUser();

  if (!adminUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="border border-border bg-card p-8 text-center rounded-xl max-w-sm">
          <p className="font-sans text-lg font-bold uppercase tracking-wide text-foreground">
            Access denied
          </p>
          <p className="mt-2 font-body text-sm text-muted-foreground">
            This page is only available to admins. Log in with an admin account to view Polycopy Signals.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
