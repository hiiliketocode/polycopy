"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { StepFollowTraders, MOCK_TRADERS } from "./step-follow-traders";
import { PolycopyLogo } from "./polycopy-logo";
import { StepTradeExplainer } from "./step-trade-explainer";
import { StepPremiumUpsell } from "./step-premium-upsell";
import { StepComplete } from "./step-complete";
import { ProgressIndicator } from "./progress-indicator";
import { supabase } from "@/lib/supabase";
import { triggerLoggedOut } from "@/lib/auth/logout-events";
import { UpgradeModal } from "@/components/polycopy/upgrade-modal";

type OnboardingStep = "follow" | "explainer" | "premium" | "complete";

const STEPS: OnboardingStep[] = ["follow", "explainer", "premium", "complete"];

export function OnboardingFlow() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("follow");
  const [selectedTraders, setSelectedTraders] = useState<string[]>([]);
  const [isCompleting, setIsCompleting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [traders, setTraders] = useState<any[]>([]); // Store traders at parent level
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Check auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        // PREVIEW MODE: Comment out redirect for local testing
        // triggerLoggedOut('session_missing');
        // router.push('/login');
        console.log('⚠️ PREVIEW MODE: No auth required (for local testing only)');
        setUserId('preview-user-id'); // Mock user ID for preview
        return;
      }
      setUserId(session.user.id);
    };
    checkAuth();
  }, [router]);

  const currentStepIndex = STEPS.indexOf(currentStep) + 1;
  const isPremiumStep = currentStep === "premium";
  const isCompleteStep = currentStep === "complete";

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

  const handleFollowTradersSkip = async () => {
    if (!userId) return;
    
    try {
      // Get actual traders from state
      const top5Wallets = traders.slice(0, 5).map((t) => t.wallet);
      
      // PREVIEW MODE: Skip DB operations
      if (userId === 'preview-user-id') {
        console.log('⚠️ PREVIEW MODE: Would auto-follow top 5:', top5Wallets);
        setSelectedTraders(top5Wallets);
        setCurrentStep("explainer");
        return;
      }
      
      // PRODUCTION MODE: Follow them in the database immediately
      const follows = top5Wallets.map(wallet => ({
        user_id: userId,
        trader_wallet: wallet.toLowerCase()
      }));
      
      const { error } = await supabase
        .from('follows')
        .insert(follows);
        
      if (error) {
        console.error('Error auto-following traders:', error);
        // Continue anyway, but log the error
      }
      
      setSelectedTraders(top5Wallets);
      setCurrentStep("explainer");
    } catch (error) {
      console.error('Error in skip handler:', error);
      // Continue anyway
      setCurrentStep("explainer");
    }
  };

  const handleExplainerNext = () => {
    setCurrentStep("premium");
  };

  const handleExplainerBack = () => {
    setCurrentStep("follow");
  };

  const handlePremiumUpgrade = () => {
    // Open the actual premium upgrade modal
    setShowUpgradeModal(true);
  };

  const handlePremiumSkip = () => {
    setCurrentStep("complete");
  };

  const handlePremiumBack = () => {
    setCurrentStep("explainer");
  };

  const handleGoToFeed = async () => {
    if (!userId) return;
    
    setIsCompleting(true);
    try {
      // PREVIEW MODE: Skip database operations for preview
      if (userId === 'preview-user-id') {
        console.log('⚠️ PREVIEW MODE: Skipping DB operations');
        console.log('Would follow traders:', selectedTraders);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate loading
        alert('✅ Preview complete! In production, this would:\n\n1. Follow ' + selectedTraders.length + ' traders\n2. Mark onboarding as complete\n3. Redirect to /feed\n\nClose this alert to restart the preview.');
        // Reload to restart preview
        window.location.reload();
        return;
      }
      
      // PRODUCTION MODE: Real DB operations
      // Step 1: Follow selected traders
      if (selectedTraders.length > 0) {
        const follows = selectedTraders.map(wallet => ({
          user_id: userId,
          trader_wallet: wallet.toLowerCase()
        }));
        
        const { error: followError } = await supabase
          .from('follows')
          .insert(follows);
          
        if (followError) {
          console.error('Error following traders:', followError);
          throw followError;
        }
      }

      // Step 2: Mark onboarding as complete
      const response = await fetch('/api/onboarding/complete', {
        method: 'POST',
      });
      
      if (!response.ok) {
        console.error('Failed to mark onboarding complete');
      }

      // Step 3: Navigate to feed
      router.replace("/feed");
    } catch (error) {
      console.error("Error completing onboarding:", error);
      setIsCompleting(false);
    }
  };

  // Footer actions based on current step
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
            Skip
          </button>
        </div>
      );
    }

    if (currentStep === "complete") {
      return (
        <div className={`${baseClasses} ${borderColor}`}>
          <div />
          <ProgressIndicator currentStep={currentStepIndex} totalSteps={4} />
          <div />
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <div className={`min-h-screen flex flex-col justify-center py-4 md:py-6 ${isPremiumStep ? "bg-[#0F172A]" : "bg-background"}`}>
        {/* Centered container for logo + content + footer */}
        <div className="flex flex-col max-w-6xl mx-auto w-full px-4 md:px-8">
          {/* Logo Header */}
          <header className="flex items-center justify-center pb-4 md:pb-6 shrink-0">
            <PolycopyLogo size="large" variant={isPremiumStep ? "light" : "dark"} />
          </header>

          {/* Main Content Area */}
          <main className="flex-1 flex flex-col">
            {currentStep === "follow" && (
              <StepFollowTraders
                selectedTraders={selectedTraders}
                onSelectTrader={handleSelectTrader}
                onTradersLoaded={setTraders}
              />
            )}

            {currentStep === "explainer" && <StepTradeExplainer />}

            {currentStep === "premium" && (
              <StepPremiumUpsell onUpgrade={handlePremiumUpgrade} />
            )}

            {currentStep === "complete" && (
              <StepComplete
                followedCount={selectedTraders.length}
                onGoToFeed={handleGoToFeed}
                isLoading={isCompleting}
              />
            )}
          </main>

          {/* Footer */}
          <footer className="pt-4 md:pt-6 shrink-0">
            {renderFooter()}
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
