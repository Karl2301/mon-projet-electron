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
  CreateNewFolder
} from '@mui/icons-material';

const GeneralSettings = ({ isOpen, onClose, onSettingsUpdated }) => {
  const [settings, setSettings] = useState({
    rootFolder: '',
    folderStructure: []
  });
  const [loading, setLoading] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState(new Set());

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const savedSettings = await window.electronAPI.getGeneralSettings();
      setSettings(savedSettings || { rootFolder: '', folderStructure: [] });
    } catch (error) {
      console.error('Erreur lors du chargement des paramètres:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRootFolder = async () => {
    try {
      const result = await window.electronAPI.selectFolder();
      if (result) {
        setSettings(prev => ({ ...prev, rootFolder: result }));
      }
    } catch (error) {
      console.error('Erreur lors de la sélection du dossier:', error);
    }
  };

  const addFolderToStructure = (parentPath = '') => {
    const newFolder = {
      id: Date.now() + Math.random(),
      name: 'Nouveau dossier',
      type: 'folder',
      path: parentPath,
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
      path: parentPath,
      content: 'Contenu du fichier par défaut'
    };

    setSettings(prev => ({
      ...prev,
      folderStructure: addNodeToStructure(prev.folderStructure, parentPath, newFile)
    }));
  };

  const addNodeToStructure = (structure, parentPath, newNode) => {
    if (parentPath === '') {
      return [...structure, newNode];
    }

    return structure.map(node => {
      if (node.path + '/' + node.name === parentPath) {
        return {
          ...node,
          children: [...(node.children || []), newNode]
        };
      } else if (node.children) {
        return {
          ...node,
          children: addNodeToStructure(node.children, parentPath, newNode)
        };
      }
      return node;
    });
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
    setSettings(prev => ({
      ...prev,
      folderStructure: deleteNodeFromStructure(prev.folderStructure, nodeId)
    }));
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

  const renderStructureNode = (node, level = 0, parentPath = '') => {
    const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
    const isExpanded = expandedNodes.has(currentPath);
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id} className="mb-2">
        <div 
          className="flex items-center space-x-2 p-2 bg-white rounded-lg border border-gray-200 hover:bg-gray-25 transition-colors"
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
              <Folder className="text-blue-500" style={{ fontSize: 18 }} />
            ) : (
              <InsertDriveFile className="text-gray-500" style={{ fontSize: 18 }} />
            )}
            
            <input
              type="text"
              value={node.name}
              onChange={(e) => handleUpdateNode(node.id, 'name', e.target.value)}
              className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center space-x-1">
            {node.type === 'folder' && (
              <>
                <button
                  onClick={() => addFolderToStructure(currentPath)}
                  className="p-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded transition-colors"
                  title="Ajouter un dossier"
                >
                  <CreateNewFolder style={{ fontSize: 16 }} />
                </button>
                <button
                  onClick={() => addFileToStructure(currentPath)}
                  className="p-1 bg-green-50 hover:bg-green-100 text-green-600 rounded transition-colors"
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
      onSettingsUpdated?.();
      onClose();
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
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
                  Configurez le dossier racine et l'arborescence de base
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
        <div className="flex-1 overflow-hidden flex">
          {/* Left Panel - Root Folder */}
          <div className="w-1/3 p-6 border-r border-gray-100">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">
              Dossier racine
            </h4>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Emplacement des clients
                </label>
                <button
                  onClick={handleSelectRootFolder}
                  className="w-full p-4 border-2 border-dashed border-gray-200 hover:border-blue-300 rounded-xl transition-colors text-left"
                >
                  <div className="flex items-center">
                    <FolderOpen className="text-gray-400 mr-3" style={{ fontSize: 24 }} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">
                        {settings.rootFolder ? 'Dossier configuré' : 'Choisir le dossier racine'}
                      </p>
                      <p className="text-sm text-gray-600 truncate">
                        {settings.rootFolder || 'Cliquez pour sélectionner le dossier'}
                      </p>
                    </div>
                  </div>
                </button>
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
          <div className="w-2/3 flex flex-col">
            <div className="p-6 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-semibold text-gray-900">
                  Arborescence de base
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
            </div>

            <div className="flex-1 p-6 overflow-y-auto">
              {loading ? (
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
                className="py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
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
  );
};

export default GeneralSettings;