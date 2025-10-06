import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'crypto';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

// Path for sender paths storage
const SENDER_PATHS_FILE = path.join(app.getPath('userData'), 'sender_paths.json');

// Path for general settings storage
const GENERAL_SETTINGS_FILE = path.join(app.getPath('userData'), 'general_settings.json');

// Initialize sender paths storage
function initSenderPaths() {
  if (!fs.existsSync(SENDER_PATHS_FILE)) {
    fs.writeFileSync(SENDER_PATHS_FILE, JSON.stringify({}), 'utf8');
  }
}

// Load sender paths from file
function loadSenderPaths() {
  try {
    if (fs.existsSync(SENDER_PATHS_FILE)) {
      const data = fs.readFileSync(SENDER_PATHS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading sender paths:', error);
  }
  return {};
}

// Save sender paths to file
function saveSenderPaths(paths) {
  try {
    fs.writeFileSync(SENDER_PATHS_FILE, JSON.stringify(paths, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving sender paths:', error);
  }
}

// Initialize general settings storage
function initGeneralSettings() {
  if (!fs.existsSync(GENERAL_SETTINGS_FILE)) {
    const defaultSettings = {
      rootFolder: '',
      folderStructure: []
    };
    fs.writeFileSync(GENERAL_SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2), 'utf8');
  }
}

// Load general settings from file
function loadGeneralSettings() {
  try {
    if (fs.existsSync(GENERAL_SETTINGS_FILE)) {
      const data = fs.readFileSync(GENERAL_SETTINGS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading general settings:', error);
  }
  return { rootFolder: '', folderStructure: [] };
}

// Save general settings to file
function saveGeneralSettings(settings) {
  try {
    fs.writeFileSync(GENERAL_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving general settings:', error);
  }
}

// Create folder structure recursively
async function createFolderStructure(basePath, structure) {
  for (const item of structure) {
    const itemPath = path.join(basePath, item.name);
    
    if (item.type === 'folder') {
      // Create folder
      if (!fs.existsSync(itemPath)) {
        fs.mkdirSync(itemPath, { recursive: true });
      }
      
      // Create children if any
      if (item.children && item.children.length > 0) {
        await createFolderStructure(itemPath, item.children);
      }
    } else if (item.type === 'file') {
      // Create file with content
      if (!fs.existsSync(itemPath)) {
        fs.writeFileSync(itemPath, item.content || '', 'utf8');
      }
    }
  }
}

// Create client folder with structure
async function createClientFolder(clientName) {
  try {
    const settings = loadGeneralSettings();
    if (!settings.rootFolder) {
      throw new Error('Dossier racine non configuré');
    }

    const clientPath = path.join(settings.rootFolder, clientName);
    
    // Create client folder
    if (!fs.existsSync(clientPath)) {
      fs.mkdirSync(clientPath, { recursive: true });
    }

    // Create folder structure
    if (settings.folderStructure && settings.folderStructure.length > 0) {
      await createFolderStructure(clientPath, settings.folderStructure);
    }

    return clientPath;
  } catch (error) {
    console.error('Error creating client folder:', error);
    throw error;
  }
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  initSenderPaths();
  initGeneralSettings();
  createWindow();

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handler: open a folder selection dialog and return the selected path
ipcMain.handle('dialog:select-folder', async (event) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// IPC handler: save a file to disk
ipcMain.handle('file:save', async (event, { folderPath, fileName, content }) => {
  if (!folderPath || !fileName) {
    throw new Error('folderPath and fileName are required');
  }
  const filePath = path.join(folderPath, fileName);
  await fs.promises.writeFile(filePath, content, 'utf8');
  return filePath;
});

// --- OAuth2 Device Code flow with Microsoft (Outlook / Graph) ---
let tokenStore = null; // store last tokens in memory for this session

function loadOAuthConfig() {
  try {
    const cfgPath = path.join(process.cwd(), 'oauth.config.json');
    if (fs.existsSync(cfgPath)) {
      const raw = fs.readFileSync(cfgPath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Failed to load oauth.config.json', err);
  }
  return null;
}

const TOKEN_STORE_PATH = path.join(app.getPath('userData'), 'token.store.json');
const ENCRYPTION_KEY = crypto.createHash('sha256').update('votre_phrase_secrete').digest(); // 32 bytes
const IV = Buffer.alloc(16, 0); // IV statique pour démo, à randomiser en prod

function encrypt(data) {
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, IV);
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return encrypted;
}

function decrypt(encrypted) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, IV);
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKEN_STORE_PATH, encrypt(tokens), 'utf8');
}

function loadTokens() {
  try {
    const encrypted = fs.readFileSync(TOKEN_STORE_PATH, 'utf8');
    return decrypt(encrypted);
  } catch {
    return null;
  }
}

ipcMain.handle('oauth:start-device', async (event) => {
  const cfg = loadOAuthConfig();
  if (!cfg || !cfg.clientId) {
    throw new Error('Missing oauth.config.json with clientId');
  }

  const tenant = cfg.tenant || 'common';
  const params = new URLSearchParams();
  params.append('client_id', cfg.clientId);
  params.append('scope', cfg.scopes || 'offline_access Mail.Read');

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/devicecode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Device code request failed: ' + txt);
  }
  const data = await res.json();
  return data;
});

ipcMain.handle('oauth:poll-token', async (event, { device_code }) => {
  const cfg = loadOAuthConfig();
  if (!cfg || !cfg.clientId) {
    throw new Error('Missing oauth.config.json with clientId');
  }

  const params = new URLSearchParams();
  params.append('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');
  params.append('client_id', cfg.clientId);
  params.append('device_code', device_code);

  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json();
  if (data.error) {
    return { ok: false, data };
  }
  tokenStore = data;
  saveTokens(data);
  return { ok: true, data };
});

ipcMain.handle('oauth:load-tokens', async () => {
  return loadTokens();
});

ipcMain.handle('oauth:refresh-token', async (event, { refresh_token }) => {
  const cfg = loadOAuthConfig();
  const params = new URLSearchParams();
  params.append('client_id', cfg.clientId);
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', refresh_token);
  params.append('scope', cfg.scopes || 'offline_access Mail.Read');
  const res = await fetch(`https://login.microsoftonline.com/${cfg.tenant || 'common'}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) throw new Error('Refresh token failed');
  const data = await res.json();
  saveTokens(data);
  return data;
});

ipcMain.handle('graph:get-messages', async (event, { accessToken, top = 25, filter = null }) => {
  const token = accessToken || (tokenStore && tokenStore.access_token);
  if (!token) throw new Error('No access token available');

  let url = `https://graph.microsoft.com/v1.0/me/messages?$top=${top}`;
  if (filter) {
    url += `&$filter=${encodeURIComponent(filter)}`;
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Graph request failed: ' + txt);
  }
  const data = await res.json();
  return data;
});

ipcMain.handle('oauth:delete-tokens', async () => {
  try {
    if (fs.existsSync(TOKEN_STORE_PATH)) {
      fs.unlinkSync(TOKEN_STORE_PATH);
    }
    tokenStore = null;
    return { success: true };
  } catch (error) {
    console.error('Erreur lors de la suppression des tokens :', error);
    return { success: false, error: error.message };
  }
});

// JSON-based sender paths handlers
ipcMain.handle('db:get-sender-path', async (event, senderEmail) => {
  try {
    const paths = loadSenderPaths();
    return paths[senderEmail] || null;
  } catch (error) {
    console.error('Error getting sender path:', error);
    return null;
  }
});

ipcMain.handle('db:set-sender-path', async (event, { senderEmail, senderName, folderPath }) => {
  try {
    const paths = loadSenderPaths();
    const now = new Date().toISOString();
    
    paths[senderEmail] = {
      sender_email: senderEmail,
      sender_name: senderName,
      folder_path: folderPath,
      created_at: paths[senderEmail]?.created_at || now,
      updated_at: now
    };
    
    saveSenderPaths(paths);
    return { success: true };
  } catch (error) {
    console.error('Error setting sender path:', error);
    throw error;
  }
});

ipcMain.handle('db:get-all-sender-paths', async (event) => {
  try {
    const paths = loadSenderPaths();
    return Object.values(paths).sort((a, b) => 
      new Date(b.updated_at) - new Date(a.updated_at)
    );
  } catch (error) {
    console.error('Error getting all sender paths:', error);
    return [];
  }
});

ipcMain.handle('db:delete-sender-path', async (event, senderEmail) => {
  try {
    const paths = loadSenderPaths();
    const exists = !!paths[senderEmail];
    delete paths[senderEmail];
    saveSenderPaths(paths);
    return { success: true, changes: exists ? 1 : 0 };
  } catch (error) {
    console.error('Error deleting sender path:', error);
    throw error;
  }
});

// General settings handlers
ipcMain.handle('settings:get-general', async (event) => {
  try {
    return loadGeneralSettings();
  } catch (error) {
    console.error('Error getting general settings:', error);
    return { rootFolder: '', folderStructure: [] };
  }
});

ipcMain.handle('settings:save-general', async (event, settings) => {
  try {
    saveGeneralSettings(settings);
    return { success: true };
  } catch (error) {
    console.error('Error saving general settings:', error);
    throw error;
  }
});

ipcMain.handle('folder:create-client', async (event, clientName) => {
  try {
    const clientPath = await createClientFolder(clientName);
    return { success: true, path: clientPath };
  } catch (error) {
    console.error('Error creating client folder:', error);
    return { success: false, error: error.message };
  }
});

// Enhanced file save handler with automatic client folder creation
ipcMain.handle('file:save-with-sender', async (event, { message, customPath = null }) => {
  try {
    const senderEmail = message.from?.emailAddress?.address;
    const senderName = message.from?.emailAddress?.name;
    
    let folderPath = customPath;
    
    // If no custom path provided, try to get sender's configured path
    if (!folderPath && senderEmail) {
      const paths = loadSenderPaths();
      const senderPath = paths[senderEmail];
      
      if (senderPath) {
        folderPath = senderPath.folder_path;
      } else {
        // Auto-create client folder if general settings are configured
        const settings = loadGeneralSettings();
        if (settings.rootFolder && senderName) {
          // Clean sender name for folder name
          const cleanName = senderName.replace(/[<>:"/\\|?*]/g, '_');
          try {
            const clientResult = await createClientFolder(cleanName);
            folderPath = clientResult;
            
            // Auto-save this path for future use
            const paths = loadSenderPaths();
            paths[senderEmail] = {
              sender_email: senderEmail,
              sender_name: senderName,
              folder_path: folderPath,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            saveSenderPaths(paths);
          } catch (createError) {
            console.error('Error auto-creating client folder:', createError);
          }
        }
      }
    }
    
    if (!folderPath) {
      return { success: false, error: 'Aucun chemin configuré pour cet expéditeur' };
    }
    
    // Create filename
    const date = new Date(message.receivedDateTime);
    const dateStr = date.toISOString().split('T')[0];
    const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-');
    const subject = (message.subject || 'Sans_sujet').replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
    const fileName = `${dateStr}_${timeStr}_${subject}.json`;
    
    const filePath = path.join(folderPath, fileName);
    
    // Save file
    fs.writeFileSync(filePath, JSON.stringify(message, null, 2));
    
    return { 
      success: true, 
      filePath,
      fileName,
      senderEmail,
      senderName,
      autoCreated: customPath === null && !loadSenderPaths()[senderEmail]
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});