import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Close,
  Email,
  Person,
  FilterList,
  Clear,
  History,
  TrendingUp
} from '@mui/icons-material';

const EmailSearch = ({ 
  isOpen, 
  onClose, 
  messages = [], 
  sentMessages = [], 
  onSelectMessage,
  onNotification 
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeFilters, setActiveFilters] = useState({
    type: 'all', // 'all', 'received', 'sent'
    timeRange: 'all', // 'all', 'today', 'week', 'month'
    hasAttachments: false
  });
  const [searchHistory, setSearchHistory] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  
  const searchInputRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Charger l'historique de recherche depuis localStorage
  useEffect(() => {
    if (isOpen) {
      const savedHistory = localStorage.getItem('emailSearchHistory');
      if (savedHistory) {
        try {
          setSearchHistory(JSON.parse(savedHistory));
        } catch (error) {
          console.error('Erreur lors du chargement de l\'historique:', error);
        }
      }
      // Focus automatique sur l'input
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Sauvegarder l'historique de recherche
  const saveSearchHistory = (newHistory) => {
    try {
      localStorage.setItem('emailSearchHistory', JSON.stringify(newHistory));
      setSearchHistory(newHistory);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de l\'historique:', error);
    }
  };

  // Ajouter une recherche à l'historique
  const addToSearchHistory = (query) => {
    if (!query.trim() || query.length < 2) return;
    
    const newHistory = [
      query.trim(),
      ...searchHistory.filter(item => item !== query.trim())
    ].slice(0, 10); // Garder seulement les 10 dernières recherches
    
    saveSearchHistory(newHistory);
  };

  // Combiner tous les messages pour la recherche
  const allMessages = useMemo(() => {
    const received = messages.map(msg => ({ ...msg, messageType: 'received' }));
    const sent = sentMessages.map(msg => ({ ...msg, messageType: 'sent' }));
    return [...received, ...sent];
  }, [messages, sentMessages]);

  // Fonction de recherche optimisée
  const searchMessages = useMemo(() => {
    return (query, filters) => {
      if (!query.trim()) return [];

      const searchTerm = query.toLowerCase().trim();
      const now = new Date();
      
      return allMessages.filter(message => {
        // Filtrer par type de message
        if (filters.type !== 'all' && message.messageType !== filters.type) {
          return false;
        }

        // Filtrer par plage de temps
        if (filters.timeRange !== 'all') {
          const messageDate = new Date(message.receivedDateTime || message.sentDateTime);
          const daysDiff = Math.floor((now - messageDate) / (1000 * 60 * 60 * 24));
          
          switch (filters.timeRange) {
            case 'today':
              if (daysDiff > 0) return false;
              break;
            case 'week':
              if (daysDiff > 7) return false;
              break;
            case 'month':
              if (daysDiff > 30) return false;
              break;
          }
        }

        // Filtrer par pièces jointes
        if (filters.hasAttachments && !message.hasAttachments) {
          return false;
        }

        // Recherche dans le contenu
        const searchableContent = [
          message.subject || '',
          message.bodyPreview || '',
          message.from?.emailAddress?.name || '',
          message.from?.emailAddress?.address || '',
          ...(message.toRecipients || []).map(recipient => 
            `${recipient.emailAddress?.name || ''} ${recipient.emailAddress?.address || ''}`
          ),
          ...(message.ccRecipients || []).map(recipient => 
            `${recipient.emailAddress?.name || ''} ${recipient.emailAddress?.address || ''}`
          )
        ].join(' ').toLowerCase();

        // Recherche avec support des mots multiples
        const searchWords = searchTerm.split(' ').filter(word => word.length > 0);
        return searchWords.every(word => searchableContent.includes(word));
      }).sort((a, b) => {
        // Trier par pertinence et date
        const dateA = new Date(a.receivedDateTime || a.sentDateTime);
        const dateB = new Date(b.receivedDateTime || b.sentDateTime);
        return dateB - dateA;
      });
    };
  }, [allMessages]);

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

    searchTimeoutRef.current = setTimeout(() => {
      const results = searchMessages(searchQuery, activeFilters);
      setSearchResults(results);
      setIsSearching(false);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, activeFilters, searchMessages]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      addToSearchHistory(searchQuery);
    }
  };

  const handleSelectResult = (message) => {
    onSelectMessage(message);
    onClose();
  };

  const handleUseHistoryItem = (query) => {
    setSearchQuery(query);
  };

  const clearSearchHistory = () => {
    saveSearchHistory([]);
  };

  const getMessageIcon = (message) => {
    return message.messageType === 'sent' ? 
      <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
        <span className="text-green-600 text-xs">↗</span>
      </div> :
      <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
        <span className="text-blue-600 text-xs">↙</span>
      </div>;
  };

  const getContactInfo = (message) => {
    if (message.messageType === 'sent') {
      const recipient = message.toRecipients?.[0];
      return {
        name: recipient?.emailAddress?.name || 'Destinataire inconnu',
        email: recipient?.emailAddress?.address || ''
      };
    } else {
      return {
        name: message.from?.emailAddress?.name || 'Expéditeur inconnu',
        email: message.from?.emailAddress?.address || ''
      };
    }
  };

  const highlightSearchTerm = (text, searchTerm) => {
    if (!searchTerm.trim() || !text) return text;
    
    const words = searchTerm.toLowerCase().split(' ').filter(word => word.length > 0);
    let highlightedText = text;
    
    words.forEach(word => {
      const regex = new RegExp(`(${word})`, 'gi');
      highlightedText = highlightedText.replace(regex, '<mark class="bg-yellow-200 px-1 rounded">$1</mark>');
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
                  Recherche d'emails
                </h3>
                <p className="text-sm text-gray-600">
                  Recherchez dans vos messages reçus et envoyés
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
            {/* Search Input */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher par sujet, expéditeur, contenu ou adresse email..."
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

            {/* Filters */}
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

            {/* Advanced Filters */}
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
            /* Search History */
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
                    Recherchez dans vos emails
                  </h3>
                  <p className="text-gray-600">
                    Tapez votre recherche ci-dessus pour commencer
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* Search Results */
            <div className="overflow-y-auto h-full">
              {searchResults.length === 0 && !isSearching ? (
                <div className="text-center py-12">
                  <Email className="text-gray-300 mx-auto mb-4" style={{ fontSize: 48 }} />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Aucun résultat trouvé
                  </h3>
                  <p className="text-gray-600">
                    Essayez avec d'autres mots-clés ou modifiez vos filtres
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {searchResults.map((message, index) => {
                    const contact = getContactInfo(message);
                    return (
                      <div
                        key={`${message.id}-${index}`}
                        onClick={() => handleSelectResult(message)}
                        className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <div className="flex items-start space-x-3">
                          {getMessageIcon(message)}
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <h4 
                                className="text-sm font-medium text-gray-900 truncate"
                                dangerouslySetInnerHTML={{
                                  __html: highlightSearchTerm(contact.name, searchQuery)
                                }}
                              />
                              <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                                {new Date(message.receivedDateTime || message.sentDateTime).toLocaleDateString('fr-FR')}
                              </span>
                            </div>
                            
                            <p 
                              className="text-xs text-gray-600 mb-1 truncate"
                              dangerouslySetInnerHTML={{
                                __html: highlightSearchTerm(contact.email, searchQuery)
                              }}
                            />
                            
                            <p 
                              className="text-sm text-gray-800 mb-1 truncate font-medium"
                              dangerouslySetInnerHTML={{
                                __html: highlightSearchTerm(message.subject || 'Sans sujet', searchQuery)
                              }}
                            />
                            
                            <p 
                              className="text-xs text-gray-600 line-clamp-2"
                              dangerouslySetInnerHTML={{
                                __html: highlightSearchTerm(message.bodyPreview || '', searchQuery)
                              }}
                            />
                            
                            <div className="flex items-center mt-2 space-x-2">
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                message.messageType === 'sent' 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-blue-100 text-blue-800'
                              }`}>
                                {message.messageType === 'sent' ? 'Envoyé' : 'Reçu'}
                              </span>
                              
                              {message.hasAttachments && (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                  📎 Pièce jointe
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
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