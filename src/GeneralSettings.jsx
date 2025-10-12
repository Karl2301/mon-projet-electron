import React, { useState, useEffect } from 'react';
import { 
  Close, 
  FolderOpen, 
  Settings,
  Add,
  Delete,
  Folder,
  InsertDriveFile,
  ExpandMore,
  ChevronRight,
  Save,
  CreateNewFolder,
  FolderSpecial,
  Inbox,
  Send
} from '@mui/icons-material';

const GeneralSettings = ({ isOpen, onClose, onSettingsUpdated }) => {
  const [settings, setSettings] = useState({
    rootFolder: '',
    folderStructure: [],
    emailDepositFolder: '', // Ancien paramètre pour rétrocompatibilité
    receivedEmailDepositFolder: '', // Nouveau: emails reçus
    sentEmailDepositFolder: '' // Nouveau: emails envoyés
  });
  const [loading, setLoading] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [pendingRootFolder, setPendingRootFolder] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const savedSettings = await window.electronAPI.getGeneralSettings();
      
      // Migration automatique de l'ancien paramètre vers les nouveaux
      if (savedSettings && savedSettings.emailDepositFolder && !savedSettings.receivedEmailDepositFolder) {
        savedSettings.receivedEmailDepositFolder = savedSettings.emailDepositFolder;
      }
      
      setSettings(savedSettings || { 
        rootFolder: '', 
        folderStructure: [], 
        emailDepositFolder: '',
        receivedEmailDepositFolder: '',
        sentEmailDepositFolder: ''
      });
    } catch (error) {
      console.error('Erreur lors du chargement des paramètres:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRootFolder = async () => {
    try {
      const result = await window.electronAPI.selectFolderWithCreate();
      if (result) {
        // Simplement définir le dossier racine sans déployer la structure
        setSettings(prev => ({ ...prev, rootFolder: result }));
        
        if (onSettingsUpdated) {
          onSettingsUpdated('success', 'Dossier racine configuré', {
            title: 'Configuration mise à jour',
            details: `Dossier racine défini : ${result}`
          });
        }
      }
    } catch (error) {
      console.error('Erreur lors de la sélection du dossier:', error);
      // Fallback vers la fonction normale si la nouvelle n'existe pas
      try {
        const result = await window.electronAPI.selectFolder();
        if (result) {
          setSettings(prev => ({ ...prev, rootFolder: result }));
        }
      } catch (fallbackError) {
        console.error('Erreur lors du fallback:', fallbackError);
      }
    }
  };

  const addFolderToStructure = (parentPath = '') => {
    const newFolder = {
      id: Date.now() + Math.random(),
      name: 'Nouveau dossier',
      type: 'folder',
      children: []
    };

    setSettings(prev => ({
      ...prev,
      folderStructure: addNodeToStructure(prev.folderStructure, parentPath, newFolder)
    }));
  };

  const addFileToStructure = (parentPath = '') => {
    const newFile = {
      id: Date.now() + Math.random(),
      name: 'nouveau_fichier.txt',
      type: 'file',
      content: 'Contenu du fichier par défaut'
    };

    setSettings(prev => ({
      ...prev,
      folderStructure: addNodeToStructure(prev.folderStructure, parentPath, newFile)
    }));
  };

  // Fonction corrigée pour ajouter un nœud à la structure
  const addNodeToStructure = (structure, parentPath, newNode) => {
    // Si parentPath est vide, ajouter à la racine
    if (parentPath === '') {
      return [...structure, newNode];
    }

    // Fonction récursive pour trouver le parent et ajouter le nœud
    const addToNode = (nodes, targetPath, nodeToAdd) => {
      return nodes.map(node => {
        const currentPath = node.name;
        
        // Si c'est le nœud parent recherché
        if (currentPath === targetPath) {
          return {
            ...node,
            children: [...(node.children || []), nodeToAdd]
          };
        }
        
        // Si ce nœud a des enfants, chercher récursivement
        if (node.children && node.children.length > 0) {
          // Vérifier si le chemin cible commence par le chemin actuel
          if (targetPath.startsWith(currentPath + '/')) {
            const remainingPath = targetPath.substring(currentPath.length + 1);
            return {
              ...node,
              children: addToNode(node.children, remainingPath, nodeToAdd)
            };
          }
        }
        
        return node;
      });
    };

    return addToNode(structure, parentPath, newNode);
  };

  const updateNodeInStructure = (structure, nodeId, updates) => {
    return structure.map(node => {
      if (node.id === nodeId) {
        return { ...node, ...updates };
      } else if (node.children) {
        return {
          ...node,
          children: updateNodeInStructure(node.children, nodeId, updates)
        };
      }
      return node;
    });
  };

  const deleteNodeFromStructure = (structure, nodeId) => {
    return structure.filter(node => {
      if (node.id === nodeId) {
        return false;
      } else if (node.children) {
        node.children = deleteNodeFromStructure(node.children, nodeId);
      }
      return true;
    });
  };

  const handleUpdateNode = (nodeId, field, value) => {
    setSettings(prev => ({
      ...prev,
      folderStructure: updateNodeInStructure(prev.folderStructure, nodeId, { [field]: value })
    }));
  };

  const handleDeleteNode = (nodeId) => {
    // Si le dossier supprimé était sélectionné comme dossier de dépôt, le désélectionner
    const nodeToDelete = findNodeById(settings.folderStructure, nodeId);
    if (nodeToDelete && nodeToDelete.type === 'folder') {
      const nodePath = getNodePath(settings.folderStructure, nodeId);
      
      setSettings(prev => ({
        ...prev,
        emailDepositFolder: prev.emailDepositFolder === nodePath ? '' : prev.emailDepositFolder,
        receivedEmailDepositFolder: prev.receivedEmailDepositFolder === nodePath ? '' : prev.receivedEmailDepositFolder,
        sentEmailDepositFolder: prev.sentEmailDepositFolder === nodePath ? '' : prev.sentEmailDepositFolder
      }));
    }
    
    setSettings(prev => ({
      ...prev,
      folderStructure: deleteNodeFromStructure(prev.folderStructure, nodeId)
    }));
  };

  // Nouvelle fonction pour trouver un nœud par son ID
  const findNodeById = (structure, nodeId) => {
    for (const node of structure) {
      if (node.id === nodeId) {
        return node;
      }
      if (node.children) {
        const found = findNodeById(node.children, nodeId);
        if (found) return found;
      }
    }
    return null;
  };

  // Nouvelle fonction pour obtenir le chemin d'un nœud
  const getNodePath = (structure, nodeId, currentPath = '') => {
    for (const node of structure) {
      const nodePath = currentPath ? `${currentPath}/${node.name}` : node.name;
      if (node.id === nodeId) {
        return nodePath;
      }
      if (node.children) {
        const found = getNodePath(node.children, nodeId, nodePath);
        if (found) return found;
      }
    }
    return null;
  };

  // Nouvelle fonction pour obtenir tous les dossiers disponibles
  const getAvailableFolders = (structure, currentPath = '') => {
    const folders = [];
    
    structure.forEach(node => {
      if (node.type === 'folder') {
        const folderPath = currentPath ? `${currentPath}/${node.name}` : node.name;
        folders.push({
          name: node.name,
          path: folderPath,
          id: node.id
        });
        
        if (node.children) {
          folders.push(...getAvailableFolders(node.children, folderPath));
        }
      }
    });
    
    return folders;
  };

  const toggleExpanded = (nodePath) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodePath)) {
        newSet.delete(nodePath);
      } else {
        newSet.add(nodePath);
      }
      return newSet;
    });
  };

  // Fonction corrigée pour construire le chemin
  const buildNodePath = (node, level = 0, parentPath = '') => {
    return parentPath ? `${parentPath}/${node.name}` : node.name;
  };

  const renderStructureNode = (node, level = 0, parentPath = '') => {
    const currentPath = buildNodePath(node, level, parentPath);
    const isExpanded = expandedNodes.has(currentPath);
    const hasChildren = node.children && node.children.length > 0;
    
    // Vérifier si ce dossier est sélectionné pour les dépôts d'emails
    const isReceivedDepositFolder = settings.receivedEmailDepositFolder === currentPath;
    const isSentDepositFolder = settings.sentEmailDepositFolder === currentPath;
    const isLegacyDepositFolder = settings.emailDepositFolder === currentPath;
    
    // Définir les styles selon la sélection
    let depositFolderStyles = '';
    let depositIcons = [];
    
    if (isReceivedDepositFolder && isSentDepositFolder) {
      // Même dossier pour les deux types - gradient moderne
      depositFolderStyles = 'bg-gradient-to-r from-blue-50 to-green-50 border-blue-300 shadow-sm';
      depositIcons = [
        { icon: <Inbox className="text-blue-500" style={{ fontSize: 12 }} />, type: 'received' },
        { icon: <Send className="text-green-500" style={{ fontSize: 12 }} />, type: 'sent' }
      ];
    } else if (isReceivedDepositFolder || isLegacyDepositFolder) {
      // Dossier pour emails reçus uniquement
      depositFolderStyles = 'bg-blue-50 border-blue-300 shadow-sm';
      depositIcons = [{ icon: <Inbox className="text-blue-500" style={{ fontSize: 12 }} />, type: 'received' }];
    } else if (isSentDepositFolder) {
      // Dossier pour emails envoyés uniquement
      depositFolderStyles = 'bg-green-50 border-green-300 shadow-sm';
      depositIcons = [{ icon: <Send className="text-green-500" style={{ fontSize: 12 }} />, type: 'sent' }];
    } else {
      // Dossier normal
      depositFolderStyles = 'bg-white border-gray-200 hover:bg-gray-25';
    }

    return (
      <div key={node.id} className="mb-2">
        <div 
          className={`flex items-center space-x-2 p-2 rounded-lg border transition-all duration-200 ${depositFolderStyles}`}
          style={{ marginLeft: `${level * 20}px` }}
        >
          {node.type === 'folder' && (
            <button
              onClick={() => toggleExpanded(currentPath)}
              className="p-1 hover:bg-gray-200 rounded transition-colors"
            >
              {hasChildren ? (
                isExpanded ? <ExpandMore style={{ fontSize: 16 }} /> : <ChevronRight style={{ fontSize: 16 }} />
              ) : (
                <div className="w-4 h-4"></div>
              )}
            </button>
          )}
          
          <div className="flex items-center space-x-2 flex-1">
            {node.type === 'folder' ? (
              <div className="flex items-center">
                <Folder className="text-blue-500" style={{ fontSize: 18 }} />
                {/* Afficher les icônes de dépôt si nécessaire */}
                {depositIcons.length > 0 && (
                  <div className="flex items-center ml-1 space-x-1">
                    {depositIcons.map((iconInfo, index) => (
                      <div 
                        key={index}
                        className={`inline-flex items-center justify-center w-4 h-4 rounded-full ${
                          iconInfo.type === 'received' ? 'bg-blue-100' : 'bg-green-100'
                        }`}
                        title={iconInfo.type === 'received' ? 'Dossier de dépôt - Emails reçus' : 'Dossier de dépôt - Emails envoyés'}
                      >
                        {iconInfo.icon}
                      </div>
                    ))}
                    {depositIcons.length > 1 && (
                      <span className="text-xs font-medium text-gray-600 ml-1">×2</span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <InsertDriveFile className="text-gray-500" style={{ fontSize: 18 }} />
            )}
            
            <input
              type="text"
              value={node.name}
              onChange={(e) => handleUpdateNode(node.id, 'name', e.target.value)}
              className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            
            {/* Badge informatif pour les dossiers de dépôt */}
            {depositIcons.length > 0 && (
              <div className="flex items-center space-x-1">
                {isReceivedDepositFolder && isSentDepositFolder ? (
                  <div className="px-2 py-1 bg-gradient-to-r from-blue-100 to-green-100 text-xs font-medium rounded-md border border-gray-300">
                    <span className="text-blue-700">📥</span>
                    <span className="text-gray-600 mx-1">+</span>
                    <span className="text-green-700">📤</span>
                  </div>
                ) : isReceivedDepositFolder || isLegacyDepositFolder ? (
                  <div className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-md border border-blue-200">
                    📥 Reçus
                  </div>
                ) : isSentDepositFolder ? (
                  <div className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-md border border-green-200">
                    📤 Envoyés
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-1">
            {node.type === 'folder' && (
              <>
                {/* Boutons pour définir comme dossier de dépôt */}
                <div className="flex items-center space-x-1">
                  {/* Bouton pour emails reçus */}
                  <button
                    onClick={() => setSettings(prev => ({ 
                      ...prev, 
                      receivedEmailDepositFolder: isReceivedDepositFolder ? '' : currentPath,
                      // Nettoyer l'ancien paramètre si on utilise le nouveau
                      emailDepositFolder: isReceivedDepositFolder ? '' : prev.emailDepositFolder
                    }))}
                    className={`p-1 rounded transition-colors ${
                      isReceivedDepositFolder
                        ? 'bg-blue-200 text-blue-800 shadow-sm' 
                        : 'bg-blue-50 hover:bg-blue-100 text-blue-600'
                    }`}
                    title={isReceivedDepositFolder ? 'Retirer comme dossier de dépôt (emails reçus)' : 'Définir comme dossier de dépôt (emails reçus)'}
                  >
                    <Inbox style={{ fontSize: 14 }} />
                  </button>
                  
                  {/* Bouton pour emails envoyés */}
                  <button
                    onClick={() => setSettings(prev => ({ 
                      ...prev, 
                      sentEmailDepositFolder: isSentDepositFolder ? '' : currentPath
                    }))}
                    className={`p-1 rounded transition-colors ${
                      isSentDepositFolder
                        ? 'bg-green-200 text-green-800 shadow-sm' 
                        : 'bg-green-50 hover:bg-green-100 text-green-600'
                    }`}
                    title={isSentDepositFolder ? 'Retirer comme dossier de dépôt (emails envoyés)' : 'Définir comme dossier de dépôt (emails envoyés)'}
                  >
                    <Send style={{ fontSize: 14 }} />
                  </button>
                </div>
                
                <button
                  onClick={() => addFolderToStructure(currentPath)}
                  className="p-1 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded transition-colors"
                  title="Ajouter un dossier"
                >
                  <CreateNewFolder style={{ fontSize: 16 }} />
                </button>
                <button
                  onClick={() => addFileToStructure(currentPath)}
                  className="p-1 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded transition-colors"
                  title="Ajouter un fichier"
                >
                  <Add style={{ fontSize: 16 }} />
                </button>
              </>
            )}
            <button
              onClick={() => handleDeleteNode(node.id)}
              className="p-1 bg-red-50 hover:bg-red-100 text-red-600 rounded transition-colors"
              title="Supprimer"
            >
              <Delete style={{ fontSize: 16 }} />
            </button>
          </div>
        </div>

        {node.type === 'file' && (
          <div className="mt-2" style={{ marginLeft: `${(level + 1) * 20}px` }}>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Contenu du fichier:
            </label>
            <textarea
              value={node.content || ''}
              onChange={(e) => handleUpdateNode(node.id, 'content', e.target.value)}
              className="w-full p-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows="3"
              placeholder="Contenu du fichier..."
            />
          </div>
        )}

        {node.type === 'folder' && isExpanded && node.children && (
          <div className="mt-2">
            {node.children.map(child => 
              renderStructureNode(child, level + 1, currentPath)
            )}
          </div>
        )}
      </div>
    );
  };

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      await window.electronAPI.saveGeneralSettings(settings);
      if (onSettingsUpdated) {
        onSettingsUpdated('success', 'Configuration sauvegardée', {
          title: 'Paramètres mis à jour'
        });
      }
      onClose();
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      if (onSettingsUpdated) {
        onSettingsUpdated('error', 'Erreur lors de la sauvegarde', {
          title: 'Erreur de sauvegarde'
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const availableFolders = getAvailableFolders(settings.folderStructure);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] animate-slide-up flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-gray-100 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mr-3">
                  <Settings className="text-blue-600" style={{ fontSize: 20 }} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Configuration générale
                  </h3>
                  <p className="text-sm text-gray-600">
                    Configurez le dossier racine et l'arborescence par défaut
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Close className="text-gray-500" style={{ fontSize: 20 }} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden flex min-h-0">
            {/* Left Panel - Root Folder & Email Deposit */}
            <div className="w-1/3 p-6 border-r border-gray-100 overflow-y-auto">
              <h4 className="text-lg font-semibold text-gray-900 mb-4">
                Dossier racine
              </h4>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Emplacement des clients
                  </label>
                  <button
                    onClick={handleSelectRootFolder}
                    disabled={loading}
                    className="w-full p-4 border-2 border-dashed border-gray-200 hover:border-blue-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors text-left"
                  >
                    <div className="flex items-center">
                      <FolderOpen className="text-gray-400 mr-3" style={{ fontSize: 24 }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900">
                          {settings.rootFolder ? 'Dossier configuré' : 'Choisir le dossier racine'}
                        </p>
                        <p className="text-sm text-gray-600 truncate">
                          {settings.rootFolder || 'Cliquez pour sélectionner ou créer un dossier'}
                        </p>
                      </div>
                    </div>
                  </button>
                  
                  {settings.folderStructure.length > 0 && (
                    <p className="text-xs text-blue-600 mt-2">
                      💡 L'arborescence sera automatiquement déployée lors de la sélection
                    </p>
                  )}
                </div>

                {/* Section Dossiers de dépôt des emails */}
                <div className="space-y-4">
                  <h5 className="text-md font-semibold text-gray-900 flex items-center">
                    <FolderSpecial className="mr-2 text-orange-500" style={{ fontSize: 18 }} />
                    Dossiers de dépôt des emails
                  </h5>
                  
                  {/* Dossier pour emails reçus */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <Inbox className="inline mr-1 text-blue-500" style={{ fontSize: 16 }} />
                      Dossier de dépôt des emails reçus
                    </label>
                    
                    {availableFolders.length > 0 ? (
                      <div className="space-y-2">
                        <select
                          value={settings.receivedEmailDepositFolder}
                          onChange={(e) => setSettings(prev => ({ ...prev, receivedEmailDepositFolder: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        >
                          <option value="">-- Aucun dossier sélectionné --</option>
                          {availableFolders.map((folder) => (
                            <option key={`received-${folder.id}`} value={folder.path}>
                              {folder.path}
                            </option>
                          ))}
                        </select>
                        
                        {settings.receivedEmailDepositFolder && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
                            <p className="text-xs text-blue-800">
                              <strong>📥 Emails reçus :</strong> {settings.receivedEmailDepositFolder}
                            </p>
                            <p className="text-xs text-blue-600 mt-1">
                              Les emails reçus seront sauvegardés dans ce dossier
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                        <FolderSpecial className="text-gray-400 mx-auto mb-1" style={{ fontSize: 20 }} />
                        <p className="text-xs text-gray-600">
                          Créez d'abord des dossiers dans l'arborescence
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Dossier pour emails envoyés */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <Send className="inline mr-1 text-green-500" style={{ fontSize: 16 }} />
                      Dossier de dépôt des emails envoyés
                    </label>
                    
                    {availableFolders.length > 0 ? (
                      <div className="space-y-2">
                        <select
                          value={settings.sentEmailDepositFolder}
                          onChange={(e) => setSettings(prev => ({ ...prev, sentEmailDepositFolder: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                        >
                          <option value="">-- Aucun dossier sélectionné --</option>
                          {availableFolders.map((folder) => (
                            <option key={`sent-${folder.id}`} value={folder.path}>
                              {folder.path}
                            </option>
                          ))}
                        </select>
                        
                        {settings.sentEmailDepositFolder && (
                          <div className="bg-green-50 border border-green-200 rounded-lg p-2">
                            <p className="text-xs text-green-800">
                              <strong>📤 Emails envoyés :</strong> {settings.sentEmailDepositFolder}
                            </p>
                            <p className="text-xs text-green-600 mt-1">
                              Les emails envoyés seront sauvegardés dans ce dossier
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                        <FolderSpecial className="text-gray-400 mx-auto mb-1" style={{ fontSize: 20 }} />
                        <p className="text-xs text-gray-600">
                          Créez d'abord des dossiers dans l'arborescence
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Aperçu de la configuration */}
                  {(settings.receivedEmailDepositFolder || settings.sentEmailDepositFolder) && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <p className="text-sm text-gray-800 font-medium mb-2">
                        📋 Résumé de la configuration :
                      </p>
                      <div className="space-y-1">
                        {settings.receivedEmailDepositFolder === settings.sentEmailDepositFolder && settings.receivedEmailDepositFolder ? (
                          <p className="text-xs text-gray-600">
                            📤 Mails Reçus et Envoyés → <code className="bg-gray-200 px-1 rounded">{settings.receivedEmailDepositFolder}</code>
                          </p>
                        ) : (
                          <>
                            {settings.receivedEmailDepositFolder && (
                              <p className="text-xs text-gray-600">
                                📥 Reçus → <code className="bg-gray-200 px-1 rounded">{settings.receivedEmailDepositFolder}</code>
                              </p>
                            )}
                            {settings.sentEmailDepositFolder && (
                              <p className="text-xs text-gray-600">
                                📤 Envoyés → <code className="bg-gray-200 px-1 rounded">{settings.sentEmailDepositFolder}</code>
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {settings.rootFolder && (
                  <div className="bg-blue-25 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-800">
                      <strong>Structure:</strong>
                    </p>
                    <p className="text-sm text-blue-700 font-mono break-all">
                      {settings.rootFolder}
                    </p>
                    <p className="text-xs text-blue-600 mt-2">
                      ├── client1/<br/>
                      ├── client2/<br/>
                      └── client3/
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel - Folder Structure */}
            <div className="w-2/3 flex flex-col min-h-0">
              <div className="p-6 border-b border-gray-100 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-semibold text-gray-900">
                    Arborescence par défaut
                  </h4>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => addFolderToStructure()}
                      className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium py-2 px-3 rounded-lg transition-colors inline-flex items-center text-sm"
                    >
                      <CreateNewFolder className="mr-2" style={{ fontSize: 16 }} />
                      Dossier
                    </button>
                    <button
                      onClick={() => addFileToStructure()}
                      className="bg-green-50 hover:bg-green-100 text-green-700 font-medium py-2 px-3 rounded-lg transition-colors inline-flex items-center text-sm"
                    >
                      <Add className="mr-2" style={{ fontSize: 16 }} />
                      Fichier
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Cette structure sera créée automatiquement pour chaque nouveau client
                </p>
                
                {/* Légende pour les dossiers de dépôt */}
                {(settings.receivedEmailDepositFolder || settings.sentEmailDepositFolder) && (
                  <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-xs text-gray-700 font-medium mb-2">
                      🎨 Légende des dossiers de dépôt :
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs">
                      <div className="flex items-center">
                        <div className="w-3 h-3 bg-blue-100 border border-blue-300 rounded mr-1"></div>
                        <span className="text-gray-600">📥 Emails reçus</span>
                      </div>
                      <div className="flex items-center">
                        <div className="w-3 h-3 bg-green-100 border border-green-300 rounded mr-1"></div>
                        <span className="text-gray-600">📤 Emails envoyés</span>
                      </div>
                      <div className="flex items-center">
                        <div className="w-3 h-3 bg-gradient-to-r from-blue-100 to-green-100 border border-gray-300 rounded mr-1"></div>
                        <span className="text-gray-600">📥+📤 Les deux types</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex-1 p-6 overflow-y-auto min-h-0">
                {loading && showDeployModal ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-3"></div>
                    <span className="text-blue-600">Déploiement en cours...</span>
                  </div>
                ) : loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : settings.folderStructure.length === 0 ? (
                  <div className="text-center py-12">
                    <Folder className="text-gray-300 mx-auto mb-4" style={{ fontSize: 48 }} />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Aucune structure définie
                    </h3>
                    <p className="text-gray-600">
                      Ajoutez des dossiers et fichiers pour créer votre arborescence de base
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {settings.folderStructure.map(node => renderStructureNode(node))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-100 flex-shrink-0">
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600">
                {settings.folderStructure.length} élément{settings.folderStructure.length !== 1 ? 's' : ''} dans l'arborescence
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={onClose}
                  disabled={loading}
                  className="py-2 px-4 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 font-medium rounded-xl transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSaveSettings}
                  disabled={loading}
                  className="py-2 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors inline-flex items-center"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  ) : (
                    <Save className="mr-2" style={{ fontSize: 18 }} />
                  )}
                  Sauvegarder
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default GeneralSettings;