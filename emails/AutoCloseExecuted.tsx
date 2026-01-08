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
  unsubscribeUrl,
}: AutoCloseExecutedEmailProps) {
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

  return (
    <Html>
      <Head />
      <Preview>Auto-close executed for "{marketTitle}"</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}>
            <Img
              src="https://polycopy.app/logos/polycopy-logo-primary.png"
              width="120"
              height="auto"
              alt="Polycopy"
              style={logo}
            />
          </Section>

          <Section style={headerBanner}>
            <Heading style={h1}>Auto-Close Executed</Heading>
          </Section>

          <Section style={contentSection}>
            <Text style={text}>
              Your auto-close order has been executed. Here are the results:
            </Text>

            <Section style={marketCard}>
              <Text style={sectionLabel}>MARKET</Text>
              <Text style={marketTitle_style}>{marketTitle}</Text>

              <Section style={positionBadgeContainer}>
                <Text style={positionBadge}>{outcome}</Text>
              </Section>
            </Section>

            <Section style={statsContainer}>
              <Row style={statsRow}>
                <Column style={statColumn}>
                  <Section style={statBox}>
                    <Text style={statLabel}>Side</Text>
                    <Text style={statValue}>{side}</Text>
                  </Section>
                </Column>
                <Column style={statColumn}>
                  <Section style={statBox}>
                    <Text style={statLabel}>Shares</Text>
                    <Text style={statValue}>{filledSize.toFixed(4)}</Text>
                  </Section>
                </Column>
              </Row>
              <Row style={statsRow}>
                <Column style={statColumn}>
                  <Section style={statBox}>
                    <Text style={statLabel}>Limit Price</Text>
                    <Text style={statValue}>{formatPrice(limitPrice)}</Text>
                  </Section>
                </Column>
                <Column style={statColumn}>
                  <Section style={statBoxHighlight}>
                    <Text style={statLabel}>Est. Proceeds</Text>
                    <Text style={statValueLarge}>
                      {estimatedProceeds !== null ? formatMoney(estimatedProceeds) : '--'}
                    </Text>
                  </Section>
                </Column>
              </Row>
            </Section>

            <Section style={orderIdBox}>
              <Text style={orderIdLabel}>Order ID</Text>
              <Text style={orderIdValue}>{orderId}</Text>
            </Section>

            <Section style={buttonContainer}>
              <Link href={tradeUrl} style={primaryButton}>
                View Trade Details
              </Link>
            </Section>

            <Section style={buttonContainerSecondary}>
              <Link href={polymarketUrl} style={secondaryButton}>
                View on Polymarket →
              </Link>
            </Section>
          </Section>

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

const marketCard = {
  backgroundColor: '#f9fafb',
  borderRadius: '12px',
  padding: '16px 20px',
  marginBottom: '20px',
  border: '1px solid #e5e7eb',
}

const sectionLabel = {
  fontSize: '11px',
  fontWeight: '700' as const,
  color: '#6b7280',
  letterSpacing: '1px',
  margin: '0 0 8px',
}

const marketTitle_style = {
  fontSize: '16px',
  fontWeight: '600' as const,
  color: '#111827',
  margin: '0 0 12px',
}

const positionBadgeContainer = {
  display: 'inline-block',
}

const positionBadge = {
  backgroundColor: '#111827',
  color: '#ffffff',
  borderRadius: '9999px',
  padding: '4px 10px',
  fontSize: '12px',
  fontWeight: '600' as const,
  margin: '0',
}

const statsContainer = {
  marginBottom: '20px',
}

const statsRow = {
  marginBottom: '12px',
}

const statColumn = {
  width: '50%',
}

const statBox = {
  backgroundColor: '#f9fafb',
  borderRadius: '10px',
  padding: '14px 12px',
  margin: '0 6px',
  border: '1px solid #e5e7eb',
}

const statBoxHighlight = {
  ...statBox,
  backgroundColor: '#fef3c7',
  border: '1px solid #f59e0b',
}

const statLabel = {
  fontSize: '12px',
  fontWeight: '600' as const,
  color: '#6b7280',
  margin: '0 0 6px',
}

const statValue = {
  fontSize: '16px',
  fontWeight: '700' as const,
  color: '#111827',
  margin: '0',
}

const statValueLarge = {
  fontSize: '18px',
  fontWeight: '800' as const,
  color: '#111827',
  margin: '0',
}

const orderIdBox = {
  backgroundColor: '#111827',
  borderRadius: '10px',
  padding: '12px 16px',
  marginBottom: '24px',
}

const orderIdLabel = {
  fontSize: '11px',
  fontWeight: '700' as const,
  color: '#9ca3af',
  margin: '0 0 6px',
  letterSpacing: '1px',
}

const orderIdValue = {
  fontSize: '12px',
  fontWeight: '600' as const,
  color: '#f9fafb',
  margin: '0',
  wordBreak: 'break-all' as const,
}

const buttonContainer = {
  textAlign: 'center' as const,
  marginBottom: '12px',
}

const buttonContainerSecondary = {
  textAlign: 'center' as const,
}

const primaryButton = {
  backgroundColor: '#111827',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '8px',
  textDecoration: 'none',
  fontWeight: '600' as const,
  fontSize: '14px',
  display: 'inline-block',
}

const secondaryButton = {
  backgroundColor: '#ffffff',
  color: '#111827',
  padding: '12px 24px',
  borderRadius: '8px',
  textDecoration: 'none',
  fontWeight: '600' as const,
  fontSize: '14px',
  border: '1px solid #e5e7eb',
  display: 'inline-block',
}

const divider = {
  border: 'none',
  borderTop: '1px solid #e5e7eb',
  margin: '0',
}

const footerSection = {
  padding: '20px 32px 28px',
  textAlign: 'center' as const,
}

const footerText = {
  fontSize: '12px',
  color: '#6b7280',
  margin: '0 0 8px',
}

const unsubscribeLink = {
  fontSize: '12px',
  color: '#6b7280',
  textDecoration: 'underline',
}
