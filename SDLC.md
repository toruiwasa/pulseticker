# Development Lifecycle

All feature development follows these phases in order. Never skip a phase without stating why.

---

## Pre-Implementation

### Phase 1 — Problem Analysis
**Skill**: `product-discovery` (MODE: Problem Analysis)
**Purpose**: Define what problem actually exists. Remove solution bias.
**Exit criteria**:
- Problem statement written in one sentence
- Constraints explicit (Finnhub Free Tier, Supabase, portfolio scope)
- No unresolved "what does the user actually need?" ambiguity

### Phase 2 — User Insight
**Skill**: `product-discovery` (MODE: User Insight)
**Purpose**: Understand user needs, pain points, and JTBD.
**Exit criteria**:
- Primary user need identified
- User journey sketched (trigger → action → outcome)
- Behavioral assumptions made explicit

### Phase 3 — Prioritization
**Skill**: `product-discovery` (MODE: Prioritization)
**Purpose**: Decide what matters most. Define MVP boundary.
**Exit criteria**:
- Features ranked by user value, portfolio signal, and Finnhub feasibility
- Deferred items listed with justification

### Phase 4 — Roadmap
**Skill**: `product-discovery` (MODE: Roadmap)
**Purpose**: Convert priorities into delivery phases.
**Exit criteria**:
- `plans/REQ-XX_<Title>.md` file written and committed
- Branch name assigned (`feat/<name>`)

### Phase 5 — Task Breakdown
**Skill**: `task-breakdown`
**Purpose**: Decompose the approved spec into ordered, atomic, layer-assigned tasks.
**Exit criteria**:
- Every task has: layer, branch, dependency, test boundary, migration flag
- HIGH-risk tasks flagged for architecture review
- Dependency map produced

### Phase 5.5 — GitHub Issue Creation
**Purpose**: Make every task visible and trackable in GitHub before a single line of code is written.
**Trigger**: Immediately after `task-breakdown` output is reviewed and approved. Run the `gh issue create` script produced by the task-breakdown (sub-output 7).
**Steps**:
1. Run the script from the task-breakdown output — one `gh issue create` call per task.
2. Record the issue number next to each task in `plans/REQ-XX_*.md`.
3. Do not start any implementation task until its issue is open.
**Exit criteria**:
- [ ] One open GitHub Issue exists for every task in the task-breakdown
- [ ] Issue numbers recorded in the plans file
- [ ] All issues labelled with `task` and the correct layer (`backend`, `frontend`, `mobile`, `infra`, `shared-pkg`)

**Skip when**: The change is a direct commit (documentation, `plans/` file) — these do not get issues.

### Phase 6 — Architecture Review
**Skill**: `architecture-review`
**Purpose**: Validate technical approach. Catch design defects before coding.
**Exit criteria**:
- Dependency direction check: PASS
- No Critical risks unresolved
- Complexity Score ≤ 6 (or redesign justified)
- Final Verdict: Approved or Approved with Concerns

### Phase 7 — UX Design *(frontend features only)*
**Skill**: `ux-designer`
**Purpose**: Define how the UI looks and behaves before implementation.
**Exit criteria**:
- All states specified: loading, empty, error, stale data, success
- TUI component selected for every UI element
- No "TBD" states

### Phase 8 — QA Review + Test Design
**Skills**: `qa-engineer` then `test-engineer`
**Purpose**: Identify missing requirements and design the test strategy before writing code.
**Exit criteria**:
- No Critical or High risks unaddressed (`qa-engineer`)
- All acceptance criteria are testable
- Test cases designed for every HIGH-risk area with mock setup specified (`test-engineer`)
- Path to 90–95% per-file coverage is clear

---

## Implementation

### Phase 9 — Build

Only start implementation after Phase 8 is approved.

| What | Skill |
|---|---|
| NestJS modules, controllers, services, gateways, jobs | `backend-engineer` |
| Angular components, services, guards, pipes | `frontend-engineer` |
| Migrations, CI/CD, env vars, Render/Vercel config | `devops-engineer` |

**Exit criteria**:
- Feature complete on a `feat/<name>` branch
- Tests pass at 90–95% coverage per changed file
- No `console.log`, `any`, or class-validator in diff
- PR created with `Closes #<issue-number>` in the body
- PR merged to main (never a direct push)
- GitHub Issue closed and linked to the merged PR

---

## Post-Implementation

### Phase 10 — QA Release Review
**Skill**: `qa-engineer` (entry point: pre-release)
**Purpose**: Confirm release readiness before merging to main.
**Release checklist**:
- [ ] `GET /health` returns 200 (Render keepalive intact)
- [ ] `CORS_ORIGIN` matches Vercel URL exactly (no trailing slash)
- [ ] `DATABASE_URL` is Session Pooler (port 5432, not 6543)
- [ ] Supabase Auth → Redirect URLs includes current Vercel URL
- [ ] All `plans/REQ-XX_*.md` files committed
- [ ] Coverage ≥ 90–95% per changed file
- [ ] No `console.log` or `any` in diff

### Phase 11 — Retrospective
**Skill**: `retrospective-engine`
**Purpose**: Improve the skill system and workflow based on what happened.
**Exit criteria**:
- Every rework event has a root cause and a named improvement target
- At least one concrete update to a skill or CLAUDE.md proposed

---

## Fast Paths

### Minor bug fix
Skip Phases 1–4. Simplified Phase 5 (one task) + Phase 5.5 (one issue). Phase 6 only if touching a module boundary.
Phases 8, 9 (implementation), 10 required. Phase 11 recommended if the bug exposed a systemic gap.

### Frontend-only change
Skip `backend-engineer`. Core path: 5 → 5.5 → 6 → 7 → 8 → 9 (`frontend-engineer`) → 10.

### Backend-only change
Skip `ux-designer`. Core path: 5 → 5.5 → 6 → 8 → 9 (`backend-engineer`) → 10.
Add `devops-engineer` if migration or env var changes are needed.

### Documentation or `plans/` file
Skip Phases 5–10. Commit directly. Ensure the file lands in the repo.

### Emergency production fix
Implement immediately (Phase 9). Abbreviated Phase 10. **Phase 11 is mandatory.**

---

## Hard Rules

- Never start Phase 9 before Phase 8 is approved.
- Never skip `architecture-review` for any task marked HIGH risk.
- Never skip `test-engineer` — test strategy is designed before implementation, not after.
- Never skip `retrospective-engine` after a session that produced rework or an emergency fix.
- Every skip must be stated explicitly with a reason.
- Never push directly to main — every task must ship via a PR with `Closes #<issue-number>` in the body.
- Never start implementing a task without its corresponding GitHub Issue open.
