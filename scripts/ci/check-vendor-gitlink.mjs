#!/usr/bin/env node
// Fails a PR that rolls a `vendor/*` git-submodule pointer BACKWARDS.
//
// Why this exists (B44 — see my_docs/flows_workflow_bugs.md). The superproject
// records each `vendor/*` submodule as a gitlink SHA. A PR branched off an old
// `main` — from *before* a dependency bump advanced a gitlink — carries that
// stale SHA in its tree. When it merges, the stale tree silently rolls the
// gitlink BACKWARDS while the new `Cargo.toml` version requirement stays put →
// an unsatisfiable version skew → `main` stops compiling and every open flows
// PR goes red. This is exactly what happened when PR #5114 rolled
// `vendor/tinyagents` back from a 2.1.0-compatible commit (2583fcc) to a 1.9.0
// commit (19dc2c4) while `Cargo.toml` still demanded `tinyagents = "2.1"`. The
// compile break itself was fixed in #5128; THIS guard is the prevention half so
// it can never recur silently.
//
// The rule, per submodule: a PR may only move a gitlink FORWARD (the base
// branch's recorded SHA is an ancestor of the head's SHA) or leave it EQUAL. A
// BACKWARD move (head's SHA is an ancestor of base's) or a DIVERGED move (head
// does not descend from base) is the bug and fails CI.
//
// Contributor note: after you merge `main` into a branch, ALWAYS run
//   git submodule update --init --recursive
// to bring your working tree's submodules in line with the merged gitlinks, and
// eyeball `git diff origin/main -- vendor/` before pushing. A line under
// `vendor/` that you did not intend to change is very likely a backward roll.
//
// Usage:
//   node scripts/ci/check-vendor-gitlink.mjs [--base <ref>]   # default origin/main
//   node scripts/ci/check-vendor-gitlink.mjs --self-test      # exercise the classifier, no git
//
// The check needs the submodule commits present locally so `git merge-base
// --is-ancestor` can resolve ancestry: it runs `git submodule update --init`
// for each `vendor/*` submodule (checks it out at the head gitlink) and then
// fetches its origin so the base gitlink's commit is in the object store too.
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------------------------------------------------------------------
// Pure classifier — the whole decision, with zero git coupling so --self-test
// can pin every branch without a repository.
// ---------------------------------------------------------------------------

/**
 * Classify a single submodule's gitlink move.
 *
 * @param {object} facts
 * @param {string|null} facts.baseSha  Recorded gitlink on the base ref, or null if the submodule is new.
 * @param {string} facts.headSha       Recorded gitlink on the PR head.
 * @param {boolean} facts.baseIsAncestorOfHead  git merge-base --is-ancestor base head succeeded.
 * @param {boolean} facts.headIsAncestorOfBase  git merge-base --is-ancestor head base succeeded.
 * @returns {{ ok: boolean, kind: 'new'|'equal'|'forward'|'backward'|'diverged' }}
 */
export function classifyMove({ baseSha, headSha, baseIsAncestorOfHead, headIsAncestorOfBase }) {
  if (baseSha === null || baseSha === undefined) return { ok: true, kind: 'new' };
  if (baseSha === headSha) return { ok: true, kind: 'equal' };
  if (baseIsAncestorOfHead) return { ok: true, kind: 'forward' };
  if (headIsAncestorOfBase) return { ok: false, kind: 'backward' };
  return { ok: false, kind: 'diverged' };
}

function remediation(name) {
  return (
    `      git checkout origin/main -- ${name} && git commit --amend --no-edit\n` +
    `      git submodule update --init --recursive\n` +
    `    (then re-check with: git diff origin/main -- vendor/)`
  );
}

// ---------------------------------------------------------------------------
// git plumbing
// ---------------------------------------------------------------------------

function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  }).trim();
}

// Non-throwing variant: returns { status, stdout, stderr }. Used for probes
// (rev-parse of a maybe-absent path, is-ancestor which signals via exit code).
function gitTry(args, opts = {}) {
  try {
    const stdout = git(args, opts);
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      status: typeof err.status === 'number' ? err.status : 1,
      stdout: (err.stdout || '').toString().trim(),
      stderr: (err.stderr || '').toString().trim(),
    };
  }
}

/** All `vendor/*` submodule paths declared in .gitmodules, sorted. */
function vendorSubmodulePaths() {
  const res = gitTry(['config', '-f', '.gitmodules', '--get-regexp', '^submodule\\..*\\.path$']);
  if (res.status !== 0 || !res.stdout) return [];
  return res.stdout
    .split('\n')
    .map((line) => line.split(/\s+/)[1])
    .filter((p) => p && p.startsWith('vendor/'))
    .sort();
}

/** Gitlink SHA recorded for `path` at `ref`, or null if the path is absent there. */
function gitlinkAt(ref, path) {
  const res = gitTry(['rev-parse', `${ref}:${path}`]);
  return res.status === 0 ? res.stdout : null;
}

/** Make both base and head commits resolvable inside the submodule repo. */
function ensureSubmoduleObjects(path, shas) {
  // Checks the submodule out at the head gitlink and populates its .git dir.
  gitTry(['submodule', 'update', '--init', '--', path]);
  const present = (sha) => gitTry(['cat-file', '-e', `${sha}^{commit}`], { cwd: resolve(REPO_ROOT, path) }).status === 0;
  if (shas.every(present)) return true;
  // The base commit is typically a DESCENDANT of the head (that is the whole
  // bug), so it is not reachable from the checked-out head — fetch origin to
  // bring it into the object store. Try a full fetch, then targeted SHAs.
  gitTry(['fetch', '--quiet', '--tags', 'origin'], { cwd: resolve(REPO_ROOT, path) });
  for (const sha of shas) {
    if (!present(sha)) {
      gitTry(['fetch', '--quiet', 'origin', sha], { cwd: resolve(REPO_ROOT, path) });
    }
  }
  return shas.every(present);
}

function isAncestor(path, ancestor, descendant) {
  return (
    gitTry(['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: resolve(REPO_ROOT, path),
    }).status === 0
  );
}

// ---------------------------------------------------------------------------
// Runners
// ---------------------------------------------------------------------------

function runCheck(baseRef) {
  const paths = vendorSubmodulePaths();
  if (paths.length === 0) {
    console.error(
      'FAIL: found zero vendor/* submodules in .gitmodules.\n' +
        'Either the layout changed or the parser is broken — refusing to pass vacuously.'
    );
    return 2;
  }

  const failures = [];
  const lines = [];
  for (const path of paths) {
    const headSha = gitlinkAt('HEAD', path);
    if (headSha === null) {
      // Path removed on head — not a backward move.
      lines.push(`  ${path}: removed on head — skipped`);
      continue;
    }
    const baseSha = gitlinkAt(baseRef, path);
    if (baseSha === null) {
      lines.push(`  ${path}: new submodule — ok`);
      continue;
    }
    if (baseSha === headSha) {
      lines.push(`  ${path}: unchanged (${headSha.slice(0, 12)}) — ok`);
      continue;
    }

    if (!ensureSubmoduleObjects(path, [baseSha, headSha])) {
      // Cannot resolve ancestry — fail closed. A guard that shrugs when it
      // cannot fetch is worse than no guard, because it hides the very drift
      // it exists to catch.
      failures.push({ path, baseSha, headSha, kind: 'unresolved' });
      lines.push(`  ${path}: FAIL — could not fetch commits to determine ancestry`);
      continue;
    }

    const { ok, kind } = classifyMove({
      baseSha,
      headSha,
      baseIsAncestorOfHead: isAncestor(path, baseSha, headSha),
      headIsAncestorOfBase: isAncestor(path, headSha, baseSha),
    });
    lines.push(
      `  ${path}: ${kind} (${baseSha.slice(0, 12)} -> ${headSha.slice(0, 12)}) — ${ok ? 'ok' : 'FAIL'}`
    );
    if (!ok) failures.push({ path, baseSha, headSha, kind });
  }

  console.log(`Vendor gitlink guard — comparing HEAD against ${baseRef}`);
  console.log(lines.join('\n'));

  if (failures.length === 0) {
    console.log('\nPASS: no vendor/* submodule pointer moved backwards.');
    return 0;
  }

  console.error('\n::error::Vendor gitlink pointer(s) rolled BACKWARDS — this breaks main (B44).');
  for (const f of failures) {
    const name = f.path;
    console.error(`\n  * ${name}`);
    console.error(`      base (${baseRef}): ${f.baseSha}`);
    console.error(`      head (this PR):    ${f.headSha}`);
    if (f.kind === 'backward') {
      console.error('      head is an ANCESTOR of base — the pointer went backwards.');
    } else if (f.kind === 'diverged') {
      console.error('      head does not descend from base — the pointer diverged.');
    } else {
      console.error('      could not confirm the head descends from base (fetch failed).');
    }
    console.error('      Fix — restore the base pointer and re-commit:');
    console.error(remediation(name));
  }
  console.error(
    '\n  A vendor/* gitlink may only move FORWARD or stay equal. If you merged\n' +
      '  main into this branch, run `git submodule update --init --recursive` and\n' +
      '  re-commit so the gitlinks match the merged base.'
  );
  return 1;
}

// A hand-built truth table covering every classifier branch, so the decision
// logic is verifiable with `node scripts/ci/check-vendor-gitlink.mjs
// --self-test` — no repository, network, or PR required.
function runSelfTest() {
  const cases = [
    {
      name: 'new submodule (absent on base) is allowed',
      facts: { baseSha: null, headSha: 'aaa', baseIsAncestorOfHead: false, headIsAncestorOfBase: false },
      expect: { ok: true, kind: 'new' },
    },
    {
      name: 'unchanged pointer is allowed',
      facts: { baseSha: 'aaa', headSha: 'aaa', baseIsAncestorOfHead: true, headIsAncestorOfBase: true },
      expect: { ok: true, kind: 'equal' },
    },
    {
      name: 'forward move (base is ancestor of head) is allowed',
      facts: { baseSha: 'old', headSha: 'new', baseIsAncestorOfHead: true, headIsAncestorOfBase: false },
      expect: { ok: true, kind: 'forward' },
    },
    {
      name: 'backward move (head is ancestor of base) fails — the B44 bug',
      facts: { baseSha: 'new', headSha: 'old', baseIsAncestorOfHead: false, headIsAncestorOfBase: true },
      expect: { ok: false, kind: 'backward' },
    },
    {
      name: 'diverged move (neither ancestor) fails',
      facts: { baseSha: 'x', headSha: 'y', baseIsAncestorOfHead: false, headIsAncestorOfBase: false },
      expect: { ok: false, kind: 'diverged' },
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const got = classifyMove(c.facts);
    const ok = got.ok === c.expect.ok && got.kind === c.expect.kind;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}`);
    if (!ok) {
      console.error(`  expected ${JSON.stringify(c.expect)}, got ${JSON.stringify(got)}`);
      failed++;
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} self-test case(s) failed.`);
    return 1;
  }
  console.log('\nAll self-test cases passed.');
  return 0;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function usage() {
  return 'Usage: check-vendor-gitlink.mjs [--base <ref>] | --self-test';
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage());
    return 0;
  }
  if (argv.includes('--self-test')) return runSelfTest();

  let baseRef = 'origin/main';
  const baseIdx = argv.indexOf('--base');
  if (baseIdx !== -1) {
    baseRef = argv[baseIdx + 1];
    if (!baseRef) {
      console.error(usage());
      return 2;
    }
  }
  return runCheck(baseRef);
}

process.exit(main());
