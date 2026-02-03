# Deployment Checklist - SEO & Performance Improvements

## Date: January 30, 2026

---

## ✅ Pre-Deployment Checklist

### 1. Verify All Changes Are Committed
```bash
git status
```

Should show all new/modified files:
- `/public/robots.txt` (new)
- `/app/layout.tsx` (modified)
- `/app/sitemap.ts` (modified)
- `/app/faq/page.tsx` (modified)
- `/app/faq/layout.tsx` (new)
- `/app/discover/layout.tsx` (new)
- `/app/terms/layout.tsx` (new)
- `/app/privacy/layout.tsx` (new)
- `/app/trader/[wallet]/layout.tsx` (new)
- `/next.config.ts` (modified)
- `/docs/*.md` (new - documentation)

### 2. Test Locally
```bash
npm run dev
```

**Visit and verify:**
- [ ] Homepage: http://localhost:3000
- [ ] Discover: http://localhost:3000/discover
- [ ] FAQ: http://localhost:3000/faq
- [ ] Terms: http://localhost:3000/terms
- [ ] Privacy: http://localhost:3000/privacy
- [ ] Trader profile: http://localhost:3000/trader/{any-wallet}
- [ ] Sitemap: http://localhost:3000/sitemap.xml
- [ ] Robots: http://localhost:3000/robots.txt

**Check for:**
- No console errors
- Pages load correctly
- Metadata appears in `<head>` (View Source)

### 3. Build for Production
```bash
npm run build
```

**Look for:**
- ✅ No build errors
- ✅ Bundle sizes (should be reasonable)
- ✅ Static generation success

---

## 🚀 Deployment Steps

### 1. Commit Changes
```bash
git add .
git commit -m "SEO improvements: metadata, structured data, sitemap, Core Web Vitals fixes"
```

### 2. Push to Main
```bash
git push origin main
```

### 3. Verify Deployment
Wait for deployment to complete (Fly.io or your hosting), then verify:

---

## ✅ Post-Deployment Verification

### 1. Check Live URLs (CRITICAL)
Visit these URLs on your **live site** (polycopy.app):

- [ ] https://polycopy.app/robots.txt
  - Should display robots.txt content
  
- [ ] https://polycopy.app/sitemap.xml
  - Should show XML sitemap with all pages
  - Verify FAQ page is included
  - Verify category pages are included
  - Verify trader profiles are included
  
- [ ] https://polycopy.app
  - View Source → Check for Organization schema
  
- [ ] https://polycopy.app/discover
  - View Source → Check for BreadcrumbList schema
  - Check for canonical URL
  
- [ ] https://polycopy.app/faq
  - View Source → Check for FAQPage schema
  - Check for all FAQ questions in schema
  
- [ ] https://polycopy.app/trader/{wallet}
  - Pick any active trader
  - View Source → Check for dynamic metadata
  - Verify trader name, stats in title/description

### 2. Test Structured Data
**Google Rich Results Test:**
- URL: https://search.google.com/test/rich-results
- Test each page:
  - [ ] Homepage (Organization + WebSite schema)
  - [ ] /discover (BreadcrumbList schema)
  - [ ] /faq (FAQPage schema)
  - [ ] /trader/{wallet} (Profile metadata)

**Should see:**
- ✅ "Page is eligible for rich results"
- ✅ Green checkmarks for valid schemas
- ❌ No errors

### 3. Test Mobile Performance
**PageSpeed Insights:**
- URL: https://pagespeed.web.dev/
- Test: https://polycopy.app

**Mobile score should:**
- Performance: Aim for >60 (>80 is ideal)
- LCP: Aim for <2.5s

**Desktop score should:**
- Performance: Aim for >80 (>90 is ideal)
- LCP: Aim for <2.5s
- CLS: Aim for <0.1

---

## 📊 Google Search Console Setup

### 1. Submit Sitemap (CRITICAL - 5 minutes)

**Steps:**
1. Go to [Google Search Console](https://search.google.com/search-console)
2. Select your property (polycopy.app)
3. Click **Sitemaps** (left sidebar)
4. In the "Add a new sitemap" field, enter: `sitemap.xml`
5. Click **Submit**
6. Wait 24-48 hours for Google to process

**Expected Result:**
- Status: "Success" 
- Discovered URLs: Should increase (include FAQ, categories, traders)

### 2. Configure URL Parameters (CRITICAL - 5 minutes)

**Steps:**
1. In Google Search Console, click **Settings** (left sidebar, bottom)
2. Click **Crawling** → **URL Parameters**
3. Add these parameters (click "Add parameter" for each):

| Parameter | Setting |
|-----------|---------|
| `tab` | Doesn't affect page content |
| `category` | Doesn't affect page content |
| `utm_source` | Doesn't affect page content |
| `utm_medium` | Doesn't affect page content |
| `utm_campaign` | Doesn't affect page content |
| `fbclid` | Doesn't affect page content |
| `gclid` | Doesn't affect page content |

4. Click **Save**

**Expected Result:**
- Within 1-2 weeks: "Duplicate without canonical" issues drop from 17 → <5

### 3. Request Indexing for Key Pages (10 minutes)

**Priority pages to request:**
1. https://polycopy.app/faq
2. https://polycopy.app/discover
3. Top 5-10 trader profiles

**Steps for each:**
1. Click **URL Inspection** (top of Search Console)
2. Paste the URL
3. Click **Test Live URL**
4. If successful, click **Request Indexing**
5. Wait for confirmation

**Note:** You can only request ~10-20 per day, so prioritize!

---

## 📊 Bing Webmaster Tools Setup

### Submit Sitemap to Bing

**Steps:**
1. Go to [Bing Webmaster Tools](https://www.bing.com/webmasters)
2. Add/verify your site (if not already)
3. Go to **Sitemaps**
4. Enter: `https://polycopy.app/sitemap.xml`
5. Click **Submit**

---

## 📈 Monitoring Schedule

### Week 1:
- [ ] Check sitemap status in GSC (should be "Success")
- [ ] Verify no new errors in Coverage report
- [ ] Check Core Web Vitals report (may not update yet)

### Week 2:
- [ ] Check "Duplicate without canonical" count (should decrease)
- [ ] Check "Valid" pages count (should increase)
- [ ] Review Performance tab for any new queries

### Week 3-4:
- [ ] FAQ rich snippets should start appearing
- [ ] Trader profiles should be indexed
- [ ] Check for trader name queries

### Month 2:
- [ ] Core Web Vitals should improve
- [ ] Organic traffic should increase 10-20%
- [ ] More long-tail keywords appearing

### Monthly Ongoing:
- [ ] Review top queries in GSC Performance
- [ ] Check which pages get most organic traffic
- [ ] Monitor bounce rate and engagement
- [ ] Look for ranking improvements

---

## 🔍 Success Metrics

### Google Search Console - Performance Tab

**Current (Pre-SEO):**
- Clicks: 102
- Impressions: 1,750
- CTR: 5.8%
- Position: 5.5

**Target (Month 1):**
- Clicks: 150-200 (+50-100%)
- Impressions: 3,000-4,000 (+70-130%)
- CTR: 6-8%
- Position: 4-5 (maintain or improve)

**Target (Month 3):**
- Clicks: 500-1,000 (+400-900%)
- Impressions: 10,000-15,000 (+470-750%)
- CTR: 6-8%
- Position: 3-4 (top 3-4 on average)

### Core Web Vitals

**Current:**
- Mobile LCP: >2.5s (5 URLs failing) ❌
- Desktop CLS: >0.1 (5 URLs failing) ❌
- Desktop LCP: >2.5s ❌

**Target (Month 1):**
- Mobile LCP: <2.5s (all URLs) ✅
- Desktop CLS: <0.1 (all URLs) ✅
- Desktop LCP: <2.0s (all URLs) ✅

---

## 🚨 Troubleshooting

### If sitemap shows errors:
1. Check the sitemap is accessible: https://polycopy.app/sitemap.xml
2. Validate XML format (should be valid XML)
3. Check for broken URLs in sitemap
4. Re-submit after fixing

### If pages aren't getting indexed:
1. Verify robots.txt isn't blocking: https://polycopy.app/robots.txt
2. Check canonical URLs are correct (View Source)
3. Request indexing manually (URL Inspection tool)
4. Wait 1-2 weeks - Google is slow sometimes

### If duplicate issues persist:
1. Verify URL parameters were configured correctly
2. Check canonical URLs in View Source
3. Look for other URL patterns causing duplicates
4. Consider adding more canonical rules

### If Core Web Vitals don't improve:
1. Run PageSpeed Insights to see specific issues
2. Check if images are using Next.js Image component
3. Verify lazy loading is working
4. Check bundle size (`npm run build`)
5. See CORE_WEB_VITALS_FIXES.md for detailed fixes

---

## 📝 Next Steps After Deployment

### Immediate (Today):
1. ✅ Deploy to production
2. ✅ Verify all URLs work
3. ✅ Submit sitemap to GSC
4. ✅ Configure URL parameters in GSC

### This Week:
5. ✅ Request indexing for top pages
6. ✅ Submit sitemap to Bing
7. ✅ Test structured data

### Next Week:
8. ✅ Monitor GSC Coverage report
9. ✅ Check for indexing progress
10. ✅ Review Performance report for new queries

### Ongoing:
11. ✅ Work on Core Web Vitals fixes (see CORE_WEB_VITALS_FIXES.md)
12. ✅ Monitor rankings weekly
13. ✅ Adjust strategy based on data

---

## 📞 Questions or Issues?

If you run into any problems during deployment or setup, let me know!

**Remember:**
- Be patient - SEO takes 2-4 weeks to show results
- Focus on the data - monitor GSC Performance tab
- Keep improving - SEO is an ongoing process

**Good luck with the deployment! 🚀**
