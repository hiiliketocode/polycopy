# Emergency: Get Billing Support + Stop BigQuery Charges

## You're probably in the wrong support portal

The URL `support.google.com/a/contact/admin_no_access` is **Google Workspace / Admin** support, not **Google Cloud**. Use the **Cloud Console** links below.

---

## 1. Contact Billing Support (free – do this first)

**Option A – Billing chat (fastest)**  
1. Open: **https://console.cloud.google.com/support/chat**  
2. Make sure you're logged in as the same Google account that pays for Cloud (DonRaw@gmail.com).  
3. Click **"Get billing support"**.  
4. In the Billing Assistant, choose **Billing** and describe: unexpected $56k BigQuery Analysis bill, need help and possible refund; already charged.

**Option B – Create a case from Cloud Console**  
1. Open: **https://console.cloud.google.com/support/createcase**  
2. When asked for a product, select **Billing** → **Select**.  
3. Use **"Get billing support"** to open the Billing Assistant (same as above).

**If it says you're not a Billing Administrator**  
- Open the troubleshooter: **https://support.google.com/cloud/troubleshooter/9664343**  
- Use it for “unknown charges” / “unable to stop charges” – it will give you a contact path (e.g. form or email).

---

## 2. Stop new BigQuery charges immediately

Your Jobs explorer shows **millions** of jobs and many at 300–900 GB each. To stop new analysis charges:

1. Go to: **https://console.cloud.google.com/apis/library/bigquery.googleapis.com**  
2. Select the **project** that is incurring the cost (e.g. `gen-lang-client-0299056258`).  
3. Click **DISABLE** for the **BigQuery API**.

This stops new queries and ML jobs. Storage will still bill until you delete data; that’s usually a small fraction compared to 9,000+ TB of analysis.

You can re-enable the API after you’ve added safeguards (e.g. `maximumBytesBilled` on all queries and a budget).

---

## 3. When you talk to support, say this

- “I have an unexpected BigQuery bill of about **$56,000** in roughly two weeks (February 2026).”  
- “The cost is **BigQuery Analysis** (queries), not storage – about **9,000 TiB** processed.”  
- “I did not intend to spend this much. I’ve disabled the BigQuery API to stop further charges and want to understand options for a **refund or credit** and how to prevent this in future.”

---

## 4. After support and disabling the API

- Re-enable BigQuery only when you’re ready.  
- Add **bytes caps** to every query (`maximumBytesBilled` in Node, `maximum_bytes_billed` in Python).  
- Set a **budget** in Billing (e.g. $500–1000/month) with email alerts at 50%, 90%, 100%.  
- Use **Job history** to find what caused the spike (scheduled queries, pipelines, or app traffic) and fix or remove that source.
