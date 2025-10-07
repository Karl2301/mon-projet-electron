import { useState, useCallback } from 'react';

const useNotifications = () => {
  const [notifications, setNotifications] = useState([]);

  const addNotification = useCallback((type, message, options = {}) => {
    // Validation stricte : ne pas ajouter si le message est vide
    if (!message || message.trim() === '') {
      console.warn('Tentative d\'ajout d\'une notification avec un message vide:', { type, message, options });
      return null;
    }

    const notification = {
      id: Date.now() + Math.random(),
      type,
      message: message.trim(),
      title: options.title?.trim() || undefined,
      details: options.details?.trim() || undefined,
      autoDismiss: options.autoDismiss !== false,
      duration: options.duration || 5000,
      ...options
    };

    setNotifications(prev => [...prev, notification]);
    return notification.id;
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  const success = useCallback((message, options = {}) => {
    console.log('✅ SUCCESS notification called:', { message, options });
    if (!message || message.trim() === '') {
      console.warn('❌ SUCCESS notification avec message vide bloquée');
      return null;
    }
    return addNotification('success', message, options);
  }, [addNotification]);

  const error = useCallback((message, options = {}) => {
    console.log('❌ ERROR notification called:', { message, options });
    if (!message || message.trim() === '') {
      console.warn('❌ ERROR notification avec message vide bloquée');
      return null;
    }
    return addNotification('error', message, options);
  }, [addNotification]);

  const warning = useCallback((message, options) => {
    if (!message || message.trim() === '') return null;
    return addNotification('warning', message, options);
  }, [addNotification]);

  const info = useCallback((message, options = {}) => {
    // Debug plus détaillé
    console.log('🔍 INFO notification called:', { 
      message, 
      options,
      stack: new Error().stack?.split('\n')[2] // Voir d'où vient l'appel
    });
    
    if (!message || message.trim() === '') {
      console.warn('❌ INFO notification avec message vide bloquée');
      console.warn('Stack trace:', new Error().stack);
      return null;
    }
    return addNotification('info', message, options);
  }, [addNotification]);

  return {
    notifications,
    removeNotification,
    success,
    error,
    warning,
    info
  };
};

export default useNotifications;