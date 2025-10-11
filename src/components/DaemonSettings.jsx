import React, { useState, useEffect } from 'react';
import {
  CloudSync,
  SyncDisabled,
  PlayArrow,
  Stop,
  Refresh,
  Settings,
  Warning,
  CheckCircle,
  Error as ErrorIcon
} from '@mui/icons-material';

const DaemonSettings = ({ isOpen, onClose, onNotification }) => {
  const [daemonStatus, setDaemonStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState({
    syncIntervalMinutes: 5,
    autoStart: false,
    maxRetries: 3,
    enabled: true
  });
  const [isDaemonAvailable, setIsDaemonAvailable] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadDaemonStatus();
      loadDaemonConfig();
    }
  }, [isOpen]);

  const loadDaemonStatus = async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.daemonStatus();
      
      if (result.success) {
        setDaemonStatus(result.status);
        setIsDaemonAvailable(true);
      } else {
        setIsDaemonAvailable(false);
        onNotification('warning', 'Service d\'arrière-plan non disponible', {
          title: 'Daemon indisponible',
          details: result.error || 'Le service d\'arrière-plan n\'est pas configuré'
        });
      }
    } catch (error) {
      console.error('Erreur lors du chargement du statut du daemon:', error);
      setIsDaemonAvailable(false);
      onNotification('error', 'Erreur lors du chargement du statut', {
        title: 'Erreur',
        details: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const loadDaemonConfig = async () => {
    try {
      const result = await window.electronAPI.daemonConfig();
      
      if (result.success && result.config) {
        setConfig(result.config);
      }
    } catch (error) {
      console.error('Erreur lors du chargement de la configuration:', error);
    }
  };

  const handleStart = async () => {
    if (!isDaemonAvailable) {
      onNotification('error', 'Service non disponible', {
        title: 'Daemon indisponible'
      });
      return;
    }

    try {
      setLoading(true);
      const result = await window.electronAPI.daemonStart();
      
      if (result.success) {
        onNotification('success', 'Service d\'arrière-plan démarré', {
          title: 'Daemon activé'
        });
        await loadDaemonStatus();
      } else {
        onNotification('error', 'Erreur lors du démarrage', {
          title: 'Erreur',
          details: result.error
        });
      }
    } catch (error) {
      onNotification('error', 'Erreur lors du démarrage', {
        title: 'Erreur',
        details: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    if (!isDaemonAvailable) {
      onNotification('error', 'Service non disponible', {
        title: 'Daemon indisponible'
      });
      return;
    }

    try {
      setLoading(true);
      const result = await window.electronAPI.daemonStop();
      
      if (result.success) {
        onNotification('success', 'Service d\'arrière-plan arrêté', {
          title: 'Daemon désactivé'
        });
        await loadDaemonStatus();
      } else {
        onNotification('error', 'Erreur lors de l\'arrêt', {
          title: 'Erreur',
          details: result.error
        });
      }
    } catch (error) {
      onNotification('error', 'Erreur lors de l\'arrêt', {
        title: 'Erreur',
        details: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSyncNow = async () => {
    if (!isDaemonAvailable) {
      onNotification('error', 'Service non disponible', {
        title: 'Daemon indisponible'
      });
      return;
    }

    try {
      setLoading(true);
      const result = await window.electronAPI.daemonSyncNow();
      
      if (result.success) {
        onNotification('success', 'Synchronisation manuelle démarrée', {
          title: 'Synchronisation'
        });
      } else {
        onNotification('error', 'Erreur lors de la synchronisation', {
          title: 'Erreur',
          details: result.error
        });
      }
    } catch (error) {
      onNotification('error', 'Erreur lors de la synchronisation', {
        title: 'Erreur',
        details: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConfigUpdate = async () => {
    if (!isDaemonAvailable) {
      onNotification('error', 'Service non disponible', {
        title: 'Daemon indisponible'
      });
      return;
    }

    try {
      setLoading(true);
      const result = await window.electronAPI.daemonConfig(config);
      
      if (result.success) {
        onNotification('success', 'Configuration mise à jour', {
          title: 'Configuration sauvegardée'
        });
        await loadDaemonStatus();
      } else {
        onNotification('error', 'Erreur lors de la mise à jour', {
          title: 'Erreur',
          details: result.error
        });
      }
    } catch (error) {
      onNotification('error', 'Erreur lors de la mise à jour', {
        title: 'Erreur',
        details: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = () => {
    if (!isDaemonAvailable) return 'text-gray-500';
    if (!daemonStatus) return 'text-gray-500';
    return daemonStatus.isRunning ? 'text-green-500' : 'text-red-500';
  };

  const getStatusIcon = () => {
    if (!isDaemonAvailable) return <SyncDisabled className="text-gray-500" />;
    if (!daemonStatus) return <SyncDisabled className="text-gray-500" />;
    return daemonStatus.isRunning ? <CheckCircle className="text-green-500" /> : <ErrorIcon className="text-red-500" />;
  };

  const getStatusText = () => {
    if (!isDaemonAvailable) return 'Non disponible';
    if (!daemonStatus) return 'Statut inconnu';
    return daemonStatus.isRunning ? 'Actif' : 'Arrêté';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center">
              <CloudSync className="mr-2" />
              Service d'arrière-plan
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl font-light"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Status Section */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              {getStatusIcon()}
              <span className="ml-2">Statut du service</span>
            </h3>
            
            {!isDaemonAvailable ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start">
                  <Warning className="text-yellow-600 mr-2 mt-0.5" style={{ fontSize: 18 }} />
                  <div>
                    <h4 className="font-medium text-yellow-800">Service non disponible</h4>
                    <p className="text-sm text-yellow-700 mt-1">
                      Le service d'arrière-plan n'est pas configuré ou disponible sur cette installation.
                      Les fonctionnalités de synchronisation automatique sont limitées.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">État</p>
                  <p className={`font-medium ${getStatusColor()}`}>
                    {getStatusText()}
                  </p>
                </div>
                {daemonStatus && (
                  <>
                    <div>
                      <p className="text-sm text-gray-600">Dernière sync</p>
                      <p className="font-medium text-gray-900">
                        {daemonStatus.lastSync ? new Date(daemonStatus.lastSync).toLocaleString('fr-FR') : 'Jamais'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Prochaine sync</p>
                      <p className="font-medium text-gray-900">
                        {daemonStatus.nextSync ? new Date(daemonStatus.nextSync).toLocaleString('fr-FR') : 'Non programmée'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Intervalle</p>
                      <p className="font-medium text-gray-900">
                        {daemonStatus.config?.syncIntervalMinutes || 5} minutes
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Controls Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Contrôles</h3>
            
            <div className="flex space-x-3">
              <button
                onClick={handleStart}
                disabled={loading || !isDaemonAvailable || (daemonStatus?.isRunning)}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors flex items-center"
              >
                <PlayArrow className="mr-1" style={{ fontSize: 18 }} />
                Démarrer
              </button>
              
              <button
                onClick={handleStop}
                disabled={loading || !isDaemonAvailable || (!daemonStatus?.isRunning)}
                className="bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors flex items-center"
              >
                <Stop className="mr-1" style={{ fontSize: 18 }} />
                Arrêter
              </button>
              
              <button
                onClick={handleSyncNow}
                disabled={loading || !isDaemonAvailable || (!daemonStatus?.isRunning)}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors flex items-center"
              >
                <Refresh className="mr-1" style={{ fontSize: 18 }} />
                Synchroniser maintenant
              </button>
              
              <button
                onClick={loadDaemonStatus}
                disabled={loading}
                className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors flex items-center"
              >
                <Refresh className={`mr-1 ${loading ? 'animate-spin' : ''}`} style={{ fontSize: 18 }} />
                Actualiser
              </button>
            </div>
          </div>

          {/* Configuration Section */}
          {isDaemonAvailable && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900 flex items-center">
                <Settings className="mr-2" />
                Configuration
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Intervalle de synchronisation (minutes)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={config.syncIntervalMinutes}
                    onChange={(e) => setConfig(prev => ({ ...prev, syncIntervalMinutes: parseInt(e.target.value) || 5 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre max de tentatives
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={config.maxRetries}
                    onChange={(e) => setConfig(prev => ({ ...prev, maxRetries: parseInt(e.target.value) || 3 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={config.autoStart}
                    onChange={(e) => setConfig(prev => ({ ...prev, autoStart: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Démarrage automatique
                  </span>
                </label>
                
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(e) => setConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Service activé
                  </span>
                </label>
              </div>
              
              <button
                onClick={handleConfigUpdate}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg transition-colors"
              >
                Sauvegarder la configuration
              </button>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg transition-colors"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DaemonSettings;