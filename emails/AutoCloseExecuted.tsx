import React from 'react'
import { Section, Text, Link } from '@react-email/components'
import { COLORS, FONTS } from './_styles'
import { EmailLayout, EmailBanner, EmailButton, EmailSection, StatBox } from './_layout'

interface AutoCloseExecutedEmailProps {
  userName: string
  marketTitle: string
  outcome: string
  side: 'BUY' | 'SELL'
  filledSize: number
  limitPrice: number
  estimatedProceeds: number | null
  orderId: string
  tradeUrl: string
  polymarketUrl: string
  unsubscribeUrl: string
}

const formatPrice = (price: number) => `${Math.round(price * 100)}¢`

const formatMoney = (amount: number) => {
  const abs = Math.abs(amount)
  if (abs < 1) return `${Math.round(abs * 100)}¢`
  return `$${abs.toFixed(2)}`
}

export default function AutoCloseExecutedEmail({
  marketTitle,
  outcome,
  side,
  filledSize,
  limitPrice,
  estimatedProceeds,
  orderId,
  tradeUrl,
  polymarketUrl,
}: AutoCloseExecutedEmailProps) {
  return (
    <EmailLayout previewText={`AUTO_CLOSE // ${marketTitle}`}>
      <EmailBanner title="AUTO-CLOSE EXECUTED" subtitle="ORDER FILL CONFIRMED" />

      <EmailSection title="EXECUTION_LOG">
        <Text style={{ fontSize: '16px', lineHeight: '26px', margin: '0 0 48px 0', color: COLORS.black }}>
          Our automated trading engine has successfully executed a close order. This action was triggered
          based on your pre-configured parameters.
        </Text>

        {/* Market Asset */}
        <div style={{ padding: '0 0 24px 0' }}>
          <Text style={{ color: COLORS.secondary, fontSize: '10px', fontWeight: '900', letterSpacing: '3px', margin: '0 0 8px 0', textTransform: 'uppercase' as const, fontFamily: FONTS.mono }}>
            MARKET ASSET
          </Text>
          <Text style={{ fontFamily: FONTS.header, fontSize: '20px', fontWeight: '900', margin: '0 0 16px 0', lineHeight: '1.3', textTransform: 'uppercase' as const }}>
            {marketTitle}
          </Text>
          <div style={{ backgroundColor: COLORS.black, color: COLORS.yellow, display: 'inline-block', fontSize: '12px', fontWeight: '900', padding: '8px 16px', lineHeight: '1', letterSpacing: '2px', textTransform: 'uppercase' as const }}>
            {outcome}
          </div>
        </div>

        {/* Stats Grid */}
        <table width="100%" border={0} cellPadding="0" cellSpacing="0" style={{ borderCollapse: 'collapse', marginTop: '32px' }}>
          <tbody>
            <tr>
              <StatBox label="TRADE SIDE" value={side} />
              <StatBox label="SHARE COUNT" value={filledSize.toFixed(4)} />
            </tr>
            <tr>
              <StatBox label="FILL PRICE" value={formatPrice(limitPrice)} />
              <StatBox label="NET PROCEEDS" value={estimatedProceeds !== null ? formatMoney(estimatedProceeds) : '--'} color={COLORS.green} />
            </tr>
          </tbody>
        </table>

        {/* Transaction Hash - plain text */}
        <div style={{ marginTop: '32px', marginBottom: '16px' }}>
          <Text style={{ color: COLORS.secondary, fontSize: '10px', fontWeight: '900', letterSpacing: '3px', margin: '0 0 8px 0', textTransform: 'uppercase' as const, fontFamily: FONTS.mono }}>
            TRANSACTION HASH / ID
          </Text>
          <Text style={{ color: COLORS.black, fontSize: '11px', fontFamily: FONTS.mono, wordBreak: 'break-all' as const, margin: '0', lineHeight: '1.6', letterSpacing: '0.5px' }}>
            {orderId}
          </Text>
        </div>

        <EmailButton href={tradeUrl} text="GO TO PORTFOLIO" />

        {/* Secondary Link */}
        <div style={{ textAlign: 'center' as const, paddingBottom: '16px' }}>
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
      </EmailSection>
    </EmailLayout>
  )
}
