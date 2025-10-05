// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: async () => {
    return await ipcRenderer.invoke('dialog:select-folder');
  },
  saveFile: async ({ folderPath, fileName, content }) => {
    return await ipcRenderer.invoke('file:save', { folderPath, fileName, content });
  },
  // OAuth / Graph
  startDeviceFlow: async () => {
    return await ipcRenderer.invoke('oauth:start-device');
  },
  pollToken: async ({ device_code }) => {
    return await ipcRenderer.invoke('oauth:poll-token', { device_code });
  },
  getMessages: async ({ accessToken, top }) => {
    return await ipcRenderer.invoke('graph:get-messages', { accessToken, top });
  },
  loadTokens: () => ipcRenderer.invoke('oauth:load-tokens'),
  refreshToken: (refresh_token) => ipcRenderer.invoke('oauth:refresh-token', { refresh_token }),
});
