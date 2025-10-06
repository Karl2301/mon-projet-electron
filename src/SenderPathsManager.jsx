import React, { useState, useEffect } from 'react';
import { 
  Close, 
  FolderOpen, 
  Person, 
  Edit, 
  Delete,
  Add,
  Folder,
  Email
} from '@mui/icons-material';

const SenderPathsManager = ({ isOpen, onClose, onPathUpdated }) => {
  const [senderPaths, setSenderPaths] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingPath, setEditingPath] = useState(null);
  const [newFolderPath, setNewFolderPath] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadSenderPaths();
    }
  }, [isOpen]);

  const loadSenderPaths = async () => {
    setLoading(true);
    try {
      const paths = await window.electronAPI.getAllSenderPaths();
      setSenderPaths(paths);
    } catch (error) {
      console.error('Erreur lors du chargement des chemins:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFolder = async () => {
    try {
      const result = await window.electronAPI.selectFolder();
      if (result) {
        setNewFolderPath(result);
      }
    } catch (error) {
      console.error('Erreur lors de la sélection du dossier:', error);
    }
  };

  const handleUpdatePath = async (senderEmail) => {
    if (!newFolderPath) return;

    try {
      const senderPath = senderPaths.find(p => p.sender_email === senderEmail);
      await window.electronAPI.setSenderPath({
        senderEmail: senderEmail,
        senderName: senderPath.sender_name,
        folderPath: newFolderPath
      });
      
      await loadSenderPaths();
      setEditingPath(null);
      setNewFolderPath('');
      onPathUpdated?.();
    } catch (error) {
      console.error('Erreur lors de la mise à jour:', error);
    }
  };

  const handleDeletePath = async (senderEmail) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce chemin ?')) return;

    try {
      await window.electronAPI.deleteSenderPath(senderEmail);
      await loadSenderPaths();
      onPathUpdated?.();
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
    }
  };

  const startEditing = (senderEmail) => {
    const senderPath = senderPaths.find(p => p.sender_email === senderEmail);
    setEditingPath(senderEmail);
    setNewFolderPath(senderPath.folder_path);
  };

  const cancelEditing = () => {
    setEditingPath(null);
    setNewFolderPath('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[80vh] animate-slide-up">
        {/* Header */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mr-3">
                <Folder className="text-blue-600" style={{ fontSize: 20 }} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Gestion des dossiers
                </h3>
                <p className="text-sm text-gray-600">
                  Configurez les dossiers d'enregistrement par expéditeur
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
        <div className="p-6 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : senderPaths.length === 0 ? (
            <div className="text-center py-12">
              <Email className="text-gray-300 mx-auto mb-4" style={{ fontSize: 48 }} />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Aucun dossier configuré
              </h3>
              <p className="text-gray-600">
                Les dossiers seront ajoutés automatiquement lors de la première sauvegarde d'un email
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {senderPaths.map((senderPath) => (
                <div 
                  key={senderPath.sender_email}
                  className="bg-gray-25 rounded-xl p-4 border border-gray-100"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start flex-1">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-4 flex-shrink-0">
                        <span className="text-blue-700 font-medium text-sm">
                          {senderPath.sender_name?.[0]?.toUpperCase() || senderPath.sender_email?.[0]?.toUpperCase()}
                        </span>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="mb-3">
                          <h4 className="font-medium text-gray-900 mb-1">
                            {senderPath.sender_name || 'Expéditeur inconnu'}
                          </h4>
                          <p className="text-sm text-gray-600 break-all">
                            {senderPath.sender_email}
                          </p>
                        </div>
                        
                        {editingPath === senderPath.sender_email ? (
                          <div className="space-y-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Nouveau dossier
                              </label>
                              <div className="flex space-x-2">
                                <button
                                  onClick={handleSelectFolder}
                                  className="flex-1 p-3 border-2 border-dashed border-gray-200 hover:border-blue-300 rounded-lg transition-colors text-left"
                                >
                                  <div className="flex items-center">
                                    <FolderOpen className="text-gray-400 mr-3" style={{ fontSize: 20 }} />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-gray-900">
                                        {newFolderPath ? 'Dossier sélectionné' : 'Choisir un dossier'}
                                      </p>
                                      <p className="text-xs text-gray-600 truncate">
                                        {newFolderPath || 'Cliquez pour sélectionner'}
                                      </p>
                                    </div>
                                  </div>
                                </button>
                              </div>
                            </div>
                            
                            <div className="flex space-x-2">
                              <button
                                onClick={() => handleUpdatePath(senderPath.sender_email)}
                                disabled={!newFolderPath}
                                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
                              >
                                Sauvegarder
                              </button>
                              <button
                                onClick={cancelEditing}
                                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors text-sm"
                              >
                                Annuler
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Dossier d'enregistrement
                            </label>
                            <div className="bg-white rounded-lg p-3 border border-gray-200">
                              <div className="flex items-center">
                                <Folder className="text-blue-500 mr-2" style={{ fontSize: 16 }} />
                                <p className="text-sm text-gray-900 font-mono break-all">
                                  {senderPath.folder_path}
                                </p>
                              </div>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                              Configuré le {new Date(senderPath.updated_at).toLocaleDateString('fr-FR', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {editingPath !== senderPath.sender_email && (
                      <div className="flex space-x-1 ml-4">
                        <button
                          onClick={() => startEditing(senderPath.sender_email)}
                          className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors"
                          title="Modifier le dossier"
                        >
                          <Edit style={{ fontSize: 16 }} />
                        </button>
                        <button
                          onClick={() => handleDeletePath(senderPath.sender_email)}
                          className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                          title="Supprimer la configuration"
                        >
                          <Delete style={{ fontSize: 16 }} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              {senderPaths.length} expéditeur{senderPaths.length !== 1 ? 's' : ''} configuré{senderPaths.length !== 1 ? 's' : ''}
            </div>
            <button
              onClick={onClose}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-xl transition-colors"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SenderPathsManager;