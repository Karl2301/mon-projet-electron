import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  Error, 
  Warning, 
  Info, 
  Close 
} from '@mui/icons-material';

const ToastNotification = ({ notifications, onRemove }) => {
  const getIcon = (type) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="text-green-500" style={{ fontSize: 20 }} />;
      case 'error':
        return <Error className="text-red-500" style={{ fontSize: 20 }} />;
      case 'warning':
        return <Warning className="text-amber-500" style={{ fontSize: 20 }} />;
      default:
        return <Info className="text-blue-500" style={{ fontSize: 20 }} />;
    }
  };

  const getBackgroundColor = (type) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-amber-50 border-amber-200';
      default:
        return 'bg-blue-50 border-blue-200';
    }
  };

  const getTextColor = (type) => {
    switch (type) {
      case 'success':
        return 'text-green-800';
      case 'error':
        return 'text-red-800';
      case 'warning':
        return 'text-amber-800';
      default:
        return 'text-blue-800';
    }
  };

  return (
    <div className="fixed top-20 right-6 z-50 space-y-3 max-w-sm">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`
            ${getBackgroundColor(notification.type)} 
            ${getTextColor(notification.type)}
            border rounded-xl p-4 shadow-lg backdrop-blur-sm
            transform transition-all duration-300 ease-in-out
            animate-slide-in-right
          `}
        >
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 mt-0.5">
              {getIcon(notification.type)}
            </div>
            <div className="flex-1 min-w-0">
              {notification.title && (
                <p className="font-semibold text-sm mb-1">
                  {notification.title}
                </p>
              )}
              <p className="text-sm leading-relaxed">
                {notification.message}
              </p>
              {notification.details && (
                <p className="text-xs mt-2 opacity-75 font-mono break-all">
                  {notification.details}
                </p>
              )}
            </div>
            <button
              onClick={() => onRemove(notification.id)}
              className="flex-shrink-0 p-1 hover:bg-black/10 rounded-lg transition-colors"
            >
              <Close style={{ fontSize: 16 }} className="opacity-60" />
            </button>
          </div>
          
          {/* Barre de progression pour l'auto-dismiss */}
          {notification.autoDismiss && (
            <div className="mt-3 w-full bg-black/10 rounded-full h-1">
              <div 
                className={`h-1 rounded-full transition-all duration-${notification.duration}ms ease-linear ${
                  notification.type === 'success' ? 'bg-green-500' :
                  notification.type === 'error' ? 'bg-red-500' :
                  notification.type === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
                }`}
                style={{
                  width: '100%',
                  animation: `shrink ${notification.duration}ms linear forwards`
                }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ToastNotification;