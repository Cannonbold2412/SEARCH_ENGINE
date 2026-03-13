
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
                "title": "Senior Product Manager – Core product",
                "summary": "Led the core product experience for Acme Corp, defining roadmap and aligning engineering, design, and GTM teams.",
            },
            {
                "title": "Senior Product Manager – Growth experiments",
                "summary": "Designed and ran growth experiments across onboarding and pricing, improving trial-to-paid conversion significantly.",
            },
            {
                "title": "Senior Product Manager – Customer insights",
                "summary": "Built a continuous discovery program with weekly customer interviews and structured research synthesis.",
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
                "title": "Staff Engineer – Distributed systems",
                "summary": "Owned design and rollout of a new distributed job processing platform handling billions of events per day.",
            },
            {
                "title": "Staff Engineer – Reliability",
                "summary": "Led incident reviews and reliability initiatives that reduced P1 outages and improved on-call health.",
            },
            {
                "title": "Staff Engineer – Mentorship",
                "summary": "Mentored a team of backend engineers, introducing design reviews and pairing sessions.",
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
                "title": "Data Scientist – Recommendation systems",
                "summary": "Built and shipped recommendation models that improved click-through rate for key surfaces.",
            },
            {
                "title": "Data Scientist – Experimentation",
                "summary": "Supported A/B testing strategy, designing experiments and interpreting results for cross-functional teams.",
            },
            {
                "title": "Data Scientist – Analytics",
                "summary": "Delivered dashboards and deep-dive analyses that shaped product and marketing strategy.",
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
                "title": "Full Stack Engineer – Web platform",
                "summary": "Implemented end-to-end features across frontend and backend for RemoteLab’s core collaboration product.",
            },
            {
                "title": "Full Stack Engineer – Design systems",
                "summary": "Introduced a shared component library and design system, speeding up UI delivery and improving consistency.",
            },
            {
                "title": "Full Stack Engineer – Performance",
                "summary": "Profiled and optimized bottlenecks, cutting page load times and improving perceived performance.",
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
                "title": "Quant Researcher – Trading signals",
                "summary": "Researched and backtested trading signals using large financial and alternative datasets.",
            },
            {
                "title": "Quant Researcher – Risk models",
                "summary": "Developed risk models to better understand drawdowns and exposure across strategies.",
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
                "title": "Search Engineer – Ranking",
                "summary": "Improved ranking quality for core search by tuning features and relevance models.",
            },
            {
                "title": "Search Engineer – Query understanding",
                "summary": "Worked on query understanding and synonyms to boost recall for long-tail queries.",
            },
            {
                "title": "Search Engineer – Evaluation",
                "summary": "Designed offline and online evaluation frameworks for tracking search quality over time.",
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
                "title": "Growth Marketer – Acquisition",
                "summary": "Planned and executed campaigns across paid and organic channels to acquire new users efficiently.",
            },
            {
                "title": "Growth Marketer – Lifecycle",
                "summary": "Owned lifecycle programs (email, in-product) to activate, retain, and resurrect users.",
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
                "title": "Data Engineer – Analytics platform",
                "summary": "Designed and maintained pipelines powering BI dashboards for RetailX’s business teams.",
            },
            {
                "title": "Data Engineer – Warehousing",
                "summary": "Modeled core entities and built a modern data warehouse on cloud infrastructure.",
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
                "title": "Product Designer – Patient app",
                "summary": "Redesigned the HealthPlus patient app to simplify key journeys and improve accessibility.",
            },
            {
                "title": "Product Designer – Design system",
                "summary": "Created a design system and component library to unify visual style across products.",
            },
            {
                "title": "Product Designer – Research",
                "summary": "Partnered with research to run usability studies and translate findings into product changes.",
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
                "title": "Mobile Engineer – Rider app",
                "summary": "Shipped features and performance improvements for MobilityNow’s rider app on iOS and Android.",
            },
            {
                "title": "Mobile Engineer – Offline experience",
                "summary": "Improved offline behavior and reliability for riders in low-connectivity environments.",
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
    Generate child items that clearly connect back to the specific experience
    (title + summary) instead of using generic, jumbled labels.
    """
    base = f"{title} at {company}"
    # Always ensure we have some summary text to ground the child items.
    summary_text = summary or base

    if child_type == "skills":
        return [
            {
                "title": f"Skills from {title}",
                "description": f"Key skills demonstrated while working on {summary_text}",
            }
        ]
    if child_type == "tools":
        return [
            {
                "title": f"Tools used at {company}",
                "description": f"Important tools and systems used for {title}.",
            }
        ]
    if child_type == "metrics":
        return [
            {
                "title": f"Impact of {title}",
                "description": f"High-level outcomes and impact: {summary_text}",
            }
        ]
    if child_type == "achievements":
        return [
            {
                "title": f"Highlights from {title}",
                "description": f"Notable achievements and moments: {summary_text}",
            }
        ]
    if child_type == "responsibilities":
        return [
            {
                "title": "Key responsibilities",
                "description": f"Core responsibilities while working as {role} on {title}.",
            }
        ]
    if child_type == "collaborations":
        return [
            {
                "title": "Collaborations",
                "description": f"How this work connected with other teams and people at {company}.",
            }
        ]
    if child_type == "domain_knowledge":
        return [
            {
                "title": "Domain knowledge",
                "description": f"Domain understanding built through {summary_text}",
            }
        ]
    if child_type == "exposure":
        return [
            {
                "title": "Exposure",
                "description": f"Types of environments, customers, or problems exposed to in {title}.",
            }
        ]
    if child_type == "education":
        return [
            {
                "title": "Related education",
                "description": f"Educational context that supports the work in {title}.",
            }
        ]
    if child_type == "certifications":
        return [
            {
                "title": "Related certifications",
                "description": f"Certifications that strengthen the experience in {title}.",
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
            # If none are provided, fall back to 2–4 synthetic experiences.
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

                # All child dimensions for this specific experience
                for child_type in ALLOWED_CHILD_TYPES:
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
                        raw_experience_id=None,
                        draft_set_id=None,
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
