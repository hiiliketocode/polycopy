import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Hr,
  Row,
  Column,
} from '@react-email/components'

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

export default function MarketResolvedEmail({
  marketTitle,
  userPosition,
  userEntryPrice,
  userROI,
  betAmount,
  didUserWin,
  tradeUrl,
  unsubscribeUrl,
}: MarketResolvedEmailProps) {
  const formatPrice = (price: number) => {
    const cents = Math.round(price * 100)
    return `${cents}¢`
  }
  
  const formatMoney = (amount: number) => {
    if (amount < 1) {
      return `${Math.round(amount * 100)}¢`
    }
    return `$${amount.toFixed(2)}`
  }
  
  // Calculate winnings: profit = (final payout - entry price) * bet amount
  // If won: (1.00 - entry price) * bet amount
  // If lost: (0.00 - entry price) * bet amount = negative
  const calculateWinnings = () => {
    if (!betAmount) return '$0.00'
    const finalPayout = didUserWin ? 1.00 : 0.00
    const profit = (finalPayout - userEntryPrice) * betAmount
    return formatMoney(profit)
  }

  return (
    <Html>
      <Head />
      <Preview>Market Resolved: "{marketTitle}"</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Logo */}
          <Section style={logoSection}>
            <Img
              src="https://polycopy.app/logos/polycopy-logo-primary.png"
              width="120"
              height="auto"
              alt="Polycopy"
              style={logo}
            />
          </Section>

          {/* Header Banner - Always Yellow */}
          <Section style={headerBanner}>
            <Heading style={h1}>Market Resolved</Heading>
          </Section>
          
          <Section style={contentSection}>
            <Text style={text}>
              A prediction market you copied has resolved. Here's how it turned out:
            </Text>
            
            {/* Result Banner */}
            <Section style={didUserWin ? resultBannerWin : resultBannerLoss}>
              <Text style={resultLabel}>FINAL RESULT</Text>
              <Text style={resultValue}>
                {didUserWin ? '✅ You Won!' : '❌ You Lost'}
              </Text>
            </Section>
            
            {/* Market Info */}
            <Section style={marketCard}>
              <Text style={sectionLabel}>MARKET</Text>
              <Text style={marketTitle_style}>{marketTitle}</Text>
              
              <Text style={positionLabel}>Your Position</Text>
              <Text style={{
                ...positionValue,
                color: didUserWin ? '#10b981' : '#ef4444',
              }}>{userPosition}</Text>
            </Section>
            
            {/* Stats Grid - 2x2 with proper spacing */}
            <Section style={statsContainer}>
              <Row style={statsRow}>
                <Column style={statColumn}>
                  <Section style={statBox}>
                    <Text style={statLabel}>Entry Price</Text>
                    <Text style={statValue}>{formatPrice(userEntryPrice)}</Text>
                  </Section>
                </Column>
                <Column style={statColumn}>
                  <Section style={statBox}>
                    <Text style={statLabel}>Bet Amount</Text>
                    <Text style={statValue}>{betAmount ? formatMoney(betAmount) : '--'}</Text>
                  </Section>
                </Column>
              </Row>
              <Row style={statsRow}>
                <Column style={statColumn}>
                  <Section style={statBox}>
                    <Text style={statLabel}>Winnings</Text>
                    <Text style={{
                      ...statValue,
                      color: didUserWin ? '#10b981' : '#ef4444',
                    }}>
                      {didUserWin ? '+' : ''}{calculateWinnings()}
                    </Text>
                  </Section>
                </Column>
                <Column style={statColumn}>
                  <Section style={statBoxHighlight}>
                    <Text style={statLabel}>Your ROI</Text>
                    <Text style={{
                      ...statValueLarge,
                      color: userROI >= 0 ? '#10b981' : '#ef4444',
                    }}>
                      {userROI >= 0 ? '+' : ''}{userROI.toFixed(1)}%
                    </Text>
                  </Section>
                </Column>
              </Row>
            </Section>
            
            {/* Button */}
            <Section style={buttonContainer}>
              <Link href={tradeUrl} style={primaryButton}>
                View Trade History
              </Link>
            </Section>
          </Section>
          
          {/* Footer */}
          <Hr style={divider} />
          
          <Section style={footerSection}>
            <Text style={footerText}>
              You received this email because you have notifications enabled for copied trades on Polycopy.
            </Text>
            <Link href={unsubscribeUrl} style={unsubscribeLink}>
              Unsubscribe from notifications
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

// Styles
const main = {
  backgroundColor: '#f3f4f6',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  padding: '40px 20px',
}

const container = {
  margin: '0 auto',
  maxWidth: '520px',
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  overflow: 'hidden',
}

const logoSection = {
  textAlign: 'center' as const,
  padding: '32px 0 16px',
}

const logo = {
  margin: '0 auto',
}

const headerBanner = {
  backgroundColor: '#FDB022',
  padding: '24px 32px',
  textAlign: 'center' as const,
}

const h1 = {
  color: '#000000',
  fontSize: '22px',
  fontWeight: '700' as const,
  margin: '0',
  letterSpacing: '-0.5px',
}

const contentSection = {
  padding: '32px',
}

const text = {
  color: '#4b5563',
  fontSize: '15px',
  lineHeight: '24px',
  margin: '0 0 24px',
}

const resultBannerWin = {
  backgroundColor: '#ecfdf5',
  borderRadius: '12px',
  border: '2px solid #10b981',
  padding: '20px',
  marginBottom: '20px',
  textAlign: 'center' as const,
}

const resultBannerLoss = {
  backgroundColor: '#fef2f2',
  borderRadius: '12px',
  border: '2px solid #ef4444',
  padding: '20px',
  marginBottom: '20px',
  textAlign: 'center' as const,
}

const resultLabel = {
  color: '#6b7280',
  fontSize: '11px',
  textTransform: 'uppercase' as const,
  letterSpacing: '1px',
  fontWeight: '600' as const,
  margin: '0 0 8px',
}

const resultValue = {
  color: '#111827',
  fontSize: '24px',
  fontWeight: '700' as const,
  margin: '0',
}

const marketCard = {
  backgroundColor: '#f9fafb',
  borderRadius: '12px',
  border: '1px solid #e5e7eb',
  padding: '20px',
  marginBottom: '20px',
}

const sectionLabel = {
  color: '#6b7280',
  fontSize: '11px',
  textTransform: 'uppercase' as const,
  letterSpacing: '1px',
  fontWeight: '600' as const,
  margin: '0 0 8px',
}

const marketTitle_style = {
  color: '#111827',
  fontSize: '16px',
  fontWeight: '600' as const,
  lineHeight: '22px',
  margin: '0 0 16px',
}

const positionLabel = {
  color: '#6b7280',
  fontSize: '12px',
  fontWeight: '500' as const,
  margin: '0 0 6px',
}

const positionValue = {
  fontSize: '18px',
  fontWeight: '700' as const,
  margin: '0',
}

const statsContainer = {
  marginBottom: '24px',
}

const statsRow = {
  marginBottom: '12px',
}

const statColumn = {
  width: '50%',
  paddingLeft: '6px',
  paddingRight: '6px',
}

const statBox = {
  backgroundColor: '#f9fafb',
  borderRadius: '12px',
  border: '1px solid #e5e7eb',
  padding: '16px 20px',
  textAlign: 'center' as const,
}

const statBoxHighlight = {
  backgroundColor: '#fffbeb',
  borderRadius: '12px',
  border: '2px solid #FDB022',
  padding: '16px 20px',
  textAlign: 'center' as const,
}

const statLabel = {
  color: '#6b7280',
  fontSize: '12px',
  fontWeight: '500' as const,
  margin: '0 0 8px',
  textAlign: 'center' as const,
}

const statValue = {
  color: '#111827',
  fontSize: '20px',
  fontWeight: '700' as const,
  margin: '0',
  textAlign: 'center' as const,
}

const statValueLarge = {
  color: '#111827',
  fontSize: '22px',
  fontWeight: '700' as const,
  margin: '0',
  textAlign: 'center' as const,
}

const buttonContainer = {
  textAlign: 'center' as const,
}

const primaryButton = {
  backgroundColor: '#FDB022',
  borderRadius: '10px',
  color: '#000000',
  fontSize: '15px',
  fontWeight: '700' as const,
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  padding: '14px 32px',
  width: '100%',
  boxSizing: 'border-box' as const,
}

const divider = {
  borderColor: '#e5e7eb',
  margin: '0',
}

const footerSection = {
  padding: '24px 32px',
  textAlign: 'center' as const,
}

const footerText = {
  color: '#9ca3af',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0 0 12px',
}

const unsubscribeLink = {
  color: '#6b7280',
  fontSize: '12px',
  textDecoration: 'underline',
}
