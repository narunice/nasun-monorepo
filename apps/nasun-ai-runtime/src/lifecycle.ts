/**
 * Process lifecycle flag — "are we shutting down?"
 *
 * Why this exists as a module instead of a local `let`:
 *   Multiple cycle runners (run-cycle, trader-runner, lambda-runner,
 *   analysis-runner) detect fatal conditions (inactive budget, fatal
 *   categorizeError, fatal trader result) and need to signal the main
 *   loop to stop scheduling the next cycle. Before the index.ts split
 *   they all mutated a module-scoped `shuttingDown` boolean directly.
 *   After the split they sit in different files, so the flag is owned
 *   here and the surface is two functions: a setter the cycle code
 *   calls on a fatal, and a getter the scheduler/analysis loop checks
 *   before doing more work.
 *
 * Why a singleton (not a class injected through dependencies):
 *   There is one agent process, one heartbeat loop, one shutdown. PM2
 *   spawns a fresh process per agent, so cross-process sharing isn't a
 *   concern. Tests that exercise cycle runners stub the network surface
 *   via DI and don't rely on the flag.
 *
 * Signal handlers (SIGINT/SIGTERM), `pendingTimer`, and
 * `wakeShutdownGlobal` stay in index.ts — they are tightly coupled to
 * `scheduleNext` and the wake-server close handle, both of which live
 * with main().
 */

let shuttingDown = false;

export function isShuttingDown(): boolean {
  return shuttingDown;
}

export function requestShutdown(): void {
  shuttingDown = true;
}
