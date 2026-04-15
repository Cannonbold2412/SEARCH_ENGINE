/**
 * Single registry for public documentation URLs: sitemap, llm.txt, /llm/manifest.json.
 * Copy stays user-facing only (no engineering internals).
 */

export type PublicDocSection = "docs" | "guides" | "knowledge" | "faq" | "legal";

export type PublicDocPage = {
  path: string;
  title: string;
  /** One sentence for llm.txt / manifest; unique facts, no stack details */
  summary: string;
  section: PublicDocSection;
};

export const PUBLIC_DOC_PAGES: PublicDocPage[] = [
  {
    path: "/docs",
    title: "Documentation",
    summary: "Index of CONXA product documentation for searchers and profile builders.",
    section: "docs",
  },
  {
    path: "/docs/overview",
    title: "Overview",
    summary: "CONXA helps people express experience as structured profiles and find others through natural-language search.",
    section: "docs",
  },
  {
    path: "/docs/how-it-works",
    title: "How it works",
    summary: "End-to-end flow from signing up and building an Experience Card to running searches and reviewing match explanations.",
    section: "docs",
  },
  {
    path: "/docs/architecture",
    title: "How the product fits together",
    summary: "User-facing map of main areas—home, builder, search, results, inbox, credits, and settings—without technical system design.",
    section: "docs",
  },
  {
    path: "/docs/concepts",
    title: "Key concepts",
    summary: "Definitions for Experience Cards, natural-language search, match explanations, credits, and viewer language as used in the app.",
    section: "docs",
  },
  {
    path: "/guides",
    title: "Guides",
    summary: "Step-by-step guides for getting started, everyday setup, and deeper usage of CONXA.",
    section: "guides",
  },
  {
    path: "/guides/getting-started",
    title: "Getting started",
    summary: "Create an account, finish onboarding basics, and open the builder or search from the home experience.",
    section: "guides",
  },
  {
    path: "/guides/basic-setup",
    title: "Basic setup",
    summary: "Set your language preference, understand credits shown in the app, and keep your profile information current.",
    section: "guides",
  },
  {
    path: "/guides/advanced-usage",
    title: "Advanced usage",
    summary: "Use voice alongside chat in the builder, iterate on cards, run searches from home, and manage unlocked conversations.",
    section: "guides",
  },
  {
    path: "/knowledge",
    title: "Knowledge base",
    summary: "Short definitions of core ideas you will see while using CONXA.",
    section: "knowledge",
  },
  {
    path: "/knowledge/concept-1",
    title: "Experience Cards",
    summary: "Structured experience profiles you build and refine; visibility controls whether you can appear in others’ search results.",
    section: "knowledge",
  },
  {
    path: "/knowledge/concept-2",
    title: "Search and match explanations",
    summary: "You describe what you are looking for in everyday language; results show people with brief reasons why they were suggested.",
    section: "knowledge",
  },
  {
    path: "/knowledge/concept-3",
    title: "Credits and contact flows",
    summary: "Credits reflect usage you see in the product; some actions may consume credits according to in-app messaging and your plan.",
    section: "knowledge",
  },
  {
    path: "/faq",
    title: "FAQ",
    summary: "Frequently asked questions about using CONXA and where to get help.",
    section: "faq",
  },
  {
    path: "/faq/general",
    title: "General FAQ",
    summary: "Common questions about what CONXA is for, accounts, languages, and everyday behavior in the app.",
    section: "faq",
  },
  {
    path: "/faq/troubleshooting",
    title: "Troubleshooting",
    summary: "Practical steps when something looks wrong—sign-in, searches with no results, builder or voice hiccups, and who to contact.",
    section: "faq",
  },
  {
    path: "/privacy",
    title: "Privacy Policy",
    summary: "How CONXA handles personal information when you use the website and services.",
    section: "legal",
  },
  {
    path: "/terms",
    title: "Terms of Service",
    summary: "Terms and conditions that govern use of CONXA.",
    section: "legal",
  },
];

export function publicDocPathsForSitemap(): string[] {
  return PUBLIC_DOC_PAGES.map((p) => p.path);
}
