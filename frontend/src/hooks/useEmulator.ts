import { useEffect, useState, useRef, useCallback } from 'react';
import { EmulatorMessage, EmulatorResponse, StepResult, RegisterInfo } from '@/workers/emulator/types';
import { getGlobalSettings, type Architecture as SettingsArchitecture } from '@/hooks/useSettings';
import {
  EMULATOR_MESSAGE_TIMEOUT_MS,
  EMULATOR_RUN_TIMEOUT_US,
  formatLoadError,
  formatMemoryError,
  formatRuntimeError,
  formatSystemError,
  formatTimeoutError,
  normalizeWorkerErrorMessage,
} from '@/lib/emulator-errors';

interface EmulatorState {
  isInitialized: boolean;
  isRunning: boolean;
  currentPC: number;
  error?: string;
}

export const useEmulator = () => {
  const [state, setState] = useState<EmulatorState>({
    isInitialized: false,
    isRunning: false,
    currentPC: 0,
  });
  
  const workerRef = useRef<Worker | null>(null);
  const workerArchitectureRef = useRef<SettingsArchitecture | null>(null);
  const messageIdCounter = useRef(0);
  const pendingMessages = useRef<
    Map<
      string,
      {
        resolve: (response: EmulatorResponse) => void;
        reject: (error: Error) => void;
        timeoutId: ReturnType<typeof setTimeout>;
      }
    >
  >(new Map());
  const initializeEmulatorRef = useRef<(() => Promise<void>) | null>(null);

  const flushPendingMessages = useCallback((buildError: (messageId: string) => Error) => {
    pendingMessages.current.forEach(({ reject, timeoutId }, messageId) => {
      clearTimeout(timeoutId);
      try {
        reject(buildError(messageId));
      } catch {
        // Swallow rejection errors to avoid cascading failures
      }
    });
    pendingMessages.current.clear();
  }, []);

  const terminateWorker = useCallback(
    (buildError?: (messageId: string) => Error) => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      workerArchitectureRef.current = null;
      if (pendingMessages.current.size > 0) {
        const builder = buildError ?? ((messageId: string) => new Error(
          formatSystemError('Emulator worker terminated before response', messageId)
        ));
        flushPendingMessages(builder);
      }
    },
    [flushPendingMessages]
  );

  const buildTimeoutError = (context: string, detail?: string) => {
    const message = formatTimeoutError(context, EMULATOR_MESSAGE_TIMEOUT_MS, detail);
    const error = new Error(message);
    error.name = 'TimeoutError';
    (error as Error & { code?: string }).code = 'timeout';
    return error;
  };

  const handleWorkerTimeout = useCallback(
    (triggerMessageId?: string) => {
      const detail = triggerMessageId ? `messageId=${triggerMessageId}` : undefined;
      terminateWorker((messageId) => buildTimeoutError('Worker unresponsive', `messageId=${messageId}`));

      const timeoutMessage = buildTimeoutError('Worker unresponsive', detail).message;
      setState((prev) => ({
        ...prev,
        isInitialized: false,
        isRunning: false,
        error: timeoutMessage,
      }));

      const reinitialize = initializeEmulatorRef.current;
      if (reinitialize) {
        void reinitialize().catch(() => undefined);
      }
    },
    [terminateWorker]
  );

  const buildWorkerError = useCallback((payload: unknown): Error => {
    let raw: string | undefined;

    if (typeof payload === 'string') {
      raw = payload;
    } else if (payload instanceof Error) {
      raw = payload.message;
    } else if (payload && typeof payload === 'object') {
      try {
        raw = JSON.stringify(payload);
      } catch {
        raw = String(payload);
      }
    } else if (payload !== undefined && payload !== null) {
      raw = String(payload);
    }

    const normalized = normalizeWorkerErrorMessage(raw) ?? raw ?? 'Unknown worker error';
    const error = new Error(normalized);
    error.name = 'WorkerError';
    return error;
  }, []);

  const sendMessage = useCallback((message: EmulatorMessage): Promise<EmulatorResponse> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('INIT_ERROR: Emulator Not Initialized'));
        return;
      }

      const messageId = `msg_${messageIdCounter.current++}`;
      message.messageId = messageId;
      
      const timeoutId = setTimeout(() => {
        const pending = pendingMessages.current.get(messageId);
        if (!pending) {
          return;
        }

        pendingMessages.current.delete(messageId);
        clearTimeout(pending.timeoutId);
        const timeoutError = buildTimeoutError('Message response', `messageId=${messageId}`);
        pending.reject(timeoutError);
        handleWorkerTimeout(messageId);
      }, EMULATOR_MESSAGE_TIMEOUT_MS);

      pendingMessages.current.set(messageId, { resolve, reject, timeoutId });

      try {
        workerRef.current.postMessage(message);
      } catch (error) {
        clearTimeout(timeoutId);
        pendingMessages.current.delete(messageId);
        reject(error as Error);
      }
    });
  }, [handleWorkerTimeout]);

  const initializeEmulator = useCallback(async () => {
    terminateWorker();

    workerRef.current = new Worker(new URL('../workers/emulator/index.ts', import.meta.url));
    
    type WorkerEvent = EmulatorResponse | { type: 'debug'; message: string; data?: unknown };

    workerRef.current.onmessage = (event: MessageEvent<WorkerEvent>) => {
      const response = event.data;

      if (response.type === 'debug') {
        return;
      }

      if (response.messageId && pendingMessages.current.has(response.messageId)) {
        const pending = pendingMessages.current.get(response.messageId);
        if (pending) {
          clearTimeout(pending.timeoutId);
          pendingMessages.current.delete(response.messageId);
          if (response.type === 'error') {
            pending.reject(buildWorkerError(response.payload));
          } else {
            pending.resolve(response);
          }
        }
      }
    };

    try {
      const arch = getGlobalSettings().settings.architecture;
      workerArchitectureRef.current = arch;
      await sendMessage({ type: 'init', payload: { arch } });
      setState(prev => ({ ...prev, isInitialized: true, error: undefined }));
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        setState(prev => ({
          ...prev,
          isInitialized: false,
          isRunning: false,
          error: error.message,
        }));
        return;
      }

      const detail = error instanceof Error ? error.message : undefined;
      const normalizedDetail = normalizeWorkerErrorMessage(detail) ?? detail;
      setState(prev => ({
        ...prev,
        isInitialized: false,
        isRunning: false,
        error: formatSystemError('Initialize emulator', normalizedDetail),
      }));
    }
  }, [sendMessage, terminateWorker, buildWorkerError]);

  initializeEmulatorRef.current = initializeEmulator;

  // React to global settings change for architecture: reset worker so it will be re-initialized next time
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { architecture?: SettingsArchitecture } | undefined;
      // Every settings event includes architecture, even when only zoom or
      // editor options changed. Preserve a live debugger unless its ISA changed.
      if (!detail?.architecture || !workerRef.current || detail.architecture === workerArchitectureRef.current) return;
      // Tear down current worker to force re-init with new arch on next use
      terminateWorker();
      setState({ isInitialized: false, isRunning: false, currentPC: 0 });
    };
    window.addEventListener('pacasm-settings-changed', handler as EventListener);
    return () => window.removeEventListener('pacasm-settings-changed', handler as EventListener);
  }, [terminateWorker]);

  const loadCode = useCallback(async (machineCode: number[]) => {
    try {
      await sendMessage({ 
        type: 'load-code', 
        payload: machineCode 
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        setState(prev => ({
          ...prev,
          isInitialized: false,
          isRunning: false,
          error: error.message,
        }));
        return;
      }
      const detail = error instanceof Error ? error.message : undefined;
      const normalizedDetail = normalizeWorkerErrorMessage(detail) ?? detail;
      setState(prev => ({ 
        ...prev, 
        error: formatLoadError('Failed to load code into emulator', normalizedDetail)
      }));
    }
  }, [sendMessage]);

  const step = useCallback(async (): Promise<StepResult | null> => {
    try {
      const response = await sendMessage({ type: 'step-debug' });
      if (response.type === 'step-result' && response.payload) {
        const stepResult = response.payload as StepResult;
        setState(prev => ({ 
          ...prev, 
          currentPC: stepResult.pc, 
          isRunning: stepResult.success 
        }));
        return stepResult;
      }
      return null;
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        setState(prev => ({
          ...prev,
          isInitialized: false,
          isRunning: false,
          error: error.message,
        }));
        return null;
      }
      const detail = error instanceof Error ? error.message : undefined;
      const normalizedDetail = normalizeWorkerErrorMessage(detail) ?? detail;
      setState(prev => ({ 
        ...prev, 
        isRunning: false,
        error: formatRuntimeError('step-debug request failed', normalizedDetail)
      }));
      return null;
    }
  }, [sendMessage]);

  const run = useCallback(async (instructionCount?: number): Promise<{ message: string; executedInstructions: number } | null> => {
    try {
      const response = await sendMessage({ 
        type: 'run', 
        payload: instructionCount ? { instructionCount } : undefined 
      });
      if (response.type === 'execution-complete' && response.payload) {
        const result = response.payload as { message: string; executedInstructions: number };
        setState(prev => ({ 
          ...prev, 
          isRunning: false 
        }));
        return result;
      }
      return null;
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        setState(prev => ({
          ...prev,
          isInitialized: false,
          isRunning: false,
          error: error.message,
        }));
        return null;
      }
      const detail = error instanceof Error ? error.message : undefined;
      const normalizedDetail = normalizeWorkerErrorMessage(detail) ?? detail;
      setState(prev => ({ 
        ...prev, 
        isRunning: false,
        error: formatRuntimeError('run request failed', normalizedDetail)
      }));
      return null;
    }
  }, [sendMessage]);

  const runUntilMemWrite = useCallback(
    async (
      address: number,
      validValues: number[] = [1, 2, 3, 4],
      timeoutUs: number = EMULATOR_RUN_TIMEOUT_US,
      breakpointAddresses: number[] = []
    ): Promise<
      | {
          message: string;
          executedInstructions?: number;
          stopReason?: 'mem-write' | 'end-of-code' | 'timeout' | 'unknown' | 'breakpoint';
          memEvent?: { address: number; value: number };
          pc?: number;
          breakpoint?: { address: number };
        }
      | null
    > => {
      try {
        const response = await sendMessage({
          type: 'run',
          payload: { untilMemWriteAt: address, validValues, timeoutUs, breakpointAddresses }
        });
        if (response.type === 'execution-complete' && response.payload) {
          return response.payload as {
            message: string;
            executedInstructions?: number;
            stopReason?: 'mem-write' | 'end-of-code' | 'timeout' | 'unknown' | 'breakpoint';
            memEvent?: { address: number; value: number };
            pc?: number;
            breakpoint?: { address: number };
          };
        }
        return null;
      } catch (error) {
        if (error instanceof Error && error.name === 'TimeoutError') {
          setState(prev => ({
            ...prev,
            isInitialized: false,
            isRunning: false,
            error: error.message,
          }));
          return null;
        }
        const timeoutMs = Math.round(timeoutUs / 1000);
        const detail = error instanceof Error
          ? error.message
          : `addr=0x${address.toString(16)}, timeout=${timeoutMs}ms`;
        const normalizedDetail = error instanceof Error
          ? (normalizeWorkerErrorMessage(detail) ?? detail)
          : detail;
        setState(prev => ({
          ...prev,
          isRunning: false,
          error: formatRuntimeError('runUntilMemWrite failed', normalizedDetail)
        }));
        return null;
      }
    },
    [sendMessage]
  );

  const reset = useCallback(async () => {
    try {
      await sendMessage({ type: 'reset' });
      setState(prev => ({ 
        ...prev, 
        currentPC: 0, 
        isRunning: false, 
        error: undefined 
      }));
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        setState(prev => ({
          ...prev,
          isInitialized: false,
          isRunning: false,
          error: error.message,
        }));
        return;
      }
      const detail = error instanceof Error ? error.message : undefined;
      const normalizedDetail = normalizeWorkerErrorMessage(detail) ?? detail;
      setState(prev => ({ 
        ...prev, 
        isRunning: false,
        error: formatSystemError('Reset failed', normalizedDetail)
      }));
    }
  }, [sendMessage]);

  const getMemory = useCallback(async (address: number, size: number): Promise<{ address: number; size: number; data: number[]; hex: string } | null> => {
    try {
      const response = await sendMessage({ 
        type: 'get-memory', 
        payload: { address, size } 
      });
      if (response.type === 'memory-data' && response.payload) {
        return response.payload as { address: number; size: number; data: number[]; hex: string };
      }
      return null;
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        setState(prev => ({
          ...prev,
          isInitialized: false,
          isRunning: false,
          error: error.message,
        }));
        return null;
      }
      const detail = error instanceof Error ? error.message : undefined;
      const normalizedDetail = normalizeWorkerErrorMessage(detail) ?? detail;
      setState(prev => ({ 
        ...prev, 
        error: formatMemoryError('Read memory failed', normalizedDetail)
      }));
      return null;
    }
  }, [sendMessage]);

  const cleanup = useCallback(() => {
    terminateWorker();
    setState({
      isInitialized: false,
      isRunning: false,
      currentPC: 0,
    });
  }, [terminateWorker]);

  const writeMemory = useCallback(async (address: number, data: number[]): Promise<boolean> => {
    try {
      const response = await sendMessage({ 
        type: 'write-memory', 
        payload: { address, data } 
      });
      return response.type === 'success';
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        setState(prev => ({
          ...prev,
          isInitialized: false,
          isRunning: false,
          error: error.message,
        }));
        return false;
      }
      const detail = error instanceof Error ? error.message : undefined;
      const normalizedDetail = normalizeWorkerErrorMessage(detail) ?? detail;
      setState(prev => ({ 
        ...prev, 
        error: formatMemoryError('Write memory failed', normalizedDetail)
      }));
      return false;
    }
  }, [sendMessage]);

  const getAllRegisters = useCallback(async (): Promise<RegisterInfo[] | null> => {
    try {
      const response = await sendMessage({ type: 'get-all-registers' });
      if (response.type === 'registers-data' && response.payload) {
        return response.payload as RegisterInfo[];
      }
      return null;
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        setState(prev => ({
          ...prev,
          isInitialized: false,
          isRunning: false,
          error: error.message,
        }));
        return null;
      }
      const detail = error instanceof Error ? error.message : undefined;
      const normalizedDetail = normalizeWorkerErrorMessage(detail) ?? detail;
      setState(prev => ({ 
        ...prev, 
        error: formatSystemError('Failed to get registers', normalizedDetail)
      }));
      return null;
    }
  }, [sendMessage]);

  return {
    state,
    initializeEmulator,
    loadCode,
    step,
    run,
    runUntilMemWrite,
    reset,
    cleanup,
    getMemory,
    writeMemory,
    getAllRegisters,
  };
};
