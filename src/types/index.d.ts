// This file contains TypeScript type definitions for the project.

declare module 'electron' {
  import { BrowserWindow } from 'electron';

  export interface IpcMain {
    handle(channel: string, listener: (...args: any[]) => Promise<any>): this;
  }

  export interface IpcRenderer {
    invoke(channel: string, ...args: any[]): Promise<any>;
  }

  export interface ElectronAPI {
    selectFolder: () => Promise<string | null>;
    saveFile: (params: { folderPath: string; fileName: string; content: string }) => Promise<string>;
    startDeviceFlow: () => Promise<any>;
    pollToken: (params: { device_code: string }) => Promise<any>;
    getMessages: (params: { accessToken: string; top?: number }) => Promise<any>;
    loadTokens: () => Promise<any>;
    refreshToken: (refresh_token: string) => Promise<any>;
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}