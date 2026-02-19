import React from 'react'
import { Section, Text } from '@react-email/components'
import { COLORS, FONTS } from './_styles'
import { EmailLayout, EmailBanner, EmailButton, EmailSection } from './_layout'

interface PremiumSubscriptionConfirmationEmailProps {
  userName: string
  subscriptionDate: string
  billingPeriod: 'monthly' | 'annual'
  amount: string
  profileUrl: string
}

export default function PremiumSubscriptionConfirmationEmail({
  userName = 'there',
  profileUrl = 'https://polycopy.app/v2/portfolio',
}: PremiumSubscriptionConfirmationEmailProps) {
  return (
    <EmailLayout previewText="PREMIUM_ACTIVATED // TERMINAL_UPGRADE_CONFIRMED">
      <EmailBanner title="PREMIUM ACTIVATED" subtitle="TERMINAL UPGRADE CONFIRMED" />

      <EmailSection title="PROVISIONING_REPORT">
        <Text style={{ fontSize: '16px', lineHeight: '26px', margin: '0 0 48px 0', color: COLORS.black }}>
          Thank you for upgrading{userName ? `, ${userName}` : ''}. Your account has been provisioned with
          advanced trading features and priority execution capabilities.
        </Text>

        {/* Yellow box with capabilities checklist */}
        <Section style={{ backgroundColor: COLORS.yellow, padding: '40px', marginBottom: '48px' }}>
          <table width="100%" border={0} cellPadding="0" cellSpacing="0">
            <tbody>
              <tr>
                <td>
                  <Text style={{ fontFamily: FONTS.mono, fontSize: '10px', fontWeight: '900', color: COLORS.black, margin: '0 0 8px 0', letterSpacing: '2px', textTransform: 'uppercase' as const }}>
                    BILLING_TIER
                  </Text>
                </td>
                <td align="right">
                  <div style={{ backgroundColor: COLORS.black, color: COLORS.yellow, display: 'inline-block', fontSize: '10px', fontWeight: '900', padding: '4px 10px', fontFamily: FONTS.mono, letterSpacing: '1px', textTransform: 'uppercase' as const }}>
                    SERVICE PLAN
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <Text style={{ fontFamily: FONTS.header, fontSize: '48px', fontWeight: '900', color: COLORS.black, lineHeight: '1', margin: '8px 0 0 0', letterSpacing: '-1.5px' }}>
            $20/MONTH
          </Text>

          <Text style={{ fontFamily: FONTS.header, fontSize: '12px', fontWeight: '900', letterSpacing: '2.5px', margin: '48px 0 24px 0', textTransform: 'uppercase' as const, color: COLORS.black }}>
            CORE CAPABILITIES UNLOCKED:
          </Text>

          {[
            'REAL-TIME COPY TRADING ENGINE',
            'AUTO-CLOSE EXECUTION LOGIC',
            'ADVANCED ALGORITHM CONTROLS',
            'PRIORITY NETWORK ACCESS',
            '24/7 SYSTEM MONITORING',
          ].map((cap, i) => (
            <table key={i} width="100%" border={0} cellPadding="0" cellSpacing="0" style={{ marginBottom: '14px' }}>
              <tbody>
                <tr>
                  <td style={{ width: '32px', verticalAlign: 'middle' }}>
                    <div style={{ width: '24px', height: '24px', border: `2px solid ${COLORS.black}`, textAlign: 'center' as const, lineHeight: '20px', fontSize: '14px', fontWeight: '900', color: COLORS.black }}>✓</div>
                  </td>
                  <td style={{ verticalAlign: 'middle', paddingLeft: '12px' }}>
                    <Text style={{ fontFamily: FONTS.header, fontSize: '13px', fontWeight: '900', letterSpacing: '0.5px', margin: '0', textTransform: 'uppercase' as const, color: COLORS.black }}>{cap}</Text>
                  </td>
                </tr>
              </tbody>
            </table>
          ))}
        </Section>

        <EmailButton href={profileUrl} text="GO TO PORTFOLIO" />
      </EmailSection>
    </EmailLayout>
  )
}
