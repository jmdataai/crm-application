"""
llm_utils.py — LLM helpers for resume intelligence and JD keyword extraction.

Only TWO public functions are needed:
  extract_resume_insights(text)  → called once per resume upload
  extract_jd_keywords(jd_text)   → called once per ATS search

ATS scoring itself is done in pure Python (tech_stack overlap) — zero per-candidate
LLM calls, so free-tier limits are never hit during a search.

PROVIDER PRIORITY  (set LLM_PROVIDER env var to override):
  1. gemini   — google-generativeai   gemini-1.5-flash   FREE: 1M TPM, 1500 req/day
  2. openai   — openai                gpt-4o-mini        ~$0 credit only
  3. anthropic— anthropic             claude-haiku       limited free

ENV VARS:
  LLM_PROVIDER          = "gemini" | "openai" | "anthropic"   (default: gemini)
  GOOGLE_API_KEY        = AIza...
  OPENAI_API_KEY        = sk-...
  ANTHROPIC_API_KEY     = sk-ant-...
  LLM_MODEL_GEMINI      = gemini-2.0-flash-lite (optional override)
  LLM_MODEL_OPENAI      = gpt-4o-mini          (optional override)
  LLM_MODEL_ANTHROPIC   = claude-haiku-4-5-20251001  (optional override)
"""

import os
import json
import logging
import asyncio
from typing import Any

logger = logging.getLogger(__name__)

# ── Defaults ──────────────────────────────────────────────────
DEFAULT_GEMINI_MODEL    = "gemini-2.0-flash-lite"
DEFAULT_OPENAI_MODEL    = "gpt-4o-mini"
DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001"


def _provider() -> str:
    return os.environ.get("LLM_PROVIDER", "gemini").lower().strip()


def _parse_json_response(raw: str) -> Any:
    """Strip markdown fences and parse JSON reliably."""
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    return json.loads(text.strip())


# ════════════════════════════════════════════════════════════════
# PROMPT TEMPLATES
# ════════════════════════════════════════════════════════════════

_RESUME_INSIGHTS_PROMPT = """\
You are an expert ATS parser used by a technical staffing firm. \
Your sole job is to extract a structured tech profile from a raw resume. \
Precision and normalisation are more important than completeness.

## EXTRACT TWO FIELDS

### 1. tech_stack  (array of strings)
Include ONLY tools the candidate has directly used in a professional or \
meaningful project context:
  - Languages      : Python, Java, TypeScript, Go, Rust, C++, Ruby, PHP, Swift, Kotlin…
  - Frameworks     : React, Angular, Vue, Django, FastAPI, Flask, Spring Boot, \
Laravel, Rails, Next.js, Express…
  - Databases      : PostgreSQL, MySQL, MongoDB, Redis, Cassandra, DynamoDB, \
Snowflake, BigQuery, Elasticsearch…
  - Cloud & Infra  : AWS, GCP, Azure, Docker, Kubernetes, Terraform, Ansible, \
GitHub Actions, Jenkins, Helm…
  - Data / ML      : Pandas, NumPy, Spark, Airflow, dbt, Kafka, Scikit-learn, \
PyTorch, TensorFlow, Hugging Face…
  - Protocols      : REST, GraphQL, gRPC, WebSockets — only if explicitly mentioned

NORMALISATION RULES (apply every time, no exceptions):
  "JS" or "Javascript"       → "JavaScript"
  "TS" or "Typescript"       → "TypeScript"
  "Postgres" / "PG" / "psql" → "PostgreSQL"
  "k8s"                      → "Kubernetes"
  "Node" / "NodeJS"          → "Node.js"
  "React.js" / "ReactJS"     → "React"
  "Next" / "NextJS"          → "Next.js"
  "TF"                       → "TensorFlow"
  "GH Actions"               → "GitHub Actions"
  Always use Title Case for multi-word names: "Spring Boot", "GitHub Actions"

STRICT EXCLUSIONS — never include these even if mentioned:
  ✗ Soft skills      : "leadership", "communication", "problem-solving", \
"teamwork", "attention to detail"
  ✗ Methodologies   : "Agile", "Scrum", "Kanban", "SAFe", "Waterfall" \
(unless the role is specifically Scrum Master / Coach)
  ✗ Company names    : "Google", "Amazon", "Microsoft", "Infosys", "TCS"
  ✗ University names : "MIT", "IIT", "Stanford"
  ✗ Job titles       : "Software Engineer", "Tech Lead", "Architect"
  ✗ Generic tools    : "Git", "GitHub", "Jira", "Confluence", "Slack", \
"VS Code", "IntelliJ" — too universal to be differentiating
  ✗ Office tools     : "MS Office", "Excel", "PowerPoint", "G Suite"
  ✗ Operating systems: "Linux", "Windows", "macOS" — unless the role is \
specifically systems/infra

LIMITS: Maximum 35 items. If more exist, prefer specific/rare skills over generic ones.

### 2. experience_years  (integer or null)
  - Sum all full-time professional roles (including contract, freelance)
  - Exclude: internships < 6 months, part-time < 20 hrs/week, academic projects
  - For overlapping roles (e.g. side consulting while employed), count only once
  - For career gaps, do NOT subtract the gap — just count total months worked
  - Round DOWN to nearest whole year (e.g. 6.8 years → 6)
  - If dates are completely absent or unreadable, return null

## FEW-SHOT EXAMPLE

Resume snippet:
  "Software Engineer @ Stripe (2019–2022): Built payment APIs in Python/Django,
   PostgreSQL, Redis. Deployed on AWS EKS with Terraform and GitHub Actions.
   Senior Engineer @ Razorpay (2022–2024): Led React + TypeScript frontend,
   Node.js BFF, GraphQL layer. Familiar with Agile, great team player."

Correct output:
{
  "tech_stack": ["Python", "Django", "PostgreSQL", "Redis", "AWS", "Kubernetes",
                 "Terraform", "GitHub Actions", "React", "TypeScript", "Node.js",
                 "GraphQL"],
  "experience_years": 5
}

Wrong output (do NOT do this):
{
  "tech_stack": ["Python", "Django", "PostgreSQL", "Redis", "AWS", "EKS",
                 "Terraform", "GitHub Actions", "React", "TypeScript", "Node.js",
                 "GraphQL", "Agile", "Stripe", "Razorpay", "Git"],
  "experience_years": "5 years"
}
Errors in wrong output: included "EKS" (use "Kubernetes"), company names "Stripe"/"Razorpay",
"Agile" (methodology), "Git" (universal tool), experience as string not integer.

## OUTPUT FORMAT
Return ONLY a valid JSON object. No explanation, no markdown fences, no extra keys:
{
  "tech_stack": ["Skill1", "Skill2", ...],
  "experience_years": <integer or null>
}

SELF-CHECK before responding:
  ✓ Are all skill names normalised to canonical form?
  ✓ Does the array contain zero soft skills, company names, or methodologies?
  ✓ Is experience_years an integer (or null), never a string?
  ✓ Is the output pure JSON with no extra text?

## RESUME TEXT
---
{resume_text}
---"""


_JD_KEYWORDS_PROMPT = """\
You are an expert technical recruiter building a candidate-matching pipeline. \
Your task is to parse a job description into structured fields that will be \
used to find matching candidates by comparing against their stored tech_stack arrays. \
Skill normalisation is critical — a mismatch in naming means a candidate is missed.

## EXTRACT FIVE FIELDS

### 1. required_skills  (array of strings)
Include a skill ONLY if the JD uses language like:
  "must have", "required", "you will need", "essential", "proficiency in",
  "strong experience with", "X+ years of [skill]", or names the skill in the
  primary responsibilities without qualification.

Also include skills that are DIRECTLY AND OBVIOUSLY implied by an explicit requirement:
  "Django developer" → include "Python" (Django is Python-only)
  "Spring Boot role" → include "Java"
  "React frontend"  → include "JavaScript" (or "TypeScript" if TS is mentioned)
  Do NOT speculatively infer beyond one level (e.g. "Python" does NOT imply "Linux")

Normalise identically to the resume parser:
  "Node" → "Node.js", "Postgres" → "PostgreSQL", "k8s" → "Kubernetes",
  "JS" → "JavaScript", "TS" → "TypeScript", "React.js" → "React"

### 2. nice_to_have_skills  (array of strings)
Include ONLY skills the JD marks as:
  "nice to have", "preferred", "a plus", "bonus", "advantageous",
  "familiarity with", "exposure to", "knowledge of [X] is a plus"

  Rule: if ambiguous ("experience with X helpful"), put in nice_to_have, NOT required.
  Apply same normalisation as above.

### 3. experience_years_min  (integer or null)
  - Explicit range "5–8 years" → use lower bound → 5
  - "5+ years" → 5
  - "senior-level" with no number → null (do not guess)
  - If no experience requirement stated → null

### 4. role_type  (string — pick exactly one)
Choose the SINGLE best fit:
  "Frontend Engineer" | "Backend Engineer" | "Full-Stack Engineer" |
  "Mobile Engineer" | "DevOps Engineer" | "Data Engineer" |
  "ML Engineer" | "QA Engineer" | "Data Analyst" |
  "Solutions Architect" | "Security Engineer" |
  "Product Manager" | "Other"

### 5. domain  (string — pick exactly one)
  "FinTech" | "HealthTech" | "E-Commerce" | "EdTech" | "SaaS" |
  "Enterprise" | "Logistics" | "Gaming" | "General"
  Use "General" when domain is not clearly stated.

## FEW-SHOT EXAMPLE

JD snippet:
  "We are hiring a Senior Backend Engineer (5+ years). Must have Python and
   Django with PostgreSQL. Redis caching experience required. Docker and
   Kubernetes in our stack. Nice to have: Celery, AWS, GraphQL knowledge is a plus.
   We use Agile/Scrum. Join our FinTech startup."

Correct output:
{
  "required_skills": ["Python", "Django", "PostgreSQL", "Redis", "Docker", "Kubernetes"],
  "nice_to_have_skills": ["Celery", "AWS", "GraphQL"],
  "experience_years_min": 5,
  "role_type": "Backend Engineer",
  "domain": "FinTech"
}

Wrong output (do NOT do this):
{
  "required_skills": ["Python", "Django", "PostgreSQL", "Redis", "Docker",
                      "Kubernetes", "Agile", "Scrum", "Celery", "AWS"],
  "nice_to_have_skills": [],
  "experience_years_min": 5,
  "role_type": "Backend Engineer",
  "domain": "FinTech"
}
Errors: "Agile"/"Scrum" are methodologies (exclude entirely), "Celery"/"AWS" are
nice-to-have (moved to wrong field).

## OUTPUT FORMAT
Return ONLY a valid JSON object. No explanation, no markdown, no extra keys:
{
  "required_skills": ["Skill1", "Skill2", ...],
  "nice_to_have_skills": ["Skill1", ...],
  "experience_years_min": <integer or null>,
  "role_type": "<string>",
  "domain": "<string>"
}

SELF-CHECK before responding:
  ✓ Are skills in required_skills truly required (not just preferred)?
  ✓ Are methodologies (Agile, Scrum, SAFe) excluded from both arrays?
  ✓ Are all skill names normalised to canonical form?
  ✓ Is experience_years_min an integer or null, never a string?
  ✓ Is the output pure JSON with no extra text?

## JOB DESCRIPTION
---
{jd_text}
---"""


# ════════════════════════════════════════════════════════════════
# LLM CALLERS
# ════════════════════════════════════════════════════════════════

_SYSTEM_JSON = (
    "You are a precise JSON-outputting assistant. "
    "Return ONLY valid JSON with no markdown, prose, or explanation."
)


def _call_gemini(full_prompt: str) -> str:
    import google.generativeai as genai  # lazy import
    genai.configure(api_key=os.environ["GOOGLE_API_KEY"])
    model_name = os.environ.get("LLM_MODEL_GEMINI", DEFAULT_GEMINI_MODEL)
    model = genai.GenerativeModel(
        model_name=model_name,
        system_instruction=_SYSTEM_JSON,
    )
    resp = model.generate_content(full_prompt)
    return resp.text


def _call_openai(full_prompt: str) -> str:
    from openai import OpenAI  # lazy import
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    model  = os.environ.get("LLM_MODEL_OPENAI", DEFAULT_OPENAI_MODEL)
    resp = client.chat.completions.create(
        model=model,
        max_tokens=1024,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": _SYSTEM_JSON},
            {"role": "user",   "content": full_prompt},
        ],
    )
    return resp.choices[0].message.content


def _call_anthropic(full_prompt: str) -> str:
    import anthropic  # lazy import
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    model  = os.environ.get("LLM_MODEL_ANTHROPIC", DEFAULT_ANTHROPIC_MODEL)
    msg = client.messages.create(
        model=model,
        max_tokens=1024,
        system=_SYSTEM_JSON,
        messages=[{"role": "user", "content": full_prompt}],
    )
    return msg.content[0].text


def _call_llm(full_prompt: str) -> str:
    provider = _provider()
    if provider == "openai":
        return _call_openai(full_prompt)
    elif provider == "anthropic":
        return _call_anthropic(full_prompt)
    else:
        return _call_gemini(full_prompt)


# ════════════════════════════════════════════════════════════════
# PUBLIC API
# ════════════════════════════════════════════════════════════════

async def extract_resume_insights(resume_text: str) -> dict:
    """
    Extract tech_stack (list[str]) and experience_years (int | None)
    from raw resume text. Called ONCE per resume upload.

    Returns: {"tech_stack": [...], "experience_years": int | None}
    """
    if not resume_text or not resume_text.strip():
        return {"tech_stack": [], "experience_years": None}

    prompt = _RESUME_INSIGHTS_PROMPT.replace("{resume_text}", resume_text[:12000])

    try:
        loop   = asyncio.get_running_loop()
        raw    = await loop.run_in_executor(None, _call_llm, prompt)
        result = _parse_json_response(raw)

        tech = result.get("tech_stack") or []
        exp  = result.get("experience_years")

        tech = [str(s).strip() for s in tech if isinstance(s, (str, int)) and str(s).strip()][:35]
        if exp is not None:
            try:
                exp = int(float(str(exp)))
                if exp < 0 or exp > 60:
                    exp = None
            except (ValueError, TypeError):
                exp = None

        logger.info(f"[LLM] Resume insights — {len(tech)} skills, {exp} yrs exp")
        return {"tech_stack": tech, "experience_years": exp}

    except Exception as exc:
        logger.warning(f"[LLM] extract_resume_insights failed: {exc}")
        return {"tech_stack": [], "experience_years": None}


async def extract_jd_keywords(jd_text: str) -> dict:
    """
    Parse a job description into structured requirements. Called ONCE per ATS search.

    Returns:
    {
      "required_skills": [...],
      "nice_to_have_skills": [...],
      "experience_years_min": int | None,
      "role_type": str,
      "domain": str
    }
    """
    prompt = _JD_KEYWORDS_PROMPT.replace("{jd_text}", jd_text[:8000])

    try:
        loop   = asyncio.get_running_loop()
        raw    = await loop.run_in_executor(None, _call_llm, prompt)
        result = _parse_json_response(raw)

        req  = [str(s).strip() for s in (result.get("required_skills")     or []) if str(s).strip()]
        nice = [str(s).strip() for s in (result.get("nice_to_have_skills") or []) if str(s).strip()]
        exp  = result.get("experience_years_min")
        if exp is not None:
            try:   exp = int(float(str(exp)))
            except: exp = None

        return {
            "required_skills":      req,
            "nice_to_have_skills":  nice,
            "experience_years_min": exp,
            "role_type":            str(result.get("role_type") or "Other"),
            "domain":               str(result.get("domain")    or "General"),
        }
    except Exception as exc:
        logger.warning(f"[LLM] extract_jd_keywords failed: {exc}")
        return {
            "required_skills": [], "nice_to_have_skills": [],
            "experience_years_min": None, "role_type": "Other", "domain": "General",
        }
