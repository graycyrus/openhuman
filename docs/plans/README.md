# `docs/plans/`

Cross-repository work plans for the agent-runtime migration, plus one dated
measurement that was filed here by mistake. The normative boundary these plans
implement is [`../specs/agent-runtime-upstream-boundary.md`](../specs/agent-runtime-upstream-boundary.md).

A plan here exists because the work spans OpenHuman and one or more vendored
submodules and cannot be owned accurately by a single source directory. Durable
architecture belongs in `gitbooks/developing/architecture/` and in the
beside-code `crates/openhuman-core/src/<domain>/README.md`, not here.

## Status, verified 2026-10-07

Checked against the tree rather than against each plan's own status line,
because several of those lines no longer hold.

| Plan | Status |
| --- | --- |
| `extract-remaining-harness-session-and-subagent-runner.md` | **Landed.** `agent/harness/{session,subagent_runner,run_queue}/` and `agent/task_dispatcher/` are all deleted; `agent/session_host/` and `agent/subagent_host/` replaced them. |
| `migrate-agent-sessions-to-tinyagents-session.md` | **Landed.** The transcript model and JSONL codec live in `vendor/tinyagents/crates/tinyagents-session/src/transcript/`. |
| `migrate-agent-runtime-helper-packages.md` | **Landed.** All four slices are complete; what remains host-side is what the plan prescribes keeping. |
| `migrate-agent-orchestration-to-tinyagents.md` | **Landed except O6.** `tinyagents-orchestration/src/` holds `subagent/`, `teams/` and `workflow/`; there is no `parallel/`. |
| `migrate-agent-runtime-to-tinyagents.md` | **Live.** Tasks 4, 10 and 11 are outstanding: 19 `task_local!` declarations remain in the core, and `agent/tinyagents/harness_assembly.rs` and `agent/tinyagents/turn_runner.rs` both still exist with live callers. |
| `migrate-agent-runtime-waves.md` | **Live.** Gate 4 is unmet: `scripts/ci/agent-runtime-boundary-baseline.json` is still checked in, with 213 baselined violations, and the gate requires it deleted. |
| `jev-tool-search-baseline.md` | **Not a plan.** A dated measurement report (2026-09-22) for `tool_search` ranking. It is linked from the root `README.md`, `crates/openhuman-tinyhumans/src/jev/README.md` and `gitbooks/developing/jev.md`, so its path is a contract; leave it where it is. |

Delete the four landed plans, and the spec with them, once Task 4, Tasks 10 and
11, Gate 4 and O6 are closed. Until then they are the record of what was moved
and why, and the two live plans point at them.

## Reproducing the status check

Each check below fails loudly when its condition stops holding. A bare `ls` of
a parent directory would not: it succeeds whether or not the retired child is
still there.

```bash
# The three retired trees are gone and their replacements are present.
for d in session subagent_runner run_queue; do
  test ! -e "crates/openhuman-core/src/agent/harness/$d" || echo "STILL PRESENT: $d"
done
test ! -e crates/openhuman-core/src/agent/task_dispatcher || echo "STILL PRESENT: task_dispatcher"
test -d crates/openhuman-core/src/agent/session_host
test -d crates/openhuman-core/src/agent/subagent_host

# The transcript model and JSONL codec moved upstream.
test -d vendor/tinyagents/crates/tinyagents-session/src/transcript

# O6: parallel/ would be the outstanding slice.
test ! -e vendor/tinyagents/crates/tinyagents-orchestration/src/parallel || echo "O6 LANDED"
for d in subagent teams workflow; do
  test -d "vendor/tinyagents/crates/tinyagents-orchestration/src/$d" || echo "MISSING: $d"
done

# Task 4: count declarations, not every line that mentions the macro.
grep -rn --include='*.rs' -E '(tokio::)?task_local! *\{' crates/openhuman-core/src \
  | grep -v '_tests' | grep -v '^[^:]*:[0-9]*: *//' | wc -l

# Tasks 10 and 11: the files exist *and* still have callers.
ls crates/openhuman-core/src/agent/tinyagents/harness_assembly.rs \
   crates/openhuman-core/src/agent/tinyagents/turn_runner.rs
grep -rln --include='*.rs' 'harness_assembly\|turn_runner' crates/openhuman-core/src \
  | grep -v 'tinyagents/\(harness_assembly\|turn_runner\)\.rs$'

# Gate 4: the gate requires this file deleted.
test ! -e scripts/ci/agent-runtime-boundary-baseline.json && echo "GATE 4 MET" \
  || python3 -c "import json;print(len(json.load(open('scripts/ci/agent-runtime-boundary-baseline.json'))), 'baselined violations')"
```
