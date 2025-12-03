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
} from '@react-email/components'

interface MarketResolvedEmailProps {
  userName: string
  marketTitle: string
  resolvedOutcome: string
  userPosition: string
  userEntryPrice: number
  userROI: number
  traderROI: number
  didUserWin: boolean
  tradeUrl: string
  unsubscribeUrl: string
}

export default function MarketResolvedEmail({
  userName,
  marketTitle,
  resolvedOutcome,
  userPosition,
  userEntryPrice,
  userROI,
  traderROI,
  didUserWin,
  tradeUrl,
  unsubscribeUrl,
}: MarketResolvedEmailProps) {
  const formatPrice = (price: number) => {
    // Display as cents (e.g., 58¢)
    const cents = Math.round(price * 100)
    return `${cents}¢`
  }

  return (
    <Html>
      <Head />
      <Preview>{didUserWin ? '🎉' : '📊'} Market Resolved: "{marketTitle}"</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Logo */}
          <Section style={logoSection}>
            <Img
              src="https://polycopy.app/polycopy-logo-primary.png"
              width="120"
              height="auto"
              alt="Polycopy"
              style={logo}
            />
          </Section>

          {/* Header Banner */}
          <Section style={didUserWin ? headerBannerWin : headerBannerLoss}>
            <Text style={headerEmoji}>{didUserWin ? '🎉' : '📊'}</Text>
            <Heading style={h1}>Market Resolved</Heading>
          </Section>
          
          <Section style={contentSection}>
            <Text style={greeting}>Hi {userName},</Text>
            
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
              
              <Section style={outcomeGrid}>
                <Section style={outcomeItem}>
                  <Text style={outcomeLabel}>Winning Outcome</Text>
                  <Text style={outcomeValue}>{resolvedOutcome}</Text>
                </Section>
                
                <Section style={outcomeItem}>
                  <Text style={outcomeLabel}>Your Position</Text>
                  <Text style={{
                    ...positionValue,
                    color: didUserWin ? '#10b981' : '#ef4444',
                  }}>{userPosition}</Text>
                </Section>
              </Section>
            </Section>
            
            {/* Stats Grid */}
            <Section style={statsGrid}>
              <Section style={statBox}>
                <Text style={statLabel}>Entry Price</Text>
                <Text style={statValue}>{formatPrice(userEntryPrice)}</Text>
              </Section>
              
              <Section style={statBox}>
                <Text style={statLabel}>Final Payout</Text>
                <Text style={statValue}>{didUserWin ? '100¢' : '0¢'}</Text>
              </Section>
              
              <Section style={statBoxHighlight}>
                <Text style={statLabel}>Your ROI</Text>
                <Text style={{
                  ...statValueLarge,
                  color: userROI >= 0 ? '#10b981' : '#ef4444',
                }}>
                  {userROI >= 0 ? '+' : ''}{userROI.toFixed(1)}%
                </Text>
              </Section>
              
              <Section style={statBox}>
                <Text style={statLabel}>Trader ROI</Text>
                <Text style={{
                  ...statValue,
                  color: traderROI >= 0 ? '#10b981' : '#ef4444',
                }}>
                  {traderROI >= 0 ? '+' : ''}{traderROI.toFixed(1)}%
                </Text>
              </Section>
            </Section>
            
            {/* Win/Loss Message */}
            <Section style={didUserWin ? successBox : infoBox}>
              <Text style={didUserWin ? successText : infoText}>
                {didUserWin 
                  ? '🎊 Congratulations! Your prediction was correct. The payout will be reflected in your Polymarket wallet.'
                  : '📈 Markets are unpredictable. Keep learning and tracking top traders to improve your strategy.'
                }
              </Text>
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
              You received this email because you have notifications enabled for copied trades.
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
  padding: '40px 0',
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

const headerBannerWin = {
  backgroundColor: '#10b981',
  padding: '24px 32px',
  textAlign: 'center' as const,
}

const headerBannerLoss = {
  backgroundColor: '#6b7280',
  padding: '24px 32px',
  textAlign: 'center' as const,
}

const headerEmoji = {
  fontSize: '32px',
  margin: '0 0 8px',
}

const h1 = {
  color: '#ffffff',
  fontSize: '22px',
  fontWeight: '700' as const,
  margin: '0',
  letterSpacing: '-0.5px',
}

const contentSection = {
  padding: '32px',
}

const greeting = {
  color: '#111827',
  fontSize: '16px',
  fontWeight: '600' as const,
  margin: '0 0 16px',
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
  marginBottom: '16px',
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

const outcomeGrid = {
  display: 'flex',
  gap: '16px',
}

const outcomeItem = {
  flex: '1',
}

const outcomeLabel = {
  color: '#6b7280',
  fontSize: '12px',
  fontWeight: '500' as const,
  margin: '0 0 6px',
}

const outcomeValue = {
  color: '#111827',
  fontSize: '16px',
  fontWeight: '700' as const,
  margin: '0',
}

const positionValue = {
  fontSize: '16px',
  fontWeight: '700' as const,
  margin: '0',
}

const statsGrid = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: '12px',
  marginBottom: '20px',
}

const statBox = {
  backgroundColor: '#f9fafb',
  borderRadius: '10px',
  border: '1px solid #e5e7eb',
  padding: '14px 16px',
  width: 'calc(50% - 6px)',
  boxSizing: 'border-box' as const,
}

const statBoxHighlight = {
  backgroundColor: '#fffbeb',
  borderRadius: '10px',
  border: '2px solid #FDB022',
  padding: '14px 16px',
  width: 'calc(50% - 6px)',
  boxSizing: 'border-box' as const,
}

const statLabel = {
  color: '#6b7280',
  fontSize: '12px',
  fontWeight: '500' as const,
  margin: '0 0 6px',
}

const statValue = {
  color: '#111827',
  fontSize: '18px',
  fontWeight: '700' as const,
  margin: '0',
}

const statValueLarge = {
  color: '#111827',
  fontSize: '20px',
  fontWeight: '700' as const,
  margin: '0',
}

const successBox = {
  backgroundColor: '#ecfdf5',
  borderRadius: '10px',
  border: '1px solid #a7f3d0',
  padding: '16px',
  marginBottom: '24px',
}

const successText = {
  color: '#065f46',
  fontSize: '14px',
  lineHeight: '20px',
  margin: '0',
}

const infoBox = {
  backgroundColor: '#f9fafb',
  borderRadius: '10px',
  border: '1px solid #e5e7eb',
  padding: '16px',
  marginBottom: '24px',
}

const infoText = {
  color: '#4b5563',
  fontSize: '14px',
  lineHeight: '20px',
  margin: '0',
}

const buttonContainer = {
  textAlign: 'center' as const,
  marginBottom: '12px',
}

const primaryButton = {
  backgroundColor: '#FDB022',
  borderRadius: '10px',
  color: '#000000',
  fontSize: '15px',
  fontWeight: '700' as const,
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
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
