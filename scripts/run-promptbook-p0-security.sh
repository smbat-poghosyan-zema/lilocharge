#!/usr/bin/env bash
set -uo pipefail

# ============================================================================
# LiloCharge P0 Security Fix PromptBook Runner
#
# Implements three P0 security fixes:
#   - P0-1: JWT auth guard + global route protection
#   - P0-2: Redis nearby cache invalidation fix
#   - P0-3: Rate limiting (OTP SMS flood prevention)
# Plus a test suite covering all three fixes.
#
# Features:
#   - Persistent state: tracks done/running/failed/pending per step
#   - Resumable: re-run the script and it skips completed steps
#   - Interrupted steps: detects and continues from where Claude left off
#   - Process cleanup: SIGINT/SIGTERM kills child Claude processes
#   - Live feedback: real-time Claude output streamed to terminal + log file
#   - Dashboard: shows step statuses on start and after each step
#
# Usage:
#   ./scripts/run-promptbook-p0-security.sh              # Run all steps
#   ./scripts/run-promptbook-p0-security.sh --step 2     # Single step
#   ./scripts/run-promptbook-p0-security.sh --steps 1-3  # Step range
#   ./scripts/run-promptbook-p0-security.sh --reset      # Wipe state
#   ./scripts/run-promptbook-p0-security.sh --status     # Show status
#   ./scripts/run-promptbook-p0-security.sh --retry      # Retry failed/interrupted
#   ./scripts/run-promptbook-p0-security.sh --model MODEL # Use specific model
# ============================================================================

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROMPTBOOK="$PROJECT_DIR/PromptBook-LiloCharge-P0-Security.md"
STATE_FILE="$PROJECT_DIR/.promptbook-p0-security-state.json"
LOG_DIR="$PROJECT_DIR/logs/promptbook-p0-security"
PID_FILE="$PROJECT_DIR/.promptbook-p0-security-pids"
MODEL="${MODEL:-claude-opus-4-6}"
TOTAL_STEPS=4

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
  "p0-step-01-jwt-auth-guard"
  "p0-step-02-cache-invalidation"
  "p0-step-03-rate-limiting"
  "p0-step-04-test-suite"
)

declare -A STEP_NAMES=(
  ["p0-step-01-jwt-auth-guard"]="Step 1: JWT Auth Guard + Global Route Protection"
  ["p0-step-02-cache-invalidation"]="Step 2: Redis Nearby Cache Invalidation Fix"
  ["p0-step-03-rate-limiting"]="Step 3: Rate Limiting"
  ["p0-step-04-test-suite"]="Step 4: P0 Test Suite"
)

declare -A STEP_NUM_MAP=(
  [1]="p0-step-01-jwt-auth-guard"
  [2]="p0-step-02-cache-invalidation"
  [3]="p0-step-03-rate-limiting"
  [4]="p0-step-04-test-suite"
)

# ============================================================================
# Dashboard
# ============================================================================

show_dashboard() {
  echo ""
  echo -e "${BOLD}======== LiloCharge P0 Security Fix PromptBook ========${NC}"
  echo ""

  local done_count=0 running_count=0 failed_count=0 pending_count=0

  for step in "${ALL_STEPS[@]}"; do
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
    printf "  %-52s %b\n" "${STEP_NAMES[$step]}" "$icon"
  done

  echo ""
  echo -e "  ${GREEN}Done: $done_count${NC}  ${YELLOW}Running: $running_count${NC}  ${RED}Failed/Int: $failed_count${NC}  ${DIM}Pending: $pending_count${NC}  Total: ${TOTAL_STEPS}"
  echo -e "${BOLD}=======================================================${NC}"
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
# Claude Runner
# ============================================================================

run_prompt() {
  local step_name="$1"
  local step_number="$2"
  local log_file="$LOG_DIR/${step_name}.log"

  local status
  status=$(get_step_status "$step_name")

  # Skip completed
  if [[ "$status" == "done" ]]; then
    success "Skipping ${STEP_NAMES[$step_name]} (already done)"
    return 0
  fi

  # Extract the step prompt from the PromptBook
  local prompt
  prompt=$(python3 << PYEOF
import re, sys

with open('${PROMPTBOOK}') as f:
    content = f.read()

# Match "## Step N —" through the next "## Step" or "## Final" or end of file
pattern = r'## Step ${step_number} —.*?(?=\n## (?:Step|Final)|$)'
match = re.search(pattern, content, re.DOTALL)
if match:
    print(match.group(0).strip())
else:
    print('')
PYEOF
)

  if [[ -z "$prompt" ]]; then
    fail "Could not extract prompt for Step ${step_number} from ${PROMPTBOOK}"
    return 1
  fi

  # Prepend continuation notice for interrupted/failed steps
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
    --model "$MODEL" \
    --chrome \
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
# CLI argument parsing
# ============================================================================

init_state

RUN_MODE="all"
SINGLE_STEP=""
STEP_RANGE_START=""
STEP_RANGE_END=""

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
    --step)
      shift
      SINGLE_STEP="$1"
      RUN_MODE="single"
      ;;
    --steps)
      shift
      STEP_RANGE_START="${1%-*}"
      STEP_RANGE_END="${1#*-}"
      RUN_MODE="range"
      ;;
    --model)
      shift
      MODEL="$1"
      ;;
    *)
      echo "Usage: $0 [--reset|--status|--retry|--step N|--steps N-M|--model MODEL]"
      exit 1
      ;;
  esac
  shift
done

fix_stale_running
show_dashboard
log "Starting P0 Security PromptBook execution (mode: $RUN_MODE, model: $MODEL)..."
log "PromptBook: $PROMPTBOOK"
log "State file: $STATE_FILE"
log "Logs: $LOG_DIR"
echo ""

# ============================================================================
# Execution
# ============================================================================

run_step() {
  local num="$1"
  local step_id="${STEP_NUM_MAP[$num]:-}"
  if [[ -z "$step_id" ]]; then
    fail "Invalid step number: $num (valid: 1-${TOTAL_STEPS})"
    exit 1
  fi
  run_prompt "$step_id" "$num" || {
    fail "Stopping: step $num failed. Fix and re-run the script."
    show_dashboard
    exit 1
  }
}

case "$RUN_MODE" in
  single)
    if [[ -z "$SINGLE_STEP" ]]; then
      fail "No step number provided. Usage: --step N"
      exit 1
    fi
    run_step "$SINGLE_STEP"
    ;;

  range)
    if [[ -z "$STEP_RANGE_START" || -z "$STEP_RANGE_END" ]]; then
      fail "Invalid range. Usage: --steps N-M"
      exit 1
    fi
    for ((i=STEP_RANGE_START; i<=STEP_RANGE_END; i++)); do
      run_step "$i"
    done
    ;;

  all)
    for ((i=1; i<=TOTAL_STEPS; i++)); do
      run_step "$i"
    done
    ;;
esac

# ============================================================================
# Done
# ============================================================================

rm -f "$PID_FILE"
echo ""
show_dashboard
success "P0 Security PromptBook execution complete!"
