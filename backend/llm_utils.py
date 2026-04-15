"""
llm_utils.py — Expert LLM prompts for resume intelligence and ATS scoring.

Supports both Anthropic (Claude) and OpenAI via LLM_PROVIDER env var.

ENV VARS:
  LLM_PROVIDER          = "anthropic" | "openai"   (default: anthropic)
  ANTHROPIC_API_KEY     = sk-ant-...
  OPENAI_API_KEY        = sk-...
  LLM_MODEL_ANTHROPIC   = claude-haiku-4-5-20251001  (optional override)
  LLM_MODEL_OPENAI      = gpt-4o-mini               (optional override)
"""

import os
import json
import logging
import asyncio
from typing import Any

logger = logging.getLogger(__name__)

# ── Defaults ──────────────────────────────────────────────────
DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001"
DEFAULT_OPENAI_MODEL    = "gpt-4o-mini"


def _provider() -> str:
    return os.environ.get("LLM_PROVIDER", "anthropic").lower().strip()


def _parse_json_response(raw: str) -> Any:
    """Strip markdown fences and parse JSON reliably."""
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        # drop first line (```json or ```) and last line (```)
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    return json.loads(text.strip())


# ════════════════════════════════════════════════════════════════
# PROMPT TEMPLATES  (expert-crafted, role-specific, output-strict)
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
   - Methodologies only if explicitly stated (e.g. Agile, Scrum, SAFe)

   Normalisation rules (CRITICAL):
   - Use canonical names: "JS" → "JavaScript", "TS" → "TypeScript",
     "Postgres"/"PG" → "PostgreSQL", "k8s" → "Kubernetes",
     "GCP" stays "GCP", "AWS" stays "AWS", "Node" → "Node.js"
   - Deduplicate: list each skill exactly once
   - Exclude: soft skills, company names, university names, job titles,
     generic phrases like "problem solving" or "leadership"
   - Maximum 35 items; if more exist, keep the most specific/rare ones

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
database before detailed ATS scoring.

Extract:
1. **required_skills** — technologies/tools explicitly required or strongly implied
   (normalise names identically to a resume parser would: "Node" → "Node.js", etc.)
2. **nice_to_have_skills** — explicitly mentioned as preferred/bonus/plus
3. **experience_years_min** — minimum years stated or strongly implied (integer; \
   if a range like "5-8 years" is given, use the lower bound; if none stated, \
   return null)
4. **role_type** — single concise label for the role category, e.g.:
   "Backend Engineer", "Full-Stack Engineer", "Data Engineer", "DevOps Engineer",
   "ML Engineer", "Frontend Engineer", "Mobile Engineer", "QA Engineer",
   "Product Manager", "Data Analyst", "Other"
5. **domain** — business domain if discernible (e.g. "FinTech", "HealthTech",
   "E-Commerce", "SaaS", "Enterprise", "General") — use "General" if unclear

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


_ATS_SCORE_PROMPT = """\
You are an elite ATS (Applicant Tracking System) engine used by a top-tier \
technical staffing firm. Your scoring is authoritative, objective, and \
calibrated to real-world hiring bar standards.

## SCORING RUBRIC (total: 100 points)

| Dimension               | Weight | What to assess |
|-------------------------|--------|----------------|
| Technical Skill Match   |  40 pts| % overlap of candidate's tech_stack with required + nice-to-have skills; \
depth matters (listed once vs. demonstrated in multiple roles) |
| Experience Relevance    |  25 pts| Years of experience vs. minimum required; recency; domain match |
| Role Alignment          |  20 pts| Does the candidate's job history map to the role_type? |
| Location / Availability |  15 pts| Location match, visa status, relocation willingness if stated |

## CALIBRATION GUIDE
- 90-100: Near-perfect fit; strong recommend to hiring manager
- 75-89:  Solid match; worth a phone screen
- 60-74:  Partial match; skill gaps are bridgeable
- 40-59:  Stretch candidate; significant gaps
- 0-39:   Poor fit; missing critical requirements

## INPUT

### Job Description
{jd_text}

### Candidate Profile
- Name: {name}
- Title / Role: {role}
- Total Experience: {experience_years} years
- Tech Stack: {tech_stack}
- Location: {location}
- Visa Status: {visa_status}
- Candidate Type: {candidate_type}

### Pre-extracted JD Requirements
- Required Skills: {required_skills}
- Nice-to-have Skills: {nice_to_have_skills}
- Min Experience Required: {experience_years_min} years
- Role Type: {role_type}

## OUTPUT FORMAT
Return ONLY valid JSON — no prose, no markdown, no explanation:
{
  "ats_score": <integer 0-100>,
  "matched_skills": ["skill1", "skill2", ...],
  "missing_skills": ["skill1", "skill2", ...],
  "fit_summary": "<1-2 sentence objective summary of candidate fit>"
}"""


# ════════════════════════════════════════════════════════════════
# LLM CALLERS
# ════════════════════════════════════════════════════════════════

def _call_anthropic(system_prompt: str, user_content: str) -> str:
    import anthropic  # lazy import — only needed if provider = anthropic
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    model  = os.environ.get("LLM_MODEL_ANTHROPIC", DEFAULT_ANTHROPIC_MODEL)
    msg = client.messages.create(
        model=model,
        max_tokens=1024,
        system=system_prompt,
        messages=[{"role": "user", "content": user_content}],
    )
    return msg.content[0].text


def _call_openai(system_prompt: str, user_content: str) -> str:
    from openai import OpenAI  # lazy import
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    model  = os.environ.get("LLM_MODEL_OPENAI", DEFAULT_OPENAI_MODEL)
    resp = client.chat.completions.create(
        model=model,
        max_tokens=1024,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_content},
        ],
    )
    return resp.choices[0].message.content


def _call_llm(full_prompt: str) -> str:
    """
    Route to the configured provider.
    The prompt is self-contained (no separate system message needed for OpenAI
    json_object mode — system msg handles schema instruction).
    For Anthropic we split on the first blank line after the rubric header
    so the system prompt carries the instructions and user carries the data.
    """
    # For simplicity, send everything as user content; both providers handle it.
    provider = _provider()
    # Use a short universal system message to enforce JSON output
    system = (
        "You are a precise JSON-outputting assistant. "
        "Return ONLY valid JSON with no markdown, prose, or explanation."
    )
    if provider == "openai":
        return _call_openai(system, full_prompt)
    else:
        return _call_anthropic(system, full_prompt)


# ════════════════════════════════════════════════════════════════
# PUBLIC API
# ════════════════════════════════════════════════════════════════

async def extract_resume_insights(resume_text: str) -> dict:
    """
    Extract tech_stack (list[str]) and experience_years (int | None)
    from raw resume text using an expert LLM prompt.

    Returns: {"tech_stack": [...], "experience_years": int | None}
    Falls back to empty result on any LLM/parse failure.
    """
    if not resume_text or not resume_text.strip():
        return {"tech_stack": [], "experience_years": None}

    prompt = _RESUME_INSIGHTS_PROMPT.replace("{resume_text}", resume_text[:12000])

    try:
        loop   = asyncio.get_running_loop()
        raw    = await loop.run_in_executor(None, _call_llm, prompt)
        result = _parse_json_response(raw)

        tech   = result.get("tech_stack") or []
        exp    = result.get("experience_years")

        # Sanitise
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
    Parse a job description into structured requirements for candidate filtering.

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

        req   = [str(s).strip() for s in (result.get("required_skills") or []) if str(s).strip()]
        nice  = [str(s).strip() for s in (result.get("nice_to_have_skills") or []) if str(s).strip()]
        exp   = result.get("experience_years_min")
        if exp is not None:
            try:   exp = int(float(str(exp)))
            except: exp = None

        return {
            "required_skills":      req,
            "nice_to_have_skills":  nice,
            "experience_years_min": exp,
            "role_type":            str(result.get("role_type") or "Other"),
            "domain":               str(result.get("domain") or "General"),
        }
    except Exception as exc:
        logger.warning(f"[LLM] extract_jd_keywords failed: {exc}")
        return {
            "required_skills": [], "nice_to_have_skills": [],
            "experience_years_min": None, "role_type": "Other", "domain": "General",
        }


async def score_candidate_vs_jd(candidate: dict, jd_text: str, jd_meta: dict) -> dict:
    """
    Score a single candidate against a parsed job description.

    candidate dict keys used: full_name, candidate_role, experience_years,
                               tech_stack, location, visa_status, candidate_type
    jd_meta: output of extract_jd_keywords()

    Returns:
    {
      "ats_score": int,
      "matched_skills": [...],
      "missing_skills": [...],
      "fit_summary": str
    }
    """
    tech_str  = ", ".join(candidate.get("tech_stack") or []) or "Not specified"
    req_str   = ", ".join(jd_meta.get("required_skills") or []) or "Not specified"
    nice_str  = ", ".join(jd_meta.get("nice_to_have_skills") or []) or "None"
    exp_min   = jd_meta.get("experience_years_min")

    prompt = (
        _ATS_SCORE_PROMPT
        .replace("{jd_text}",            jd_text[:6000])
        .replace("{name}",               str(candidate.get("full_name") or "Unknown"))
        .replace("{role}",               str(candidate.get("candidate_role") or "Not specified"))
        .replace("{experience_years}",   str(candidate.get("experience_years") or "Unknown"))
        .replace("{tech_stack}",         tech_str)
        .replace("{location}",           str(candidate.get("location") or "Not specified"))
        .replace("{visa_status}",        str(candidate.get("visa_status") or "Not specified"))
        .replace("{candidate_type}",     str(candidate.get("candidate_type") or "domestic"))
        .replace("{required_skills}",    req_str)
        .replace("{nice_to_have_skills}",nice_str)
        .replace("{experience_years_min}",str(exp_min) if exp_min is not None else "Not specified")
        .replace("{role_type}",          str(jd_meta.get("role_type") or "Other"))
    )

    try:
        loop   = asyncio.get_running_loop()
        raw    = await loop.run_in_executor(None, _call_llm, prompt)
        result = _parse_json_response(raw)

        score   = max(0, min(100, int(float(str(result.get("ats_score", 0))))))
        matched = [str(s).strip() for s in (result.get("matched_skills") or []) if str(s).strip()]
        missing = [str(s).strip() for s in (result.get("missing_skills") or []) if str(s).strip()]

        return {
            "ats_score":      score,
            "matched_skills": matched,
            "missing_skills": missing,
            "fit_summary":    str(result.get("fit_summary") or ""),
        }
    except Exception as exc:
        logger.warning(f"[LLM] score_candidate_vs_jd failed for {candidate.get('full_name')}: {exc}")
        return {
            "ats_score": 0, "matched_skills": [], "missing_skills": [],
            "fit_summary": "Scoring unavailable.",
        }
