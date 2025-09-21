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
      const script = this.arch === 'MIPS' ? 'unicorn-mips.min.js' : 'unicorn-arm.min.js';
      (globalThis as unknown as { importScripts: (url: string) => void }).importScripts(`${baseUrl}/arm/${script}`);
      
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
