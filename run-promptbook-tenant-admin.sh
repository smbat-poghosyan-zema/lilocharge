#!/usr/bin/env bash
set -uo pipefail

# ============================================================================
# Bastion Tenant Admin PromptBook Runner
#
# Tests and upgrades tenant admin self-service flow: register-tenant endpoint,
# sign-up redesign, onboarding polish, permission isolation.
#
# Features:
#   - Persistent state: tracks done/running/failed/pending per step
#   - Resumable: re-run the script and it skips completed steps
#   - Interrupted steps: detects and continues from where Claude left off
#   - Process cleanup: SIGINT/SIGTERM kills child Claude processes
#   - Live feedback: real-time Claude output streamed to terminal + log file
#   - Dashboard: shows step statuses on start and after each step
#   - Auto service startup: kills used ports and starts services before browser tests
#
# Usage:
#   ./scripts/run-promptbook-tenant-admin.sh              # Run all steps
#   ./scripts/run-promptbook-tenant-admin.sh --build-only # Build steps only (1-5)
#   ./scripts/run-promptbook-tenant-admin.sh --tests-only # Test steps only (6-11)
#   ./scripts/run-promptbook-tenant-admin.sh --step 3     # Single step
#   ./scripts/run-promptbook-tenant-admin.sh --reset      # Wipe state
#   ./scripts/run-promptbook-tenant-admin.sh --status     # Show status
#   ./scripts/run-promptbook-tenant-admin.sh --retry      # Retry failed
# ============================================================================

BASTION_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATE_FILE="$BASTION_DIR/.promptbook-tenant-admin-state.json"
LOG_DIR="$BASTION_DIR/logs/promptbook-tenant-admin"
PID_FILE="$BASTION_DIR/.promptbook-tenant-admin-pids"

mkdir -p "$LOG_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

log()     { echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $1"; }
success() { echo -e "${GREEN}[$(date +%H:%M:%S)] ✓${NC} $1"; }
warn()    { echo -e "${YELLOW}[$(date +%H:%M:%S)] ⚠${NC} $1"; }
fail()    { echo -e "${RED}[$(date +%H:%M:%S)] ✗${NC} $1"; }

# ============================================================================
# State Management (using python3 for reliable JSON)
# ============================================================================

init_state() {
  if [[ ! -f "$STATE_FILE" ]]; then
    echo '{}' > "$STATE_FILE"
  fi
}

get_step_status() {
  python3 -c "
import json
with open('${STATE_FILE}') as f:
    state = json.load(f)
print(state.get('${1}', {}).get('status', 'pending'))
"
}

get_step_field() {
  python3 -c "
import json
with open('${STATE_FILE}') as f:
    state = json.load(f)
print(state.get('${1}', {}).get('${2}', ''))
"
}

# Atomic state write: write to temp file then mv (atomic on same filesystem)
set_step_status() {
  local step="$1"
  local status="$2"
  local pid_val="${3:-}"
  python3 << PYEOF
import json, datetime, os, tempfile

with open('${STATE_FILE}') as f:
    state = json.load(f)

if '${step}' not in state:
    state['${step}'] = {}

state['${step}']['status'] = '${status}'
state['${step}']['updated_at'] = datetime.datetime.now().isoformat()

if '${status}' == 'running':
    state['${step}']['started_at'] = datetime.datetime.now().isoformat()
elif '${status}' == 'done':
    state['${step}']['finished_at'] = datetime.datetime.now().isoformat()
elif '${status}' == 'failed':
    state['${step}']['failed_at'] = datetime.datetime.now().isoformat()

pid_val = '${pid_val}'
if pid_val:
    state['${step}']['pid'] = pid_val

# Atomic write
dir_name = os.path.dirname('${STATE_FILE}')
fd, tmp = tempfile.mkstemp(dir=dir_name, suffix='.tmp')
with os.fdopen(fd, 'w') as f:
    json.dump(state, f, indent=2)
os.replace(tmp, '${STATE_FILE}')
PYEOF
}

# ============================================================================
# Step registry
# ============================================================================

ALL_STEPS=(
  "ta-step-01-register-tenant"
  "ta-step-02-signup-redesign"
  "ta-step-03-isolation-tests"
  "ta-step-04-onboarding-polish"
  "ta-step-05-regression-polish"
  "ta-step-06-test-registration"
  "ta-step-07-test-user-role-mgmt"
  "ta-step-08-test-client-creation"
  "ta-step-09-test-wizard"
  "ta-step-10-test-permission-isolation"
  "ta-step-11-test-full-integration"
)

BUILD_STEPS=(
  "ta-step-01-register-tenant"
  "ta-step-02-signup-redesign"
  "ta-step-03-isolation-tests"
  "ta-step-04-onboarding-polish"
  "ta-step-05-regression-polish"
)

TEST_STEPS=(
  "ta-step-06-test-registration"
  "ta-step-07-test-user-role-mgmt"
  "ta-step-08-test-client-creation"
  "ta-step-09-test-wizard"
  "ta-step-10-test-permission-isolation"
  "ta-step-11-test-full-integration"
)

declare -A STEP_NAMES=(
  ["ta-step-01-register-tenant"]="Step 1: Backend — Register Tenant Endpoint"
  ["ta-step-02-signup-redesign"]="Step 2: UI — Sign-Up Redesign"
  ["ta-step-03-isolation-tests"]="Step 3: Backend — Tenant Admin Isolation Tests"
  ["ta-step-04-onboarding-polish"]="Step 4: UI — Onboarding Polish"
  ["ta-step-05-regression-polish"]="Step 5: Test Regression Fix + Polish"
  ["ta-step-06-test-registration"]="Step 6: Test — New Tenant Admin Registration"
  ["ta-step-07-test-user-role-mgmt"]="Step 7: Test — User + Role Management"
  ["ta-step-08-test-client-creation"]="Step 8: Test — Client Creation"
  ["ta-step-09-test-wizard"]="Step 9: Test — Getting Started Wizard"
  ["ta-step-10-test-permission-isolation"]="Step 10: Test — Permission Isolation"
  ["ta-step-11-test-full-integration"]="Step 11: Test — Full Integration"
)

declare -A STEP_DEPS=(
  ["ta-step-01-register-tenant"]=""
  ["ta-step-02-signup-redesign"]="ta-step-01-register-tenant"
  ["ta-step-03-isolation-tests"]="ta-step-01-register-tenant"
  ["ta-step-04-onboarding-polish"]="ta-step-02-signup-redesign ta-step-03-isolation-tests"
  ["ta-step-05-regression-polish"]="ta-step-04-onboarding-polish"
  ["ta-step-06-test-registration"]="ta-step-05-regression-polish"
  ["ta-step-07-test-user-role-mgmt"]="ta-step-06-test-registration"
  ["ta-step-08-test-client-creation"]="ta-step-06-test-registration"
  ["ta-step-09-test-wizard"]="ta-step-06-test-registration"
  ["ta-step-10-test-permission-isolation"]="ta-step-06-test-registration"
  ["ta-step-11-test-full-integration"]="ta-step-06-test-registration ta-step-08-test-client-creation ta-step-09-test-wizard"
)

deps_met() {
  local deps="${STEP_DEPS[$1]}"
  if [[ -z "$deps" ]]; then
    return 0
  fi
  local dep
  for dep in $deps; do
    local s
    s=$(get_step_status "$dep")
    if [[ "$s" != "done" ]]; then
      return 1
    fi
  done
  return 0
}

# ============================================================================
# Dashboard
# ============================================================================

show_dashboard() {
  echo ""
  echo -e "${BOLD}======== Bastion Tenant Admin PromptBook ========${NC}"
  echo ""

  local done_count=0 running_count=0 failed_count=0 pending_count=0

  echo -e "  ${BOLD}--- Build ---${NC}"
  for step in "${BUILD_STEPS[@]}"; do
    local status
    status=$(get_step_status "$step")
    local icon
    case "$status" in
      done)        icon="${GREEN}done${NC}";        ((done_count++)) ;;
      running)     icon="${YELLOW}running${NC}";     ((running_count++)) ;;
      failed)      icon="${RED}failed${NC}";         ((failed_count++)) ;;
      interrupted) icon="${YELLOW}interrupted${NC}"; ((failed_count++)) ;;
      *)           icon="${DIM}pending${NC}";        ((pending_count++)) ;;
    esac
    printf "  %-50s %b\n" "${STEP_NAMES[$step]}" "$icon"
  done

  echo ""
  echo -e "  ${BOLD}--- Browser Tests ---${NC}"
  for step in "${TEST_STEPS[@]}"; do
    local status
    status=$(get_step_status "$step")
    local icon
    case "$status" in
      done)        icon="${GREEN}done${NC}";        ((done_count++)) ;;
      running)     icon="${YELLOW}running${NC}";     ((running_count++)) ;;
      failed)      icon="${RED}failed${NC}";         ((failed_count++)) ;;
      interrupted) icon="${YELLOW}interrupted${NC}"; ((failed_count++)) ;;
      *)           icon="${DIM}pending${NC}";        ((pending_count++)) ;;
    esac
    printf "  %-50s %b\n" "${STEP_NAMES[$step]}" "$icon"
  done

  echo ""
  echo -e "  ${GREEN}Done: $done_count${NC}  ${YELLOW}Running: $running_count${NC}  ${RED}Failed/Int: $failed_count${NC}  ${DIM}Pending: $pending_count${NC}  Total: ${#ALL_STEPS[@]}"
  echo -e "${BOLD}=================================================${NC}"
  echo ""
}

# ============================================================================
# Process Management
# ============================================================================

CHILD_PIDS=()

register_pid() {
  CHILD_PIDS+=("$1")
  echo "$1" >> "$PID_FILE"
}

kill_pid() {
  local pid="$1"
  if kill -0 "$pid" 2>/dev/null; then
    log "Stopping process tree (PID $pid)..."
    kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    sleep 1
    kill -0 "$pid" 2>/dev/null && kill -KILL -"$pid" 2>/dev/null || true
  fi
}

cleanup() {
  echo ""
  warn "Interrupt received — cleaning up..."

  local pid
  for pid in "${CHILD_PIDS[@]}"; do
    kill_pid "$pid"
  done

  local step
  for step in "${ALL_STEPS[@]}"; do
    local s
    s=$(get_step_status "$step")
    if [[ "$s" == "running" ]]; then
      set_step_status "$step" "interrupted"
      warn "Marked $step as interrupted"
    fi
  done

  rm -f "$PID_FILE"
  echo ""
  show_dashboard
  log "State saved to $STATE_FILE — run the script again to resume."
  exit 130
}

trap cleanup SIGINT SIGTERM

# Kill stale processes from previous run
if [[ -f "$PID_FILE" ]]; then
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    if kill -0 "$pid" 2>/dev/null; then
      warn "Killing stale process from previous run (PID $pid)"
      kill_pid "$pid"
    fi
  done < "$PID_FILE"
  rm -f "$PID_FILE"
fi

# Fix any steps stuck in "running" from a previous crash
fix_stale_running() {
  local step
  for step in "${ALL_STEPS[@]}"; do
    local s
    s=$(get_step_status "$step")
    if [[ "$s" == "running" ]]; then
      local pid
      pid=$(get_step_field "$step" "pid")
      if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        : # Actually still running
      else
        warn "Step $step was stuck in 'running' (process gone) — marking as interrupted"
        set_step_status "$step" "interrupted"
      fi
    fi
  done
}

# ============================================================================
# Service Management (auto-start for browser tests)
# ============================================================================

kill_port() {
  local port="$1"
  local pid
  pid=$(lsof -ti :"$port" 2>/dev/null || true)
  if [[ -n "$pid" ]]; then
    log "Killing process on port $port (PID $pid)..."
    kill -TERM $pid 2>/dev/null || true
    sleep 1
    kill -0 $pid 2>/dev/null && kill -KILL $pid 2>/dev/null || true
  fi
}

start_services() {
  log "Auto-starting services for browser tests..."

  # Kill existing processes on required ports
  kill_port 3000   # auth-server
  kill_port 5173   # bastion-ui
  kill_port 5174   # sample-app
  sleep 2

  # Start via the existing start-services script
  "$BASTION_DIR/scripts/start-services.sh" || {
    fail "Failed to start services via start-services.sh"
    return 1
  }

  # Also start sample-app if it exists
  if [[ -d "$BASTION_DIR/apps/sample-app" ]]; then
    log "Starting sample-app..."
    cd "$BASTION_DIR"
    pnpm --filter @bastion/sample-app dev > /tmp/sample-app.log 2>&1 &
    success "sample-app started (PID $!, log: /tmp/sample-app.log)"
  fi

  # Wait for health
  log "Waiting for services to become healthy..."
  local ok=true
  local elapsed=0
  local max_wait=45
  while [[ $elapsed -lt $max_wait ]]; do
    if curl -sf http://localhost:3000/health > /dev/null 2>&1 && \
       curl -sf http://localhost:5173 > /dev/null 2>&1; then
      ok=true
      break
    fi
    ok=false
    sleep 2
    ((elapsed+=2))
  done

  if [[ "$ok" == true ]]; then
    success "All required services are healthy"
    return 0
  else
    fail "Services did not become healthy within ${max_wait}s"
    return 1
  fi
}

check_services() {
  log "Checking required services..."
  local ok=true

  if ! curl -sf http://localhost:3000/health > /dev/null 2>&1; then
    fail "auth-server is NOT running at http://localhost:3000"
    ok=false
  else
    success "auth-server is running"
  fi

  if ! curl -sf http://localhost:5173 > /dev/null 2>&1; then
    fail "bastion-ui is NOT running at http://localhost:5173"
    ok=false
  else
    success "bastion-ui is running"
  fi

  # sample-app check is non-fatal for most tests
  if ! curl -sf http://localhost:5174 > /dev/null 2>&1; then
    warn "sample-app may not be running at http://localhost:5174 (Step 11 may fail)"
  else
    success "sample-app is running"
  fi

  if [[ "$ok" == false ]]; then
    return 1
  fi
  return 0
}

ensure_services() {
  if check_services 2>/dev/null; then
    success "Services already running"
    return 0
  fi
  log "Services not running — auto-starting..."
  start_services
}

# ============================================================================
# Claude Runner
# ============================================================================

run_prompt() {
  local step_name="$1"
  local prompt="$2"
  local log_file="$LOG_DIR/${step_name}.log"

  local status
  status=$(get_step_status "$step_name")

  # Skip completed
  if [[ "$status" == "done" ]]; then
    success "Skipping ${STEP_NAMES[$step_name]} (already done)"
    return 0
  fi

  # Build the prompt — prepend continuation notice for interrupted/failed
  local full_prompt="$prompt"
  if [[ "$status" == "interrupted" || "$status" == "failed" ]]; then
    warn "${STEP_NAMES[$step_name]} was previously ${status} — continuing"
    full_prompt="IMPORTANT: This step was previously started but interrupted. Check what files and code already exist in the project. Do NOT recreate or overwrite files that already exist and are correct. Continue from where the previous run left off and complete the remaining work.

${prompt}"
  fi

  log "Starting: ${STEP_NAMES[$step_name]}"
  echo "$full_prompt" > "$LOG_DIR/${step_name}.prompt.txt"

  set_step_status "$step_name" "running"

  claude --dangerously-skip-permissions \
    -p "$full_prompt" \
    --output-format text \
    2>&1 | tee "$log_file" &
  local claude_pid=$!
  register_pid "$claude_pid"
  set_step_status "$step_name" "running" "$claude_pid"

  local exit_code=0
  wait "$claude_pid" || exit_code=$?

  if [[ $exit_code -eq 0 ]]; then
    set_step_status "$step_name" "done"
    success "${STEP_NAMES[$step_name]} completed"
    echo ""
    return 0
  else
    set_step_status "$step_name" "failed"
    fail "${STEP_NAMES[$step_name]} FAILED (exit code $exit_code, see $log_file)"
    echo ""
    return 1
  fi
}

# ============================================================================
# PROMPTS — extracted from PromptBook-TenantAdmin.md
# ============================================================================

read -r -d '' PROMPT_01 <<'PROMPT' || true
Read AGENTS.md fully. You are the API Agent adding the register-tenant endpoint to @bastion/auth-server.

CONTEXT:
Currently, tenant creation requires platform admin permissions (system:platform → can_manage_tenants).
There is no public self-service registration for new organizations. We need a single atomic endpoint
that creates a tenant + user + credentials + OpenFGA admin tuples + tokens in one transaction.

The auth-server already has:
- signUp flow in apps/auth-server/src/services/auth-service.ts (pattern reference)
- insertTenant, findTenantBySlug in packages/auth-db/src/queries/tenant-queries.ts
- insertUser, findUserByEmail in packages/auth-db/src/queries/user-queries.ts
- insertCredential in packages/auth-db/src/queries/credential-queries.ts
- passwordService.hashPassword for Argon2id hashing
- authzClient.writeTuple for OpenFGA permission grants
- issueTokens for creating access + refresh tokens
- insertAuditLog for audit trail

REFERENCE FILES (read ALL of these first):
- apps/auth-server/src/services/auth-service.ts — signUp flow, issueTokens, AuthService interface
- apps/auth-server/src/routes/auth.ts — existing route patterns, signUpRequestSchema usage
- packages/auth-types/src/api/admin-requests.ts — existing admin request schemas
- packages/auth-db/src/queries/tenant-queries.ts — insertTenant, findTenantBySlug
- packages/auth-db/src/queries/user-queries.ts — insertUser, findUserByEmail
- packages/auth-db/src/queries/credential-queries.ts — insertCredential
- packages/auth-authz/src/client/openfga-client.ts — writeTuple method
- apps/auth-server/src/server.ts — how services are wired in resolveServices

BUILD:

1. ADD registerTenantRequestSchema to @bastion/auth-types:
   File: packages/auth-types/src/api/admin-requests.ts
   - Add registerTenantRequestSchema = z.object({
       organizationName: z.string().min(1).max(255),
       slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(1).max(63).optional(),
       email: z.string().email(),
       password: z.string().min(8).max(128),
       displayName: z.string().min(1).max(255),
     })
   - Export type: RegisterTenantRequest = z.infer<typeof registerTenantRequestSchema>
   - Add to the barrel export in packages/auth-types/src/index.ts

2. ADD slugify helper:
   File: apps/auth-server/src/services/auth-service.ts (or a new utils file)
   - Create a function slugify(name: string): string
     a. Convert to lowercase
     b. Replace non-alphanumeric with hyphens
     c. Collapse multiple hyphens
     d. Trim leading/trailing hyphens
     e. Truncate to 63 characters
   - Create a function generateUniqueSlug(baseName: string, findBySlug: (slug: string) => Promise<unknown | undefined>): Promise<string>
     a. Slugify the base name
     b. Check if slug is taken via findBySlug
     c. If taken, append -2, -3, etc. until unique (max 10 attempts)
     d. If all attempts fail, append a random 4-char suffix

3. ADD registerTenant method to AuthService interface and implementation:
   File: apps/auth-server/src/services/auth-service.ts
   - Add to AuthService interface:
     readonly registerTenant: (request: RegisterTenantRequest) => Promise<{
       tokens: { accessToken: string; refreshToken: string; expiresIn: number };
       tenant: Record<string, unknown>;
       user: Record<string, unknown>;
     }>;
   - Implement registerTenantOp:
     a. Generate slug from organizationName if not provided (using generateUniqueSlug with findTenantBySlug)
     b. If slug provided, validate uniqueness via findTenantBySlug — throw ValidationError if taken
     c. Call insertTenant with { name: organizationName, slug, plan: 'free', status: 'active' }
     d. Check email uniqueness via findUserByEmail — throw ValidationError("Email already registered")
     e. Hash password via passwordService.hashPassword
     f. Call insertUser with { email, displayName, tenantId: newTenant.id, status: 'active', emailVerified: false }
     g. Call insertCredential with { userId, type: 'password', credential: hashedPassword }
     h. Write OpenFGA tuples (best-effort, wrapped in try/catch):
        - user:{userId} → admin → tenant:{tenantId}
        - user:{userId} → member → tenant:{tenantId}
        Do NOT write user:{userId} → admin → system:platform (that is only for explicit promotion)
     i. Call insertAuditLog with action 'auth.tenant.registered'
     j. Call issueTokens to create access + refresh tokens for the new user
     k. Return { tokens, tenant: sanitizeTenant(newTenant), user: sanitizeUser(newUser) }
   - Wire registerTenant into the return object of createAuthService

4. ADD route in apps/auth-server/src/routes/auth.ts:
   - Register BEFORE the sign-up route (order matters for path matching)
   - POST /api/v1/auth/register-tenant
   - No requireAuth hook (this is a PUBLIC endpoint)
   - No x-tenant-id header required
   - Parse body with registerTenantRequestSchema
   - Call authService.registerTenant(body)
   - Return 201 with { data: { tokens, tenant, user } }
   - Structured Pino log: 'Tenant registered', tenantId, userId (no secrets)

5. ADD unit tests:
   File: apps/auth-server/tests/unit/routes/register-tenant.test.ts
   - Test POST /auth/register-tenant creates tenant, user, and returns tokens
   - Test returns 400 for invalid email format
   - Test returns 400 for password too short
   - Test returns 400 for missing organizationName
   - Test returns 409/400 for duplicate email
   - Test returns 409/400 for duplicate slug
   - Test auto-generates slug from organization name when slug not provided
   - Test auto-generated slug deduplication (appends suffix when taken)
   - Test OpenFGA tuples are written for admin + member on tenant (NOT system:platform)
   - Test succeeds even if OpenFGA writeTuple fails (best-effort)

   File: apps/auth-server/tests/unit/services/auth-service-register-tenant.test.ts
   - Test registerTenant creates tenant with correct fields
   - Test registerTenant hashes password via passwordService
   - Test slugify helper produces valid kebab-case
   - Test generateUniqueSlug appends counter on collision

CONSTRAINTS:
- This endpoint does NOT require authentication (it IS the registration)
- This endpoint does NOT require x-tenant-id header
- Does NOT grant system:platform admin — only tenant-level admin
- OpenFGA tuple writes are best-effort — must not block registration
- Slug must be valid kebab-case (lowercase alphanumeric + hyphens)
- Follow existing patterns in auth-service.ts and auth.ts exactly
- All errors use BastionError hierarchy (ValidationError, etc.)
- No raw SQL — use existing Drizzle query builders
- Secrets never in logs or error messages

VALIDATION:
pnpm --filter @bastion/auth-types test && pnpm --filter @bastion/auth-types typecheck
pnpm --filter @bastion/auth-server test && pnpm --filter @bastion/auth-server typecheck && pnpm lint

DONE WHEN:
- POST /api/v1/auth/register-tenant creates tenant + user + tokens atomically
- Auto-generated slugs are unique and valid kebab-case
- OpenFGA grants tenant admin (not platform admin) permissions
- All existing tests still pass
- All new endpoints have tests covering happy path and error cases
PROMPT

read -r -d '' PROMPT_02 <<'PROMPT' || true
Read AGENTS.md fully. You are the UI Agent redesigning the sign-up flow for @bastion/bastion-ui.

CONTEXT:
The sign-up page currently uses SignUpForm which calls authStore.signUp() — this creates a user
in an existing tenant. We are replacing this with a "Create Your Organization" flow that calls
the new POST /api/v1/auth/register-tenant endpoint. After registration, the user is redirected
to /admin/getting-started to set up their first client.

REFERENCE FILES (read ALL of these first):
- apps/bastion-ui/src/pages/auth/sign-up.tsx — current sign-up page
- apps/bastion-ui/src/components/forms/sign-up-form.tsx — current sign-up form
- apps/bastion-ui/src/services/auth-api.ts — existing auth API service
- apps/bastion-ui/src/stores/auth-store.ts — Zustand auth store
- apps/bastion-ui/src/stores/tenant-store.ts — tenant context store
- apps/bastion-ui/src/lib/api-client.ts — API client with skipAuth option
- packages/auth-types/src/api/admin-requests.ts — registerTenantRequestSchema

BUILD:

1. ADD registerTenant to auth API service:
   File: apps/bastion-ui/src/services/auth-api.ts
   - Add method: registerTenant(body: {
       organizationName: string;
       slug?: string;
       email: string;
       password: string;
       displayName: string;
     })
   - Calls POST /api/v1/auth/register-tenant with skipAuth: true (public endpoint, no Bearer token)
   - Returns { data: { tokens, tenant, user } }

2. ADD registerTenant action to auth store:
   File: apps/bastion-ui/src/stores/auth-store.ts
   - Add registerTenant action to the AuthState interface and implementation:
     a. Call authApi.registerTenant(body)
     b. Call storeTokens with returned tokens (same pattern as signIn/signUp)
     c. Call fetchUser to populate user state
     d. Call useTenantStore.getState().fetchAvailableTenants()
     e. Call useTenantStore.getState().checkPlatformAdmin()
     f. Wrap tenant calls in try/catch (non-fatal)

3. CREATE apps/bastion-ui/src/components/forms/register-tenant-form.tsx:
   - React Hook Form with Zod validation
   - Fields:
     a. Organization Name (Input, required, min 1, max 255)
        - On change: auto-generate slug preview below (non-editable display)
        - Slug preview shown as muted text: "your-org-name" with slugify logic
     b. Email (Input, type=email, required)
     c. Display Name (Input, required, min 1, max 255)
     d. Password (Input, type=password, required, min 8, max 128)
     e. Confirm Password (Input, type=password, must match password)
   - Submit button: "Create Organization" with loading state
   - On submit:
     a. Call useAuth().registerTenant({ organizationName, email, password, displayName })
     b. On success: navigate to /admin/getting-started
     c. On error: show error toast with message
   - Client-side slugify helper (same logic as backend):
     toLowerCase, replace non-alnum with hyphens, collapse, trim
   - Follow existing form patterns (sign-up-form.tsx, tenant-form.tsx)

4. MODIFY apps/bastion-ui/src/pages/auth/sign-up.tsx:
   - Replace SignUpForm import with RegisterTenantForm
   - Update page title: "Create Your Organization"
   - Update description: "Start managing your application's authentication"
   - Render <RegisterTenantForm /> instead of <SignUpForm />
   - Keep the bottom link: "Already have an account? Sign in" → /sign-in
   - The old SignUpForm file (sign-up-form.tsx) remains but is no longer imported from sign-up.tsx
     (tenant admins create users via admin panel instead)

5. ADD MSW mock handler:
   File: apps/bastion-ui/src/tests/mocks/handlers.ts
   - Add handler for POST /api/v1/auth/register-tenant:
     Return 201 with { data: {
       tokens: { accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token', expiresIn: 900 },
       tenant: { id: 'tenant-new', name: 'Test Org', slug: 'test-org', plan: 'free' },
       user: { id: 'user-new', email: 'test@example.com', displayName: 'Test User' }
     } }

6. ADD tests:
   File: apps/bastion-ui/src/tests/unit/components/register-tenant-form.test.tsx:
   - Test form renders all fields (org name, email, display name, password, confirm)
   - Test slug preview updates as organization name is typed
   - Test validation: empty org name shows error
   - Test validation: password mismatch shows error
   - Test validation: short password shows error
   - Test successful submission calls registerTenant and navigates
   - Test error state shows toast message

   File: apps/bastion-ui/src/tests/unit/pages/sign-up-redesigned.test.tsx:
   - Test sign-up page renders "Create Your Organization" title
   - Test sign-up page renders RegisterTenantForm (not SignUpForm)
   - Test "Already have an account?" link points to /sign-in

CONSTRAINTS:
- The slug preview is display-only — the server auto-generates the final slug
- The form does NOT send slug to the backend (let server handle deduplication)
- skipAuth: true on the API call (no auth token required for registration)
- Follow existing shadcn/ui component patterns exactly
- Keep each file under 300 lines
- All existing tests must still pass

VALIDATION:
pnpm --filter @bastion/bastion-ui typecheck
pnpm --filter @bastion/bastion-ui lint
pnpm --filter @bastion/bastion-ui build
pnpm --filter @bastion/bastion-ui test

Fix ALL issues until every command passes.
PROMPT

read -r -d '' PROMPT_03 <<'PROMPT' || true
Read AGENTS.md fully. You are the Test Agent writing tenant admin isolation tests for @bastion/auth-server.

CONTEXT:
The auth-server uses OpenFGA for authorization. Tenant admins have:
- user:{id} → admin → tenant:{tenantId} (manage own tenant)
- user:{id} → member → tenant:{tenantId} (belong to own tenant)
They do NOT have:
- user:{id} → admin → system:platform (platform-level access)

Admin routes check permissions via checkPermission(authzClient, userId, relation, object).
Tenant-scoped routes check against tenant:{tenantId}.
Platform-scoped routes check against system:platform.

REFERENCE FILES (read ALL of these first):
- apps/auth-server/src/routes/admin.ts — route patterns, checkPermission calls, extractContext
- apps/auth-server/src/services/admin-service.ts — service methods with permission requirements
- packages/auth-authz/src/client/openfga-client.ts — checkPermission, writeTuple, listObjects
- apps/auth-server/tests/unit/routes/ — existing test patterns and helpers
- apps/auth-server/tests/helpers/ — test setup, mock creation helpers

BUILD:

1. CREATE apps/auth-server/tests/unit/routes/admin-tenant-isolation.test.ts:

   Set up two tenants with separate admin users:
   - Tenant A: "Alpha Corp" with admin user alice@alpha.dev
   - Tenant B: "Beta Corp" with admin user bob@beta.dev
   - Neither user has system:platform permissions

   Test cases for Tenant Admin CAN do within own tenant:

   a. should allow tenant admin to list users in own tenant
      - alice calls GET /admin/users with x-tenant-id: tenantA
      - Mock checkPermission to return true for alice → can_read_users → tenant:tenantA
      - VERIFY: returns 200 with users

   b. should allow tenant admin to create a user in own tenant
      - alice calls POST /admin/users with x-tenant-id: tenantA
      - VERIFY: returns 201

   c. should allow tenant admin to update a user in own tenant
      - alice calls PATCH /admin/users/:id with x-tenant-id: tenantA
      - VERIFY: returns 200

   d. should allow tenant admin to delete a user in own tenant
      - alice calls DELETE /admin/users/:id with x-tenant-id: tenantA
      - VERIFY: returns 200 or 204

   e. should allow tenant admin to list/create/update clients in own tenant
      - VERIFY: 200/201 responses

   f. should allow tenant admin to list/create roles in own tenant
      - VERIFY: 200/201 responses

   Test cases for Tenant Admin CANNOT do cross-tenant:

   g. should return 403 when tenant admin lists users in another tenant
      - alice calls GET /admin/users with x-tenant-id: tenantB
      - Mock checkPermission to return false for alice → can_read_users → tenant:tenantB
      - VERIFY: returns 403

   h. should return 403 when tenant admin creates user in another tenant
      - alice calls POST /admin/users with x-tenant-id: tenantB
      - VERIFY: returns 403

   i. should return 404 when tenant admin requests user detail from different tenant
      - alice calls GET /admin/users/:bobUserId with x-tenant-id: tenantA
      - The user belongs to tenantB so findUserById returns user with different tenantId
      - VERIFY: returns 404 (not 403, to avoid leaking existence)

   Test cases for Tenant Admin CANNOT do platform operations:

   j. should return 403 when tenant admin lists all tenants
      - alice calls GET /admin/tenants (requires system:platform → can_read_tenants)
      - Mock checkPermission to return false for alice → can_read_tenants → system:platform
      - VERIFY: returns 403

   k. should return 403 when tenant admin creates a new tenant via admin endpoint
      - alice calls POST /admin/tenants
      - VERIFY: returns 403

   l. should return 403 when tenant admin deletes a tenant
      - alice calls DELETE /admin/tenants/:id
      - VERIFY: returns 403

   m. should return 403 when tenant admin tries to update another tenant
      - alice calls PATCH /admin/tenants/:tenantBId
      - VERIFY: returns 403

   Test cases for Privilege Escalation Prevention:

   n. should not grant system:platform when registering via register-tenant endpoint
      - Call POST /auth/register-tenant
      - Verify writeTuple is called for tenant admin + member but NOT for system:platform
      - VERIFY: the tuple user:{id} → admin → system:platform is NOT written

2. Follow existing test patterns:
   - Use the app creation helpers from the test setup
   - Mock authzClient.checkPermission to control permission outcomes
   - Mock database queries to return appropriate test data
   - Use Arrange/Act/Assert pattern with descriptive test names

CONSTRAINTS:
- Tests MUST NOT depend on execution order — each test is isolated
- Mock checkPermission to precisely control permission outcomes per test
- Use realistic UUIDs for tenant and user IDs
- Follow test naming: "should [expected behavior] when [condition]"
- No snapshot tests — assert explicitly
- Reset all mocks between tests (afterEach)

VALIDATION:
pnpm --filter @bastion/auth-server test

DONE WHEN:
- All 14+ isolation test cases pass
- Tests verify tenant admin can manage own tenant resources
- Tests verify tenant admin cannot access cross-tenant resources
- Tests verify tenant admin cannot perform platform operations
- Tests verify register-tenant does not grant platform admin
- All existing tests still pass
PROMPT

read -r -d '' PROMPT_04 <<'PROMPT' || true
Read AGENTS.md fully. You are the UI Agent polishing the onboarding experience for @bastion/bastion-ui.

CONTEXT:
New tenant admins register via "Create Your Organization" (Step 2), get redirected to
/admin/getting-started, and need to create their first client and get integration credentials.
The Getting Started wizard was built in PromptBook-MultiTenant Step 6, but needs polish for
the self-service tenant admin use case.

REFERENCE FILES (read ALL of these first):
- apps/bastion-ui/src/pages/admin/getting-started.tsx — existing wizard
- apps/bastion-ui/src/pages/admin/dashboard.tsx — existing dashboard
- apps/bastion-ui/src/stores/tenant-store.ts — currentTenantId, currentTenant
- apps/bastion-ui/src/services/clients-api.ts — client API service
- apps/bastion-ui/src/hooks/use-tenant.ts — tenant hook

BUILD:

1. MODIFY apps/bastion-ui/src/pages/admin/getting-started.tsx:
   - Verify Step 1 (Create/Select Client) works when no clients exist:
     a. The "no clients" state should show a simplified creation form
     b. After creating a client, the wizard should advance to Step 2 automatically
     c. If clients already exist, show a selectable list with radio buttons
   - Verify Step 2 (Your Credentials) uses REAL values:
     a. Tenant ID from useTenant().currentTenantId (not a placeholder)
     b. Client ID from the client created/selected in Step 1
     c. Both values in monospace bordered boxes with functional Copy buttons
     d. If either value is missing, show a warning: "Value not available — go back to Step 1"
   - Verify Step 3 (Install the SDK) code blocks:
     a. npm install @bastion/auth-sdk
     b. pnpm add @bastion/auth-sdk
     c. yarn add @bastion/auth-sdk
     d. All with Copy buttons that work
   - Verify Step 4 (Add Authentication) code snippets:
     a. React example uses actual tenantId and clientId from Steps 1-2
     b. Code must be syntactically valid TypeScript
     c. Replace any hardcoded placeholder UUIDs with real values
   - Verify Step 5 (Test It Out):
     a. Links to "View your users" → /admin/users
     b. Links to "View sessions" → /admin/sessions
     c. "Go to Dashboard" button → /admin/dashboard
   - Fix any issues found during verification

2. MODIFY apps/bastion-ui/src/pages/admin/dashboard.tsx:
   - For new tenants with zero clients, show a full-width welcome banner:
     a. Card with gradient background or subtle border highlight
     b. Title: "Welcome to Bastion!"
     c. Description: "Get started by setting up your first client application."
     d. Primary CTA button: "Start Setup" → /admin/getting-started
     e. Secondary link: "Or explore the dashboard"
   - This banner replaces the small "Getting Started" card for empty tenants
   - If the tenant has at least one client, show the normal dashboard with stats
   - Keep the existing "Getting Started" sidebar link for returning to the wizard later

3. ADD or UPDATE tests:
   File: apps/bastion-ui/src/tests/unit/pages/getting-started-polish.test.tsx:
   - Test Step 1 renders creation form when no clients exist
   - Test Step 1 renders client list when clients exist
   - Test Step 2 displays real tenant ID from tenant store
   - Test Step 2 displays real client ID from selected client
   - Test Copy button calls navigator.clipboard.writeText with correct value
   - Test Step 4 code snippets contain interpolated tenant and client IDs
   - Test Back/Next navigation between all 5 steps

   File: apps/bastion-ui/src/tests/unit/pages/dashboard-welcome.test.tsx:
   - Test welcome banner renders when tenant has zero clients
   - Test welcome banner has "Start Setup" link to /admin/getting-started
   - Test normal dashboard renders when tenant has clients

CONSTRAINTS:
- Code snippets must use string interpolation (template literals), not dangerouslySetInnerHTML
- Copy-to-clipboard uses navigator.clipboard.writeText with try/catch fallback
- Keep each page file under 300 lines — extract step sub-components if needed
- Wizard state is local (useState), not persisted — resets on navigate away
- All framework code examples must be syntactically valid TypeScript
- Follow existing shadcn/ui component patterns

VALIDATION:
pnpm --filter @bastion/bastion-ui typecheck
pnpm --filter @bastion/bastion-ui lint
pnpm --filter @bastion/bastion-ui build
pnpm --filter @bastion/bastion-ui test

Fix ALL issues until every command passes.
PROMPT

read -r -d '' PROMPT_05 <<'PROMPT' || true
Read AGENTS.md fully. You are the Test Agent ensuring quality across all packages after the tenant admin changes.

1. RUN THE FULL TEST SUITE to identify failures:
   pnpm --filter @bastion/auth-types test
   pnpm --filter @bastion/auth-server test
   pnpm --filter @bastion/bastion-ui test
   pnpm --filter @bastion/sample-app test

2. For EACH failing test, read the test file AND the source file it tests.
   Understand what changed in Steps 1-4 and update the test accordingly:

   Common breakages to look for:
   a. sign-up.test.tsx — page now renders "Create Your Organization" not "Sign Up" / "Create Account"
   b. sign-up-form.test.tsx — form may still pass since file exists, but sign-up page no longer uses it
   c. auth-store.test.ts — new registerTenant action needs mock for authApi.registerTenant
   d. auth-api.test.ts — new registerTenant method needs test
   e. dashboard.test.tsx — now has welcome banner for empty tenants
   f. getting-started.test.tsx — may have updated assertions
   g. auth-service.test.ts — new registerTenant method in the service

3. Fix ALL MSW mock handlers:
   File: apps/bastion-ui/src/tests/mocks/handlers.ts
   - Ensure handler exists for POST /api/v1/auth/register-tenant
   - Verify all existing handlers still match current API patterns

4. RUN COVERAGE:
   pnpm --filter @bastion/bastion-ui test:coverage
   pnpm --filter @bastion/auth-server test:coverage
   If coverage drops below threshold, add tests for new code from Steps 1-4.

5. FINAL CHECKS:
   a. No console.log statements (use Pino logger on backend)
   b. No `any` types in new code
   c. No TODO without issue numbers
   d. All new exported functions have JSDoc comments
   e. All imports are correct and used

6. Update MSW handlers for sample-app if it references sign-up:
   File: apps/sample-app/ test files (if any reference the sign-up flow)
   - The sample-app sign-up is UNAFFECTED (it has its own sign-up form)
   - But verify it still works

VALIDATION:
pnpm --filter @bastion/auth-types test && pnpm --filter @bastion/auth-types typecheck
pnpm --filter @bastion/auth-server test && pnpm --filter @bastion/auth-server typecheck
pnpm --filter @bastion/bastion-ui test && pnpm --filter @bastion/bastion-ui typecheck
pnpm --filter @bastion/bastion-ui build
pnpm --filter @bastion/sample-app test && pnpm --filter @bastion/sample-app typecheck
pnpm typecheck && pnpm lint

Fix ALL issues until EVERY command passes with zero errors.

DONE WHEN:
- All existing tests pass (including any updated for the sign-up redesign)
- All new tests from Steps 1-4 pass
- Zero TypeScript errors across entire monorepo
- Zero lint warnings/errors
- All apps build successfully
- No regressions in sample-app or auth-server
PROMPT

read -r -d '' PROMPT_06 <<'PROMPT' || true
You are the QA Agent. Use your browser tool to test the Bastion UI.
Base URL: http://localhost:5173

Read AGENTS.md before starting.

TEST CASE: Register a new organization via the redesigned sign-up page, verify the tenant is
created, the user is an admin of that tenant, and the correct post-registration state is shown.

PRECONDITION: Auth-server running on :3000, bastion-ui running on :5173, Docker infrastructure up.

STEPS:
1. Navigate to http://localhost:5173/sign-up
   → VERIFY: Page title is "Create Your Organization" (not "Sign Up" or "Create Account")
   → VERIFY: Form has fields: Organization Name, Email, Display Name, Password, Confirm Password

2. Type "Acme Corp" into the Organization Name field
   → VERIFY: Slug preview appears below the field showing "acme-corp"

3. Fill in the remaining fields:
   - Email: acme@test.dev
   - Display Name: Acme Admin
   - Password: AcmeAdmin123!
   - Confirm Password: AcmeAdmin123!
   Click "Create Organization" button
   → VERIFY: No error messages appear
   → VERIFY: Redirected to /admin/getting-started OR /admin/dashboard

4. Check the tenant context:
   → VERIFY: Tenant switcher in topbar shows "Acme Corp" (not empty or "Select Tenant")

5. Check the sidebar:
   → VERIFY: Navigation items visible: Dashboard, Getting Started, Users, Clients, Roles, Sessions, Settings
   → VERIFY: "Tenants" nav item is NOT visible (tenant admin, not platform admin)

6. Check the topbar:
   → VERIFY: "Platform Admin" badge is NOT visible (register-tenant does not grant platform admin)

7. Navigate to http://localhost:5173/admin/dashboard
   → VERIFY: Dashboard loads without 403 or 500 errors
   → VERIFY: Welcome banner or Getting Started card is visible (new tenant with 0 clients)

IF ANY STEP FAILS:
1. Take a screenshot
2. Check auth-server logs: read /tmp/auth-server.log (last 50 lines)
3. Check browser console for errors (use list_console_messages)
4. Read relevant source files to identify the issue
5. Fix the code
6. Run: pnpm --filter @bastion/bastion-ui typecheck && pnpm --filter @bastion/bastion-ui lint
7. If backend changed: pnpm --filter @bastion/auth-server typecheck && restart server
8. Re-test from the failing step

DONE WHEN: Organization registered, tenant switcher shows "Acme Corp", sidebar has no "Tenants"
item, no "Platform Admin" badge, dashboard loads with welcome state.
PROMPT

read -r -d '' PROMPT_07 <<'PROMPT' || true
You are the QA Agent. Use your browser tool to test the Bastion UI.
Base URL: http://localhost:5173

Read AGENTS.md before starting.

TEST CASE: As the tenant admin from Step 6, create a user, create a role, assign the role to
the user, and verify the management features work within the tenant context.

PRECONDITION: Signed in as "Acme Admin" (acme@test.dev) from Step 6. Tenant is "Acme Corp".

STEPS:
1. Navigate to http://localhost:5173/admin/users
   → VERIFY: Users list page loads
   → VERIFY: At least 1 user visible (the admin user acme@test.dev)

2. Click "Create User" button
   → VERIFY: User creation form appears
   Fill in:
   - Email: member@acme.dev
   - Password: Member123!
   - Display Name: Team Member
   Click submit / create
   → VERIFY: Success message or toast
   → VERIFY: Redirected to user list or user detail

3. Navigate to http://localhost:5173/admin/users
   → VERIFY: Users list now shows 2 users (Acme Admin + Team Member)
   → VERIFY: member@acme.dev is visible in the list

4. Navigate to http://localhost:5173/admin/roles
   → VERIFY: Roles list page loads

5. Click "Create Role" button
   → VERIFY: Role creation form appears
   Fill in:
   - Name: editor
   - Description: Can edit resources within the organization
   Click submit / create
   → VERIFY: Success message
   → VERIFY: "editor" role appears in the roles list

6. Navigate back to users list, click on "Team Member" (member@acme.dev)
   → VERIFY: User detail page loads with user info

7. Find the role assignment section (may be a tab, dropdown, or button)
   Assign the "editor" role to this user
   → VERIFY: Success message
   → VERIFY: The "editor" role appears on the user's detail page

8. Navigate back to http://localhost:5173/admin/users
   → VERIFY: Users list still shows 2 users
   → VERIFY: No errors or permission issues

IF ANY STEP FAILS:
1. Take a screenshot
2. Check auth-server logs for request/response details
3. Check browser console for errors
4. If 403: check OpenFGA tuples — acme@test.dev should have admin → tenant:{acmeTenantId}
5. Fix code, validate, restart if needed, re-test

DONE WHEN: Created user member@acme.dev, created role "editor", assigned role to user,
users list shows 2 users, role visible on user detail.
PROMPT

read -r -d '' PROMPT_08 <<'PROMPT' || true
You are the QA Agent. Use your browser tool to test the Bastion UI.
Base URL: http://localhost:5173

Read AGENTS.md before starting.

TEST CASE: As the tenant admin, create an OAuth client application and verify client details.

PRECONDITION: Signed in as "Acme Admin" (acme@test.dev) from Step 6. Tenant is "Acme Corp".

STEPS:
1. Navigate to http://localhost:5173/admin/clients
   → VERIFY: Clients list page loads
   → VERIFY: May be empty (no clients yet for this new tenant)

2. Click "Create Client" button
   → VERIFY: Client creation form appears

3. Fill in the form:
   - Name: Acme Web App
   - Type: SPA (or "Single Page Application" if shown as full text)
   - Redirect URI: http://localhost:3000/callback
   Click submit / create
   → VERIFY: Success message or toast
   → VERIFY: Client detail page shown OR redirected to clients list

4. If on client detail, verify:
   → VERIFY: Client name shows "Acme Web App"
   → VERIFY: Client ID is displayed (a UUID)
   → VERIFY: Type badge shows "SPA" or equivalent
   → VERIFY: Redirect URI shows http://localhost:3000/callback

5. Navigate to http://localhost:5173/admin/clients
   → VERIFY: Clients list shows "Acme Web App"
   → VERIFY: Type column shows "SPA"

6. Click on "Acme Web App" in the list
   → VERIFY: Client detail page loads with full configuration
   → VERIFY: Client ID is a valid UUID (not placeholder)

IF ANY STEP FAILS:
1. Take a screenshot
2. Check auth-server logs for client creation request/response
3. Check if the admin route requires specific permission check
4. Fix code, validate, restart if needed, re-test

DONE WHEN: Client "Acme Web App" created, detail shows Client ID and type badge,
client list shows the new client.
PROMPT

read -r -d '' PROMPT_09 <<'PROMPT' || true
You are the QA Agent. Use your browser tool to test the Bastion UI.
Base URL: http://localhost:5173

Read AGENTS.md before starting.

TEST CASE: Walk through the complete Getting Started wizard, verify all 5 steps work with
real data (real tenant ID, real client ID, working copy buttons, valid code snippets).

PRECONDITION: Signed in as "Acme Admin". Tenant "Acme Corp" has at least one client
("Acme Web App" from Step 8).

STEPS:
1. Navigate to http://localhost:5173/admin/getting-started
   → VERIFY: Wizard loads with step progress indicator
   → VERIFY: Step 1 is active

2. Step 1 — "Create Your First Client" or "Choose a Client":
   → VERIFY: Existing client "Acme Web App" is shown as a selectable option
   Select "Acme Web App"
   Click "Next"
   → VERIFY: Advances to Step 2

3. Step 2 — "Your Credentials":
   → VERIFY: Tenant ID is displayed (a real UUID, not a placeholder like "your-tenant-id")
   → VERIFY: Client ID is displayed (a real UUID matching the selected client)
   → VERIFY: Both values are in monospace bordered boxes
   → VERIFY: Copy buttons are present next to each value
   Click the Copy button for Tenant ID
   → VERIFY: Toast or visual feedback indicates "Copied!" (check clipboard if possible)
   Click "Next"
   → VERIFY: Advances to Step 3

4. Step 3 — "Install the SDK":
   → VERIFY: Package manager tabs visible (npm / pnpm / yarn or similar)
   → VERIFY: Code block shows install command (e.g., npm install @bastion/auth-sdk)
   → VERIFY: Copy button present
   Click "Next"
   → VERIFY: Advances to Step 4

5. Step 4 — "Add Authentication":
   → VERIFY: Framework tabs visible (React / Next.js / Fastify / Express or similar)
   → VERIFY: Code snippet is visible with actual tenant ID and client ID interpolated
   → VERIFY: The UUIDs in the code match the values from Step 2 (not hardcoded placeholders)
   Click "Next"
   → VERIFY: Advances to Step 5

6. Step 5 — "Test It Out":
   → VERIFY: Verification checklist or guidance is shown
   → VERIFY: Link to "View your users" navigates to /admin/users
   → VERIFY: "Go to Dashboard" button is present
   Click "Go to Dashboard"
   → VERIFY: Navigated to /admin/dashboard

7. Navigate back to /admin/getting-started
   → VERIFY: Wizard resets to Step 1 (state is not persisted)
   Click "Back" on Step 1
   → VERIFY: Nothing happens (Back disabled or hidden on Step 1)

IF ANY STEP FAILS:
1. Take a screenshot
2. Check if tenant store has currentTenantId populated
3. Check if client data is loaded from the API
4. Read apps/bastion-ui/src/pages/admin/getting-started.tsx
5. Fix code, validate, re-test

DONE WHEN: All 5 wizard steps work with real data, copy buttons functional, code snippets
contain actual UUIDs, Back/Next navigation works correctly.
PROMPT

read -r -d '' PROMPT_10 <<'PROMPT' || true
You are the QA Agent. Use your browser tool to test permission isolation for tenant admins.
Base URL: http://localhost:5173

Read AGENTS.md before starting.

TEST CASE: Verify that a tenant admin CANNOT access platform-level features, CANNOT see
platform admin UI elements, and is blocked from navigating to restricted pages.

PRECONDITION: Signed in as "Acme Admin" (acme@test.dev) — a tenant admin who was created
via register-tenant (NOT a platform admin).

STEPS:
1. Check the sidebar navigation:
   → VERIFY: "Tenants" nav item is NOT visible in the sidebar
   → VERIFY: These items ARE visible: Dashboard, Users, Clients, Roles, Sessions, Settings

2. Check the topbar:
   → VERIFY: "Platform Admin" badge is NOT visible anywhere
   → VERIFY: Tenant switcher shows "Acme Corp" (the only tenant for this user)

3. Navigate directly to http://localhost:5173/admin/tenants
   → VERIFY: Access Denied page is shown OR user is redirected to dashboard
   → VERIFY: No crash, no blank page, no console errors
   → VERIFY: The page shows a helpful message (e.g., "You don't have permission to access this page")

4. Navigate directly to http://localhost:5173/admin/tenants/new
   → VERIFY: Access Denied page or redirect (same behavior as step 3)

5. Use evaluate_script to test API-level isolation:
   Execute in browser:
   fetch('/api/v1/admin/tenants', {
     headers: {
       'Authorization': 'Bearer ' + JSON.parse(sessionStorage.getItem('bastion-auth') || localStorage.getItem('bastion-auth') || '{}')?.state?.accessToken,
       'Content-Type': 'application/json'
     }
   }).then(r => ({ status: r.status, ok: r.ok }))
   → VERIFY: Response status is 403 (Forbidden), not 200

6. Navigate to http://localhost:5173/admin/users
   → VERIFY: Users list loads successfully (tenant admin CAN manage own users)
   → VERIFY: Shows users from "Acme Corp" tenant only

7. Navigate to http://localhost:5173/admin/clients
   → VERIFY: Clients list loads successfully (tenant admin CAN manage own clients)

8. Navigate to http://localhost:5173/admin/roles
   → VERIFY: Roles list loads successfully (tenant admin CAN manage own roles)

9. If the dashboard has an "All Tenants" tab or cross-tenant overview:
   → VERIFY: "All Tenants" tab is NOT visible for tenant admins
   → VERIFY: Dashboard shows data only for "Acme Corp"

IF ANY STEP FAILS:
1. Take a screenshot
2. Check isPlatformAdmin value in tenant store (should be false)
3. Check PermissionRoute component logic
4. Check sidebar permission filtering
5. Check OpenFGA tuples for the user (should NOT have system:platform)
6. Fix code, validate, restart if needed, re-test

DONE WHEN:
- Sidebar hides "Tenants" for tenant admin
- No "Platform Admin" badge visible
- /admin/tenants shows Access Denied
- API call to /admin/tenants returns 403
- Tenant admin CAN access users, clients, roles within own tenant
- No cross-tenant data leakage
PROMPT

read -r -d '' PROMPT_11 <<'PROMPT' || true
You are the QA Agent. Use your browser tool to test the complete integration flow.
Base URLs: bastion-ui at http://localhost:5173, sample-app at http://localhost:5174

Read AGENTS.md before starting.

TEST CASE: Register a brand-new organization, create a client via the Getting Started wizard,
copy credentials, configure the sample-app, create a user, and sign in to the sample-app
with that user — verifying the entire tenant admin self-service flow end-to-end.

PRECONDITION: auth-server (:3000), bastion-ui (:5173), sample-app (:5174) all running.
Docker infrastructure up (Postgres, Valkey, OpenFGA).

STEPS:
1. SIGN OUT of any existing session in bastion-ui:
   Navigate to http://localhost:5173, if signed in click Sign Out
   → VERIFY: Redirected to /sign-in

2. REGISTER NEW ORGANIZATION:
   Navigate to http://localhost:5173/sign-up
   Fill in:
   - Organization Name: Integration Corp
   - Email: integration@test.dev
   - Display Name: Integration Admin
   - Password: IntegrationAdmin123!
   - Confirm Password: IntegrationAdmin123!
   Click "Create Organization"
   → VERIFY: Redirected to getting-started or dashboard
   → VERIFY: Tenant switcher shows "Integration Corp"

3. CREATE CLIENT via Getting Started wizard:
   Navigate to http://localhost:5173/admin/getting-started
   In Step 1: create a new client:
   - Name: Integration Test App
   - Type: SPA
   - Redirect URI: http://localhost:5174/callback (or http://localhost:3000/callback)
   → VERIFY: Client created successfully
   Proceed to Step 2

4. COPY CREDENTIALS:
   In Step 2, note the Tenant ID and Client ID displayed
   → VERIFY: Both are real UUIDs (not placeholders)
   Use evaluate_script to capture the values if needed for later steps

5. NAVIGATE TO SAMPLE APP:
   Navigate to http://localhost:5174
   → VERIFY: Redirected to /setup page (if not configured) or home page

6. CONFIGURE SAMPLE APP:
   On the setup page (or if the app has a configuration mechanism):
   - Enter the Tenant ID from Step 4
   - Enter the Client ID from Step 4
   - Leave API Base URL empty (uses proxy)
   Click "Save & Connect" or equivalent
   → VERIFY: Configuration saved
   → VERIFY: Redirected to /sign-in

7. CREATE A USER for sample-app sign-in:
   Switch back to bastion-ui at http://localhost:5173
   Navigate to /admin/users → Click "Create User"
   - Email: sample-user@integration.dev
   - Password: SampleUser123!
   - Display Name: Sample User
   → VERIFY: User created successfully

8. SIGN IN TO SAMPLE APP:
   Navigate to http://localhost:5174/sign-in
   Enter:
   - Email: sample-user@integration.dev
   - Password: SampleUser123!
   Click Sign In
   → VERIFY: No error messages
   → VERIFY: Redirected to /dashboard

9. VERIFY SAMPLE APP CONTEXT:
   On the sample-app dashboard:
   → VERIFY: User info is visible (email, display name)
   → VERIFY: Tenant context matches "Integration Corp" tenant
   → VERIFY: JWT claims show the correct tenant_id

IF ANY STEP FAILS:
1. Take a screenshot and note which step failed
2. Check auth-server logs: read /tmp/auth-server.log (last 50 lines)
3. Check browser console for errors in both bastion-ui and sample-app
4. Check sample-app config store in localStorage
5. If CORS errors: check auth-server CORS config for sample-app origin
6. If 401 on sample-app sign-in: verify the user was created in the correct tenant
7. Fix code, validate, restart services if needed, re-test from the failed step

DONE WHEN:
- New organization "Integration Corp" registered via self-service
- Client created via Getting Started wizard
- Credentials copied to sample-app
- User created in bastion-ui for the new tenant
- User can sign in to sample-app with correct tenant context
- Complete self-service flow works end-to-end without platform admin involvement
PROMPT

# ============================================================================
# CLI
# ============================================================================

init_state

RUN_MODE="all"
SINGLE_STEP=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --reset)
      echo '{}' > "$STATE_FILE"
      rm -f "$LOG_DIR"/*.log "$LOG_DIR"/*.prompt.txt
      success "State reset. All steps marked as pending."
      show_dashboard
      exit 0
      ;;
    --status)
      fix_stale_running
      show_dashboard
      exit 0
      ;;
    --retry)
      log "Resetting failed/interrupted steps..."
      for step in "${ALL_STEPS[@]}"; do
        local_s=$(get_step_status "$step")
        if [[ "$local_s" == "failed" || "$local_s" == "interrupted" ]]; then
          set_step_status "$step" "pending"
          log "  Reset $step → pending"
        fi
      done
      ;;
    --build-only)
      RUN_MODE="build"
      ;;
    --tests-only)
      RUN_MODE="tests"
      ;;
    --step)
      shift
      SINGLE_STEP="$1"
      RUN_MODE="single"
      ;;
    *)
      echo "Usage: $0 [--reset|--status|--retry|--build-only|--tests-only|--step N]"
      exit 1
      ;;
  esac
  shift
done

fix_stale_running
show_dashboard
log "Starting Tenant Admin PromptBook execution (mode: $RUN_MODE)..."
log "State file: $STATE_FILE"
log "Logs: $LOG_DIR"
echo ""

# ============================================================================
# Step runner helper
# ============================================================================

run_step_if_ready() {
  local step="$1"
  local prompt="$2"
  if deps_met "$step"; then
    run_prompt "$step" "$prompt" || {
      fail "Stopping: $step failed. Fix and re-run the script."
      show_dashboard
      exit 1
    }
  else
    warn "Skipping $step — dependencies not met"
  fi
}

declare -A STEP_NUM_MAP=(
  [1]="ta-step-01-register-tenant"
  [2]="ta-step-02-signup-redesign"
  [3]="ta-step-03-isolation-tests"
  [4]="ta-step-04-onboarding-polish"
  [5]="ta-step-05-regression-polish"
  [6]="ta-step-06-test-registration"
  [7]="ta-step-07-test-user-role-mgmt"
  [8]="ta-step-08-test-client-creation"
  [9]="ta-step-09-test-wizard"
  [10]="ta-step-10-test-permission-isolation"
  [11]="ta-step-11-test-full-integration"
)

declare -A STEP_PROMPT_MAP=(
  ["ta-step-01-register-tenant"]="$PROMPT_01"
  ["ta-step-02-signup-redesign"]="$PROMPT_02"
  ["ta-step-03-isolation-tests"]="$PROMPT_03"
  ["ta-step-04-onboarding-polish"]="$PROMPT_04"
  ["ta-step-05-regression-polish"]="$PROMPT_05"
  ["ta-step-06-test-registration"]="$PROMPT_06"
  ["ta-step-07-test-user-role-mgmt"]="$PROMPT_07"
  ["ta-step-08-test-client-creation"]="$PROMPT_08"
  ["ta-step-09-test-wizard"]="$PROMPT_09"
  ["ta-step-10-test-permission-isolation"]="$PROMPT_10"
  ["ta-step-11-test-full-integration"]="$PROMPT_11"
)

# ============================================================================
# EXECUTION
# ============================================================================

case "$RUN_MODE" in
  single)
    if [[ -z "$SINGLE_STEP" ]]; then
      fail "No step number provided. Usage: --step N"
      exit 1
    fi
    step_id="${STEP_NUM_MAP[$SINGLE_STEP]:-}"
    if [[ -z "$step_id" ]]; then
      fail "Invalid step number: $SINGLE_STEP (valid: 1-11)"
      exit 1
    fi

    # Auto-start services for test steps
    if [[ "$SINGLE_STEP" -ge 6 ]]; then
      ensure_services || exit 1
    fi

    prompt="${STEP_PROMPT_MAP[$step_id]}"
    run_prompt "$step_id" "$prompt" || {
      fail "Step $SINGLE_STEP failed."
      show_dashboard
      exit 1
    }
    ;;

  build)
    for step in "${BUILD_STEPS[@]}"; do
      run_step_if_ready "$step" "${STEP_PROMPT_MAP[$step]}"
    done
    ;;

  tests)
    ensure_services || exit 1
    for step in "${TEST_STEPS[@]}"; do
      run_step_if_ready "$step" "${STEP_PROMPT_MAP[$step]}"
    done
    ;;

  all)
    for step in "${BUILD_STEPS[@]}"; do
      run_step_if_ready "$step" "${STEP_PROMPT_MAP[$step]}"
    done

    log "Build steps complete. Starting services for browser tests..."
    ensure_services || {
      warn "Could not start services. Run manually then re-run: $0 --tests-only"
      show_dashboard
      exit 0
    }

    for step in "${TEST_STEPS[@]}"; do
      run_step_if_ready "$step" "${STEP_PROMPT_MAP[$step]}"
    done
    ;;
esac

# ============================================================================
# DONE
# ============================================================================

rm -f "$PID_FILE"
echo ""
show_dashboard
success "Tenant Admin PromptBook execution complete!"
