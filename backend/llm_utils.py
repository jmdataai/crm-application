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
  LLM_MODEL_GEMINI      = gemini-1.5-flash     (optional override)
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
DEFAULT_GEMINI_MODEL    = "gemini-1.5-flash"
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
You are a Principal Technical Recruiter and ATS Architect with 20+ years of \
experience at elite staffing firms. Your job is to perform deep structured \
extraction from raw resume text.

## TASK
Analyse the resume text below and extract TWO things with maximum precision:

1. **tech_stack** — every technical skill the candidate demonstrably has:
   - Programming languages (e.g. Python, Java, TypeScript)
   - Frameworks & libraries (e.g. React, FastAPI, Spring Boot, TensorFlow)
   - Databases (e.g. PostgreSQL, MongoDB, Redis, Snowflake)
   - Cloud & DevOps (e.g. AWS, GCP, Docker, Kubernetes, Terraform, GitHub Actions)
   - Data & ML tools (e.g. Pandas, Spark, Airflow, dbt, Scikit-learn)
   - Protocols & paradigms only if explicitly listed (e.g. REST, GraphQL, gRPC)

   Normalisation rules (CRITICAL):
   - Canonical names: "JS" → "JavaScript", "TS" → "TypeScript",
     "Postgres"/"PG" → "PostgreSQL", "k8s" → "Kubernetes", "Node" → "Node.js"
   - Deduplicate: list each skill exactly once
   - Exclude: soft skills, company names, university names, job titles
   - Maximum 35 items; keep the most specific/rare ones

2. **experience_years** — total years of professional work experience:
   - Count from earliest professional role to most recent
   - Exclude internships under 6 months and academic projects
   - Return an INTEGER (e.g. 7, not "7 years" or "7+")
   - If genuinely impossible to determine, return null

## OUTPUT FORMAT
Return ONLY valid JSON — no prose, no markdown fences, no explanation:
{
  "tech_stack": ["Skill1", "Skill2", ...],
  "experience_years": <integer or null>
}

## RESUME TEXT
---
{resume_text}
---"""


_JD_KEYWORDS_PROMPT = """\
You are a Senior Technical Talent Acquisition Specialist who has parsed \
thousands of job descriptions to build precision candidate-matching pipelines.

## TASK
Analyse the job description below and extract structured requirements for \
candidate pre-screening. Your output will be used to filter a candidate \
database by tech_stack column overlap — so skill normalisation is critical.

Extract:
1. **required_skills** — technologies/tools explicitly required or strongly implied
   (normalise names: "Node" → "Node.js", "Postgres" → "PostgreSQL", etc.)
2. **nice_to_have_skills** — explicitly mentioned as preferred/bonus/plus
3. **experience_years_min** — minimum years stated (integer; range "5-8 yrs" → 5; \
   if none stated → null)
4. **role_type** — one of: "Backend Engineer", "Full-Stack Engineer", \
   "Data Engineer", "DevOps Engineer", "ML Engineer", "Frontend Engineer", \
   "Mobile Engineer", "QA Engineer", "Product Manager", "Data Analyst", "Other"
5. **domain** — "FinTech", "HealthTech", "E-Commerce", "SaaS", "Enterprise", \
   "General" — use "General" if unclear

## OUTPUT FORMAT
Return ONLY valid JSON — no prose, no markdown, no explanation:
{
  "required_skills": ["Skill1", "Skill2", ...],
  "nice_to_have_skills": ["Skill1", ...],
  "experience_years_min": <integer or null>,
  "role_type": "<string>",
  "domain": "<string>"
}

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
