
import asyncio
import random
from datetime import date

from sqlalchemy import select

from src.core import hash_password
from src.db.session import async_session
from src.db.models import Person, PersonProfile, ExperienceCard, ExperienceCardChild
from src.domain import ALLOWED_CHILD_TYPES


DEMO_USERS = [
    {
        "email": "demo1@example.com",
        "display_name": "Alice Johnson",
        "first_name": "Alice",
        "last_name": "Johnson",
        "city": "Bengaluru",
        "current_company": "Acme Corp",
        "role": "Senior Product Manager",
        "domain": "Product",
        "sub_domain": "B2B SaaS",
        "experiences": [
            {
                "title": "Rebuilding onboarding after weeks of customer calls",
                "summary": "Spent six weeks talking to frustrated trial users, then rewrote Acme’s onboarding flow with design and engineering. The new experience cut the “I’m stuck” drop‑off moment in half.",
            },
            {
                "title": "Saying no to a big launch to focus on the boring basics",
                "summary": "Pushed back on a flashy AI launch in favor of fixing pricing clarity and trial limits. It wasn’t glamorous, but it quietly moved trial‑to‑paid conversion more than any previous “big bet.”",
            },
            {
                "title": "Creating a weekly customer story ritual for the team",
                "summary": "Started a 30‑minute Friday ritual where PMs, designers, and engineers shared one real customer story. It shifted conversations from “tickets” to people and changed how roadmap debates sounded.",
            },
        ],
    },
    {
        "email": "demo2@example.com",
        "display_name": "Bob Singh",
        "first_name": "Bob",
        "last_name": "Singh",
        "city": "Mumbai",
        "current_company": "CloudScale",
        "role": "Staff Software Engineer",
        "domain": "Engineering",
        "sub_domain": "Backend",
        "experiences": [
            {
                "title": "Calming down a noisy, 3 a.m. on‑call rotation",
                "summary": "Inherited a flaky job system that paged the team at all hours. Spent a quarter untangling alerts, re‑architecting a few hot paths, and teaching newer engineers how to debug without panic.",
            },
            {
                "title": "Drawing the first proper architecture diagram for a five‑year‑old system",
                "summary": "Realized nobody could explain how requests actually flowed through CloudScale’s backend. Sat down with people across teams and produced a living architecture map that finally made handoffs sane.",
            },
            {
                "title": "Growing mid‑level engineers into confident tech leads",
                "summary": "Paired with three mid‑level engineers over a year, letting them run design reviews while I stayed in the background. Each of them went on to lead a project end‑to‑end without needing me in the room.",
            },
        ],
    },
    {
        "email": "demo3@example.com",
        "display_name": "Carla Ruiz",
        "first_name": "Carla",
        "last_name": "Ruiz",
        "city": "Delhi",
        "current_company": "DataWorks",
        "role": "Data Scientist",
        "domain": "Data",
        "sub_domain": "ML",
        "experiences": [
            {
                "title": "Turning a messy spreadsheet habit into a recommendations model",
                "summary": "Started with messy analyst spreadsheets and a few strong hunches. Gradually turned that into a simple recommendation model that quietly lifted click‑through on a key surface without a big “AI” launch.",
            },
            {
                "title": "Teaching product managers how to ask better experiment questions",
                "summary": "Got tired of A/B tests with fuzzy goals. Ran short, hands‑on sessions with PMs on framing hypotheses and trade‑offs, which made experiment reviews more about learning and less about p‑values.",
            },
            {
                "title": "Building a dashboard people actually wanted to open",
                "summary": "Replaced a cluttered reporting dashboard with one clean, narrative view focused on three decisions leaders made every week. Adoption went from “only in QBRs” to something people checked unprompted.",
            },
        ],
    },
    {
        "email": "demo4@example.com",
        "display_name": "David Kim",
        "first_name": "David",
        "last_name": "Kim",
        "city": "Remote",
        "current_company": "RemoteLab",
        "role": "Full Stack Engineer",
        "domain": "Engineering",
        "sub_domain": "Full Stack",
        "experiences": [
            {
                "title": "Shipping a small feature that quietly became the default workflow",
                "summary": "Built a simple “save for later” flow during a slow sprint. Within a month it became the way most remote teams organized their work in RemoteLab, even though it never made it into a launch blog post.",
            },
            {
                "title": "Cleaning up a UI built by five different teams",
                "summary": "Spent evenings chipping away at inconsistent components and layout bugs. Introduced a shared design system and storybook that made new UI work faster and made the product feel like one app again.",
            },
            {
                "title": "Debugging a timezone bug that only happened once a year",
                "summary": "Tracked down a daylight‑savings bug that broke recurring stand‑ups for a subset of users. Learned more about timezones than I ever wanted, but it made remote teams’ Mondays much less confusing.",
            },
        ],
    },
    {
        "email": "demo5@example.com",
        "display_name": "Emily Zhang",
        "first_name": "Emily",
        "last_name": "Zhang",
        "city": "Singapore",
        "current_company": "FinEdge",
        "role": "Quant Researcher",
        "domain": "Finance",
        "sub_domain": "Quant",
        "experiences": [
            {
                "title": "Building a signal when most of the data was noise",
                "summary": "Worked with messy transactional and alternative data to find one robust signal that still held up after costs. It didn’t look flashy in a deck, but it met the bar when deployed to real capital.",
            },
            {
                "title": "Explaining risk to non‑quant teammates without jargon",
                "summary": "Translated VaR charts and drawdown curves into simple stories PMs and sales could repeat to clients. It changed how they talked about “bad weeks” with far less panic in the room.",
            },
        ],
    },
    {
        "email": "demo6@example.com",
        "display_name": "Farhan Ali",
        "first_name": "Farhan",
        "last_name": "Ali",
        "city": "Hyderabad",
        "current_company": "Searchly",
        "role": "Search Relevance Engineer",
        "domain": "Search",
        "sub_domain": "Relevance",
        "experiences": [
            {
                "title": "Fixing the search results nobody complained about out loud",
                "summary": "Noticed that long‑tail queries quietly performed badly even though no one filed tickets. Spent cycles improving ranking and synonyms there, which led to delighted feedback from power users.",
            },
            {
                "title": "Designing a simple way for non‑engineers to suggest synonyms",
                "summary": "Built a lightweight internal tool where support and sales could propose search synonyms. It turned one‑off complaints into a steady stream of quality signals for the relevance team.",
            },
            {
                "title": "Creating a habit around evaluating search quality, not just uptime",
                "summary": "Set up a recurring review where the team looked at real, anonymized queries together. It moved conversations from “Is search up?” to “Did we actually help this person find what they meant?”.",
            },
        ],
    },
    {
        "email": "demo7@example.com",
        "display_name": "Grace Lee",
        "first_name": "Grace",
        "last_name": "Lee",
        "city": "Pune",
        "current_company": "GrowthHub",
        "role": "Growth Marketer",
        "domain": "Marketing",
        "sub_domain": "Growth",
        "experiences": [
            {
                "title": "Running a tiny onboarding experiment that changed activation",
                "summary": "Tested a single sentence change and one extra nudge email in the first 48 hours. The numbers looked small in absolute terms, but the cohort curves told a very different, long‑term story.",
            },
            {
                "title": "Closing the loop between support tickets and lifecycle messaging",
                "summary": "Paired with support to tag common “I’m confused” moments, then wrote lifecycle messages to preempt them. Over time, those tickets dropped and new users felt less embarrassed about asking for help.",
            },
        ],
    },
    {
        "email": "demo8@example.com",
        "display_name": "Hassan Khan",
        "first_name": "Hassan",
        "last_name": "Khan",
        "city": "London",
        "current_company": "RetailX",
        "role": "Data Engineer",
        "domain": "Data",
        "sub_domain": "Analytics",
        "experiences": [
            {
                "title": "Replacing late‑night CSV uploads with a reliable pipeline",
                "summary": "Inherited a process where someone manually uploaded sales CSVs every night. Rebuilt it as a simple, observable pipeline so finance came in each morning trusting the numbers instead of double‑checking them.",
            },
            {
                "title": "Making the warehouse reflect how the business actually talks",
                "summary": "Worked with sales and operations to rename and regroup entities so dashboards matched the language people used in meetings. Adoption went up because people finally recognized what they were looking at.",
            },
        ],
    },
    {
        "email": "demo9@example.com",
        "display_name": "Isha Patel",
        "first_name": "Isha",
        "last_name": "Patel",
        "city": "New York",
        "current_company": "HealthPlus",
        "role": "Product Designer",
        "domain": "Design",
        "sub_domain": "UX",
        "experiences": [
            {
                "title": "Watching patients struggle through a checkout flow we thought was “simple”",
                "summary": "Sat in remote usability sessions where people tried to book appointments while juggling kids and work. The painful pauses led to a rebuilt flow that removed two steps and several small anxieties.",
            },
            {
                "title": "Pulling a scattered product into one coherent design system",
                "summary": "Worked with three different product teams to unify buttons, forms, and typography. It reduced design debates from taste‑based arguments to shared language and freed up time for deeper problems.",
            },
            {
                "title": "Designing with clinicians instead of just around them",
                "summary": "Co‑created flows with nurses and doctors who had five spare minutes between patients. Their reality checks kept the product useful in messy, real‑world hospital days instead of idealized flows.",
            },
        ],
    },
    {
        "email": "demo10@example.com",
        "display_name": "Jack Brown",
        "first_name": "Jack",
        "last_name": "Brown",
        "city": "Berlin",
        "current_company": "MobilityNow",
        "role": "Mobile Engineer",
        "domain": "Engineering",
        "sub_domain": "Mobile",
        "experiences": [
            {
                "title": "Chasing down a crash that only happened underground",
                "summary": "Investigated a crash that only surfaced when riders went into the subway. Spent days riding with logging builds until the offline edge case finally reproduced and could be fixed for good.",
            },
            {
                "title": "Making the app feel fast on older devices",
                "summary": "Profiled the rider app on mid‑range Android phones, trimmed unnecessary animations, and cached the right data. Riders in emerging markets noticed the difference even if they never saw a changelog.",
            },
        ],
    },
]


# Simple labels to make each experience for a person feel distinct.
EXPERIENCE_FOCUS_LABELS = [
    "Core product",
    "Growth experiments",
    "Internal tooling",
    "Data & analytics",
    "Customer onboarding",
]


def _child_items_for_type(
    child_type: str,
    role: str,
    company: str,
    title: str,
    summary: str,
) -> list[dict]:
    """
    Generate concrete, bullet-style child items that "rhyme" with the experience.
    Think in terms of what a person would actually say:
    - "used Python", "used Cursor"
    - "hit ₹X sales in Y months"
    - "talked to N customers", etc.
    """
    base = f"{title} at {company}"
    summary_text = summary or base

    if child_type == "tools":
        # Very concrete tools; keep them short so they read well as bullets.
        return [
            {
                "title": "Python",
                "description": f"Used Python to build and iterate on {title.lower()}.",
            },
            {
                "title": "Cursor",
                "description": "Used Cursor as an AI pair to explore ideas and clean up code faster.",
            },
        ]

    if child_type == "skills":
        return [
            {
                "title": "Listening deeply",
                "description": f"Listened to people’s real stories about {summary_text.lower()}.",
            },
            {
                "title": "Turning messy input into structure",
                "description": f"Took unstructured notes about {title.lower()} and turned them into a clearer plan.",
            },
        ]

    if child_type == "metrics":
        # Use one very concrete metric-style line so it feels like “got this much in this time”.
        return [
            {
                "title": "Outcome in real numbers",
                "description": "Helped unlock roughly ₹15 lakh in value over 2–3 months on this work.",
            },
            {
                "title": "Momentum over time",
                "description": "Saw key results improve steadily for a few quarters instead of a one‑off spike.",
            },
        ]

    if child_type == "achievements":
        return [
            {
                "title": "Shipped something people actually used",
                "description": f"Put a concrete piece of {role.lower()} work in front of real people and watched them use it.",
            },
            {
                "title": "Found the real problem behind the request",
                "description": f"Looked past the initial ask around {title.lower()} and solved the underlying issue instead.",
            },
        ]

    if child_type == "responsibilities":
        return [
            {
                "title": "Owning the messy middle",
                "description": f"Carried {title.lower()} from idea through the awkward in‑between stages to something shippable.",
            },
            {
                "title": "Keeping people in the loop",
                "description": "Regularly updated teammates and stakeholders so nobody was surprised by trade‑offs.",
            },
        ]

    if child_type == "collaborations":
        return [
            {
                "title": "Working across disciplines",
                "description": f"Teamed up with people outside my lane to make {title.lower()} actually land.",
            },
            {
                "title": "Closing the loop with stakeholders",
                "description": f"Shared back what we learned from {summary_text.lower()} with the people who trusted us.",
            },
        ]

    if child_type == "domain_knowledge":
        return [
            {
                "title": "Understanding the space",
                "description": f"Built a practical feel for the domain behind {title.lower()}, not just the tools.",
            },
            {
                "title": "Seeing common patterns",
                "description": "Started to recognize recurring shapes in problems instead of treating each one as brand‑new.",
            },
        ]

    if child_type == "exposure":
        return [
            {
                "title": "Different kinds of teams",
                "description": f"Got to see how {company} worked across senior leaders, peers, and newer teammates.",
            },
            {
                "title": "Real‑world constraints",
                "description": f"Saw how deadlines, budgets, and emotions shaped decisions around {title.lower()}.",
            },
        ]

    if child_type == "education":
        return [
            {
                "title": "Learning on the job",
                "description": f"Most of the learning for {title.lower()} came from trying things, not just reading about them.",
            }
        ]

    if child_type == "certifications":
        return [
            {
                "title": "Formal proof of some skills",
                "description": "Picked up a few structured courses and certificates to back up the hands‑on work.",
            }
        ]

    # Fallback: a single, coherent item tied to the experience.
    return [
        {
            "title": title,
            "description": summary_text,
        }
    ]


async def seed_demo_profiles() -> None:
    """Insert 10 demo people with profiles + 2-5 rich experience cards and all child dimensions."""
    async with async_session() as session:
        password_hash = hash_password("password123")

        for user in DEMO_USERS:
            existing = await session.execute(
                select(Person).where(Person.email == user["email"])
            )
            person = existing.scalar_one_or_none()
            if person:
                continue

            person = Person(
                email=user["email"],
                hashed_password=password_hash,
                display_name=user["display_name"],
            )
            session.add(person)
            await session.flush()

            profile = PersonProfile(
                person_id=person.id,
                first_name=user["first_name"],
                last_name=user["last_name"],
                current_city=user["city"],
                current_company=user["current_company"],
                open_to_work=True,
                open_to_contact=True,
                work_preferred_locations=[user["city"]],
            )
            session.add(profile)
            await session.flush()

            # Use predefined experiences when provided so titles and summaries are rich and distinct.
            # If none are provided, fall back to 2–4 synthetic experiences that still feel coherent.
            user_experiences = user.get("experiences") or []
            if not user_experiences:
                experience_count = random.randint(2, 4)
                user_experiences = [
                    {
                        "title": f"{user['role']} – {EXPERIENCE_FOCUS_LABELS[idx % len(EXPERIENCE_FOCUS_LABELS)]}",
                        "summary": (
                            f"{user['role']} focusing on "
                            f"{EXPERIENCE_FOCUS_LABELS[idx % len(EXPERIENCE_FOCUS_LABELS)].lower()} "
                            f"at {user['current_company']}."
                        ),
                    }
                    for idx in range(experience_count)
                ]
            else:
                experience_count = len(user_experiences)

            for idx, exp in enumerate(user_experiences):
                title = exp["title"]
                summary = exp["summary"]
                start_year = 2016 + idx
                card = ExperienceCard(
                    person_id=person.id,
                    title=title,
                    normalized_role=user["role"],
                    domain=user["domain"],
                    domain_norm=user["domain"].lower(),
                    sub_domain=user["sub_domain"],
                    sub_domain_norm=user["sub_domain"].lower(),
                    company_name=user["current_company"],
                    company_norm=user["current_company"].lower(),
                    city=user["city"],
                    is_current=(idx == experience_count - 1),
                    summary=summary,
                    experience_card_visibility=True,
                    start_date=date(start_year, 1, 1),
                )
                session.add(card)
                await session.flush()

                # All child dimensions for this specific experience.
                # To avoid robotic, identical cards, only attach a handful of
                # child dimensions per experience and vary which ones appear.
                all_child_types = list(ALLOWED_CHILD_TYPES)
                random.shuffle(all_child_types)
                child_types_for_card = all_child_types[: random.randint(3, min(6, len(all_child_types)))]

                for child_type in child_types_for_card:
                    items = _child_items_for_type(
                        child_type,
                        user["role"],
                        user["current_company"],
                        title,
                        summary,
                    )
                    if not items:
                        continue
                    child_value = {
                        "raw_text": f"{child_type.replace('_', ' ').title()} for {title} at {user['current_company']}.",
                        "items": items,
                    }
                    child = ExperienceCardChild(
                        parent_experience_id=card.id,
                        person_id=person.id,
                        child_type=child_type,
                        value=child_value,
                        confidence_score=None,
                        embedding=None,
                        extra=None,
                    )
                    session.add(child)

        await session.commit()


if __name__ == "__main__":
    asyncio.run(seed_demo_profiles())
