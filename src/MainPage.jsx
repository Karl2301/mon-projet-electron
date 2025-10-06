import React, { useState, useEffect } from 'react';
import { 
  Button, 
  Typography, 
  Box, 
  List, 
  ListItem, 
  ListItemText, 
  Card,
  CardContent,
  Container,
  Grid,
  Alert,
  Chip,
  IconButton,
  Paper,
  Fade
} from '@mui/material';
import { 
  FolderOpen, 
  CloudDownload, 
  Email, 
  Download,
  Refresh,
  CheckCircle,
  Info,
  ArrowBack,
  Attachment,
  Star,
  StarBorder,
  MarkEmailRead,
  Reply,
  ReplyAll,
  Forward,
  Delete,
  Archive,
  Settings,
  FolderSpecial
} from '@mui/icons-material';
import Navigation from './Navigation';
import SenderPathModal from './SenderPathModal';
import SenderPathsManager from './SenderPathsManager';
import ToastNotification from './ToastNotification';
import useNotifications from './useNotifications';

const MainPage = ({ user, onLogout, onShowPricing }) => {
  const [folder, setFolder] = useState(null);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [tokens, setTokens] = useState(null);
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showSenderModal, setShowSenderModal] = useState(false);
  const [showPathsManager, setShowPathsManager] = useState(false);
  const [currentSender, setCurrentSender] = useState(null);
  const [senderPaths, setSenderPaths] = useState({});

  // Hook pour les notifications
  const { notifications, removeNotification, success, error, warning, info } = useNotifications();

  useEffect(() => {
    const tryLoadTokens = async () => {
      try {
        const stored = await window.electronAPI.loadTokens();
        if (stored?.refresh_token) {
          const newTokens = await window.electronAPI.refreshToken(stored.refresh_token);
          setTokens(newTokens);
          success('Connexion automatique réussie', {
            title: 'Authentification',
            details: 'Connecté automatiquement à Outlook'
          });
          fetchUnreadMessages(newTokens.access_token);
        } else if (stored?.access_token) {
          setTokens(stored);
          info('Session restaurée', {
            title: 'Authentification'
          });
          fetchUnreadMessages(stored.access_token);
        } else {
          info('Connexion requise', {
            title: 'Authentification'
          });
        }
      } catch (error) {
        error('Erreur lors du chargement des tokens', {
          title: 'Erreur d\'authentification'
        });
      }
    };
    
    // Load sender paths
    loadSenderPaths();
    tryLoadTokens();
  }, []);

  const loadSenderPaths = async () => {
    try {
      const paths = await window.electronAPI.getAllSenderPaths();
      const pathsMap = {};
      paths.forEach(path => {
        pathsMap[path.sender_email] = path;
      });
      setSenderPaths(pathsMap);
    } catch (error) {
      console.error('Erreur lors du chargement des chemins:', error);
    }
  };

  const handlePathsUpdated = () => {
    loadSenderPaths();
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
    } catch (error) {
      console.error('Erreur lors de la vérification du chemin:', error);
      return false;
    }
  };

  const handleSaveSenderPath = async (folderPath) => {
    if (!currentSender) return;

    try {
      await window.electronAPI.setSenderPath({
        senderEmail: currentSender.email,
        senderName: currentSender.name,
        folderPath
      });
      
      // Reload sender paths
      await loadSenderPaths();
      
      success('Dossier configuré avec succès', {
        title: 'Configuration sauvegardée',
        details: `Dossier configuré pour ${currentSender.name || currentSender.email}`
      });
      
      setShowSenderModal(false);
      setCurrentSender(null);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      error('Erreur lors de la configuration', {
        title: 'Erreur de sauvegarde'
      });
    }
  };

  const chooseFolder = async () => {
    const result = await window.electronAPI.selectFolder();
    if (result) {
      setFolder(result);
      success('Dossier sélectionné', {
        title: 'Configuration',
        details: result
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
        const pol = await window.electronAPI.pollToken({ device_code: device.device_code });
        if (pol.ok) {
          clearInterval(interval);
          setTokens(pol.data);
          setDeviceInfo(null);
          success('Authentification réussie !', {
            title: 'Connexion établie'
          });
          fetchUnreadMessages(pol.data.access_token);
        }
      }, (device.interval || 5) * 1000);
    } catch (err) {
      error('Erreur lors de l\'authentification', {
        title: 'Erreur de connexion',
        details: err.message
      });
    }
  };

  const fetchUnreadMessages = async (accessToken = null) => {
    setLoading(true);
    info('Récupération des messages en cours...', {
      title: 'Synchronisation'
    });
    
    try {
      let token = accessToken || tokens?.access_token;
      if (!token && tokens?.refresh_token) {
        const newTokens = await window.electronAPI.refreshToken(tokens.refresh_token);
        setTokens(newTokens);
        token = newTokens.access_token;
      }
      if (!token) throw new Error('Token d\'accès non disponible');
      
      const data = await window.electronAPI.getMessages({ 
        accessToken: token, 
        top: 50,
        filter: "isRead eq false"
      });
      
      setMessages(data.value || []);
      
      if (data.value && data.value.length > 0) {
        success(`${data.value.length} messages récupérés`, {
          title: 'Synchronisation terminée'
        });
      } else {
        info('Aucun nouveau message', {
          title: 'Boîte de réception à jour'
        });
      }
    } catch (err) {
      error('Erreur lors de la récupération', {
        title: 'Erreur de synchronisation',
        details: err.message
      });
    } finally {
      setLoading(false);
    }
  };

  const saveMessage = async (message) => {
    try {
      const result = await window.electronAPI.saveFileWithSender({ message });
      
      if (result.success) {
        success('Message sauvegardé avec succès', {
          title: 'Sauvegarde terminée',
          details: result.fileName
        });
      } else {
        if (result.error.includes('Aucun chemin configuré')) {
          await checkSenderPath(message);
        } else {
          error('Erreur lors de la sauvegarde', {
            title: 'Erreur de fichier',
            details: result.error
          });
        }
      }
    } catch (error) {
      error('Erreur lors de la sauvegarde', {
        title: 'Erreur système'
      });
    }
  };

  const logoutOutlook = async () => {
    try {
      const result = await window.electronAPI.deleteTokens();
      if (result.success) {
        setTokens(null);
        setMessages([]);
        setSelectedMessage(null);
        setDeviceInfo(null);
        success('Déconnexion réussie', {
          title: 'Session fermée'
        });
      } else {
        error('Erreur lors de la déconnexion', {
          title: 'Erreur de déconnexion'
        });
      }
    } catch (error) {
      error('Erreur lors de la déconnexion', {
        title: 'Erreur système'
      });
    }
  };

  const handleMessageClick = async (message) => {
    setSelectedMessage(message);
    
    // Check if sender has configured path, show modal if not
    await checkSenderPath(message);
  };

  const getSenderPathInfo = (senderEmail) => {
    return senderPaths[senderEmail] || null;
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-25 via-white to-blue-25">
      <Navigation user={user} onLogout={onLogout} onShowPricing={onShowPricing} />
      
      {/* Notifications Toast */}
      <ToastNotification 
        notifications={notifications} 
        onRemove={removeNotification} 
      />
      
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
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
                Vos messages non-lus 
                <span className="text-blue-600 font-medium"> avec sauvegarde automatique</span>
              </>
            )}
          </p>
        </div>

        {/* Outlook Connection */}
        {!tokens && (
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100 p-8 mb-8 text-center shadow-sm">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-3xl mb-6">
              <Email className="text-blue-600" style={{ fontSize: 28 }} />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">
              Connexion Outlook requise
            </h3>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              Connectez-vous à votre compte Outlook pour accéder à vos emails
            </p>
            <button 
              onClick={startAuth} 
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium py-3 px-6 rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-lg"
            >
              Se connecter à Outlook
            </button>
            
            {deviceInfo && (
              <div className="mt-6 p-4 bg-gradient-to-r from-blue-25 to-indigo-25 border border-blue-100 rounded-xl text-left max-w-md mx-auto">
                <p className="text-sm text-gray-700 mb-2">
                  <strong>Étape 1:</strong> Visitez le lien ci-dessous
                </p>
                <a 
                  href={deviceInfo.verification_uri} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 underline hover:no-underline font-medium"
                >
                  {deviceInfo.verification_uri}
                </a>
                <p className="text-sm text-gray-700 mt-3 mb-1">
                  <strong>Étape 2:</strong> Entrez ce code:
                </p>
                <code className="bg-white px-3 py-2 rounded border text-lg font-mono text-blue-700 border-blue-200">
                  {deviceInfo.user_code}
                </code>
              </div>
            )}
          </div>
        )}

        {/* Interface Email */}
        {tokens && (
          <div className="flex gap-6 h-[calc(100vh-280px)]">
            {/* Liste des emails */}
            <div className={`bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-sm transition-all duration-300 ${
              selectedMessage ? 'w-1/3' : 'w-full'
            }`}>
              {/* Header de la liste */}
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold text-gray-900">
                    Messages non-lus ({messages.length})
                  </h3>
                  <div className="flex items-center space-x-2">
                    <button 
                      onClick={() => setShowPathsManager(true)}
                      className="bg-green-50 hover:bg-green-100 text-green-700 font-medium py-2 px-4 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 inline-flex items-center"
                      title="Gérer les dossiers d'enregistrement"
                    >
                      <Settings className="mr-2" style={{ fontSize: 18 }} />
                      Dossiers
                    </button>
                    <button 
                      onClick={() => fetchUnreadMessages()} 
                      disabled={loading}
                      className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium py-2 px-4 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 inline-flex items-center disabled:opacity-50"
                    >
                      <Refresh className={`mr-2 ${loading ? 'animate-spin' : ''}`} style={{ fontSize: 18 }} />
                      Actualiser
                    </button>
                  </div>
                </div>
              </div>

              {/* Liste des messages */}
              <div className="overflow-y-auto h-full">
                {messages.length === 0 ? (
                  <div className="p-12 text-center">
                    <Email className="text-gray-300 mx-auto mb-4" style={{ fontSize: 48 }} />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Aucun message non-lu
                    </h3>
                    <p className="text-gray-600">
                      Tous vos messages ont été lus
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {messages.map((message) => {
                      const senderEmail = message.from?.emailAddress?.address;
                      const senderPathInfo = getSenderPathInfo(senderEmail);
                      
                      return (
                        <div 
                          key={message.id}
                          onClick={() => handleMessageClick(message)}
                          className={`p-4 hover:bg-blue-25 cursor-pointer transition-colors duration-200 ${
                            selectedMessage?.id === message.id ? 'bg-blue-50 border-r-4 border-r-blue-500' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center mb-2">
                                <div className="w-2 h-2 bg-blue-500 rounded-full mr-3 flex-shrink-0"></div>
                                <p className="font-semibold text-gray-900 truncate">
                                  {message.from?.emailAddress?.name || message.from?.emailAddress?.address}
                                </p>
                                {message.hasAttachments && (
                                  <Attachment className="text-gray-400 ml-2" style={{ fontSize: 16 }} />
                                )}
                                {senderPathInfo && (
                                  <FolderSpecial className="text-green-500 ml-2" style={{ fontSize: 16 }} title="Dossier configuré" />
                                )}
                              </div>
                              <h4 className="font-medium text-gray-900 mb-1 truncate">
                                {message.subject || 'Sans sujet'}
                              </h4>
                              <p className="text-sm text-gray-600 line-clamp-2">
                                {message.bodyPreview}
                              </p>
                            </div>
                            <div className="ml-4 flex-shrink-0 text-right">
                              <p className="text-xs text-gray-500 mb-1">
                                {formatDate(message.receivedDateTime)}
                              </p>
                              {message.importance === 'high' && (
                                <div className="w-2 h-2 bg-red-500 rounded-full ml-auto"></div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Vue détaillée du message */}
            {selectedMessage && (
              <div className="w-2/3 bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-sm flex flex-col">
                {/* Header du message */}
                <div className="p-6 border-b border-gray-100">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h2 className="text-xl font-bold text-gray-900 mb-2">
                        {selectedMessage.subject || 'Sans sujet'}
                      </h2>
                      <div className="space-y-2">
                        <div className="flex items-center">
                          <span className="text-sm text-gray-500 w-16">De:</span>
                          <span className="text-sm text-gray-900 font-medium">
                            {selectedMessage.from?.emailAddress?.name || selectedMessage.from?.emailAddress?.address}
                          </span>
                          {getSenderPathInfo(selectedMessage.from?.emailAddress?.address) && (
                            <div className="ml-2 px-2 py-1 bg-green-50 text-green-700 text-xs rounded-md">
                              Dossier configuré
                            </div>
                          )}
                        </div>
                        <div className="flex items-center">
                          <span className="text-sm text-gray-500 w-16">À:</span>
                          <span className="text-sm text-gray-900">
                            {selectedMessage.toRecipients?.map(r => r.emailAddress.name || r.emailAddress.address).join(', ')}
                          </span>
                        </div>
                        <div className="flex items-center">
                          <span className="text-sm text-gray-500 w-16">Date:</span>
                          <span className="text-sm text-gray-900">
                            {new Date(selectedMessage.receivedDateTime).toLocaleString('fr-FR')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 ml-4">
                      <button 
                        onClick={() => saveMessage(selectedMessage)}
                        className="p-2 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                        title="Sauvegarder le message"
                      >
                        <Download style={{ fontSize: 18 }} className="text-blue-600" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Actions du message */}
                  <div className="flex items-center space-x-2">
                    <button className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium py-2 px-3 rounded-lg text-sm transition-all duration-200 inline-flex items-center">
                      <Reply className="mr-2" style={{ fontSize: 16 }} />
                      Répondre
                    </button>
                    <button className="bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium py-2 px-3 rounded-lg text-sm transition-all duration-200 inline-flex items-center">
                      <ReplyAll className="mr-2" style={{ fontSize: 16 }} />
                      Répondre à tous
                    </button>
                    <button className="bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium py-2 px-3 rounded-lg text-sm transition-all duration-200 inline-flex items-center">
                      <Forward className="mr-2" style={{ fontSize: 16 }} />
                      Transférer
                    </button>
                  </div>
                </div>

                {/* Contenu du message */}
                <div className="flex-1 p-6 overflow-y-auto">
                  <div 
                    className="prose prose-sm max-w-none text-gray-900"
                    dangerouslySetInnerHTML={{ 
                      __html: selectedMessage.body?.content || selectedMessage.bodyPreview 
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal pour configurer le chemin de l'expéditeur */}
      <SenderPathModal
        isOpen={showSenderModal}
        onClose={() => {
          setShowSenderModal(false);
          setCurrentSender(null);
        }}
        sender={currentSender}
        onSave={handleSaveSenderPath}
      />

      {/* Modal pour gérer tous les chemins */}
      <SenderPathsManager
        isOpen={showPathsManager}
        onClose={() => setShowPathsManager(false)}
        onPathUpdated={handlePathsUpdated}
      />
    </div>
  );
};

export default MainPage;