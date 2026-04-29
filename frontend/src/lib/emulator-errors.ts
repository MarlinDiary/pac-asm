export const EMULATOR_MESSAGE_TIMEOUT_MS = 5000;
export const EMULATOR_RUN_TIMEOUT_MS = 5000;
export const EMULATOR_RUN_TIMEOUT_US = EMULATOR_RUN_TIMEOUT_MS * 1000;

export const formatRuntimeError = (context: string, details?: string) =>
  `RUNTIME_ERROR: ${context}${details ? `: ${details}` : ''}`;

export const formatTimeoutError = (context: string, timeoutMs: number, details?: string) => {
  const suffix = [`timeout=${timeoutMs}ms`];
  if (details) {
    suffix.push(details);
  }
  return `timeout: ${context} (${suffix.join(', ')})`;
};

export const formatMemoryError = (context: string, details?: string) =>
  `MEMORY_ERROR: ${context}${details ? `: ${details}` : ''}`;

export const formatSystemError = (context: string, details?: string) =>
  `SYSTEM_ERROR: ${context}${details ? `: ${details}` : ''}`;

export const formatLoadError = (context: string, details?: string) =>
  `LOAD_ERROR: ${context}${details ? `: ${details}` : ''}`;

const stripErrorPrefix = (message: string): string => message.replace(/^Error:\s*/i, '').trim();

const appendGuidance = (message: string): string => {
  const trimmed = message.trim();
  if (!trimmed) {
    return trimmed;
  }

  const needsInitHint = /emulator\s+not\s+initialized/i.test(trimmed);
  const hasInitHintAlready = /please\s+click\s+assemble/i.test(trimmed);

  if (needsInitHint && !hasInitHintAlready) {
    return `${trimmed}. Please click Assemble to initialize the emulator before running or debugging.`;
  }

  return trimmed;
};

export const normalizeWorkerErrorMessage = (raw?: string): string | undefined => {
  if (!raw) {
    return undefined;
  }

  const stripped = stripErrorPrefix(raw);
  if (!stripped) {
    return undefined;
  }

  return appendGuidance(stripped);
};
