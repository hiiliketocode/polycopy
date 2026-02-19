import React from 'react'
import { Section, Text, Link } from '@react-email/components'
import { COLORS, FONTS } from './_styles'
import { EmailLayout, EmailBanner, EmailButton, EmailSection, StatBox } from './_layout'

interface TraderClosedPositionEmailProps {
  userName: string
  traderUsername: string
  marketTitle: string
  outcome: string
  userEntryPrice: number
  traderExitPrice: number
  userROI: number
  traderROI: number
  tradeUrl: string
  polymarketUrl: string
  unsubscribeUrl: string
}

const formatPrice = (price: number) => `${Math.round(price * 100)}¢`

export default function TraderClosedPositionEmail({
  traderUsername,
  marketTitle,
  outcome,
  userEntryPrice,
  traderExitPrice,
  userROI,
  traderROI,
  tradeUrl,
  polymarketUrl,
}: TraderClosedPositionEmailProps) {
  const yourRoiStr = `${userROI >= 0 ? '+' : ''}${userROI.toFixed(1)}%`
  const traderRoiStr = `${traderROI >= 0 ? '+' : ''}${traderROI.toFixed(1)}%`

  return (
    <EmailLayout previewText={`TRADER_CLOSED // @${traderUsername}`}>
      <EmailBanner title="TRADER CLOSED" subtitle="POSITION UPDATE" />

      <EmailSection title="SIGNAL_REPORT">
        <Text style={{ fontSize: '16px', lineHeight: '26px', margin: '0 0 48px 0', color: COLORS.black }}>
          A trader you are currently following has closed their position. Review the trade data below to
          determine your next action.
        </Text>

        {/* Trader Identifier Banner */}
        <Section style={{ backgroundColor: COLORS.yellow, padding: '28px 40px', marginBottom: '0' }}>
          <table width="100%" border={0} cellPadding="0" cellSpacing="0">
            <tbody>
              <tr>
                <td style={{ verticalAlign: 'top' }}>
                  <Text style={{ color: COLORS.black, fontSize: '12px', fontWeight: '900', letterSpacing: '4px', margin: '0 0 12px 0', textTransform: 'uppercase' as const, fontFamily: FONTS.mono }}>
                    TRADER IDENTIFIER
                  </Text>
                </td>
                <td align="right" style={{ verticalAlign: 'top' }}>
                  <div style={{ backgroundColor: COLORS.black, color: COLORS.yellow, display: 'inline-block', fontSize: '10px', fontWeight: '900', padding: '4px 10px', fontFamily: FONTS.mono, letterSpacing: '1px', textTransform: 'uppercase' as const }}>
                    SIGNAL SOURCE
                  </div>
                </td>
              </tr>
              <tr>
                <td colSpan={2}>
                  <Text style={{ color: COLORS.black, fontFamily: FONTS.header, fontSize: '48px', fontWeight: '900', margin: '0', lineHeight: '0.95', textTransform: 'uppercase' as const, letterSpacing: '-1.5px' }}>
                    @{traderUsername}
                  </Text>
                </td>
              </tr>
            </tbody>
          </table>
        </Section>

        {/* Market Asset + Outcome */}
        <div style={{ padding: '24px 0 0 0' }}>
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
        <table width="100%" border={0} cellPadding="0" cellSpacing="0" style={{ borderCollapse: 'collapse', marginTop: '48px' }}>
          <tbody>
            <tr>
              <StatBox label="YOUR ENTRY" value={formatPrice(userEntryPrice)} />
              <StatBox label="TRADER EXIT" value={formatPrice(traderExitPrice)} />
            </tr>
            <tr>
              <StatBox label="YOUR ROI" value={yourRoiStr} color={userROI >= 0 ? COLORS.green : COLORS.red} />
              <StatBox label="TRADER ROI" value={traderRoiStr} color={traderROI >= 0 ? COLORS.green : COLORS.red} />
            </tr>
          </tbody>
        </table>

        <EmailButton href={tradeUrl} text="MANAGE POSITION" />

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
            VIEW ON POLYMARKET EXPLORER →
          </Link>
        </div>
      </EmailSection>
    </EmailLayout>
  )
}
