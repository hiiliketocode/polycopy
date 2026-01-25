import {
  Html,
  Head,
  Body,
  Preview,
} from '@react-email/components'

interface WelcomeEmailProps {
  userName: string
  profileUrl: string
}

export default function WelcomeEmail({ 
  userName = 'John', 
  profileUrl = 'https://polycopy.app/profile' 
}: WelcomeEmailProps) {
  return (
    <Html>
      <Head>
        <style>{`
          @media only screen and (max-width: 600px) {
            .hide-mobile { display: none !important; }
          }
        `}</style>
      </Head>
      <Preview>Welcome to Polycopy - Start copying winning traders!</Preview>
      <Body style={{ backgroundColor: '#f3f4f6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', margin: 0, padding: '48px 0' }}>
        
        {/* Pure HTML Email Content */}
        <div style={{ maxWidth: '600px', margin: '0 auto', backgroundColor: '#ffffff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}>
          
          {/* Header with Logo */}
          <div style={{ backgroundColor: '#ffffff', padding: '24px 32px', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>
            <img
              src="https://polycopy.app/logos/polycopy-logo-primary.png"
              alt="Polycopy"
              style={{ height: '32px', margin: '0 auto', display: 'block' }}
            />
          </div>

          {/* Hero Banner */}
          <div style={{ backgroundColor: '#FDB022', padding: '48px 32px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '36px', fontWeight: 'bold', color: '#111827', margin: '0 0 8px 0', lineHeight: '1.2', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
              Welcome to Polycopy!
            </h1>
            <p style={{ fontSize: '18px', color: '#1f2937', margin: '0', lineHeight: '1.4', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
              Get ready to copy winning traders
            </p>
          </div>

          {/* Greeting Section */}
          <div style={{ padding: '24px 32px' }}>
            <p style={{ fontSize: '18px', color: '#374151', margin: '0 0 12px 0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
              Hey {userName},
            </p>
            <p style={{ fontSize: '16px', color: '#4b5563', lineHeight: '1.625', margin: '0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
              Thanks for joining Polycopy! We're excited to help you copy the top performing traders on Polymarket.{' '}
              <a href="https://polycopy.app/login" style={{ color: '#f97316', textDecoration: 'underline' }}>
                Login now to get started.
              </a>
            </p>
          </div>

          {/* Steps Section */}
          <div style={{ padding: '0 32px 32px 32px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#111827', margin: '0 0 24px 0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
              Here's how to get started for free in 5 easy steps:
            </h2>

            {/* Step 1 */}
            <table width="100%" cellPadding="0" cellSpacing="0" border={0} style={{ marginBottom: '16px' }}>
              <tbody>
                <tr>
                  <td style={{ backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px' }}>
                    <table width="100%" cellPadding="0" cellSpacing="0" border={0}>
                      <tbody>
                        <tr>
                          <td style={{ width: '40px', verticalAlign: 'top', paddingRight: '16px' }}>
                            <table cellPadding="0" cellSpacing="0" border={0} style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#FDB022' }}>
                              <tbody>
                                <tr>
                                  <td style={{ textAlign: 'center', verticalAlign: 'middle', color: '#111827', fontWeight: 'bold', fontSize: '16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
                                    1
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </td>
                          <td style={{ verticalAlign: 'top' }}>
                            <p style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: '0 0 4px 0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
                              Follow Traders on the Discover page
                            </p>
                            <p style={{ fontSize: '14px', color: '#4b5563', lineHeight: '1.5', margin: '0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
                              Browse top-performing traders by P&L, ROI, or win rate. Click "Follow" to track their trades.{' '}
                              <a href="https://polycopy.app/discover" style={{ color: '#f97316', textDecoration: 'underline' }}>
                                Go to Discover
                              </a>
                            </p>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Step 2 */}
            <table width="100%" cellPadding="0" cellSpacing="0" border={0} style={{ marginBottom: '16px' }}>
              <tbody>
                <tr>
                  <td style={{ backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px' }}>
                    <table width="100%" cellPadding="0" cellSpacing="0" border={0}>
                      <tbody>
                        <tr>
                          <td style={{ width: '40px', verticalAlign: 'top', paddingRight: '16px' }}>
                            <table cellPadding="0" cellSpacing="0" border={0} style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#FDB022' }}>
                              <tbody>
                                <tr>
                                  <td style={{ textAlign: 'center', verticalAlign: 'middle', color: '#111827', fontWeight: 'bold', fontSize: '16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
                                    2
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </td>
                          <td style={{ verticalAlign: 'top' }}>
                            <p style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: '0 0 4px 0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
                              Check Your Feed
                            </p>
                            <p style={{ fontSize: '14px', color: '#4b5563', lineHeight: '1.5', margin: '0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
                              Your Feed shows the latest trades from traders you follow, updated in real-time.{' '}
                              <a href="https://polycopy.app/feed" style={{ color: '#f97316', textDecoration: 'underline' }}>
                                Go to your Feed
                              </a>
                            </p>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Step 3 */}
            <table width="100%" cellPadding="0" cellSpacing="0" border={0} style={{ marginBottom: '16px' }}>
              <tbody>
                <tr>
                  <td style={{ backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px' }}>
                    <table width="100%" cellPadding="0" cellSpacing="0" border={0}>
                      <tbody>
                        <tr>
                          <td style={{ width: '40px', verticalAlign: 'top', paddingRight: '16px' }}>
                            <table cellPadding="0" cellSpacing="0" border={0} style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#FDB022' }}>
                              <tbody>
                                <tr>
                                  <td style={{ textAlign: 'center', verticalAlign: 'middle', color: '#111827', fontWeight: 'bold', fontSize: '16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
                                    3
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </td>
                          <td style={{ verticalAlign: 'top' }}>
                            <p style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: '0 0 4px 0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
                              Find a Trade You Like
                            </p>
                            <p style={{ fontSize: '14px', color: '#4b5563', lineHeight: '1.5', margin: '0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
                              Browse through trades and find one you want to copy. You'll see all the details: market, outcome, price, and more.{' '}
                              <a href="https://polycopy.app/feed" style={{ color: '#f97316', textDecoration: 'underline' }}>
                                Go to your Feed
                              </a>
                            </p>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Step 4 */}
            <table width="100%" cellPadding="0" cellSpacing="0" border={0} style={{ marginBottom: '16px' }}>
              <tbody>
                <tr>
                  <td style={{ backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px' }}>
                    <table width="100%" cellPadding="0" cellSpacing="0" border={0}>
                      <tbody>
                        <tr>
                          <td style={{ width: '40px', verticalAlign: 'top', paddingRight: '16px' }}>
                            <table cellPadding="0" cellSpacing="0" border={0} style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#FDB022' }}>
                              <tbody>
                                <tr>
                                  <td style={{ textAlign: 'center', verticalAlign: 'middle', color: '#111827', fontWeight: 'bold', fontSize: '16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
                                    4
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </td>
                          <td style={{ verticalAlign: 'top' }}>
                            <p style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: '0 0 4px 0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
                              Click "Copy" to Open Polymarket
                            </p>
                            <p style={{ fontSize: '14px', color: '#4b5563', lineHeight: '1.5', margin: '0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
                              Click the "Copy" button to open Polymarket with the trade pre-filled. Execute the trade on Polymarket.
                            </p>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Step 5 */}
            <table width="100%" cellPadding="0" cellSpacing="0" border={0} style={{ marginBottom: '0' }}>
              <tbody>
                <tr>
                  <td style={{ backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px' }}>
                    <table width="100%" cellPadding="0" cellSpacing="0" border={0}>
                      <tbody>
                        <tr>
                          <td style={{ width: '40px', verticalAlign: 'top', paddingRight: '16px' }}>
                            <table cellPadding="0" cellSpacing="0" border={0} style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#FDB022' }}>
                              <tbody>
                                <tr>
                                  <td style={{ textAlign: 'center', verticalAlign: 'middle', color: '#111827', fontWeight: 'bold', fontSize: '16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
                                    5
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </td>
                          <td style={{ verticalAlign: 'top' }}>
                            <p style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: '0 0 4px 0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
                              Track Your Copy Trades
                            </p>
                            <p style={{ fontSize: '14px', color: '#4b5563', lineHeight: '1.5', margin: '0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
                              After executing on Polymarket, click the X button in Polycopy to enter your trade details. Then go to your Portfolio to track all your copy trades and performance.{' '}
                              <a href={profileUrl} style={{ color: '#f97316', textDecoration: 'underline' }}>
                                Go to Portfolio
                              </a>
                            </p>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Premium Section */}
          <div style={{ margin: '0 32px 32px 32px' }}>
            <table width="100%" cellPadding="0" cellSpacing="0" border={0}>
              <tbody>
                <tr>
                  <td style={{ backgroundColor: '#1a1a1a', borderRadius: '12px', border: '2px solid #eab308', padding: '24px', textAlign: 'center' }}>
                    <div style={{ display: 'inline-block', backgroundColor: '#eab308', color: '#000000', fontSize: '12px', fontWeight: 'bold', padding: '4px 12px', borderRadius: '20px', marginBottom: '16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
                      PREMIUM
                    </div>
                    <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffffff', margin: '0 0 16px 0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
                      Want to Trade Faster?
                    </h2>
                    <p style={{ fontSize: '16px', color: '#d1d5db', lineHeight: '1.625', margin: '0 0 16px 0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
                      Upgrade to Premium and execute trades directly from your Polycopy Feed – no need to switch between apps! Premium also includes auto-close positions, advanced trade controls, and more.
                    </p>
                    <a 
                      href={`${profileUrl}?upgrade=true`}
                      style={{
                        display: 'block',
                        width: '100%',
                        backgroundColor: '#f59e0b',
                        color: '#ffffff',
                        fontWeight: '600',
                        padding: '12px 24px',
                        borderRadius: '8px',
                        textDecoration: 'none',
                        textAlign: 'center',
                        fontSize: '16px',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                        boxSizing: 'border-box'
                      }}
                    >
                      Learn More About Premium
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div style={{ padding: '24px 32px', backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb', textAlign: 'center' }}>
            <p style={{ fontSize: '14px', color: '#4b5563', margin: '0 0 8px 0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
              Need help? Check out our{' '}
              <a href="https://polycopy.app/faq" style={{ color: '#f97316', textDecoration: 'underline' }}>
                FAQ
              </a>
              {' '}or{' '}
              <a href="https://polycopy.app/trading-setup" style={{ color: '#f97316', textDecoration: 'underline' }}>
                Setup Guide
              </a>
            </p>
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '12px 0 0 0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
              © {new Date().getFullYear()} Polycopy. All rights reserved.
            </p>
          </div>

        </div>

      </Body>
    </Html>
  )
}
