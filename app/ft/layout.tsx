import { getAdminSessionUser } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export default async function FTLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const adminUser = await getAdminSessionUser();

  if (!adminUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#05070E] text-white">
        <p className="max-w-md text-center text-lg">
          Access denied. Please log in with an admin account to view this page.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
