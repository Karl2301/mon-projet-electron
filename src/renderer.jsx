import React, { useState, createContext, useContext, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { theme } from './theme';
import LoginPage from './LoginPage';
import MainPage from './MainPage';
import PricingPage from './PricingPage';
import { FileFormatProvider } from './contexts/FileFormatContext'; // NOUVEAU

// Context pour gérer les états globaux
const AppStateContext = createContext();

export const useAppState = () => {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return context;
};

const AppStateProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [tokens, setTokens] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Pagination states
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [nextPageUrl, setNextPageUrl] = useState(null);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);

  // Charger les états persistants au démarrage
  useEffect(() => {
    const initializeAppState = async () => {
      try {
        // Charger les tokens sauvegardés
        const savedTokens = await window.electronAPI?.loadTokens();
        if (savedTokens) {
          setTokens(savedTokens);
          setIsConnected(true);
          
          // Simuler les données utilisateur basées sur les tokens
          setUser({
            email: 'user@outlook.com', // Vous pouvez récupérer cela via Graph API
            name: 'Utilisateur',
            isAuthenticated: true
          });
        }

        // Charger le dernier temps de sync depuis localStorage
        const lastSync = localStorage.getItem('lastSyncTime');
        if (lastSync) {
          setLastSyncTime(new Date(lastSync));
        }

        // Charger les messages mis en cache
        const cachedMessages = localStorage.getItem('cachedMessages');
        if (cachedMessages) {
          setMessages(JSON.parse(cachedMessages));
        }

        setIsInitialized(true);
      } catch (error) {
        console.error('Error initializing app state:', error);
        setIsInitialized(true);
      }
    };

    initializeAppState();
  }, []);

  // Sauvegarder les états importants
  useEffect(() => {
    if (lastSyncTime) {
      localStorage.setItem('lastSyncTime', lastSyncTime.toISOString());
    }
  }, [lastSyncTime]);

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('cachedMessages', JSON.stringify(messages));
    }
  }, [messages]);

  const handleLogin = (userData, tokenData) => {
    setUser(userData);
    setTokens(tokenData);
    setIsConnected(true);
  };

  const handleLogout = async () => {
    try {
      await window.electronAPI?.deleteTokens();
      setUser(null);
      setTokens(null);
      setIsConnected(false);
      setMessages([]);
      setLastSyncTime(null);
      setSyncInProgress(false);
      
      // Nettoyer le cache
      localStorage.removeItem('lastSyncTime');
      localStorage.removeItem('cachedMessages');
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  const updateMessages = (newMessages, isLoadMore = false, nextUrl = null, hasMore = true) => {
    if (isLoadMore) {
      // Ajouter les nouveaux messages à la liste existante
      setMessages(prevMessages => [...prevMessages, ...newMessages]);
    } else {
      // Remplacer complètement la liste (nouveau chargement)
      setMessages(newMessages);
    }
    
    setNextPageUrl(nextUrl);
    setHasMoreMessages(hasMore);
    setLastSyncTime(new Date());
  };

  const loadMoreMessages = async () => {
    if (!hasMoreMessages || loadingMoreMessages || !tokens) {
      return;
    }

    setLoadingMoreMessages(true);
    
    try {
      let params = {
        accessToken: tokens.access_token,
        top: 25
      };

      // Si on a une URL de page suivante, l'utiliser
      if (nextPageUrl) {
        params.nextUrl = nextPageUrl;
      } else {
        // Sinon, utiliser le skip basé sur le nombre de messages actuels
        params.skip = messages.length;
      }

      const result = await window.electronAPI?.getMessagesWithPagination(params);
      
      if (result && result.value) {
        const hasMore = !!(result['@odata.nextLink']);
        const nextUrl = result['@odata.nextLink'] || null;
        
        updateMessages(result.value, true, nextUrl, hasMore);
      }
    } catch (error) {
      console.error('Error loading more messages:', error);
    } finally {
      setLoadingMoreMessages(false);
    }
  };

  const refreshMessages = async () => {
    if (!tokens || syncInProgress) {
      return;
    }

    setSyncInProgress(true);
    
    try {
      const result = await window.electronAPI?.getMessagesWithCache({
        accessToken: tokens.access_token,
        top: 25,
        useCache: false
      });
      
      if (result && result.value) {
        const hasMore = !!(result['@odata.nextLink']);
        const nextUrl = result['@odata.nextLink'] || null;
        
        updateMessages(result.value, false, nextUrl, hasMore);
      }
    } catch (error) {
      console.error('Error refreshing messages:', error);
    } finally {
      setSyncInProgress(false);
    }
  };

  const value = {
    user,
    tokens,
    isConnected,
    lastSyncTime,
    syncInProgress,
    messages,
    isInitialized,
    hasMoreMessages,
    loadingMoreMessages,
    setUser,
    setTokens,
    setIsConnected,
    setLastSyncTime,
    setSyncInProgress,
    setMessages: updateMessages,
    loadMoreMessages,
    refreshMessages,
    handleLogin,
    handleLogout
  };

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
};

const App = () => {
  const [currentPage, setCurrentPage] = useState('main'); // 'main' | 'pricing'
  const [selectedPlan, setSelectedPlan] = useState(null);
  const { user, isInitialized, handleLogin, handleLogout } = useAppState();

  const handleShowPricing = () => {
    setCurrentPage('pricing');
  };

  const handleSelectPlan = (plan) => {
    setSelectedPlan(plan);
    alert(`Plan "${plan.name}" sélectionné pour ${plan.price}€${plan.period}`);
    setCurrentPage('main');
  };

  const handleBackToMain = () => {
    setCurrentPage('main');
  };

  // Attendre l'initialisation avant de rendre l'interface
  if (!isInitialized) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
            <p className="text-gray-600">Chargement...</p>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {!user ? (
        <LoginPage onLogin={handleLogin} />
      ) : currentPage === 'pricing' ? (
        <PricingPage 
          onSelectPlan={handleSelectPlan} 
          onBack={handleBackToMain} 
        />
      ) : (
        <MainPage 
          user={user} 
          onLogout={handleLogout} 
          onShowPricing={handleShowPricing}
        />
      )}
    </ThemeProvider>
  );
};

const AppWithProvider = () => (
  <AppStateProvider>
    <FileFormatProvider>
      <App />
    </FileFormatProvider>
  </AppStateProvider>
);

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<AppWithProvider />);