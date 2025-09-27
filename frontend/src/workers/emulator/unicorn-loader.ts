// Unicorn.js loader and initialization

import { WorkerSelf, UnicornGlobal, EmulatorResponse, Architecture } from './types';

export class UnicornLoader {
  private workerSelf: WorkerSelf;
  private arch: Architecture = 'ARM';

  constructor(workerSelf: WorkerSelf) {
    this.workerSelf = workerSelf;
  }

  setArchitecture(arch: Architecture) {
    this.arch = arch;
  }

  async loadUnicornScript(): Promise<void> {
    try {
      const baseUrl = this.workerSelf.location.origin;

      if (this.arch === 'MIPS_R6') {
        const globalScope = globalThis as typeof globalThis & {
          importScripts: (...urls: string[]) => void;
          MUnicorn?: (moduleArg?: Record<string, unknown>) => Promise<unknown>;
          createUC?: (moduleInstance: unknown) => UnicornGlobal;
          uc?: unknown;
        };

        delete globalScope.uc;

        globalScope.importScripts(`${baseUrl}/arm/unicorn_wasm_mips.js`, `${baseUrl}/arm/unicorn-wrapper.js`);

        if (typeof globalScope.MUnicorn !== 'function') {
          throw new Error('MUnicorn factory not found after importing Unicorn WASM scripts');
        }

        if (typeof globalScope.createUC !== 'function') {
          throw new Error('createUC wrapper not found after importing Unicorn WASM scripts');
        }

        const moduleInstance = await globalScope.MUnicorn({
          locateFile: (path: string) => {
            if (path.endsWith('.wasm')) {
              return `${baseUrl}/arm/unicorn_wasm_mips.wasm`;
            }
            return `${baseUrl}/arm/${path}`;
          }
        });

        this.workerSelf.uc = globalScope.createUC(moduleInstance) as UnicornGlobal;
      } else {
        (globalThis as unknown as { importScripts: (url: string) => void }).importScripts(`${baseUrl}/arm/unicorn-arm.min.js`);

        await new Promise<void>((resolve) => {
          const checkUnicorn = () => {
            if (typeof this.workerSelf.uc !== 'undefined') {
              resolve();
            } else {
              setTimeout(checkUnicorn, 10);
            }
          };
          checkUnicorn();
        });
      }

      this.postMessage({
        type: 'success',
        payload: `Unicorn.js loaded successfully (${this.arch})`
      });
    } catch (error) {
      this.postMessage({
        type: 'error',
        payload: 'LOAD_ERROR: Failed to Load Unicorn.js'
      });
      throw error;
    }
  }

  getUnicorn(): UnicornGlobal {
    if (typeof this.workerSelf.uc === 'undefined') {
      throw new Error('Unicorn.js not loaded');
    }
    return this.workerSelf.uc;
  }

  private postMessage(response: Pick<EmulatorResponse, 'type' | 'payload'>): void {
    this.workerSelf.postMessage(response);
  }
}
