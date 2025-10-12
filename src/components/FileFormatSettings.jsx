import React, { useState, useEffect, useRef } from 'react';
import { 
  Close, 
  Description,
  Code,
  Inbox,
  Send,
  Save,
  Refresh,
  Help,
  FileCopy,
  Edit
} from '@mui/icons-material';
import { useFileFormat } from '../contexts/FileFormatContext';
import CharacterCleaningModal from './CharacterCleaningModal';

const FileFormatSettings = ({ isOpen, onClose, onSave }) => {
  const [settings, setSettings] = useState({
    fileFormat: 'json',
    filenamePattern: '{date}_{time}_{subject}',
    filenamePatternSent: 'SENT_{date}_{time}_{subject}'
  });
  const [loading, setLoading] = useState(false);
  const [selectedField, setSelectedField] = useState('filenamePattern');
  
  const { openCharacterCleaningModal } = useFileFormat();
  
  // Références pour éviter les re-chargements intempestifs
  const settingsLoadedRef = useRef(false);
  const previousIsOpenRef = useRef(false);

  useEffect(() => {
    // Seulement charger les settings si la modal s'ouvre pour la première fois
    if (isOpen && !previousIsOpenRef.current && !settingsLoadedRef.current) {
      loadSettings();
      settingsLoadedRef.current = true;
    }
    previousIsOpenRef.current = isOpen;
    
    // Réinitialiser après fermeture avec délai
    if (!isOpen) {
      setTimeout(() => {
        settingsLoadedRef.current = false;
      }, 300);
    }
  }, [isOpen]);

  const loadSettings = async () => {
    if (loading) return;
    
    setLoading(true);
    try {
      const savedSettings = await window.electronAPI.getGeneralSettings();
      
      const defaultSettings = {
        fileFormat: 'json',
        filenamePattern: '{date}_{time}_{subject}',
        filenamePatternSent: 'SENT_{date}_{time}_{subject}'
      };
      
      setSettings({ ...defaultSettings, ...savedSettings });
    } catch (error) {
      console.error('Erreur lors du chargement des paramètres:', error);
    } finally {
      setLoading(false);
    }
  };

  // Modules disponibles pour le nommage
  const getAvailableModules = () => [
    // Date et heure
    { 
      category: 'Date et Heure',
      modules: [
        { module: '{date}', description: 'Date (YYYY-MM-DD)', example: '2024-01-15' },
        { module: '{date_fr}', description: 'Date française (DD-MM-YYYY)', example: '15-01-2024' },
        { module: '{date_us}', description: 'Date américaine (MM-DD-YYYY)', example: '01-15-2024' },
        { module: '{year}', description: 'Année', example: '2024' },
        { module: '{month}', description: 'Mois (01-12)', example: '01' },
        { module: '{day}', description: 'Jour (01-31)', example: '15' },
        { module: '{time}', description: 'Heure (HH-MM-SS)', example: '14-30-25' },
        { module: '{time_12}', description: 'Heure 12h (HH-MM-SSAM/PM)', example: '02-30-25PM' },
        { module: '{hour}', description: 'Heure (00-23)', example: '14' },
        { module: '{minute}', description: 'Minutes (00-59)', example: '30' },
        { module: '{second}', description: 'Secondes (00-59)', example: '25' }
      ]
    },
    // Informations du message
    { 
      category: 'Message',
      modules: [
        { module: '{subject}', description: 'Sujet du mail (max 50 chars)', example: 'Reunion_importante' },
        { module: '{subject_short}', description: 'Sujet court (max 20 chars)', example: 'Reunion_import' }
      ]
    },
    // Informations sur les emails
    { 
      category: 'Contacts',
      modules: [
        { module: '{sender_email}', description: 'Email expéditeur/utilisateur', example: 'john_doe_example_com' },
        { module: '{sender_name}', description: 'Nom expéditeur/utilisateur', example: 'John_Doe' },
        { module: '{recipient_email}', description: 'Email destinataire/utilisateur', example: 'jane_smith_example_com' },
        { module: '{recipient_name}', description: 'Nom destinataire/utilisateur', example: 'Jane_Smith' }
      ]
    },
    // Informations techniques
    { 
      category: 'Technique',
      modules: [
        { module: '{message_id}', description: 'ID du message (8 premiers chars)', example: 'abc12345' },
        { module: '{importance}', description: 'Importance du message', example: 'high' },
        { module: '{has_attachments}', description: 'Présence de pièces jointes', example: 'with-attachments' },
        { module: '{timestamp}', description: 'Timestamp Unix', example: '1705334425' },
        { module: '{timestamp_ms}', description: 'Timestamp millisecondes', example: '1705334425123' }
      ]
    },
    // Formats spéciaux
    { 
      category: 'Spéciaux',
      modules: [
        { module: '{week_day}', description: 'Jour de la semaine', example: 'lundi' },
        { module: '{month_name}', description: 'Nom du mois', example: 'janvier' },
        { module: '{quarter}', description: 'Trimestre', example: 'Q1' },
        { module: '{type_prefix}', description: 'Préfixe automatique SENT/RECEIVED', example: 'RECEIVED' },
        { module: '{direction}', description: 'Direction OUT/IN', example: 'IN' }
      ]
    }
  ];

  const insertModule = (module) => {
    const currentPattern = settings[selectedField];
    setSettings(prev => ({
      ...prev,
      [selectedField]: currentPattern + module
    }));
  };

  const getPreviewFilename = (pattern, isSent = false) => {
    if (!pattern || typeof pattern !== 'string') {
      return 'pattern_invalide';
    }

    // Utiliser les paramètres de nettoyage actuels de l'utilisateur
    const cleaningSettings = settings.characterCleaning || {
      enabled: true,
      charactersToClean: {
        '<': true, '>': true, ':': true, '"': true, '/': true, '\\': true, '|': true, '?': true, '*': true,
        '@': false, '#': false, '%': false, '&': false, '+': false, '=': false, '[': false, ']': false,
        '{': false, '}': false, ';': false, ',': false, '!': false, '~': false, '`': false, '$': false, '^': false
      },
      replaceWith: '_'
    };

    // Fonction pour nettoyer le texte selon les paramètres
    const cleanText = (text, maxLength = null) => {
      if (!text) return 'unknown';
      
      let cleaned = text.toString();
      
      // Appliquer le nettoyage seulement si activé
      if (cleaningSettings.enabled) {
        Object.entries(cleaningSettings.charactersToClean).forEach(([char, shouldClean]) => {
          if (shouldClean) {
            const escapedChar = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedChar, 'g');
            cleaned = cleaned.replace(regex, cleaningSettings.replaceWith || '_');
          }
        });
      }
      
      if (maxLength && cleaned.length > maxLength) {
        cleaned = cleaned.substring(0, maxLength);
      }
      
      return cleaned;
    };

    const date = new Date();
    const modules = {
      '{date}': date.toISOString().split('T')[0],
      '{date_fr}': date.toLocaleDateString('fr-FR').replace(/\//g, '-'),
      '{date_us}': date.toLocaleDateString('en-US').replace(/\//g, '-'),
      '{time}': date.toTimeString().split(' ')[0].replace(/:/g, '-'),
      '{time_12}': date.toLocaleTimeString('en-US', { hour12: true }).replace(/:/g, '-').replace(/\s/g, ''),
      '{subject}': cleanText('Reunion@equipe#projet!', 50), // Exemple avec caractères spéciaux
      '{subject_short}': cleanText('Reunion@equipe', 20),
      '{sender_email}': isSent ? cleanText('user@example.com') : cleanText('john.doe@example.com'),
      '{sender_name}': isSent ? 'User' : cleanText('John & Doe'),
      '{recipient_email}': isSent ? cleanText('jane.smith@example.com') : cleanText('user@example.com'),
      '{recipient_name}': isSent ? cleanText('Jane & Smith') : 'User',
      '{year}': date.getFullYear().toString(),
      '{month}': (date.getMonth() + 1).toString().padStart(2, '0'),
      '{day}': date.getDate().toString().padStart(2, '0'),
      '{hour}': date.getHours().toString().padStart(2, '0'),
      '{minute}': date.getMinutes().toString().padStart(2, '0'),
      '{second}': date.getSeconds().toString().padStart(2, '0'),
      '{message_id}': 'abc12345',
      '{importance}': 'normal',
      '{has_attachments}': 'no-attachments',
      '{timestamp}': Math.floor(date.getTime() / 1000).toString(),
      '{timestamp_ms}': date.getTime().toString(),
      '{week_day}': cleanText(date.toLocaleDateString('fr-FR', { weekday: 'long' }).replace(/\s/g, '_')),
      '{month_name}': cleanText(date.toLocaleDateString('fr-FR', { month: 'long' })),
      '{quarter}': 'Q' + Math.ceil((date.getMonth() + 1) / 3),
      '{type_prefix}': isSent ? 'SENT' : 'RECEIVED',
      '{direction}': isSent ? 'OUT' : 'IN'
    };

    let preview = pattern;
    
    Object.entries(modules).forEach(([module, value]) => {
      if (module && typeof module === 'string' && value != null && typeof value === 'string') {
        try {
          const escapedModule = module.replace(/[{}]/g, '\\$&');
          const regex = new RegExp(escapedModule, 'g');
          preview = preview.replace(regex, value);
        } catch (error) {
          console.warn('Erreur lors du remplacement du module:', module, error);
        }
      }
    });

    // Nettoyage final pour les caractères système interdits
    const systemForbiddenChars = /[<>:"/\\|?*\x00-\x1f\x7f]/g;
    preview = preview.replace(systemForbiddenChars, cleaningSettings.replaceWith || '_');

    return preview;
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const currentSettings = await window.electronAPI.getGeneralSettings();
      const updatedSettings = { ...currentSettings, ...settings };
      
      await window.electronAPI.saveGeneralSettings(updatedSettings);
      onSave?.(settings);
      onClose();
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetToDefaults = () => {
    setSettings({
      fileFormat: 'json',
      filenamePattern: '{date}_{time}_{subject}',
      filenamePatternSent: 'SENT_{date}_{time}_{subject}'
    });
  };

  const handleOpenCharacterCleaning = () => {
    const characterCleaningSettings = settings.characterCleaning || {
      enabled: true,
      charactersToClean: {
        '<': true, '>': true, ':': true, '"': true, '/': true, '\\': true, '|': true, '?': true, '*': true,
        '@': false, '#': false, '%': false, '&': false, '+': false, '=': false, '[': false, ']': false,
        '{': false, '}': false, ';': false, ',': false, '!': false, '~': false, '`': false, '$': false, '^': false
      },
      replaceWith: '_'
    };
    
    openCharacterCleaningModal(characterCleaningSettings);
  };

  const handleCharacterCleaningSave = (newCleaningSettings) => {
    setSettings(prev => ({
      ...prev,
      characterCleaning: newCleaningSettings
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] animate-slide-up flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center mr-3">
                <Description className="text-purple-600" style={{ fontSize: 20 }} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Format et nommage des fichiers
                </h3>
                <p className="text-sm text-gray-600">
                  Configurez le format et les modèles de nommage pour vos emails
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
          {/* Left Panel - Configuration */}
          <div className="w-1/2 p-6 border-r border-gray-100 overflow-y-auto">
            <div className="space-y-6">
              {/* Format de fichier */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  <Description className="inline mr-2 text-purple-500" style={{ fontSize: 16 }} />
                  Format de fichier
                </label>
                <select
                  value={settings.fileFormat}
                  onChange={(e) => setSettings(prev => ({ ...prev, fileFormat: e.target.value }))}
                  className="w-full px-3 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                >
                  <option value="json">JSON - Format structuré complet</option>
                  <option value="txt">TXT - Format texte simple</option>
                  <option value="eml">EML - Format email standard</option>
                  <option value="msg">MSG - Format Outlook (limité)</option>
                </select>
                
                <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <p className="text-xs text-purple-800 font-medium">
                    <strong>Format sélectionné :</strong> {(settings.fileFormat || '').toUpperCase()}
                  </p>
                  <p className="text-xs text-purple-600 mt-1">
                    {settings.fileFormat === 'json' && 'Conserve toutes les métadonnées et le formatage'}
                    {settings.fileFormat === 'txt' && 'Format lisible, informations de base uniquement'}
                    {settings.fileFormat === 'eml' && 'Compatible avec la plupart des clients email'}
                    {settings.fileFormat === 'msg' && 'Format Outlook natif (support limité)'}
                  </p>
                </div>
              </div>

              {/* Pattern de nommage pour emails reçus */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  <Inbox className="inline mr-2 text-blue-500" style={{ fontSize: 16 }} />
                  Modèle de nommage - Emails reçus
                </label>
                <div className="space-y-3">
                  <div className="relative">
                    <input
                      type="text"
                      value={settings.filenamePattern}
                      onChange={(e) => setSettings(prev => ({ ...prev, filenamePattern: e.target.value }))}
                      onFocus={() => setSelectedField('filenamePattern')}
                      placeholder="{date}_{time}_{subject}"
                      className={`w-full px-3 py-3 border rounded-lg focus:ring-2 focus:border-transparent text-sm font-mono ${
                        selectedField === 'filenamePattern' 
                          ? 'border-blue-300 focus:ring-blue-500 bg-blue-50' 
                          : 'border-gray-200 focus:ring-gray-500'
                      }`}
                    />
                    {selectedField === 'filenamePattern' && (
                      <div className="absolute -right-1 -top-1 w-3 h-3 bg-blue-500 rounded-full"></div>
                    )}
                  </div>
                  
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-xs text-blue-800 font-medium">Aperçu :</p>
                    <p className="text-xs text-blue-700 font-mono break-all">
                      {getPreviewFilename(settings.filenamePattern, false)}.{settings.fileFormat}
                    </p>
                  </div>
                </div>
              </div>

              {/* Pattern de nommage pour emails envoyés */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  <Send className="inline mr-2 text-green-500" style={{ fontSize: 16 }} />
                  Modèle de nommage - Emails envoyés
                </label>
                <div className="space-y-3">
                  <div className="relative">
                    <input
                      type="text"
                      value={settings.filenamePatternSent}
                      onChange={(e) => setSettings(prev => ({ ...prev, filenamePatternSent: e.target.value }))}
                      onFocus={() => setSelectedField('filenamePatternSent')}
                      placeholder="SENT_{date}_{time}_{subject}"
                      className={`w-full px-3 py-3 border rounded-lg focus:ring-2 focus:border-transparent text-sm font-mono ${
                        selectedField === 'filenamePatternSent' 
                          ? 'border-green-300 focus:ring-green-500 bg-green-50' 
                          : 'border-gray-200 focus:ring-gray-500'
                      }`}
                    />
                    {selectedField === 'filenamePatternSent' && (
                      <div className="absolute -right-1 -top-1 w-3 h-3 bg-green-500 rounded-full"></div>
                    )}
                  </div>
                  
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-xs text-green-800 font-medium">Aperçu :</p>
                    <p className="text-xs text-green-700 font-mono break-all">
                      {getPreviewFilename(settings.filenamePatternSent, true)}.{settings.fileFormat}
                    </p>
                  </div>
                </div>
              </div>

              {/* Boutons de modèles rapides */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  <FileCopy className="inline mr-2 text-gray-500" style={{ fontSize: 16 }} />
                  Modèles rapides
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setSettings(prev => ({ ...prev, [selectedField]: '{date}_{time}_{subject}' }))}
                    className="p-2 text-xs bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors text-left"
                  >
                    <div className="font-medium text-gray-900">Standard</div>
                    <div className="text-gray-600 font-mono">{'{date}_{time}_{subject}'}</div>
                  </button>
                  <button
                    onClick={() => setSettings(prev => ({ ...prev, [selectedField]: '{type_prefix}_{date}_{sender_name}' }))}
                    className="p-2 text-xs bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors text-left"
                  >
                    <div className="font-medium text-gray-900">Par expéditeur</div>
                    <div className="text-gray-600 font-mono">{'{type_prefix}_{date}_{sender_name}'}</div>
                  </button>
                  <button
                    onClick={() => setSettings(prev => ({ ...prev, [selectedField]: '{year}-{month}/{day}_{time}_{subject_short}' }))}
                    className="p-2 text-xs bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors text-left"
                  >
                    <div className="font-medium text-gray-900">Organisé</div>
                    <div className="text-gray-600 font-mono">{'{year}-{month}/{day}_{time}_{subject_short}'}</div>
                  </button>
                  <button
                    onClick={() => setSettings(prev => ({ ...prev, [selectedField]: '{timestamp}_{importance}_{subject}' }))}
                    className="p-2 text-xs bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors text-left"
                  >
                    <div className="font-medium text-gray-900">Technique</div>
                    <div className="text-gray-600 font-mono">{'{timestamp}_{importance}_{subject}'}</div>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - Modules disponibles */}
          <div className="w-1/2 flex flex-col min-h-0">
            <div className="p-6 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-semibold text-gray-900">
                  <Code className="inline mr-2 text-purple-500" style={{ fontSize: 18 }} />
                  Modules disponibles
                </h4>
                <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                  Cliquez pour insérer dans le champ {selectedField === 'filenamePatternSent' ? 'envoyés' : 'reçus'}
                </div>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                Cliquez sur un module pour l'ajouter au modèle sélectionné
              </p>
            </div>

            <div className="flex-1 p-6 overflow-y-auto min-h-0">
              <div className="space-y-6">
                {getAvailableModules().map((category, categoryIndex) => (
                  <div key={categoryIndex}>
                    <h5 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                      <div className="w-2 h-2 bg-purple-500 rounded-full mr-2"></div>
                      {category.category}
                    </h5>
                    <div className="grid grid-cols-1 gap-2">
                      {category.modules.map((item, index) => (
                        <button
                          key={index}
                          onClick={() => insertModule(item.module)}
                          className="text-left p-3 hover:bg-purple-50 border border-gray-200 hover:border-purple-300 rounded-lg transition-all duration-200 group"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-mono text-purple-600 font-semibold group-hover:text-purple-700">
                                {item.module}
                              </p>
                              <p className="text-xs text-gray-600 mt-1">
                                {item.description}
                              </p>
                            </div>
                            <div className="ml-3 text-xs text-gray-400 font-mono bg-gray-100 px-2 py-1 rounded group-hover:bg-purple-100">
                              {item.example}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 flex-shrink-0">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <button
                onClick={resetToDefaults}
                className="py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors inline-flex items-center text-sm"
              >
                <Refresh className="mr-2" style={{ fontSize: 16 }} />
                Réinitialiser
              </button>
              
              {/* Section mise à jour avec le bouton Modifier */}
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Help className="inline" style={{ fontSize: 14 }} />
                <span>Les caractères spéciaux seront automatiquement nettoyés</span>
                <button
                  onClick={handleOpenCharacterCleaning}
                  className="inline-flex items-center px-2 py-1 bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs rounded-md transition-colors"
                >
                  <Edit className="mr-1" style={{ fontSize: 12 }} />
                  Modifier
                </button>
              </div>
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
                onClick={handleSave}
                disabled={loading}
                className="py-2 px-6 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors inline-flex items-center"
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

        {/* Modal de configuration du nettoyage des caractères */}
        <CharacterCleaningModal onSave={handleCharacterCleaningSave} />
      </div>
    </div>
  );
};

export default FileFormatSettings;
