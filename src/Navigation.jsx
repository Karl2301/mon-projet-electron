import React, { useState } from 'react';
import { 
  AccountCircle, 
  Logout, 
  Star, 
  Email,
  Settings,
  Close 
} from '@mui/icons-material';
import GeneralSettings from './GeneralSettings';

const Navigation = ({ user, onLogout, onShowPricing }) => {
  const [showSettings, setShowSettings] = useState(false);

  const handleSettingsUpdated = () => {
    // Callback when settings are updated
    console.log('Settings updated');
  };

  return (
    <>
      <nav className="bg-white/90 backdrop-blur-md border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                <Email className="text-white" style={{ fontSize: 20 }} />
              </div>
              <span className="text-xl font-bold text-gray-900">EmailManager</span>
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowSettings(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg transition-colors"
              >
                <Settings style={{ fontSize: 18 }} />
                <span className="hidden sm:inline">Configuration</span>
              </button>

              <button
                onClick={onShowPricing}
                className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100 text-amber-700 rounded-lg transition-colors border border-amber-200"
              >
                <Star style={{ fontSize: 18 }} />
                <span className="hidden sm:inline">Premium</span>
              </button>

              {/* User menu */}
              <div className="flex items-center space-x-3">
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-medium text-gray-900">{user.name}</p>
                  <p className="text-xs text-gray-600">{user.email}</p>
                </div>
                <div className="w-8 h-8 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center">
                  <AccountCircle className="text-blue-600" style={{ fontSize: 20 }} />
                </div>
                <button
                  onClick={onLogout}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Se déconnecter"
                >
                  <Logout className="text-gray-600" style={{ fontSize: 18 }} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Modal de configuration */}
      <GeneralSettings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSettingsUpdated={handleSettingsUpdated}
      />
    </>
  );
};

export default Navigation;