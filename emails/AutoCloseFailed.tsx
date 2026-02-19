import React from 'react'
import { Text, Link, Hr } from '@react-email/components'
import { COLORS, FONTS } from './_styles'
import { EmailLayout, EmailBanner, EmailButton, EmailSection } from './_layout'

interface AutoCloseFailedEmailProps {
  userName: string
  marketTitle: string
  outcome: string
  reason: string
  tradeUrl: string
  polymarketUrl: string
  unsubscribeUrl: string
}

export default function AutoCloseFailedEmail({
  marketTitle,
  outcome,
  reason,
  polymarketUrl,
}: AutoCloseFailedEmailProps) {
  return (
    <EmailLayout previewText={`AUTO_CLOSE_FAILURE // ${marketTitle}`}>
      <EmailBanner title="AUTO-CLOSE FAILED" subtitle="ORDER FILL REJECTED" />
      <Hr style={{ borderColor: COLORS.red, borderWidth: '4px', margin: '0' }} />

      <EmailSection title="FAILURE_ANALYSIS">
        <Text style={{ fontSize: '16px', lineHeight: '26px', margin: '0 0 48px 0', color: COLORS.black }}>
          We attempted to execute an automated close order, but the order failed to fill within your
          specified parameters. Manual intervention may be required.
        </Text>

        {/* Market Asset */}
        <div style={{ padding: '0 0 16px 0' }}>
          <Text style={{ color: COLORS.secondary, fontSize: '10px', fontWeight: '900', letterSpacing: '3px', margin: '0 0 8px 0', textTransform: 'uppercase' as const, fontFamily: FONTS.mono }}>
            MARKET ASSET
          </Text>
          <Text style={{ fontFamily: FONTS.header, fontSize: '20px', fontWeight: '900', margin: '0 0 16px 0', lineHeight: '1.3', textTransform: 'uppercase' as const }}>
            {marketTitle}
          </Text>
          <div style={{ backgroundColor: COLORS.red, color: COLORS.white, display: 'inline-block', fontSize: '12px', fontWeight: '900', padding: '8px 16px', lineHeight: '1', letterSpacing: '2px', textTransform: 'uppercase' as const }}>
            {outcome}
          </div>
        </div>

        {/* Rejection Reason */}
        <div style={{ marginTop: '16px', marginBottom: '16px' }}>
          <Text style={{ color: COLORS.red, fontSize: '10px', fontWeight: '900', letterSpacing: '3px', margin: '0 0 8px 0', textTransform: 'uppercase' as const, fontFamily: FONTS.mono }}>
            REJECTION REASON
          </Text>
          <Text style={{ fontSize: '15px', lineHeight: '24px', margin: '0', color: COLORS.black, fontFamily: FONTS.mono, textTransform: 'uppercase' as const }}>
            {reason || 'The limit price was not hit.'}
          </Text>
        </div>

        <EmailButton href="https://polycopy.app/v2/portfolio" text="CLOSE POSITION MANUALLY" />

        {/* Secondary Link */}
        <div style={{ textAlign: 'center' as const, paddingBottom: '24px' }}>
          <Link
            href={polymarketUrl}
            style={{
              fontFamily: FONTS.header,
              fontSize: '12px',
              fontWeight: '900',
              color: COLORS.black,
              textDecoration: 'underline',
              letterSpacing: '1px',
              textTransform: 'uppercase' as const,
            }}
          >
            VIEW SOURCE ON POLYMARKET →
          </Link>
        </div>

        {/* Advisory */}
        <Text style={{ fontSize: '12px', lineHeight: '18px', color: COLORS.secondary, fontFamily: FONTS.mono, fontStyle: 'italic', margin: '0', letterSpacing: '0.3px' }}>
          ADVISORY: If the market has moved beyond your slippage tolerance, consider adjusting your limit
          price or executing a market order.
        </Text>
      </EmailSection>
    </EmailLayout>
  )
}
