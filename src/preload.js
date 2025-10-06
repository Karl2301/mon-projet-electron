const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Folder and file operations
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
  saveFile: (data) => ipcRenderer.invoke('file:save', data),
  
  // OAuth operations
  startDeviceFlow: () => ipcRenderer.invoke('oauth:start-device'),
  pollToken: (data) => ipcRenderer.invoke('oauth:poll-token', data),
  loadTokens: () => ipcRenderer.invoke('oauth:load-tokens'),
  refreshToken: (refresh_token) => ipcRenderer.invoke('oauth:refresh-token', { refresh_token }),
  deleteTokens: () => ipcRenderer.invoke('oauth:delete-tokens'),
  
  // Microsoft Graph operations
  getMessages: (params) => ipcRenderer.invoke('graph:get-messages', params),
  
  // Sender paths operations
  getSenderPath: (senderEmail) => ipcRenderer.invoke('db:get-sender-path', senderEmail),
  setSenderPath: (data) => ipcRenderer.invoke('db:set-sender-path', data),
  getAllSenderPaths: () => ipcRenderer.invoke('db:get-all-sender-paths'),
  deleteSenderPath: (senderEmail) => ipcRenderer.invoke('db:delete-sender-path', senderEmail),
  
  // Enhanced file save with sender support
  saveFileWithSender: (data) => ipcRenderer.invoke('file:save-with-sender', data),
  
  // General settings operations
  getGeneralSettings: () => ipcRenderer.invoke('settings:get-general'),
  saveGeneralSettings: (settings) => ipcRenderer.invoke('settings:save-general', settings),
  createClientFolder: (clientName) => ipcRenderer.invoke('folder:create-client', clientName),
});