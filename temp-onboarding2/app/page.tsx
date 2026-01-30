import { redirect } from "next/navigation";

export default function Home() {
  // In production, this would check auth state and has_completed_onboarding
  // For demonstration, redirect directly to onboarding
  redirect("/onboarding");
}
