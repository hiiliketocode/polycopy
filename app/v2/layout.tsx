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
      `}</style>
      {children}
    </div>
  )
}
