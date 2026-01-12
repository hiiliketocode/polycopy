# 📦 Dependency Management Policy

**Effective Date:** January 11, 2026  
**Review Schedule:** Quarterly  
**Owner:** Development Team

---

## 🎯 **PURPOSE**

This policy defines how we manage npm dependencies to maintain security, stability, and maintainability of the Polycopy application.

---

## 📊 **CURRENT STATUS**

**Last Audit:** January 11, 2026  
**Dependencies:** 968 packages  
**Known Vulnerabilities:** 21 (3 critical, 4 high, 14 low)  
**Security Score:** 82/100

### **Accepted Risks:**
- **elliptic** (7 critical CVEs) - Mitigated by input validation + Turnkey isolation
- **ws** (1 high CVE) - Mitigated by rate limiting + connection limits

---

## 🔄 **UPDATE SCHEDULE**

### **Weekly (Automated via Dependabot):**
- Security patches (auto-PR)
- Dependency advisories monitoring

### **Monthly (Manual Review):**
- Review Dependabot PRs
- Check for new Polymarket package updates
- Run `npm audit` manually
- Update patch versions if needed

### **Quarterly (Comprehensive Audit):**
- Full dependency audit
- Update minor versions
- Review accepted risks
- Update this policy
- Consider major version upgrades

### **Annual (Strategic Review):**
- Major version upgrades
- Replace deprecated packages
- Evaluate new alternatives
- Architecture review

---

## 🚨 **SECURITY VULNERABILITY RESPONSE**

### **CRITICAL (Fix within 24 hours):**
- Private key exposure
- Authentication bypass
- Remote code execution
- SQL injection
- XSS (stored)

**Action:** Immediate fix + emergency deployment

---

### **HIGH (Fix within 1 week):**
- DoS attacks
- Information disclosure
- CSRF
- XSS (reflected)

**Action:** Fix in next scheduled deployment

---

### **MEDIUM (Fix within 1 month):**
- Dependency confusion
- Prototype pollution
- Low-severity DoS

**Action:** Include in next sprint

---

### **LOW (Fix as convenient):**
- Development dependencies
- Informational only
- Theoretical vulnerabilities

**Action:** Fix during regular maintenance

---

## ✅ **DEPENDENCY APPROVAL PROCESS**

### **Before Adding New Dependency:**

1. **Check necessity:**
   - Can we implement it ourselves?
   - Is it worth the maintenance cost?
   - Does it solve a real problem?

2. **Check quality:**
   - Weekly downloads > 10,000
   - Recent maintenance (updated in last 6 months)
   - Open issues < 50
   - Good test coverage
   - TypeScript support

3. **Check security:**
   - Run `npm audit`
   - Check Snyk advisories
   - Review GitHub security tab
   - Check for known vulnerabilities

4. **Check licensing:**
   - MIT, Apache 2.0, BSD (✅ Approved)
   - GPL (❌ Requires legal review)
   - Proprietary (❌ Requires approval)

5. **Document decision:**
   - Add comment in package.json
   - Update dependency list
   - Note in PR description

---

## 🔒 **ACCEPTED RISKS DOCUMENTATION**

### **Current Accepted Risks:**

#### **1. elliptic (Cryptography Library)**
- **CVEs:** 7 critical
- **Reason:** Polymarket dependency, no alternative
- **Mitigation:** Input validation + Turnkey key isolation
- **Residual Risk:** MINIMAL
- **Review Date:** Monthly until fixed
- **Escalation Path:** Switch to ethers v6 when Polymarket updates

#### **2. ws (WebSocket)**
- **CVE:** 1 high (DoS)
- **Reason:** Ethers.js dependency
- **Mitigation:** Rate limiting + connection limits
- **Residual Risk:** LOW
- **Review Date:** Quarterly
- **Escalation Path:** None (acceptable risk)

---

## 📋 **DEPENDENCY CATEGORIES**

### **Critical (Must Stay Updated):**
- Authentication: @supabase/supabase-js
- Payments: stripe
- Security: crypto-related packages
- Framework: next, react

**Update Policy:** Within 1 week of release (after testing)

---

### **Important (Regular Updates):**
- UI: @radix-ui/*
- Forms: react-hook-form
- API: axios
- Database: @supabase/*

**Update Policy:** Monthly (with testing)

---

### **Standard (Periodic Updates):**
- Utilities: date-fns, lodash
- Icons: lucide-react
- Styling: tailwindcss

**Update Policy:** Quarterly

---

### **Development Only:**
- Testing: @testing-library/*
- Linting: eslint
- Types: @types/*

**Update Policy:** As needed

---

## 🛠️ **TOOLS & AUTOMATION**

### **Dependabot (GitHub):**
- ✅ Enabled
- Weekly scans
- Auto-PR for security patches
- Manual review required for merging

### **npm audit:**
- Run monthly
- Run before each deployment
- Document results

### **Snyk (Optional):**
- Consider for additional scanning
- Integrates with GitHub
- $0-$99/month

---

## 📝 **MAINTENANCE PROCEDURES**

### **Monthly Dependency Review:**

1. **Run audit:**
   ```bash
   npm audit
   npm outdated
   ```

2. **Review Dependabot PRs:**
   - Check for breaking changes
   - Review changelogs
   - Test locally
   - Merge or close with reason

3. **Update patch versions:**
   ```bash
   npm update
   ```

4. **Test thoroughly:**
   - Run test suite
   - Manual testing of critical paths
   - Check for regressions

5. **Document changes:**
   - Update CHANGELOG
   - Note any issues
   - Update this policy if needed

---

### **Quarterly Comprehensive Audit:**

1. **Security audit:**
   ```bash
   npm audit
   npm audit fix
   ```

2. **Check outdated:**
   ```bash
   npm outdated
   ```

3. **Review accepted risks:**
   - Still necessary?
   - Still mitigated?
   - Any updates available?

4. **Update minor versions:**
   ```bash
   npm update --save
   ```

5. **Test extensively:**
   - Full regression testing
   - Load testing
   - Security testing

6. **Update documentation:**
   - This policy
   - README
   - Security docs

---

## 🚫 **FORBIDDEN PRACTICES**

### **NEVER:**
- Install packages with `--force` without review
- Use `npm audit fix --force` in production
- Ignore security warnings without documentation
- Add dependencies without approval
- Use unmaintained packages (>1 year old)
- Use packages with known critical vulnerabilities
- Install packages from unofficial registries

### **ALWAYS:**
- Run `npm audit` before deployment
- Test after updating dependencies
- Document accepted risks
- Review changelogs
- Check for breaking changes
- Keep lockfile in git
- Use exact versions for critical dependencies

---

## 📈 **METRICS & MONITORING**

### **Track Monthly:**
- Total dependencies
- Known vulnerabilities
- Outdated packages
- Dependabot PR merge rate
- Time to fix critical CVEs

### **Target Metrics:**
- Security Score: > 80/100
- Critical CVEs: 0
- High CVEs: < 5
- Outdated packages: < 20%
- Time to fix critical: < 24 hours

---

## 🎓 **TRAINING & AWARENESS**

### **All Developers Must:**
- Read this policy
- Understand security risks
- Know how to run audits
- Report vulnerabilities
- Follow approval process

### **Security Champion:**
- Owner: Brad
- Responsibilities:
  - Weekly security monitoring
  - Monthly audit reviews
  - Dependabot PR triage
  - Policy updates

---

## 📞 **INCIDENT RESPONSE**

### **If Critical Vulnerability Found:**

1. **Assess impact:**
   - Does it affect us?
   - Can it be exploited?
   - What's the risk?

2. **Notify team:**
   - Slack #security channel
   - Email team@polycopy.app
   - Create incident ticket

3. **Fix immediately:**
   - Create hotfix branch
   - Apply patch
   - Test thoroughly
   - Deploy emergency release

4. **Document:**
   - What happened
   - How we fixed it
   - Lessons learned
   - Update policy

---

## 🔄 **POLICY REVIEW**

This policy is reviewed:
- **Quarterly:** Minor updates
- **Annually:** Major revision
- **As needed:** After incidents

**Last Review:** January 11, 2026  
**Next Review:** April 11, 2026  
**Reviewer:** Brad

---

## 📚 **REFERENCES**

- [npm audit documentation](https://docs.npmjs.com/cli/v8/commands/npm-audit)
- [Dependabot documentation](https://docs.github.com/en/code-security/dependabot)
- [Snyk vulnerability database](https://security.snyk.io/)
- [OWASP Dependency Check](https://owasp.org/www-project-dependency-check/)
- [GitHub Security Advisories](https://github.com/advisories)

---

## ✅ **CHECKLIST FOR DEVELOPERS**

### **Before Adding Dependency:**
- [ ] Checked if necessary
- [ ] Reviewed package quality
- [ ] Ran security checks
- [ ] Verified license
- [ ] Documented decision

### **Monthly Review:**
- [ ] Ran `npm audit`
- [ ] Reviewed Dependabot PRs
- [ ] Updated patch versions
- [ ] Tested changes
- [ ] Updated docs

### **Before Deployment:**
- [ ] Ran `npm audit`
- [ ] No critical CVEs
- [ ] All tests passing
- [ ] Reviewed changes
- [ ] Updated lockfile

---

*Policy effective: January 11, 2026*  
*Version: 1.0*  
*Owner: Development Team*
