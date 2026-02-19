# Gemini on a Separate Billing Project

Use a **different Google Cloud project** (and billing account) for the Generative Language API so the alpha agent and other Gemini usage are billed separately from the project where you disabled billing (e.g. after the BigQuery dispute).

No code changes are required. You only create a new project, enable the API, attach a different billing account, and use that project’s API key in this app.

---

## 1. Create or pick a separate project

- Go to [Google Cloud Console](https://console.cloud.google.com).
- Use the project dropdown → **New Project**, or select an existing project that **does not** use the disputed billing account.
- Note the **Project ID** (e.g. `my-app-gemini-only`).

---

## 2. Attach a different billing account

- In that project: **Billing** → **Link a billing account**.
- Choose a billing account that is **not** the one you disabled (e.g. a new account with a different card, or a different existing account).
- This project will only incur charges for APIs you enable here (e.g. Generative Language). BigQuery and other services in your *other* project are unaffected.

---

## 3. Enable the Generative Language API

- In the **same** project: **APIs & Services** → **Enable APIs and Services**.
- Search for **Generative Language API**.
- Open it and click **Enable** (product name: `generativelanguage.googleapis.com`).

---

## 4. Create an API key for this project

- In that project: **APIs & Services** → **Credentials**.
- **Create Credentials** → **API key**.
- (Optional) Restrict the key: **Application restrictions** and **API restrictions** → restrict to **Generative Language API** only.
- Copy the key.

Alternatively you can create a key from [Google AI Studio](https://aistudio.google.com/) and ensure it’s tied to this project when prompted.

---

## 5. Use the new key in this app

In this repo’s env (e.g. `.env.local`):

```bash
# Gemini / Alpha Agent — use key from the separate billing project
GEMINI_API_KEY=your_new_api_key_here
```

If you already have `GOOGLE_AI_API_KEY`, the app will use `GEMINI_API_KEY` in preference when both are set.

Restart the app so it picks up the new key. The alpha agent (and any other Gemini usage in this app) will now use the project that has the separate billing account; your original project’s billing can stay disabled.

---

## If you still get 429 "limit: 0" for gemini-2.5-pro

New projects (or new billing accounts) often get **zero** free-tier quota for `gemini-2.5-pro`. The API is enabled but the quota isn’t allocated yet.

**Immediate fix:** use Gemini 2.0 Flash, which usually has quota. In `.env.local` add:

```bash
# Use a model with available quota (2.5 Pro often has limit: 0 on new projects)
ALPHA_AGENT_MODEL=gemini-2.0-flash
```

Restart the app. The alpha agent will use 2.0 Flash for all roles; quality is slightly lower than 2.5 Pro but it works. Once your project gets 2.5 Pro quota (or you enable paid usage), you can remove this line to switch back.

---

## Summary

| Item | Original project (billing off) | New “Gemini-only” project |
|------|--------------------------------|----------------------------|
| Billing | Disabled (dispute) | Different billing account |
| BigQuery | Was there; now off | Not needed |
| Generative Language API | No quota when billing off | Enabled; use this project’s API key |
| This app | — | Set `GEMINI_API_KEY` to this project’s key |

Result: Gemini runs on the new billing center; BigQuery and the disputed account stay isolated.
