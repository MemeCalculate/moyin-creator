// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Staggered startup concurrency control executor
 *
 * Behavior:
 * - Each new task waits at least staggerMs after the previous task starts
 * - At most maxConcurrent tasks run simultaneously
 * - When active tasks reach the limit, wait for a task to complete before starting the next (still maintaining staggerMs interval)
 *
 * Example maxConcurrent=3, staggerMs=5000, each task takes 20 seconds:
 *   t=0s:  Start task 1
 *   t=5s:  Start task 2
 *   t=10s: Start task 3 (reached concurrency limit)
 *   t=15s: Task 4's stagger expires, but concurrency is full, queuing
 *   t=20s: Task 1 completes → Task 4 starts immediately
 *   t=25s: Task 2 completes → Task 5 starts immediately
 *
 * Example maxConcurrent=1, staggerMs=5000, each task takes 2 seconds:
 *   t=0s:  Start task 1
 *   t=2s:  Task 1 completes
 *   t=5s:  Stagger expires → Start task 2 (strictly 5 second interval)
 *   t=7s:  Task 2 completes
 *   t=10s: Start task 3
 */
export async function runStaggered<T>(
  tasks: (() => Promise<T>)[],
  maxConcurrent: number,
  staggerMs: number = 5000
): Promise<PromiseSettledResult<T>[]> {
  if (tasks.length === 0) return [];

  const results: PromiseSettledResult<T>[] = new Array(tasks.length);

  // Semaphore: controls maximum concurrency
  let activeCount = 0;
  const waiters: (() => void)[] = [];

  const acquire = async (): Promise<void> => {
    if (activeCount < maxConcurrent) {
      activeCount++;
      return;
    }
    // Concurrency full, wait in queue
    await new Promise<void>((resolve) => waiters.push(resolve));
  };

  const release = (): void => {
    activeCount--;
    if (waiters.length > 0) {
      // Wake up the next waiter in queue
      activeCount++;
      const next = waiters.shift()!;
      next();
    }
  };

  // Start tasks one by one, each spaced by staggerMs
  // The Nth task is only allowed to start after N * staggerMs (stagger minimum interval)
  // Also constrained by semaphore (concurrency limit)
  const taskPromises = tasks.map(async (task, idx) => {
    // Staggered startup: Nth task starts at least after N * staggerMs
    if (idx > 0) {
      await new Promise<void>((r) => setTimeout(r, idx * staggerMs));
    }

    // Acquire concurrency slot (wait if full until a task completes)
    await acquire();

    try {
      const value = await task();
      results[idx] = { status: 'fulfilled', value };
    } catch (reason) {
      results[idx] = { status: 'rejected', reason: reason as any };
    } finally {
      release();
    }
  });

  await Promise.all(taskPromises);
  return results;
}
