import { useEffect, useState, useRef, useCallback } from 'react';
import { EmulatorMessage, EmulatorResponse, StepResult, RegisterInfo } from '@/workers/emulator/types';
import { getGlobalSettings } from '@/hooks/useSettings';
import {
  EMULATOR_MESSAGE_TIMEOUT_MS,
  EMULATOR_RUN_TIMEOUT_US,
  formatLoadError,
  formatMemoryError,
  formatRuntimeError,
  formatSystemError,
  formatTimeoutError,
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
        if (pending) {
          pendingMessages.current.delete(messageId);
          pending.reject(new Error(formatTimeoutError('Message response', EMULATOR_MESSAGE_TIMEOUT_MS)));
        }
      }, EMULATOR_MESSAGE_TIMEOUT_MS);

      pendingMessages.current.set(messageId, { resolve, reject, timeoutId });

      workerRef.current.postMessage(message);
    });
  }, []);

  const initializeEmulator = useCallback(async () => {
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    workerRef.current = new Worker(new URL('../workers/emulator/index.ts', import.meta.url));
    
    workerRef.current.onmessage = (event: MessageEvent<EmulatorResponse>) => {
      const response = event.data;
      if (response.messageId && pendingMessages.current.has(response.messageId)) {
        const pending = pendingMessages.current.get(response.messageId);
        if (pending) {
          clearTimeout(pending.timeoutId);
          pendingMessages.current.delete(response.messageId);
          pending.resolve(response);
        }
      }
    };

    try {
      const arch = getGlobalSettings().settings.architecture;
      await sendMessage({ type: 'init', payload: { arch } });
      setState(prev => ({ ...prev, isInitialized: true, error: undefined }));
    } catch (error) {
      const detail = error instanceof Error ? error.message : undefined;
      setState(prev => ({ 
        ...prev, 
        isInitialized: false, 
        error: formatSystemError('Initialize emulator', detail)
      }));
    }
  }, [sendMessage]);

  // React to global settings change for architecture: reset worker so it will be re-initialized next time
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { architecture?: 'ARM' | 'MIPS' } | undefined;
      if (!detail || !('architecture' in detail)) return;
      // Tear down current worker to force re-init with new arch on next use
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      setState({ isInitialized: false, isRunning: false, currentPC: 0 });
    };
    window.addEventListener('pacasm-settings-changed', handler as EventListener);
    return () => window.removeEventListener('pacasm-settings-changed', handler as EventListener);
  }, []);

  const loadCode = useCallback(async (machineCode: number[]) => {
    try {
      await sendMessage({ 
        type: 'load-code', 
        payload: machineCode 
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : undefined;
      setState(prev => ({ 
        ...prev, 
        error: formatLoadError('Failed to load code into emulator', detail)
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
      const detail = error instanceof Error ? error.message : undefined;
      setState(prev => ({ 
        ...prev, 
        error: formatRuntimeError('step-debug request failed', detail)
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
      const detail = error instanceof Error ? error.message : undefined;
      setState(prev => ({ 
        ...prev, 
        error: formatRuntimeError('run request failed', detail)
      }));
      return null;
    }
  }, [sendMessage]);

  const runUntilMemWrite = useCallback(
    async (
      address: number,
      validValues: number[] = [1, 2, 3, 4],
      timeoutUs: number = EMULATOR_RUN_TIMEOUT_US
    ): Promise<
      | {
          message: string;
          executedInstructions?: number;
          stopReason?: 'mem-write' | 'end-of-code' | 'timeout' | 'unknown';
          memEvent?: { address: number; value: number };
        }
      | null
    > => {
      try {
        const response = await sendMessage({
          type: 'run',
          payload: { untilMemWriteAt: address, validValues, timeoutUs }
        });
        if (response.type === 'execution-complete' && response.payload) {
          return response.payload as {
            message: string;
            executedInstructions?: number;
            stopReason?: 'mem-write' | 'end-of-code' | 'timeout' | 'unknown';
            memEvent?: { address: number; value: number };
          };
        }
        return null;
      } catch (error) {
        const timeoutMs = Math.round(timeoutUs / 1000);
        const detail = error instanceof Error
          ? error.message
          : `addr=0x${address.toString(16)}, timeout=${timeoutMs}ms`;
        setState(prev => ({
          ...prev,
          error: formatRuntimeError('runUntilMemWrite failed', detail)
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
      const detail = error instanceof Error ? error.message : undefined;
      setState(prev => ({ 
        ...prev, 
        error: formatSystemError('Reset failed', detail)
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
      const detail = error instanceof Error ? error.message : undefined;
      setState(prev => ({ 
        ...prev, 
        error: formatMemoryError('Read memory failed', detail)
      }));
      return null;
    }
  }, [sendMessage]);

  const cleanup = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setState({
      isInitialized: false,
      isRunning: false,
      currentPC: 0,
    });
    pendingMessages.current.forEach(({ reject, timeoutId }, messageId) => {
      clearTimeout(timeoutId);
      reject(new Error(formatSystemError('Emulator worker terminated before response', messageId)));
    });
    pendingMessages.current.clear();
  }, []);

  const writeMemory = useCallback(async (address: number, data: number[]): Promise<boolean> => {
    try {
      const response = await sendMessage({ 
        type: 'write-memory', 
        payload: { address, data } 
      });
      return response.type === 'success';
    } catch (error) {
      const detail = error instanceof Error ? error.message : undefined;
      setState(prev => ({ 
        ...prev, 
        error: formatMemoryError('Write memory failed', detail)
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
      const detail = error instanceof Error ? error.message : undefined;
      setState(prev => ({ 
        ...prev, 
        error: formatSystemError('Failed to get registers', detail)
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
