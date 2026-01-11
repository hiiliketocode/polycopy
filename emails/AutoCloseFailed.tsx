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
  tradeUrl,
  polymarketUrl,
  unsubscribeUrl,
}: AutoCloseFailedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Auto-close could not complete for "{marketTitle}"</Preview>
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
            <Heading style={h1}>Auto-Close Unsuccessful</Heading>
          </Section>

          <Section style={contentSection}>
            <Text style={text}>
              We tried to close your position automatically but the order did not fill.
            </Text>

            <Section style={marketCard}>
              <Text style={sectionLabel}>MARKET</Text>
              <Text style={marketTitle_style}>{marketTitle}</Text>
              <Text style={positionBadge}>{outcome}</Text>
            </Section>

            <Section style={reasonBox}>
              <Text style={reasonLabel}>What happened</Text>
              <Text style={reasonText}>{reason || 'The limit price was not hit.'}</Text>
            </Section>

            <Section style={buttonContainer}>
              <Link href={tradeUrl} style={primaryButton}>
                Open Quick Trades to close manually
              </Link>
            </Section>

            <Section style={buttonContainerSecondary}>
              <Link href={polymarketUrl} style={secondaryButton}>
                View on Polymarket →
              </Link>
            </Section>

            <Text style={footnote}>
              Tip: if the market moved past your slippage/limit, try closing manually at the current price.
            </Text>
          </Section>

          <Hr style={divider} />

          <Section style={footerSection}>
            <Text style={footerText}>
              You received this email because you have notifications enabled for copied trades on Polycopy.
            </Text>
            <Link href={unsubscribeUrl} style={unsubscribeLink}>
              Manage notification settings
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
  backgroundColor: '#fee2e2',
  padding: '24px 32px',
  textAlign: 'center' as const,
}

const h1 = {
  color: '#991b1b',
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
  margin: '0 0 20px',
}

const marketCard = {
  backgroundColor: '#f9fafb',
  borderRadius: '12px',
  padding: '16px 20px',
  marginBottom: '16px',
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
  fontWeight: '700' as const,
  color: '#111827',
  margin: '0 0 8px',
}

const positionBadge = {
  display: 'inline-block',
  backgroundColor: '#fee2e2',
  color: '#991b1b',
  fontWeight: '700' as const,
  borderRadius: '9999px',
  padding: '6px 12px',
  fontSize: '12px',
  letterSpacing: '0.3px',
}

const reasonBox = {
  backgroundColor: '#fff7ed',
  border: '1px solid #fed7aa',
  borderRadius: '12px',
  padding: '16px',
  margin: '0 0 16px',
}

const reasonLabel = {
  fontSize: '12px',
  fontWeight: '700' as const,
  color: '#9a3412',
  margin: '0 0 6px',
  letterSpacing: '0.5px',
}

const reasonText = {
  fontSize: '14px',
  color: '#7c2d12',
  margin: 0,
  lineHeight: '22px',
}

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '12px 0 8px',
}

const buttonContainerSecondary = {
  textAlign: 'center' as const,
  margin: '4px 0 16px',
}

const primaryButton = {
  display: 'inline-block',
  padding: '12px 18px',
  backgroundColor: '#f97316',
  color: '#111827',
  fontWeight: '700' as const,
  fontSize: '14px',
  textDecoration: 'none',
  borderRadius: '10px',
  letterSpacing: '0.2px',
}

const secondaryButton = {
  display: 'inline-block',
  padding: '10px 16px',
  backgroundColor: '#111827',
  color: '#ffffff',
  fontWeight: '600' as const,
  fontSize: '13px',
  textDecoration: 'none',
  borderRadius: '10px',
}

const footnote = {
  fontSize: '13px',
  color: '#6b7280',
  lineHeight: '20px',
  margin: '0',
}

const divider = {
  borderColor: '#e5e7eb',
  margin: '12px 0 0',
}

const footerSection = {
  padding: '20px 24px 28px',
  textAlign: 'center' as const,
}

const footerText = {
  fontSize: '12px',
  color: '#9ca3af',
  lineHeight: '18px',
  margin: '0 0 10px',
}

const unsubscribeLink = {
  fontSize: '12px',
  color: '#6b7280',
  textDecoration: 'underline',
}

