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

export default function TraderClosedPositionEmail({
  userName,
  traderUsername,
  marketTitle,
  outcome,
  userEntryPrice,
  traderExitPrice,
  userROI,
  traderROI,
  tradeUrl,
  polymarketUrl,
  unsubscribeUrl,
}: TraderClosedPositionEmailProps) {
  const formatPrice = (price: number) => {
    // Display as cents (e.g., 58¢)
    const cents = Math.round(price * 100)
    return `${cents}¢`
  }

  return (
    <Html>
      <Head />
      <Preview>🔔 {traderUsername} closed their position on "{marketTitle}"</Preview>
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
          <Section style={headerBanner}>
            <Text style={headerEmoji}>🔔</Text>
            <Heading style={h1}>Trader Closed Position</Heading>
          </Section>
          
          <Section style={contentSection}>
            <Text style={greeting}>Hi {userName},</Text>
            
            <Text style={text}>
              The trader you copied has <strong>closed their position</strong>. 
              You may want to review and decide if you want to hold or exit.
            </Text>
            
            {/* Trader Info Card */}
            <Section style={traderCard}>
              <Text style={traderLabel}>Trader</Text>
              <Text style={traderName}>@{traderUsername}</Text>
            </Section>
            
            {/* Market Info */}
            <Section style={marketCard}>
              <Text style={sectionLabel}>MARKET</Text>
              <Text style={marketTitle_style}>{marketTitle}</Text>
              
              <Section style={positionBadgeContainer}>
                <Text style={positionBadge}>{outcome}</Text>
              </Section>
            </Section>
            
            {/* Price & ROI Grid */}
            <Section style={statsGrid}>
              <Section style={statBox}>
                <Text style={statLabel}>Your Entry</Text>
                <Text style={statValue}>{formatPrice(userEntryPrice)}</Text>
              </Section>
              
              <Section style={statBox}>
                <Text style={statLabel}>Trader Exit</Text>
                <Text style={statValue}>{formatPrice(traderExitPrice)}</Text>
              </Section>
              
              <Section style={statBox}>
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
            
            {/* Action Notice */}
            <Section style={noticeBox}>
              <Text style={noticeText}>
                💡 The market is still active. You can continue to hold your position or close it on Polymarket.
              </Text>
            </Section>
            
            {/* Buttons */}
            <Section style={buttonContainer}>
              <Link href={tradeUrl} style={primaryButton}>
                View Trade Details
              </Link>
            </Section>
            
            <Section style={buttonContainer}>
              <Link href={polymarketUrl} style={secondaryButton}>
                View on Polymarket →
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

const headerBanner = {
  backgroundColor: '#FDB022',
  padding: '24px 32px',
  textAlign: 'center' as const,
}

const headerEmoji = {
  fontSize: '32px',
  margin: '0 0 8px',
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

const traderCard = {
  backgroundColor: '#111827',
  borderRadius: '12px',
  padding: '16px 20px',
  marginBottom: '16px',
}

const traderLabel = {
  color: '#9ca3af',
  fontSize: '12px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  margin: '0 0 4px',
}

const traderName = {
  color: '#ffffff',
  fontSize: '18px',
  fontWeight: '600' as const,
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
  margin: '0 0 12px',
}

const positionBadgeContainer = {
  margin: '0',
}

const positionBadge = {
  display: 'inline-block',
  backgroundColor: '#FDB022',
  color: '#000000',
  fontSize: '13px',
  fontWeight: '700' as const,
  padding: '6px 14px',
  borderRadius: '20px',
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

const noticeBox = {
  backgroundColor: '#fffbeb',
  borderRadius: '10px',
  border: '1px solid #fde68a',
  padding: '16px',
  marginBottom: '24px',
}

const noticeText = {
  color: '#92400e',
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

const secondaryButton = {
  backgroundColor: '#ffffff',
  borderRadius: '10px',
  border: '2px solid #e5e7eb',
  color: '#374151',
  fontSize: '14px',
  fontWeight: '600' as const,
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 24px',
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
