#!/usr/bin/env bash
set -uo pipefail

# ============================================================================
# LiloCharge QA & Polish PromptBook Runner — Claude Code CLI
#
# Executes PromptBook-LiloCharge-QA-Polish.md steps sequentially via Claude Code.
# Covers QA verification, bug fixes, UI polish, and production readiness.
#
# Features:
#   - Persistent state: tracks done/running/failed/pending per step
#   - Resumable: re-run the script and it skips completed steps
#   - Interrupted steps: detects and continues from where Claude left off
#   - Process cleanup: SIGINT/SIGTERM kills child Claude processes
#   - Live feedback: real-time Claude output streamed to terminal + log file
#   - Dashboard: shows step statuses on start and after each step
#   - Auto prompt extraction: parses prompts from PromptBook markdown
#   - Range support: run a range of steps with --steps 1-4
#
# Usage:
#   ./scripts/run-promptbook-qa-polish.sh              # Run all steps
#   ./scripts/run-promptbook-qa-polish.sh --fix-only   # Fix steps only (1-7)
#   ./scripts/run-promptbook-qa-polish.sh --report-only # Report step only (8)
#   ./scripts/run-promptbook-qa-polish.sh --step 3     # Single step
#   ./scripts/run-promptbook-qa-polish.sh --steps 1-4  # Range of steps
#   ./scripts/run-promptbook-qa-polish.sh --reset      # Wipe state
#   ./scripts/run-promptbook-qa-polish.sh --status     # Show status
#   ./scripts/run-promptbook-qa-polish.sh --retry      # Retry failed
#   ./scripts/run-promptbook-qa-polish.sh --model claude-sonnet-4-6  # Override model
# ============================================================================

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATE_FILE="$PROJECT_DIR/.promptbook-qa-polish-state.json"
LOG_DIR="$PROJECT_DIR/logs/promptbook-qa-polish"
PID_FILE="$PROJECT_DIR/.promptbook-qa-polish-pids"
PROMPTBOOK="$PROJECT_DIR/PromptBook-LiloCharge-QA-Polish.md"
PROMPTS_CACHE_DIR="$PROJECT_DIR/.promptbook-qa-polish-cache"

mkdir -p "$LOG_DIR" "$PROMPTS_CACHE_DIR"

# Default model (override with --model)
MODEL="claude-opus-4-6"

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
  log "Extracting prompts from QA & Polish PromptBook..."

  python3 << 'PYEOF'
import re, os, json

project_dir = os.environ.get('PROJECT_DIR', '.')
promptbook_path = os.path.join(project_dir, 'PromptBook-LiloCharge-QA-Polish.md')
cache_dir = os.path.join(project_dir, '.promptbook-qa-polish-cache')
os.makedirs(cache_dir, exist_ok=True)

with open(promptbook_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Split by step headers and parse each section individually
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
        prompt = f"""Read AGENTS.md fully. You are building Step {num} of LiloCharge QA & Polish.

STEP: {title}
GOAL: {goal}
{"WHY: " + why if why else ""}

CONTEXT:
This is step {num} of 8 in the LiloCharge QA & Polish PromptBook — fixing bugs, polishing UI,
and verifying production readiness of the LiloCharge EV charging platform for Armenia.
Previous steps have already been completed. Read the existing codebase to understand what
exists and follow established patterns exactly.

WHAT TO DO:
{hint}

INSTRUCTIONS:
1. Read AGENTS.md for coding standards and architecture guidelines
2. Read existing code to understand patterns before making changes
3. Implement the goal described above following existing patterns
4. Write or update tests as needed
5. Ensure TypeScript strict mode compliance (no any, no ts-ignore)
6. Run validation: pnpm typecheck && pnpm test
7. Fix ALL issues until every command passes with zero errors

CONSTRAINTS:
- Follow existing patterns in the codebase
- TypeScript strict mode, no any, no @ts-ignore
- Use existing shared types from @lilocharge/shared-types
- Do not introduce new dependencies unless absolutely necessary

DONE WHEN:
- All new code compiles without TypeScript errors
- All tests pass (new and existing)
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

TOTAL_STEPS=8
FIX_STEP_START=1
FIX_STEP_END=7
REPORT_STEP_START=8
REPORT_STEP_END=8

# Generate step arrays
ALL_STEPS=()
FIX_STEPS=()
REPORT_STEPS=()

for i in $(seq 1 $TOTAL_STEPS); do
  ALL_STEPS+=("$i")
  if [[ $i -le $FIX_STEP_END ]]; then
    FIX_STEPS+=("$i")
  else
    REPORT_STEPS+=("$i")
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
# Dependency Graph (linear: 1→2→3→4→5→6→7→8)
# ============================================================================

get_step_deps() {
  local step="$1"
  case "$step" in
    1)  echo "" ;;
    2)  echo "1" ;;
    3)  echo "2" ;;
    4)  echo "3" ;;
    5)  echo "4" ;;
    6)  echo "5" ;;
    7)  echo "6" ;;
    8)  echo "7" ;;
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
  echo -e "${BOLD}======== LiloCharge QA & Polish PromptBook ========${NC}"
  echo ""

  local done_count=0 running_count=0 failed_count=0 pending_count=0

  echo -e "  ${BOLD}--- Section 1: Fix & Verification Steps (1-7) ---${NC}"

  for step in "${FIX_STEPS[@]}"; do
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
  echo -e "  ${BOLD}--- Section 2: Production Readiness (8) ---${NC}"

  for step in "${REPORT_STEPS[@]}"; do
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
  echo -e "${BOLD}====================================================${NC}"
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
# Claude Code Runner
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
  log "Model: $MODEL"

  # Save the actual prompt sent
  echo "$prompt" > "$LOG_DIR/step-$(printf '%02d' "$step_num").prompt-sent.txt"

  set_step_status "$step_num" "running"

  # Build Claude Code command args
  local claude_args=(
    --dangerously-skip-permissions
    --model "$MODEL"
    --chrome
  )

  # Run Claude Code in non-interactive mode from the project directory
  (cd "$PROJECT_DIR" && claude -p "$prompt" "${claude_args[@]}") 2>&1 | tee "$log_file" &
  local claude_pid=$!
  register_pid "$claude_pid"
  set_step_status "$step_num" "running" "$claude_pid"

  local exit_code=0
  wait "$claude_pid" || exit_code=$?

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
    --fix-only)
      RUN_MODE="fix"
      ;;
    --report-only)
      RUN_MODE="report"
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
      MODEL="$1"
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --fix-only       Run fix & verification steps only (1-7)"
      echo "  --report-only    Run production readiness report step only (8)"
      echo "  --step N         Run a single step"
      echo "  --steps N-M      Run a range of steps (e.g., --steps 1-4)"
      echo "  --reset          Wipe state and start fresh"
      echo "  --status         Show current status dashboard"
      echo "  --retry          Reset failed/interrupted steps and continue"
      echo "  --model MODEL    Override Claude model (default: claude-opus-4-6)"
      echo "  -h, --help       Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--reset|--status|--retry|--fix-only|--report-only|--step N|--steps N-M|--model MODEL]"
      exit 1
      ;;
  esac
  shift
done

fix_stale_running
show_dashboard

log "Using model: $MODEL"

log "Starting LiloCharge QA & Polish PromptBook execution (mode: $RUN_MODE)..."
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
      fail "Invalid range. Usage: --steps N-M (e.g., --steps 1-4)"
      exit 1
    fi
    log "Running steps $RANGE_START to $RANGE_END..."
    for step in $(seq "$RANGE_START" "$RANGE_END"); do
      run_step_if_ready "$step"
    done
    ;;

  fix)
    log "Running fix & verification steps (1-7)..."
    for step in "${FIX_STEPS[@]}"; do
      run_step_if_ready "$step"
    done
    ;;

  report)
    log "Running production readiness report step (8)..."
    for step in "${REPORT_STEPS[@]}"; do
      run_step_if_ready "$step"
    done
    ;;

  all)
    log "Running all steps (1-8)..."
    for step in "${FIX_STEPS[@]}"; do
      run_step_if_ready "$step"
    done

    log "Fix steps complete. Starting production readiness report..."

    for step in "${REPORT_STEPS[@]}"; do
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
success "LiloCharge QA & Polish PromptBook execution complete!"
