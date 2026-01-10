'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Image from 'next/image';

export default function OnboardingPage() {
  const router = useRouter();
  const [currentScreen, setCurrentScreen] = useState(1);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const totalScreens = 6;

  useEffect(() => {
    // Check if user is logged in
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
      }
    };
    checkAuth();
  }, [router]);

  const handleNext = () => {
    if (currentScreen === 5) {
      // Premium screen - could open upgrade modal
      // For now, just go to next screen
      setCurrentScreen(currentScreen + 1);
    } else if (currentScreen < totalScreens) {
      setCurrentScreen(currentScreen + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentScreen > 1) {
      setCurrentScreen(currentScreen - 1);
    }
  };

  const handleSkip = () => {
    setShowSkipModal(true);
  };

  const confirmSkip = () => {
    handleComplete();
  };

  const handleComplete = async () => {
    // Mark onboarding as complete via API
    try {
      const response = await fetch('/api/onboarding/complete', {
        method: 'POST',
      });
      
      if (!response.ok) {
        console.error('Failed to mark onboarding complete');
      }
    } catch (error) {
      console.error('Error completing onboarding:', error);
    }
    
    // Redirect to discover page
    router.push('/discover');
  };

  const getPrimaryButtonText = () => {
    if (currentScreen === 1) return 'Get Started';
    if (currentScreen === 5) return 'Get Premium';
    if (currentScreen === 6) return 'Find Traders to Follow';
    return 'Next';
  };

  return (
    <>
      <style jsx global>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        :root {
          --brand-yellow: #FDB022;
          --brand-yellow-hover: #F59E0B;
          --background: #F8FAFC;
          --text-primary: #0F172A;
          --text-secondary: #64748B;
          --profit-green: #10B981;
          --radius: 0.625rem;
        }

        .onboarding-container {
          width: 100%;
          height: 100vh;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
          background: var(--background);
        }
        
        .onboarding-container.premium-screen {
          background: linear-gradient(180deg, #1E293B 0%, #0F172A 100%);
        }

        .onboarding-header {
          padding: 1rem 1.5rem;
          display: flex;
          justify-content: flex-end;
          position: relative;
          z-index: 10;
        }

        .skip-btn {
          background: none;
          border: none;
          color: var(--text-secondary);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          padding: 0.5rem 0.75rem;
          border-radius: var(--radius);
          transition: all 0.2s;
        }

        .skip-btn:hover {
          color: var(--text-primary);
          background: rgba(0, 0, 0, 0.05);
        }

        .screens-wrapper {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2rem 1.5rem 1rem;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }

        .screen-content {
          width: 100%;
          max-width: 500px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .welcome-text {
          font-size: 18px;
          color: var(--text-secondary);
          margin-bottom: 0.5rem;
        }

        .welcome-logo {
          width: 280px;
          height: auto;
          margin-bottom: 1rem;
        }

        .subtitle {
          font-size: 18px;
          line-height: 1.6;
          color: var(--text-secondary);
          margin-bottom: 0.5rem;
        }

        .description {
          font-size: 16px;
          line-height: 1.5;
          color: var(--text-secondary);
          margin: 0.5rem 0 0;
          max-width: 500px;
        }

        h1 {
          font-size: 36px;
          font-weight: 700;
          line-height: 1.25;
          margin-bottom: 0.75rem;
          color: var(--text-primary);
        }

        h2 {
          font-size: 30px;
          font-weight: 700;
          line-height: 1.3;
          margin-bottom: 0.75rem;
          color: var(--text-primary);
        }

        .value-props {
          display: flex;
          flex-direction: column;
          gap: 0.875rem;
          width: 100%;
          max-width: 600px;
          margin: 1.5rem 0 0;
        }

        .value-prop {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 1.25rem;
          background: white;
          border-radius: var(--radius);
          text-align: left;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .value-prop-icon {
          width: 44px;
          height: 44px;
          min-width: 44px;
          background: linear-gradient(135deg, #FDB022 0%, #F59E0B 100%);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        }

        .value-prop-icon svg {
          width: 24px;
          height: 24px;
        }

        .value-prop-content {
          flex: 1;
        }

        .value-prop-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 0.25rem;
        }

        .value-prop-text {
          font-size: 14px;
          line-height: 1.5;
          color: var(--text-secondary);
        }

        .mockup-container {
          width: 100%;
          max-width: 500px;
          margin: 1rem 0 0.5rem;
          background: white;
          border-radius: calc(var(--radius) * 2);
          padding: 1.25rem;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
        }

        .mockup-trader-card {
          background: white;
          border: 1px solid #E2E8F0;
          border-radius: var(--radius);
          padding: 1.25rem;
        }

        .trader-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .trader-avatar {
          width: 48px;
          height: 48px;
          min-width: 48px;
          border-radius: 50%;
          background: linear-gradient(135deg, #FDB022 0%, #F59E0B 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .trader-info {
          flex: 1;
          text-align: left;
        }

        .trader-name {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 0.25rem;
        }

        .trader-meta {
          display: flex;
          gap: 0.5rem;
          font-size: 14px;
          color: var(--text-secondary);
        }

        .trader-roi {
          color: var(--profit-green);
          font-weight: 600;
        }

        .trader-stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .trader-stat {
          text-align: center;
          padding: 0.75rem 0.5rem;
          background: #F8FAFC;
          border-radius: 8px;
        }

        .trader-stat-value {
          font-size: 18px;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 0.25rem;
        }

        .trader-stat-label {
          font-size: 12px;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .follow-btn {
          position: relative;
          width: 100%;
          background: var(--brand-yellow);
          border: none;
          padding: 0.875rem 1.25rem;
          border-radius: var(--radius);
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          cursor: pointer;
          transition: all 0.2s;
        }

        .follow-btn:hover {
          background: var(--brand-yellow-hover);
        }

        .animated-cursor {
          position: absolute;
          top: 5px;
          right: 20%;
          transform: translateX(50%) rotate(-45deg);
          font-size: 64px;
          animation: pointAndClick 2s ease-in-out infinite;
          pointer-events: none;
        }

        @keyframes pointAndClick {
          0%, 100% { transform: translateX(50%) translateY(0) rotate(-45deg); }
          50% { transform: translateX(50%) translateY(-8px) rotate(-45deg); }
        }

        .mockup-trade-card {
          background: white;
          border: 1px solid #E2E8F0;
          border-radius: var(--radius);
          padding: 1.25rem;
          text-align: left;
        }

        .trade-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid #E2E8F0;
        }

        .market-avatar {
          width: 40px;
          height: 40px;
          min-width: 40px;
          border-radius: 6px;
          background: linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%);
        }

        .trade-info {
          flex: 1;
        }

        .market-name {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 0.25rem;
        }

        .trader-tag {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .live-score {
          background: #F0F9FF;
          border: 1px solid #BAE6FD;
          border-radius: 6px;
          padding: 0.625rem;
          margin-bottom: 1rem;
          font-size: 13px;
          color: #0369A1;
          font-weight: 500;
        }

        .trade-details {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .trade-detail {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .detail-label {
          font-size: 12px;
          color: var(--text-secondary);
          text-transform: uppercase;
          font-weight: 500;
          letter-spacing: 0.5px;
        }

        .detail-value {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .detail-value.buy {
          color: var(--profit-green);
        }

        .copy-btn {
          position: relative;
          width: 100%;
          background: var(--brand-yellow);
          border: none;
          padding: 0.875rem;
          border-radius: var(--radius);
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          cursor: pointer;
          transition: all 0.2s;
        }

        .copy-btn:hover {
          background: var(--brand-yellow-hover);
        }

        .copy-btn .animated-cursor {
          top: 5px;
          right: 25%;
        }

        .mockup-profile {
          background: white;
          border: 1px solid #E2E8F0;
          border-radius: var(--radius);
          padding: 1.25rem;
          text-align: left;
        }

        .profile-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid #E2E8F0;
        }

        .profile-avatar {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, #FDB022 0%, #F59E0B 100%);
        }

        .profile-name {
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        .stat-card {
          background: #F8FAFC;
          border-radius: 8px;
          padding: 1rem;
          text-align: center;
        }

        .stat-value {
          font-size: 24px;
          font-weight: 700;
          color: var(--profit-green);
          margin-bottom: 0.25rem;
        }

        .stat-label {
          font-size: 12px;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .premium-badge {
          display: inline-block;
          background: linear-gradient(135deg, #FDB022 0%, #F59E0B 100%);
          color: var(--text-primary);
          padding: 0.5rem 1rem;
          border-radius: 999px;
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 1rem;
        }
        
        .premium-screen .screen-content h2,
        .premium-screen .screen-content .subtitle {
          color: white;
        }
        
        .premium-screen .skip-btn {
          color: rgba(255, 255, 255, 0.7);
        }
        
        .premium-screen .skip-btn:hover {
          color: white;
          background: rgba(255, 255, 255, 0.1);
        }

        .features-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin: 1.5rem 0 0;
          width: 100%;
        }

        .feature-item {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 1rem;
          background: white;
          border-radius: var(--radius);
          text-align: left;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .feature-icon {
          width: 24px;
          height: 24px;
          min-width: 24px;
          background: var(--profit-green);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 14px;
          font-weight: 700;
          margin-top: 2px;
        }

        .feature-text {
          font-size: 15px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .polycopy-logo {
          width: 100px;
          height: 100px;
          margin-bottom: 1.5rem;
        }

        .polycopy-logo img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .final-cta-btn {
          width: 100%;
          max-width: 400px;
          margin-top: 1.5rem;
          padding: 0.875rem 1.5rem;
          background: var(--brand-yellow);
          color: var(--text-primary);
          border: none;
          border-radius: var(--radius);
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .final-cta-btn:hover {
          background: var(--brand-yellow-hover);
        }

        .onboarding-footer {
          padding: 1.25rem 1.5rem;
          padding-bottom: max(1.75rem, env(safe-area-inset-bottom));
          display: flex;
          flex-direction: column;
          gap: 1rem;
          align-items: center;
          background: var(--background);
        }

        .progress-nav-row {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 0.5rem;
        }

        .nav-arrow {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: white;
          border: 1px solid #E2E8F0;
          border-radius: 50%;
          cursor: pointer;
          transition: all 0.2s;
          color: var(--text-primary);
        }

        .nav-arrow:hover:not(:disabled) {
          background: #F8FAFC;
          border-color: var(--brand-yellow);
        }

        .nav-arrow:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .progress-dots {
          display: flex;
          gap: 0.5rem;
        }

        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #CBD5E1;
          transition: all 0.3s;
        }

        .dot.active {
          background: var(--brand-yellow);
          width: 24px;
          border-radius: 4px;
        }

        .btn-primary {
          width: 100%;
          max-width: 400px;
          padding: 0.875rem 1.5rem;
          background: var(--brand-yellow);
          color: var(--text-primary);
          border: none;
          border-radius: var(--radius);
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        .btn-primary:hover {
          background: var(--brand-yellow-hover);
          transform: translateY(-1px);
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .btn-secondary {
          background: none;
          border: none;
          color: var(--text-secondary);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          padding: 0.5rem;
          transition: color 0.2s;
        }

        .btn-secondary:hover {
          color: var(--text-primary);
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          background: white;
          border-radius: calc(var(--radius) * 2);
          padding: 2rem;
          max-width: 400px;
          width: 90%;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        }

        .modal-content h3 {
          font-size: 24px;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 0.75rem;
        }

        .modal-content p {
          font-size: 16px;
          line-height: 1.5;
          color: var(--text-secondary);
          margin-bottom: 1.5rem;
        }

        .modal-buttons {
          display: flex;
          gap: 0.75rem;
        }

        .modal-btn {
          flex: 1;
          padding: 0.75rem 1rem;
          border-radius: var(--radius);
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .modal-btn-secondary {
          background: white;
          border: 1px solid #E2E8F0;
          color: var(--text-primary);
        }

        .modal-btn-secondary:hover {
          background: #F8FAFC;
        }

        .modal-btn-primary {
          background: var(--brand-yellow);
          border: none;
          color: var(--text-primary);
        }

        .modal-btn-primary:hover {
          background: var(--brand-yellow-hover);
        }

        @media (max-width: 640px) {
          h1 { font-size: 26px; }
          h2 { font-size: 22px; }
          .subtitle { font-size: 15px; }
          .description { font-size: 14px; }
          .welcome-logo { width: 220px; }
        }
      `}</style>

      <div className={`onboarding-container ${currentScreen === 5 ? 'premium-screen' : ''}`}>
        {/* Header */}
        <div className="onboarding-header">
          <button className="skip-btn" onClick={handleSkip}>Skip</button>
        </div>

        {/* Screens */}
        <div className="screens-wrapper">
          {currentScreen === 1 && (
            <div className="screen-content">
              <p className="welcome-text">Welcome to</p>
              <Image 
                src="/logos/polycopy-logo-primary.png" 
                alt="Polycopy" 
                width={280}
                height={80}
                className="welcome-logo"
                priority
              />
              <p className="subtitle">Copy trades from the best Polymarket traders</p>
              
              <div className="value-props">
                <div className="value-prop">
                  <div className="value-prop-icon">
                    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                  </div>
                  <div className="value-prop-content">
                    <div className="value-prop-title">Follow top traders</div>
                    <div className="value-prop-text">Discover and follow top-performing traders on Polymarket.</div>
                  </div>
                </div>
                <div className="value-prop">
                  <div className="value-prop-icon">
                    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
                    </svg>
                  </div>
                  <div className="value-prop-content">
                    <div className="value-prop-title">Copy trade</div>
                    <div className="value-prop-text">Automatically replicate other trader's moves with two clicks.</div>
                  </div>
                </div>
                <div className="value-prop">
                  <div className="value-prop-icon">
                    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2zm0 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10m-6 0a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m0 0V5a2 4 0 0 1 2-2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z"/>
                    </svg>
                  </div>
                  <div className="value-prop-content">
                    <div className="value-prop-title">Track your performance</div>
                    <div className="value-prop-text">Monitor all your copied trades and earnings in one place.</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentScreen === 2 && (
            <div className="screen-content">
              <h2>Step 1: Follow Top Traders</h2>
              <p className="description">Start by following traders you trust</p>
              
              <div className="mockup-container">
                <div className="mockup-trader-card">
                  <div className="trader-header">
                    <div className="trader-avatar">JD</div>
                    <div className="trader-info">
                      <div className="trader-name">@johndoe</div>
                      <div className="trader-meta">
                        <span className="trader-roi">ROI: +47%</span>
                        <span>•</span>
                        <span>156 trades</span>
                      </div>
                    </div>
                  </div>
                  <div className="trader-stats-grid">
                    <div className="trader-stat">
                      <div className="trader-stat-value">82%</div>
                      <div className="trader-stat-label">Win Rate</div>
                    </div>
                    <div className="trader-stat">
                      <div className="trader-stat-value">$12.4K</div>
                      <div className="trader-stat-label">Total Profit</div>
                    </div>
                    <div className="trader-stat">
                      <div className="trader-stat-value">2.3K</div>
                      <div className="trader-stat-label">Followers</div>
                    </div>
                  </div>
                  <button className="follow-btn">
                    <span className="animated-cursor">👆</span>
                    Follow Trader
                  </button>
                </div>
              </div>
            </div>
          )}

          {currentScreen === 3 && (
            <div className="screen-content">
              <h2>Step 2: Copy Their Trades</h2>
              <p className="description">On a free account, Polycopy will set you up to manually copy the moves of traders you follow. Upgrade to Premium to execute trades from within Polycopy directly.</p>
              
              <div className="mockup-container">
                <div className="mockup-trade-card">
                  <div className="trade-header">
                    <div className="market-avatar"></div>
                    <div className="trade-info">
                      <div className="market-name">Lakers to win vs Celtics</div>
                      <div className="trader-tag">by ProTrader</div>
                    </div>
                  </div>
                  
                  <div className="live-score">🏀 Live: Lakers 85 - 82 Celtics (Q3)</div>
                  
                  <div className="trade-details">
                    <div className="trade-detail">
                      <span className="detail-label">Action</span>
                      <span className="detail-value buy">Buy Yes</span>
                    </div>
                    <div className="trade-detail">
                      <span className="detail-label">Price</span>
                      <span className="detail-value">$0.65</span>
                    </div>
                    <div className="trade-detail">
                      <span className="detail-label">Size</span>
                      <span className="detail-value">$100</span>
                    </div>
                    <div className="trade-detail">
                      <span className="detail-label">Current Price</span>
                      <span className="detail-value">$0.68</span>
                    </div>
                  </div>
                  
                  <button className="copy-btn">
                    <span className="animated-cursor">👆</span>
                    Manual Copy
                  </button>
                </div>
              </div>
            </div>
          )}

          {currentScreen === 4 && (
            <div className="screen-content">
              <h2>Step 3: Track Your Performance</h2>
              <p className="description">Monitor all your copied trades in one place</p>
              
              <div className="mockup-container">
                <div className="mockup-profile">
                  <div className="profile-header">
                    <div className="profile-avatar"></div>
                    <div className="profile-name">Your Profile</div>
                  </div>
                  
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-value">+32%</div>
                      <div className="stat-label">ROI</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">15</div>
                      <div className="stat-label">Trades Copied</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">73%</div>
                      <div className="stat-label">Win Rate</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">$1,250</div>
                      <div className="stat-label">Profit</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentScreen === 5 && (
            <div className="screen-content">
              <span className="premium-badge">⭐ PREMIUM</span>
              <h2>Want More?</h2>
              <p className="subtitle">Upgrade to Polycopy Premium</p>
              
              <div className="features-list">
                <div className="feature-item">
                  <div className="feature-icon">✓</div>
                  <div className="feature-text">Execute copy trades directly in the Polycopy platform</div>
                </div>
                <div className="feature-item">
                  <div className="feature-icon">✓</div>
                  <div className="feature-text">Real-time trade status notifications via Whatsapp</div>
                </div>
                <div className="feature-item">
                  <div className="feature-icon">✓</div>
                  <div className="feature-text">Advanced analytics & insights</div>
                </div>
                <div className="feature-item">
                  <div className="feature-icon">✓</div>
                  <div className="feature-text">Priority support</div>
                </div>
              </div>
            </div>
          )}

          {currentScreen === 6 && (
            <div className="screen-content">
              <div className="polycopy-logo">
                <Image 
                  src="/logos/polycopy-logo-icon.png" 
                  alt="Polycopy Logo"
                  width={100}
                  height={100}
                />
              </div>
              <h1>You're All Set!</h1>
              <p className="subtitle">Ready to start copying trades?</p>
              <p className="description">Follow some traders on the Discover page to see their trades in your feed</p>
              <button className="final-cta-btn" onClick={handleComplete}>Find Traders to Follow</button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="onboarding-footer">
          <div className="progress-nav-row">
            <button 
              className="nav-arrow" 
              onClick={handlePrev} 
              disabled={currentScreen === 1}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
            
            <div className="progress-dots">
              {[1, 2, 3, 4, 5, 6].map((screen) => (
                <div 
                  key={screen} 
                  className={`dot ${currentScreen === screen ? 'active' : ''}`}
                />
              ))}
            </div>
            
            <button 
              className="nav-arrow" 
              onClick={handleNext}
              disabled={currentScreen === totalScreens}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
          </div>
          
          <button 
            className="btn-primary" 
            onClick={handleNext}
            style={{ display: currentScreen === 6 ? 'none' : 'block' }}
          >
            {getPrimaryButtonText()}
          </button>
          
          {currentScreen === 5 && (
            <button className="btn-secondary" onClick={handleNext}>
              Maybe Later
            </button>
          )}
        </div>
      </div>

      {/* Skip Modal */}
      {showSkipModal && (
        <div className="modal-overlay" onClick={() => setShowSkipModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Skip Onboarding?</h3>
            <p>Are you sure you want to skip the tour? You can always view it later from settings.</p>
            <div className="modal-buttons">
              <button className="modal-btn modal-btn-secondary" onClick={() => setShowSkipModal(false)}>
                Go Back
              </button>
              <button className="modal-btn modal-btn-primary" onClick={confirmSkip}>
                Skip
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
