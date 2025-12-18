# Turnkey Import v1.0 - Quick Reference

**Version:** 1.0  
**Date:** December 17, 2025  
**Status:** ✅ Production Ready

---

## What We Fixed

| Issue | Solution | Result |
|-------|----------|--------|
| Missing env validation | Added check at route entry | Clear 500 error if `TURNKEY_IMPORT_USER_ID` missing |
| Bundle deserialization error | Use `formatHpkeBuf()` instead of hex | Turnkey accepts JSON format `{encappedPublic, ciphertext}` |
| 500 on re-import | 3-layer idempotency + DB recreation | Re-imports return 200 with `ok: true` |

---

## Files Changed

```
app/api/turnkey/import-private-key/route.ts  (~40 lines)
lib/turnkey/import.ts                         (~80 lines)
app/profile/connect-wallet/page.tsx           (~10 lines)
```

---

## Key Features

✅ **Idempotent:** Re-importing same key returns 200  
✅ **DB Sync:** Auto-recreates DB record if missing  
✅ **Secure:** No secrets in logs  
✅ **Fast:** DB fast path avoids unnecessary API calls  

---

## Response Status Codes

| Status | Meaning |
|--------|---------|
| `imported` | New wallet imported ✅ |
| `already_imported` | Found in DB (fast path) ✅ |
| `already_imported_turnkey_db_recreated` | DB record recreated ✅ |

---

## Test Scenarios

1. **First import:** Returns `status: "imported"`
2. **Re-import:** Returns `status: "already_imported"` (fast)
3. **Re-import after DB delete:** Returns `status: "already_imported_turnkey_db_recreated"`

---

## Required Environment Variables

```bash
TURNKEY_ENABLED=true
TURNKEY_IMPORT_USER_ID=<uuid>
TURNKEY_IMPORT_API_PUBLIC_KEY=<key>
TURNKEY_IMPORT_API_PRIVATE_KEY=<key>
TURNKEY_ORGANIZATION_ID=<org-id>
NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID=<org-id>
```

---

## Rollback

```bash
git checkout HEAD~3 -- app/api/turnkey/import-private-key/route.ts
git checkout HEAD~3 -- lib/turnkey/import.ts
git checkout HEAD~3 -- app/profile/connect-wallet/page.tsx
```

---

## Monitoring

**Look for these logs:**

✅ Success:
```
[TURNKEY-ENV] importUserIdPresent=true
[TURNKEY-ENCRYPT] Using formatHpkeBuf
[TURNKEY-IMPORT] Import activity status: ACTIVITY_STATUS_COMPLETED
```

⚡ Fast path:
```
[TURNKEY-IMPORT-API] Wallet already imported (DB), returning existing
```

🔄 DB recreation:
```
[TURNKEY-IMPORT] DB record recreated successfully
```

---

## Quick Troubleshooting

| Error | Fix |
|-------|-----|
| "TURNKEY_IMPORT_USER_ID missing" | Set env var |
| "deserialize encrypted bundle" | Clear browser cache |
| Unique constraint error | Run migration 018 |
| No DB record after import | Re-import to recreate |

---

**Full Documentation:** See `TURNKEY_IMPORT_COMPLETE_V1.0.md`

