# ============================================================
# Nexus CRM — Creating Your 3 User Accounts
# ============================================================
# Run these curl commands AFTER the backend is running.
# Or use the Swagger UI at http://localhost:8000/docs

# ── 1. Developer / Admin ─────────────────────────────────────
# (This is auto-created from your .env ADMIN_EMAIL/ADMIN_PASSWORD)
# Role is set to "admin" automatically on startup.
# Nothing to do here — just use those credentials.


# ── 2. Sales Rep ─────────────────────────────────────────────
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "sales@yourcompany.com",
    "password": "SalesPass123!",
    "name": "Sales Rep Name",
    "role": "sales"
  }'

# She will see: Sales Dashboard, Leads, Import, Tasks, Reminders
# She will NOT see: Recruitment module, Settings, Delete buttons


# ── 3. CEO / Founder ─────────────────────────────────────────
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "ceo@yourcompany.com",
    "password": "CeoPass123!",
    "name": "Founder Name",
    "role": "viewer"
  }'

# They will see: Everything (Sales + Recruitment)
# They will NOT see: Add/Edit/Delete buttons, Import Leads


# ── Change a role later (admin only) ─────────────────────────
# First log in as admin to get cookie, then:
curl -X PUT http://localhost:8000/api/users/USER_ID_HERE/role \
  -H "Content-Type: application/json" \
  -H "Cookie: access_token=YOUR_TOKEN" \
  -d '{"role": "viewer"}'


# ── Quick role summary ────────────────────────────────────────
# admin  → Everything. Full CRUD. Both modules. User management.
# sales  → Sales module only. Can add/edit leads. Cannot delete.
# viewer → Both modules. Read-only. No add/edit/delete buttons.
