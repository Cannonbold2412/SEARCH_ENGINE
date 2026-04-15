---
name: Landing page redesign
overview: Fully redesign the CONXA marketing landing using ui-ux-pro-max for the design system, Magic MCP (21st.dev) for component snippets and refinement, and Motion for animations—with plain-language copy and a shorter, clearer page structure.
todos:
  - id: design-system
    content: Run ui-ux-pro-max search.py --design-system for CONXA; capture colors, type, hero pattern, anti-patterns
    status: completed
  - id: mcp-21st
    content: Use Magic MCP 21st tools (inspiration → builder/refiner) to fetch and adapt snippets for hero/sections
    status: pending
  - id: ia-copy
    content: Define new section order and plain-language copy (hero one-liner, 3 steps, two audiences, CTAs)
    status: completed
  - id: motion
    content: Standardize animations on Motion (motion/react); respect prefers-reduced-motion
    status: pending
  - id: implement-layout
    content: Rebuild landing components in apps/web; integrate MCP snippets + design tokens
    status: completed
  - id: verify
    content: Lint apps/web; run graphify _rebuild_code from repo root
    status: completed
isProject: false
---

# Full CONXA landing redesign (updated)

## Context

- **Entry**: [`apps/web/src/app/page.tsx`](apps/web/src/app/page.tsx) and [`apps/web/src/components/landing/*`](apps/web/src/components/landing/).
- **Product (plain terms)**: People describe real work in their own words; CONXA turns that into a searchable profile. Others search in normal language and see why someone fits.

## 1. Design system — ui-ux-pro-max (required)

From repo root:

```bash
python .cursor/skills/ui-ux-pro-max/scripts/search.py "SaaS talent search people matching professional trustworthy simple" --design-system -p "CONXA" -f markdown
```

Use output for colors, typography, hero pattern, spacing, and anti-patterns. Follow the skill **Pre-Delivery Checklist** (contrast, no emoji-as-icons, interactive affordances, etc.).

## 2. 21st.dev — Magic MCP (required)

Use the **user-Magic MCP** server tools (21st.dev integration). Read each tool’s schema under `mcps/user-Magic_MCP/tools/` before calling.

| Tool | When to use |
|------|----------------|
| `21st_magic_component_inspiration` | Discover snippets: pass `message` (full user intent) + `searchQuery` (**2–4 words**, e.g. `hero gradient`, `feature bento`, `cta section`). Returns component text to integrate manually. |
| `21st_magic_component_builder` | Generate a new block: requires `message`, `searchQuery`, `absolutePathToCurrentFile`, `absolutePathToProjectDirectory`, `standaloneRequestQuery`. |
| `21st_magic_component_refiner` | Polish an **existing** file: `userMessage`, `absolutePathToRefiningFile`, `context` (specific UI to improve). Use for molecules/sections, not vague whole-app refactors. |

**Workflow**

1. **Inspiration** — Run 2–4 targeted searches (hero, key section, CTA) to collect snippets aligned with the ui-ux-pro-max system.
2. **Integrate** — Map snippets into [`apps/web`](apps/web) using existing tokens (`glass-card`, `gradient-violet`, CSS vars in [`globals.css`](apps/web/src/app/globals.css)); replace generic colors with CONXA theme.
3. **Refine** — After integration, call **refiner** per file or section that needs polish.

Do **not** assume `@21st-sdk/*` agent packages unless the product later needs 21st agent chat; this plan is **snippet + MCP** only.

## 3. Motion — animations (required)

- Use **Motion** for landing animations: import from `motion/react` (the `motion` package). Prefer **one** motion library in the landing code paths you touch.
- **apps/web** currently lists `framer-motion` in [`package.json`](apps/web/package.json). During implementation: add or align **`motion`** and migrate imports in edited files from `framer-motion` → `motion/react` so the landing uses a single API (Motion is the successor / unified package; avoids duplicate deps where possible).
- Patterns: `initial` / `animate` / `whileInView` for scroll reveals; keep durations ~150–300ms; **always** gate or reduce motion with `prefers-reduced-motion: reduce` (hook or CSS + conditional `transition` / disable `animate`).

## 4. Information architecture

- **One sentence** above the fold: what CONXA is, no jargon on the landing.
- **Three beats**: tell story → we organize it → searchers find you + why you match.
- **Two audiences**: short labels + one primary CTA each (`/signup`, etc.).
- **Shorter page**: prefer fewer, stronger sections; simplify or lazy-load heavy demos (`SearchDemo`, `FloatingCards`, `ParticleField`) per clarity.

## 5. Files to touch (expected)

| Area | Files |
|------|--------|
| Page | [`apps/web/src/app/page.tsx`](apps/web/src/app/page.tsx) |
| Chrome | [`navbar.tsx`](apps/web/src/components/landing/navbar.tsx), [`footer.tsx`](apps/web/src/components/landing/footer.tsx) |
| Story | [`hero.tsx`](apps/web/src/components/landing/hero.tsx), [`how-it-works.tsx`](apps/web/src/components/landing/how-it-works.tsx), audience sections, [`cta-section.tsx`](apps/web/src/components/landing/cta-section.tsx) |
| Demos / effects | [`search-demo.tsx`](apps/web/src/components/landing/search-demo.tsx), [`floating-cards.tsx`](apps/web/src/components/landing/floating-cards.tsx), [`particle-field.tsx`](apps/web/src/components/landing/particle-field.tsx) |
| Other | [`problem-section.tsx`](apps/web/src/components/landing/problem-section.tsx), [`examples.tsx`](apps/web/src/components/landing/examples.tsx), [`social-proof-bar.tsx`](apps/web/src/components/landing/social-proof-bar.tsx), [`index.ts`](apps/web/src/components/landing/index.ts) |
| Deps | [`apps/web/package.json`](apps/web/package.json) — add `motion`, remove redundant `framer-motion` if fully migrated |

## 6. After implementation

- Graphify rebuild per [`.cursor/rules/graphify.mdc`](.cursor/rules/graphify.mdc):

`python -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"`

- `npm run lint` in `apps/web`.

## Notes

- **npm peer issues** (e.g. `date-fns` vs `react-day-picker` at monorepo root): resolve separately; prefer changing only `apps/web` deps for this work when possible.
