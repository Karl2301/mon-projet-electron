const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');

class EmailSyncDaemon extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.userDataPath = options.userDataPath || '';
    this.isRunning = false;
    this.syncInterval = null;
    
    // Configuration par défaut
    this.config = {
      syncIntervalMinutes: 5,
      autoStart: false,
      maxRetries: 3,
      enabled: true
    };
    
    // Chemin du fichier de configuration
    this.configPath = path.join(this.userDataPath, 'daemon_config.json');
    
    // Charger la configuration si elle existe
    this.loadConfig();
    
    console.log('📡 EmailSyncDaemon initialisé');
  }
  
  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        this.config = { ...this.config, ...JSON.parse(configData) };
      }
    } catch (error) {
      console.error('Erreur lors du chargement de la configuration du daemon:', error);
    }
  }
  
  saveConfig() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de la configuration du daemon:', error);
    }
  }
  
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();
    
    // Redémarrer le daemon si l'intervalle a changé et qu'il est en cours d'exécution
    if (this.isRunning && newConfig.syncIntervalMinutes) {
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
      config: this.getConfig(),
      lastSync: this.lastSync || null,
      nextSync: this.nextSync || null
    };
  }
  
  async start() {
    if (this.isRunning) {
      console.log('📡 Daemon déjà en cours d\'exécution');
      return;
    }
    
    if (!this.config.enabled) {
      console.log('📡 Daemon désactivé dans la configuration');
      return;
    }
    
    this.isRunning = true;
    
    // Programmer la synchronisation périodique
    this.syncInterval = setInterval(() => {
      this.performSync().catch(error => {
        this.emit('syncError', error);
      });
    }, this.config.syncIntervalMinutes * 60 * 1000);
    
    this.nextSync = new Date(Date.now() + this.config.syncIntervalMinutes * 60 * 1000);
    
    this.emit('started');
    console.log(`📡 Daemon démarré (synchronisation toutes les ${this.config.syncIntervalMinutes} minutes)`);
  }
  
  stop() {
    if (!this.isRunning) {
      console.log('📡 Daemon déjà arrêté');
      return;
    }
    
    this.isRunning = false;
    
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    
    this.nextSync = null;
    
    this.emit('stopped');
    console.log('📡 Daemon arrêté');
  }
  
  async performSync() {
    if (!this.isRunning) {
      return;
    }
    
    try {
      this.lastSync = new Date();
      this.nextSync = new Date(Date.now() + this.config.syncIntervalMinutes * 60 * 1000);
      
      console.log('📡 Début de la synchronisation...');
      
      // TODO: Implémenter la logique de synchronisation des emails
      // Pour l'instant, c'est juste un placeholder
      const stats = {
        processedMessages: 0,
        newSenders: 0,
        errors: 0
      };
      
      // Simuler un délai de traitement
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      this.emit('syncComplete', stats);
      console.log('📡 Synchronisation terminée');
      
    } catch (error) {
      console.error('📡 Erreur lors de la synchronisation:', error);
      this.emit('syncError', error);
    }
  }
}

module.exports = EmailSyncDaemon;
