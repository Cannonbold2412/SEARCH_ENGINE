# Language Wheel Picker Component

A beautiful, reusable vertical scroll-wheel language selector with smooth animations and multi-input support.

## Files Created

1. **`apps/web/src/lib/languages.ts`** - Language constants and utilities
2. **`apps/web/src/components/ui/language-wheel-picker.tsx`** - Main component
3. **`apps/web/src/components/ui/index.ts`** - Updated with LanguageWheelPicker export

## Features

✨ **Vertical Scroll Wheel Selector**
- Shows ~5 languages at a time with smooth scroll snapping
- Fixed left-side pointer/indicator showing selected language
- Spring-based smooth animations for natural feel

🎯 **Multi-Input Support**
- **Mouse wheel scrolling** - Scroll to navigate languages
- **Touch swipe** - Swipe up/down on mobile devices (>20px threshold)
- **Keyboard navigation** - Arrow keys (↑↓←→) for accessibility

🎨 **Design & Styling**
- Matches existing dark theme aesthetic with Tailwind CSS
- Glass card effects with gradient overlays
- Smooth transitions and hover states
- Accessibility features (tabIndex, role, aria-label)

🌍 **Supported Languages** (8 total)

These match `SUPPORTED_LANGUAGES` in `apps/web/src/lib/languages.ts` (the codes the API accepts for `preferred_language` and that translation supports).

| Code | English name | Native name |
|------|----------------|-------------|
| `en` | English | English |
| `hi` | Hindi | हिंदी |
| `bn` | Bengali | বাংলা |
| `mr` | Marathi | मराठी |
| `ta` | Tamil | தமிழ் |
| `te` | Telugu | తెలుగు |
| `kn` | Kannada | ಕನ್ನಡ |
| `ur` | Urdu | اردو |

## Usage

### Basic Example

```tsx
"use client";

import { useState } from "react";
import { LanguageWheelPicker } from "@/components/ui";

export default function LanguageSettings() {
  const [language, setLanguage] = useState("en");

  return (
    <div className="w-full max-w-sm mx-auto p-4">
      <h2 className="text-lg font-semibold mb-4">Select Language</h2>
      <LanguageWheelPicker 
        value={language}
        onChange={setLanguage}
      />
      <p className="mt-4 text-sm text-muted-foreground">
        Selected: {language.toUpperCase()}
      </p>
    </div>
  );
}
```

### With Disabled State

```tsx
<LanguageWheelPicker 
  value={language}
  onChange={setLanguage}
  disabled={isLoading}
/>
```

### With Custom Styling

```tsx
<LanguageWheelPicker 
  value={language}
  onChange={setLanguage}
  className="max-w-md"
/>
```

## Component Props

```typescript
interface LanguageWheelPickerProps {
  value: string;              // Current language code (e.g., "en", "hi")
  onChange: (lang: string) => void; // Callback when language changes
  disabled?: boolean;         // Optional: disable interactions
  className?: string;         // Optional: additional CSS classes
}
```

## Language Utilities

The `languages.ts` file exports helper functions for working with language codes:

```typescript
import {
  SUPPORTED_LANGUAGES,
  getLanguageByCode,
  getLanguageName,
  getLanguageNativeName,
  isValidLanguageCode,
  getLanguageIndex,
  type Language,
} from "@/lib/languages";

// Get full language object
const lang = getLanguageByCode("hi");
// { code: "hi", name: "Hindi", nativeName: "हिंदी", flag: "🇮🇳" }

// Get English name
const name = getLanguageName("mr"); // "Marathi"

// Get native name
const native = getLanguageNativeName("ta"); // "தமிழ்"

// Validate language code
const isValid = isValidLanguageCode("te"); // true

// Get language index in array (0-based)
const index = getLanguageIndex("ur"); // 7

// Access all languages
SUPPORTED_LANGUAGES.forEach(lang => {
  console.log(`${lang.flag} ${lang.name} (${lang.code})`);
});
```

## Styling Details

### Dark Theme Integration
- Uses Tailwind CSS color system (`--border`, `--background`, `--foreground`, etc.)
- Gradient overlays on top and bottom for smooth fading
- Border color: `border-border/60` matching existing components
- Background: `bg-background` with accent highlights on hover

### Animation Characteristics
- Spring physics: stiffness=300, damping=30 for responsive feel
- Smooth transitions on selection changes
- Pointer indicator animates smoothly to track selection
- Item hover scale: 1.02x for subtle feedback
- Item tap scale: 0.98x for press feedback

### Dimensions
- Total height: `h-80` (320px)
- Item height: 56px (ITEM_HEIGHT constant)
- Visible items: ~5 at a time
- Pointer width: `w-1` (4px)
- Pointer height: `h-14` (56px)

## Accessibility

✅ **Keyboard Navigation**
- Focus-friendly with `tabIndex={0}`
- Arrow keys (↑↓) navigate languages
- Left/Right arrows also supported
- Disabled state removes from tab order

✅ **ARIA Attributes**
- `role="listbox"` for semantic HTML
- `aria-label="Language selector"` for screen readers

✅ **Mobile Friendly**
- Touch swipe support with 20px threshold
- Grab cursor on hover
- Grabbing cursor while dragging

## Linting

All code passes ESLint checks:

```bash
npm run lint
# ✖ 4 problems (0 errors, 4 warnings)
# Note: All warnings are pre-existing, unrelated to the new component
```

## TypeScript

Full TypeScript support with proper type definitions:

```typescript
interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag?: string;
}

interface LanguageWheelPickerProps {
  value: string;
  onChange: (lang: string) => void;
  disabled?: boolean;
  className?: string;
}
```

## Integration Notes

**Source of truth for codes and labels:** `apps/web/src/lib/languages.ts`. The wheel renders whatever is in `SUPPORTED_LANGUAGES`; keep it aligned with API validation if you add server-side checks for `preferred_language`.

### Dependencies Used
- **framer-motion** - Smooth animations (already in package.json)
- **@/lib/utils** - `cn()` utility for class merging
- **Tailwind CSS** - Styling

### Pattern Consistency
- Follows existing component patterns from `button.tsx`, `card.tsx`
- Uses `React.forwardRef` for ref forwarding
- Uses CVA (class-variance-authority) compatible classname patterns
- Matches display name convention

### Dark Mode
- Fully compatible with dark mode (uses CSS variables)
- Uses `bg-gradient-to-b` and `bg-gradient-to-t` for overlays
- Respects theme colors through Tailwind config

## Performance Considerations

- Minimal re-renders using `React.useCallback`
- Event listener cleanup on unmount
- Spring animations use GPU acceleration
- Touch/wheel debouncing for smooth interactions

## Future Enhancements

Potential improvements for future versions:
- Add language search/filter capability
- Support for custom language lists
- Integration with next-i18n or similar libraries
- Customizable animation speeds
- Haptic feedback on selection (mobile)
- Voice language selection
