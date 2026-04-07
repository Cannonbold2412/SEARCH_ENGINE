"use client";

import {
  LandingNavbar,
  LandingHero,
  SocialProofBar,
  ProblemSection,
  HowItWorks,
  ForRecruiters,
  ForPeople,
  Examples,
  CTASection,
  LandingFooter,
} from "@/components/landing";

export default function RootPage() {
  return (
    <main className="min-h-app-screen overflow-x-clip bg-background">
      <LandingNavbar />
      <LandingHero />
      <SocialProofBar />
      <ProblemSection />
      <HowItWorks />
      <ForRecruiters />
      <ForPeople />
      <Examples />
      <CTASection />
      <LandingFooter />
    </main>
  );
}
