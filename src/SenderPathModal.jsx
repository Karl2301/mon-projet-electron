import React, { useState, useEffect } from 'react';
import { 
  Close, 
  Folder, 
  Person,
  FolderOpen,
  CreateNewFolder,
  Save
} from '@mui/icons-material';

const SenderPathModal = ({ isOpen, onClose, sender, onSave }) => {
  const [folderPath, setFolderPath] = useState('');
  const [senderName, setSenderName] = useState('');
  const [loading, setLoading] = useState(false);
  const [rootFolder, setRootFolder] = useState('');
  const [createMode, setCreateMode] = useState(false); // false = browse, true = create
  const [newFolderName, setNewFolderName] = useState('');

  useEffect(() => {
    if (isOpen && sender) {
      setSenderName(sender.name || '');
      setNewFolderName(sender.name || '');
      loadRootFolder();
      
      if (sender.folderPath) {
        setFolderPath(sender.folderPath);
        setCreateMode(false); // Mode parcourir si un chemin existe déjà
      } else {
        setFolderPath('');
        setCreateMode(true); // Mode création par défaut pour un nouvel expéditeur
      }
    }
  }, [isOpen, sender]);

  const loadRootFolder = async () => {
    try {
      const settings = await window.electronAPI.getGeneralSettings();
      setRootFolder(settings.rootFolder || '');
    } catch (error) {
      console.error('Erreur lors du chargement des paramètres:', error);
    }
  };

  const handleBrowseFolder = async () => {
    try {
      setLoading(true);
      const selectedPath = await window.electronAPI.selectFolder();
      if (selectedPath) {
        setFolderPath(selectedPath);
        // Reste en mode parcourir
      }
    } catch (error) {
      console.error('Erreur lors de la sélection du dossier:', error);
      alert('Erreur lors de la sélection du dossier');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    let finalFolderPath = folderPath;

    // Si on est en mode création, créer le dossier d'abord
    if (createMode) {
      if (!newFolderName.trim()) {
        alert('Veuillez entrer un nom de dossier');
        return;
      }

      if (!rootFolder) {
        alert('Dossier racine non configuré. Veuillez configurer les paramètres généraux d\'abord.');
        return;
      }

      try {
        setLoading(true);
        
        // Nettoyer le nom du dossier
        const cleanName = newFolderName.trim().replace(/[<>:"/\\|?*]/g, '_');
        
        // Créer le dossier dans le dossier racine
        const result = await window.electronAPI.createClientFolder(cleanName);
        
        if (result.success) {
          finalFolderPath = result.path;
        } else {
          throw new Error(result.error || 'Erreur lors de la création du dossier');
        }
      } catch (error) {
        console.error('Erreur lors de la création du dossier:', error);
        alert(`Erreur lors de la création du dossier : ${error.message}`);
        setLoading(false);
        return;
      }
    }

    // Vérifier qu'on a bien un chemin
    if (!finalFolderPath.trim()) {
      alert('Veuillez sélectionner ou créer un dossier');
      setLoading(false);
      return;
    }

    // Sauvegarder la configuration
    try {
      await onSave({
        senderEmail: sender.email,
        senderName: senderName.trim(),
        folderPath: finalFolderPath.trim()
      });
      onClose();
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      alert('Erreur lors de la sauvegarde');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const getPreviewPath = () => {
    if (createMode && newFolderName.trim()) {
      const cleanName = newFolderName.trim().replace(/[<>:"/\\|?*]/g, '_');
      return rootFolder ? `${rootFolder}/${cleanName}` : `[Dossier racine]/${cleanName}`;
    }
    return folderPath || 'Aucun dossier sélectionné';
  };

  const isValidForSave = () => {
    if (createMode) {
      return newFolderName.trim() && rootFolder;
    }
    return folderPath.trim();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full animate-slide-up">
        {/* Header */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mr-3">
                <Person className="text-blue-600" style={{ fontSize: 20 }} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Configurer le dossier
                </h3>
                <p className="text-sm text-gray-600">
                  Pour cet expéditeur
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
        <div className="p-6">
          <div className="space-y-6">
            {/* Info expéditeur */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-sm text-gray-600 mb-1">Email :</p>
              <p className="text-sm font-medium text-gray-900 break-all">{sender?.email}</p>
            </div>

            {/* Nom de l'expéditeur */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nom de l'expéditeur
              </label>
              <input
                type="text"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="Nom de l'expéditeur"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Mode de sélection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Choix du dossier de destination
              </label>
              
              <div className="space-y-3">
                {/* Option 1: Parcourir */}
                <div className="flex items-center space-x-3">
                  <input
                    type="radio"
                    id="browse-mode"
                    name="folder-mode"
                    checked={!createMode}
                    onChange={() => setCreateMode(false)}
                    className="w-4 h-4 text-blue-600"
                  />
                  <label htmlFor="browse-mode" className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">Parcourir l'ordinateur</span>
                      <button
                        onClick={handleBrowseFolder}
                        disabled={loading || createMode}
                        className="ml-3 px-3 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 text-sm rounded-md transition-colors inline-flex items-center"
                      >
                        <FolderOpen className="mr-1" style={{ fontSize: 16 }} />
                        Parcourir
                      </button>
                    </div>
                  </label>
                </div>

                {/* Option 2: Créer */}
                <div className="flex items-center space-x-3">
                  <input
                    type="radio"
                    id="create-mode"
                    name="folder-mode"
                    checked={createMode}
                    onChange={() => setCreateMode(true)}
                    className="w-4 h-4 text-blue-600"
                  />
                  <label htmlFor="create-mode" className="flex-1">
                    <span className="text-sm font-medium text-gray-900">Créer un nouveau dossier</span>
                  </label>
                </div>

                {/* Input pour nouveau dossier */}
                {createMode && (
                  <div className="ml-7 space-y-2">
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="Nom du nouveau dossier"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                    {!rootFolder && (
                      <p className="text-xs text-red-600">
                        Dossier racine non configuré. Configurez-le dans les paramètres généraux.
                      </p>
                    )}
                    {rootFolder && newFolderName.trim() && (
                      <p className="text-xs text-green-600">
                        Le dossier sera créé lors de la sauvegarde
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Preview du chemin */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-600 mb-1">Dossier de destination :</p>
              <p className="text-sm font-mono text-blue-900 break-all">
                {getPreviewPath()}
              </p>
              {createMode && newFolderName.trim() && rootFolder && (
                <p className="text-xs text-green-600 mt-1">
                  🆕 Ce dossier sera créé automatiquement
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2 px-4 bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-700 font-medium rounded-lg transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={loading || !isValidForSave()}
              className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors inline-flex items-center justify-center"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
              ) : (
                <>
                  {createMode ? (
                    <CreateNewFolder className="mr-2" style={{ fontSize: 18 }} />
                  ) : (
                    <Save className="mr-2" style={{ fontSize: 18 }} />
                  )}
                  {createMode ? 'Créer et sauvegarder' : 'Sauvegarder'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SenderPathModal;