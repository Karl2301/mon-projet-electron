const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

class EmailSyncDaemon extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.isRunning = false;
    this.syncInterval = options.syncInterval || 30000; // 30 secondes par défaut
    this.intervalId = null;
    this.userDataPath = options.userDataPath || process.cwd(); // Fallback pour le chemin
    this.configPath = options.configPath || path.join(this.userDataPath, 'daemon_config.json');
    this.logPath = options.logPath || path.join(this.userDataPath, 'daemon.log');
    
    // Configuration par défaut
    this.config = {
      enabled: false,
      syncInterval: 30000,
      autoSync: true,
      notifications: true,
      maxRetries: 3,
      retryDelay: 5000
    };
    
    this.loadConfig();
  }

  // Charger la configuration
  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        this.config = { ...this.config, ...JSON.parse(data) };
        this.syncInterval = this.config.syncInterval;
      }
    } catch (error) {
      this.log('Erreur lors du chargement de la configuration:', error.message);
    }
  }

  // Sauvegarder la configuration
  saveConfig() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      this.log('Erreur lors de la sauvegarde de la configuration:', error.message);
    }
  }

  // Logger avec timestamp
  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}\n`;
    
    console.log(logMessage.trim());
    
    try {
      fs.appendFileSync(this.logPath, logMessage);
    } catch (error) {
      console.error('Erreur lors de l\'écriture du log:', error);
    }
  }

  // Démarrer le daemon
  async start() {
    if (this.isRunning) {
      this.log('Le daemon est déjà en cours d\'exécution');
      return;
    }

    if (!this.config.enabled) {
      this.log('Le daemon est désactivé dans la configuration');
      return;
    }

    this.isRunning = true;
    this.log(`Démarrage du daemon (intervalle: ${this.syncInterval}ms)`);

    // Première synchronisation immédiate
    try {
      await this.performSync();
    } catch (error) {
      this.log(`Erreur lors de la synchronisation initiale: ${error.message}`, 'ERROR');
    }

    // Programmer les synchronisations périodiques
    this.intervalId = setInterval(async () => {
      try {
        await this.performSync();
      } catch (error) {
        this.log(`Erreur lors de la synchronisation périodique: ${error.message}`, 'ERROR');
      }
    }, this.syncInterval);

    this.emit('started');
  }

  // Arrêter le daemon
  stop() {
    if (!this.isRunning) {
      this.log('Le daemon n\'est pas en cours d\'exécution');
      return;
    }

    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.log('Arrêt du daemon');
    this.emit('stopped');
  }

  // Effectuer une synchronisation
  async performSync() {
    if (!this.isRunning) return;

    this.log('Début de la synchronisation');
    this.emit('syncStart');

    try {
      // Pour le moment, juste un log de test
      this.log('Synchronisation simulée - tokens et API à implémenter');
      
      this.emit('syncComplete', { 
        totalMessages: 0, 
        processedMessages: 0 
      });

    } catch (error) {
      this.log(`Erreur lors de la synchronisation: ${error.message}`, 'ERROR');
      this.emit('syncError', error);
    }
  }

  // Méthodes de configuration
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();
    
    // Redémarrer avec la nouvelle configuration si nécessaire
    if (this.isRunning && this.config.syncInterval !== this.syncInterval) {
      this.syncInterval = this.config.syncInterval;
      this.stop();
      this.start();
    }
  }

  getConfig() {
    return { ...this.config };
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      config: this.config,
      syncInterval: this.syncInterval,
      logPath: this.logPath
    };
  }
}

module.exports = EmailSyncDaemon;