import { SEONav } from "@/components/polycopy-v2/seo-nav"
import { V2Footer } from "@/components/polycopy-v2/footer"

/**
 * SEO Pages Layout
 *
 * Wraps all public SEO/content pages with the v2 nav and footer.
 * Hides the global (v1) footer rendered by the root layout.
 */
export default function SEOLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-seo-layout="">
      <style>{`
        /* Hide the global v1 footer when an SEO page is rendered */
        body > #main-content ~ footer.bg-slate-900 {
          display: none !important;
        }
        /* Also hide the v1 mobile bottom nav */
        body > #main-content ~ nav.md\\:hidden.fixed.bottom-0 {
          display: none !important;
        }
      `}</style>
      <SEONav />
      <main>{children}</main>
      <V2Footer />
    </div>
  )
}
