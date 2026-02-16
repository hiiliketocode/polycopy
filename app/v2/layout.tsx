/**
 * V2 Layout
 *
 * Hides the global footer and bottom nav (rendered in root layout)
 * since v2 pages render their own V2Footer and BottomNav.
 *
 * The global Footer has class "bg-slate-900" and the global BottomNav
 * has "md:hidden fixed bottom-0". We target these specifically to avoid
 * double-rendering while keeping the v2 versions intact.
 */
export default function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <div data-v2-layout="">
      <style>{`
        /* When a v2 page is rendered, hide the global (old) footer */
        body > #main-content ~ footer.bg-slate-900 {
          display: none !important;
        }
        /* V2 pages use the industrial font stack */
        [data-v2-layout] {
          font-family: var(--font-dm-sans), "DM Sans", ui-sans-serif, system-ui, sans-serif;
        }
        [data-v2-layout] .font-sans {
          font-family: var(--font-space-grotesk), "Space Grotesk", ui-sans-serif, system-ui, sans-serif;
        }
      `}</style>
      {children}
    </div>
  )
}
