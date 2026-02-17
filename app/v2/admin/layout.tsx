import { getAdminSessionUser } from "@/lib/admin"

export const dynamic = "force-dynamic"

export default async function V2AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const adminUser = await getAdminSessionUser()

  if (!adminUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-poly-cream">
        <div className="border border-border bg-poly-paper p-8 text-center">
          <p className="font-sans text-lg font-bold uppercase tracking-wide text-poly-black">
            Access Denied
          </p>
          <p className="mt-2 font-body text-sm text-muted-foreground">
            Please log in with an admin account to view this page.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
