# Vapi Edit Assistant Configuration

Complete configuration for the **Enhance Experience Card** voice assistant.

---

## Environment Variable

```bash
# apps/web/.env.local
NEXT_PUBLIC_VAPI_EDIT_ASSISTANT_ID=your_assistant_id_here
```

---

## Template Variables (Sent from Frontend)

These are injected into your prompt using `{{variableName}}` syntax:

| Variable | Description |
|----------|-------------|
| `{{cardTitle}}` | Experience title |
| `{{cardSummary}}` | Summary paragraph |
| `{{normalizedRole}}` | Job role/title |
| `{{companyName}}` | Company name |
| `{{companyType}}` | Startup, Agency, Enterprise, etc. |
| `{{location}}` | Work location |
| `{{domain}}` | Domain (Engineering, Design, etc.) |
| `{{subDomain}}` | Sub-domain (Backend, Mobile, etc.) |
| `{{employmentType}}` | Full-time, Contract, Freelance |
| `{{seniorityLevel}}` | Junior, Mid, Senior, Lead, etc. |
| `{{timeRange}}` | "Jan 2022 - Present" |
| `{{responsibilities}}` | List of responsibilities |
| `{{strengths}}` | Skills and strengths |
| `{{achievements}}` | Key achievements |
| `{{metrics}}` | Measurable outcomes |
| `{{tools}}` | Tools and technologies |
| `{{collaborations}}` | Team/stakeholder work |
| `{{domainknowledge}}` | Domain knowledge evidence |
| `{{exposure}}` | Exposure to adjacent areas |
| `{{education}}` | Education-related evidence |
| `{{certifications}}` | Certifications |
| `{{missingOrWeak}}` | Areas needing improvement |

---

## System Prompt

Copy this entire prompt to your Vapi dashboard:

```
You are a focused, helpful assistant improving an existing experience card through conversation.

THE CURRENT EXPERIENCE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Role: {{cardTitle}}
Normalized Title: {{normalizedRole}}
Company: {{companyName}} ({{companyType}})
Location: {{location}}
Period: {{timeRange}}
Level: {{seniorityLevel}} · {{employmentType}}
Domain: {{domain}} → {{subDomain}}

Summary:
{{cardSummary}}

Responsibilities:
{{responsibilities}}

Skills:
{{strengths}}

Achievements:
{{achievements}}

Metrics:
{{metrics}}

Tools:
{{tools}}

Collaborations:
{{collaborations}}

Domain Knowledge:
{{domainknowledge}}

Exposure:
{{exposure}}

Education:
{{education}}

Certifications:
{{certifications}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEEDS ATTENTION: {{missingOrWeak}}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

YOUR JOB:
Make this experience clearer and stronger. You are NOT starting from scratch — you are improving what exists.

RULES:
1. Read the card above before asking anything
2. Ask ONE short question at a time
3. Never sound like a form or interview
4. Don't ask about things already filled in
5. Stop when the card is clearly better

GOOD QUESTIONS:
- "What part of this was really yours to own?"
- "Any concrete result or number you remember?"
- "What made this challenging?"
- "What tool or method mattered most here?"

BAD QUESTIONS:
- "Can you list all your responsibilities?"
- "What was the timeline, scope, and stakeholder map?"
- Anything that sounds like a checklist

WHEN YOU LEARN SOMETHING NEW:
Call `update_card_draft` immediately with a small, focused update. Don't wait until the end.

HOW TO PATCH:
- `parent_patch`: For summary, title, company, domain, dates, etc.
- `child_updates`: For the 10 child sections listed below
- Use `append_items` operation to add without replacing
- Child items are objects with `subtitle` and `description` fields
- Keep items short and specific

WHEN TO END:
Once the experience is noticeably stronger, wrap up naturally:
- "That makes this much clearer."
- "Great — this is stronger now."
```

---

## Tool: update_card_draft

Add this as a **Function Tool** in Vapi dashboard.

**Name:** `update_card_draft`

**Description:** Update the experience card with new information from the conversation.

**Schema:**

```json
{
  "type": "object",
  "properties": {
    "parent_patch": {
      "type": "object",
      "description": "Updates to main card fields",
      "additionalProperties": false,
      "properties": {
        "summary": {
          "type": "string",
          "description": "Updated summary paragraph"
        },
        "title": {
          "type": "string",
          "description": "Experience title"
        },
        "normalized_role": {
          "type": "string",
          "description": "Normalized job title"
        },
        "company_name": {
          "type": "string",
          "description": "Company name"
        },
        "company_type": {
          "type": "string",
          "description": "Type: Startup, Agency, Enterprise, etc."
        },
        "domain": {
          "type": "string",
          "description": "Primary domain"
        },
        "sub_domain": {
          "type": "string",
          "description": "Sub-domain or specialization"
        },
        "location": {
          "type": "string",
          "description": "Work location"
        },
        "seniority_level": {
          "type": "string",
          "description": "Junior, Mid, Senior, Lead, etc."
        },
        "employment_type": {
          "type": "string",
          "description": "Full-time, Contract, Freelance"
        }
      }
    },
    "child_updates": {
      "type": "array",
      "description": "Updates to card child sections",
      "items": {
        "type": "object",
        "required": ["child_type", "operation", "items"],
        "additionalProperties": false,
        "properties": {
          "child_type": {
            "type": "string",
            "description": "Which section to update",
            "enum": [
              "responsibilities",
              "skills",
              "achievements",
              "metrics",
              "tools",
              "collaborations",
              "domain_knowledge",
              "exposure",
              "education",
              "certifications"
            ]
          },
          "operation": {
            "type": "string",
            "description": "How to apply the update",
            "enum": ["append_items", "replace_raw_text", "replace_items", "merge_items"]
          },
          "items": {
            "type": "array",
            "description": "Items for this child section",
            "items": {
              "type": "object",
              "required": ["description"],
              "additionalProperties": false,
              "properties": {
                "subtitle": {
                  "type": "string",
                  "description": "Short label for the item"
                },
                "description": {
                  "type": "string",
                  "description": "Main item text (required)"
                }
              }
            }
          }
        }
      }
    },
    "notes": {
      "type": "string",
      "description": "Optional internal notes (not shown to user)"
    }
  }
}
```

---

## Example Tool Calls

**Adding a responsibility:**
```json
{
  "child_updates": [
    {
      "child_type": "responsibilities",
        "operation": "append_items",
        "items": [
          {
            "subtitle": "Ownership",
            "description": "Led migration of payment system to Stripe"
          }
        ]
      }
    ]
}
```

**Updating summary:**
```json
{
  "parent_patch": {
    "summary": "Led backend engineering for a fintech startup, owning the payment infrastructure and API design."
  }
}
```

**Adding multiple items:**
```json
{
  "child_updates": [
    {
      "child_type": "achievements",
        "operation": "append_items",
        "items": [
          {
            "subtitle": "Performance",
            "description": "Reduced payment processing time by 40%"
          },
          {
            "subtitle": "Reliability",
            "description": "Achieved 99.9% uptime for payment services"
          }
        ]
      },
      {
        "child_type": "tools",
        "operation": "append_items",
        "items": [
          {
            "subtitle": "Payments",
            "description": "Stripe API"
          },
          {
            "subtitle": "Data",
            "description": "PostgreSQL"
          }
        ]
      }
    ]
}
```

The `items` array must contain **objects**, not strings.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Assistant says "I can't see the card" | Your prompt is missing `{{cardTitle}}` and other template variables |
| Variables show "(not set)" | That field is empty on the card — this is normal |
| Tool calls not working | Check browser console; verify assistant ID matches |
| Updates not appearing | Check `extractUpdateCardDraftPatch` is parsing the tool call format |
