import React, { useState } from 'react';
import { Close, FolderOpen, Person, Save } from '@mui/icons-material';

const SenderPathModal = ({ isOpen, onClose, sender, onSave }) => {
  const [selectedPath, setSelectedPath] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSelectFolder = async () => {
    try {
      const result = await window.electronAPI.selectFolder();
      if (result) {
        setSelectedPath(result);
      }
    } catch (error) {
      console.error('Erreur lors de la sélection du dossier:', error);
    }
  };

  const handleSave = async () => {
    if (!selectedPath) return;
    
    setLoading(true);
    try {
      await onSave(selectedPath);
      onClose();
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
    } finally {
      setLoading(false);
    }
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
          {/* Sender info */}
          <div className="bg-gray-25 rounded-xl p-4 mb-6">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                <span className="text-blue-700 font-medium text-sm">
                  {sender?.name?.[0]?.toUpperCase() || sender?.email?.[0]?.toUpperCase()}
                </span>
              </div>
              <div>
                <p className="font-medium text-gray-900">
                  {sender?.name || 'Expéditeur inconnu'}
                </p>
                <p className="text-sm text-gray-600">
                  {sender?.email}
                </p>
              </div>
            </div>
          </div>

          {/* Folder selection */}
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              Dossier de destination
            </label>
            
            <button
              onClick={handleSelectFolder}
              className="w-full p-4 border-2 border-dashed border-gray-200 hover:border-blue-300 rounded-xl transition-colors text-left"
            >
              <div className="flex items-center">
                <FolderOpen className="text-gray-400 mr-3" style={{ fontSize: 24 }} />
                <div>
                  <p className="font-medium text-gray-900">
                    {selectedPath ? 'Dossier sélectionné' : 'Choisir un dossier'}
                  </p>
                  <p className="text-sm text-gray-600 truncate">
                    {selectedPath || 'Cliquez pour sélectionner un dossier'}
                  </p>
                </div>
              </div>
            </button>

            {selectedPath && (
              <div className="bg-green-25 border border-green-200 rounded-lg p-3">
                <p className="text-sm text-green-800">
                  <strong>Dossier configuré:</strong>
                </p>
                <p className="text-sm text-green-700 font-mono break-all">
                  {selectedPath}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100">
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={!selectedPath || loading}
              className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors inline-flex items-center justify-center"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
              ) : (
                <Save className="mr-2" style={{ fontSize: 18 }} />
              )}
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SenderPathModal;