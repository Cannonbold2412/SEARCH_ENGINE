# Language List Change Log

## April 4, 2026 - Final: 8 Core Indian Languages

### Final Language List (8 languages)
1. **English** (en) - English
2. **Hindi** (hi) - हिंदी
3. **Bengali** (bn) - বাংলা
4. **Marathi** (mr) - मराठी
5. **Tamil** (ta) - தமிழ்
6. **Telugu** (te) - తెలుగు
7. **Kannada** (kn) - ಕನ್ನಡ
8. **Urdu** (ur) - اردو

### Previous Versions
**Original (10 languages)**: English, Hindi, Spanish, French, German, Portuguese, Arabic, Chinese, Japanese, Korean

**Removed**: All non-Indian languages (Spanish, French, German, Portuguese, Arabic, Chinese, Japanese, Korean)

**Not included from Sarvam's 23**: Gujarati, Malayalam, Punjabi, Odia, Assamese, Nepali, Konkani, Kashmiri, Sindhi, Sanskrit, Santali, Manipuri, Bodo, Maithili, Dogri

### Rationale
1. **India-first focus**: CONXA is a people search platform focused on Indian users
2. **Sarvam AI optimization**: Best translation quality for these core Indian languages
3. **Wide coverage**: These 8 languages cover the majority of Indian speakers
4. **Streamlined UX**: Focused selection makes language choice simpler
5. **Core languages**: Most widely spoken Indian languages for maximum impact

### Language Statistics (approximate speakers in India)
- **Hindi**: ~500 million (official language)
- **Bengali**: ~100 million
- **Telugu**: ~80 million
- **Marathi**: ~80 million
- **Tamil**: ~70 million
- **Urdu**: ~60 million
- **Kannada**: ~45 million
- **English**: Widely used as second language

**Total coverage**: ~935+ million speakers across these 8 languages

### Technical Notes
- **Frontend**: Updated `apps/web/src/lib/languages.ts` with 8 languages
- **Backend**: Sarvam AI supports all 23 Indian languages (these 8 + 15 more)
- **Backward compatibility**: Users with unsupported languages default to English
- **Database**: No migration needed - `preferred_language` field is flexible

### Files Changed (April 4, 2026)
- `apps/web/src/lib/languages.ts` - Language definitions (8 languages)
- `docs/LANGUAGE_IMPLEMENTATION_SUMMARY.md` - Updated language count
- `docs/SARVAM_TRANSLATION_SETUP.md` - Updated language table
- `docs/TRANSLATION_QUICK_REFERENCE.md` - Updated language list
- `docs/LANGUAGE_LIST_CHANGE.md` - This changelog
- Session plan.md - Updated status

### Impact
- **Users**: See 8 focused language options in onboarding and settings
- **Translation**: All 8 languages fully supported by Sarvam AI
- **Display**: Native script rendering for all Indian languages
- **UX**: Cleaner, more focused language selection experience

### Future Considerations
If expansion is needed, additional languages can be easily added:
1. Update `SUPPORTED_LANGUAGES` array in `languages.ts`
2. All backend support is already in place (Sarvam supports 23 languages)
3. No API changes required
4. Documentation updates only

### Testing Checklist
- [x] Language picker shows all 8 languages
- [x] Each language displays with correct native script
- [x] TypeScript compilation passes
- [x] ESLint passes (0 errors)
- [ ] Translation works for all 8 languages (pending API key config)
- [ ] Existing users with removed languages default to English gracefully
