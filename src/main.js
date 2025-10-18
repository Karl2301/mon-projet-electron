const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Try to import EmailSyncDaemon, but handle gracefully if not available
let EmailSyncDaemon = null;
let emailDaemon = null;

try {
  // Adjust this path based on where your EmailSyncDaemon module is located
  EmailSyncDaemon = require('./email-sync-daemon');
} catch (error) {
  console.warn('⚠️ EmailSyncDaemon non disponible:', error.message);
  EmailSyncDaemon = null;
}

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
const SAVED_EMAILS_INDEX_FILE = path.join(app.getPath('userData'), 'saved_emails_index.json');


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

function findExistingCorrespondent(email) {
  const paths = loadSenderPaths();
  
  // Chercher d'abord par email exact
  if (paths[email]) {
    return paths[email];
  }
  
  // Chercher dans tous les enregistrements si cet email existe comme expéditeur
  for (const [senderEmail, pathInfo] of Object.entries(paths)) {
    if (senderEmail === email) {
      return pathInfo;
    }
  }
  
  return null;
}

// Fonction pour charger la configuration OAuth - VERSION CORRIGÉE
function loadOAuthConfig() {
  try {
    let configPath;
    
    if (process.env.NODE_ENV === 'development') {
      // En développement, chercher dans src/ d'abord, puis à la racine
      const srcPath = path.join(__dirname, 'oauth.config.json');
      const rootPath = path.join(__dirname, '..', 'oauth.config.json');
      
      if (fs.existsSync(srcPath)) {
        configPath = srcPath;
      } else if (fs.existsSync(rootPath)) {
        configPath = rootPath;
      } else {
        throw new Error(`Fichier oauth.config.json non trouvé`);
      }
    } else {
      // En production (build), chercher dans le même répertoire que main.js
      configPath = path.join(__dirname, 'oauth.config.json');
      
      if (!fs.existsSync(configPath)) {
        // Fallback: essayer à la racine du projet
        const fallbackPath = path.join(__dirname, '..', '..', 'oauth.config.json');
        if (fs.existsSync(fallbackPath)) {
          configPath = fallbackPath;
        } else {
          throw new Error(`Fichier oauth.config.json non trouvé à: ${configPath}`);
        }
      }
    }
    
    console.log('Chargement OAuth config depuis:', configPath);
    
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);
    
    // Vérifier la structure de la configuration et adapter si nécessaire
    if (config.clientId && !config.microsoft) {
      // Ancienne structure - créer une structure compatible
      console.log('⚠️ Ancienne structure OAuth détectée, adaptation en cours...');
      return {
        microsoft: {
          clientId: config.clientId,
          tenant: config.tenant || 'common',
          scopes: config.scopes || 'offline_access Mail.Read'
        }
      };
    } else if (config.microsoft && config.microsoft.clientId) {
      // Nouvelle structure avec providers séparés
      console.log('✅ Configuration OAuth avec providers séparés chargée');
      return config;
    } else {
      throw new Error('Structure de configuration OAuth invalide');
    }
    
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

// Ajouter une fonction pour créer ou obtenir un dossier dans INBOX
async function createOrGetInboxSubfolder(accessToken, folderName) {
  try {
    // D'abord, obtenir l'ID du dossier INBOX
    const inboxResponse = await fetch(`https://graph.microsoft.com/v1.0/me/mailFolders/Inbox`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (!inboxResponse.ok) {
      throw new Error('Impossible d\'accéder au dossier INBOX');
    }
    
    const inboxData = await inboxResponse.json();
    const inboxId = inboxData.id;
    
    // Vérifier si le sous-dossier existe déjà dans INBOX
    const subfoldersResponse = await fetch(`https://graph.microsoft.com/v1.0/me/mailFolders/${inboxId}/childFolders`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (subfoldersResponse.ok) {
      const subfoldersData = await subfoldersResponse.json();
      const existingFolder = subfoldersData.value.find(folder => folder.displayName === folderName);
      
      if (existingFolder) {
        console.log(`📁 Sous-dossier "${folderName}" trouvé dans INBOX:`, existingFolder.id);
        return {
          id: existingFolder.id,
          name: folderName,
          created: false
        };
      }
    }
    
    // Créer le sous-dossier dans INBOX s'il n'existe pas
    console.log(`📁 Création du sous-dossier "${folderName}" dans INBOX...`);
    const createResponse = await fetch(`https://graph.microsoft.com/v1.0/me/mailFolders/${inboxId}/childFolders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        displayName: folderName
      })
    });
    
    if (!createResponse.ok) {
      const errorData = await createResponse.json();
      throw new Error(`Impossible de créer le sous-dossier: ${JSON.stringify(errorData)}`);
    }
    
    const newFolder = await createResponse.json();
    console.log(`✅ Sous-dossier "${folderName}" créé dans INBOX:`, newFolder.id);
    
    return {
      id: newFolder.id,
      name: folderName,
      created: true
    };
    
  } catch (error) {
    console.error('Erreur lors de la création/récupération du sous-dossier INBOX:', error);
    throw error;
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
      emailDepositFolder: '', // Dossier pour emails reçus (rétrocompatibilité)
      receivedEmailDepositFolder: '', // Nouveau: dossier spécifique pour emails reçus
      sentEmailDepositFolder: '', // Nouveau: dossier spécifique pour emails envoyés
      // Nouvelles options de nommage et format
      fileFormat: 'json', // json, msg, eml, txt
      filenamePattern: '{date}_{time}_{subject}', // Pattern de nommage
      filenamePatternSent: 'SENT_{date}_{time}_{subject}' // Pattern pour les emails envoyés
    };
  } catch (error) {
    console.error('Error loading general settings:', error);
    return { 
      rootFolder: '', 
      folderStructure: [],
      emailDepositFolder: '',
      receivedEmailDepositFolder: '',
      sentEmailDepositFolder: '',
      fileFormat: 'json',
      filenamePattern: '{date}_{time}_{subject}',
      filenamePatternSent: 'SENT_{date}_{time}_{subject}'
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
        emailDepositFolder: '',
        receivedEmailDepositFolder: '',
        sentEmailDepositFolder: '',
        fileFormat: 'json',
        filenamePattern: '{date}_{time}_{subject}',
        filenamePatternSent: 'SENT_{date}_{time}_{subject}'
      });
      console.log('✅ General settings file initialized');
    }
  } catch (error) {
    console.error('Error initializing general settings:', error);
  }
}

// Fonction pour générer le nom de fichier basé sur le pattern - CORRIGÉE
function generateFilename(message, pattern, messageType = 'received', userEmail = 'user@example.com') {
  const date = new Date(messageType === 'sent' ? message.sentDateTime : message.receivedDateTime);
  
  // Charger les paramètres de nettoyage des caractères
  const settings = loadGeneralSettings();
  const cleaningSettings = settings.characterCleaning || {
    enabled: true,
    charactersToClean: {
      '<': true, '>': true, ':': true, '"': true, '/': true, '\\': true, '|': true, '?': true, '*': true,
      '@': false, '#': false, '%': false, '&': false, '+': false, '=': false, '[': false, ']': false,
      '{': false, '}': false, ';': false, ',': false, '!': false, '~': false, '`': false, '$': false, '^': false
    },
    replaceWith: '_'
  };
  
  // Fonction pour nettoyer le texte selon les paramètres utilisateur
  const cleanText = (text, maxLength = null) => {
    if (!text) return 'unknown';
    
    let cleaned = text.toString();
    
    // Appliquer le nettoyage seulement si activé
    if (cleaningSettings.enabled) {
      Object.entries(cleaningSettings.charactersToClean).forEach(([char, shouldClean]) => {
        if (shouldClean) {
          const escapedChar = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(escapedChar, 'g');
          cleaned = cleaned.replace(regex, cleaningSettings.replaceWith || '_');
        }
      });
    }
    
    if (maxLength && cleaned.length > maxLength) {
      cleaned = cleaned.substring(0, maxLength);
    }
    
    return cleaned;
  };
  
  // CORRECTION: Modules avec les vraies informations de l'email
  const modules = {
    // Date et heure (pas de nettoyage nécessaire)
    '{date}': date.toISOString().split('T')[0], // YYYY-MM-DD
    '{date_fr}': date.toLocaleDateString('fr-FR').replace(/\//g, '-'), // DD-MM-YYYY
    '{date_us}': date.toLocaleDateString('en-US').replace(/\//g, '-'), // MM-DD-YYYY
    '{year}': date.getFullYear().toString(),
    '{month}': (date.getMonth() + 1).toString().padStart(2, '0'),
    '{day}': date.getDate().toString().padStart(2, '0'),
    '{time}': date.toTimeString().split(' ')[0].replace(/:/g, '-'), // HH-MM-SS
    '{time_12}': date.toLocaleTimeString('en-US', { hour12: true }).replace(/:/g, '-').replace(/\s/g, ''),
    '{hour}': date.getHours().toString().padStart(2, '0'),
    '{minute}': date.getMinutes().toString().padStart(2, '0'),
    '{second}': date.getSeconds().toString().padStart(2, '0'),
    
    // Informations du message (avec nettoyage intelligent)
    '{subject}': cleanText(message.subject || 'Sans_sujet', 50),
    '{subject_short}': cleanText(message.subject || 'Sans_sujet', 20),
    
    // CORRECTION: Informations sur les emails avec les vraies données
    '{sender_email}': messageType === 'sent' 
      ? cleanText(userEmail) 
      : cleanText(message.from?.emailAddress?.address || 'unknown_sender'),
    '{sender_name}': messageType === 'sent'
      ? 'User'
      : cleanText(message.from?.emailAddress?.name || message.from?.emailAddress?.address || 'Unknown_Sender', 30),
    '{recipient_email}': messageType === 'sent'
      ? cleanText(message.toRecipients?.[0]?.emailAddress?.address || 'unknown_recipient')
      : cleanText(userEmail),
    '{recipient_name}': messageType === 'sent'
      ? cleanText(message.toRecipients?.[0]?.emailAddress?.name || message.toRecipients?.[0]?.emailAddress?.address || 'Unknown_Recipient', 30)
      : 'User',
    
    // Informations techniques (avec nettoyage minimal)
    '{message_id}': message.id ? cleanText(message.id.substring(0, 8)) : 'no-id',
    '{importance}': cleanText(message.importance || 'normal'),
    '{has_attachments}': message.hasAttachments ? 'with-attachments' : 'no-attachments',
    
    // Timestamps (pas de nettoyage nécessaire)
    '{timestamp}': Math.floor(date.getTime() / 1000).toString(),
    '{timestamp_ms}': date.getTime().toString(),
    
    // Formats spéciaux (avec nettoyage)
    '{week_day}': cleanText(date.toLocaleDateString('fr-FR', { weekday: 'long' }).replace(/\s/g, '_')),
    '{month_name}': cleanText(date.toLocaleDateString('fr-FR', { month: 'long' })),
    '{quarter}': 'Q' + Math.ceil((date.getMonth() + 1) / 3),
    
    // Préfixes automatiques (pas de nettoyage nécessaire)
    '{type_prefix}': messageType === 'sent' ? 'SENT' : 'RECEIVED',
    '{direction}': messageType === 'sent' ? 'OUT' : 'IN'
  };
  
  // Remplacer tous les modules dans le pattern
  let filename = pattern;
  Object.entries(modules).forEach(([module, value]) => {
    filename = filename.replace(new RegExp(module.replace(/[{}]/g, '\\$&'), 'g'), value);
  });
  
  // Nettoyage final du nom de fichier complet
  const systemForbiddenChars = /[<>:"/\\|?*\x00-\x1f\x7f]/g;
  filename = filename.replace(systemForbiddenChars, cleaningSettings.replaceWith || '_');
  
  return filename;
}

// Remplacer le handler save-message par cette version complète :

ipcMain.handle('save-message', async (event, { message, senderPath, senderEmail, senderName, outlookActions = {} }) => {
  try {
    console.log('📧 Sauvegarde du message:', {
      messageId: message.id,
      subject: message.subject,
      senderPath,
      senderEmail,
      outlookActions
    });

    // Load general settings
    const generalSettings = loadGeneralSettings();
    const fileFormatSettings = generalSettings.fileFormat || {};
    
    // Generate filename
    const pattern = fileFormatSettings.filenamePattern || '{date}_{time}_{subject}';
    const filename = generateFilename(message, pattern, 'received');
    
    // Determine full save path
    let actualSavePath = senderPath;
    let depositFolderUsed = false;
    let depositFolder = null;
    
    // Check if we should use deposit folder
    if (generalSettings.receivedEmailDepositFolder) {
      depositFolder = generalSettings.receivedEmailDepositFolder;
      const depositPath = path.join(senderPath, depositFolder);
      
      if (fs.existsSync(depositPath)) {
        actualSavePath = depositPath;
        depositFolderUsed = true;
        console.log(`📁 Utilisation du dossier de dépôt: ${depositPath}`);
      } else {
        console.log(`⚠️ Dossier de dépôt non trouvé: ${depositPath}, sauvegarde directe`);
      }
    }
    
    const fullPath = path.join(actualSavePath, filename);
    
    // Save message content
    const messageData = {
      id: message.id,
      subject: message.subject,
      from: message.from,
      toRecipients: message.toRecipients,
      receivedDateTime: message.receivedDateTime,
      bodyPreview: message.bodyPreview,
      body: message.body,
      hasAttachments: message.hasAttachments,
      importance: message.importance,
      isRead: message.isRead,
      savedAt: new Date().toISOString(),
      senderInfo: {
        email: senderEmail,
        name: senderName,
        folderPath: senderPath
      }
    };
    
    await fs.promises.writeFile(fullPath, JSON.stringify(messageData, null, 2), 'utf8');
    console.log('✅ Message sauvegardé:', fullPath);
    
    // === ACTIONS OUTLOOK AVEC SOUS-DOSSIERS INBOX ===
    const outlookResults = {
      folderCreated: false,
      movePerformed: false,
      markAsReadPerformed: false,
      targetFolder: null,
      errors: []
    };
    
    console.log('🔍 Vérification des conditions Outlook:', {
      hasToken: !!tokenStore?.access_token,
      moveToFiledRequested: outlookActions.moveToFiled,
      markAsReadRequested: outlookActions.markAsRead,
      outlookActions: outlookActions
    });

    if (tokenStore?.access_token && (outlookActions.moveToFiled || outlookActions.markAsRead)) {
      console.log('🔄 Début des actions Outlook avec OutlookHandler...');
      
      try {
        const OutlookHandler = require('../outlook-handler');
        const outlookHandler = new OutlookHandler(tokenStore.access_token);
        
        // Action 1: Déplacer vers un sous-dossier de INBOX
        if (outlookActions.moveToFiled) {
          try {
            console.log('📁 Création/récupération du sous-dossier INBOX...');
            const folderName = 'EmailManager Filed';
            const inboxSubfolder = await createOrGetInboxSubfolder(tokenStore.access_token, folderName);
            
            console.log('📁 Sous-dossier INBOX:', {
              id: inboxSubfolder.id,
              name: inboxSubfolder.name,
              created: inboxSubfolder.created
            });
            
            console.log('📧 Déplacement du message vers le sous-dossier...');
            await outlookHandler.moveMessage(message.id, inboxSubfolder.id);
            
            outlookResults.movePerformed = true;
            outlookResults.folderCreated = inboxSubfolder.created;
            outlookResults.targetFolder = `INBOX/${inboxSubfolder.name}`;
            
            console.log(`✅ Message déplacé vers le sous-dossier INBOX: ${inboxSubfolder.name}`);
            
          } catch (moveError) {
            console.error('❌ Erreur lors du déplacement vers sous-dossier INBOX:', moveError);
            outlookResults.errors.push(`Déplacement: ${moveError.message}`);
          }
        }
        
        // Action 2: Marquer comme lu
        if (outlookActions.markAsRead && !message.isRead) {
          try {
            console.log('👁️ Marquage du message comme lu...');
            await outlookHandler.markAsRead(message.id);
            
            outlookResults.markAsReadPerformed = true;
            console.log('✅ Message marqué comme lu');
            
          } catch (markError) {
            console.error('❌ Erreur lors du marquage comme lu:', markError);
            outlookResults.errors.push(`Marquage lu: ${markError.message}`);
          }
        } else if (outlookActions.markAsRead && message.isRead) {
          console.log('ℹ️ Message déjà marqué comme lu, action ignorée');
        }
        
        console.log('🎉 Actions Outlook terminées:', outlookResults);
        
      } catch (outlookError) {
        console.error('❌ Erreur générale lors des actions Outlook:', outlookError);
        outlookResults.errors.push(`Outlook général: ${outlookError.message}`);
      }
    } else {
      console.log('ℹ️ Pas d\'actions Outlook demandées ou token manquant');
      if (!tokenStore?.access_token) {
        console.log('❌ Pas de token d\'accès disponible');
      }
      if (!outlookActions.moveToFiled && !outlookActions.markAsRead) {
        console.log('ℹ️ Aucune action Outlook activée');
      }
    }
    
    return {
      success: true,
      fileName: filename,
      actualSavePath,
      depositFolder,
      depositFolderUsed,
      outlookActions: outlookResults
    };

  } catch (error) {
    console.error('Erreur lors de la sauvegarde du message:', error);
    return {
      success: false,
      error: error.message
    };
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

  // Gérer les liens externes - les ouvrir dans le navigateur par défaut
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log('🔗 Tentative d\'ouverture d\'un lien externe:', url);
    
    // Vérifier si c'est un lien externe (pas localhost ou file://)
    if (url.startsWith('http://') || url.startsWith('https://')) {
      // Ne pas ouvrir dans l'app Electron, mais dans le navigateur externe
      shell.openExternal(url);
      return { action: 'deny' };
    }
    
    // Pour les autres types de liens, permettre l'ouverture dans l'app
    return { action: 'allow' };
  });

  // Intercepter les tentatives de navigation pour les liens externes
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    console.log('🧭 Tentative de navigation vers:', navigationUrl);
    
    // Si c'est une navigation vers un site externe
    if (parsedUrl.origin !== 'http://localhost:5173' && // Dev server
        parsedUrl.origin !== 'file://' && // App packagée
        !navigationUrl.includes('login.microsoftonline.com')) { // Permettre OAuth Microsoft
      
      console.log('🚫 Navigation externe bloquée, ouverture dans le navigateur');
      event.preventDefault();
      shell.openExternal(navigationUrl);
    }
  });

  // Gérer les nouveaux liens (target="_blank", window.open, etc.)
  mainWindow.webContents.on('new-window', (event, navigationUrl) => {
    console.log('🆕 Nouvelle fenêtre demandée pour:', navigationUrl);
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });

  // Load the app with proper fallbacks for Vite constants
  const isDev = process.env.NODE_ENV === 'development';
  
  if (isDev && typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined') {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    // In production, try multiple possible paths
    const possiblePaths = [
      path.join(__dirname, `../renderer/${process.env.MAIN_WINDOW_VITE_NAME || 'main_window'}/index.html`),
      path.join(__dirname, '../renderer/main_window/index.html'),
      path.join(__dirname, '../renderer/index.html'),
      path.join(__dirname, 'index.html')
    ];
    
    let loaded = false;
    for (const htmlPath of possiblePaths) {
      if (fs.existsSync(htmlPath)) {
        console.log('Loading app from:', htmlPath);
        mainWindow.loadFile(htmlPath);
        loaded = true;
        break;
      }
    }
    
    if (!loaded) {
      console.error('❌ Could not find index.html file in any of the expected locations');
      console.log('Tried paths:', possiblePaths);
    }
  }

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
};

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  initSenderPaths();
  initGeneralSettings();
  
  // Initialiser le daemon seulement s'il est disponible
  if (EmailSyncDaemon) {
    try {
      emailDaemon = new EmailSyncDaemon({
        userDataPath: app.getPath('userData')
      });
      
      // Écouter les événements du daemon
      emailDaemon.on('started', () => {
        console.log('📡 Email daemon démarré');
      });
      
      emailDaemon.on('stopped', () => {
        console.log('📡 Email daemon arrêté');
      });
      
      emailDaemon.on('syncComplete', (stats) => {
        console.log(`📧 Synchronisation terminée: ${stats.processedMessages} nouveaux messages`);
      });
      
      emailDaemon.on('syncError', (error) => {
        console.error('❌ Erreur de synchronisation daemon:', error.message);
      });
      
      emailDaemon.on('newSender', (senderInfo) => {
        console.log(`📬 Nouvel expéditeur détecté: ${senderInfo.email}`);
      });
      
      emailDaemon.on('messageProcessed', (info) => {
        console.log(`📩 Message traité: ${info.message.subject}`);
      });
      
      console.log('✅ Email daemon initialisé');
    } catch (daemonError) {
      console.error('❌ Erreur lors de l\'initialisation du daemon:', daemonError);
      emailDaemon = null;
    }
  } else {
    console.log('⚠️ Email daemon non disponible - fonctionnalités limitées');
  }
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Gérer la fermeture de l'application
app.on('before-quit', () => {
  if (emailDaemon) {
    try {
      emailDaemon.stop();
    } catch (error) {
      console.error('Erreur lors de l\'arrêt du daemon:', error);
    }
  }
});

// Gérer la fermeture de toutes les fenêtres
app.on('window-all-closed', () => {
  // Sur macOS, laisser l'app tourner même si toutes les fenêtres sont fermées
  if (process.platform === 'darwin') {
    // Le daemon continue de tourner
    console.log('🍎 Fenêtres fermées sur macOS - daemon continue en arrière-plan');
  } else {
    // Sur les autres plateformes, quitter complètement
    app.quit();
  }
});

// === IPC HANDLERS ===

// Handler pour récupérer les emails sauvegardés
ipcMain.handle('emails:get-saved-index', async () => {
  try {
    console.log('🔍 Récupération de l\'index des emails');
    const index = loadSavedEmailsIndex();
    return { success: true, emails: index };
  } catch (error) {
    console.error('❌ Erreur lors de la récupération de l\'index:', error);
    return { success: false, error: error.message, emails: [] };
  }
});

ipcMain.handle('emails:search-saved', async (event, { query, filters = {} }) => {
  try {
    console.log('🔎 Recherche dans l\'index:', { query, filters });
    let emails = loadSavedEmailsIndex();
    console.log('📊 Emails dans l\'index:', emails.length);
    
    // Filtrer par type de message
    if (filters.type && filters.type !== 'all') {
      emails = emails.filter(email => email.messageType === filters.type);
      console.log('📊 Après filtre type:', emails.length);
    }
    
    // Filtrer par période
    if (filters.timeRange && filters.timeRange !== 'all') {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      
      emails = emails.filter(email => {
        const emailDate = new Date(email.receivedDateTime || email.sentDateTime);
        switch (filters.timeRange) {
          case 'today':
            return emailDate >= startOfToday;
          case 'week':
            return emailDate >= startOfWeek;
          case 'month':
            return emailDate >= startOfMonth;
          default:
            return true;
        }
      });
      console.log('📊 Après filtre période:', emails.length);
    }
    
    // Filtrer par pièces jointes
    if (filters.hasAttachments) {
      emails = emails.filter(email => email.hasAttachments === true);
      console.log('📊 Après filtre pièces jointes:', emails.length);
    }
    
    // Recherche textuelle
    if (query && query.trim()) {
      const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 0);
      console.log('🔤 Termes de recherche:', searchTerms);
      
      emails = emails.filter(email => {
        const searchableText = [
          email.subject || '',
          email.bodyPreview || '',
          email.senderEmail || '',
          email.senderName || '',
          email.recipientEmail || '',
          email.recipientName || '',
          email.clientName || ''
        ].join(' ').toLowerCase();
        
        return searchTerms.every(term => searchableText.includes(term));
      });
      console.log('📊 Après recherche textuelle:', emails.length);
    }
    
    // Trier par date (plus récent en premier)
    emails.sort((a, b) => {
      const dateA = new Date(a.receivedDateTime || a.sentDateTime);
      const dateB = new Date(b.receivedDateTime || b.sentDateTime);
      return dateB - dateA;
    });
    
    console.log('✅ Résultats de recherche:', emails.length);
    return { success: true, results: emails };
  } catch (error) {
    console.error('❌ Erreur lors de la recherche:', error);
    return { success: false, error: error.message, results: [] };
  }
});

// Handler de debug
ipcMain.handle('emails:debug-index', async (event, emailData) => {
  console.log('🐛 DEBUG - Données email reçues:', emailData);
  const index = loadSavedEmailsIndex();
  console.log('🐛 DEBUG - Index actuel:', index);
  return { success: true, indexSize: index.length };
});

// NOUVEAU: Fonction pour obtenir la liste des dossiers Outlook
ipcMain.handle('outlook:get-folders', async (event, { accessToken }) => {
  const token = accessToken || (tokenStore && tokenStore.access_token);
  if (!token) {
    throw new Error('Token d\'accès requis');
  }

  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/me/mailFolders', {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (!res.ok) {
      throw new Error(`Erreur API: ${res.status}`);
    }
    
    const data = await res.json();
    console.log('📁 Dossiers Outlook récupérés:', data.value?.length);
    
    return {
      success: true,
      folders: data.value || []
    };
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des dossiers:', error);
    return {
      success: false,
      error: error.message,
      folders: []
    };
  }
});

// NOUVEAU: Fonction pour créer un dossier "EmailManager Filed" s'il n'existe pas
ipcMain.handle('outlook:create-filed-folder', async (event, { accessToken, folderName = 'EmailManager Filed' }) => {
  const token = accessToken || (tokenStore && tokenStore.access_token);
  if (!token) {
    throw new Error('Token d\'accès requis');
  }

  try {
    // D'abord, vérifier si le dossier existe déjà
    const foldersResult = await fetch('https://graph.microsoft.com/v1.0/me/mailFolders', {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (foldersResult.ok) {
      const foldersData = await foldersResult.json();
      const existingFolder = foldersData.value?.find(folder => folder.displayName === folderName);
      
      if (existingFolder) {
        console.log('📁 Dossier déjà existant:', folderName);
        return {
          success: true,
          folder: existingFolder,
          created: false
        };
      }
    }

    // Créer le dossier s'il n'existe pas
    const createRes = await fetch('https://graph.microsoft.com/v1.0/me/mailFolders', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        displayName: folderName
      })
    });
    
    if (!createRes.ok) {
      throw new Error(`Erreur lors de la création du dossier: ${createRes.status}`);
    }
    
    const newFolder = await createRes.json();
    console.log('✅ Dossier créé:', folderName);
    
    return {
      success: true,
      folder: newFolder,
      created: true
    };
  } catch (error) {
    console.error('❌ Erreur lors de la création du dossier:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// NOUVEAU: Fonction pour déplacer un email vers un dossier spécifique
ipcMain.handle('outlook:move-message', async (event, { accessToken, messageId, targetFolderId }) => {
  const token = accessToken || (tokenStore && tokenStore.access_token);
  if (!token) {
    throw new Error('Token d\'accès requis');
  }

  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${messageId}/move`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        destinationId: targetFolderId
      })
    });
    
    if (!res.ok) {
      throw new Error(`Erreur lors du déplacement: ${res.status}`);
    }
    
    const movedMessage = await res.json();
    console.log('✅ Email déplacé avec succès');
    
    return {
      success: true,
      movedMessage: movedMessage
    };
  } catch (error) {
    console.error('❌ Erreur lors du déplacement de l\'email:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// NOUVEAU: Fonction pour marquer un email comme lu
ipcMain.handle('outlook:mark-as-read', async (event, { accessToken, messageId }) => {
  const token = accessToken || (tokenStore && tokenStore.access_token);
  if (!token) {
    throw new Error('Token d\'accès requis');
  }

  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${messageId}`, {
      method: 'PATCH',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        isRead: true
      })
    });
    
    if (!res.ok) {
      throw new Error(`Erreur lors du marquage: ${res.status}`);
    }
    
    const updatedMessage = await res.json();
    console.log('✅ Email marqué comme lu');
    
    return {
      success: true,
      updatedMessage: updatedMessage
    };
  } catch (error) {
    console.error('❌ Erreur lors du marquage de l\'email:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

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

// Authentication handlers - AJOUTER CES HANDLERS MANQUANTS
ipcMain.handle('auth:load-tokens', async () => {
  try {
    const tokens = loadTokens();
    return tokens;
  } catch (error) {
    console.error('Error loading tokens:', error);
    return null;
  }
});

ipcMain.handle('auth:delete-tokens', async () => {
  try {
    if (fs.existsSync(TOKEN_STORE_PATH)) {
      fs.unlinkSync(TOKEN_STORE_PATH);
    }
    tokenStore = null;
    return { success: true };
  } catch (error) {
    console.error('Error deleting tokens:', error);
    return { success: false, error: error.message };
  }
});

// Authentication handlers - CORRECTIONS DES CHEMINS
ipcMain.handle('auth:start-device-flow', async () => {
  const cfg = loadOAuthConfig();
  if (!cfg || !cfg.microsoft || !cfg.microsoft.clientId) {
    throw new Error('Missing Microsoft configuration in oauth.config.json');
  }

  const tenant = cfg.microsoft.tenant || 'common';
  const params = new URLSearchParams();
  params.append('client_id', cfg.microsoft.clientId);
  params.append('scope', cfg.microsoft.scopes || 'offline_access Mail.Read');

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
  if (!cfg || !cfg.microsoft || !cfg.microsoft.clientId) {
    throw new Error('Missing Microsoft configuration in oauth.config.json');
  }

  const params = new URLSearchParams();
  params.append('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');
  params.append('client_id', cfg.microsoft.clientId);
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
  // Marquer comme provider Microsoft
  responseData.provider = 'microsoft';
  tokenStore = responseData;
  saveTokens(responseData);
  return { ok: true, data: responseData };
});

ipcMain.handle('auth:refresh-token', async (event, refreshToken) => {
  const cfg = loadOAuthConfig();
  if (!cfg || !cfg.microsoft || !cfg.microsoft.clientId) {
    throw new Error('Missing Microsoft configuration in oauth.config.json');
  }
  
  const params = new URLSearchParams();
  params.append('client_id', cfg.microsoft.clientId);
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', refreshToken);
  params.append('scope', cfg.microsoft.scopes || 'offline_access Mail.Read');
  
  const res = await fetch(`https://login.microsoftonline.com/${cfg.microsoft.tenant || 'common'}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Refresh token failed: ' + txt);
  }
  
  const data = await res.json();
  data.provider = 'microsoft';
  saveTokens(data);
  return data;
});

// Google OAuth handlers - CORRECTIONS DES CHEMINS
ipcMain.handle('auth:start-google-flow', async () => {
  const cfg = loadOAuthConfig();
  if (!cfg.google || !cfg.google.clientId) {
    throw new Error('Missing Google configuration in oauth.config.json');
  }

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${cfg.google.clientId}&` +
    `redirect_uri=${encodeURIComponent(cfg.google.redirectUri)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent(cfg.google.scopes)}&` +
    `access_type=offline&` +
    `prompt=consent`;

  shell.openExternal(authUrl);
  return { authUrl };
});

ipcMain.handle('auth:exchange-google-code', async (event, code) => {
  const cfg = loadOAuthConfig();
  if (!cfg.google || !cfg.google.clientId) {
    throw new Error('Missing Google configuration in oauth.config.json');
  }
  
  const params = new URLSearchParams();
  params.append('client_id', cfg.google.clientId);
  params.append('client_secret', cfg.google.clientSecret);
  params.append('code', code);
  params.append('grant_type', 'authorization_code');
  params.append('redirect_uri', cfg.google.redirectUri);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Google token exchange failed: ' + txt);
  }

  const data = await res.json();
  data.provider = 'google';
  tokenStore = data;
  saveTokens(data);
  return data;
});

ipcMain.handle('auth:refresh-google-token', async (event, refreshToken) => {
  const cfg = loadOAuthConfig();
  if (!cfg.google || !cfg.google.clientId) {
    throw new Error('Missing Google configuration in oauth.config.json');
  }
  
  const params = new URLSearchParams();
  params.append('client_id', cfg.google.clientId);
  params.append('client_secret', cfg.google.clientSecret);
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', refreshToken);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Google refresh token failed: ' + txt);
  }
  
  const data = await res.json();
  data.provider = 'google';
  saveTokens(data);
  return data;
});

// Messages handlers
ipcMain.handle('outlook:get-messages', async (event, { accessToken, top = 50, filter = null }) => {
  const token = accessToken || (tokenStore && tokenStore.access_token);
  if (!token) throw new Error('No access token available');

  // CORRECTION: Filtrer pour ne récupérer que les messages reçus (Inbox)
  let url = `https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages?$top=${top}`;
  if (filter) {
    url += `&$filter=${encodeURIComponent(filter)}`;
  }
  // Ajouter l'orderby pour avoir les emails les plus récents en premier
  url += '&$orderby=receivedDateTime desc';

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Graph request failed: ' + txt);
  }
  const data = await res.json();
  
  // Clean the messages before returning them
  if (data.value) {
    data.value = cleanMessages(data.value);
  }
  
  return data;
});

// Dans le handler 'outlook:get-messages-paginated'
ipcMain.handle('outlook:get-messages-paginated', async (event, { accessToken, top = 25, skip = 0, nextUrl = null, filter = null }) => {
  const token = accessToken || (tokenStore && tokenStore.access_token);
  if (!token) throw new Error('No access token available');

  try {
    let url;
    
    // Si on a une URL de page suivante, l'utiliser directement
    if (nextUrl) {
      url = nextUrl;
    } else {
      // CORRECTION: Utiliser Inbox au lieu de me/messages
      url = `https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages?$top=${top}&$skip=${skip}`;
      if (filter) {
        url += `&$filter=${encodeURIComponent(filter)}`;
      }
      // Ajouter l'orderby pour avoir les emails les plus récents en premier
      url += '&$orderby=receivedDateTime desc';
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (!res.ok) {
      const txt = await res.text();
      throw new Error('Graph request failed: ' + txt);
    }
    
    const data = await res.json();
    
    // Clean the messages before processing them
    if (data.value) {
      data.value = cleanMessages(data.value);
    }
    
    // Sauvegarder en cache seulement si c'est la première page
    if (skip === 0 && !nextUrl && data.value && data.value.length > 0) {
      saveCachedMessages(data.value);
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching paginated messages:', error);
    throw error;
  }
});

// Enhanced messages handler with caching and content cleaning
ipcMain.handle('outlook:get-messages-cached', async (event, { accessToken, top = 25, filter = null, useCache = true }) => {
  const token = accessToken || (tokenStore && tokenStore.access_token);
  if (!token) throw new Error('No access token available');

  try {
    // CORRECTION: Utiliser Inbox au lieu de me/messages
    let url = `https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages?$top=${top}`;
    if (filter) {
      url += `&$filter=${encodeURIComponent(filter)}`;
    }
    // Ajouter l'orderby pour avoir les emails les plus récents en premier
    url += '&$orderby=receivedDateTime desc';

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (!res.ok) {
      const txt = await res.text();
      throw new Error('Graph request failed: ' + txt);
    }
    
    const data = await res.json();
    
    // Clean the messages before processing them
    if (data.value) {
      data.value = cleanMessages(data.value);
    }
    
    // Sauvegarder en cache les nouveaux messages
    if (data.value && data.value.length > 0) {
      saveCachedMessages(data.value);
    }
    
    return {
      ...data,
      fromCache: false
    };
  } catch (error) {
    // En cas d'erreur, essayer de retourner les données mises en cache
    if (useCache) {
      try {
        const cachedMessages = loadCachedMessages();
        if (cachedMessages && cachedMessages.length > 0) {
          return {
            value: cachedMessages.slice(0, top),
            fromCache: true
          };
        }
      } catch (cacheError) {
        console.error('Error loading cached messages:', cacheError);
      }
    }
    throw error;
  }
});

// Path for app state storage
const APP_STATE_FILE = path.join(app.getPath('userData'), 'app_state.json');
const CACHED_MESSAGES_FILE = path.join(app.getPath('userData'), 'cached_messages.json');

function loadSavedEmailsIndex() {
  try {
    if (fs.existsSync(SAVED_EMAILS_INDEX_FILE)) {
      const data = fs.readFileSync(SAVED_EMAILS_INDEX_FILE, 'utf8');
      const index = JSON.parse(data);
      console.log('📇 Index chargé:', index.length, 'emails');
      return index;
    }
    console.log('📇 Aucun index trouvé, création d\'un nouveau');
  } catch (error) {
    console.error('❌ Erreur lors du chargement de l\'index des emails:', error);
  }
  return [];
}

function saveSavedEmailsIndex(index) {
  try {
    fs.writeFileSync(SAVED_EMAILS_INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
    console.log('💾 Index sauvegardé:', index.length, 'emails');
  } catch (error) {
    console.error('❌ Erreur lors de la sauvegarde de l\'index:', error);
  }
}

function addEmailToIndex(emailData) {
  console.log('📝 Ajout d\'un email à l\'index:', {
    messageId: emailData.messageId,
    subject: emailData.subject,
    type: emailData.messageType
  });
  
  const index = loadSavedEmailsIndex();
  
  // Vérifier si l'email existe déjà
  const existingIndex = index.findIndex(e => e.messageId === emailData.messageId);
  
  if (existingIndex >= 0) {
    console.log('✏️ Mise à jour de l\'email existant dans l\'index');
    index[existingIndex] = {
      ...index[existingIndex],
      ...emailData,
      updatedAt: new Date().toISOString()
    };
  } else {
    console.log('✨ Nouvel email ajouté à l\'index');
    index.push({
      ...emailData,
      savedAt: new Date().toISOString()
    });
  }
  
  saveSavedEmailsIndex(index);
  return index;
}

// Function to clean email content and remove problematic CID images
function cleanEmailContent(message) {
  if (!message) return message;
  
  // Clone the message to avoid modifying the original
  const cleanedMessage = { ...message };
  
  // Clean the body content if it exists
  if (cleanedMessage.body && cleanedMessage.body.content) {
    let content = cleanedMessage.body.content;
    
    // Remove all CID images that cause console spam
    content = content.replace(/src\s*=\s*["']cid:[^"']*["']/gi, 'src=""');
    content = content.replace(/<img[^>]*src\s*=\s*["']cid:[^"']*["'][^>]*>/gi, '');
    
    // Remove other problematic image sources
    content = content.replace(/src\s*=\s*["']data:image\/[^"']*["']/gi, 'src=""');
    
    // Remove inline styles that might reference CID images
    content = content.replace(/background-image\s*:\s*url\(cid:[^)]*\)/gi, '');
    
    // Clean up empty img tags
    content = content.replace(/<img[^>]*src\s*=\s*["']["'][^>]*>/gi, '');
    
    cleanedMessage.body.content = content;
  }
  
  return cleanedMessage;
}

// Function to clean an array of messages
function cleanMessages(messages) {
  if (!Array.isArray(messages)) return messages;
  return messages.map(cleanEmailContent);
}

// Cache functions
function loadCachedMessages() {
  try {
    if (fs.existsSync(CACHED_MESSAGES_FILE)) {
      const data = fs.readFileSync(CACHED_MESSAGES_FILE, 'utf8');
      const messages = JSON.parse(data);
      return cleanMessages(messages); // Clean cached messages when loading
    }
    return [];
  } catch (error) {
    console.error('Error loading cached messages:', error);
    return [];
  }
}

function saveCachedMessages(messages) {
  try {
    // Clean messages before caching them
    const cleanedMessages = cleanMessages(messages);
    // Limit to 100 most recent messages
    const limitedMessages = cleanedMessages.slice(0, 100);
    fs.writeFileSync(CACHED_MESSAGES_FILE, JSON.stringify(limitedMessages, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving cached messages:', error);
    throw error;
  }
}

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
    
    // Get general settings to check for email deposit folder
    const settings = loadGeneralSettings();
    let finalPath = folderPath;
    
    // If emailDepositFolder is configured, use it as a subfolder
    if (settings.emailDepositFolder && settings.emailDepositFolder.trim() !== '') {
      finalPath = path.join(folderPath, settings.emailDepositFolder);
    }
    
    // Create filename
    const date = new Date(message.receivedDateTime);
    const dateStr = date.toISOString().split('T')[0];
    const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-');
    const subject = (message.subject || 'Sans_sujet').replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
    const fileName = `${dateStr}_${timeStr}_${subject}.json`;
    
    const filePath = path.join(finalPath, fileName);
    
    // Ensure directory exists
    if (!fs.existsSync(finalPath)) {
      fs.mkdirSync(finalPath, { recursive: true });
    }
    
    // Save file
    fs.writeFileSync(filePath, JSON.stringify(message, null, 2));
    
    return { 
      success: true, 
      filePath,
      fileName,
      senderEmail,
      senderName,
      autoCreated: customPath === null && !loadSenderPaths()[senderEmail],
      depositFolder: settings.emailDepositFolder || null
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


function suggestClientForSentEmail(recipientEmail, recipientName) {
  try {
    const paths = loadSenderPaths();
    const settings = loadGeneralSettings();
    
    // Chercher si ce destinataire existe déjà comme expéditeur dans nos enregistrements
    const existingCorrespondent = findExistingCorrespondent(recipientEmail);
    
    if (existingCorrespondent) {
      return {
        type: 'existing_correspondent',
        clientName: path.basename(existingCorrespondent.folder_path),
        folderPath: existingCorrespondent.folder_path,
        confidence: 'high',
        reason: `Correspondant existant : ${existingCorrespondent.sender_name}`
      };
    }
    
    // Si pas trouvé, appliquer la même logique que pour les emails reçus
    return suggestClientForEmail(recipientEmail, recipientName);
    
  } catch (error) {
    console.error('Error suggesting client for sent email:', error);
    return {
      type: 'error',
      clientName: null,
      folderPath: null,
      confidence: 'none',
      reason: 'Erreur lors de la suggestion'
    };
  }
}

// Function to suggest client based on sender email and name
function suggestClientForEmail(senderEmail, senderName) {
  try {
    const paths = loadSenderPaths();
    const settings = loadGeneralSettings();
    
    // Check if sender already has a configured path
    if (paths[senderEmail]) {
      return {
        type: 'existing',
        clientName: path.basename(paths[senderEmail].folder_path),
        folderPath: paths[senderEmail].folder_path,
        confidence: 'high',
        reason: 'Expéditeur déjà configuré'
      };
    }
    
    // Try to match by domain
    const domain = senderEmail.split('@')[1];
    const domainSuggestions = Object.values(paths).filter(p => 
      p.sender_email.split('@')[1] === domain
    );
    
    if (domainSuggestions.length > 0) {
      const suggestion = domainSuggestions[0];
      return {
        type: 'domain_match',
        clientName: path.basename(suggestion.folder_path),
        folderPath: suggestion.folder_path,
        confidence: 'medium',
        reason: `Même domaine que ${suggestion.sender_name}`
      };
    }
    
    // Try to match by company name in sender name
    const senderWords = senderName.toLowerCase().split(/\s+/);
    const companyKeywords = senderWords.filter(word => 
      word.length > 3 && !['from', 'email', 'mail', 'contact', 'info', 'support'].includes(word)
    );
    
    for (const keyword of companyKeywords) {
      const nameMatch = Object.values(paths).find(p => 
        path.basename(p.folder_path).toLowerCase().includes(keyword) ||
        p.sender_name.toLowerCase().includes(keyword)
      );
      
      if (nameMatch) {
        return {
          type: 'name_match',
          clientName: path.basename(nameMatch.folder_path),
          folderPath: nameMatch.folder_path,
          confidence: 'medium',
          reason: `Correspondance avec "${keyword}"`
        };
      }
    }
    
    // Suggest creating new client based on sender name
    if (settings.rootFolder && senderName) {
      const cleanName = senderName.replace(/[<>:"/\\|?*]/g, '_');
      const suggestedPath = path.join(settings.rootFolder, cleanName);
      
      return {
        type: 'new_client',
        clientName: cleanName,
        folderPath: suggestedPath,
        confidence: 'low',
        reason: 'Nouveau client suggéré basé sur le nom de l\'expéditeur'
      };
    }
    
    return {
      type: 'no_suggestion',
      clientName: null,
      folderPath: null,
      confidence: 'none',
      reason: 'Aucune suggestion disponible'
    };
    
  } catch (error) {
    console.error('Error suggesting client:', error);
    return {
      type: 'error',
      clientName: null,
      folderPath: null,
      confidence: 'none',
      reason: 'Erreur lors de la suggestion'
    };
  }
}

// Enhanced save message handler with suggestions
ipcMain.handle('save-message-with-suggestion', async (event, { message }) => {
  try {
    const senderEmail = message.from?.emailAddress?.address;
    const senderName = message.from?.emailAddress?.name;
    
    if (!senderEmail || !senderName) {
      return { 
        success: false, 
        error: 'Informations expéditeur manquantes' 
      };
    }
    
    // Get suggestion for this email
    const suggestion = suggestClientForEmail(senderEmail, senderName);
    
    // Get all existing clients for alternative options - MODIFIÉ POUR AFFICHER PAR EMAIL
    const allPaths = loadSenderPaths();
    const existingClients = Object.values(allPaths).map(p => ({
      clientName: path.basename(p.folder_path),
      folderPath: p.folder_path,
      senderName: p.sender_name,
      senderEmail: p.sender_email
    }));
    
    // Trier par nom d'expéditeur au lieu de supprimer les doublons par folderPath
    const sortedClients = existingClients.sort((a, b) => {
      // Trier d'abord par nom d'expéditeur, puis par email
      const nameComparison = a.senderName.localeCompare(b.senderName);
      if (nameComparison !== 0) return nameComparison;
      return a.senderEmail.localeCompare(b.senderEmail);
    });
    
    return {
      success: true,
      suggestion,
      existingClients: sortedClients, // Garder tous les clients, même avec le même chemin
      senderEmail,
      senderName
    };
    
  } catch (error) {
    console.error('Error getting save suggestion:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
});

// CORRECTION: Handler save-message-to-path avec logs détaillés et gestion d'erreurs
ipcMain.handle('save-message-to-path', async (event, { message, chosenPath, savePathForFuture = false, isClientSelection = false, clientInfo = null, outlookActions = {} }) => {
  try {
    const senderEmail = message.from?.emailAddress?.address;
    const senderName = message.from?.emailAddress?.name;
    
    console.log('📧 Début de sauvegarde avec actions Outlook:', {
      senderEmail,
      senderName,
      outlookActions,
      messageId: message.id,
      hasToken: !!tokenStore?.access_token
    });
    
    if (!chosenPath) {
      return { success: false, error: 'Aucun chemin spécifié' };
    }

    if (!message) {
      return { success: false, error: 'Message manquant' };
    }
    
    // === PARTIE SAUVEGARDE LOCALE (identique) ===
    const settings = loadGeneralSettings();
    let finalPath = chosenPath;
    let depositFolderUsed = false;
    let depositFolderName = '';
    
    const depositFolder = settings.receivedEmailDepositFolder || settings.emailDepositFolder;
    if (depositFolder && depositFolder.trim() !== '') {
      const depositPath = path.join(chosenPath, depositFolder.trim());
      console.log('📁 Tentative création dossier de dépôt:', depositPath);
      
      try {
        if (!fs.existsSync(depositPath)) {
          fs.mkdirSync(depositPath, { recursive: true });
          console.log('✅ Dossier de dépôt créé:', depositPath);
        }
        
        finalPath = depositPath;
        depositFolderUsed = true;
        depositFolderName = depositFolder.trim();
        console.log('✅ Utilisation du dossier de dépôt:', finalPath);
        
      } catch (depositError) {
        console.error('❌ Erreur création dossier de dépôt:', depositError);
        finalPath = chosenPath;
        depositFolderUsed = false;
      }
    }
    
    const pattern = settings.filenamePattern || '{date}_{time}_{subject}';
    const fileFormat = settings.fileFormat || 'json';
    
    const baseFilename = generateFilename(message, pattern, 'received');
    const fileName = `${baseFilename}.${fileFormat}`;
    
    const filePath = path.join(finalPath, fileName);
    console.log('💾 Chemin final de sauvegarde:', filePath);
    
    if (!fs.existsSync(finalPath)) {
      console.log('📁 Création du dossier final:', finalPath);
      fs.mkdirSync(finalPath, { recursive: true });
    }
    
    // Sauvegarder le fichier
    let messageContent;
    switch (fileFormat) {
      case 'json':
        messageContent = JSON.stringify(message, null, 2);
        break;
      case 'txt':
        messageContent = `Sujet: ${message.subject || 'Sans sujet'}\n` +
                        `De: ${message.from?.emailAddress?.name || 'Inconnu'} <${message.from?.emailAddress?.address || 'inconnu'}>\n` +
                        `Date: ${new Date(message.receivedDateTime).toLocaleString('fr-FR')}\n\n` +
                        `${message.bodyPreview || message.body?.content || 'Pas de contenu'}`;
        break;
      case 'eml':
        messageContent = `From: ${message.from?.emailAddress?.address || 'unknown'}\n` +
                        `To: ${message.toRecipients?.map(r => r.emailAddress.address).join(', ') || 'unknown'}\n` +
                        `Subject: ${message.subject || 'No subject'}\n` +
                        `Date: ${message.receivedDateTime}\n\n` +
                        `${message.body?.content || message.bodyPreview || 'No content'}`;
        break;
      default:
        messageContent = JSON.stringify(message, null, 2);
    }
    
    fs.writeFileSync(filePath, messageContent, 'utf8');
    console.log('✅ Fichier sauvegardé localement à:', filePath);
    
    // === ACTIONS OUTLOOK AVEC LOGS DÉTAILLÉS ===
    let outlookActionsResult = {
      movePerformed: false,
      markAsReadPerformed: false,
      folderCreated: false,
      targetFolder: null,
      errors: []
    };

    console.log('🔍 Vérification des conditions Outlook:', {
      hasToken: !!tokenStore?.access_token,
      moveToFiledRequested: outlookActions.moveToFiled,
      markAsReadRequested: outlookActions.markAsRead
    });

    if (tokenStore?.access_token && (outlookActions.moveToFiled || outlookActions.markAsRead)) {
      console.log('🔄 Début des actions Outlook avec OutlookHandler...');
      
      try {
        const OutlookHandler = require('../outlook-handler');
        const outlookHandler = new OutlookHandler(tokenStore.access_token);
        
        // Action 1: Déplacer vers un sous-dossier de INBOX
        if (outlookActions.moveToFiled) {
          try {
            console.log('📁 Création/récupération du sous-dossier INBOX...');
            const folderName = 'EmailManager Filed';
            const inboxSubfolder = await createOrGetInboxSubfolder(tokenStore.access_token, folderName);
            
            console.log('📁 Sous-dossier INBOX:', {
              id: inboxSubfolder.id,
              name: inboxSubfolder.name,
              created: inboxSubfolder.created
            });
            
            console.log('📧 Déplacement du message vers le sous-dossier...');
            await outlookHandler.moveMessage(message.id, inboxSubfolder.id);
            
            outlookActionsResult.movePerformed = true;
            outlookActionsResult.folderCreated = inboxSubfolder.created;
            outlookActionsResult.targetFolder = `INBOX/${inboxSubfolder.name}`;
            
            console.log(`✅ Message déplacé vers le sous-dossier INBOX: ${inboxSubfolder.name}`);
            
          } catch (moveError) {
            console.error('❌ Erreur lors du déplacement vers sous-dossier INBOX:', moveError);
            outlookActionsResult.errors.push(`Déplacement: ${moveError.message}`);
          }
        }
        
        // Action 2: Marquer comme lu
        if (outlookActions.markAsRead && !message.isRead) {
          try {
            console.log('👁️ Marquage du message comme lu...');
            await outlookHandler.markAsRead(message.id);
            
            outlookActionsResult.markAsReadPerformed = true;
            console.log('✅ Message marqué comme lu');
            
          } catch (markError) {
            console.error('❌ Erreur lors du marquage comme lu:', markError);
            outlookActionsResult.errors.push(`Marquage lu: ${markError.message}`);
          }
        } else if (outlookActions.markAsRead && message.isRead) {
          console.log('ℹ️ Message déjà marqué comme lu, action ignorée');
        }
        
        console.log('🎉 Actions Outlook terminées:', outlookActionsResult);
        
      } catch (outlookError) {
        console.error('❌ Erreur générale lors des actions Outlook:', outlookError);
        outlookActionsResult.errors.push(`Outlook général: ${outlookError.message}`);
      }
    } else {
      console.log('ℹ️ Pas d\'actions Outlook demandées ou token manquant');
    }
    
    // Sauvegarder le chemin pour le futur si demandé
    if (savePathForFuture && senderEmail && senderName) {
      try {
        const paths = loadSenderPaths();
        const now = new Date().toISOString();
        
        paths[senderEmail] = {
          sender_email: senderEmail,
          sender_name: senderName,
          folder_path: chosenPath,
          created_at: paths[senderEmail]?.created_at || now,
          updated_at: now
        };
        
        saveSenderPaths(paths);
        console.log('✅ Chemin sauvegardé pour l\'expéditeur');
        
      } catch (pathError) {
        console.error('❌ Erreur lors de la sauvegarde du chemin:', pathError);
      }
    }
    
    const result = { 
      success: true, 
      filePath: filePath,
      fileName: fileName,
      senderEmail: senderEmail,
      senderName: senderName,
      depositFolder: depositFolderName || null,
      depositFolderUsed: depositFolderUsed,
      pathSaved: savePathForFuture,
      isClientSelection: isClientSelection,
      clientName: clientInfo?.clientName || null,
      actualSavePath: finalPath,
      basePath: chosenPath,
      messageType: 'received',
      fileFormat: fileFormat,
      filenamePattern: pattern,
      outlookActions: outlookActionsResult
    };
    
    console.log('✅ Sauvegarde complète - Résultat final:', result);

    const emailIndexData = {
      messageId: message.id,
      messageType: 'received',
      subject: message.subject || 'Sans sujet',
      bodyPreview: message.bodyPreview || '',
      senderEmail: senderEmail,
      senderName: senderName,
      recipientEmail: message.from?.emailAddress?.address,
      recipientName: message.from?.emailAddress?.address,
      receivedDateTime: message.receivedDateTime,
      hasAttachments: message.hasAttachments || false,
      savedPath: filePath,
      folderPath: depositFolderName || null,
      clientName: clientInfo?.name || null
    };
    
    addEmailToIndex(emailIndexData);

    return result;
    
  } catch (error) {
    console.error('❌ Erreur fatale lors de la sauvegarde:', error);
    console.error('Stack trace:', error.stack);
    return { success: false, error: error.message };
  }
});

// Messages handlers - AJOUTER SUPPORT POUR LES EMAILS ENVOYÉS
ipcMain.handle('outlook:get-sent-messages', async (event, { accessToken, top = 50, filter = null }) => {
  const token = accessToken || (tokenStore && tokenStore.access_token);
  if (!token) throw new Error('No access token available');

  let url = `https://graph.microsoft.com/v1.0/me/mailFolders/SentItems/messages?$top=${top}`;
  if (filter) {
    url += `&$filter=${encodeURIComponent(filter)}`;
  }
  // Ajouter l'orderby pour avoir les emails les plus récents en premier
  url += '&$orderby=sentDateTime desc';

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Graph request failed: ' + txt);
  }
  const data = await res.json();
  
  // Clean the messages before returning them
  if (data.value) {
    data.value = cleanMessages(data.value);
  }
  
  return data;
});

// Enhanced sent messages handler with pagination
ipcMain.handle('outlook:get-sent-messages-paginated', async (event, { accessToken, top = 50, skip = 0, nextUrl = null, filter = null }) => {

  const token = accessToken || (tokenStore && tokenStore.access_token);
  if (!token) throw new Error('No access token available');

  try {
    let url;
    
    if (nextUrl) {
      url = nextUrl;
    } else {
      url = `https://graph.microsoft.com/v1.0/me/mailFolders/SentItems/messages?$top=${top}&$skip=${skip}`;
      if (filter) {
        url += `&$filter=${encodeURIComponent(filter)}`;
      }
      url += '&$orderby=sentDateTime desc';
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (!res.ok) {
      const txt = await res.text();
      throw new Error('Graph request failed: ' + txt);
    }
    
    const data = await res.json();
    
    if (data.value) {
      data.value = cleanMessages(data.value);
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching paginated sent messages:', error);
    throw error;
  }
});

// Enhanced save sent message handler - BASÉ SUR LE DESTINATAIRE
ipcMain.handle('save-sent-message', async (event, { message, senderPath, recipientEmail, recipientName, outlookActions = {} }) => {
  try {
    console.log('📧 Sauvegarde du message envoyé:', {
      messageId: message.id,
      subject: message.subject,
      senderPath,
      recipientEmail,
      outlookActions
    });

    // Load general settings
    const generalSettings = loadGeneralSettings();
    const fileFormatSettings = generalSettings.fileFormat || {};
    
    // Generate filename for sent message
    const pattern = fileFormatSettings.filenamePatternSent || 'SENT_{date}_{time}_{subject}';
    const userEmail = message.from?.emailAddress?.address || 'user@example.com';
    const filename = generateFilename(message, pattern, 'sent', userEmail);
    
    // Determine full save path
    let actualSavePath = senderPath;
    let depositFolderUsed = false;
    let depositFolder = null;
    
    // Check if we should use sent deposit folder
    if (generalSettings.sentEmailDepositFolder) {
      depositFolder = generalSettings.sentEmailDepositFolder;
      const depositPath = path.join(senderPath, depositFolder);
      
      if (fs.existsSync(depositPath)) {
        actualSavePath = depositPath;
        depositFolderUsed = true;
        console.log(`📁 Utilisation du dossier de dépôt pour envoyés: ${depositPath}`);
      } else {
        console.log(`⚠️ Dossier de dépôt pour envoyés non trouvé: ${depositPath}, sauvegarde directe`);
      }
    }
    
    const fullPath = path.join(actualSavePath, filename);
    
    // Save sent message content
    const messageData = {
      id: message.id,
      subject: message.subject,
      from: message.from,
      toRecipients: message.toRecipients,
      sentDateTime: message.sentDateTime,
      bodyPreview: message.bodyPreview,
      body: message.body,
      hasAttachments: message.hasAttachments,
      importance: message.importance,
      savedAt: new Date().toISOString(),
      recipientInfo: {
        email: recipientEmail,
        name: recipientName,
        folderPath: senderPath
      },
      messageType: 'sent'
    };
    
    await fs.promises.writeFile(fullPath, JSON.stringify(messageData, null, 2), 'utf8');
    console.log('✅ Message envoyé sauvegardé:', fullPath);
    
    // Les messages envoyés ne sont généralement pas déplacés car ils sont déjà dans SentItems
    // Mais on peut garder la logique pour la cohérence si nécessaire
    const outlookResults = {
      folderCreated: false,
      movePerformed: false,
      markAsReadPerformed: false,
      targetFolder: null,
      errors: []
    };
    
    return {
      success: true,
      fileName: filename,
      actualSavePath,
      depositFolder,
      depositFolderUsed,
      outlookActions: outlookResults,
      messageType: 'sent'
    };

  } catch (error) {
    console.error('Erreur lors de la sauvegarde du message envoyé:', error);
    return {
      success: false,
      error: error.message,
      messageType: 'sent'
    };
  }
});

// Mise à jour similaire pour save-sent-message-to-path
ipcMain.handle('save-sent-message-to-path', async (event, { message, chosenPath, savePathForFuture = false, isClientSelection = false, clientInfo = null }) => {
  try {
    const recipientEmail = message.toRecipients?.[0]?.emailAddress?.address;
    const recipientName = message.toRecipients?.[0]?.emailAddress?.name;
    
    if (!chosenPath) {
      return { success: false, error: 'Aucun chemin sélectionné' };
    }

    if (!message) {
      return { success: false, error: 'Aucun message à sauvegarder' };
    }
    
    const settings = loadGeneralSettings();
    console.log("settings: ", settings)
    let finalPath = chosenPath;
    let depositFolderUsed = false;
    let depositFolderName = '';
    
    // Logique du dossier de dépôt pour les emails envoyés
    if (settings.sentEmailDepositFolder && settings.sentEmailDepositFolder.trim() !== '') {
      depositFolderName = settings.sentEmailDepositFolder.trim();
      const depositFolderPath = path.join(chosenPath, depositFolderName);
      
      try {
        if (!fs.existsSync(depositFolderPath)) {
          fs.mkdirSync(depositFolderPath, { recursive: true });
        }
        finalPath = depositFolderPath;
        depositFolderUsed = true;
      } catch (depositError) {
        console.warn('Impossible de créer le dossier de dépôt:', depositError);
        finalPath = chosenPath;
        depositFolderUsed = false;
      }
    }
    
    // Générer le nom de fichier avec le pattern pour les emails envoyés
    const pattern = settings.filenamePatternSent || 'SENT_{date}_{time}_{subject}';
    const fileFormat = settings.fileFormat || 'json';
    const baseFilename = generateFilename(message, pattern, 'sent');
    const fileName = `${baseFilename}.${fileFormat}`;
    
    const filePath = path.join(finalPath, fileName);
    
    // Créer le dossier si nécessaire
    if (!fs.existsSync(finalPath)) {
      fs.mkdirSync(finalPath, { recursive: true });
    }
    
    // Sauvegarder le fichier
    let messageContent;
    switch (fileFormat) {
      case 'json':
        messageContent = JSON.stringify(message, null, 2);
        break;
      case 'txt':
        messageContent = `Subject: ${message.subject || 'Sans sujet'}\n`;
        messageContent += `From: User\n`;
        messageContent += `To: ${message.toRecipients?.map(r => `${r.emailAddress.name} <${r.emailAddress.address}>`).join(', ')}\n`;
        messageContent += `Date: ${new Date(message.sentDateTime).toLocaleString('fr-FR')}\n`;
        messageContent += `\n${message.bodyPreview || message.body?.content || 'Contenu non disponible'}`;
        break;
      case 'eml':
        messageContent = `Subject: ${message.subject || 'Sans sujet'}\r\n`;
        messageContent += `From: user@example.com\r\n`;
        messageContent += `To: ${message.toRecipients?.map(r => r.emailAddress.address).join(', ')}\r\n`;
        messageContent += `Date: ${new Date(message.sentDateTime).toUTCString()}\r\n`;
        messageContent += `Content-Type: text/html; charset=utf-8\r\n\r\n`;
        messageContent += message.body?.content || message.bodyPreview || 'Contenu non disponible';
        break;
      default:
        messageContent = JSON.stringify(message, null, 2);
    }
    
    fs.writeFileSync(filePath, messageContent, 'utf8');
    
    // Si savePathForFuture est activé, enregistrer ce destinataire comme nouveau correspondant
    if (savePathForFuture && recipientEmail && recipientName) {
      try {
        const paths = loadSenderPaths();
        const now = new Date().toISOString();
        
        // Enregistrer le destinataire comme s'il était un expéditeur
        paths[recipientEmail] = {
          sender_email: recipientEmail,
          sender_name: recipientName,
          folder_path: chosenPath,
          created_at: paths[recipientEmail]?.created_at || now,
          updated_at: now
        };
        
        saveSenderPaths(paths);
      } catch (pathError) {
        console.warn('Erreur lors de la sauvegarde du chemin:', pathError);
      }
    }
    
    const result = { 
      success: true, 
      filePath: filePath,
      fileName: fileName,
      recipientEmail: recipientEmail,
      recipientName: recipientName,
      depositFolder: depositFolderName || null,
      depositFolderUsed: depositFolderUsed,
      pathSaved: savePathForFuture,
      isClientSelection: isClientSelection,
      clientName: clientInfo?.clientName || null,
      actualSavePath: finalPath,
      basePath: chosenPath,
      messageType: 'sent',
      fileFormat: fileFormat,
      filenamePattern: pattern
    };

    const emailIndexData = {
      messageId: message.id,
      messageType: 'sent',
      subject: message.subject || 'Sans sujet',
      bodyPreview: message.bodyPreview || '',
      senderEmail: userEmail,
      senderName: 'User',
      recipientEmail: message.toRecipients?.[0]?.emailAddress?.address || 'unknown',
      recipientName: message.toRecipients?.[0]?.emailAddress?.name || message.toRecipients?.[0]?.emailAddress?.address || 'Destinataire inconnu',
      sentDateTime: message.sentDateTime,
      hasAttachments: message.hasAttachments || false,
      savedPath: fullPath, // fullPath doit être défini dans le code existant
      folderPath: chosenPath,
      clientName: clientInfo?.name || null
    };
    
    addEmailToIndex(emailIndexData);
    
    return result;
    
  } catch (error) {
    console.error('Erreur lors de la sauvegarde du message envoyé:', error);
    return { success: false, error: error.message };
  }
});

// Utility handlers
ipcMain.handle('app:open-external', async (event, url) => {
  try {
    console.log('🌐 Ouverture d\'un lien externe via IPC:', url);
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('Erreur lors de l\'ouverture du lien externe:', error);
    return { success: false, error: error.message };
  }
});

// IPC Handlers pour le daemon
ipcMain.handle('daemon:start', async () => {
  try {
    if (!emailDaemon) {
      return { success: false, error: 'Daemon non disponible' };
    }
    
    await emailDaemon.start();
    return { success: true };
  } catch (error) {
    console.error('Erreur daemon:start:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('daemon:stop', async () => {
  try {
    if (!emailDaemon) {
      return { success: false, error: 'Daemon non disponible' };
    }
    
    emailDaemon.stop();
    return { success: true };
  } catch (error) {
    console.error('Erreur daemon:stop:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('daemon:status', async () => {
  try {
    if (!emailDaemon) {
      return { success: false, error: 'Daemon non disponible' };
    }
    
    return { success: true, status: emailDaemon.getStatus() };
  } catch (error) {
    console.error('Erreur daemon:status:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('daemon:config', async (event, newConfig) => {
  try {
    if (!emailDaemon) {
      return { success: false, error: 'Daemon non disponible' };
    }
    
    if (newConfig) {
      emailDaemon.updateConfig(newConfig);
    }
    return { success: true, config: emailDaemon.getConfig() };
  } catch (error) {
    console.error('Erreur daemon:config:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('daemon:sync-now', async () => {
  try {
    if (!emailDaemon) {
      return { success: false, error: 'Daemon non disponible' };
    }
    
    if (!emailDaemon.isRunning) {
      return { success: false, error: 'Daemon non démarré' };
    }
    
    await emailDaemon.performSync();
    return { success: true };
  } catch (error) {
    console.error('Erreur daemon:sync-now:', error);
    return { success: false, error: error.message };
  }
});