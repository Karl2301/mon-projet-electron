const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Gestion conditionnelle de electron-squirrel-startup (Windows uniquement)
if (process.platform === 'win32') {
  try {
    // valeur retournée = true si Squirrel a géré un événement (ex: install)
    if (require('electron-squirrel-startup')) {
      app.quit();
      // fin du process si Squirrel a géré l'événement
      process.exit(0);
    }
  } catch (err) {
    // module absent : on ignore (utile si packager/externalization empêche la résolution)
    console.warn('electron-squirrel-startup non trouvé — ignoré sur cette plateforme');
  }
}

// Path for sender paths storage
const SENDER_PATHS_FILE = path.join(app.getPath('userData'), 'sender_paths.json');

// Path for general settings storage
const GENERAL_SETTINGS_FILE = path.join(app.getPath('userData'), 'general_settings.json');

// Token storage
const TOKEN_STORE_PATH = path.join(app.getPath('userData'), 'token.store.json');
const ENCRYPTION_KEY = crypto.createHash('sha256').update('votre_phrase_secrete').digest(); // 32 bytes
const IV = Buffer.alloc(16, 0); // IV statique pour démo, à randomiser en prod

let tokenStore = null; // store last tokens in memory for this session

// Chemin vers le fichier de configuration OAuth - maintenant dans src/
function getOAuthConfigPath() {
  // En développement
  if (process.env.NODE_ENV === 'development') {
    return path.join(__dirname, 'oauth.config.json');
  }
  
  // En production (build) - copié dans le même répertoire que main.js
  const buildPath = path.join(__dirname, 'oauth.config.json');
  if (fs.existsSync(buildPath)) {
    return buildPath;
  }
  
  // Fallback
  return path.join(__dirname, '..', 'oauth.config.json');
}

// Fonction pour charger la configuration OAuth - VERSION CORRIGÉE
function loadOAuthConfig() {
  try {
    let configPath;
    
    if (process.env.NODE_ENV === 'development') {
      // En développement, chercher dans src/
      configPath = path.join(__dirname, 'oauth.config.json');
    } else {
      // En production (build), chercher dans le même répertoire que main.js
      configPath = path.join(__dirname, 'oauth.config.json');
    }
    
    console.log('Tentative de chargement OAuth config depuis:', configPath);
    
    if (!fs.existsSync(configPath)) {
      // Fallback: essayer à la racine du projet
      const fallbackPath = path.join(__dirname, '..', '..', 'oauth.config.json');
      if (fs.existsSync(fallbackPath)) {
        configPath = fallbackPath;
        console.log('Fichier trouvé via fallback:', configPath);
      } else {
        throw new Error(`Fichier oauth.config.json non trouvé à: ${configPath}`);
      }
    }
    
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);
    
    if (!config.clientId) {
      throw new Error('clientId manquant dans oauth.config.json');
    }
    
    console.log('✅ Configuration OAuth chargée avec succès');
    return config;
  } catch (error) {
    console.error('❌ Erreur lors du chargement de oauth.config.json:', error);
    throw error;
  }
}

// Encryption functions
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

// Helper function to count items in structure
function countStructureItems(structure) {
  let count = 0;
  structure.forEach(item => {
    count++;
    if (item.children) {
      count += countStructureItems(item.children);
    }
  });
  return count;
}

// Sender paths management functions
function loadSenderPaths() {
  try {
    if (fs.existsSync(SENDER_PATHS_FILE)) {
      const data = fs.readFileSync(SENDER_PATHS_FILE, 'utf8');
      return JSON.parse(data);
    }
    return {};
  } catch (error) {
    console.error('Error loading sender paths:', error);
    return {};
  }
}

function saveSenderPaths(paths) {
  try {
    fs.writeFileSync(SENDER_PATHS_FILE, JSON.stringify(paths, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving sender paths:', error);
    throw error;
  }
}

function initSenderPaths() {
  try {
    if (!fs.existsSync(SENDER_PATHS_FILE)) {
      saveSenderPaths({});
      console.log('✅ Sender paths file initialized');
    }
  } catch (error) {
    console.error('Error initializing sender paths:', error);
  }
}

// General settings management functions
function loadGeneralSettings() {
  try {
    if (fs.existsSync(GENERAL_SETTINGS_FILE)) {
      const data = fs.readFileSync(GENERAL_SETTINGS_FILE, 'utf8');
      return JSON.parse(data);
    }
    return { 
      rootFolder: '', 
      folderStructure: [],
      emailDepositFolder: ''
    };
  } catch (error) {
    console.error('Error loading general settings:', error);
    return { 
      rootFolder: '', 
      folderStructure: [],
      emailDepositFolder: ''
    };
  }
}

function saveGeneralSettings(settings) {
  try {
    fs.writeFileSync(GENERAL_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving general settings:', error);
    throw error;
  }
}

function initGeneralSettings() {
  try {
    if (!fs.existsSync(GENERAL_SETTINGS_FILE)) {
      saveGeneralSettings({ 
        rootFolder: '', 
        folderStructure: [],
        emailDepositFolder: ''
      });
      console.log('✅ General settings file initialized');
    }
  } catch (error) {
    console.error('Error initializing general settings:', error);
  }
}

// Missing IPC handler for save-message
ipcMain.handle('save-message', async (event, { message, senderPath, senderEmail, senderName }) => {
  try {
    if (!senderPath) {
      return { success: false, error: 'Aucun chemin configuré pour cet expéditeur' };
    }
    
    // Create filename
    const date = new Date(message.receivedDateTime);
    const dateStr = date.toISOString().split('T')[0];
    const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-');
    const subject = (message.subject || 'Sans_sujet').replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
    const fileName = `${dateStr}_${timeStr}_${subject}.json`;
    
    const filePath = path.join(senderPath, fileName);
    
    // Ensure directory exists
    if (!fs.existsSync(senderPath)) {
      fs.mkdirSync(senderPath, { recursive: true });
    }
    
    // Save file
    fs.writeFileSync(filePath, JSON.stringify(message, null, 2), 'utf8');
    
    return { 
      success: true, 
      filePath,
      fileName,
      senderEmail,
      senderName
    };
  } catch (error) {
    console.error('Error saving message:', error);
    return { success: false, error: error.message };
  }
});

// Missing IPC handlers for sender paths with correct names
ipcMain.handle('get-sender-path', async (event, senderEmail) => {
  try {
    const paths = loadSenderPaths();
    return paths[senderEmail] || null;
  } catch (error) {
    console.error('Error getting sender path:', error);
    return null;
  }
});

ipcMain.handle('set-sender-path', async (event, { senderEmail, senderName, folderPath }) => {
  try {
    const paths = loadSenderPaths();
    const now = new Date().toISOString();
    
    // Check if this is a new sender path
    const isNewSender = !paths[senderEmail];
    
    paths[senderEmail] = {
      sender_email: senderEmail,
      sender_name: senderName,
      folder_path: folderPath,
      created_at: paths[senderEmail]?.created_at || now,
      updated_at: now
    };
    
    saveSenderPaths(paths);
    
    // If it's a new sender, deploy the folder structure automatically
    if (isNewSender) {
      try {
        const settings = loadGeneralSettings();
        if (settings.folderStructure && settings.folderStructure.length > 0) {
          console.log('Deploying folder structure for new sender:', senderName);
          await createFolderStructure(folderPath, settings.folderStructure);
          
          return { 
            success: true, 
            structureDeployed: true,
            structureCount: countStructureItems(settings.folderStructure)
          };
        }
      } catch (structureError) {
        console.error('Error deploying structure for sender:', structureError);
        return { 
          success: true, 
          structureDeployed: false,
          structureError: structureError.message
        };
      }
    }
    
    return { success: true, structureDeployed: false };
  } catch (error) {
    console.error('Error setting sender path:', error);
    throw error;
  }
});

ipcMain.handle('update-sender-path', async (event, { senderEmail, senderName, folderPath }) => {
  try {
    const paths = loadSenderPaths();
    if (!paths[senderEmail]) {
      throw new Error('Sender path not found');
    }
    
    paths[senderEmail] = {
      ...paths[senderEmail],
      sender_name: senderName,
      folder_path: folderPath,
      updated_at: new Date().toISOString()
    };
    
    saveSenderPaths(paths);
    return { success: true };
  } catch (error) {
    console.error('Error updating sender path:', error);
    throw error;
  }
});

ipcMain.handle('get-all-sender-paths', async (event) => {
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

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load the app
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
};

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  initSenderPaths();
  initGeneralSettings();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// === IPC HANDLERS ===

// Dialog handlers
ipcMain.handle('dialog:select-folder', async (event) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('dialog:select-folder-with-create', async (event) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: 'Sélectionner ou créer un dossier racine'
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// Authentication handlers - UNIFIED
ipcMain.handle('auth:start-device-flow', async () => {
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

ipcMain.handle('auth:poll-token', async (event, data) => {
  const cfg = loadOAuthConfig();
  if (!cfg || !cfg.clientId) {
    throw new Error('Missing oauth.config.json with clientId');
  }

  const params = new URLSearchParams();
  params.append('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');
  params.append('client_id', cfg.clientId);
  params.append('device_code', data.device_code);

  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const responseData = await res.json();
  if (responseData.error) {
    return { ok: false, data: responseData };
  }
  tokenStore = responseData;
  saveTokens(responseData);
  return { ok: true, data: responseData };
});

ipcMain.handle('auth:refresh-token', async (event, refreshToken) => {
  const cfg = loadOAuthConfig();
  const params = new URLSearchParams();
  params.append('client_id', cfg.clientId);
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', refreshToken);
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

ipcMain.handle('auth:load-tokens', async () => {
  return loadTokens();
});

ipcMain.handle('auth:delete-tokens', async () => {
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

// Messages handlers
ipcMain.handle('outlook:get-messages', async (event, { accessToken, top = 25, filter = null }) => {
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

// File handlers
ipcMain.handle('file:save', async (event, { folderPath, fileName, content }) => {
  if (!folderPath || !fileName) {
    throw new Error('folderPath and fileName are required');
  }
  const filePath = path.join(folderPath, fileName);
  await fs.promises.writeFile(filePath, content, 'utf8');
  return filePath;
});

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

// Folder handlers
ipcMain.handle('folder:deploy-structure', async (event, { rootPath, structure }) => {
  try {
    if (!fs.existsSync(rootPath)) {
      fs.mkdirSync(rootPath, { recursive: true });
    }

    await createFolderStructure(rootPath, structure);
    
    return { success: true, path: rootPath };
  } catch (error) {
    console.error('Error deploying folder structure:', error);
    return { success: false, error: error.message };
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

// Sender paths handlers
ipcMain.handle('sender:get-path', async (event, senderEmail) => {
  try {
    const paths = loadSenderPaths();
    return paths[senderEmail] || null;
  } catch (error) {
    console.error('Error getting sender path:', error);
    return null;
  }
});

ipcMain.handle('sender:set-path', async (event, { senderEmail, senderName, folderPath }) => {
  try {
    const paths = loadSenderPaths();
    const now = new Date().toISOString();
    
    // Check if this is a new sender path
    const isNewSender = !paths[senderEmail];
    
    paths[senderEmail] = {
      sender_email: senderEmail,
      sender_name: senderName,
      folder_path: folderPath,
      created_at: paths[senderEmail]?.created_at || now,
      updated_at: now
    };
    
    saveSenderPaths(paths);
    
    // If it's a new sender, deploy the folder structure automatically
    if (isNewSender) {
      try {
        const settings = loadGeneralSettings();
        if (settings.folderStructure && settings.folderStructure.length > 0) {
          console.log('Deploying folder structure for new sender:', senderName);
          await createFolderStructure(folderPath, settings.folderStructure);
          
          return { 
            success: true, 
            structureDeployed: true,
            structureCount: countStructureItems(settings.folderStructure)
          };
        }
      } catch (structureError) {
        console.error('Error deploying structure for sender:', structureError);
        return { 
          success: true, 
          structureDeployed: false,
          structureError: structureError.message
        };
      }
    }
    
    return { success: true, structureDeployed: false };
  } catch (error) {
    console.error('Error setting sender path:', error);
    throw error;
  }
});

ipcMain.handle('sender:get-all-paths', async (event) => {
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

ipcMain.handle('sender:delete-path', async (event, senderEmail) => {
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

ipcMain.handle('sender:update-path', async (event, { senderEmail, senderName, folderPath }) => {
  try {
    const paths = loadSenderPaths();
    if (!paths[senderEmail]) {
      throw new Error('Sender path not found');
    }
    
    paths[senderEmail] = {
      ...paths[senderEmail],
      sender_name: senderName,
      folder_path: folderPath,
      updated_at: new Date().toISOString()
    };
    
    saveSenderPaths(paths);
    return { success: true };
  } catch (error) {
    console.error('Error updating sender path:', error);
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