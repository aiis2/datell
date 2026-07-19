export type ToolExecutionOutcome<T> =
  | {
      status: 'fulfilled';
      value: T;
      deadlineExceeded: boolean;
      parentAborted: boolean;
    }
  | {
      status: 'rejected';
      reason: unknown;
      deadlineExceeded: boolean;
      parentAborted: boolean;
    };

interface ExecuteWithDeadlineOptions<T> {
  timeoutMs: number;
  parentSignal?: AbortSignal;
  execute: (signal: AbortSignal) => Promise<T>;
}

export async function executeWithDeadline<T>({
  timeoutMs,
  parentSignal,
  execute,
}: ExecuteWithDeadlineOptions<T>): Promise<ToolExecutionOutcome<T>> {
  const controller = new AbortController();
  let deadlineExceeded = false;
  let parentAborted = parentSignal?.aborted ?? false;

  const abortFromParent = () => {
    parentAborted = true;
    controller.abort(parentSignal?.reason);
  };

  if (parentSignal?.aborted) {
    controller.abort(parentSignal.reason);
  } else {
    parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  }

  if (controller.signal.aborted) {
    return {
      status: 'rejected',
      reason: controller.signal.reason ?? new DOMException('Tool execution cancelled', 'AbortError'),
      deadlineExceeded,
      parentAborted,
    };
  }

  const deadlineTimer = timeoutMs > 0
    ? setTimeout(() => {
        deadlineExceeded = true;
        controller.abort(new DOMException('Tool execution deadline exceeded', 'TimeoutError'));
      }, timeoutMs)
    : undefined;

  try {
    const value = await execute(controller.signal);
    return { status: 'fulfilled', value, deadlineExceeded, parentAborted };
  } catch (reason) {
    return { status: 'rejected', reason, deadlineExceeded, parentAborted };
  } finally {
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
}
