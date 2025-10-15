import React, { useState, useEffect, useRef } from 'react';
import { 
  Email, 
  CloudSync,
  SyncDisabled,
  Person,
  Schedule,
  Download,
  Folder,
  Settings as SettingsIcon,
  ArrowBack,
  Attachment,
  Reply,
  ReplyAll,
  Forward,
  FolderSpecial,
  Refresh,
  Send,
  Inbox,
  Search // AJOUT MANQUANT
} from '@mui/icons-material';
import Navigation from './Navigation';
import SenderPathModal from './SenderPathModal';
import SenderPathsManager from './SenderPathsManager';
import GeneralSettings from './GeneralSettings';
import useNotifications from './useNotifications';
import ToastContainer from './ToastContainer';
import SaveEmailModal from './components/SaveEmailModal';
import ExternalLink from './components/ExternalLink';
import DaemonSettings from './components/DaemonSettings';
import EmailSearch from './components/EmailSearch'; // AJOUT


const MainPage = ({ user, onLogout, onShowPricing }) => {
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [tokens, setTokens] = useState(null);
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [backgroundSync, setBackgroundSync] = useState(false);
  const [showSenderModal, setShowSenderModal] = useState(false);
  const [currentSender, setCurrentSender] = useState(null);
  const [showPathsManager, setShowPathsManager] = useState(false);
  const [showGeneralSettings, setShowGeneralSettings] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [selectedMessageToSave, setSelectedMessageToSave] = useState(null);
  const [showDaemonSettings, setShowDaemonSettings] = useState(false);
  const [currentTab, setCurrentTab] = useState('received'); // 'received' ou 'sent'
  const [sentMessages, setSentMessages] = useState([]);
  const [loadingSent, setLoadingSent] = useState(false);
  const [showEmailSearch, setShowEmailSearch] = useState(false); // NOUVEAU
  
  // Ajouter les états manquants
  const [senderPaths, setSenderPaths] = useState({});
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle', 'syncing', 'success', 'error'
  const [lastSyncTime, setLastSyncTime] = useState(null);

  const { notifications, removeNotification, success, error, warning, info } = useNotifications();
  const intervalRef = useRef(null);
  const isFirstLoad = useRef(true);

  // Initial load with notifications
  useEffect(() => {
    if (isFirstLoad.current) {
      loadInitialData();
      isFirstLoad.current = false;
    }
  }, []);

  // Background sync setup
  useEffect(() => {
    // Start background sync after initial load
    if (!initialLoading && tokens) {
      startBackgroundSync();
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [initialLoading, tokens]);

  const loadMessages = async (silent = false, providedTokens = null) => {
    if (!silent) {
      setLoading(true);
      info('Récupération des messages en cours...', {
        title: 'Synchronisation'
      });
    }

    try {
      const currentTokens = providedTokens || tokens;
      let token = currentTokens?.access_token;
      
      if (!token && currentTokens?.refresh_token) {
        const newTokens = await window.electronAPI.refreshToken(currentTokens.refresh_token);
        setTokens(newTokens);
        token = newTokens.access_token;
      }
      
      if (!token) {
        throw new Error('Token d\'accès non disponible');
      }
      
      // Charger les messages reçus ET envoyés
      const [receivedData, sentData] = await Promise.all([
        window.electronAPI.getMessages({ 
          accessToken: token, 
          top: 50,
        }),
        window.electronAPI.getSentMessages({ 
          accessToken: token, 
          top: 50
        })
      ]);
      
      setMessages(receivedData.value || []);
      setSentMessages(sentData.value || []);
      
      const totalCount = (receivedData.value?.length || 0) + (sentData.value?.length || 0);
      
      return {
        success: true,
        count: totalCount,
        receivedCount: receivedData.value?.length || 0,
        sentCount: sentData.value?.length || 0
      };
    } catch (loadError) {
      console.error('Error loading messages:', loadError);
      if (!silent) {
        error('Erreur lors du chargement des messages', {
          title: 'Erreur'
        });
      }
      return {
        success: false,
        error: loadError.message
      };
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const loadInitialData = async () => {
    setInitialLoading(true);
    
    try {
      // Load sender paths first
      await loadSenderPaths();
      
      // Try to load tokens and authenticate
      const stored = await window.electronAPI.loadTokens();
      if (stored?.refresh_token) {
        info('Connexion automatique réussie', {
          title: 'Authentification',
          details: 'Connecté automatiquement à Outlook'
        });
        
        try {
          const newTokens = await window.electronAPI.refreshToken(stored.refresh_token);
          setTokens(newTokens);
          
          // Load messages with notifications for initial load
          const result = await loadMessages(false, newTokens); // Pass tokens directly
          
          if (result.success) {
            success('Synchronisation terminée', {
              title: 'Synchronisation',
              details: `${result.count} messages récupérés`
            });
          }
        } catch (refreshError) {
          console.error('Error refreshing token:', refreshError);
          error('Erreur lors de l\'actualisation du token', {
            title: 'Erreur d\'authentification'
          });
        }
      } else if (stored?.access_token) {
        setTokens(stored);
        info('Session restaurée', {
          title: 'Authentification'
        });
        
        const result = await loadMessages(false, stored); // Pass tokens directly
        if (result.success) {
          success('Messages chargés', {
            title: 'Synchronisation',
            details: `${result.count} messages récupérés`
          });
        }
      } else {
        // NE PAS afficher de notification ici car c'est normal de ne pas avoir de tokens
        console.log('Aucun token stocké - authentification requise');
      }
    } catch (err) {
      console.error('Error during initial load:', err);
      error('Erreur lors de la synchronisation initiale', {
        title: 'Erreur de synchronisation'
      });
    } finally {
      setInitialLoading(false);
    }
  };

  const startBackgroundSync = () => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Set up background sync every 5 seconds
    intervalRef.current = setInterval(() => {
      performBackgroundSync();
    }, 5000);

    console.log('🔄 Background sync started (every 5 seconds)');
  };

  const performBackgroundSync = async () => {
    if (backgroundSync || !tokens) return; // Prevent overlapping syncs
    
    setBackgroundSync(true);
    setSyncStatus('syncing');
    
    try {
      const result = await loadMessages(true, tokens); // true = silent mode, pass current tokens
      if (result.success) {
        setSyncStatus('success');
        setLastSyncTime(new Date());
        // NE PAS afficher de notification pour la sync en arrière-plan
        console.log(`🔄 Background sync réussi: ${result.count} messages`);
      } else {
        setSyncStatus('error');
        console.warn('⚠️ Background sync échoué:', result.error);
      }
    } catch (syncError) {
      console.error('Background sync error:', syncError);
      setSyncStatus('error');
    } finally {
      setBackgroundSync(false);
      
      // Reset status after a short delay
      setTimeout(() => {
        setSyncStatus('idle');
      }, 2000);
    }
  };

  const loadSenderPaths = async () => {
    try {
      const paths = await window.electronAPI.getAllSenderPaths();
      const pathsMap = {};
      paths.forEach(path => {
        pathsMap[path.sender_email] = path;
      });
      setSenderPaths(pathsMap);
    } catch (pathError) {
      console.error('Error loading sender paths:', pathError);
    }
  };

  const handlePathsUpdated = async () => {
    await loadSenderPaths();
    success('Configuration mise à jour', {
      title: 'Dossiers actualisés'
    });
  };

  const checkSenderPath = async (message) => {
  // CORRECTION : Adapter selon le type d'onglet
  let contactEmail, contactName, contactType;
  
  if (currentTab === 'sent') {
    // Pour les emails envoyés, vérifier le destinataire
    contactEmail = message.toRecipients?.[0]?.emailAddress?.address;
    contactName = message.toRecipients?.[0]?.emailAddress?.name;
    contactType = 'destinataire';
  } else {
    // Pour les emails reçus, vérifier l'expéditeur
    contactEmail = message.from?.emailAddress?.address;
    contactName = message.from?.emailAddress?.name;
    contactType = 'expéditeur';
  }
  
  if (!contactEmail) {
    console.warn('Aucun email de contact trouvé pour le message');
    return true;
  }

  try {
    const contactPath = await window.electronAPI.getSenderPath(contactEmail);
    if (!contactPath) {
      console.log(`🆕 Nouveau ${contactType} détecté:`, { contactEmail, contactName });
      
      setCurrentSender({
        email: contactEmail,
        name: contactName
      });
      setShowSenderModal(true);
      
      warning('Configuration requise', {
        title: `Nouveau ${contactType}`,
        details: `Veuillez configurer un dossier pour ${contactName || contactEmail}`
      });
      return false;
    }
    
    console.log(`✅ ${contactType} déjà configuré:`, contactPath);
    return true;
  } catch (checkError) {
    console.error('Erreur lors de la vérification du chemin:', checkError);
    return false;
  }
};

  const handleMessageClick = async (message) => {
  setSelectedMessage(message);
  
  // Vérifier automatiquement si le correspondant est configuré
  await checkSenderPath(message);
};

  const handleSaveSenderPath = async (senderData) => {
  try {
    const paths = await window.electronAPI.getAllSenderPaths();
    const existingPath = paths.find(p => p.sender_email === senderData.senderEmail);
    
    if (existingPath) {
      // Contact existant, mettre à jour
      await window.electronAPI.updateSenderPath(senderData);
      
      const contactType = currentTab === 'sent' ? 'destinataire' : 'expéditeur';
      success('Chemin mis à jour', {
        title: `${contactType.charAt(0).toUpperCase() + contactType.slice(1)} configuré`
      });
    } else {
      // Nouveau contact, sauvegarder directement
      await window.electronAPI.setSenderPath(senderData);
      
      const contactType = currentTab === 'sent' ? 'destinataire' : 'expéditeur';
      success(`Nouveau ${contactType} configuré avec succès`, {
        title: `${contactType.charAt(0).toUpperCase() + contactType.slice(1)} ajouté`,
        details: `Dossier : ${senderData.folderPath}`
      });
    }
    
    setCurrentSender(null);
    setShowSenderModal(false);
    await handlePathsUpdated();
  } catch (error) {
    console.error('Erreur lors de la sauvegarde:', error);
    error('Erreur lors de la sauvegarde', {
      title: 'Erreur'
    });
  }
};

  const startAuth = async () => {
    info('Demande d\'authentification en cours...', {
      title: 'Authentification'
    });
    
    try {
      const device = await window.electronAPI.startDeviceFlow();
      setDeviceInfo(device);
      info('Veuillez vous authentifier via le lien fourni', {
        title: 'Authentification requise',
        autoDismiss: false
      });
      
      const interval = setInterval(async () => {
        try {
          const pol = await window.electronAPI.pollToken({ device_code: device.device_code });
          if (pol.ok) {
            clearInterval(interval);
            setTokens(pol.data);
            setDeviceInfo(null);
            success('Authentification réussie !', {
              title: 'Connexion établie'
            });
            
            // Load messages after authentication
            const result = await loadMessages(false, pol.data);
            if (result.success) {
              success('Messages chargés', {
                title: 'Synchronisation',
                details: `${result.count} messages récupérés`
              });
            }
          }
        } catch (pollError) {
          console.error('Polling error:', pollError);
          // NE PAS afficher de notification pour les erreurs de polling répétées
        }
      }, (device.interval || 5) * 1000);
    } catch (authError) {
      error('Erreur lors de l\'authentification', {
        title: 'Erreur de connexion',
        details: authError.message
      });
    }
  };

  const saveMessage = async (message) => {
  try {
    // CORRECTION : Adapter selon le type d'onglet
    let contactEmail, contactName, contactType;
    
    if (currentTab === 'sent') {
      // Pour les emails envoyés, utiliser le destinataire
      contactEmail = message.toRecipients?.[0]?.emailAddress?.address;
      contactName = message.toRecipients?.[0]?.emailAddress?.name;
      contactType = 'destinataire';
    } else {
      // Pour les emails reçus, utiliser l'expéditeur
      contactEmail = message.from?.emailAddress?.address;
      contactName = message.from?.emailAddress?.name;
      contactType = 'expéditeur';
    }
    
    if (!contactEmail) {
      error('Erreur lors de la sauvegarde', {
        title: 'Email invalide',
        details: 'Impossible de déterminer le contact du message'
      });
      return;
    }

    // Vérifier le chemin du contact
    const contactPath = await window.electronAPI.getSenderPath(contactEmail);
    if (!contactPath) {
      warning('Configuration requise', {
        title: 'Dossier non configuré',
        details: `Veuillez d'abord configurer un dossier pour ce ${contactType} : ${contactName || contactEmail}`
      });
      await checkSenderPath(message);
      return;
    }

    // Afficher une notification de début
    info('Sauvegarde en cours...', {
      title: 'Sauvegarde du message'
    });

    // Utiliser la fonction appropriée selon le type de message
    let result;
    if (currentTab === 'sent') {
      result = await window.electronAPI.saveSentMessage({
        message: message,
        senderPath: contactPath.folder_path,
        recipientEmail: contactEmail,
        recipientName: contactPath.sender_name || contactName
      });
    } else {
      result = await window.electronAPI.saveMessage({
        message: message,
        senderPath: contactPath.folder_path,
        senderEmail: contactEmail,
        senderName: contactPath.sender_name || contactName
      });
    }
    
    if (result.success) {
      const messageType = currentTab === 'sent' ? 'envoyé' : 'reçu';
      success(`Message ${messageType} sauvegardé avec succès`, {
        title: 'Sauvegarde terminée',
        details: result.fileName || 'Fichier sauvegardé'
      });
    } else {
      error('Erreur lors de la sauvegarde', {
        title: 'Erreur de fichier',
        details: result.error || 'Erreur inconnue lors de la sauvegarde'
      });
    }
  } catch (saveError) {
    console.error('Erreur lors de la sauvegarde:', saveError);
    
    let errorMessage = 'Erreur inconnue';
    if (saveError.message) {
      errorMessage = saveError.message;
    } else if (typeof saveError === 'string') {
      errorMessage = saveError;
    }
    
    error('Erreur lors de la sauvegarde', {
      title: 'Erreur système',
      details: errorMessage
    });
  }
};


  const getSenderPathInfo = (message, tab) => {
  if (tab === 'sent') {
    // Pour les emails envoyés, chercher le destinataire
    const recipientEmail = message.toRecipients?.[0]?.emailAddress?.address;
    return senderPaths[recipientEmail] || null;
  } else {
    // Pour les emails reçus, chercher l'expéditeur
    const senderEmail = message.from?.emailAddress?.address;
    return senderPaths[senderEmail] || null;
  }
};

  const getCorrespondentInfo = (message, tab) => {
    if (tab === 'sent') {
      // Pour les emails envoyés, on s'intéresse au destinataire
      const recipientEmail = message.toRecipients?.[0]?.emailAddress?.address;
      const recipientName = message.toRecipients?.[0]?.emailAddress?.name;
      return {
        email: recipientEmail,
        name: recipientName,
        pathInfo: getSenderPathInfo(recipientEmail)
      };
    } else {
      // Pour les emails reçus, on s'intéresse à l'expéditeur
      const senderEmail = message.from?.emailAddress?.address;
      const senderName = message.from?.emailAddress?.name;
      return {
        email: senderEmail,
        name: senderName,
        pathInfo: getSenderPathInfo(senderEmail)
      };
    }
  };

  const getBasename = (filePath) => {
    if (!filePath) return '';
    return filePath.split('/').pop() || filePath.split('\\').pop() || '';
  };

  const getSyncStatusIcon = () => {
    switch (syncStatus) {
      case 'syncing':
        return <CloudSync className="text-blue-500 animate-spin" style={{ fontSize: 16 }} />;
      case 'success':
        return <CloudSync className="text-green-500" style={{ fontSize: 16 }} />;
      case 'error':
        return <SyncDisabled className="text-red-500" style={{ fontSize: 16 }} />;
      default:
        return <CloudSync className="text-gray-400" style={{ fontSize: 16 }} />;
    }
  };

  const getSyncStatusText = () => {
    switch (syncStatus) {
      case 'syncing':
        return 'Synchronisation...';
      case 'success':
        return 'Synchronisé';
      case 'error':
        return 'Erreur de sync';
      default:
        return 'En attente';
    }
  };

  const formatLastSyncTime = () => {
    if (!lastSyncTime) return 'Jamais';
    const now = new Date();
    const diff = Math.floor((now - lastSyncTime) / 1000);
    
    if (diff < 60) return `il y a ${diff}s`;
    if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`;
    return lastSyncTime.toLocaleTimeString();
  };

  const handleManualSync = () => {
    if (!backgroundSync && tokens) {
      // Pour la sync manuelle, on affiche les notifications
      info('Synchronisation manuelle en cours...', {
        title: 'Actualisation'
      });
      
      loadMessages(false, tokens).then(result => {
        if (result.success) {
          success('Synchronisation terminée', {
            title: 'Actualisation',
            details: `${result.count} messages récupérés`
          });
        }
      });
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }
  };

  const getCurrentMessages = () => {
    return currentTab === 'sent' ? sentMessages : messages;
  };

  // Si pas de tokens, afficher l'interface d'authentification
  if (!tokens && !initialLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <Navigation user={user} onLogout={onLogout} onShowPricing={onShowPricing} />
        
        <div className="max-w-4xl mx-auto px-6 py-16">
          <div className="text-center">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Email className="text-blue-600" style={{ fontSize: 40 }} />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              Connectez-vous à Outlook
            </h1>
            <p className="text-gray-600 mb-8 text-lg">
              Authentifiez-vous pour accéder à vos emails et commencer la synchronisation automatique
            </p>
            
            {deviceInfo ? (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 max-w-md mx-auto">
                <h3 className="font-semibold text-blue-900 mb-4">Authentification requise</h3>
                <p className="text-sm text-blue-700 mb-4">
                  Visitez le lien suivant et entrez le code :
                </p>
                <div className="bg-white rounded-lg p-4 mb-4">
                  <ExternalLink 
                    href={deviceInfo.verification_uri}
                    className="font-mono text-sm text-gray-600 break-all mb-2 block"
                  >
                    {deviceInfo.verification_uri}
                  </ExternalLink>
                  <p className="font-mono text-xl font-bold text-blue-600">
                    {deviceInfo.user_code}
                  </p>
                </div>
                <p className="text-xs text-blue-600">
                  En attente de votre authentification...
                </p>
              </div>
            ) : (
              <button
                onClick={startAuth}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-xl transition-colors inline-flex items-center"
              >
                <Email className="mr-2" style={{ fontSize: 20 }} />
                Se connecter à Outlook
              </button>
            )}
          </div>
        </div>
        
        {/* Garder seulement le ToastContainer ici */}
        <ToastContainer 
          notifications={notifications} 
          onRemove={removeNotification} 
        />
      </div>
    );
  }

  if (initialLoading) {
    return (
      <>
        <Navigation user={user} onLogout={onLogout} onShowPricing={onShowPricing} />
        
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Email className="text-blue-600 animate-pulse" style={{ fontSize: 32 }} />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Chargement initial...
            </h2>
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        </div>
        
        {/* Garder seulement le ToastContainer ici aussi */}
        <ToastContainer 
          notifications={notifications} 
          onRemove={removeNotification} 
        />
      </>
    );
  }

  const handleSaveMessage = (message) => {
    setSelectedMessageToSave(message);
    setSaveModalOpen(true);
  };

  const handleSaveComplete = (result) => {
    console.log('🎉 handleSaveComplete résultat complet:', result);
    
    if (result.success) {
      let details = `Fichier: ${result.fileName || 'Nom non défini'}`;
      
      // Vérifier les actions Outlook
      if (result.outlookActions) {
        const outlookInfo = result.outlookActions;
        console.log('📁 Actions Outlook effectuées:', outlookInfo);
        
        if (outlookInfo.folderCreated) {
          details += `\n📁 Dossier "EmailManager Filed" créé dans Outlook`;
        }
        
        if (outlookInfo.movePerformed) {
          details += `\n✅ Email déplacé vers "${outlookInfo.targetFolder}"`;
        }
        
        if (outlookInfo.markAsReadPerformed) {
          details += `\n👁️ Email marqué comme lu`;
        }
        
        if (outlookInfo.errors && outlookInfo.errors.length > 0) {
          details += `\n❌ Erreurs Outlook: ${outlookInfo.errors.join(', ')}`;
        }
      }
      
      // Afficher les détails selon le type de sauvegarde
      if (result.isClientSelection && result.clientName) {
        details += `\nClient: ${result.clientName}`;
      }
      
      details += `\nEmplacement: ${result.actualSavePath || 'Chemin non défini'}`;
      
      // Informer sur l'utilisation du dossier de dépôt
      if (result.depositFolder) {
        if (result.depositFolderUsed) {
          details += `\n📁 Dossier de dépôt "${result.depositFolder}" utilisé`;
        } else {
          details += `\n📂 Dossier de dépôt "${result.depositFolder}" non trouvé, sauvegarde directe`;
        }
      }
      
      const messageTypeText = result.messageType === 'sent' ? 'envoyé' : 'reçu';
      success(`Message ${messageTypeText} sauvegardé avec succès`, {
        title: 'Sauvegarde terminée',
        details
      });
      
      // Si le chemin a été sauvegardé/mis à jour pour le futur
      if (result.pathSaved) {
        const emailAddress = result.messageType === 'sent' ? result.recipientEmail : result.senderEmail;
        const basePath = result.basePath || 'Chemin non défini';
        
        if (result.pathChanged) {
          info('Chemin mis à jour pour cette adresse', {
            title: 'Configuration modifiée',
            details: `L'adresse ${emailAddress} utilisera maintenant :\n${basePath}`
          });
        } else {
          info('Chemin mémorisé pour cette adresse', {
            title: 'Configuration mise à jour',
            details: `L'adresse ${emailAddress} est maintenant configurée :\n${basePath}`
          });
        }
      }
      
      // Recharger les chemins d'expéditeurs pour mettre à jour l'interface
      loadSenderPaths();
    } else {
      error('Erreur lors de la sauvegarde', {
        title: 'Erreur',
        details: result.error || 'Erreur inconnue'
      });
    }
    setSaveModalOpen(false);
    setSelectedMessageToSave(null);
  };
  const handleCloseSaveModal = () => {
    setSaveModalOpen(false);
    setSelectedMessageToSave(null);
  };

  // Ajouter un bouton temporaire pour supprimer les tokens et se reconnecter
  const handleForceReauth = async () => {
    try {
      await window.electronAPI.deleteTokens();
      setTokens(null);
      info('Tokens supprimés. Veuillez vous reconnecter.', {
        title: 'Reconnexion requise'
      });
    } catch (error) {
      console.error('Erreur lors de la suppression des tokens:', error);
    }
  };

  const handleSearchMessage = (message) => {
    // Gérer la sélection d'un message depuis la recherche
    setSelectedMessage(message);
    
    // Basculer vers le bon onglet selon le type de message
    if (message.messageType === 'sent') {
      setCurrentTab('sent');
    } else {
      setCurrentTab('received');
    }
    
    success('Message sélectionné depuis la recherche', {
      title: 'Navigation',
      details: `Affichage du message: ${message.subject || 'Sans sujet'}`
    });
  };

  return (
    <div className="min-h-screen bg-gray-25">
      <ToastContainer 
        notifications={notifications} 
        onRemove={removeNotification} 
      />

      {/* Navigation */}
      <Navigation 
        user={user} 
        onLogout={onLogout} 
        onShowPricing={onShowPricing}
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header avec Stats et Actions */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Gestion des emails
              </h1>
              <p className="text-gray-600">
                Organisez et sauvegardez vos communications
              </p>
            </div>
            
            {/* Actions principales */}
            <div className="flex space-x-3">
              {/* NOUVEAU: Bouton de recherche */}
              <button
                onClick={() => setShowEmailSearch(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 rounded-xl border border-gray-200 transition-colors shadow-sm"
              >
                <Search style={{ fontSize: 18 }} />
                <span className="hidden sm:inline">Rechercher</span>
              </button>

              {/* NOUVEAU: Raccourci clavier pour la recherche */}
              <div className="hidden lg:flex items-center text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                <span>Ctrl+K</span>
              </div>

              {/* Bouton de synchronisation manuelle */}
              <button
                onClick={handleManualSync}
                disabled={syncStatus === 'syncing'}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors shadow-sm"
              >
                {getSyncStatusIcon()}
                <span className="hidden sm:inline">
                  {syncStatus === 'syncing' ? 'Synchronisation...' : 'Synchroniser'}
                </span>
              </button>

              {/* Bouton Daemon Settings */}
              <button
                onClick={() => setShowDaemonSettings(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors"
              >
                <CloudSync style={{ fontSize: 18 }} />
                <span className="hidden sm:inline">Service</span>
              </button>
            </div>
          </div>

          {/* Stats - VERSION MISE À JOUR */}
          {tokens && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl p-4 border border-gray-100">
                <div className="flex items-center">
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center mr-3">
                    <Inbox className="text-blue-600" style={{ fontSize: 18 }} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-600">Messages reçus</p>
                    <p className="text-lg font-bold text-gray-900">{messages.length}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 border border-gray-100">
                <div className="flex items-center">
                  <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center mr-3">
                    <Send className="text-green-600" style={{ fontSize: 18 }} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-600">Messages envoyés</p>
                    <p className="text-lg font-bold text-gray-900">{sentMessages.length}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 border border-gray-100">
                <div className="flex items-center">
                  <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center mr-3">
                    <Schedule className="text-purple-600" style={{ fontSize: 18 }} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-600">Auto-sync</p>
                    <p className="text-sm font-bold text-gray-900">Toutes les 5s</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 border border-gray-100">
                <div className="flex items-center">
                  <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center mr-3">
                    <Folder className="text-orange-600" style={{ fontSize: 18 }} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-600">Status</p>
                    <p className="text-sm font-bold text-gray-900">{getSyncStatusText()}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Interface Email */}
          {tokens && (
            <>
              {/* Action buttons */}
              <div className="flex space-x-4 mb-6">
                <button
                  onClick={() => setShowPathsManager(true)}
                  className="bg-white hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-xl border border-gray-200 transition-colors inline-flex items-center text-sm"
                >
                  <SettingsIcon className="mr-2" style={{ fontSize: 16 }} />
                  Gérer les expéditeurs
                </button>

                <button
                  onClick={() => setShowDaemonSettings(true)}
                  className="bg-white hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-xl border border-gray-200 transition-colors inline-flex items-center text-sm"
                >
                  <CloudSync className="mr-2" style={{ fontSize: 16 }} />
                  Service d'arrière-plan
                </button>
                
                <button 
                  onClick={handleManualSync}
                  disabled={loading || backgroundSync}
                  className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium py-2 px-4 rounded-xl transition-colors inline-flex items-center disabled:opacity-50 text-sm"
                >
                  <Refresh className={`mr-2 ${loading || backgroundSync ? 'animate-spin' : ''}`} style={{ fontSize: 16 }} />
                  Actualiser manuellement
                </button>

                {/* Ajouter un bouton temporaire pour supprimer les tokens et se reconnecter */}
                <button
                  onClick={handleForceReauth}
                  className="bg-red-50 hover:bg-red-100 text-red-700 font-medium py-2 px-4 rounded-xl border border-red-200 transition-colors inline-flex items-center text-sm"
                >
                  🔄 Reconnecter avec nouvelles permissions
                </button>
              </div>

              {/* Onglets pour choisir entre reçus et envoyés */}
              <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
                <button
                  onClick={() => setCurrentTab('received')}
                  className={`py-2 px-6 rounded-md text-sm font-medium transition-colors ${
                    currentTab === 'received'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Inbox className="mr-2 inline" style={{ fontSize: 16 }} />
                  Messages reçus ({messages.length})
                </button>
                <button
                  onClick={() => setCurrentTab('sent')}
                  className={`py-2 px-6 rounded-md text-sm font-medium transition-colors ${
                    currentTab === 'sent'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Send className="mr-2 inline" style={{ fontSize: 16 }} />
                  Messages envoyés ({sentMessages.length})
                </button>
              </div>

              <div className="flex gap-6 min-h-[calc(100vh-280px)]">
                {/* Liste des emails */}
                <div className={`bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-sm transition-all duration-300 ${
                  selectedMessage ? 'w-1/3' : 'w-full'
                }`}>
                  {/* Header de la liste */}
                  <div className="p-6 border-b border-gray-100">
                    <h3 className="text-xl font-semibold text-gray-900">
                      {currentTab === 'sent' 
                        ? `Messages envoyés (${sentMessages.length})` 
                        : `Messages reçus (${messages.length})`
                    }
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {currentTab === 'sent'
                        ? 'Emails que vous avez envoyés'
                        : 'Emails reçus dans votre boîte de réception'
                      }
                    </p>
                  </div>

                  {/* Liste des messages */}
                  <div className="divide-y divide-gray-100">
                    {getCurrentMessages().length === 0 ? (
                      <div className="p-12 text-center">
                        {currentTab === 'sent' ? (
                          <Send className="text-gray-300 mx-auto mb-4" style={{ fontSize: 48 }} />
                        ) : (
                          <Email className="text-gray-300 mx-auto mb-4" style={{ fontSize: 48 }} />
                        )}
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          {currentTab === 'sent' ? 'Aucun message envoyé' : 'Aucun message reçu'}
                        </h3>
                        <p className="text-gray-600">
                          {currentTab === 'sent' 
                            ? 'Vos messages envoyés apparaîtront ici' 
                            : 'Vos messages reçus apparaîtront ici'
                          }
                        </p>
                      </div>
                    ) : (
                      <>
                        {getCurrentMessages().map((message) => {
                          const correspondentInfo = getCorrespondentInfo(message, currentTab);
                          
                          return (
                            <div 
                              key={message.id}
                              onClick={() => handleMessageClick(message)}
                              className={`p-4 hover:bg-blue-25 cursor-pointer transition-colors duration-200 ${
                                selectedMessage?.id === message.id ? 'bg-blue-50 border-r-4 border-r-blue-500' : ''
                              }`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0 pr-4">
                                  <div className="flex items-center mb-2">
                                    {/* Afficher le point bleu seulement si le message n'est pas lu */}
                                    {!message.isRead && (
                                      <div className={`w-2 h-2 rounded-full mr-3 flex-shrink-0 ${
                                        currentTab === 'sent' ? 'bg-green-500' : 'bg-blue-500'
                                      }`}></div>
                                    )}
                                    {/* Ajout d'un espace équivalent si le message est lu pour maintenir l'alignement */}
                                    {message.isRead && (
                                      <div className="w-2 h-2 mr-3 flex-shrink-0"></div>
                                    )}
                                    <p className="font-semibold text-gray-900 truncate flex-1">
                                      {currentTab === 'sent' 
                                        ? `À: ${correspondentInfo.name || correspondentInfo.email}` 
                                        : `De: ${correspondentInfo.name || correspondentInfo.email}`
                                      }
                                    </p>
                                    <div className="flex items-center ml-2 flex-shrink-0">
                                      {message.hasAttachments && (
                                        <Attachment className="text-gray-400 mr-1" style={{ fontSize: 16 }} />
                                      )}
                                      {/* CORRECTION: Utiliser getSenderPathInfo avec le type d'onglet */}
                                      {getSenderPathInfo(message, currentTab) && (
                                        <FolderSpecial 
                                          className="text-green-500" 
                                          style={{ fontSize: 16 }} 
                                          title={`Correspondant configuré : ${getBasename(getSenderPathInfo(message, currentTab).folder_path)}`} 
                                        />
                                      )}
                                    </div>
                                  </div>
                                  <h4 className="font-medium text-gray-900 mb-1 truncate">
                                    {message.subject || 'Sans sujet'}
                                  </h4>
                                  <p className="text-sm text-gray-600 line-clamp-2 break-words">
                                    {message.bodyPreview}
                                  </p>
                                </div>
                                <div className="ml-4 flex-shrink-0 text-right">
                                  <p className="text-xs text-gray-500 mb-1 whitespace-nowrap">
                                    {formatDate(currentTab === 'sent' ? message.sentDateTime : message.receivedDateTime)}
                                  </p>
                                  {message.importance === 'high' && (
                                    <div className="w-2 h-2 bg-red-500 rounded-full ml-auto"></div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                </div>

                {/* Vue détaillée du message - MISE À JOUR POUR LES ENVOYÉS */}
                {selectedMessage && (
                  <div className="w-2/3 bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-sm flex flex-col">
                    {/* Header du message - CORRECTION DU Z-INDEX ET TOP */}
                    <div className="p-6 border-b border-gray-100 flex-shrink-0 sticky top-16 z-40 bg-white/90 backdrop-blur-md rounded-t-2xl">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="flex items-center mb-2">
                            <h2 className="text-xl font-bold text-gray-900 break-words flex-1">
                              {selectedMessage.subject || 'Sans sujet'}
                            </h2>
                            {currentTab === 'sent' && (
                              <div className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-md flex-shrink-0">
                                Message envoyé
                              </div>
                            )}
                          </div>
                          <div className="space-y-2">
                            {currentTab === 'sent' ? (
                              <>
                                <div className="flex items-start">
                                  <span className="text-xsm text-gray-500 w-16 flex-shrink-0">À:</span>
                                  <div className="flex-1 min-w-0">
                                    <span className="text-sm text-gray-900 font-medium break-words">
                                      {selectedMessage.toRecipients?.map(r => r.emailAddress.name || r.emailAddress.address).join(', ')}
                                    </span>
                                    {getSenderPathInfo(selectedMessage.toRecipients?.[0]?.emailAddress?.address) && (
                                      <div className="inline-block ml-2 px-2 py-1 bg-green-50 text-green-700 text-xs rounded-md">
                                        📁 Correspondant configuré
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-start">
                                  <span className="text-sm text-gray-500 w-16 flex-shrink-0">Date:</span>
                                  <span className="text-sm text-gray-900">
                                    {new Date(selectedMessage.sentDateTime).toLocaleString('fr-FR')}
                                  </span>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="flex items-start">
                                  <span className="text-sm text-gray-500 w-16 flex-shrink-0">De:</span>
                                  <div className="flex-1 min-w-0">
                                    <span className="text-sm text-gray-900 font-medium break-words">
                                      {selectedMessage.from?.emailAddress?.name || selectedMessage.from?.emailAddress?.address}
                                    </span>
                                    {getSenderPathInfo(selectedMessage.from?.emailAddress?.address) && (
                                      <div className="inline-block ml-2 px-2 py-1 bg-green-50 text-green-700 text-xs rounded-md">
                                        📁 Correspondant configuré
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-start">
                                  <span className="text-sm text-gray-500 w-16 flex-shrink-0">À:</span>
                                  <span className="text-sm text-gray-900 break-words">
                                    {selectedMessage.toRecipients?.map(r => r.emailAddress.name || r.emailAddress.address).join(', ')}
                                  </span>
                                </div>
                                <div className="flex items-start">
                                  <span className="text-sm text-gray-500 w-16 flex-shrink-0">Date:</span>
                                  <span className="text-sm text-gray-900">
                                    {new Date(selectedMessage.receivedDateTime).toLocaleString('fr-FR')}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 ml-4 flex-shrink-0">
                          <button 
                            onClick={() => handleSaveMessage(selectedMessage)}
                            className="p-2 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                            title="Sauvegarder le message"
                          >
                            <Download style={{ fontSize: 18 }} className="text-blue-600" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Contenu du message */}
                    <div className="flex-1 p-6 overflow-y-auto">
                      <div 
                        className="prose prose-sm max-w-none text-gray-900 break-words message-content"
                        dangerouslySetInnerHTML={{ 
                          __html: selectedMessage.body?.content || selectedMessage.bodyPreview 
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modals - MISE À JOUR POUR SUPPORTER LE TYPE DE MESSAGE */}
        <SenderPathModal
          isOpen={showSenderModal}
          onClose={() => {
            setShowSenderModal(false);
            setCurrentSender(null);
          }}
          sender={currentSender}
          onSave={handleSaveSenderPath}
        />

        <SenderPathsManager
          isOpen={showPathsManager}
          onClose={() => setShowPathsManager(false)}
          onPathUpdated={handlePathsUpdated}
        />

        <GeneralSettings
          isOpen={showGeneralSettings}
          onClose={() => setShowGeneralSettings(false)}
          onSettingsUpdated={(type, message, options) => {
            if (type === 'success') {
              success(message, options);
            } else {
              error(message, options);
            }
          }}
        />

        {/* Modal de sauvegarde */}
        <SaveEmailModal
          isOpen={saveModalOpen}
          onClose={handleCloseSaveModal}
          message={selectedMessageToSave}
          messageType={currentTab} // Passer le type de message
          onSave={handleSaveComplete}
        />

        {/* Daemon Settings Modal */}
        <DaemonSettings
          isOpen={showDaemonSettings}
          onClose={() => setShowDaemonSettings(false)}
          onNotification={(type, message, options) => {
            if (type === 'success') {
              success(message, options);
            } else if (type === 'error') {
              error(message, options);
            } else if (type === 'info') {
              info(message, options);
            } else if (type === 'warning') {
              warning(message, options);
            }
          }}
        />

        {/* NOUVEAU: Modal de recherche d'emails */}
        <EmailSearch
          isOpen={showEmailSearch}
          onClose={() => setShowEmailSearch(false)}
          messages={messages}
          sentMessages={sentMessages}
          onSelectMessage={handleSearchMessage}
          onNotification={(type, message, options) => {
            switch (type) {
              case 'success':
                success(message, options);
                break;
              case 'error':
                error(message, options);
                break;
              case 'warning':
                warning(message, options);
                break;
              default:
                info(message, options);
            }
          }}
        />
      </div>
    </div>
  );

  // NOUVEAU: Ajouter le raccourci clavier Ctrl+K
  useEffect(() => {
    const handleKeyPress = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowEmailSearch(true);
      }
      
      // Fermer la recherche avec Escape
      if (e.key === 'Escape' && showEmailSearch) {
        setShowEmailSearch(false);
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [showEmailSearch]);
};

export default MainPage;