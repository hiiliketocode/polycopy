# Google Search Console - Quick Action Checklist

## Date: January 30, 2026

Use this checklist to quickly resolve the issues shown in your Google Search Console screenshot.

---

## ✅ Actions to Take (In Order of Priority)

### 1️⃣ Configure URL Parameters (5 minutes) ⚠️ CRITICAL
**This will fix 90% of your "Duplicate without user-selected canonical" issues**

1. Open [Google Search Console](https://search.google.com/search-console)
2. Select your property (polycopy.app)
3. Click **Settings** (left sidebar, bottom)
4. Click **Crawling** → **URL Parameters**
5. Add these parameters (click "Add parameter" for each):

| Parameter | Configuration |
|-----------|--------------|
| `tab` | "Doesn't affect page content - Ignore" |
| `category` | "Doesn't affect page content - Ignore" |
| `utm_source` | "Doesn't affect page content - Ignore" |
| `utm_medium` | "Doesn't affect page content - Ignore" |
| `utm_campaign` | "Doesn't affect page content - Ignore" |
| `fbclid` | "Doesn't affect page content - Ignore" |
| `gclid` | "Doesn't affect page content - Ignore" |

6. Click **Save**

**Result:** Within 1-2 weeks, the "Duplicate without user-selected canonical" count should drop from 17 to ~2-3.

---

### 2️⃣ Check Blocked Page (2 minutes)

1. In Google Search Console, click on **"Blocked by robots.txt"** (shows 1 page)
2. Review the URL that's blocked
3. Verify it should be blocked:
   - ✅ **Should be blocked**: `/api/*`, `/admin/*`, `/login`, `/onboarding`
   - ❌ **Should NOT be blocked**: `/discover`, `/faq`, `/trader/*`, public pages

**If incorrectly blocked:**
- Edit `/public/robots.txt` on your server
- Remove or adjust the blocking rule
- Redeploy your site
- Wait 24-48 hours for Google to re-crawl

---

### 3️⃣ Request Indexing for Important Pages (10 minutes)

1. In Google Search Console, click **"Crawled - currently not indexed"** (shows 10 pages)
2. Review the list of URLs
3. For each **important** page (trader profiles, discover categories):
   
   **Steps:**
   - Copy the URL
   - Go to **URL Inspection** tool (top of Search Console)
   - Paste the URL
   - Click **Test Live URL**
   - If it loads successfully, click **Request Indexing**
   - Wait for confirmation
   
4. **Don't request indexing for:**
   - Test pages
   - Old/deleted pages
   - Duplicate pages
   - Low-quality pages

**Note:** You can only request a limited number per day (~10-20), so prioritize:
- Top trader profiles
- Main category pages
- High-value content pages

---

### 4️⃣ Fix 404 Error (5 minutes)

1. Click **"Not found (404)"** (shows 1 page)
2. See which URL is returning 404
3. Determine what to do:

| Scenario | Action |
|----------|--------|
| Old page that moved | Add 301 redirect in `next.config.ts` |
| Typo in sitemap | Fix sitemap.ts and redeploy |
| Broken internal link | Find the link and fix it |
| Never existed / spam bot | Ignore (Google will eventually stop trying) |

**Example redirect (if needed):**
```typescript
// In next.config.ts
async redirects() {
  return [
    {
      source: '/old-page',
      destination: '/new-page',
      permanent: true, // 301 redirect
    },
  ];
}
```

---

### 5️⃣ Review Redirects (2 minutes) ℹ️ Optional

1. Click **"Page with redirect"** (shows 4 pages)
2. Review which pages have redirects
3. Verify they're intentional:
   - Old URLs redirecting to new ones ✅
   - Authentication flows ✅
   - Temporary redirects that should be permanent ⚠️

**If you find temporary (302) redirects that should be permanent (301):**
- Update them in your code
- Redeploy

---

## 📊 Monitoring Progress

### Week 1:
- [ ] Check "Duplicate without canonical" count (should start dropping)
- [ ] Verify requested pages are being indexed
- [ ] Monitor coverage report for changes

### Week 2:
- [ ] "Duplicate without canonical" should be <5
- [ ] More pages should show as "Valid"
- [ ] Check Performance tab for impression increases

### Week 4:
- [ ] Most important pages should be indexed
- [ ] Search queries should include trader names
- [ ] Organic traffic should be increasing

---

## 🔍 How to Check If It's Working

### Test 1: Trader Profile Search
```
site:polycopy.app {trader_name}
```
Should show the trader's profile page in Google results.

### Test 2: Category Search
```
site:polycopy.app discover politics
```
Should show discover page or politics category.

### Test 3: Check Index Status
In Search Console → Coverage:
- Watch "Valid" pages increase
- Watch error pages decrease

---

## 💡 Pro Tips

1. **Be Patient**: Changes take 1-2 weeks to reflect in Search Console
2. **Don't Over-Request Indexing**: Google limits how many you can request per day
3. **Focus on Quality**: Only request indexing for your best, most important pages
4. **Monitor Performance Tab**: This shows actual search traffic, which is more important than just being indexed

---

## 🚨 If Issues Persist After 2 Weeks

If you still see high numbers after 2 weeks:

1. **Duplicate Issues Still High?**
   - Double-check URL parameters were configured correctly
   - Look for other URL patterns causing duplicates
   - Consider noindex on less important pages

2. **Pages Still Not Indexed?**
   - Check page quality (thin content?)
   - Verify canonical URLs are correct
   - Add more internal links to these pages
   - Improve page content

3. **404s Keep Appearing?**
   - Use Chrome DevTools Network tab to find broken links
   - Check external sites linking to you
   - Review your sitemap for errors

---

## ✅ Quick Verification Checklist

Before closing this, verify:
- [ ] URL parameters configured in Search Console
- [ ] Blocked page identified and verified
- [ ] Top 5-10 important pages requested for indexing
- [ ] 404 page identified and fixed (if needed)
- [ ] Calendar reminder set for 2 weeks to check progress

---

## 📞 Need Help?

If you run into issues or have questions while going through this checklist, let me know!
