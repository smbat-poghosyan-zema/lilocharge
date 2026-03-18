#!/usr/bin/env bash
set -uo pipefail

# ============================================================================
# LiloCharge PromptBook Runner — GitHub Copilot CLI
#
# Executes PromptBook-LiloCharge.md steps sequentially via GitHub Copilot CLI.
# Builds an EV Charging Super-App: React Native + NestJS + OCPP + Payments.
#
# Features:
#   - Persistent state: tracks done/running/failed/pending per step
#   - Resumable: re-run the script and it skips completed steps
#   - Interrupted steps: detects and continues from where Copilot left off
#   - Process cleanup: SIGINT/SIGTERM kills child Copilot processes
#   - Live feedback: real-time Copilot output streamed to terminal + log file
#   - Dashboard: shows step statuses on start and after each step
#   - Auto prompt extraction: parses prompts from PromptBook markdown
#   - Range support: run a range of steps with --steps 10-20
#
# Usage:
#   ./scripts/run-promptbook-lilocharge.sh              # Run all steps
#   ./scripts/run-promptbook-lilocharge.sh --build-only # Build steps only (1-50)
#   ./scripts/run-promptbook-lilocharge.sh --tests-only # Test steps only (51-70)
#   ./scripts/run-promptbook-lilocharge.sh --step 3     # Single step
#   ./scripts/run-promptbook-lilocharge.sh --steps 10-20 # Range of steps
#   ./scripts/run-promptbook-lilocharge.sh --reset      # Wipe state
#   ./scripts/run-promptbook-lilocharge.sh --status     # Show status
#   ./scripts/run-promptbook-lilocharge.sh --retry      # Retry failed
#   ./scripts/run-promptbook-lilocharge.sh --model claude-sonnet-4.6  # Override model
# ============================================================================

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATE_FILE="$PROJECT_DIR/.promptbook-lilocharge-state.json"
LOG_DIR="$PROJECT_DIR/logs/promptbook-lilocharge"
PID_FILE="$PROJECT_DIR/.promptbook-lilocharge-pids"
PROMPTBOOK="$PROJECT_DIR/PromptBook-LiloCharge (1).md"
PROMPTS_CACHE_DIR="$PROJECT_DIR/.promptbook-cache"

mkdir -p "$LOG_DIR" "$PROMPTS_CACHE_DIR"

# Default model (override with --model)
COPILOT_MODEL=""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

log()     { echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $1"; }
success() { echo -e "${GREEN}[$(date +%H:%M:%S)] ✓${NC} $1"; }
warn()    { echo -e "${YELLOW}[$(date +%H:%M:%S)] ⚠${NC} $1"; }
fail()    { echo -e "${RED}[$(date +%H:%M:%S)] ✗${NC} $1"; }

# ============================================================================
# Prompt Extraction from PromptBook Markdown
# ============================================================================

extract_prompts() {
  log "Extracting prompts from PromptBook..."

  python3 << 'PYEOF'
import re, os, json

project_dir = os.environ.get('PROJECT_DIR', '.')
promptbook_path = os.path.join(project_dir, 'PromptBook-LiloCharge (1).md')
cache_dir = os.path.join(project_dir, '.promptbook-cache')
os.makedirs(cache_dir, exist_ok=True)

with open(promptbook_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Split by step headers and parse each section individually
# This is more robust than a single giant regex
sections = re.split(r'(?=### Step \d+:)', content)

steps_info = {}

for section in sections:
    # Match step header
    header_match = re.match(r'### Step (\d+): (.+)', section)
    if not header_match:
        continue

    num = int(header_match.group(1))
    title = header_match.group(2).strip()

    # Extract Goal
    goal_match = re.search(r'\*\*Goal:\*\* (.+?)(?:\n\n|\n$)', section)
    goal = goal_match.group(1).strip() if goal_match else ''

    # Extract Why (optional)
    why_match = re.search(r'\*\*Why:\*\* (.+?)(?:\n\n|\n$)', section)
    why = why_match.group(1).strip() if why_match else ''

    # Extract code block (the prompt) - handle optional trailing spaces after ```
    code_match = re.search(r'```\s*\n(.*?)```', section, re.DOTALL)
    code_block = code_match.group(1).strip() if code_match else ''

    if not code_block:
        continue

    # Determine if this is a full prompt or abbreviated
    is_abbreviated = (
        len(code_block) < 500
        and (code_block.startswith('[') or 'truncated for brevity' in code_block)
    )

    if is_abbreviated:
        # Build a structured prompt from the abbreviated description
        hint = code_block.strip('[]')
        prompt = f"""Read AGENTS.md fully. You are building Step {num} of LiloCharge.

STEP: {title}
GOAL: {goal}
{"WHY: " + why if why else ""}

CONTEXT:
This is step {num} of 70 in building LiloCharge — a unified EV charging platform for Armenia.
Previous steps have already built the foundation. Read the existing codebase to understand
what exists and follow established patterns exactly.

WHAT TO BUILD:
{hint}

INSTRUCTIONS:
1. Read AGENTS.md for coding standards and architecture guidelines
2. Read existing code from previous steps to understand patterns
3. Implement the goal described above following existing patterns
4. Write unit tests for all new code
5. Ensure TypeScript strict mode compliance (no any, no ts-ignore)
6. Run validation: pnpm typecheck && pnpm lint && pnpm test
7. Fix ALL issues until every command passes with zero errors

CONSTRAINTS:
- Follow existing patterns in the codebase religiously
- TypeScript strict mode, no any, no @ts-ignore
- All new functions must have JSDoc comments
- All new code must have tests
- Never hardcode secrets or credentials
- Use existing shared types from @lilocharge/shared-types

DONE WHEN:
- All new code compiles without TypeScript errors
- All tests pass (new and existing)
- Lint passes with zero warnings
- The goal described above is fully implemented"""
    else:
        prompt = code_block

    steps_info[num] = {
        'title': title,
        'goal': goal,
        'why': why,
        'is_abbreviated': is_abbreviated,
    }

    # Write prompt to cache file
    prompt_file = os.path.join(cache_dir, f'step-{num:02d}.prompt.txt')
    with open(prompt_file, 'w', encoding='utf-8') as f:
        f.write(prompt)

# Write step metadata
meta_file = os.path.join(cache_dir, 'steps-meta.json')
with open(meta_file, 'w', encoding='utf-8') as f:
    json.dump(steps_info, f, indent=2)

print(f"Extracted {len(steps_info)} steps")
PYEOF
}

# Extract prompts if cache is stale or missing
if [[ ! -f "$PROMPTS_CACHE_DIR/steps-meta.json" ]] || \
   [[ "$PROMPTBOOK" -nt "$PROMPTS_CACHE_DIR/steps-meta.json" ]]; then
  export PROJECT_DIR
  extract_prompts
else
  log "Using cached prompts (PromptBook unchanged)"
fi

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
print(state.get('step-${1}', {}).get('status', 'pending'))
"
}

get_step_field() {
  python3 -c "
import json
with open('${STATE_FILE}') as f:
    state = json.load(f)
print(state.get('step-${1}', {}).get('${2}', ''))
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

key = 'step-${step}'
if key not in state:
    state[key] = {}

state[key]['status'] = '${status}'
state[key]['updated_at'] = datetime.datetime.now().isoformat()

if '${status}' == 'running':
    state[key]['started_at'] = datetime.datetime.now().isoformat()
elif '${status}' == 'done':
    state[key]['finished_at'] = datetime.datetime.now().isoformat()
elif '${status}' == 'failed':
    state[key]['failed_at'] = datetime.datetime.now().isoformat()

pid_val = '${pid_val}'
if pid_val:
    state[key]['pid'] = pid_val

# Atomic write
dir_name = os.path.dirname('${STATE_FILE}')
fd, tmp = tempfile.mkstemp(dir=dir_name, suffix='.tmp')
with os.fdopen(fd, 'w') as f:
    json.dump(state, f, indent=2)
os.replace(tmp, '${STATE_FILE}')
PYEOF
}

# ============================================================================
# Step Registry
# ============================================================================

TOTAL_STEPS=70
BUILD_STEP_START=1
BUILD_STEP_END=50
TEST_STEP_START=51
TEST_STEP_END=70

# Generate step arrays
ALL_STEPS=()
BUILD_STEPS=()
TEST_STEPS=()

for i in $(seq 1 $TOTAL_STEPS); do
  ALL_STEPS+=("$i")
  if [[ $i -le $BUILD_STEP_END ]]; then
    BUILD_STEPS+=("$i")
  else
    TEST_STEPS+=("$i")
  fi
done

# Step names (loaded from cache)
get_step_name() {
  python3 -c "
import json
with open('${PROMPTS_CACHE_DIR}/steps-meta.json') as f:
    meta = json.load(f)
info = meta.get('${1}', {})
print(f\"Step ${1}: {info.get('title', 'Unknown')}\")
"
}

# ============================================================================
# Dependency Graph (from PromptBook appendix)
# ============================================================================

get_step_deps() {
  local step="$1"
  case "$step" in
    1)  echo "" ;;
    2)  echo "1" ;;
    3)  echo "2" ;;
    4)  echo "3" ;;
    5)  echo "4" ;;
    6)  echo "4" ;;
    7)  echo "5 6" ;;
    8)  echo "7" ;;
    9)  echo "8" ;;
    10) echo "9" ;;
    11) echo "2" ;;
    12) echo "11" ;;
    13) echo "12" ;;
    14) echo "13" ;;
    15) echo "1" ;;     # CI/CD can run after monorepo init
    16) echo "7" ;;
    17) echo "16" ;;
    18) echo "17" ;;
    19) echo "18" ;;
    20) echo "14" ;;    # Mobile mapbox needs mobile scaffolding + API client
    21) echo "20" ;;
    22) echo "21" ;;
    23) echo "22" ;;
    24) echo "23" ;;
    25) echo "24" ;;
    26) echo "7" ;;
    27) echo "26" ;;
    28) echo "27" ;;
    29) echo "28" ;;
    30) echo "29" ;;
    31) echo "30" ;;
    32) echo "7" ;;
    33) echo "32" ;;
    34) echo "33" ;;
    35) echo "34" ;;
    36) echo "35" ;;
    37) echo "36" ;;
    38) echo "33" ;;    # Real-time needs sessions
    39) echo "38" ;;
    40) echo "33" ;;
    41) echo "25" ;;    # Reviews needs community/mobile features
    42) echo "41" ;;
    43) echo "42" ;;
    44) echo "37" ;;    # Wallet needs payments done
    45) echo "44" ;;
    46) echo "45 43" ;; # Mobile optimization needs all mobile features
    47) echo "46" ;;    # Backend optimization after all features
    48) echo "47" ;;
    49) echo "48" ;;
    50) echo "49" ;;
    # Test steps require all build steps complete
    51) echo "50" ;;
    52) echo "50" ;;
    53) echo "50" ;;
    54) echo "50" ;;
    55) echo "50" ;;
    56) echo "50" ;;
    57) echo "50" ;;
    58) echo "50" ;;
    59) echo "50" ;;
    60) echo "50" ;;
    61) echo "50" ;;
    62) echo "50" ;;
    63) echo "50" ;;
    64) echo "50" ;;
    65) echo "50" ;;
    66) echo "50" ;;
    67) echo "50" ;;
    68) echo "50" ;;
    69) echo "50" ;;
    70) echo "50" ;;
    *)  echo "" ;;
  esac
}

deps_met() {
  local deps
  deps=$(get_step_deps "$1")
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
  echo -e "${BOLD}============ LiloCharge PromptBook ============${NC}"
  echo ""

  local done_count=0 running_count=0 failed_count=0 pending_count=0

  # Build steps grouped by category
  local categories=(
    "Infrastructure:1-3"
    "Database/Schema:4-6"
    "Backend Core:7-10"
    "Mobile Core:11-14"
    "CI/CD:15"
    "Stations & Maps:16-25"
    "OCPP:26-31"
    "Sessions & Payments:32-40"
    "Community:41-43"
    "Wallet:44-45"
    "Optimization & Deploy:46-50"
  )

  echo -e "  ${BOLD}--- Build Steps (1-50) ---${NC}"

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
    local name
    name=$(get_step_name "$step" 2>/dev/null || echo "Step $step")
    printf "  %-55s %b\n" "$name" "$icon"
  done

  echo ""
  echo -e "  ${BOLD}--- Test Steps (51-70) ---${NC}"

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
    local name
    name=$(get_step_name "$step" 2>/dev/null || echo "Step $step")
    printf "  %-55s %b\n" "$name" "$icon"
  done

  echo ""
  echo -e "  ${GREEN}Done: $done_count${NC}  ${YELLOW}Running: $running_count${NC}  ${RED}Failed/Int: $failed_count${NC}  ${DIM}Pending: $pending_count${NC}  Total: ${#ALL_STEPS[@]}"
  echo -e "${BOLD}================================================${NC}"
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
      warn "Marked step $step as interrupted"
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
# Copilot Runner
# ============================================================================

run_prompt() {
  local step_num="$1"
  local prompt_file="$PROMPTS_CACHE_DIR/step-$(printf '%02d' "$step_num").prompt.txt"
  local log_file="$LOG_DIR/step-$(printf '%02d' "$step_num").log"

  if [[ ! -f "$prompt_file" ]]; then
    fail "No prompt file found for step $step_num: $prompt_file"
    return 1
  fi

  local status
  status=$(get_step_status "$step_num")

  # Skip completed
  if [[ "$status" == "done" ]]; then
    local name
    name=$(get_step_name "$step_num" 2>/dev/null || echo "Step $step_num")
    success "Skipping $name (already done)"
    return 0
  fi

  # Read the prompt
  local prompt
  prompt=$(<"$prompt_file")

  # Prepend continuation notice for interrupted/failed
  if [[ "$status" == "interrupted" || "$status" == "failed" ]]; then
    local name
    name=$(get_step_name "$step_num" 2>/dev/null || echo "Step $step_num")
    warn "$name was previously ${status} — continuing"
    prompt="IMPORTANT: This step was previously started but interrupted. Check what files and code already exist in the project. Do NOT recreate or overwrite files that already exist and are correct. Continue from where the previous run left off and complete the remaining work.

${prompt}"
  fi

  local name
  name=$(get_step_name "$step_num" 2>/dev/null || echo "Step $step_num")
  log "Starting: $name"

  # Save the actual prompt sent
  echo "$prompt" > "$LOG_DIR/step-$(printf '%02d' "$step_num").prompt-sent.txt"

  set_step_status "$step_num" "running"

  # Build copilot command args
  local copilot_args=(
    --yolo
    --no-ask-user
    --no-auto-update
  )

  if [[ -n "$COPILOT_MODEL" ]]; then
    copilot_args+=(--model "$COPILOT_MODEL")
  fi

  # Run copilot in non-interactive mode from the project directory
  # Pass prompt via -p flag directly (copilot handles long prompts)
  (cd "$PROJECT_DIR" && copilot -p "$prompt" "${copilot_args[@]}") 2>&1 | tee "$log_file" &
  local copilot_pid=$!
  register_pid "$copilot_pid"
  set_step_status "$step_num" "running" "$copilot_pid"

  local exit_code=0
  wait "$copilot_pid" || exit_code=$?

  if [[ $exit_code -eq 0 ]]; then
    set_step_status "$step_num" "done"
    success "$name completed"
    echo ""
    return 0
  else
    set_step_status "$step_num" "failed"
    fail "$name FAILED (exit code $exit_code, see $log_file)"
    echo ""
    return 1
  fi
}

# ============================================================================
# Step runner helper
# ============================================================================

run_step_if_ready() {
  local step="$1"
  if deps_met "$step"; then
    run_prompt "$step" || {
      fail "Stopping: step $step failed. Fix and re-run the script."
      show_dashboard
      exit 1
    }
  else
    local name
    name=$(get_step_name "$step" 2>/dev/null || echo "Step $step")
    warn "Skipping $name — dependencies not met"
  fi
}

# ============================================================================
# CLI
# ============================================================================

init_state

RUN_MODE="all"
SINGLE_STEP=""
RANGE_START=""
RANGE_END=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --reset)
      echo '{}' > "$STATE_FILE"
      rm -f "$LOG_DIR"/*.log "$LOG_DIR"/*.prompt-sent.txt
      rm -rf "$PROMPTS_CACHE_DIR"
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
          log "  Reset step $step → pending"
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
    --steps)
      shift
      RUN_MODE="range"
      RANGE_START="${1%%-*}"
      RANGE_END="${1##*-}"
      ;;
    --model)
      shift
      COPILOT_MODEL="$1"
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --build-only     Run build steps only (1-50)"
      echo "  --tests-only     Run test steps only (51-70)"
      echo "  --step N         Run a single step"
      echo "  --steps N-M      Run a range of steps (e.g., 10-20)"
      echo "  --reset          Wipe state and start fresh"
      echo "  --status         Show current status dashboard"
      echo "  --retry          Reset failed/interrupted steps and continue"
      echo "  --model MODEL    Override Copilot model (e.g., claude-sonnet-4.6, gpt-5, claude-opus-4.6)"
      echo "  -h, --help       Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--reset|--status|--retry|--build-only|--tests-only|--step N|--steps N-M|--model MODEL]"
      exit 1
      ;;
  esac
  shift
done

fix_stale_running
show_dashboard

if [[ -n "$COPILOT_MODEL" ]]; then
  log "Using model: $COPILOT_MODEL"
fi

log "Starting LiloCharge PromptBook execution (mode: $RUN_MODE)..."
log "State file: $STATE_FILE"
log "Logs: $LOG_DIR"
echo ""

# ============================================================================
# EXECUTION
# ============================================================================

case "$RUN_MODE" in
  single)
    if [[ -z "$SINGLE_STEP" ]]; then
      fail "No step number provided. Usage: --step N"
      exit 1
    fi
    if [[ "$SINGLE_STEP" -lt 1 || "$SINGLE_STEP" -gt "$TOTAL_STEPS" ]]; then
      fail "Invalid step number: $SINGLE_STEP (valid: 1-$TOTAL_STEPS)"
      exit 1
    fi
    run_prompt "$SINGLE_STEP" || {
      fail "Step $SINGLE_STEP failed."
      show_dashboard
      exit 1
    }
    ;;

  range)
    if [[ -z "$RANGE_START" || -z "$RANGE_END" ]]; then
      fail "Invalid range. Usage: --steps N-M (e.g., --steps 10-20)"
      exit 1
    fi
    log "Running steps $RANGE_START to $RANGE_END..."
    for step in $(seq "$RANGE_START" "$RANGE_END"); do
      run_step_if_ready "$step"
    done
    ;;

  build)
    for step in "${BUILD_STEPS[@]}"; do
      run_step_if_ready "$step"
    done
    ;;

  tests)
    log "Starting test steps (51-70)..."
    for step in "${TEST_STEPS[@]}"; do
      run_step_if_ready "$step"
    done
    ;;

  all)
    for step in "${BUILD_STEPS[@]}"; do
      run_step_if_ready "$step"
    done

    log "Build steps complete. Starting test steps..."

    for step in "${TEST_STEPS[@]}"; do
      run_step_if_ready "$step"
    done
    ;;
esac

# ============================================================================
# DONE
# ============================================================================

rm -f "$PID_FILE"
echo ""
show_dashboard
success "LiloCharge PromptBook execution complete!"
