import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Close,
  Search,
  Clear,
  FilterList,
  History,
  TrendingUp,
  Email,
  Folder,
  Schedule
} from '@mui/icons-material';

const EmailSearch = ({ 
  isOpen, 
  onClose, 
  onSelectMessage,
  onNotification 
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeFilters, setActiveFilters] = useState({
    type: 'all',
    timeRange: 'all',
    hasAttachments: false
  });
  const [searchHistory, setSearchHistory] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [savedEmailsCount, setSavedEmailsCount] = useState(0);
  
  const searchInputRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Charger l'historique et compter les emails sauvegardés
  useEffect(() => {
    if (isOpen) {
      searchInputRef.current?.focus();
      loadSearchHistory();
      loadSavedEmailsCount();
    }
  }, [isOpen]);

  const loadSearchHistory = () => {
    try {
      const history = localStorage.getItem('emailSearchHistory');
      if (history) {
        setSearchHistory(JSON.parse(history));
      }
    } catch (error) {
      console.error('Erreur chargement historique:', error);
    }
  };

  const loadSavedEmailsCount = async () => {
    try {
      const result = await window.electronAPI.getSavedEmailsIndex();
      if (result.success) {
        setSavedEmailsCount(result.emails.length);
      }
    } catch (error) {
      console.error('Erreur chargement index:', error);
    }
  };

  const saveSearchHistory = (newHistory) => {
    try {
      localStorage.setItem('emailSearchHistory', JSON.stringify(newHistory));
      setSearchHistory(newHistory);
    } catch (error) {
      console.error('Erreur sauvegarde historique:', error);
    }
  };

  const addToSearchHistory = (query) => {
    if (!query.trim() || query.length < 2) return;
    
    const newHistory = [
      query.trim(),
      ...searchHistory.filter(item => item !== query.trim())
    ].slice(0, 10);
    
    saveSearchHistory(newHistory);
  };

  // Effectuer la recherche avec debounce
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const result = await window.electronAPI.searchSavedEmails({
          query: searchQuery,
          filters: activeFilters
        });

        if (result.success) {
          setSearchResults(result.results);
        } else {
          setSearchResults([]);
          onNotification?.('error', 'Erreur lors de la recherche', {
            details: result.error
          });
        }
      } catch (error) {
        console.error('Erreur recherche:', error);
        setSearchResults([]);
        onNotification?.('error', 'Erreur lors de la recherche');
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, activeFilters]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      addToSearchHistory(searchQuery);
    }
  };

  const handleSelectResult = (email) => {
    // Reconstruire l'objet message pour compatibilité
    const message = {
      id: email.messageId,
      subject: email.subject,
      bodyPreview: email.bodyPreview,
      receivedDateTime: email.receivedDateTime || email.sentDateTime,
      sentDateTime: email.sentDateTime,
      from: {
        emailAddress: {
          address: email.senderEmail,
          name: email.senderName
        }
      },
      toRecipients: [{
        emailAddress: {
          address: email.recipientEmail,
          name: email.recipientName
        }
      }],
      hasAttachments: email.hasAttachments,
      messageType: email.messageType,
      savedPath: email.savedPath,
      folderPath: email.folderPath
    };
    
    onSelectMessage(message);
    onClose();
  };

  const handleUseHistoryItem = (query) => {
    setSearchQuery(query);
  };

  const clearSearchHistory = () => {
    saveSearchHistory([]);
  };

  const getMessageIcon = (email) => {
    return email.messageType === 'sent' ? 
      <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
        <span className="text-green-600 text-xs">↗</span>
      </div> :
      <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
        <span className="text-blue-600 text-xs">↙</span>
      </div>;
  };

  const getContactInfo = (email) => {
    if (email.messageType === 'sent') {
      return {
        name: email.recipientName,
        email: email.recipientEmail
      };
    } else {
      return {
        name: email.senderName,
        email: email.senderEmail
      };
    }
  };

  const highlightSearchTerm = (text, searchTerm) => {
    if (!searchTerm.trim() || !text) return text;
    
    const words = searchTerm.toLowerCase().split(' ').filter(word => word.length > 0);
    let highlightedText = text;
    
    words.forEach(word => {
      const regex = new RegExp(`(${word})`, 'gi');
      highlightedText = highlightedText.replace(regex, '<mark>$1</mark>');
    });
    
    return highlightedText;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] animate-slide-up flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mr-3">
                <Search className="text-blue-600" style={{ fontSize: 20 }} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Recherche d'emails sauvegardés
                </h3>
                <p className="text-sm text-gray-600">
                  {savedEmailsCount} email{savedEmailsCount !== 1 ? 's' : ''} indexé{savedEmailsCount !== 1 ? 's' : ''} dans l'arborescence
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Close className="text-gray-500" style={{ fontSize: 20 }} />
            </button>
          </div>
        </div>

        {/* Search Form */}
        <div className="p-6 border-b border-gray-100 flex-shrink-0">
          <form onSubmit={handleSearchSubmit} className="space-y-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher par sujet, expéditeur, contenu..."
                className="w-full pl-10 pr-12 py-3 border border-gray-200 rounded-xl bg-white placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  <Clear className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center space-x-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <FilterList style={{ fontSize: 16 }} />
                <span className="text-sm">Filtres</span>
              </button>

              {searchQuery && (
                <div className="text-sm text-gray-600">
                  {isSearching ? (
                    <span className="flex items-center">
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                      Recherche...
                    </span>
                  ) : (
                    <span>
                      {searchResults.length} résultat{searchResults.length !== 1 ? 's' : ''} trouvé{searchResults.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              )}
            </div>

            {showFilters && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Type de message
                    </label>
                    <select
                      value={activeFilters.type}
                      onChange={(e) => setActiveFilters(prev => ({ ...prev, type: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="all">Tous les messages</option>
                      <option value="received">Messages reçus</option>
                      <option value="sent">Messages envoyés</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Période
                    </label>
                    <select
                      value={activeFilters.timeRange}
                      onChange={(e) => setActiveFilters(prev => ({ ...prev, timeRange: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="all">Toute période</option>
                      <option value="today">Aujourd'hui</option>
                      <option value="week">Cette semaine</option>
                      <option value="month">Ce mois</option>
                    </select>
                  </div>

                  <div className="flex items-end">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={activeFilters.hasAttachments}
                        onChange={(e) => setActiveFilters(prev => ({ ...prev, hasAttachments: e.target.checked }))}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                      />
                      <span className="text-sm text-gray-700">Avec pièces jointes</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {!searchQuery ? (
            <div className="p-6">
              {searchHistory.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-medium text-gray-900 flex items-center">
                      <History className="mr-2" style={{ fontSize: 16 }} />
                      Recherches récentes
                    </h4>
                    <button
                      onClick={clearSearchHistory}
                      className="text-xs text-gray-500 hover:text-red-600 transition-colors"
                    >
                      Effacer l'historique
                    </button>
                  </div>
                  <div className="space-y-2">
                    {searchHistory.map((query, index) => (
                      <button
                        key={index}
                        onClick={() => handleUseHistoryItem(query)}
                        className="flex items-center w-full text-left px-3 py-2 hover:bg-gray-50 rounded-lg transition-colors"
                      >
                        <TrendingUp className="text-gray-400 mr-3" style={{ fontSize: 16 }} />
                        <span className="text-sm text-gray-700">{query}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Search className="text-gray-300 mx-auto mb-4" style={{ fontSize: 48 }} />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Recherchez dans vos emails sauvegardés
                  </h3>
                  <p className="text-gray-600">
                    Seuls les emails enregistrés dans l'arborescence sont recherchés
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-y-auto h-full">
              {searchResults.length === 0 && !isSearching ? (
                <div className="text-center py-12">
                  <Email className="text-gray-300 mx-auto mb-4" style={{ fontSize: 48 }} />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Aucun résultat trouvé
                  </h3>
                  <p className="text-gray-600">
                    Aucun email sauvegardé ne correspond à votre recherche
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {searchResults.map((email, index) => {
                    const contact = getContactInfo(email);
                    return (
                      <button
                        key={index}
                        onClick={() => handleSelectResult(email)}
                        className="w-full p-4 hover:bg-blue-25 transition-colors text-left"
                      >
                        <div className="flex items-start space-x-3">
                          {getMessageIcon(email)}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <h4 
                                className="font-medium text-gray-900 truncate"
                                dangerouslySetInnerHTML={{ __html: highlightSearchTerm(contact.name, searchQuery) }}
                              />
                              <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                                {new Date(email.receivedDateTime || email.sentDateTime).toLocaleDateString('fr-FR')}
                              </span>
                            </div>
                            <p 
                              className="text-sm text-gray-600 mb-1"
                              dangerouslySetInnerHTML={{ __html: highlightSearchTerm(email.subject, searchQuery) }}
                            />
                            <p 
                              className="text-sm text-gray-500 line-clamp-2 mb-2"
                              dangerouslySetInnerHTML={{ __html: highlightSearchTerm(email.bodyPreview, searchQuery) }}
                            />
                            <div className="flex items-center space-x-2 text-xs text-gray-500">
                              <Folder style={{ fontSize: 14 }} />
                              <span className="truncate">{email.clientName || 'Dossier client'}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailSearch;