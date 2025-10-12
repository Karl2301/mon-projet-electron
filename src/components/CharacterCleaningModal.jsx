import React, { useState, useEffect } from 'react';
import { 
  Close, 
  Edit,
  Save
} from '@mui/icons-material';
import { useFileFormat } from '../contexts/FileFormatContext';

const CharacterCleaningModal = ({ onSave }) => {
  const { 
    isCharacterCleaningModalOpen, 
    characterCleaningSettings: contextSettings,
    closeCharacterCleaningModal,
    updateCharacterCleaningSettings
  } = useFileFormat();

  const [localSettings, setLocalSettings] = useState({
    enabled: true,
    charactersToClean: {
      '<': true, '>': true, ':': true, '"': true, '/': true, '\\': true, '|': true, '?': true, '*': true,
      '@': false, '#': false, '%': false, '&': false, '+': false, '=': false, '[': false, ']': false,
      '{': false, '}': false, ';': false, ',': false, '!': false, '~': false, '`': false, '$': false, '^': false
    },
    replaceWith: '_'
  });

  // Charger les settings depuis le context uniquement à l'ouverture
  useEffect(() => {
    if (isCharacterCleaningModalOpen && contextSettings) {
      setLocalSettings(contextSettings);
    }
  }, [isCharacterCleaningModalOpen, contextSettings]);

  const handleToggleCharacter = (char) => {
    setLocalSettings(prev => ({
      ...prev,
      charactersToClean: {
        ...prev.charactersToClean,
        [char]: !prev.charactersToClean[char]
      }
    }));
  };

  const handleSaveCleaningSettings = () => {
    updateCharacterCleaningSettings(localSettings);
    onSave?.(localSettings);
    closeCharacterCleaningModal();
  };

  const handleCloseModal = () => {
    closeCharacterCleaningModal();
  };

  const getCharacterDescription = (char) => {
    const descriptions = {
      '<': 'Chevron gauche (interdit Windows)',
      '>': 'Chevron droit (interdit Windows)',
      ':': 'Deux-points (interdit Windows)',
      '"': 'Guillemets (interdit Windows)',
      '/': 'Slash (séparateur Unix)',
      '\\': 'Antislash (séparateur Windows)',
      '|': 'Pipe (interdit Windows)',
      '?': 'Point d\'interrogation (interdit Windows)',
      '*': 'Astérisque (interdit Windows)',
      '@': 'Arobase (emails)',
      '#': 'Dièse (hashtag)',
      '%': 'Pourcentage',
      '&': 'Esperluette',
      '+': 'Plus',
      '=': 'Égal',
      '[': 'Crochet gauche',
      ']': 'Crochet droit',
      '{': 'Accolade gauche',
      '}': 'Accolade droite',
      ';': 'Point-virgule',
      ',': 'Virgule',
      '!': 'Point d\'exclamation',
      '~': 'Tilde',
      '`': 'Accent grave',
      '$': 'Dollar',
      '^': 'Circonflexe'
    };
    return descriptions[char] || char;
  };

  const getEnabledCount = () => {
    return Object.values(localSettings.charactersToClean).filter(Boolean).length;
  };

  const toggleAllDangerous = () => {
    const dangerousChars = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
    const allDangerousEnabled = dangerousChars.every(char => localSettings.charactersToClean[char]);
    
    const newSettings = { ...localSettings.charactersToClean };
    dangerousChars.forEach(char => {
      newSettings[char] = !allDangerousEnabled;
    });
    
    setLocalSettings(prev => ({
      ...prev,
      charactersToClean: newSettings
    }));
  };

  if (!isCharacterCleaningModalOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] animate-slide-up flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center mr-3">
                <Edit className="text-orange-600" style={{ fontSize: 20 }} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Nettoyage des caractères
                </h3>
                <p className="text-sm text-gray-600">
                  Configurez quels caractères nettoyer des noms de fichiers
                </p>
              </div>
            </div>
            <button
              onClick={handleCloseModal}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Close className="text-gray-500" style={{ fontSize: 20 }} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Activation générale */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={localSettings.enabled}
                  onChange={(e) => setLocalSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-3"
                />
                <div>
                  <span className="text-sm font-medium text-blue-900">
                    Activer le nettoyage automatique
                  </span>
                  <p className="text-xs text-blue-700 mt-1">
                    Les caractères sélectionnés seront remplacés par "{localSettings.replaceWith}"
                  </p>
                </div>
              </label>
            </div>

            {/* Paramètre de remplacement */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Caractère de remplacement
              </label>
              <div className="flex items-center space-x-3">
                <input
                  type="text"
                  value={localSettings.replaceWith}
                  onChange={(e) => setLocalSettings(prev => ({ ...prev, replaceWith: e.target.value.slice(0, 1) }))}
                  maxLength="1"
                  className="w-16 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-center font-mono"
                />
                <span className="text-sm text-gray-600">
                  Les caractères interdits seront remplacés par ce caractère
                </span>
              </div>
            </div>

            {/* Boutons de sélection rapide */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={toggleAllDangerous}
                className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-700 text-xs rounded-lg transition-colors"
              >
                Caractères dangereux (Windows)
              </button>
              <button
                onClick={() => setLocalSettings(prev => ({
                  ...prev,
                  charactersToClean: Object.fromEntries(
                    Object.keys(prev.charactersToClean).map(char => [char, true])
                  )
                }))}
                className="px-3 py-1 bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs rounded-lg transition-colors"
              >
                Tout sélectionner
              </button>
              <button
                onClick={() => setLocalSettings(prev => ({
                  ...prev,
                  charactersToClean: Object.fromEntries(
                    Object.keys(prev.charactersToClean).map(char => [char, false])
                  )
                }))}
                className="px-3 py-1 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs rounded-lg transition-colors"
              >
                Tout désélectionner
              </button>
            </div>

            {/* Liste des caractères */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-gray-900">
                  Caractères à nettoyer ({getEnabledCount()})
                </h4>
              </div>
              
              <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-3">
                {Object.entries(localSettings.charactersToClean).map(([char, enabled]) => (
                  <label key={char} className="flex items-center p-2 hover:bg-gray-50 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => handleToggleCharacter(char)}
                      className="rounded border-gray-300 text-orange-600 focus:ring-orange-500 mr-3"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-lg font-bold text-gray-900 bg-gray-100 px-2 py-1 rounded">
                          {char}
                        </span>
                        <span className="text-sm text-gray-700 truncate">
                          {getCharacterDescription(char)}
                        </span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Aperçu */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-yellow-900 mb-2">Aperçu du nettoyage</h4>
              <div className="space-y-2">
                <div>
                  <span className="text-xs text-yellow-700">Avant :</span>
                  <p className="font-mono text-sm text-yellow-900">Mon&lt;&gt;Fichier*:Test?.json</p>
                </div>
                <div>
                  <span className="text-xs text-yellow-700">Après :</span>
                  <p className="font-mono text-sm text-yellow-900">
                    Mon{localSettings.charactersToClean['<'] ? localSettings.replaceWith : '&lt;'}{localSettings.charactersToClean['>'] ? localSettings.replaceWith : '&gt;'}Fichier{localSettings.charactersToClean['*'] ? localSettings.replaceWith : '*'}{localSettings.charactersToClean[':'] ? localSettings.replaceWith : ':'}{localSettings.charactersToClean['?'] ? localSettings.replaceWith : '?'}.json
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 flex-shrink-0">
          <div className="flex justify-end space-x-3">
            <button
              onClick={handleCloseModal}
              className="py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSaveCleaningSettings}
              className="py-2 px-6 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-xl transition-colors inline-flex items-center"
            >
              <Save className="mr-2" style={{ fontSize: 18 }} />
              Appliquer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CharacterCleaningModal;
