# Sarvam AI Translation Setup Guide

CONXA uses **Sarvam AI** as the default translation provider for multi-language support. This guide explains why Sarvam is the best choice for India-first applications and how to set it up.

---

## Why Sarvam AI?

Sarvam is the recommended translation provider for CONXA because:

✅ **India-focused quality**: Trained specifically on Indian languages, names, and Hinglish  
✅ **8 core languages**: English, Hindi, Bengali, Marathi, Tamil, Telugu, Kannada, Urdu  
✅ **Free tier**: ₹1,000 worth of free credits on signup  
✅ **Low latency**: Optimized infrastructure for Indian regions  
✅ **Direct REST API**: Simple integration, no LLM overhead  

**Note**: Sarvam AI supports 23 languages total (22 Indian + English), but CONXA UI is limited to 8 core languages for focused user experience covering the primary Indian language speakers.

Alternative providers like Google Translate or OpenAI work but may struggle with:
- Indian names and places
- Code-mixed Hinglish text
- Cultural context and idioms

---

## Quick Setup

### 1. Get Your API Key

1. Sign up at [dashboard.sarvam.ai](https://dashboard.sarvam.ai/)
2. You'll get **₹1,000 free credits** automatically
3. Copy your API key from the dashboard

### 2. Configure Environment

Edit `apps/api/.env`:

```bash
# Translation (Sarvam AI)
TRANSLATION_PROVIDER=sarvam
TRANSLATION_API_KEY=your_sarvam_api_key_here
```

That's it! No need to set `TRANSLATION_API_BASE_URL` or `TRANSLATION_MODEL` for Sarvam.

### 3. Verify Setup

Restart the API server:

```bash
cd apps/api
uvicorn src.main:app --reload
```

The translation provider will be initialized on first use.

---

## Supported Languages (CONXA UI)

CONXA UI supports these 8 core Indian languages:

| Language | Code | Sarvam Code | Native Name |
|----------|------|-------------|-------------|
| English | `en` | `en-IN` | English |
| Hindi | `hi` | `hi-IN` | हिंदी |
| Bengali | `bn` | `bn-IN` | বাংলা |
| Marathi | `mr` | `mr-IN` | मराठी |
| Tamil | `ta` | `ta-IN` | தமிழ் |
| Telugu | `te` | `te-IN` | తెలుగు |
| Kannada | `kn` | `kn-IN` | ಕನ್ನಡ |
| Urdu | `ur` | `ur-IN` | اردو |

The code automatically maps ISO 639-1 codes (like `hi`) to Sarvam's format (`hi-IN`).

**Note**: While Sarvam AI supports 23 languages (22 Indian + English), CONXA limits the UI to these 8 core languages for a streamlined user experience covering the primary Indian language speakers.

---

## Rate Limits & Pricing

### Free Tier (Starter Plan)
- **₹1,000 free credits** on signup (never expire)
- **60 req/min** provisioned
- **100 req/min** burst capacity
- **5 req/min** during high platform load

### Paid Plans
- **Pro**: ₹10,000/month (+ ₹1,000 bonus credits, 200 req/min)
- **Business**: ₹50,000/month (+ ₹7,500 bonus credits, 1000 req/min)
- **Enterprise**: Custom pricing and limits

Pricing details: [docs.sarvam.ai/pricing](https://docs.sarvam.ai/api-reference-docs/getting-started/pricing)

---

## How Translation Works in CONXA

### Architecture: English-Canonical

All data is stored in **English** in the database for consistent embeddings and search. Translation happens at boundaries:

**Write Path (User → DB)**:
```
User input (Hindi) → Translate to English → Store in DB
```

**Read Path (DB → User)**:
```
DB data (English) → Translate to Hindi → Show to user
```

### Where Translation Happens

**Input (to English)**:
- Voice/text transcripts in builder
- Messy text fill-in
- Card edits (title, summary, etc.)
- Bio updates
- Search queries

**Output (from English)**:
- Search results ("why matched" explanations)
- Card display (future: full card localization)

### Caching Strategy

Every translation is cached in the `translation_cache` table:
- **Key**: SHA-256 hash of source text + language pair
- **Hit rate**: ~80%+ for common phrases and UI strings
- **Benefit**: Reduces API calls and latency

---

## Testing Translation

### Manual Test

1. Sign up and select **Hindi** in language onboarding
2. In builder, speak or type in Hindi: *"मैं गूगल में सॉफ्टवेयर इंजीनियर हूं"*
3. Check the database — it should store the English translation
4. Run a Hindi search query: *"सॉफ्टवेयर इंजीनियर"*
5. Verify results show Hindi "why matched" explanations

### Debugging

Enable translation logs:

```python
# In src/services/translation.py
logger.setLevel(logging.DEBUG)
```

Check logs for:
- Cache hits/misses
- API call timing
- Translation errors (falls back to original text on error)

---

## Switching to OpenAI-Compatible Provider

If you prefer to use an LLM-based translator (Groq, vLLM, Ollama), set:

```bash
TRANSLATION_PROVIDER=openai
TRANSLATION_API_BASE_URL=https://api.groq.com/openai/v1
TRANSLATION_API_KEY=your_groq_api_key
TRANSLATION_MODEL=llama-3.3-70b-versatile
```

**Trade-offs**:
- ✅ More languages beyond Indian languages
- ✅ Better cultural context for non-Indian text
- ❌ Higher latency (LLM inference)
- ❌ Higher cost (tokens vs. API call)
- ❌ Weaker on Hinglish and Indian names

---

## Troubleshooting

### Error: "Translation provider not configured"

**Cause**: `TRANSLATION_API_KEY` is missing or empty.  
**Fix**: Set it in `apps/api/.env` and restart the server.

### Error: "Sarvam translation service unavailable"

**Cause**: Network timeout or Sarvam API down.  
**Fix**: Check [status.sarvam.ai](https://status.sarvam.ai/) and retry.

### Translations are wrong or incomplete

**Cause**: Sarvam API returned empty response or parsing failed.  
**Behavior**: Falls back to original text (no hard failure).  
**Fix**: Check logs for the specific error; report to Sarvam if persistent.

### Rate limit exceeded

**Cause**: Too many requests in burst.  
**Fix**: Upgrade to Pro plan or add retry logic with exponential backoff.

---

## API Reference

### Internal Service API

```python
from src.services.translation import to_english, from_english, batch_from_english

# Translate user input to English
english_text = await to_english("मैं गूगल में काम करता हूं", source_lang="hi", db=db)

# Translate DB data to user language
hindi_text = await from_english("I work at Google", target_lang="hi", db=db)

# Batch translate (for search results)
translated = await batch_from_english(
    ["Senior engineer", "Led team of 5"],
    target_lang="hi",
    db=db
)
```

All functions use caching automatically.

---

## Best Practices

1. **Always pass `language` parameter** from frontend `useLanguage()` hook
2. **Use batch translation** for multiple items (search results) to reduce latency
3. **Monitor cache hit rate** in production logs to optimize performance
4. **Set up Sarvam alerts** in their dashboard for credit exhaustion
5. **Test with real user text** (Hinglish, code-mixed) before launch

---

## Resources

- **Sarvam Dashboard**: [dashboard.sarvam.ai](https://dashboard.sarvam.ai/)
- **API Docs**: [docs.sarvam.ai](https://docs.sarvam.ai/)
- **API Status**: [status.sarvam.ai](https://status.sarvam.ai/)
- **Discord Community**: [discord.com/invite/5rAsykttcs](https://discord.com/invite/5rAsykttcs)
- **Pricing**: [docs.sarvam.ai/pricing](https://docs.sarvam.ai/api-reference-docs/getting-started/pricing)

---

## Credits & Acknowledgments

Translation powered by [Sarvam AI](https://www.sarvam.ai/) — India's first full-stack AI platform.
