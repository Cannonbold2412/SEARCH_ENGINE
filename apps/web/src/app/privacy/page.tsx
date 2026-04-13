import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | CONXA",
  description: "How CONXA collects, uses, and protects your personal information.",
};

const CONTACT_EMAIL = "noreplay@conxa.in";
const SITE_URL = "https://www.conxa.in";

export default function PrivacyPage() {
  return (
    <main className="min-h-app-screen bg-background px-4 py-20 sm:px-6 sm:py-24">
      <div className="container mx-auto max-w-3xl text-foreground">
        <Link href="/" className="text-primary hover:underline mb-8 inline-block text-sm">
          ← Back to CONXA
        </Link>
        <h1 className="mb-2 font-display text-3xl font-bold sm:text-4xl">Privacy Policy</h1>
        <p className="text-muted-foreground mb-10 text-sm">
          Last updated: 14 April 2026 · Website:{" "}
          <a href={SITE_URL} className="text-primary hover:underline">
            www.conxa.in
          </a>
        </p>

        <div className="space-y-8 text-sm leading-relaxed sm:text-base">
          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">1. Introduction</h2>
            <p className="text-muted-foreground">
              CONXA (“CONXA”, “we”, “us”, or “our”) operates the website and services available at{" "}
              <a href={SITE_URL} className="text-primary hover:underline">
                {SITE_URL}
              </a>{" "}
              (collectively, the “Service”). This Privacy Policy explains how we collect, use, disclose, store, and
              protect information when you visit our website, create an account, build or update an experience profile,
              run searches, use voice or chat features, or otherwise interact with the Service.
            </p>
            <p className="text-muted-foreground">
              By using the Service, you acknowledge that you have read this Privacy Policy. If you do not agree, please
              do not use the Service. For questions, contact us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">2. Who this policy applies to</h2>
            <p className="text-muted-foreground">
              This policy applies to visitors, registered users, and anyone who submits information through the Service.
              It covers personal data we process as a controller (where we decide why and how data is used) and, where
              applicable, processing we perform on behalf of users in connection with the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">3. Information we collect</h2>
            <p className="text-muted-foreground">
              We collect information in the categories below, depending on how you use the Service. Not every user will
              provide every category.
            </p>

            <h3 className="pt-2 font-semibold text-foreground">3.1 Account and identity information</h3>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5">
              <li>Name, username, or display name</li>
              <li>Email address and authentication credentials (for example, password hashes managed by our systems)</li>
              <li>Account preferences, including language or regional settings where you provide them</li>
            </ul>

            <h3 className="pt-2 font-semibold text-foreground">3.2 Profile and professional information</h3>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5">
              <li>
                Information you add to your experience card or profile, such as work history, skills, domains, locations,
                seniority, employment preferences, and similar fields you choose to disclose
              </li>
              <li>Structured data derived from your inputs (for example, normalized fields used for matching)</li>
              <li>Visibility or privacy settings you apply to parts of your profile</li>
            </ul>

            <h3 className="pt-2 font-semibold text-foreground">3.3 Search and usage information</h3>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5">
              <li>Natural-language search queries and filters you submit</li>
              <li>Metadata about searches (for example, timestamps, result interactions where logged)</li>
              <li>Inferences or explanations generated to describe why profiles matched a query, where that feature is
                enabled</li>
            </ul>

            <h3 className="pt-2 font-semibold text-foreground">3.4 Communications and user-generated content</h3>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5">
              <li>Text you enter in chat, forms, or feedback fields</li>
              <li>
                Voice or audio you choose to submit for transcription or assistant features, and resulting transcripts
              </li>
              <li>Support messages you send to us</li>
            </ul>

            <h3 className="pt-2 font-semibold text-foreground">3.5 Technical and device information</h3>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5">
              <li>IP address, approximate location derived from IP, device type, operating system, and browser type</li>
              <li>Log data such as access times, pages viewed, referring URLs, and diagnostic or error information</li>
              <li>Cookies, local storage, or similar technologies as described in Section 9</li>
            </ul>

            <h3 className="pt-2 font-semibold text-foreground">3.6 Payment and credits-related information</h3>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5">
              <li>
                If we offer paid features or credits, we may process transaction identifiers, billing status, and
                limited payment metadata. Payment card processing may be handled by a third-party processor; we do not
                store full card numbers on our servers where a processor tokenizes that data.
              </li>
            </ul>

            <h3 className="pt-2 font-semibold text-foreground">3.7 Information from third parties</h3>
            <p className="text-muted-foreground">
              We may receive information from authentication providers, analytics partners, or other services you
              connect to the Service, solely as needed to operate those integrations and as permitted by their terms and
              your settings.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">4. How we use information</h2>
            <p className="text-muted-foreground">We use personal information for purposes including:</p>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5">
              <li>Providing, operating, and improving the Service, including semantic search, ranking, and profile
                display</li>
              <li>Creating and maintaining embeddings or indexes used for search quality, where applicable</li>
              <li>Authenticating users, securing accounts, detecting fraud or abuse, and enforcing our Terms</li>
              <li>Generating or assisting with structured profile content when you use AI or voice features</li>
              <li>Translating or localizing content when you select a preferred language or viewer language</li>
              <li>Communicating service-related notices, security alerts, and policy updates</li>
              <li>Analytics and product measurement to understand feature usage and performance</li>
              <li>Complying with legal obligations and responding to lawful requests</li>
              <li>Exercising or defending legal claims where permitted</li>
            </ul>
            <p className="text-muted-foreground">
              Where required by law, we rely on appropriate legal bases such as performance of a contract, legitimate
              interests (balanced against your rights), consent where we ask for it, or legal obligation.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">5. How we share information</h2>
            <p className="text-muted-foreground">
              We do not sell your personal information. We may share information in these situations:
            </p>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5">
              <li>
                <span className="text-foreground">Service providers:</span> Hosting, databases, email delivery, analytics,
                security monitoring, payment processing, speech-to-text, translation, and AI model providers who process
                data on our instructions under contractual safeguards
              </li>
              <li>
                <span className="text-foreground">Other users:</span> Information you mark as visible may be shown to
                searchers or other users in accordance with your settings and product behavior (for example, ranked
                results and “why matched” explanations)
              </li>
              <li>
                <span className="text-foreground">Legal and safety:</span> When we believe disclosure is required by law,
                regulation, legal process, or governmental request, or to protect the rights, property, or safety of
                CONXA, our users, or the public
              </li>
              <li>
                <span className="text-foreground">Business transfers:</span> In connection with a merger, acquisition,
                financing, or sale of assets, subject to appropriate confidentiality and continuity commitments
              </li>
              <li>
                <span className="text-foreground">With your direction:</span> When you ask us to share information or
                connect third-party integrations
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">6. Retention</h2>
            <p className="text-muted-foreground">
              We retain personal information for as long as your account is active, as needed to provide the Service,
              and as necessary to comply with legal, tax, or regulatory obligations, resolve disputes, and enforce our
              agreements. Retention periods may vary by data category. Search logs and derived analytics may be retained
              in aggregated or de-identified form where permitted. When retention ends, we delete or anonymize information
              where feasible.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">7. Security</h2>
            <p className="text-muted-foreground">
              We implement technical and organizational measures designed to protect personal information against
              unauthorized access, alteration, disclosure, or destruction. These measures may include encryption in
              transit, access controls, monitoring, and secure development practices. No method of transmission or
              storage is completely secure; we encourage strong passwords and prompt reporting of suspected unauthorized
              access.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">8. Your rights and choices</h2>
            <p className="text-muted-foreground">
              Depending on where you live, you may have rights regarding your personal information, which can include:
            </p>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5">
              <li>Access to the personal information we hold about you</li>
              <li>Correction of inaccurate or incomplete information</li>
              <li>Deletion or erasure, subject to legal exceptions</li>
              <li>Restriction or objection to certain processing, including direct marketing where applicable</li>
              <li>Data portability, where technically feasible</li>
              <li>Withdrawal of consent, where processing is based on consent, without affecting prior lawful processing</li>
              <li>Lodging a complaint with a supervisory or regulatory authority</li>
            </ul>
            <p className="text-muted-foreground">
              Users in India may have rights under applicable data protection law, including rights to access
              information, correction, completion, updating, erasure where permitted, and grievance redressal. To
              exercise rights, email{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                {CONTACT_EMAIL}
              </a>
              . We may need to verify your identity before fulfilling certain requests.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">9. Cookies and similar technologies</h2>
            <p className="text-muted-foreground">
              We and our partners may use cookies, pixels, and similar technologies to remember preferences, keep you
              signed in, measure traffic, and improve the Service. You can control cookies through your browser
              settings; disabling cookies may limit some functionality.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">10. International transfers</h2>
            <p className="text-muted-foreground">
              We may process and store information in India and other countries where we or our service providers
              operate. When we transfer personal information across borders, we take steps consistent with applicable law,
              such as contractual clauses or other approved mechanisms, where required.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">11. Children</h2>
            <p className="text-muted-foreground">
              The Service is not directed to children under the age required in your jurisdiction to consent to data
              processing without parental authorization. We do not knowingly collect personal information from children.
              If you believe we have collected information from a child inappropriately, contact us and we will take
              appropriate steps.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">12. Automated processing and AI</h2>
            <p className="text-muted-foreground">
              Parts of the Service use automated systems, including machine learning and large language models, to parse
              queries, generate suggestions, transcribe audio, translate text, or produce match explanations. Outputs may
              be imperfect; you should review important information before relying on it. We do not use fully automated
              decisions that produce legal or similarly significant effects solely without human oversight, unless
              required or permitted by law and disclosed separately.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">13. Changes to this policy</h2>
            <p className="text-muted-foreground">
              We may update this Privacy Policy from time to time. We will post the revised version on this page and
              update the “Last updated” date. If changes are material, we will provide additional notice as appropriate,
              such as by email or an in-product message. Continued use of the Service after the effective date constitutes
              acceptance of the updated policy, to the extent permitted by law.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">14. Contact</h2>
            <p className="text-muted-foreground">
              For privacy-related requests or questions, contact CONXA at{" "}
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
