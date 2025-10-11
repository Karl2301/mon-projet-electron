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
  Send, // NOUVEAU
  Inbox // NOUVEAU
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
          filter: "isRead eq false"
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
    const senderEmail = message.from?.emailAddress?.address;
    if (!senderEmail) return true;

    try {
      const senderPath = await window.electronAPI.getSenderPath(senderEmail);
      if (!senderPath) {
        setCurrentSender({
          email: senderEmail,
          name: message.from?.emailAddress?.name
        });
        setShowSenderModal(true);
        warning('Configuration requise', {
          title: 'Nouveau expéditeur',
          details: `Veuillez configurer un dossier pour ${message.from?.emailAddress?.name || senderEmail}`
        });
        return false;
      }
      return true;
    } catch (checkError) {
      console.error('Erreur lors de la vérification du chemin:', checkError);
      return false;
    }
  };

  const handleSaveSenderPath = async (senderData) => {
    try {
      const paths = await window.electronAPI.getAllSenderPaths();
      const existingPath = paths.find(p => p.sender_email === senderData.senderEmail);
      
      if (existingPath) {
        // Expéditeur existant, mettre à jour
        await window.electronAPI.updateSenderPath(senderData);
        success('Chemin mis à jour', {
          title: 'Expéditeur configuré'
        });
      } else {
        // Nouvel expéditeur, sauvegarder directement
        await window.electronAPI.setSenderPath(senderData);
        success('Nouvel expéditeur configuré avec succès', {
          title: 'Expéditeur ajouté',
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
      // Vérifier d'abord si l'expéditeur a un chemin configuré
      const senderEmail = message.from?.emailAddress?.address;
      if (!senderEmail) {
        error('Erreur lors de la sauvegarde', {
          title: 'Email invalide',
          details: 'Impossible de déterminer l\'expéditeur du message'
        });
        return;
      }

      // Vérifier le chemin de l'expéditeur
      const senderPath = await window.electronAPI.getSenderPath(senderEmail);
      if (!senderPath) {
        warning('Configuration requise', {
          title: 'Dossier non configuré',
          details: `Veuillez d'abord configurer un dossier pour ${message.from?.emailAddress?.name || senderEmail}`
        });
        await checkSenderPath(message);
        return;
      }

      // Afficher une notification de début
      info('Sauvegarde en cours...', {
        title: 'Sauvegarde du message'
      });

      // Utiliser une fonction différente ou créer le fichier manuellement
      const result = await window.electronAPI.saveMessage({
        message: message,
        senderPath: senderPath.folder_path,
        senderEmail: senderEmail,
        senderName: senderPath.sender_name || message.from?.emailAddress?.name
      });
      
      if (result.success) {
        success('Message sauvegardé avec succès', {
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
      
      // Afficher plus de détails sur l'erreur
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

  const handleMessageClick = async (message) => {
    setSelectedMessage(message);
    await checkSenderPath(message);
  };

  const getSenderPathInfo = (senderEmail) => {
    return senderPaths[senderEmail] || null;
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
    console.log('🎉 handleSaveComplete avec vérification dossier dépôt:', result);
    
    if (result.success) {
      let details = `Fichier: ${result.fileName || 'Nom non défini'}`;
      
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-25 via-white to-blue-25">
      <Navigation user={user} onLogout={onLogout} onShowPricing={onShowPricing} />
      
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header avec status de synchronisation */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2 tracking-tight">
                {selectedMessage ? 'Lecture du message' : 'Boîte de réception'}
              </h1>
              <p className="text-gray-600 text-lg">
                {selectedMessage ? (
                  <button 
                    onClick={() => setSelectedMessage(null)}
                    className="inline-flex items-center text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    <ArrowBack className="mr-2" style={{ fontSize: 18 }} />
                    Retour à la liste
                  </button>
                ) : (
                  <>
                    {currentTab === 'sent' ? 'Vos mails envoyés' : 'Vos mails non-lus'}
                    <span className="text-blue-600 font-medium"> avec sauvegarde automatique</span>
                  </>
                )}
              </p>
            </div>
            
            {/* Sync Status */}
            {tokens && (
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2 bg-white rounded-lg px-4 py-2 border border-gray-200">
                  {getSyncStatusIcon()}
                  <div className="text-sm">
                    <div className="font-medium text-gray-900">
                      {getSyncStatusText()}
                    </div>
                    <div className="text-gray-500 text-xs">
                      Dernière sync: {formatLastSyncTime()}
                    </div>
                  </div>
                </div>
                
                <button
                  onClick={handleManualSync}
                  disabled={loading}
                  className="p-2 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed text-blue-600 rounded-lg transition-colors"
                  title="Synchroniser maintenant"
                >
                  <CloudSync className={backgroundSync ? 'animate-spin' : ''} style={{ fontSize: 20 }} />
                </button>
              </div>
            )}
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
                      : `Messages non-lus (${messages.length})`
                    }
                  </h3>
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
                        {currentTab === 'sent' ? 'Aucun message envoyé' : 'Aucun message non-lu'}
                      </h3>
                      <p className="text-gray-600">
                        {currentTab === 'sent' 
                          ? 'Vos messages envoyés apparaîtront ici' 
                          : 'Tous vos messages ont été lus'
                        }
                      </p>
                    </div>
                  ) : (
                    <>
                      {getCurrentMessages().map((message) => {
                        // Pour les messages envoyés, utiliser le destinataire au lieu de l'expéditeur
                        const contactEmail = currentTab === 'sent' 
                          ? message.toRecipients?.[0]?.emailAddress?.address
                          : message.from?.emailAddress?.address;
                        const contactName = currentTab === 'sent'
                          ? message.toRecipients?.[0]?.emailAddress?.name
                          : message.from?.emailAddress?.name;
                        const senderPathInfo = getSenderPathInfo(contactEmail);
                        
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
                                  <div className={`w-2 h-2 rounded-full mr-3 flex-shrink-0 ${
                                    currentTab === 'sent' ? 'bg-green-500' : 'bg-blue-500'
                                  }`}></div>
                                  <p className="font-semibold text-gray-900 truncate flex-1">
                                    {currentTab === 'sent' ? `À: ${contactName || contactEmail}` : contactName || contactEmail}
                                  </p>
                                  <div className="flex items-center ml-2 flex-shrink-0">
                                    {message.hasAttachments && (
                                      <Attachment className="text-gray-400 mr-1" style={{ fontSize: 16 }} />
                                    )}
                                    {senderPathInfo && (
                                      <FolderSpecial className="text-green-500" style={{ fontSize: 16 }} title="Dossier configuré" />
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
                  {/* Header du message */}
                  <div className="p-6 border-b border-gray-100 flex-shrink-0">
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
                                <span className="text-sm text-gray-500 w-16 flex-shrink-0">À:</span>
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm text-gray-900 font-medium break-words">
                                    {selectedMessage.toRecipients?.map(r => r.emailAddress.name || r.emailAddress.address).join(', ')}
                                  </span>
                                  {getSenderPathInfo(selectedMessage.toRecipients?.[0]?.emailAddress?.address) && (
                                    <div className="inline-block ml-2 px-2 py-1 bg-green-50 text-green-700 text-xs rounded-md">
                                      Dossier configuré
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
                                      Dossier configuré
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

      {/* Toast Notifications */}
      <ToastContainer 
        notifications={notifications} 
        onRemove={removeNotification} 
      />
    </div>
  );
};

export default MainPage;