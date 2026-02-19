import React from 'react'
import { Section, Text } from '@react-email/components'
import { COLORS, FONTS } from './_styles'
import { EmailLayout, EmailBanner, EmailButton, EmailSection, StatBox } from './_layout'

interface MarketResolvedEmailProps {
  userName: string
  marketTitle: string
  resolvedOutcome: string
  userPosition: string
  userEntryPrice: number
  userROI: number
  betAmount: number | null
  didUserWin: boolean
  tradeUrl: string
  unsubscribeUrl: string
}

const formatPrice = (price: number) => `${Math.round(price * 100)}¢`

const formatMoney = (amount: number) => {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs < 1) return `${sign}${Math.round(abs * 100)}¢`
  return `${sign}$${abs.toFixed(2)}`
}

export default function MarketResolvedEmail({
  marketTitle,
  userPosition,
  userEntryPrice,
  userROI,
  betAmount,
  didUserWin,
  tradeUrl,
}: MarketResolvedEmailProps) {
  const resultColor = didUserWin ? COLORS.green : COLORS.red
  const resultText = didUserWin ? 'POSITION WON' : 'POSITION LOST'

  const winnings = (() => {
    if (!betAmount || !userEntryPrice || userEntryPrice === 0) return '$0.00'
    const shares = betAmount / userEntryPrice
    const totalPayout = shares * (didUserWin ? 1.0 : 0.0)
    const profit = totalPayout - betAmount
    return (profit >= 0 ? '+' : '') + formatMoney(profit)
  })()

  const roiStr = `${userROI >= 0 ? '+' : ''}${userROI.toFixed(1)}%`

  return (
    <EmailLayout previewText={`MARKET_RESOLVED // ${resultText}`}>
      <EmailBanner title="MARKET RESOLVED" subtitle="SETTLEMENT CONFIRMED" />

      <EmailSection title="SETTLEMENT_REPORT">
        <Text style={{ fontSize: '16px', lineHeight: '26px', margin: '0 0 48px 0', color: COLORS.black }}>
          A prediction market you copied has resolved. The final settlement has been processed and funds
          have been credited to your Polymarket account.
        </Text>

        {/* Settlement Status Banner */}
        <Section style={{ backgroundColor: COLORS.yellow, padding: '28px 40px', marginBottom: '0' }}>
          <table width="100%" border={0} cellPadding="0" cellSpacing="0">
            <tbody>
              <tr>
                <td style={{ verticalAlign: 'top' }}>
                  <Text style={{ color: COLORS.black, fontSize: '12px', fontWeight: '900', letterSpacing: '4px', fontFamily: FONTS.mono, margin: '0 0 12px 0' }}>
                    SETTLEMENT STATUS
                  </Text>
                </td>
                <td align="right" style={{ verticalAlign: 'top' }}>
                  <div style={{ backgroundColor: COLORS.black, color: COLORS.yellow, display: 'inline-block', fontSize: '10px', fontWeight: '900', padding: '4px 10px', fontFamily: FONTS.mono, letterSpacing: '1px', textTransform: 'uppercase' as const }}>
                    SETTLEMENT CONFIRMED
                  </div>
                </td>
              </tr>
              <tr>
                <td colSpan={2}>
                  <Text style={{ fontFamily: FONTS.header, fontSize: '48px', fontWeight: '900', color: COLORS.black, margin: '0', lineHeight: '0.95', letterSpacing: '-1.5px' }}>
                    {resultText}
                  </Text>
                </td>
              </tr>
            </tbody>
          </table>
        </Section>

        {/* Market Asset + Position */}
        <div style={{ padding: '24px 0 0 0' }}>
          <Text style={{ color: COLORS.secondary, fontSize: '10px', fontWeight: '900', letterSpacing: '2px', fontFamily: FONTS.mono, margin: '0 0 8px 0' }}>
            MARKET ASSET
          </Text>
          <Text style={{ fontFamily: FONTS.header, fontSize: '20px', fontWeight: '900', margin: '0 0 24px 0', textTransform: 'uppercase' as const, lineHeight: '1.3' }}>
            {marketTitle}
          </Text>
          <Text style={{ color: COLORS.secondary, fontSize: '10px', fontWeight: '900', letterSpacing: '2px', fontFamily: FONTS.mono, margin: '0 0 8px 0' }}>
            YOUR POSITION
          </Text>
          <Text style={{ fontFamily: FONTS.header, fontSize: '24px', fontWeight: '900', margin: '0', color: resultColor }}>
            {userPosition}
          </Text>
        </div>

        {/* Stats Grid */}
        <table width="100%" border={0} cellPadding="0" cellSpacing="0" style={{ borderCollapse: 'collapse', marginTop: '48px' }}>
          <tbody>
            <tr>
              <StatBox label="ENTRY PRICE" value={formatPrice(userEntryPrice)} />
              <StatBox label="BET AMOUNT" value={betAmount ? formatMoney(betAmount) : '--'} />
            </tr>
            <tr>
              <StatBox label="WINNINGS" value={winnings} color={resultColor} />
              <StatBox label="RETURN ON INV." value={roiStr} color={resultColor} />
            </tr>
          </tbody>
        </table>

        <EmailButton href={tradeUrl} text="VIEW SETTLEMENT DETAILS" />
      </EmailSection>
    </EmailLayout>
  )
}
