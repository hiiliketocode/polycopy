"use client";

import React, { useState, useCallback } from "react";
import { StepFollowTraders } from "@/components/onboarding/step-follow-traders";
import { PolycopyLogo } from "@/components/onboarding/polycopy-logo";
import { StepTradeExplainer } from "@/components/onboarding/step-trade-explainer";
import { StepPremiumUpsell } from "@/components/onboarding/step-premium-upsell";
import { StepComplete } from "@/components/onboarding/step-complete";
import { ProgressIndicator } from "@/components/onboarding/progress-indicator";
import { UpgradeModal } from "@/components/polycopy/upgrade-modal";

type OnboardingStep = "follow" | "explainer" | "premium" | "complete";

const STEPS: OnboardingStep[] = ["follow", "explainer", "premium", "complete"];

export default function OnboardingTestPage() {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("follow");
  const [selectedTraders, setSelectedTraders] = useState<string[]>([]);
  const [isCompleting, setIsCompleting] = useState(false);
  const [traders, setTraders] = useState<any[]>([]);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Hide mobile bottom nav and footer by adding class to body
  React.useEffect(() => {
    document.body.classList.add('hide-mobile-nav');
    
    // Hide the website footer more aggressively
    const hideFooter = () => {
      const footers = document.querySelectorAll('body > footer, body > div > footer:not([class*="fixed"])');
      footers.forEach(footer => {
        if (footer instanceof HTMLElement && !footer.querySelector('[class*="border-t"]')) {
          // Only hide the main website footer, not our onboarding footer
          footer.style.display = 'none';
        }
      });
    };
    
    hideFooter();
    // Check again after a brief delay in case footer loads later
    const timer = setTimeout(hideFooter, 100);
    
    return () => {
      clearTimeout(timer);
      document.body.classList.remove('hide-mobile-nav');
      // Restore all footers
      const footers = document.querySelectorAll('body > footer, body > div > footer');
      footers.forEach(footer => {
        if (footer instanceof HTMLElement) {
          footer.style.display = '';
        }
      });
    };
  }, []);

  const currentStepIndex = STEPS.indexOf(currentStep) + 1;
  const isPremiumStep = currentStep === "premium";

  const handleSelectTrader = useCallback((wallet: string) => {
    setSelectedTraders((prev) =>
      prev.includes(wallet)
        ? prev.filter((w) => w !== wallet)
        : [...prev, wallet]
    );
  }, []);

  const handleFollowTradersNext = () => {
    setCurrentStep("explainer");
  };

  const handleFollowTradersSkip = () => {
    const top5Wallets = traders.slice(0, 5).map((t) => t.wallet);
    console.log('⚠️ PREVIEW: Auto-following top 5:', top5Wallets);
    setSelectedTraders(top5Wallets);
    setCurrentStep("explainer");
  };

  const handleExplainerNext = () => {
    setCurrentStep("premium");
  };

  const handleExplainerBack = () => {
    setCurrentStep("follow");
  };

  const handlePremiumUpgrade = () => {
    setShowUpgradeModal(true);
  };

  const handlePremiumSkip = () => {
    setCurrentStep("complete");
  };

  const handlePremiumBack = () => {
    setCurrentStep("explainer");
  };

  const handleCompleteBack = () => {
    setCurrentStep("premium");
  };

  const handleGoToFeed = async () => {
    setIsCompleting(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    alert(
      `✅ Preview Complete!\n\n` +
      `In production, this would:\n\n` +
      `1. Follow ${selectedTraders.length} traders in database\n` +
      `2. Mark onboarding as complete\n` +
      `3. Redirect to /feed\n\n` +
      `Close this alert to restart preview.`
    );
    
    // Reload to restart
    window.location.reload();
  };

  const renderFooter = () => {
    const baseClasses = "flex items-center justify-between py-3 md:py-4 border-t";
    const borderColor = isPremiumStep ? "border-white/10" : "border-border";
    const textColor = isPremiumStep ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground";

    if (currentStep === "follow") {
      return (
        <div className={`${baseClasses} ${borderColor}`}>
          <button
            type="button"
            onClick={handleFollowTradersSkip}
            className={`${textColor} transition-colors text-sm font-medium`}
          >
            Skip, follow top 5
          </button>
          <ProgressIndicator currentStep={currentStepIndex} totalSteps={4} />
          <button
            type="button"
            onClick={handleFollowTradersNext}
            disabled={selectedTraders.length < 5}
            className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      );
    }

    if (currentStep === "explainer") {
      return (
        <div className={`${baseClasses} ${borderColor}`}>
          <button
            type="button"
            onClick={handleExplainerBack}
            className={`${textColor} transition-colors text-sm font-medium`}
          >
            Back
          </button>
          <ProgressIndicator currentStep={currentStepIndex} totalSteps={4} />
          <button
            type="button"
            onClick={handleExplainerNext}
            className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
          >
            Next
          </button>
        </div>
      );
    }

    if (currentStep === "premium") {
      return (
        <div className={`${baseClasses} ${borderColor}`}>
          <button
            type="button"
            onClick={handlePremiumBack}
            className={`${textColor} transition-colors text-sm font-medium`}
          >
            Back
          </button>
          <ProgressIndicator currentStep={currentStepIndex} totalSteps={4} />
          <button
            type="button"
            onClick={handlePremiumSkip}
            className={`${textColor} transition-colors text-sm font-medium`}
          >
            Next
          </button>
        </div>
      );
    }

    if (currentStep === "complete") {
      return (
        <div className={`${baseClasses} ${borderColor}`}>
          <button
            type="button"
            onClick={handleCompleteBack}
            className="text-foreground transition-colors text-sm font-medium hover:text-primary"
          >
            Back
          </button>
          <ProgressIndicator currentStep={currentStepIndex} totalSteps={4} />
          <div />
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <div className={`min-h-screen flex flex-col py-4 md:py-6 pb-24 md:pb-28 ${isPremiumStep ? "bg-[#0F172A]" : "bg-background"}`}>
        <div className="flex flex-col max-w-6xl mx-auto w-full px-4 md:px-8">
          {/* Logo Header - Consistent positioning */}
          <header className="flex items-center justify-center pb-4 md:pb-6 shrink-0">
            <PolycopyLogo size="large" variant={isPremiumStep ? "light" : "dark"} />
          </header>

          {/* Main Content Area - Centered with full height, shifted down on desktop */}
          <main className="flex-1 flex flex-col justify-center min-h-0 md:pt-[5vh]">{currentStep === "follow" && (
              <StepFollowTraders
                selectedTraders={selectedTraders}
                onSelectTrader={handleSelectTrader}
                onTradersLoaded={setTraders}
              />
            )}

            {currentStep === "explainer" && <StepTradeExplainer />}

            {currentStep === "premium" && <StepPremiumUpsell onUpgrade={handlePremiumUpgrade} onSkip={handlePremiumSkip} />}

            {currentStep === "complete" && (
              <StepComplete
                followedCount={selectedTraders.length}
                onGoToFeed={handleGoToFeed}
                isLoading={isCompleting}
              />
            )}
          </main>

          {/* Footer - Fixed at bottom for all steps with matching background */}
          <footer className={`fixed bottom-0 left-0 right-0 px-4 md:px-8 shrink-0 border-t z-20 ${isPremiumStep ? "bg-[#0F172A] border-white/10" : "bg-background border-border"}`}>
            <div className="max-w-6xl mx-auto">
              {renderFooter()}
            </div>
          </footer>
        </div>
      </div>
      
      {/* Upgrade Modal */}
      <UpgradeModal 
        open={showUpgradeModal} 
        onOpenChange={setShowUpgradeModal}
      />
    </>
  );
}
