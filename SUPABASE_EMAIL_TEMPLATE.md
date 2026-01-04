# Supabase Magic Link Email Template Update

## 📧 You're in the right place!

The template you have open in Supabase (**Confirm sign up**) is where the magic link email is configured.

---

## 🎨 Updated HTML Template

Replace the entire body HTML with this improved version that includes the proper logo:

```html
<h2>Confirm your signup</h2>

<!-- Logo Section -->
<div style="text-align: center; margin: 30px 0;">
  <img 
    src="https://polycopy.app/logos/polycopy-logo-primary.svg" 
    alt="Polycopy" 
    style="width: 180px; height: auto; display: block; margin: 0 auto;" 
  />
</div>

<p>Follow this link to confirm your user:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm your mail</a></p>

<p style="color: #666; font-size: 14px; margin-top: 30px;">
  If you didn't request this email, you can safely ignore it.
</p>
```

---

## 🔄 Alternative: Use Icon + Text Logo

If the SVG doesn't load properly, try this version with icon + text:

```html
<h2>Confirm your signup</h2>

<!-- Logo Section -->
<div style="text-align: center; margin: 30px 0;">
  <img 
    src="https://polycopy.app/logos/polycopy-logo-icon.svg" 
    alt="Polycopy" 
    style="width: 48px; height: 48px; display: block; margin: 0 auto 12px auto;" 
  />
  <h1 style="margin: 0; font-size: 28px; font-weight: bold; color: #1e293b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    Polycopy
  </h1>
</div>

<p>Follow this link to confirm your user:</p>
<p><a href="{{ .ConfirmationURL }}" style="background-color: #FDB022; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Confirm Your Email</a></p>

<p style="color: #666; font-size: 14px; margin-top: 30px;">
  If you didn't request this email, you can safely ignore it.
</p>
```

---

## 📋 Steps:

1. **Copy one of the HTML templates above** (first one is simpler, second is fancier)
2. **Paste it into the "Body" field** in the Supabase editor (replacing lines 1-4)
3. **Click "Save changes"** at the bottom right
4. **Test it**:
   - Log out of Polycopy
   - Go to `/login`
   - Enter your email
   - Check your inbox - logo should be crisp! ✅

---

## 🚨 If Logo Doesn't Load:

If `https://polycopy.app/logos/...` doesn't work (because it's not deployed yet), you have two options:

### Option 1: Use a direct image URL
Upload the logo to a service like:
- Imgur
- GitHub (use raw.githubusercontent.com URL)
- Supabase Storage (see below)

### Option 2: Upload to Supabase Storage
1. Go to **Storage** in Supabase dashboard
2. Create a public bucket called `public-assets`
3. Upload `polycopy-logo-primary.svg`
4. Copy the public URL
5. Use that URL in the email template

---

## ✅ Expected Result:

After saving, users will receive a clean, professional magic link email with:
- ✅ Crisp Polycopy logo (SVG)
- ✅ Clear "Confirm your mail" call-to-action
- ✅ Professional spacing and styling
- ✅ Matches Polycopy's brand

---

**Need help?** Test it by logging out and requesting a new magic link!

