import React, { useState, useEffect } from 'react';

const SaveEmailModal = ({ 
  isOpen, 
  onClose, 
  message, 
  onSave,
  messageType = 'received' // 'received' ou 'sent'
}) => {
  const [suggestion, setSuggestion] = useState(null);
  const [existingClients, setExistingClients] = useState([]);
  const [selectedPath, setSelectedPath] = useState(null);
  const [customPath, setCustomPath] = useState('');
  const [saveForFuture, setSaveForFuture] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('suggestion');
  
  // Nouveaux états pour la gestion intelligente
  const [selectedClient, setSelectedClient] = useState(null);
  const [isPathChanged, setIsPathChanged] = useState(false);
  const [originalSenderPath, setOriginalSenderPath] = useState(null);
  const [generalSettings, setGeneralSettings] = useState(null);

  useEffect(() => {
    if (isOpen && message) {
      loadSuggestion();
      resetStates();
    }
  }, [isOpen, message, messageType]);

  const resetStates = () => {
    setSelectedClient(null);
    setIsPathChanged(false);
    setOriginalSenderPath(null);
    setSaveForFuture(true);
  };

  const loadSuggestion = async () => {
    setIsLoading(true);
    try {
      const settings = await window.electronAPI?.getGeneralSettings();
      setGeneralSettings(settings);
      
      let result;
      if (messageType === 'sent') {
        result = await window.electronAPI?.saveSentMessageWithSuggestion({ message });
      } else {
        result = await window.electronAPI?.saveMessageWithSuggestion({ message });
      }
      
      if (result?.success) {
        setSuggestion(result.suggestion);
        setExistingClients(result.existingClients);
        
        // Pour les messages envoyés, utiliser l'email du destinataire
        const emailToCheck = messageType === 'sent' 
          ? result.recipientEmail 
          : message?.from?.emailAddress?.address;
          
        if (emailToCheck) {
          const originalPath = await window.electronAPI?.getSenderPath(emailToCheck);
          setOriginalSenderPath(originalPath);
        }
        
        if (result.suggestion?.folderPath && result.suggestion.confidence !== 'none') {
          setSelectedPath(result.suggestion.folderPath);
          
          if (result.suggestion.type === 'existing') {
            setSaveForFuture(false);
          }
        }
      }
    } catch (error) {
      console.error('Error loading suggestion:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fonction pour vérifier si le dossier de dépôt existe dans un chemin
  const checkDepositFolderExists = (basePath) => {
    if (!generalSettings?.emailDepositFolder || !basePath) return false;
    // Cette vérification est informative côté client, la vérification réelle se fait côté serveur
    return true; // On ne peut pas vérifier l'existence côté client, on fait confiance au serveur
  };

  const getPathPreview = (basePath) => {
    if (!basePath || !generalSettings?.emailDepositFolder) return basePath;
    
    const depositFolder = generalSettings.emailDepositFolder.trim();
    return `${basePath} → Vérification automatique du dossier "${depositFolder}"`;
  };

  const handleClientSelection = (client) => {
    setSelectedClient(client);
    setSelectedPath(client.folderPath);
    
    // Vérifier si le chemin a changé par rapport à l'original
    const senderEmail = message?.from?.emailAddress?.address;
    if (originalSenderPath && originalSenderPath.folder_path !== client.folderPath) {
      setIsPathChanged(true);
      setSaveForFuture(true); // Proposer de sauvegarder le nouveau chemin
    } else if (senderEmail === client.senderEmail) {
      // Même expéditeur, même chemin
      setIsPathChanged(false);
      setSaveForFuture(false);
    } else {
      // Expéditeur différent
      setIsPathChanged(true);
      setSaveForFuture(true);
    }
  };

  const handleSuggestionSelection = () => {
    if (!suggestion?.folderPath) return;
    
    setSelectedPath(suggestion.folderPath);
    setSelectedClient(null);
    
    // Si c'est un expéditeur existant, pas besoin de sauvegarder pour le futur
    if (suggestion.type === 'existing') {
      setSaveForFuture(false);
      setIsPathChanged(false);
    } else {
      setSaveForFuture(true);
      setIsPathChanged(false);
    }
  };

  const handleCustomPathChange = (newPath) => {
    setCustomPath(newPath);
    setSelectedClient(null);
    setIsPathChanged(true);
    setSaveForFuture(true); // Toujours proposer de sauvegarder un chemin personnalisé
  };

  const handleSave = async () => {
    if (!selectedPath && !customPath) return;
    
    let pathToUse;
    let shouldSaveForFuture = saveForFuture;
    
    if (activeTab === 'custom') {
      // Cas "Autre dossier" : Enregistrer directement dans le chemin sélectionné
      pathToUse = customPath;
    } else if (activeTab === 'existing' && selectedClient) {
      // Cas "Clients existants" : Utiliser le chemin du client + dossier de dépôt
      pathToUse = selectedClient.folderPath;
    } else {
      // Cas "Suggestion"
      pathToUse = selectedPath;
    }
    
    console.log('💾 Sauvegarde avec les paramètres corrigés:', {
      pathToUse,
      activeTab,
      selectedClient: selectedClient?.clientName,
      isPathChanged,
      shouldSaveForFuture,
      originalPath: originalSenderPath?.folder_path
    });
    
    setIsLoading(true);
    try {
      let result;
      const saveData = {
        message,
        chosenPath: pathToUse,
        savePathForFuture: shouldSaveForFuture,
        isClientSelection: activeTab === 'existing',
        clientInfo: selectedClient
      };
      
      if (messageType === 'sent') {
        result = await window.electronAPI?.saveSentMessageToPath(saveData);
      } else {
        result = await window.electronAPI?.saveMessageToPath(saveData);
      }
      
      if (result?.success) {
        // Enrichir le résultat avec les informations locales
        const enrichedResult = {
          ...result,
          pathChanged: isPathChanged,
          clientSelected: selectedClient?.clientName,
          // S'assurer que ces propriétés sont définies
          actualSavePath: result.actualSavePath || result.filePath || 'Chemin non défini',
          basePath: result.basePath || pathToUse || 'Chemin de base non défini'
        };
        
        console.log('✅ Résultat enrichi:', enrichedResult);
        
        onSave(enrichedResult);
        onClose();
      } else {
        alert(`Erreur: ${result?.error || 'Erreur inconnue'}`);
      }
    } catch (error) {
      console.error('❌ Exception lors de la sauvegarde:', error);
      alert(`Erreur lors de la sauvegarde: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectCustomFolder = async () => {
    try {
      const selectedFolder = await window.electronAPI?.selectFolder();
      if (selectedFolder) {
        handleCustomPathChange(selectedFolder);
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
    }
  };

  const getConfidenceColor = (confidence) => {
    switch (confidence) {
      case 'high': return 'text-green-600 bg-green-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-orange-600 bg-orange-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getTabDescription = () => {
    switch (activeTab) {
      case 'suggestion':
        return 'Le système suggère automatiquement le meilleur emplacement';
      case 'existing':
        return 'Choisir parmi tous les expéditeurs déjà configurés';
      case 'custom':
        return 'Sélectionner un dossier personnalisé (sauvegarde directe)';
      default:
        return '';
    }
  };

  const getModalTitle = () => {
    return messageType === 'sent' ? 'Sauvegarder l\'email envoyé' : 'Sauvegarder l\'email reçu';
  };

  const getEmailInfo = () => {
    if (messageType === 'sent') {
      const recipient = message?.toRecipients?.[0];
      return {
        label: 'À',
        name: recipient?.emailAddress?.name,
        email: recipient?.emailAddress?.address
      };
    } else {
      return {
        label: 'De',
        name: message?.from?.emailAddress?.name,
        email: message?.from?.emailAddress?.address
      };
    }
  };

  if (!isOpen) return null;

  const emailInfo = getEmailInfo();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {getModalTitle()}
          </h2>
          <div className="mt-2">
            {messageType === 'sent' && (
              <div className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-xs font-medium mb-2">
                Message envoyé
              </div>
            )}
            <p className="text-sm text-gray-600">
              {emailInfo.label}: {emailInfo.name} ({emailInfo.email})
            </p>
            <p className="text-sm text-gray-600">
              Sujet: {message?.subject || 'Sans sujet'}
            </p>
          </div>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              <span className="ml-2">Chargement des suggestions...</span>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="flex space-x-1 mb-4 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setActiveTab('suggestion')}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'suggestion'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Suggestion
                </button>
                <button
                  onClick={() => setActiveTab('existing')}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'existing'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Clients existants
                </button>
                <button
                  onClick={() => setActiveTab('custom')}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'custom'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Autre dossier
                </button>
              </div>

              {/* Description du tab actif */}
              <p className="text-xs text-gray-500 mb-6 italic">
                {getTabDescription()}
              </p>

              {/* Suggestion Tab */}
              {activeTab === 'suggestion' && suggestion && (
                <div className="space-y-4">
                  {suggestion.type !== 'no_suggestion' && suggestion.type !== 'error' ? (
                    <div 
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                        selectedPath === suggestion.folderPath
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={handleSuggestionSelection}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900">
                            {suggestion.clientName}
                          </h3>
                          <p className="text-sm text-gray-600 mt-1">
                            {suggestion.folderPath}
                          </p>
                          <p className="text-sm text-gray-500 mt-2">
                            {suggestion.reason}
                          </p>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getConfidenceColor(suggestion.confidence)}`}>
                          {suggestion.confidence === 'high' && 'Confiance élevée'}
                          {suggestion.confidence === 'medium' && 'Confiance moyenne'}
                          {suggestion.confidence === 'low' && 'Confiance faible'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p>Aucune suggestion disponible</p>
                      <p className="text-sm mt-1">Utilisez les autres onglets pour choisir un dossier</p>
                    </div>
                  )}
                </div>
              )}

              {/* Existing Clients Tab */}
              {/* Existing Clients Tab */}
              {activeTab === 'existing' && (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {existingClients.length > 0 ? (
                    existingClients.map((client, index) => (
                      <div
                        key={`${client.senderEmail}-${index}`}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedClient?.senderEmail === client.senderEmail
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => handleClientSelection(client)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-900 truncate">
                              {client.senderName}
                            </h4>
                            <p className="text-xs text-blue-600 truncate mb-1">
                              {client.senderEmail}
                            </p>
                            <p className="text-sm text-gray-600 truncate">
                              📁 {client.clientName}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {client.folderPath}
                            </p>
                          </div>
                          
                          {/* Indicateur si c'est le correspondant actuel */}
                          {messageType === 'sent' && client.isCorrespondent && (
                            <div className="ml-2 flex-shrink-0">
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                ✉️ Correspondant
                              </span>
                            </div>
                          )}
                          
                          {/* Indicateur si c'est l'expéditeur actuel pour les emails reçus */}
                          {messageType === 'received' && client.senderEmail === message?.from?.emailAddress?.address && (
                            <div className="ml-2 flex-shrink-0">
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                Actuel
                              </span>
                            </div>
                          )}
                          
                          {/* Avertissement si changement de client */}
                          {originalSenderPath && originalSenderPath.folder_path !== client.folderPath && (
                            <div className="ml-2 flex-shrink-0">
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                ⚠️ Changement
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p>Aucun correspondant configuré</p>
                      <p className="text-sm mt-1">Les correspondants seront ajoutés automatiquement lors des sauvegardes</p>
                    </div>
                  )}
                </div>
              )}

              {/* Custom Path Tab */}
              {activeTab === 'custom' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Sélectionner un dossier personnalisé
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={customPath}
                        onChange={(e) => handleCustomPathChange(e.target.value)}
                        placeholder="Chemin du dossier..."
                        className="flex-1 input-field"
                      />
                      <button
                        onClick={handleSelectCustomFolder}
                        className="btn-secondary whitespace-nowrap"
                      >
                        Parcourir
                      </button>
                    </div>
                    
                    {/* Affichage du comportement des dossiers de dépôt selon le type de message */}
                    {customPath && generalSettings && (
                      <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-800 font-medium mb-1">
                          📁 Comportement de sauvegarde :
                        </p>
                        
                        {messageType === 'sent' ? (
                          // Pour les messages envoyés
                          generalSettings.sentEmailDepositFolder ? (
                            <div className="space-y-2">
                              <p className="text-xs text-blue-700">
                                Le système vérifiera si le dossier "<strong>{generalSettings.sentEmailDepositFolder}</strong>" existe dans le chemin sélectionné et le créera si nécessaire.
                              </p>
                              <div className="space-y-1">
                                <p className="text-xs text-blue-600">
                                  ✅ Dossier trouvé/créé : <code className="bg-blue-100 px-1 rounded">{customPath}/{generalSettings.sentEmailDepositFolder}/SENT_fichier.json</code>
                                </p>
                                <p className="text-xs text-blue-600">
                                  ❌ Création impossible : <code className="bg-blue-100 px-1 rounded">{customPath}/SENT_fichier.json</code>
                                </p>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-blue-700">
                              Aucun dossier de dépôt configuré pour les emails envoyés. Le fichier sera sauvegardé directement avec le préfixe "SENT_".
                            </p>
                          )
                        ) : (
                          // Pour les messages reçus
                          (generalSettings.receivedEmailDepositFolder || generalSettings.emailDepositFolder) ? (
                            <div className="space-y-2">
                              <p className="text-xs text-blue-700">
                                Le système vérifiera si le dossier "<strong>{generalSettings.receivedEmailDepositFolder || generalSettings.emailDepositFolder}</strong>" existe dans le chemin sélectionné.
                              </p>
                              <div className="space-y-1">
                                <p className="text-xs text-blue-600">
                                  ✅ Si trouvé : <code className="bg-blue-100 px-1 rounded">{customPath}/{generalSettings.receivedEmailDepositFolder || generalSettings.emailDepositFolder}/fichier.json</code>
                                </p>
                                <p className="text-xs text-blue-600">
                                  ❌ Si absent : <code className="bg-blue-100 px-1 rounded">{customPath}/fichier.json</code>
                                </p>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-blue-700">
                              Aucun dossier de dépôt configuré pour les emails reçus. Le fichier sera sauvegardé directement.
                            </p>
                          )
                        )}
                      </div>
                    )}
                    
                    {customPath && !generalSettings?.receivedEmailDepositFolder && !generalSettings?.sentEmailDepositFolder && !generalSettings?.emailDepositFolder && (
                      <p className="text-xs text-gray-500 mt-2">
                        Le fichier sera sauvegardé directement dans ce dossier (aucun dossier de dépôt configuré)
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Save for future option */}
              {(selectedPath || customPath) && (
                <div className="mt-6 pt-4 border-t border-gray-200">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={saveForFuture}
                      onChange={(e) => setSaveForFuture(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">
                      {isPathChanged 
                        ? 'Mettre à jour le chemin pour cet expéditeur'
                        : 'Se souvenir de ce choix pour cet expéditeur'
                      }
                    </span>
                  </label>
                  {isPathChanged && (
                    <p className="text-xs text-orange-600 mt-1 ml-6">
                      Le chemin de sauvegarde pour cet expéditeur sera modifié
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="btn-secondary"
            disabled={isLoading}
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading || (!selectedPath && !customPath)}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaveEmailModal;
