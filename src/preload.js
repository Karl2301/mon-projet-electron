const { contextBridge, ipcRenderer } = require('electron');

// AJOUTER CE LOG AU DÉBUT
console.log('🔗 Preload script loading...');

contextBridge.exposeInMainWorld('electronAPI', {
  // Folder and file operations
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
  selectFolderWithCreate: () => ipcRenderer.invoke('dialog:select-folder-with-create'),
  saveFile: (data) => ipcRenderer.invoke('file:save', data),
  saveFileWithSender: (data) => ipcRenderer.invoke('save-file-with-sender', data),
  
  // Authentication
  startDeviceFlow: () => ipcRenderer.invoke('auth:start-device-flow'),
  pollToken: (data) => ipcRenderer.invoke('auth:poll-token', data),
  refreshToken: (refreshToken) => ipcRenderer.invoke('auth:refresh-token', refreshToken),
  loadTokens: () => ipcRenderer.invoke('auth:load-tokens'),
  deleteTokens: () => ipcRenderer.invoke('auth:delete-tokens'),
  
  // Messages
  getMessages: (params) => ipcRenderer.invoke('outlook:get-messages', params),
  saveMessage: (data) => ipcRenderer.invoke('save-message', data),
  
  // Sender paths
  getSenderPath: (email) => ipcRenderer.invoke('get-sender-path', email),
  setSenderPath: (data) => ipcRenderer.invoke('set-sender-path', data),
  updateSenderPath: (data) => ipcRenderer.invoke('update-sender-path', data),
  getAllSenderPaths: () => ipcRenderer.invoke('get-all-sender-paths'),
  deleteSenderPath: (email) => ipcRenderer.invoke('sender:delete-path', email),
  
  // General settings operations
  getGeneralSettings: () => ipcRenderer.invoke('settings:get-general'),
  saveGeneralSettings: (settings) => ipcRenderer.invoke('settings:save-general', settings),
  
  // Folder operations
  createClientFolder: (clientName) => ipcRenderer.invoke('folder:create-client', clientName),
  deployFolderStructure: (data) => ipcRenderer.invoke('folder:deploy-structure', data),
});

// AJOUTER CE LOG À LA FIN
console.log('✅ Preload script loaded, electronAPI exposed');
console.log('🔍 Available functions:', Object.keys(window.electronAPI || {}));