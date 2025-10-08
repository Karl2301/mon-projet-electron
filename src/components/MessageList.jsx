import React, { useState } from 'react';
import SaveEmailModal from './SaveEmailModal';

const MessageList = ({ messages, onMessageAction }) => {
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [selectedMessageToSave, setSelectedMessageToSave] = useState(null);

  const handleSaveMessage = (message) => {
    setSelectedMessageToSave(message);
    setSaveModalOpen(true);
  };

  const handleSaveComplete = (result) => {
    if (result.success) {
      console.log('Message sauvegardé avec succès:', result);
      // Notifier le composant parent si nécessaire
      onMessageAction?.('save_success', result);
    }
    setSaveModalOpen(false);
    setSelectedMessageToSave(null);
  };

  const handleCloseSaveModal = () => {
    setSaveModalOpen(false);
    setSelectedMessageToSave(null);
  };

  return (
    <div className="message-list">
      {messages.map((message, index) => (
        <div key={message.id || index} className="message-item card p-4 mb-4">
          {/* ...existing message content... */}
          
          <div className="flex justify-between items-start">
            <div className="flex-1">
              {/* Message header */}
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-gray-900">
                  {message.from?.emailAddress?.name || 'Expéditeur inconnu'}
                </h3>
                <span className="text-xs text-gray-500">
                  {new Date(message.receivedDateTime).toLocaleDateString('fr-FR')}
                </span>
              </div>
              
              {/* Message subject */}
              <p className="text-sm text-gray-600 mb-2">
                {message.subject || 'Sans sujet'}
              </p>
              
              {/* Message preview */}
              <p className="text-sm text-gray-500 line-clamp-2">
                {message.bodyPreview}
              </p>
            </div>
            
            {/* Action buttons */}
            <div className="flex space-x-2 ml-4">
              <button 
                className="p-2 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors" 
                title="Sauvegarder le message"
                onClick={() => handleSaveMessage(message)}
              >
                <svg 
                  className="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium text-blue-600" 
                  focusable="false" 
                  aria-hidden="true" 
                  viewBox="0 0 24 24" 
                  style={{fontSize: '18px'}}
                >
                  <path d="M5 20h14v-2H5zM19 9h-4V3H9v6H5l7 7z"></path>
                </svg>
              </button>
              
              {/* Autres boutons d'action si nécessaire */}
            </div>
          </div>
        </div>
      ))}
      
      {/* Modal de sauvegarde */}
      <SaveEmailModal
        isOpen={saveModalOpen}
        onClose={handleCloseSaveModal}
        message={selectedMessageToSave}
        onSave={handleSaveComplete}
      />
    </div>
  );
};

export default MessageList;
