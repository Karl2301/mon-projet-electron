import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { theme } from './theme';
import LoginPage from './LoginPage';
import MainPage from './MainPage';
import PricingPage from './PricingPage';

const App = () => {
  const [user, setUser] = useState(null);
  const [currentPage, setCurrentPage] = useState('main'); // 'main' | 'pricing'
  const [selectedPlan, setSelectedPlan] = useState(null);

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    setUser(null);
    setCurrentPage('main');
  };

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

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);