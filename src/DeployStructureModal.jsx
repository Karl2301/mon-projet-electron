import React from 'react';
import { 
  Close, 
  CreateNewFolder,
  Check,
  Warning,
  Folder
} from '@mui/icons-material';

const DeployStructureModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  onSkip = null,
  folderPath, 
  structure,
  clientName = null
}) => {
  if (!isOpen) return null;

  // Fonction pour compter récursivement les éléments dans la structure
  const countItems = (items) => {
    if (!items || !Array.isArray(items)) return 0;
    
    let count = 0;
    items.forEach(item => {
      count += 1; // Compter l'élément lui-même
      if (item.children && Array.isArray(item.children)) {
        count += countItems(item.children); // Compter récursivement les enfants
      }
    });
    return count;
  };

  // Fonction pour afficher la structure en arbre
  const renderStructurePreview = (items, level = 0) => {
    if (!items || !Array.isArray(items)) return null;
    
    return items.map((item, index) => (
      <div key={index} style={{ paddingLeft: `${level * 20}px` }} className="py-1">
        <div className="flex items-center text-sm">
          {item.type === 'folder' ? (
            <Folder className="text-blue-500 mr-2" style={{ fontSize: 16 }} />
          ) : (
            <span className="w-4 h-4 mr-2 text-gray-400">📄</span>
          )}
          <span className="text-gray-700">{item.name}</span>
        </div>
        {item.children && item.children.length > 0 && (
          <div>
            {renderStructurePreview(item.children, level + 1)}
          </div>
        )}
      </div>
    ));
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full animate-slide-up">
        {/* Header */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center mr-3">
                <CreateNewFolder className="text-orange-600" style={{ fontSize: 20 }} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {clientName ? `Déployer l'arborescence pour ${clientName}` : 'Déployer l\'arborescence'}
                </h3>
                <p className="text-sm text-gray-600">
                  {clientName 
                    ? 'Confirmer la création de la structure dans le dossier client'
                    : 'Confirmer la création de la structure dans le dossier sélectionné'
                  }
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
          <div className="space-y-4">
            {/* Chemin de destination */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800 font-medium">Dossier de destination :</p>
              <p className="text-sm text-blue-700 font-mono break-all mt-1">{folderPath}</p>
            </div>

            {/* Structure à créer */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Structure qui sera créée :
              </p>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                {renderStructurePreview(structure)}
              </div>
            </div>

            {/* Avertissement */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-start">
                <Warning className="text-yellow-600 mr-2 flex-shrink-0" style={{ fontSize: 20 }} />
                <div>
                  <p className="text-sm text-yellow-800 font-medium">Attention</p>
                  <p className="text-sm text-yellow-700">
                    Cette action créera {countItems(structure)} élément{countItems(structure) > 1 ? 's' : ''} 
                    (dossiers et fichiers) dans le répertoire de destination.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-lg transition-colors"
            >
              Annuler
            </button>
            
            {onSkip && (
              <button
                onClick={onSkip}
                className="py-2 px-4 bg-yellow-100 hover:bg-yellow-200 text-yellow-700 font-medium rounded-lg transition-colors"
              >
                Ignorer la structure
              </button>
            )}
            
            <button
              onClick={onConfirm}
              className="py-2 px-6 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors inline-flex items-center"
            >
              <Check className="mr-2" style={{ fontSize: 18 }} />
              Confirmer et créer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeployStructureModal;