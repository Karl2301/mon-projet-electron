import React, { createContext, useContext, useState, useRef } from 'react';

const FileFormatContext = createContext();

export const useFileFormat = () => {
  const context = useContext(FileFormatContext);
  if (!context) {
    throw new Error('useFileFormat must be used within FileFormatProvider');
  }
  return context;
};

export const FileFormatProvider = ({ children }) => {
  const [isCharacterCleaningModalOpen, setIsCharacterCleaningModalOpen] = useState(false);
  const [characterCleaningSettings, setCharacterCleaningSettings] = useState(null);
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false);
  
  // Référence stable pour éviter les re-renders
  const modalStateRef = useRef({
    isOpen: false,
    settings: null
  });

  const openCharacterCleaningModal = (currentSettings) => {
    modalStateRef.current.isOpen = true;
    modalStateRef.current.settings = currentSettings;
    setCharacterCleaningSettings(currentSettings);
    setIsCharacterCleaningModalOpen(true);
    setHasLoadedSettings(true);
  };

  const closeCharacterCleaningModal = () => {
    modalStateRef.current.isOpen = false;
    modalStateRef.current.settings = null;
    setIsCharacterCleaningModalOpen(false);
    setCharacterCleaningSettings(null);
  };

  const updateCharacterCleaningSettings = (newSettings) => {
    modalStateRef.current.settings = newSettings;
    setCharacterCleaningSettings(newSettings);
  };

  const isModalStable = () => {
    return modalStateRef.current.isOpen;
  };

  return (
    <FileFormatContext.Provider value={{
      isCharacterCleaningModalOpen,
      characterCleaningSettings,
      hasLoadedSettings,
      openCharacterCleaningModal,
      closeCharacterCleaningModal,
      updateCharacterCleaningSettings,
      isModalStable
    }}>
      {children}
    </FileFormatContext.Provider>
  );
};
