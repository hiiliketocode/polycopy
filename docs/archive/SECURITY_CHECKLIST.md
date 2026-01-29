# 🔒 Security Quick Reference Checklist

**Print this and keep it visible during security sprint**

---

## ⚡ Week 1: CRITICAL (Must Complete)

```
Day 1-2: Deploy Database Security
├─ [ ] Deploy RLS migrations (5 min)
├─ [ ] Enable leaked password protection (30 sec)
├─ [ ] Verify all tables protected
└─ [ ] Test workers still function

Day 3-4: Remove Auth Bypass & Add Rate Limiting
├─ [ ] Remove DEV_BYPASS_AUTH from production
├─ [ ] Sign up for Upstash Redis
├─ [ ] Install @upstash/ratelimit
├─ [ ] Add rate limiting to auth routes
├─ [ ] Add rate limiting to trading routes
└─ [ ] Test rate limits work

Day 5-7: Audit & Secure API Keys
├─ [ ] Find all SUPABASE_SERVICE_ROLE_KEY usage
├─ [ ] Document why each usage needs service role
├─ [ ] Refactor routes that don't need it
├─ [ ] Verify no keys in code/git
├─ [ ] Rotate all production API keys
└─ [ ] Document rotation procedures
```

**🎯 Week 1 Goal:** Close catastrophic vulnerabilities

---

## 🔥 Week 2: HIGH PRIORITY

```
Day 8-9: Multi-Factor Authentication
├─ [ ] Enable MFA in Supabase settings
├─ [ ] Build MFA enrollment UI
├─ [ ] Add MFA to login flow
├─ [ ] Make mandatory for admins
└─ [ ] Test thoroughly

Day 10-11: DDoS Protection
├─ [ ] Sign up for Cloudflare
├─ [ ] Add domain to Cloudflare
├─ [ ] Configure rate limiting rules
├─ [ ] Enable bot protection
├─ [ ] Test site through Cloudflare
└─ [ ] Monitor for 24 hours

Day 12-14: Security Logging
├─ [ ] Choose logging service
├─ [ ] Create logging utility
├─ [ ] Add logs to critical routes
├─ [ ] Set up security dashboard
├─ [ ] Configure alerts
└─ [ ] Test alert triggers
```

**🎯 Week 2 Goal:** Detect and prevent attacks

---

## 🛡️ Week 3: CONTINUE HIGH + START MEDIUM

```
Day 15-17: Input Validation
├─ [ ] Install Zod
├─ [ ] Create validation schemas
├─ [ ] Add to order placement
├─ [ ] Add to wallet operations
├─ [ ] Add to payment routes
└─ [ ] Test with malicious inputs

Day 18-19: Content Security Policy
├─ [ ] Add CSP headers to Next.js
├─ [ ] Test in report-only mode
├─ [ ] Fix any violations
├─ [ ] Switch to enforce mode
└─ [ ] Add other security headers

Day 20-21: Copy Trading Security
├─ [ ] Add trader validation
├─ [ ] Implement trade limits
├─ [ ] Add price staleness checks
├─ [ ] Prevent copy loops
└─ [ ] Add emergency stop
```

**🎯 Week 3 Goal:** Harden critical features

---

## 🔐 Week 4: MEDIUM PRIORITY

```
Day 22-23: Session Management
├─ [ ] Reduce session timeout to 24h
├─ [ ] Add session rotation
├─ [ ] Build active sessions page
├─ [ ] Allow remote logout
└─ [ ] Add geo tracking

Day 24-25: Security Notifications
├─ [ ] Build notification system
├─ [ ] Add email notifications
├─ [ ] Add in-app notifications
├─ [ ] Test all event types
└─ [ ] Monitor delivery

Day 26-28: Testing & Documentation
├─ [ ] Set up Snyk scanning
├─ [ ] Configure OWASP ZAP
├─ [ ] Schedule regular tests
├─ [ ] Write security runbook
├─ [ ] Train team
└─ [ ] Update documentation

Day 29-30: Review & Backup
├─ [ ] Review all completed items
├─ [ ] Set up automated backups
├─ [ ] Test recovery procedures
├─ [ ] Plan month 2 improvements
└─ [ ] Celebrate! 🎉
```

**🎯 Week 4 Goal:** Establish ongoing security

---

## 📊 Daily Standup Questions

Ask these every morning during security sprint:

1. **What security item did we complete yesterday?**
2. **What security item are we working on today?**
3. **Any blockers or security concerns?**
4. **Any new vulnerabilities discovered?**

---

## 🚨 Red Flags - Stop Everything If You See These

```
🔴 Active attack detected (unusual traffic patterns)
🔴 Data breach suspected (unauthorized access in logs)
🔴 Payment fraud detected (chargebacks, stolen cards)
🔴 API keys leaked (found in public repo/logs)
🔴 Service role key compromised (unauthorized DB access)
```

**If you see red flags:** Pause sprint, contain issue, notify team lead, follow incident response plan.

---

## ✅ Quick Verification Commands

**Check RLS enabled:**
```sql
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
```

**Check service role usage:**
```bash
grep -r "SUPABASE_SERVICE_ROLE_KEY" app/api
```

**Check for leaked secrets:**
```bash
git log -p | grep -i "sk_live\|supabase_service_role_key"
```

**Check rate limit working:**
```bash
# Hit endpoint 10 times quickly, should get 429
for i in {1..10}; do curl https://yoursite.com/api/endpoint; done
```

**Check CSP headers:**
```bash
curl -I https://yoursite.com | grep -i "content-security-policy"
```

---

## 🎯 Success Criteria

You're done when:
- ✅ All critical (Week 1) items complete
- ✅ All high priority (Weeks 2-3) items complete
- ✅ Rate limiting prevents DoS
- ✅ MFA enabled for admins
- ✅ Cloudflare blocks attacks
- ✅ Security logs capture events
- ✅ No service role in user-facing routes
- ✅ Input validation on all routes
- ✅ CSP prevents XSS
- ✅ Automated security scans running

---

## 📞 Quick Links

- **Full Action Plan:** `SECURITY_ACTION_PLAN.md`
- **RLS Fix Details:** `docs/RLS_SECURITY_FIX.md`
- **Password Protection:** `docs/ENABLE_LEAKED_PASSWORD_PROTECTION.md`
- **Complete Audit:** (Earlier in conversation)
- **Deploy Guide:** `DEPLOY_SECURITY_FIXES.md`

---

## 💡 Pro Tips

1. **Don't skip critical items** - They're called critical for a reason
2. **Test in dev first** - Always test security changes before production
3. **One PR per security fix** - Easier to review and rollback if needed
4. **Document everything** - Future you will thank present you
5. **Automate testing** - Use CI/CD to enforce security checks
6. **Review together** - Pair program on security-sensitive code
7. **Monitor constantly** - Security is ongoing, not one-time

---

## 🔄 After Month 1

Schedule these recurring tasks:
- **Daily:** Automated dependency scans
- **Weekly:** Review security logs
- **Monthly:** Manual penetration testing
- **Quarterly:** Rotate API keys
- **Yearly:** External security audit

---

**Keep this checklist updated as you complete items!**

**Track progress:** Add to your project board, assign owners, set deadlines.

**Need help?** Review the full `SECURITY_ACTION_PLAN.md` for detailed implementation steps.

🔒 **Security is a journey, not a destination. Let's go!**
