import React from 'react'
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Link,
  Preview,
  Font,
} from '@react-email/components'
import { COLORS, FONTS } from './_styles'

export function EmailLayout({
  children,
  previewText,
}: {
  children: React.ReactNode
  previewText: string
}) {
  return (
    <Html>
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <Font
          fontFamily="Space Grotesk"
          fallbackFontFamily="sans-serif"
          webFont={{
            url: 'https://fonts.gstatic.com/s/spacegrotesk/v15/V8mQoQDjQSkFtonS3607D0BAkkvUuYmC96uN.woff2',
            format: 'woff2',
          }}
          fontWeight={700}
          fontStyle="normal"
        />
        <Font
          fontFamily="DM Sans"
          fallbackFontFamily="sans-serif"
          webFont={{
            url: 'https://fonts.gstatic.com/s/dmsans/v11/rP2Fp2K8zQ2pL71GGPSeTw.woff2',
            format: 'woff2',
          }}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      <Preview>{previewText}</Preview>
      <Body style={{ backgroundColor: COLORS.cream, fontFamily: FONTS.body, margin: '0', padding: '0' }}>
        <Container
          style={{
            backgroundColor: COLORS.white,
            margin: '0 auto',
            width: '600px',
            maxWidth: '600px',
            border: `1px solid ${COLORS.border}`,
          }}
        >
          {/* Decorative top bar */}
          <Section
            style={{
              height: '8px',
              backgroundColor: COLORS.cream,
              borderBottom: `1px solid ${COLORS.border}`,
            }}
          />

          {/* Header logo */}
          <Section style={{ backgroundColor: COLORS.cream, padding: '20px 0' }}>
            <table align="center" border={0} cellPadding="0" cellSpacing="0" style={{ margin: '0 auto' }}>
              <tbody>
                <tr>
                  <td
                    style={{
                      backgroundColor: COLORS.yellow,
                      color: COLORS.black,
                      fontSize: '24px',
                      fontWeight: '900',
                      padding: '12px 16px',
                      fontFamily: FONTS.header,
                      lineHeight: '1',
                      letterSpacing: '0.5px',
                      textAlign: 'center' as const,
                    }}
                  >
                    POLY
                  </td>
                  <td
                    style={{
                      backgroundColor: COLORS.black,
                      color: COLORS.white,
                      fontSize: '24px',
                      fontWeight: '900',
                      padding: '12px 16px',
                      fontFamily: FONTS.header,
                      lineHeight: '1',
                      letterSpacing: '0.5px',
                      textAlign: 'center' as const,
                    }}
                  >
                    COPY
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {children}

          {/* Footer */}
          <Section
            style={{
              backgroundColor: COLORS.white,
              padding: '64px 0 48px 0',
              borderTop: `1px solid ${COLORS.border}`,
            }}
          >
            <table width="100%" border={0} cellPadding="0" cellSpacing="0">
              <tbody>
                <tr>
                  <td style={{ padding: '0 48px' }}>
                    <table width="100%" border={0} cellPadding="0" cellSpacing="0">
                      <tbody>
                        <tr>
                          <td align="left">
                            <Link
                              href="https://polycopy.app/v2/portfolio"
                              style={{
                                color: '#666666',
                                fontSize: '11px',
                                fontWeight: '700',
                                textDecoration: 'none',
                                letterSpacing: '0.5px',
                              }}
                            >
                              UNSUBSCRIBE
                            </Link>
                            <span style={{ color: COLORS.border, margin: '0 10px', fontSize: '11px' }}>•</span>
                            <Link
                              href="https://polycopy.app/privacy"
                              style={{
                                color: '#666666',
                                fontSize: '11px',
                                fontWeight: '700',
                                textDecoration: 'none',
                                letterSpacing: '0.5px',
                              }}
                            >
                              PRIVACY
                            </Link>
                            <span style={{ color: COLORS.border, margin: '0 10px', fontSize: '11px' }}>•</span>
                            <Link
                              href="https://polycopy.app/faq"
                              style={{
                                color: '#666666',
                                fontSize: '11px',
                                fontWeight: '700',
                                textDecoration: 'none',
                                letterSpacing: '0.5px',
                              }}
                            >
                              SUPPORT
                            </Link>
                          </td>
                          <td align="right">
                            <Text
                              style={{
                                color: '#999999',
                                fontSize: '10px',
                                margin: '0',
                                letterSpacing: '0.5px',
                                textTransform: 'uppercase' as const,
                                fontFamily: FONTS.mono,
                              }}
                            >
                              © POLYCOPY {new Date().getFullYear()}
                            </Text>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export function EmailBanner({
  title,
  subtitle,
  label = 'SYSTEMS_LIVE_V2.0',
}: {
  title: string
  subtitle?: string
  label?: string
}) {
  return (
    <Section style={{ backgroundColor: COLORS.cream, width: '100%' }}>
      <table width="100%" border={0} cellPadding="0" cellSpacing="0">
        <tbody>
          <tr>
            <td style={{ padding: '44px 48px' }}>
              {label && (
                <div
                  style={{
                    backgroundColor: COLORS.black,
                    color: COLORS.yellow,
                    display: 'inline-block',
                    fontSize: '10px',
                    fontWeight: '900',
                    padding: '4px 10px',
                    fontFamily: FONTS.mono,
                    letterSpacing: '1px',
                    marginBottom: '24px',
                    textTransform: 'uppercase' as const,
                  }}
                >
                  ● {label}
                </div>
              )}
              <Text
                style={{
                  color: COLORS.black,
                  fontFamily: FONTS.header,
                  fontSize: '44px',
                  fontWeight: '900',
                  lineHeight: '1',
                  margin: '0',
                  textTransform: 'uppercase' as const,
                  letterSpacing: '-1.5px',
                }}
              >
                {title}
              </Text>
              {subtitle && (
                <table border={0} cellPadding="0" cellSpacing="0" style={{ marginTop: '24px' }}>
                  <tbody>
                    <tr>
                      <td style={{ width: '20px', height: '20px', backgroundColor: COLORS.yellow }} />
                      <td>
                        <Text
                          style={{
                            color: COLORS.black,
                            fontFamily: FONTS.header,
                            fontSize: '14px',
                            fontWeight: '700',
                            letterSpacing: '1px',
                            margin: '0 0 0 12px',
                            textTransform: 'uppercase' as const,
                            opacity: '0.8',
                          }}
                        >
                          {subtitle}
                        </Text>
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  )
}

export function EmailSection({
  children,
  title,
  style,
}: {
  children: React.ReactNode
  title?: string
  style?: React.CSSProperties
}) {
  return (
    <Section style={{ width: '100%' }}>
      <table width="100%" border={0} cellPadding="0" cellSpacing="0">
        <tbody>
          <tr>
            <td style={{ padding: '64px 48px', ...style }}>
              {title && (
                <table border={0} cellPadding="0" cellSpacing="0" style={{ marginBottom: '32px' }}>
                  <tbody>
                    <tr>
                      <td
                        style={{
                          width: '8px',
                          height: '8px',
                          backgroundColor: COLORS.yellow,
                          paddingRight: '12px',
                        }}
                      />
                      <td>
                        <Text
                          style={{
                            fontFamily: FONTS.header,
                            fontSize: '12px',
                            fontWeight: '900',
                            letterSpacing: '2.5px',
                            margin: '0',
                            textTransform: 'uppercase' as const,
                            color: COLORS.black,
                          }}
                        >
                          {title}
                        </Text>
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
              {children}
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  )
}

export function EmailButton({
  href,
  text,
  style,
  variant = 'primary',
}: {
  href: string
  text: string
  style?: React.CSSProperties
  variant?: 'primary' | 'secondary'
}) {
  return (
    <Section style={{ padding: '32px 0', textAlign: 'left' as const }}>
      <Link
        href={href}
        style={{
          display: 'inline-block',
          padding: '18px 28px',
          textDecoration: 'none',
          backgroundColor: variant === 'primary' ? COLORS.black : COLORS.white,
          color: variant === 'primary' ? COLORS.yellow : COLORS.black,
          border: variant === 'primary' ? 'none' : '1px solid black',
          ...style,
        }}
      >
        <table border={0} cellPadding="0" cellSpacing="0">
          <tbody>
            <tr>
              <td
                style={{
                  fontFamily: FONTS.header,
                  fontSize: '14px',
                  fontWeight: '900',
                  textTransform: 'uppercase' as const,
                  letterSpacing: '1.5px',
                  margin: '0',
                  color: variant === 'primary' ? COLORS.yellow : COLORS.black,
                }}
              >
                {text}
              </td>
              <td
                style={{
                  paddingLeft: '16px',
                  fontSize: '18px',
                  color: variant === 'primary' ? COLORS.yellow : COLORS.black,
                  verticalAlign: 'middle',
                }}
              >
                →
              </td>
            </tr>
          </tbody>
        </table>
      </Link>
    </Section>
  )
}

export function StatBox({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <td style={{ border: `1px solid ${COLORS.border}`, padding: '32px 24px' }}>
      <Text
        style={{
          color: '#666666',
          fontSize: '10px',
          fontWeight: '700',
          margin: '0 0 16px 0',
          textTransform: 'uppercase' as const,
          letterSpacing: '1.5px',
          lineHeight: '1',
          fontFamily: FONTS.mono,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: FONTS.header,
          fontSize: '28px',
          fontWeight: '900',
          margin: '0',
          lineHeight: '1',
          color: color || COLORS.black,
        }}
      >
        {value}
      </Text>
    </td>
  )
}
