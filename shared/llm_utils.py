"""
llm_utils.py — LLM helpers for resume intelligence and JD keyword extraction.

Only TWO public functions are needed:
  extract_resume_insights(text)  → called once per resume upload
  extract_jd_keywords(jd_text)   → called once per ATS search

ATS scoring itself is done in pure Python (tech_stack overlap) — zero per-candidate
LLM calls, so free-tier limits are never hit during a search.

PROVIDER PRIORITY  (free-tier limits, highest first):
  1. groq      — openai SDK + groq base_url  llama-3.1-8b-instant     14,400 req/day, 500K TPD FREE
  2. gemini    — google-genai                gemini-2.5-flash          500 req/day FREE
  3. openai    — openai                      gpt-4o-mini               paid only
  4. anthropic — anthropic                   claude-haiku              paid only

  Configured LLM_PROVIDER is tried first; others follow in the priority order above.
  NOTE: gemini-2.0-flash is DEPRECATED and retires June 1 2026 — do not use.

ENV VARS (add to HuggingFace Spaces secrets):
  LLM_PROVIDER          = "groq" | "gemini" | "openai" | "anthropic"  (default: groq)

  GROQ_API_KEY          = gsk_...      ← get free at console.groq.com
  GOOGLE_API_KEY        = AIza...      ← get free at aistudio.google.com
  OPENAI_API_KEY        = sk-...       ← paid only
  ANTHROPIC_API_KEY     = sk-ant-...   ← paid only

  LLM_MODEL_GROQ        = llama-3.1-8b-instant         (optional override)
  LLM_MODEL_GEMINI      = gemini-2.5-flash              (optional override)
  LLM_MODEL_OPENAI      = gpt-4o-mini                  (optional override)
  LLM_MODEL_ANTHROPIC   = claude-haiku-4-5-20251001    (optional override)
"""

import os
import re
import json
import logging
import asyncio
from typing import Any

logger = logging.getLogger(__name__)

# ── Defaults ──────────────────────────────────────────────────
DEFAULT_GROQ_MODEL      = "llama-3.1-8b-instant"      # 14,400 req/day, 500K TPD FREE
DEFAULT_GEMINI_MODEL    = "gemini-2.5-flash"          # 500 req/day FREE
DEFAULT_OPENAI_MODEL    = "gpt-4o-mini"               # paid only
DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001" # paid only


def _provider() -> str:
    # Default: groq (500K TPD free). Override with LLM_PROVIDER env var.
    # IMPORTANT: Remove LLM_PROVIDER=gemini from HuggingFace if set — use groq
    return os.environ.get("LLM_PROVIDER", "groq").lower().strip()


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


_RESUME_FULL_PROFILE_PROMPT = """\
You are an expert ATS parser used by a technical staffing firm.
Your job is to extract a clean candidate profile from a raw resume.

Return ONLY JSON with these keys:
{
  "full_name": "<string or null>",
  "email": "<string or null>",
  "phone": "<string or null>",
  "current_company": "<string or null>",
  "candidate_role": "<string or null>",
  "location": "<string or null>",
  "tech_stack": ["Skill1", "Skill2", ...],
  "experience_years": <integer or null>
}

Rules:
- `candidate_role` must be the candidate's current or most recent job title.
- Prefer a specific title such as "Salesforce Developer", "Power BI Developer",
  "SAP FICO Consultant", "QA Engineer", "Data Analyst", "Backend Engineer",
  "Frontend Engineer", or "Full-Stack Developer".
- Do NOT return company names, names of employers, or generic words like
  "resume", "profile", or "developer" alone if a more specific title is present.
- Keep `tech_stack` normalized exactly as in the skills prompt.
- If a field cannot be determined, use null.

SELF-CHECK:
- Is `candidate_role` a job title, not a skill?
- Is `experience_years` an integer or null?
- Is the output pure JSON with no markdown?

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


def _estimate_experience_years(text: str):
    """
    Estimate years of experience. Priority:
      1. Explicit claim: "N+ years of experience/contracting/etc."
      2. Month-Year date ranges  (Jan 2020 – Present)
      3. Year-Year date ranges   (2018 – 2022)
      4. Year-span heuristic
    Education lines skipped. Supports German (heute), French (maintenant).
    """
    current_year = 2026
    PRESENT_WORDS = (
        "present", "current", "now", "ongoing", "today", "date",
        "heute", "maintenant", "heden", "todate", "till date", "to date", "till now"
    )
    DEGREE_WORDS = re.compile(
        r"\b(bachelor|master|msc|bsc|btech|mtech|phd|mba|degree|diploma"
        r"|honours|honors|b\.sc|m\.sc|b\.eng|m\.eng|undergraduate)\b", re.IGNORECASE
    )
    INST_WORDS = re.compile(
        r"\b(university|college|school|institute|academia)\b", re.IGNORECASE
    )
    WORK_ROLES = re.compile(
        r"\b(researcher|postdoc|professor|lecturer|scientist|engineer|developer|analyst|manager)\b",
        re.IGNORECASE
    )

    def is_edu(ctx):
        has_degree = bool(DEGREE_WORDS.search(ctx))
        has_inst   = bool(INST_WORDS.search(ctx))
        has_work   = bool(WORK_ROLES.search(ctx))
        # Degree keyword alone = education
        # Institution alone = education only if no work role keyword
        return has_degree or (has_inst and not has_work)

    def get_line(pos):
        s = text.rfind("\n", 0, pos) + 1
        e = text.find("\n", pos)
        return text[s: (e if e != -1 else len(text))]

    # 1. Explicit claim (broadened)
    for pat in [
        r"\b(\d+(?:\.\d+)?)\s*\+?\s*years?\s*(?:of\s+)?(?:experience|exp|professional|contracting|freelancing|working|practice|industry|service)",
        r"(?:total\s+)?experience\s*[:\=\-]?\s*(\d+(?:\.\d+)?)\s*\+?\s*years?",
    ]:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            val = int(float(m.group(1)))
            if 1 <= val <= 50:
                return val

    total_months = 0

    # 2. Month-Year ranges: "Jan 2020 – Present", "April 2018 to March 2021"
    MONTHS = (
        r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?"
        r"|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
    )
    PRESENT_RX = (
        r"(?:present|current|now|ongoing|heute|today|to[\s\-]?date|till[\s\-]?date|up\s+to\s+now)"
    )
    YR = r"((?:19|20)\d{2})"
    MY = r"(?:" + MONTHS + r"[\s\.\-]+)?" + YR
    range_pat = MY + r"\s*(?:[\-\u2013\u2014]|to|thru)\s*(?:" + MY + r"|" + PRESENT_RX + r")"

    for m in re.finditer(range_pat, text, re.IGNORECASE):
        ctx = get_line(m.start())
        if is_edu(ctx):
            continue
        all_years = re.findall(r"\b((?:19|20)\d{2})\b", m.group(0))
        is_present = bool(re.search(PRESENT_RX, m.group(0), re.IGNORECASE))
        if all_years:
            start_yr = int(all_years[0])
            end_yr = current_year if is_present else (int(all_years[1]) if len(all_years) > 1 else 0)
            if end_yr and 1980 <= start_yr <= end_yr <= current_year:
                total_months += (end_yr - start_yr) * 12

    if total_months > 0:
        return min(total_months // 12, 50)

    # 3. Pure YYYY-YYYY or YYYY-present ranges
    for m in re.finditer(
        r"\b((?:19|20)\d{2})\s*[\-\u2013\u2014]\s*((?:19|20)\d{2}|present|current|now|heute|till\s+date|ongoing)",
        text, re.IGNORECASE
    ):
        ctx = get_line(m.start())
        if is_edu(ctx):
            continue
        s = int(m.group(1))
        e_raw = m.group(2).lower().strip()
        if any(pw in e_raw for pw in PRESENT_WORDS):
            e = current_year
        elif m.group(2).isdigit():
            e = int(m.group(2))
        else:
            continue
        if 1980 <= s <= e <= current_year:
            total_months += (e - s) * 12

    if total_months > 0:
        return min(total_months // 12, 50)

    # 4. Year-span heuristic (deduct 4 years for education)
    years = sorted({int(y) for y in re.findall(r"\b(19[89]\d|20[0-2]\d)\b", text)
                    if 1990 <= int(y) <= current_year})
    if len(years) >= 2:
        span = years[-1] - years[0]
        return max(0, span - 4) if span > 4 else 0
    return None


_SYSTEM_JSON = (
    "You are a precise JSON-outputting assistant. "
    "Return ONLY valid JSON with no markdown, prose, or explanation."
)


def _call_groq(full_prompt: str) -> str:
    """Groq via OpenAI-compatible endpoint. 14,400 req/day FREE."""
    from openai import OpenAI  # Groq uses OpenAI SDK with custom base_url
    client = OpenAI(
        api_key=os.environ["GROQ_API_KEY"],
        base_url="https://api.groq.com/openai/v1",
    )
    model = os.environ.get("LLM_MODEL_GROQ", DEFAULT_GROQ_MODEL)
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
    """
    Cascade through all providers in free-tier priority order:
      1. Groq         — llama-3.1-8b-instant      14,400 req/day, 500K TPD FREE
      2. Gemini       — gemini-2.5-flash             500 req/day FREE
      3. OpenAI       — gpt-4o-mini                paid only
      4. Anthropic    — claude-haiku                paid only

    Configured LLM_PROVIDER is tried first; remaining providers follow in
    the priority order above. Only providers with a key set are attempted.
    Raises RuntimeError if all configured providers fail.

    NOTE: Puter.js is a browser-only JS library and cannot be called from
    a Python/FastAPI backend — excluded from this cascade.
    """
    configured = _provider()

    # Free-tier priority order
    _PRIORITY = ["groq", "gemini", "openai", "anthropic"]
    ordered = [configured] + [p for p in _PRIORITY if p != configured]

    _callers = {
        "groq":      (_call_groq,      "GROQ_API_KEY"),
        "gemini":    (_call_gemini,    "GOOGLE_API_KEY"),
        "openai":    (_call_openai,    "OPENAI_API_KEY"),
        "anthropic": (_call_anthropic, "ANTHROPIC_API_KEY"),
    }

    last_exc: Exception = RuntimeError("No LLM provider available — set at least one API key")
    for prov in ordered:
        caller, key_var = _callers[prov]
        if not os.environ.get(key_var):
            logger.debug(f"[LLM] Skipping {prov} — {key_var} not set")
            continue
        try:
            result = caller(full_prompt)
            if prov != configured:
                logger.info(f"[LLM] Fell back to {prov} (primary={configured} failed)")
            return result
        except Exception as exc:
            logger.warning(f"[LLM] {prov} failed: {exc}")
            last_exc = exc

    raise last_exc


# ════════════════════════════════════════════════════════════════
# PUBLIC API
# ════════════════════════════════════════════════════════════════



def _extract_name_heuristic(text: str):
    """Best-effort name extraction when LLM fails."""
    STOP = {
        "resume","cv","curriculum","vitae","profile","summary","skills","education",
        "experience","contact","objective","technical","professional","engineer",
        "developer","analyst","manager","senior","junior","lead","architect",
        "linkedin","github","years","specialist","consultant","designer","scientist",
    }
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    for line in lines[:8]:
        test_line = line.title() if (line.isupper() and 2<=len(line.split())<=4) else line
        words = test_line.split()
        if 2 <= len(words) <= 4:
            if not any(w.lower().rstrip(".:,@") in STOP for w in words):
                if all(re.fullmatch(r"[\w\-\'.\u00C0-\u024F]+", w) for w in words):
                    return test_line.title()
    # ALL-CAPS embedded name (scrambled PDF columns)
    for m in re.finditer(r"(?<![A-Z])([A-Z]{2,}(?:\s+[A-Z]{2,}){1,2})(?![A-Z])", text):
        words = m.group(0).split()
        if 2 <= len(words) <= 3:
            if not any(w.lower() in STOP for w in words):
                return m.group(0).title()
    return None


_ROLE_ALIASES = [
    ("salesforce marketing cloud specialist", "Salesforce Marketing Cloud Specialist"),
    ("salesforce developer", "Salesforce Developer"),
    ("sfmc specialist", "Salesforce Marketing Cloud Specialist"),
    ("sfdc", "Salesforce Developer"),
    ("power bi developer", "Power BI Developer"),
    ("power bi", "Power BI Developer"),
    ("sap btp cpi architect", "SAP BTP CPI Architect"),
    ("sap fico consultant", "SAP FICO Consultant"),
    ("sap fico", "SAP FICO Consultant"),
    ("d365fo technical consultant", "D365FO Technical Consultant"),
    ("d365fo", "D365FO Technical Consultant"),
    ("aem developer", "AEM Developer"),
    ("aem eds developer", "AEM Developer"),
    ("mern stack developer", "MERN Stack Developer"),
    ("mern stack", "MERN Stack Developer"),
    ("java spring boot microservices developer", "Java Spring Boot Microservices Developer"),
    ("java developer", "Java Developer"),
    ("backend engineer", "Backend Engineer"),
    ("frontend engineer", "Frontend Engineer"),
    ("full stack engineer", "Full-Stack Engineer"),
    ("full stack developer", "Full-Stack Developer"),
    ("software engineer", "Software Engineer"),
    ("software developer", "Software Developer"),
    ("qa engineer", "QA Engineer"),
    ("tester", "QA Engineer"),
    ("data analyst", "Data Analyst"),
    ("business analyst", "Business Analyst"),
    ("devops engineer", "DevOps Engineer"),
    ("cloud engineer", "Cloud Engineer"),
    ("architect", "Architect"),
    ("consultant", "Consultant"),
    ("admin", "Administrator"),
    ("mechanical engineer", "Mechanical Engineer"),
]


def _extract_candidate_role_heuristic(text: str) -> str | None:
    """
    Best-effort job-title extraction when the LLM omits candidate_role.
    Looks at the top of the resume first, then scans for common title aliases.
    """
    if not text or not text.strip():
        return None

    head = "\n".join(text.splitlines()[:20]).lower()
    for alias, canonical in _ROLE_ALIASES:
        if alias in head:
            return canonical

    text_lower = text.lower()
    for alias, canonical in _ROLE_ALIASES:
        if alias in text_lower:
            return canonical

    return None


async def extract_resume_full_profile(resume_text: str) -> dict:
    """
    Extract full candidate profile: name, email, phone, company, role, location,
    tech_stack, experience_years. Uses run_in_executor for the sync _call_llm.
    Falls back to regex + keyword scan if LLM fails.
    """
    import re as _re_prof

    fallback = {
        "full_name": None, "email": None, "phone": None,
        "current_company": None, "candidate_role": None, "location": None,
        "tech_stack": [], "experience_years": None,
    }
    if not resume_text or not resume_text.strip():
        return fallback

    # Regex fallbacks (run before LLM so we always have something)
    clean_text  = resume_text.replace("✉", " ").replace("📧", " ").replace("@", " @ ")
    email_match = _re_prof.search(r"[a-zA-Z0-9_.+-]+\s*@\s*[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", clean_text)
    regex_email = email_match.group(0).replace(" ", "").lower() if email_match else None

    phone_text  = resume_text.replace("📞", " ").replace("☎", " ").replace("📱", " ")
    phone_match = _re_prof.search(r"[+]?[0-9][0-9 \-().]{7,18}[0-9]", phone_text)
    regex_phone = _re_prof.sub(r"[\s\-().]", "", phone_match.group(0)) if phone_match else None

    try:
        prompt = _RESUME_FULL_PROFILE_PROMPT.replace("{resume_text}", resume_text[:12000])
        loop   = asyncio.get_running_loop()
        raw    = await loop.run_in_executor(None, _call_llm, prompt)
        result = _parse_json_response(raw)

        tech = [str(s).strip() for s in (result.get("tech_stack") or [])
                if s and len(str(s).strip()) >= 2][:35]
        exp  = result.get("experience_years")
        if not isinstance(exp, int):
            exp = None

        candidate_role = (result.get("candidate_role") or "").strip() or _extract_candidate_role_heuristic(resume_text)

        return {
            "full_name":        (result.get("full_name") or "").strip() or None,
            "email":            (result.get("email") or "").strip().replace(" ", "") or regex_email,
            "phone":            (result.get("phone") or "").strip().replace(" ", "") or regex_phone,
            "current_company":  (result.get("current_company") or "").strip() or None,
            "candidate_role":   candidate_role,
            "location":         (result.get("location") or "").strip() or None,
            "tech_stack":       tech,
            "experience_years": exp,
        }

    except Exception as exc:
        logger.warning(f"[LLM] extract_resume_full_profile failed: {exc} — falling back")
        tech = _extract_tech_stack_keywords(resume_text)
        exp  = _estimate_experience_years(resume_text)
        name = _extract_name_heuristic(resume_text)
        role = _extract_candidate_role_heuristic(resume_text)
        return {**fallback, "full_name": name, "tech_stack": tech,
                "experience_years": exp, "email": regex_email, "phone": regex_phone,
                "candidate_role": role}

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


# ════════════════════════════════════════════════════════════════
# LINKEDIN POST GENERATOR
# ════════════════════════════════════════════════════════════════

_LINKEDIN_POST_PROMPT = """\
You are a professional LinkedIn content writer for JM Data Talent, an Ireland-based IT staffing company.
Generate an engaging LinkedIn post to attract qualified candidates and IT clients.

Job Details:
- Title: {title}
- Location: {location}
- Type: {employment_type}
- Key Skills: {skills}
- Description: {description}
- Apply Link: {apply_url}

Requirements:
1. Open with an attention-grabbing line (1-2 lines, use 1-2 relevant emojis)
2. State role title, location clearly in the first 2-3 lines
3. Add a blank line, then 4-6 bullet points of key skills/requirements using the • symbol
4. Add a blank line, then 1-2 lines about JM Data Talent (Ireland-based IT staffing firm)
5. Add a strong CTA: "Apply here 👉 {apply_url}"
6. End with 7-9 relevant hashtags on a new line (mix: #Hiring #Ireland #[TechSkill] #ITJobs #Dublin #Recruitment #[Role] etc.)
7. Keep total post under 1200 characters
8. Tone: professional, enthusiastic, human — NOT generic corporate boilerplate

Return ONLY this JSON (no markdown, no extra text):
{{"post": "<the full post text with actual newlines escaped as \\n>"}}
"""


async def generate_linkedin_post(job: dict, apply_url: str) -> str:
    """
    Generate an LLM-crafted LinkedIn post for a job opening.
    Returns the post text string. Returns empty string on failure (caller uses template fallback).
    """
    if not job:
        return ""
    try:
        skills_text = ", ".join((job.get("skills") or [])[:8]) or "various technologies"
        desc        = (job.get("description") or "")[:400].strip()
        prompt = _LINKEDIN_POST_PROMPT.format(
            title           = job.get("title", ""),
            location        = job.get("location") or "Ireland",
            employment_type = job.get("employment_type") or "Contract/Permanent",
            skills          = skills_text,
            description     = desc,
            apply_url       = apply_url,
        )
        loop = asyncio.get_running_loop()
        raw  = await loop.run_in_executor(None, _call_llm, prompt)
        result = _parse_json_response(raw)
        post_text = (result.get("post") or "").strip()
        if post_text and len(post_text) > 100:
            # json.loads already unescapes \n; but if LLM literally put \\n, fix it
            return post_text.replace("\\n", "\n")
    except Exception as exc:
        logger.warning(f"[LLM] LinkedIn post generation failed: {exc} — caller will use template fallback")
    return ""


def _jd_keyword_fallback(jd_text: str) -> dict:
    """
    Keyword scan of JD text — no LLM needed.
    All extracted skills treated as required (can't distinguish required vs
    nice-to-have without language understanding).
    """
    skills = _extract_tech_stack_keywords(jd_text)

    exp = None
    m = re.search(r"\b(\d+)\+?\s*(?:years?|yrs?)\b", jd_text, re.IGNORECASE)
    if m:
        val = int(m.group(1))
        exp = val if 0 < val <= 40 else None

    logger.info(f"[JD] Keyword fallback — {len(skills)} skills, {exp} yrs min exp")
    return {
        "required_skills":      skills,
        "nice_to_have_skills":  [],
        "experience_years_min": exp,
        "role_type":            "Other",
        "domain":               "General",
    }


async def extract_jd_keywords(jd_text: str) -> dict:
    """
    Parse a job description into structured requirements. Called ONCE per ATS search.

    Strategy:
      1. Try LLM cascade (Groq → Gemini → OpenAI → Anthropic, whichever has a key).
      2. If all LLMs fail OR return empty required_skills, fall back to keyword scan.

    Returns:
    {
      "required_skills": [...],
      "nice_to_have_skills": [...],
      "experience_years_min": int | None,
      "role_type": str,
      "domain": str
    }
    """
    if not jd_text or not jd_text.strip():
        return {
            "required_skills": [], "nice_to_have_skills": [],
            "experience_years_min": None, "role_type": "Other", "domain": "General",
        }

    prompt = _JD_KEYWORDS_PROMPT.replace("{jd_text}", jd_text[:8000])

    # ── 1. Try LLM cascade ────────────────────────────────────────
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

        if req:
            logger.info(f"[LLM] JD keywords — {len(req)} required, {len(nice)} nice-to-have")
            return {
                "required_skills":      req,
                "nice_to_have_skills":  nice,
                "experience_years_min": exp,
                "role_type":            str(result.get("role_type") or "Other"),
                "domain":               str(result.get("domain")    or "General"),
            }

        logger.info("[LLM] JD returned empty required_skills — falling back to keyword scan")

    except Exception as exc:
        logger.warning(f"[LLM] extract_jd_keywords failed: {exc} — falling back to keyword scan")

    # ── 2. Keyword fallback ────────────────────────────────────────
    return _jd_keyword_fallback(jd_text)


import os
# ============================================================
# APPEND THIS BLOCK TO THE END OF shared/llm_utils.py
# Do not replace the file — this is strictly additive.
# ============================================================

# ── Business context ─────────────────────────────────────────
# Sourced from jmdatatalent.com. Without this the model gives generic B2B SaaS
# coaching, which is wrong for a contract recruitment desk in a small market.
JMDT_CONTEXT = """THE BUSINESS YOU ARE ADVISING:
JM Data Talent — a specialist CONTRACT recruitment agency for Data, Analytics,
AI and Digital Transformation talent. HQ Dublin (51 Bracken Road, D18), with
offices in Sharjah and Mohali. Placing across Ireland, UK, Europe, Dubai, USA
and India. Founded 2025, deliberately small.

MARKET FACTS THAT CHANGE HOW YOU READ THE NUMBERS:
- The Irish senior data contractor pool is only ~2,000-3,000 people, and the
  same 50-100 senior contractors recur across the major engagements.
- Roles fill in under two weeks. Their own average time-to-shortlist is 5
  working days. If a process runs past ~3 weeks, the candidate is gone.
- Strong candidates receive multiple approaches per week.
- ~68% of Irish data briefs specify Azure. Effort aimed at AWS/GCP-only
  candidates is largely wasted.
- Day rates run roughly EUR 200-950 depending on level.
- Contracts run 6-12 months with extensions, so a placement is recurring
  margin, and an extension is far cheaper to win than a new placement.
- Best candidates are PASSIVE — rarely on job boards.

THIS IS A TWO-SIDED DESK. Every activity serves one of two funnels:
- CLIENT / BD side: winning job briefs from hiring companies.
- CANDIDATE side: sourcing and placing contractors. `job_portal_research` is
  candidate-side. LinkedIn and email can be either.
A desk can look busy and still be failing if all effort sits on one side.
Say which side is starved when the split looks wrong.

POSITIONING — DO NOT CONTRADICT IT:
The firm competes on precision, not volume. Their public promise is to send two
right CVs rather than five, to take fewer mandates, and to be honest when a role
is hard to fill. NEVER recommend mass-blasting or generic sequences. In a pool
this small, high-volume low-relevance outreach burns the network permanently.
The right lever is nearly always better targeting, faster response, or deeper
relationships — not more sends."""

SALES_EXPERT_SYSTEM = """You are a senior recruitment director who has run
contract data desks in Dublin for 15 years. You are reviewing one team's
activity data. You are blunt, specific and numerate. You never pad.

HOW TO THINK:
1. Separate LEADING indicators (emails, calls, LinkedIn messages, invites,
   portal research) from LAGGING ones (replies, meetings, proposals/CV sends,
   placements). Weak lagging numbers on healthy leading numbers is a TARGETING
   or CREDIBILITY problem. Weak leading numbers is an EFFORT or CAPACITY
   problem. Say which one it is.
2. SPEED IS THE PRIMARY KPI in this market, above raw volume. A rep with fewer
   touches but same-day follow-up will out-place a rep with double the volume
   and a two-day lag. If reply or follow-up activity is lumpy or delayed,
   treat that as the headline issue.
3. Ratios beat volume. 200 messages at 1% reply is worse than 60 at 8%, AND in
   a 2,000-person market the 200 also costs future goodwill. When conversion is
   weak, fix targeting or the approach — do NOT prescribe more sends.
4. Compare each rep to the TEAM MEDIAN, not just the absolute target. A rep at
   80% of target in a week when the team is at 60% is performing well.
5. Consistency matters as much as total. 50/10/50/10/50 is more fragile than 34
   every day, because a dead day in a two-week fill window loses roles. Name
   collapse days explicitly.
6. Check the BD/candidate balance and flag whichever side is starved.
7. Never invent a number. Cite only figures present in the data. If the sample
   is too small to conclude anything, say so plainly instead of guessing.

OUTPUT FORMAT — respond with RAW JSON only. No markdown, no code fences, no preamble:
{
  "went_well":     ["...", "..."],
  "falling_short": ["...", "..."],
  "do_next":       ["...", "...", "..."],
  "risk_flag":     "one sentence, or empty string if nothing is genuinely wrong"
}

RULES FOR EACH FIELD:
- went_well: 2-3 items. Each MUST cite a real number or ratio from the data.
- falling_short: 2-3 items. Each MUST name the gap AND the ratio that proves it.
- do_next: exactly 3 items, ordered most-important first. Each must be an action a
  person can take on Monday morning, naming the specific rep or channel where
  relevant. No generic advice like "improve outreach quality".
- risk_flag: only populate if something would genuinely worry a CEO (pipeline drying
  up, a rep who has stopped logging, conversion collapsing). Otherwise "".
- Every string under 160 characters. Plain sentences, no bullets inside strings.
"""


def _safe_div(a, b):
    """Percentage helper that never raises on zero denominators."""
    try:
        a = float(a or 0)
        b = float(b or 0)
        if b == 0:
            return 0.0
        return round((a / b) * 100, 1)
    except Exception:
        return 0.0


def build_tracker_metrics(logs: list, granularity: str, prior_logs: list = None) -> dict:
    """Pre-compute a compact metrics block from raw sales_activity_log rows.

    We deliberately do NOT hand raw rows to the model. An 8B model given 200 rows
    produces vague output; given 20 pre-computed ratios it produces specific output.
    Also keeps the prompt small enough for Groq's free tier.
    """
    prior_logs = prior_logs or []

    NUMERIC = [
        "emails_sent", "linkedin_sent", "linkedin_invites_sent", "calls_made",
        "replies_received", "meetings_booked", "meetings_done", "proposals_sent",
        "followups_done", "new_leads_added", "job_portal_research", "hours_worked",
    ]

    def totals(rows):
        out = {k: 0 for k in NUMERIC}
        for r in rows:
            for k in NUMERIC:
                try:
                    out[k] += float(r.get(k) or 0)
                except Exception:
                    pass
        return {k: round(v, 1) for k, v in out.items()}

    cur   = totals(logs)
    prev  = totals(prior_logs)

    # ── Per-rep breakdown ────────────────────────────────────
    by_rep = {}
    for r in logs:
        name = r.get("logged_by_name") or "Unknown"
        b = by_rep.setdefault(name, {k: 0 for k in NUMERIC})
        b["days_logged"] = b.get("days_logged", 0) + 1
        for k in NUMERIC:
            try:
                b[k] += float(r.get(k) or 0)
            except Exception:
                pass
    for name, b in by_rep.items():
        touches = b["emails_sent"] + b["linkedin_sent"] + b["calls_made"]
        b["total_touches"] = round(touches, 1)
        b["reply_rate_pct"] = _safe_div(b["replies_received"], touches)
        for k in NUMERIC:
            b[k] = round(b[k], 1)

    # ── Team median touches, for fair rep comparison ─────────
    touch_list = sorted(b["total_touches"] for b in by_rep.values())
    if touch_list:
        mid = len(touch_list) // 2
        median_touches = (touch_list[mid] if len(touch_list) % 2
                          else round((touch_list[mid - 1] + touch_list[mid]) / 2, 1))
    else:
        median_touches = 0

    # ── Daily series, to spot collapse days ──────────────────
    by_day = {}
    for r in logs:
        d = str(r.get("log_date") or "")[:10]
        if not d:
            continue
        by_day[d] = by_day.get(d, 0) + (
            float(r.get("emails_sent") or 0)
            + float(r.get("linkedin_sent") or 0)
            + float(r.get("calls_made") or 0)
        )
    daily_series = [{"date": d, "touches": round(v, 1)} for d, v in sorted(by_day.items())]

    # For a month, day-level detail is noise. Roll into ISO weeks so the model
    # reasons about the trend across weeks instead of listing 22 days.
    weekly_series = []
    if granularity == "month":
        import datetime as _dt
        by_week = {}
        for d, v in by_day.items():
            try:
                iso = _dt.date.fromisoformat(d).isocalendar()
                key = f"W{iso[1]}"
            except Exception:
                continue
            by_week[key] = by_week.get(key, 0) + v
        weekly_series = [{"week": k, "touches": round(v, 1)} for k, v in sorted(by_week.items())]
        # Day-level detail is dropped from the payload for month view — it keeps
        # the prompt small and stops the model citing individual days.
        daily_series = []

    total_touches = cur["emails_sent"] + cur["linkedin_sent"] + cur["calls_made"]
    prev_touches  = prev["emails_sent"] + prev["linkedin_sent"] + prev["calls_made"]

    return {
        "granularity":  granularity,
        "days_with_data": len(by_day),
        "reps_active":  len(by_rep),
        "totals":       cur,
        "prior_totals": prev,
        "funnel_conversion_pct": {
            "touch_to_reply":       _safe_div(cur["replies_received"], total_touches),
            "reply_to_meeting":     _safe_div(cur["meetings_booked"], cur["replies_received"]),
            "meeting_to_proposal":  _safe_div(cur["proposals_sent"], cur["meetings_done"]),
        },
        "channel_mix_pct": {
            "email":    _safe_div(cur["emails_sent"], total_touches),
            "linkedin": _safe_div(cur["linkedin_sent"], total_touches),
            "calls":    _safe_div(cur["calls_made"], total_touches),
        },
        "total_touches":            round(total_touches, 1),
        "touches_change_vs_prior_pct": _safe_div(total_touches - prev_touches, prev_touches) if prev_touches else 0.0,
        "team_median_touches":      median_touches,
        "by_rep":                   by_rep,
        "daily_series":             daily_series,
        "weekly_series":            weekly_series,
    }


# The same numbers mean different things over a day, a week and a month.
# Without this, all three views produce near-identical generic text.
GRANULARITY_LENS = {
    "day": """THIS IS A SINGLE DAY.
One day is a small sample — do NOT diagnose trends or declare a rep is
underperforming from one day. Focus on: who showed up and who did not, the
spread between reps today, and whether today's mix was balanced or skewed to
one channel. Compare against YESTERDAY (prior_totals). Actions should be
things fixable tomorrow morning. If only one or two reps logged, say the
picture is incomplete rather than drawing conclusions.""",

    "week": """THIS IS ONE WORKING WEEK (Mon-Fri).
This is the primary coaching window — a week is enough to judge effort and
conversion together. Focus on: consistency across the five days (name any
collapse day), whether each rep cleared the weekly target, funnel conversion,
and the comparison against LAST WEEK (prior_totals). Use daily_series to spot
front-loading or Friday drop-off. Actions should be commitments for next week.""",

    "month": """THIS IS A FULL MONTH.
Zoom out. Ignore single-day noise entirely — do not mention individual days.
Focus on: the trend across the weeks within the month, whether output is
building or decaying, month-over-month change (prior_totals), which rep has
improved or slipped most, and whether the channel mix has shifted. Conversion
rates are statistically meaningful at this sample size, so weigh them heavily.
Actions should be strategic — territory, targeting, channel allocation,
coaching focus for the coming month — not daily housekeeping.""",
}


def generate_sales_insights(metrics: dict, targets: dict = None, context: str = "") -> dict:
    """Turn a metrics block into structured coaching. Synchronous — callers in async
    code MUST wrap with: await loop.run_in_executor(None, generate_sales_insights, m)
    """
    import json as _json

    empty = {"went_well": [], "falling_short": [], "do_next": [], "risk_flag": ""}

    if not metrics or not metrics.get("days_with_data"):
        return {**empty, "risk_flag": "No activity was logged for this period."}

    granularity = (metrics.get("granularity") or "week").lower()
    lens = GRANULARITY_LENS.get(granularity, GRANULARITY_LENS["week"])

    payload = {"metrics": metrics}
    if targets:
        payload["targets"] = targets
    if context:
        payload["context"] = context

    prompt = (
        SALES_EXPERT_SYSTEM
        + "\n\n" + JMDT_CONTEXT
        + "\n\nPERIOD CONTEXT:\n"
        + lens
        + "\n\nDATA:\n"
        + _json.dumps(payload, default=str)
        + "\n\nRespond with the JSON object only."
    )

    # ── Model selection ──────────────────────────────────────
    # This is a REASONING task with a long structured prompt. llama-3.1-8b-instant
    # (the global default) produces mush here — it drops rules and writes vague
    # generalities. llama-3.3-70b-versatile is markedly better.
    #
    # We do NOT change LLM_MODEL_GROQ globally, because that env var also drives
    # high-volume CV parsing on the Recruit Space, and 70B is capped at only
    # 1,000 req/day and 100K tokens/day on the free tier — CV parsing would
    # exhaust it in an afternoon.
    #
    # Instead: a dedicated override used ONLY for insights (~3-10 calls/day),
    # with a safe fall-through to the normal cascade if it fails or is unset.
    insight_model = os.environ.get("LLM_MODEL_INSIGHTS", "llama-3.3-70b-versatile")

    def _call_with_insight_model(p: str) -> str:
        if not insight_model or not os.environ.get("GROQ_API_KEY"):
            return _call_llm(p)
        from openai import OpenAI
        client = OpenAI(api_key=os.environ["GROQ_API_KEY"],
                        base_url="https://api.groq.com/openai/v1")
        resp = client.chat.completions.create(
            model=insight_model,
            max_tokens=1024,
            temperature=0.3,          # analysis, not creative writing
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "Respond with a single valid JSON object and nothing else."},
                {"role": "user",   "content": p},
            ],
        )
        return resp.choices[0].message.content

    try:
        try:
            raw = _call_with_insight_model(prompt)
        except Exception as inner:
            # 429 rate limit, model retired, key missing — fall back to the
            # standard cascade (Groq 8B -> Gemini -> OpenAI -> Anthropic)
            import logging as _lg
            _lg.getLogger(__name__).warning(
                f"[ai_insights] insight model failed ({inner}); falling back to cascade")
            raw = _call_llm(prompt)
        parsed = _parse_json_response(raw)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"[ai_insights] generation failed: {e}")
        return {**empty, "risk_flag": ""}

    if not isinstance(parsed, dict):
        return empty

    def _strlist(v, cap):
        if not isinstance(v, list):
            return []
        return [str(x).strip()[:200] for x in v if str(x).strip()][:cap]

    return {
        "went_well":     _strlist(parsed.get("went_well"), 3),
        "falling_short": _strlist(parsed.get("falling_short"), 3),
        "do_next":       _strlist(parsed.get("do_next"), 3),
        "risk_flag":     str(parsed.get("risk_flag") or "").strip()[:300],
    }
