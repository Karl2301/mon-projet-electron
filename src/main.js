import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';
import { URLSearchParams } from 'node:url';
import crypto from 'crypto';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
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

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

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

  const tenant = cfg.tenant || 'common'; // Default to 'common' if no tenant is specified
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
  // return device code info to renderer so user can visit verification URI
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

  // poll until success or error (the caller can control timing)
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json();
  if (data.error) {
    // could be authorization_pending, slow_down, expired_token, etc.
    return { ok: false, data };
  }
  // success
  tokenStore = data; // keep tokens in memory
  saveTokens(data); // sauvegarde access_token et refresh_token
  return { ok: true, data };
});

// Ajoutez un handler IPC pour charger les tokens au démarrage :
ipcMain.handle('oauth:load-tokens', async () => {
  return loadTokens();
});

// Ajoutez un handler IPC pour rafraîchir le token :
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

ipcMain.handle('graph:get-messages', async (event, { accessToken, top = 25 }) => {
  // use provided accessToken or fallback to in-memory token
  const token = accessToken || (tokenStore && tokenStore.access_token);
  if (!token) throw new Error('No access token available');

  const res = await fetch(`https://graph.microsoft.com/v1.0/me/messages?$top=${top}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Graph request failed: ' + txt);
  }
  const data = await res.json();
  return data;
});
