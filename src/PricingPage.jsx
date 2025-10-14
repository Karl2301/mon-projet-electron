import React from 'react';
import { 
  Button, 
  Typography, 
  Box, 
  Card, 
  CardContent, 
  CardActions, 
  Grid, 
  Container,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Fade,
  Grow
} from '@mui/material';
import { CheckCircle, ArrowBack, Star, Business, Bolt } from '@mui/icons-material';

const PricingPage = ({ onSelectPlan, onBack }) => {
  const plans = [
    {
      name: 'Licence Solo',
      price: '300',
      description: '1 licence pour 1 an',
      features: [
        'Accès complet pour 1 utilisateur',
        'Support par email',
        'Mises à jour incluses',
        'Activation immédiate'
      ],
      recommended: false,
      accent: 'blue',
      type: "/ans",
      devise: "€"
    },
    {
      name: 'Pack Équipe',
      price: '1920',
      description: '8 licences pour 1 an (240€/licence)',
      features: [
        'Accès complet pour 8 utilisateurs',
        'Support prioritaire',
        'Gestion centralisée',
        'Mises à jour incluses',
        'Activation immédiate'
      ],
      recommended: false,
      accent: 'orange',
      type: "/ans",
      devise: "€"
    },
    {
      name: 'Pack Entreprise',
      price: '3150',
      description: '15 licences pour 1 an (210€/licence)',
      features: [
        'Accès complet pour 15 utilisateurs',
        'Support 24/7',
        'Gestion multi-utilisateurs',
        'Mises à jour incluses',
        'Formation dédiée',
        'Activation immédiate'
      ],
      recommended: true,
      accent: 'emerald',
      type: "/ans",
      devise: "€"
    },
    {
      name: 'Pack Sur Mesure',
      price: 'Sur devis',
      description: 'Nombre de licences personnalisé, fonctionnalités avancées',
      features: [
        'Accès complet pour un nombre d’utilisateurs personnalisé',
        'Support dédié',
        'Fonctionnalités sur mesure',
        'Gestion avancée',
        'Mises à jour incluses',
        'Formation personnalisée',
        'Activation immédiate'
      ],
      recommended: false,
      accent: 'purple',
      type: "",
      devise: ""
    }
  ];

  const getAccentClasses = (accent, recommended = false) => {
    const colors = {
      blue: {
        badge: 'bg-blue-500',
        icon: 'text-blue-500',
        iconBg: 'bg-blue-50',
        check: 'text-blue-500',
        border: 'border-blue-200',
        button: recommended ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200'
      },
      orange: {
        badge: 'bg-orange-600',
        icon: 'text-orange-600',
        iconBg: 'bg-orange-50',
        check: 'text-orange-500',
        border: 'border-orange-300',
        button: recommended ? 'bg-orange-600 hover:bg-orange-700 text-white' : 'bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200'
      },
      emerald: {
        badge: 'bg-emerald-600',
        icon: 'text-emerald-600',
        iconBg: 'bg-emerald-50',
        check: 'text-emerald-500',
        border: 'border-emerald-200',
        button: recommended ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200'
      },
      purple: {
        badge: 'bg-purple-600',
        icon: 'text-purple-600',
        iconBg: 'bg-purple-50',
        check: 'text-purple-500',
        border: 'border-purple-200',
        button: recommended ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-purple-50 hover:bg-purple-100 text-purple-600 border border-purple-200'
      }
    };
    return colors[accent];
  };

  const getIcon = (index) => {
    const icons = [
      <Bolt style={{ fontSize: 20 }} />,
      <Star style={{ fontSize: 20 }} />,
      <Business style={{ fontSize: 20 }} />,
      <Star style={{ fontSize: 20 }} /> // Ajout d'une 4ème icône
    ];
    return icons[index];
  };

  return (
    <div className="min-h-screen bg-gray-25">
      {/* Header avec accent coloré */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <button
            onClick={onBack}
            className="inline-flex items-center text-gray-500 hover:text-indigo-600 transition-colors duration-200 mb-8"
          >
            <ArrowBack style={{ fontSize: 18 }} className="mr-2" />
            <span className="text-sm font-medium">Retour</span>
          </button>
          
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl mb-6">
              <span className="text-white text-2xl font-bold"></span>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4 tracking-tight">
              Tarification
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Choisissez le plan adapté à vos besoins. Changez ou annulez à tout moment.
            </p>
          </div>
        </div>
      </div>

      {/* Cards de tarification avec couleurs */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan, index) => {
            const accentClasses = getAccentClasses(plan.accent, plan.recommended);
            
            return (
              <div 
                key={index}
                className={`relative bg-white rounded-2xl border transition-all duration-300 hover:shadow-lg flex flex-col h-full ${
                  plan.recommended 
                    ? `${accentClasses.border} shadow-md` 
                    : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                {/* Badge recommandé */}
                {plan.recommended && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <div className={`${accentClasses.badge} text-white px-4 py-1.5 rounded-full text-sm font-medium shadow-lg`}>
                      Recommandé
                    </div>
                  </div>
                )}
                
                <div className="p-8 flex flex-col h-full">
                  {/* Icône colorée - hauteur fixe */}
                  <div className="text-center mb-6 h-16 flex items-center justify-center">
                    <div className={`inline-flex items-center justify-center w-12 h-12 ${accentClasses.iconBg} rounded-xl`}>
                      <span className={accentClasses.icon}>
                        {getIcon(index)}
                      </span>
                    </div>
                  </div>

                  {/* En-tête du plan - hauteur fixe */}
                  <div className="text-center mb-1 h-32 flex flex-col justify-center">
                    <h3 className="text-xl font-bold text-gray-900 mb-2">
                      {plan.name}
                    </h3>
                    <p className="text-gray-600 text-sm">
                      {plan.description}
                    </p>
                  </div>
                  
                  {/* Prix - hauteur fixe pour alignement */}
                  <div className="text-center mb-8 h-20 flex items-center justify-center">
                    <div className="flex items-baseline">
                      <span className="text-4xl font-bold text-gray-900">
                        {plan.price}{plan.devise}
                      </span>
                      <span className="text-gray-600 ml-1 font-medium">
                        {plan.type}
                      </span>
                    </div>
                  </div>
                  
                  {/* Liste des fonctionnalités avec hauteur minimum fixe */}
                  <div className="space-y-4 mb-8 flex-grow min-h-[280px]">
                    {plan.features.map((feature, featureIndex) => (
                      <div key={featureIndex} className="flex items-start">
                        <div className="flex-shrink-0 mt-0.5">
                          <CheckCircle 
                            style={{ fontSize: 16 }} 
                            className={accentClasses.check}
                          />
                        </div>
                        <span className="text-gray-700 text-sm ml-3 leading-relaxed">
                          {feature}
                        </span>
                      </div>
                    ))}
                  </div>
                  
                  {/* Bouton d'action coloré - toujours en bas */}
                  <div className="mt-auto">
                    <button
                      onClick={() => onSelectPlan(plan)}
                      className={`w-full py-3 px-6 rounded-xl font-medium text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${accentClasses.button} focus:ring-${plan.accent}-500`}
                    >
                      {plan.recommended ? 'Commencer maintenant' : 'Choisir ce plan'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Section informative avec accents colorés */}
        <div className="mt-16 text-center">
          <div className="bg-white rounded-2xl border border-gray-100 p-8">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl mb-4">
              <span className="text-white text-lg">?</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-6">
              Questions fréquentes
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
              <div className="group">
                <div className="flex items-start">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 group-hover:bg-blue-600 transition-colors"></div>
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">
                      Puis-je changer de plan ?
                    </h4>
                    <p className="text-sm text-gray-600">
                      Oui, vous pouvez passer à un plan supérieur ou inférieur à tout moment.
                    </p>
                  </div>
                </div>
              </div>
              <div className="group">
                <div className="flex items-start">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2 mr-3 group-hover:bg-indigo-600 transition-colors"></div>
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">
                      Y a-t-il un engagement ?
                    </h4>
                    <p className="text-sm text-gray-600">
                      Non, tous nos plans sont sans engagement. Annulez quand vous voulez.
                    </p>
                  </div>
                </div>
              </div>
              <div className="group">
                <div className="flex items-start">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full mt-2 mr-3 group-hover:bg-emerald-600 transition-colors"></div>
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">
                      Le support est-il inclus ?
                    </h4>
                    <p className="text-sm text-gray-600">
                      Oui, tous les plans incluent un support adapté à votre niveau d'abonnement.
                    </p>
                  </div>
                </div>
              </div>
              <div className="group">
                <div className="flex items-start">
                  <div className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 group-hover:bg-purple-600 transition-colors"></div>
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">
                      Essai gratuit disponible ?
                    </h4>
                    <p className="text-sm text-gray-600">
                      Tous les plans incluent une période d'essai de 14 jours sans engagement.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;