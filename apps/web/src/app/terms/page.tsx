import Link from "next/link";

export const metadata = {
  title: "Terms of Service | CONXA",
  description: "Terms and conditions for using CONXA.",
};

const CONTACT_EMAIL = "noreplay@conxa.in";
const SITE_URL = "https://www.conxa.in";

export default function TermsPage() {
  return (
    <main className="min-h-app-screen bg-background px-4 py-20 sm:px-6 sm:py-24">
      <div className="container mx-auto max-w-3xl text-foreground">
        <Link href="/" className="text-primary hover:underline mb-8 inline-block text-sm">
          ← Back to CONXA
        </Link>
        <h1 className="mb-2 font-display text-3xl font-bold sm:text-4xl">Terms of Service</h1>
        <p className="text-muted-foreground mb-10 text-sm">
          Last updated: 14 April 2026 · Website:{" "}
          <a href={SITE_URL} className="text-primary hover:underline">
            www.conxa.in
          </a>
        </p>

        <div className="space-y-8 text-sm leading-relaxed sm:text-base">
          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">1. Agreement to terms</h2>
            <p className="text-muted-foreground">
              These Terms of Service (“Terms”) govern your access to and use of the website, applications, and related
              services operated by CONXA (“CONXA”, “we”, “us”, or “our”) at{" "}
              <a href={SITE_URL} className="text-primary hover:underline">
                {SITE_URL}
              </a>{" "}
              (collectively, the “Service”). By accessing or using the Service, you agree to be bound by these Terms and
              our Privacy Policy. If you do not agree, do not use the Service.
            </p>
            <p className="text-muted-foreground">
              If you use the Service on behalf of an organization, you represent that you have authority to bind that
              organization, and “you” includes both you individually and that organization.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">2. Eligibility</h2>
            <p className="text-muted-foreground">
              You must be at least the age of majority in your jurisdiction (or older if the Service specifies a higher
              minimum age) to create an account. You must have the legal capacity to enter into a binding contract. We
              may refuse service or close accounts that we believe do not meet these requirements.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">3. Accounts and security</h2>
            <p className="text-muted-foreground">
              You may need to register an account to use certain features. You agree to provide accurate, current, and
              complete information and to update it as needed. You are responsible for safeguarding your credentials and
              for all activity under your account. You must notify us promptly at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                {CONTACT_EMAIL}
              </a>{" "}
              if you suspect unauthorized access. We may suspend or terminate accounts that violate these Terms or pose a
              security risk.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">4. Description of the Service</h2>
            <p className="text-muted-foreground">
              CONXA provides tools to create structured professional or experience profiles (“Experience Cards” or
              similar), and to discover people through natural-language search, ranking, and explanations. Features may
              include AI-assisted drafting, voice input, translation or localization, credits or usage limits, and
              contact-related flows where offered. The Service may change over time; we may add, modify, or discontinue
              features with or without notice, subject to applicable law.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">5. Your content and license to us</h2>
            <p className="text-muted-foreground">
              You retain ownership of content you submit (“User Content”), subject to these Terms. To operate the
              Service, you grant CONXA a worldwide, non-exclusive, royalty-free license to host, store, reproduce,
              process, adapt, publish, display, distribute, translate, and create derivative works from User Content
              solely as needed to provide, improve, secure, and promote the Service, including training or tuning our
              systems only where permitted by law and our Privacy Policy.
            </p>
            <p className="text-muted-foreground">
              You represent that you have all rights necessary to grant this license and that User Content does not
              infringe third-party rights. You are responsible for the accuracy of information you publish, including
              professional claims. Visibility settings you choose may control how your profile appears to others, but
              you should not rely solely on software for sensitive disclosures.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">6. Acceptable use</h2>
            <p className="text-muted-foreground">You agree not to:</p>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5">
              <li>Violate any applicable law or regulation</li>
              <li>Infringe intellectual property, privacy, publicity, or other rights of others</li>
              <li>Harass, threaten, defame, discriminate against, or harm any person or group</li>
              <li>Upload malware, attempt unauthorized access, or probe or stress systems without permission</li>
              <li>Scrape, crawl, or harvest data from the Service at scale without our written consent</li>
              <li>Circumvent technical limits, paywalls, credits, or access controls</li>
              <li>Use the Service to build a competing product using our proprietary data or interfaces in breach of
                these Terms</li>
              <li>Misrepresent your identity, credentials, or affiliation</li>
              <li>Submit unlawful, obscene, or exploitative content, including content involving minors in any harmful
                context</li>
            </ul>
            <p className="text-muted-foreground">
              We may investigate violations and cooperate with law enforcement. We may remove content or suspend access
              without prior notice where we reasonably believe it is necessary.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">7. AI-generated output and search results</h2>
            <p className="text-muted-foreground">
              Outputs from AI features (including suggestions, transcripts, translations, or “why matched” text) may be
              inaccurate, incomplete, or outdated. Search ranking is probabilistic and does not constitute endorsement,
              verification of qualifications, or employment, partnership, or investment advice. You are solely
              responsible for decisions you make based on the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">8. Credits, fees, and payments</h2>
            <p className="text-muted-foreground">
              Certain features may require credits, subscriptions, or one-time payments. Prices and terms will be
              presented at purchase. Unless stated otherwise, fees are non-refundable except as required by law. Credits
              may expire or be consumed according to product rules shown in the Service. Failure to pay may result in
              suspension of paid features. You authorize us and our payment processors to charge your selected payment
              method.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">9. Third-party services</h2>
            <p className="text-muted-foreground">
              The Service may integrate third-party services (for example, voice platforms, cloud hosting, analytics, or
              payment providers). Your use of those services may be subject to their terms and privacy policies. CONXA is
              not responsible for third-party services except to the extent required by law.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">10. Intellectual property</h2>
            <p className="text-muted-foreground">
              The Service, including software, branding, logos, designs, and documentation, is owned by CONXA or its
              licensors and is protected by intellectual property laws. Except for the limited rights expressly granted
              in these Terms, no rights are transferred to you. You may not copy, modify, distribute, sell, or lease any
              part of the Service without our prior written consent.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">11. Feedback</h2>
            <p className="text-muted-foreground">
              If you provide suggestions or feedback, you grant us a perpetual, irrevocable, worldwide, royalty-free
              license to use and incorporate that feedback without obligation to you.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">12. Disclaimers</h2>
            <p className="text-muted-foreground">
              THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS,
              IMPLIED, OR STATUTORY, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
              TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE
              OF HARMFUL COMPONENTS. SOME JURISDICTIONS DO NOT ALLOW CERTAIN DISCLAIMERS; IN THOSE CASES, DISCLAIMERS
              APPLY TO THE MAXIMUM EXTENT PERMITTED BY LAW.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">13. Limitation of liability</h2>
            <p className="text-muted-foreground">
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, CONXA AND ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES,
              AND AGENTS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR
              PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, GOODWILL, OR BUSINESS OPPORTUNITIES, ARISING OUT OF OR
              RELATED TO YOUR USE OF OR INABILITY TO USE THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH
              DAMAGES.
            </p>
            <p className="text-muted-foreground">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR AGGREGATE LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATING TO
              THE SERVICE OR THESE TERMS WILL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID TO CONXA FOR THE SERVICE
              IN THE TWELVE (12) MONTHS BEFORE THE EVENT GIVING RISE TO LIABILITY, OR (B) IF NO FEES APPLIED, ONE HUNDRED
              INDIAN RUPEES (INR 100). MULTIPLE CLAIMS WILL NOT ENLARGE THIS CAP.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">14. Indemnity</h2>
            <p className="text-muted-foreground">
              You will defend, indemnify, and hold harmless CONXA and its affiliates, officers, directors, employees, and
              agents from and against any claims, damages, losses, liabilities, costs, and expenses (including reasonable
              attorneys’ fees) arising out of or related to your User Content, your use of the Service, or your breach
              of these Terms or applicable law.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">15. Term and termination</h2>
            <p className="text-muted-foreground">
              These Terms apply from your first use of the Service until terminated. You may stop using the Service at
              any time. We may suspend or terminate your access if you violate these Terms, if we are required to do so
              by law, or if we discontinue the Service. Provisions that by their nature should survive (including
              ownership, disclaimers, limitation of liability, indemnity, and governing law) will survive termination.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">16. Governing law and disputes</h2>
            <p className="text-muted-foreground">
              These Terms are governed by the laws of India, without regard to conflict-of-law principles that would
              require application of another jurisdiction’s laws, subject to mandatory consumer protections where they
              apply to you. You agree that courts located in India will have exclusive jurisdiction over disputes arising
              out of or relating to these Terms or the Service, except where applicable law requires otherwise.
            </p>
            <p className="text-muted-foreground">
              Before filing a claim, you agree to contact us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                {CONTACT_EMAIL}
              </a>{" "}
              to attempt informal resolution.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">17. General</h2>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5">
              <li>
                <span className="text-foreground">Entire agreement:</span> These Terms and the Privacy Policy constitute
                the entire agreement between you and CONXA regarding the Service and supersede prior agreements on the
                same subject.
              </li>
              <li>
                <span className="text-foreground">Assignment:</span> You may not assign these Terms without our consent.
                We may assign our rights and obligations in connection with a merger, acquisition, or sale of assets.
              </li>
              <li>
                <span className="text-foreground">Severability:</span> If any provision is held invalid, the remaining
                provisions remain in effect.
              </li>
              <li>
                <span className="text-foreground">No waiver:</span> Failure to enforce a provision is not a waiver of our
                right to enforce it later.
              </li>
              <li>
                <span className="text-foreground">Force majeure:</span> We are not liable for delays or failures due to
                events beyond our reasonable control.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">18. Contact</h2>
            <p className="text-muted-foreground">
              For questions about these Terms, contact CONXA at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
