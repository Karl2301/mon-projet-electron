import React from 'react';
import ToastNotification from './ToastNotification';

const ToastContainer = ({ notifications, onRemove }) => {
  // Vérification stricte pour éviter les notifications vides
  if (!notifications || !Array.isArray(notifications) || notifications.length === 0) {
    return null;
  }

  // Filtrer les notifications valides et sécuriser les liens
  const validNotifications = notifications.filter(notification => {
    return (
      notification && 
      notification.id && 
      (notification.message || notification.title) && // Au moins un message ou un titre
      notification.message !== '' && // Message non vide
      notification.title !== '' // Titre non vide
    );
  }).map(notification => {
    // Sécuriser le contenu des notifications contre les liens non sécurisés
    const secureNotification = { ...notification };
    
    // Si le message contient des liens, on pourrait les remplacer ici
    // Pour l'instant, on garde le contenu tel quel
    
    return secureNotification;
  });

  // Si aucune notification valide, ne rien afficher
  if (validNotifications.length === 0) {
    return null;
  }

  return (
    <div 
      className="fixed bottom-6 right-6 z-[9999] pointer-events-none"
      style={{ 
        maxHeight: 'calc(100vh - 120px)',
        overflowY: 'auto'
      }}
    >
      <div className="flex flex-col space-y-3 pointer-events-auto">
        {validNotifications.map((notification, index) => (
          <div
            key={notification.id}
            className="animate-slide-in-right"
            style={{
              animationDelay: `${index * 100}ms`,
              animationFillMode: 'both'
            }}
          >
            <ToastNotification
              id={notification.id}
              type={notification.type || 'info'}
              title={notification.title}
              message={notification.message}
              details={notification.details}
              autoDismiss={notification.autoDismiss !== false}
              duration={notification.duration || 5000}
              onClose={() => onRemove(notification.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default ToastContainer;