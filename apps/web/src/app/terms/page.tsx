import Link from "next/link";

export const metadata = {
  title: "Terms of Service | CONXA",
  description: "CONXA Terms of Service",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-24">
      <div className="container mx-auto max-w-2xl">
        <Link href="/" className="text-primary hover:underline text-sm mb-8 inline-block">
          ← Back to CONXA
        </Link>
        <h1 className="font-display text-3xl font-bold mb-6">Terms of Service</h1>
        <p className="text-muted-foreground">
          Terms of service will be added here. Contact{" "}
          <a href="mailto:hello@conxa.in" className="text-primary hover:underline">
            hello@conxa.in
          </a>{" "}
          for questions.
        </p>
      </div>
    </main>
  );
}
