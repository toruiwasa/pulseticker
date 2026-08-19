# Issue #80 — Stop `pnpm --filter api lint` from rewriting the codebase

Issue [#80](https://github.com/toruiwasa/pulseticker/issues/80) · Branch `chore/lint-format-baseline`

Record of decisions agreed in conversation before implementation. The branch name and
scope both differ from the Issue body — see *Issue #80 corrections*.

---

## The defect

Hit while implementing #72. Running `pnpm --filter api lint` once, purely to inspect one
new provider, rewrote 48 files across `apps/api/src`. The branch had to be reset and every
edit re-applied.

Measurement showed three independent layers, only one of which the Issue had identified.

### Layer 1 — the script mutates

`"lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix"`, as scaffolded by the Nest CLI.
A script named `lint` is run to inspect; this one edits. Not arguable.

### Layer 2 — the config contradicted the code

| | `apps/api/.prettierrc` | `apps/web/.prettierrc` |
|---|---|---|
| `printWidth` | unset → default **80** | **100** |
| `arrowParens` | unset → default `always` | unset → default `always` |

Two widths in one repository. Measured against `apps/api/src` (4837 lines): p50 31, p90 74,
p95 83, **p99 104**, max 149 — 5.97% of lines exceed 80, 1.30% exceed 100. The code is
written at 100. Both apps also write `r => x`, not prettier's default `(r) => x`.

Aligning the config shrank the blast radius before a single source file was touched:

| config | files rewritten | lines rewritten |
|---|---:|---:|
| as committed (width 80, `arrowParens: always`) | 48 | 1062 |
| width 100 + `arrowParens: avoid` | 34 | 377 |

### Layer 3 — prettier is not the backlog

`eslint` on a clean `main`, `--fix` removed: **2765 problems in 53 files** (2733 errors).

| count | rule |
|---:|---|
| 1291 | `@typescript-eslint/no-unsafe-call` |
| 791 | `@typescript-eslint/no-unsafe-member-access` |
| **314** | **`prettier/prettier`** |
| 288 | `@typescript-eslint/no-unsafe-assignment` |
| 36 | `no-unnecessary-type-assertion` |

Formatting is 11% of it. The other 2451 are `recommendedTypeChecked` firing on Supabase
rows that arrive as `any` and on jest mocks. **Fixing formatting does not make lint green**,
which is why the Issue's "add lint to the CI gate" option was not on the table. Filed
separately.

None of this had ever surfaced because `.github/workflows/ci.yml` runs `build + test` only.

---

## Decisions

### 1. `lint` reports, `lint:fix` mutates

The conventional split. `format` already existed for the deliberate case; `format:check`
added alongside it so formatting is verifiable without writing.

### 2. `printWidth: 100` + `arrowParens: avoid`, both apps

The value was measured from committed source, not chosen. 100 also matches what `apps/web`
already declared, so the two apps stop disagreeing.

### 3. The formatting is adopted, not merely reported

**Why now.** No feature branch was open. This is the only condition under which a 77-file
reformat can land without silently conflicting with in-flight work, and the window is not
schedulable — it happens to exist today.

**What it buys.** `prettier/prettier` 314 → 0, so the remaining 2451 eslint problems are
all genuine type-safety findings rather than 11% noise.

### 4. Handwritten alignment is given up, except where it is tabular

The 166 lines that prettier would rewrite in `apps/api` were classified:

| classification | lines | carries information |
|---|---:|---|
| prettier disagrees about the wrap point | 105 | no |
| over 100 columns | 50 | no — wrapping is an improvement |
| manual column alignment | 10 | one case |
| one-line method body | 1 | vertical density only |

155 of 166 lines carry nothing. Alignment earns its keep in exactly one shape: **rows that
are instances of one record, read down a column.** Three such blocks were guarded with
`prettier-ignore`, which prettier honours per-declaration:

- `PREVIEW_SYMBOLS` (`preview-cache.service.ts`) — scanning the `display` column shows at a
  glance that `AUD/USD` is the only entry whose display differs from its raw symbol.
- `NAV_ITEMS` (`sidebar.component.ts`) — same shape, four routes.
- `:root` and `html.tui-theme-dark` (`styles.css`) — the strongest case: the dark block
  exists to be compared line-for-line against the light one. Guarding `:root` also preserves
  the uppercase hex literals, which prettier lowercases.

Everything else — `const STABLE_WINDOW_MS    = 60_000;`, the `vi.hoisted` mock lists in web
(119 lines across 15 files), trailing-comment alignment — is `=` alignment in a declaration
list, not a table, and was dropped.

**The cost of keeping alignment, named.** Adding a fifth row to `PREVIEW_SYMBOLS` with a
longer `raw` value means re-padding all four existing rows: a one-line addition produces a
five-line diff. Prettier has no alignment option by design, for this reason. The three
guarded blocks accept that cost knowingly; the rest were not worth it.

### 5. `apps/web` is in scope

The Issue scoped this to `apps/api` and said web "uses `@angular-eslint`". It does not:
no eslint config, no `lint` target in `angular.json`, and `prettier` is the only relevant
devDependency. Web therefore had a `.prettierrc` that **nothing could execute** — 42 of its
58 files had drifted from it. Since there is no `--fix` script to defuse, web's entire fix
is a config line plus `format` / `format:check` scripts.

Web is 4× the size of api's reformat (+1760/−1365 across 42 files vs +376/−167 across 35).
Included anyway: the same "no branch is open" window applies, and splitting it into a second
PR would mean taking the conflict risk twice.

### 6. Not chosen — removing prettier from eslint

Replacing `eslint-plugin-prettier` with `eslint-config-prettier` (already installed) and
leaving formatting to the `format` script was recommended at first, on the grounds that it
preserves handwritten formatting. **That reasoning was wrong** — measurement showed only
6 of 166 lines were worth preserving, and `prettier-ignore` preserves those anyway. Once
the formatting is adopted the eslint rule is silent, so it costs nothing and enforces the
result. Rejected on the evidence, not on principle.

---

## Implementation

| File | Change |
|---|---|
| `apps/api/package.json` | `lint` drops `--fix`; `lint:fix` and `format:check` added |
| `apps/api/.prettierrc` | `printWidth: 100`, `arrowParens: "avoid"` added |
| `apps/web/package.json` | `format`, `format:check` added |
| `apps/web/.prettierrc` | `arrowParens: "avoid"` added |
| `apps/api/src`, `apps/api/test` | `pnpm --filter api format` — 35 files |
| `apps/web/src` | `pnpm --filter web format` — 42 files |
| 3 blocks | `prettier-ignore` guards (decision 4) |

Three commits: config/scripts, api reformat, web reformat. The reformat commits are
independently revertible and contain no hand edits.

---

## Verification

- `pnpm --filter api lint` on a clean tree → `git status` stays empty. **This is the Issue's
  done-when condition.**
- `pnpm --filter api format:check` / `pnpm --filter web format:check` — both clean
- `eslint` on `apps/api`: 2765 → **2451** problems, `prettier/prettier` 314 → **0**
- `pnpm --filter api test` — 24 suites, 185 tests, pass
- `pnpm --filter web test` — 18 files, 162 tests, pass
- `pnpm build` — 5/5 tasks · `pnpm test` — 4/4 tasks

No unit tests added: the change has no runtime behaviour. The reformat's correctness is
established by the suites passing unchanged plus the commits containing no hand edits.

Local Jest/Vitest runs need the sandbox disabled — jest-haste-map spawns watchman, which
cannot write `~/.local/state/watchman` under the default sandbox.

---

## Out of scope

**The 2451 type-checked eslint problems, and adding lint to CI.** Filed as a follow-up. Not
foldable here: the Issue offered "add lint to the CI gate" as an option, but a gate is
impossible while 2451 errors remain, and suppressing them wholesale to open the gate would
discard the only real signal eslint currently produces. Formatting had to be separated from
that question first — which is what this task does.

---

## Issue #80 corrections

Amended in place on 2026-08-19.

| Issue #80 said | Corrected to | Basis |
|---|---|---|
| `apps/web` uses `@angular-eslint` | web has no eslint at all | no config file, no `angular.json` lint target, `prettier` is the only such devDependency |
| eslint reports **2419** problems on `main` | **2765** (2733 errors), of which only 314 are `prettier/prettier` | `eslint -f json` on clean `main`; the earlier figure was read off a truncated console tail |
| scope is `apps/api` | both apps | web's `.prettierrc` was unrunnable and 42 files had drifted |
| open decision: adopt formatting, or leave it and add lint to CI | adopt formatting; CI gate is not reachable either way | 2451 type-checked errors survive the reformat |
| branch `chore/api-lint-no-fix` | `chore/lint-format-baseline` | the name asserted an api-only scope that no longer held |
