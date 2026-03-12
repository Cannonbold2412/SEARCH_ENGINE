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
    <main className="bg-background min-h-screen overflow-x-hidden">
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
