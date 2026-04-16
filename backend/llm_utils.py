"""
llm_utils.py — LLM helpers for resume intelligence and JD keyword extraction.

Only TWO public functions are needed:
  extract_resume_insights(text)  → called once per resume upload
  extract_jd_keywords(jd_text)   → called once per ATS search

ATS scoring itself is done in pure Python (tech_stack overlap) — zero per-candidate
LLM calls, so free-tier limits are never hit during a search.

PROVIDER PRIORITY  (set LLM_PROVIDER env var to override):
  1. gemini   — google-genai          gemini-2.5-flash   FREE tier available
  2. openai   — openai                gpt-4o-mini        ~$0 credit only
  3. anthropic— anthropic             claude-haiku       limited free

ENV VARS:
  LLM_PROVIDER          = "gemini" | "openai" | "anthropic"   (default: gemini)
  GOOGLE_API_KEY        = AIza...
  OPENAI_API_KEY        = sk-...
  ANTHROPIC_API_KEY     = sk-ant-...
  LLM_MODEL_GEMINI      = gemini-2.5-flash (optional override)
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
DEFAULT_GEMINI_MODEL    = "gemini-2.5-flash"
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
# KEYWORD-BASED RESUME EXTRACTION (no LLM, instant, always works)
# ════════════════════════════════════════════════════════════════

# Maps lowercase search alias → canonical display name.
# Searched with non-alphanumeric word boundaries, case-insensitive.
_TECH_ALIAS: dict[str, str] = {
    # Languages
    "python": "Python", "java": "Java",
    "javascript": "JavaScript", "typescript": "TypeScript",
    "golang": "Go", "rust": "Rust",
    "c++": "C++", "c#": "C#", "ruby": "Ruby", "php": "PHP",
    "swift": "Swift", "kotlin": "Kotlin", "scala": "Scala",
    "perl": "Perl", "haskell": "Haskell", "elixir": "Elixir",
    "dart": "Dart", "groovy": "Groovy", "lua": "Lua",
    "matlab": "MATLAB", "cobol": "COBOL", "powershell": "PowerShell",
    "objective-c": "Objective-C", "solidity": "Solidity",
    # Frontend
    "react": "React", "react.js": "React", "reactjs": "React",
    "angular": "Angular", "angularjs": "Angular",
    "vue": "Vue", "vue.js": "Vue", "vuejs": "Vue",
    "next.js": "Next.js", "nextjs": "Next.js",
    "nuxt": "Nuxt", "svelte": "Svelte", "gatsby": "Gatsby",
    "tailwind": "Tailwind CSS", "tailwindcss": "Tailwind CSS",
    "bootstrap": "Bootstrap", "redux": "Redux", "mobx": "MobX",
    "webpack": "Webpack", "vite": "Vite",
    "react query": "React Query", "tanstack": "React Query",
    "zustand": "Zustand", "storybook": "Storybook",
    # Backend
    "node.js": "Node.js", "nodejs": "Node.js", "node": "Node.js",
    "express": "Express", "express.js": "Express",
    "nestjs": "NestJS", "nest.js": "NestJS",
    "fastapi": "FastAPI", "flask": "Flask", "django": "Django",
    "spring boot": "Spring Boot",
    "rails": "Rails", "ruby on rails": "Rails",
    "laravel": "Laravel", "symfony": "Symfony",
    "asp.net": "ASP.NET", ".net core": ".NET Core", ".net": ".NET",
    "gin": "Gin", "fiber": "Fiber",
    "graphql": "GraphQL", "apollo": "Apollo",
    "grpc": "gRPC", "websockets": "WebSockets", "websocket": "WebSockets",
    "rest api": "REST", "restful": "REST",
    "openapi": "OpenAPI", "swagger": "Swagger",
    "socket.io": "Socket.IO", "prisma": "Prisma",
    "sqlalchemy": "SQLAlchemy", "sequelize": "Sequelize", "typeorm": "TypeORM",
    # Databases – SQL
    "postgresql": "PostgreSQL", "postgres": "PostgreSQL",
    "mysql": "MySQL", "sqlite": "SQLite",
    "sql server": "SQL Server", "mssql": "SQL Server",
    "mariadb": "MariaDB", "cockroachdb": "CockroachDB",
    # Databases – NoSQL
    "mongodb": "MongoDB", "mongo": "MongoDB",
    "redis": "Redis", "cassandra": "Cassandra",
    "dynamodb": "DynamoDB", "elasticsearch": "Elasticsearch",
    "opensearch": "OpenSearch", "neo4j": "Neo4j",
    "influxdb": "InfluxDB", "firebase": "Firebase",
    "firestore": "Firestore",
    # Data warehouses
    "snowflake": "Snowflake", "bigquery": "BigQuery",
    "redshift": "Redshift", "databricks": "Databricks", "dbt": "dbt",
    # Cloud
    "aws": "AWS", "amazon web services": "AWS",
    "gcp": "GCP", "google cloud": "GCP",
    "azure": "Azure", "microsoft azure": "Azure",
    "digitalocean": "DigitalOcean", "heroku": "Heroku",
    "vercel": "Vercel", "netlify": "Netlify", "cloudflare": "Cloudflare",
    # AWS services
    "ec2": "AWS EC2", "aws s3": "AWS S3", "aws lambda": "AWS Lambda",
    "ecs": "AWS ECS", "eks": "Kubernetes",
    "sqs": "AWS SQS", "sns": "AWS SNS", "cloudformation": "CloudFormation",
    # GCP services
    "gke": "Kubernetes", "cloud run": "Cloud Run", "pubsub": "Pub/Sub",
    # Container / Infra
    "docker": "Docker", "kubernetes": "Kubernetes", "k8s": "Kubernetes",
    "helm": "Helm", "istio": "Istio",
    "terraform": "Terraform", "ansible": "Ansible",
    "puppet": "Puppet", "chef": "Chef", "vagrant": "Vagrant",
    # CI/CD
    "github actions": "GitHub Actions", "jenkins": "Jenkins",
    "circleci": "CircleCI", "gitlab ci": "GitLab CI",
    "travis ci": "Travis CI", "argocd": "ArgoCD",
    # Monitoring
    "prometheus": "Prometheus", "grafana": "Grafana",
    "datadog": "Datadog", "new relic": "New Relic",
    "splunk": "Splunk", "kibana": "Kibana", "logstash": "Logstash",
    # Messaging
    "kafka": "Kafka", "apache kafka": "Kafka",
    "rabbitmq": "RabbitMQ", "celery": "Celery", "nats": "NATS",
    # ML / AI / Data
    "pytorch": "PyTorch", "tensorflow": "TensorFlow",
    "keras": "Keras", "scikit-learn": "Scikit-learn", "sklearn": "Scikit-learn",
    "hugging face": "Hugging Face", "huggingface": "Hugging Face",
    "langchain": "LangChain", "opencv": "OpenCV",
    "nltk": "NLTK", "spacy": "spaCy",
    "xgboost": "XGBoost", "lightgbm": "LightGBM",
    "pandas": "Pandas", "numpy": "NumPy", "scipy": "SciPy",
    "matplotlib": "Matplotlib", "plotly": "Plotly",
    # Big Data
    "apache spark": "Apache Spark", "pyspark": "Apache Spark",
    "hadoop": "Hadoop",
    "airflow": "Airflow", "apache airflow": "Airflow",
    "apache flink": "Apache Flink", "flink": "Apache Flink",
    "presto": "Presto", "trino": "Trino",
    # Testing
    "jest": "Jest", "pytest": "pytest", "junit": "JUnit",
    "cypress": "Cypress", "selenium": "Selenium", "playwright": "Playwright",
    "vitest": "Vitest",
    # Mobile
    "react native": "React Native", "flutter": "Flutter",
    "swiftui": "SwiftUI",
}

# Build sorted list: longer aliases first so "spring boot" matches before "spring"
_SORTED_ALIASES = sorted(_TECH_ALIAS.items(), key=lambda x: -len(x[0]))


def _extract_tech_stack_keywords(text: str) -> list[str]:
    """
    Scan resume text for known tech keywords. No LLM — instant and reliable.
    Uses non-alphanumeric word boundaries to avoid partial matches.
    """
    found: dict[str, bool] = {}
    text_lower = text.lower()

    for alias, canonical in _SORTED_ALIASES:
        if canonical in found:
            continue  # already captured via another alias
        pattern = r"(?<![a-zA-Z0-9])" + re.escape(alias) + r"(?![a-zA-Z0-9])"
        if re.search(pattern, text_lower):
            found[canonical] = True

    return sorted(found.keys())[:35]


def _estimate_experience_years(text: str) -> int | None:
    """
    Estimate years of experience from date ranges in resume text.
    Handles: "2019 – 2022", "Jan 2020 - Present", "2018 – current", etc.
    """
    current_year = 2026
    present_tokens = {"present", "current", "now", "ongoing", "date"}

    ranges = re.findall(
        r"\b((?:19|20)\d{2})\s*[-–—]\s*((?:19|20)\d{2}|present|current|now|till\s+date|ongoing)",
        text, re.IGNORECASE,
    )

    if ranges:
        total_months = 0
        for start_str, end_str in ranges:
            start = int(start_str)
            end_clean = end_str.lower().strip()
            end = current_year if any(t in end_clean for t in present_tokens) else int(end_str)
            if 1980 <= start <= end <= current_year:
                total_months += (end - start) * 12
        if total_months > 0:
            return min(total_months // 12, 50)

    # Fallback: year-span heuristic (deduct 4 yrs for education)
    years = sorted({
        int(y) for y in re.findall(r"\b(19[89]\d|20[0-2]\d)\b", text)
        if 1990 <= int(y) <= current_year
    })
    if len(years) >= 2:
        span = years[-1] - years[0]
        return max(0, span - 4) if span >= 5 else None

    return None


# ════════════════════════════════════════════════════════════════
# LLM CALLERS  (used only for JD keyword extraction)
# ════════════════════════════════════════════════════════════════

_SYSTEM_JSON = (
    "You are a precise JSON-outputting assistant. "
    "Return ONLY valid JSON with no markdown, prose, or explanation."
)


def _call_gemini(full_prompt: str) -> str:
    from google import genai                  # lazy import (google-genai package)
    from google.genai import types
    client     = genai.Client(api_key=os.environ["GOOGLE_API_KEY"])
    model_name = os.environ.get("LLM_MODEL_GEMINI", DEFAULT_GEMINI_MODEL)
    resp = client.models.generate_content(
        model=model_name,
        contents=full_prompt,
        config=types.GenerateContentConfig(
            system_instruction=_SYSTEM_JSON,
        ),
    )
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

    Strategy:
      1. Try LLM — best quality when available.
      2. If LLM fails OR returns empty tech_stack, fall back to keyword scan.
    Returns: {"tech_stack": [...], "experience_years": int | None}
    """
    if not resume_text or not resume_text.strip():
        return {"tech_stack": [], "experience_years": None}

    # ── 1. Try LLM ────────────────────────────────────────────────
    try:
        prompt = _RESUME_INSIGHTS_PROMPT.replace("{resume_text}", resume_text[:12000])
        loop   = asyncio.get_running_loop()
        raw    = await loop.run_in_executor(None, _call_llm, prompt)
        result = _parse_json_response(raw)

        tech = [str(s).strip() for s in (result.get("tech_stack") or [])
                if isinstance(s, (str, int)) and str(s).strip()][:35]
        exp  = result.get("experience_years")
        if exp is not None:
            try:
                exp = int(float(str(exp)))
                if not (0 <= exp <= 60):
                    exp = None
            except (ValueError, TypeError):
                exp = None

        if tech:
            logger.info(f"[LLM] Resume insights — {len(tech)} skills, {exp} yrs exp")
            return {"tech_stack": tech, "experience_years": exp}

        logger.info("[LLM] Returned empty tech_stack — falling back to keyword scan")

    except Exception as exc:
        logger.warning(f"[LLM] extract_resume_insights failed: {exc} — falling back to keyword scan")

    # ── 2. Keyword fallback ────────────────────────────────────────
    tech = _extract_tech_stack_keywords(resume_text)
    exp  = _estimate_experience_years(resume_text)
    logger.info(f"[Resume] Keyword scan — {len(tech)} skills, {exp} yrs exp")
    return {"tech_stack": tech, "experience_years": exp}


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
