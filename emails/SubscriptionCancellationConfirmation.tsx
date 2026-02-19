import React from 'react'
import { Section, Text } from '@react-email/components'
import { COLORS, FONTS } from './_styles'
import { EmailLayout, EmailBanner, EmailButton, EmailSection } from './_layout'

interface SubscriptionCancellationConfirmationEmailProps {
  userName: string
  cancellationDate: string
  accessUntil: string
  profileUrl: string
}

export default function SubscriptionCancellationConfirmationEmail({
  cancellationDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase(),
  accessUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase(),
  profileUrl = 'https://polycopy.app/v2/portfolio',
}: SubscriptionCancellationConfirmationEmailProps) {
  return (
    <EmailLayout previewText="PREMIUM_TERMINATED // SERVICE_DEPROVISIONED">
      <EmailBanner title="PREMIUM CANCELED" subtitle="SERVICE DE-PROVISIONING" />

      <EmailSection title="DEPROVISIONING_REPORT">
        <Text style={{ fontSize: '16px', lineHeight: '26px', margin: '0 0 48px 0', color: COLORS.black }}>
          Your request to terminate your subscription has been processed. Your features will remain active
          until the end of your current cycle.
        </Text>

        {/* Dates Card */}
        <Section style={{ backgroundColor: COLORS.cream, padding: '40px', marginBottom: '16px' }}>
          <table width="100%" border={0} cellPadding="0" cellSpacing="0">
            <tbody>
              <tr>
                <td>
                  <Text style={{ fontSize: '10px', fontWeight: '900', color: COLORS.secondary, margin: '0 0 8px 0', letterSpacing: '2px', textTransform: 'uppercase' as const, fontFamily: FONTS.mono }}>
                    CANCELLATION DATE
                  </Text>
                </td>
                <td align="right" style={{ verticalAlign: 'top' }}>
                  <div style={{ backgroundColor: COLORS.black, color: COLORS.yellow, display: 'inline-block', fontSize: '10px', fontWeight: '900', padding: '4px 10px', fontFamily: FONTS.mono, letterSpacing: '1px', textTransform: 'uppercase' as const }}>
                    ACCESS LOG
                  </div>
                </td>
              </tr>
              <tr>
                <td colSpan={2}>
                  <Text style={{ color: COLORS.black, fontFamily: FONTS.header, fontWeight: '900', fontSize: '16px', margin: '0 0 24px 0', letterSpacing: '1px' }}>
                    {cancellationDate}
                  </Text>
                  <Text style={{ fontSize: '10px', fontWeight: '900', color: COLORS.secondary, margin: '0 0 8px 0', letterSpacing: '2px', textTransform: 'uppercase' as const, fontFamily: FONTS.mono }}>
                    FINAL ACCESS DATE
                  </Text>
                  <Text style={{ color: COLORS.black, fontFamily: FONTS.header, fontWeight: '900', fontSize: '16px', margin: '0 0 16px 0', letterSpacing: '1px' }}>
                    {accessUntil}
                  </Text>
                  <Text style={{ fontSize: '12px', color: COLORS.secondary, fontStyle: 'italic', margin: '0', lineHeight: '18px' }}>
                    SYSTEM ADVISORY: Real-time copy trading and auto-close logic will be disabled on {accessUntil}.
                  </Text>
                </td>
              </tr>
            </tbody>
          </table>
        </Section>

        {/* Termination Protocols */}
        <Text style={{ fontFamily: FONTS.header, fontSize: '12px', fontWeight: '900', letterSpacing: '2.5px', margin: '48px 0 24px 0', textTransform: 'uppercase' as const, color: COLORS.black }}>
          TERMINATION PROTOCOLS:
        </Text>

        {[
          'RECURRING BILLING CYCLES PERMANENTLY HALTED.',
          'NETWORK CONNECTION TO WALLET SEVERED FOR SECURITY.',
          'AUTOMATED TRADE EXECUTION DISABLED.',
          'HISTORICAL DATA MOVES TO READ-ONLY MODE.',
        ].map((item, i) => (
          <div
            key={i}
            style={{
              border: `1px solid ${COLORS.border}`,
              padding: '16px 20px',
              marginBottom: '8px',
            }}
          >
            <Text style={{ fontFamily: FONTS.header, fontSize: '13px', fontWeight: '700', margin: '0', letterSpacing: '0.5px', textTransform: 'uppercase' as const }}>
              → {item}
            </Text>
          </div>
        ))}

        <EmailButton href={profileUrl} text="RESTORE ACCESS" />
      </EmailSection>
    </EmailLayout>
  )
}
