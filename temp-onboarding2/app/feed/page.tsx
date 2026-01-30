import Link from "next/link";

export const metadata = {
  title: "Feed - Polycopy",
  description: "View trades from traders you follow",
};

export default function FeedPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <svg
                className="w-5 h-5 text-primary-foreground"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l4.59-4.58L18 11l-6 6z" />
              </svg>
            </div>
            <span className="text-xl font-bold text-foreground">Polycopy</span>
          </div>
          <nav className="flex items-center gap-6">
            <Link
              href="/feed"
              className="font-medium text-foreground"
            >
              Feed
            </Link>
            <Link
              href="/discover"
              className="font-medium text-muted-foreground hover:text-foreground"
            >
              Discover
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-polycopy-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-polycopy-success"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Welcome to your feed!
          </h1>
          <p className="text-muted-foreground mb-6">
            This is a placeholder page. In production, you would see trades from
            the traders you follow.
          </p>
          <p className="text-sm text-muted-foreground">
            Onboarding complete! You can now start copy trading.
          </p>
        </div>
      </main>
    </div>
  );
}
