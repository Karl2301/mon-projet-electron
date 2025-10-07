import React, { useEffect, useState } from 'react';
import { 
  Close, 
  CheckCircle, 
  Error, 
  Warning, 
  Info 
} from '@mui/icons-material';

const ToastNotification = ({ 
  id,
  type = 'info', 
  title, 
  message, 
  details,
  autoDismiss = true, 
  duration = 5000, 
  onClose 
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isLeaving, setIsLeaving] = useState(false);

  // Validation : ne pas afficher si pas de contenu
  if (!message && !title) {
    // Notif vide, bloqué
    return null;
  }

  useEffect(() => {
    if (autoDismiss && duration > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [autoDismiss, duration]);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(() => {
      setIsVisible(false);
      if (onClose) {
        onClose(id);
      }
    }, 300);
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="text-green-500" style={{ fontSize: 20 }} />;
      case 'error':
        return <Error className="text-red-500" style={{ fontSize: 20 }} />;
      case 'warning':
        return <Warning className="text-orange-500" style={{ fontSize: 20 }} />;
      default:
        return <Info className="text-blue-500" style={{ fontSize: 20 }} />;
    }
  };

  const getBackgroundColor = () => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-orange-50 border-orange-200';
      default:
        return 'bg-blue-50 border-blue-200';
    }
  };

  if (!isVisible) return null;

  return (
    <div
      className={`
        relative w-80 border rounded-xl shadow-xl p-4 backdrop-blur-sm
        transform transition-all duration-300 ease-in-out
        ${getBackgroundColor()}
        ${isLeaving 
          ? 'translate-x-full opacity-0 scale-95' 
          : 'translate-x-0 opacity-100 scale-100'
        }
      `}
      style={{
        background: type === 'success' ? 'rgba(240, 253, 244, 0.95)' :
                   type === 'error' ? 'rgba(254, 242, 242, 0.95)' :
                   type === 'warning' ? 'rgba(255, 251, 235, 0.95)' :
                   'rgba(239, 246, 255, 0.95)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0 mt-0.5">
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          {title && title.trim() && (
            <h4 className="text-sm font-semibold text-gray-900 mb-1">
              {title}
            </h4>
          )}
          {message && message.trim() && (
            <p className="text-sm text-gray-700 leading-relaxed">
              {message}
            </p>
          )}
          {details && details.trim() && (
            <p className="text-xs text-gray-600 mt-2 leading-relaxed">
              {details}
            </p>
          )}
        </div>
        <button
          onClick={handleClose}
          className="flex-shrink-0 p-1 hover:bg-gray-200/50 rounded-lg transition-colors duration-200"
        >
          <Close style={{ fontSize: 18 }} className="text-gray-500" />
        </button>
      </div>
    </div>
  );
};

export default ToastNotification;