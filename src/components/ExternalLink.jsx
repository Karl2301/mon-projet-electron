import React from 'react';

const ExternalLink = ({ 
  href, 
  children, 
  className = '', 
  title,
  ...props 
}) => {
  const handleClick = async (e) => {
    e.preventDefault();
    
    try {
      if (window.electronAPI?.openExternal) {
        await window.electronAPI.openExternal(href);
      } else {
        // Fallback pour le développement web
        window.open(href, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      console.error('Erreur lors de l\'ouverture du lien:', error);
    }
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      className={`text-blue-600 hover:text-blue-800 underline cursor-pointer ${className}`}
      title={title || `Ouvre ${href} dans votre navigateur`}
      {...props}
    >
      {children}
      <span className="ml-1 text-xs">↗</span>
    </a>
  );
};

export default ExternalLink;
