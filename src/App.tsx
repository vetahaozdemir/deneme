import React, { useState, useEffect, useCallback } from 'react';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase/config';
import { useAuth } from './hooks/useAuth';
import AuthScreen from './components/AuthScreen';
import KutuphanemNew from './components/KutuphanemNew';
import Harclik from './components/Harclik';
import Fitness from './components/Fitness';
import Isler from './components/Isler';
import Hedef from './components/Hedef';
import Stok from './components/Stok';
import CocukBilgi from './components/CocukBilgi';
import OkuyucuNew from './components/OkuyucuNew';
import './App.css';

type AppType = 'kutuphanem' | 'okuyucu' | 'harclik' | 'fitness' | 'isler' | 'hedef' | 'fiyatlistesi' | 'cocukbilgi';

interface AppModule {
  id: AppType;
  name: string;
  icon: string;
  color: string;
  component: React.ComponentType;
  isVisible?: boolean;
}

function App() {
  const { user, loading } = useAuth();
  const [currentApp, setCurrentApp] = useState<AppType>('kutuphanem');
  const [draggedItem, setDraggedItem] = useState<AppType | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  
  const defaultAppModules: AppModule[] = [
    {
      id: 'kutuphanem',
      name: 'Kütüphanem',
      icon: 'fas fa-book-open',
      color: 'from-violet-500 via-purple-500 to-indigo-600',
      component: KutuphanemNew,
      isVisible: true
    },
    {
      id: 'okuyucu',
      name: 'Okuyucu',
      icon: 'fas fa-book-reader',
      color: 'from-emerald-500 via-green-500 to-teal-600',
      component: OkuyucuNew,
      isVisible: true
    },
    {
      id: 'harclik',
      name: 'Harçlık',
      icon: 'fas fa-credit-card',
      color: 'from-slate-500 via-gray-600 to-zinc-700',
      component: Harclik,
      isVisible: true
    },
    {
      id: 'fitness',
      name: 'Fitness',
      icon: 'fas fa-heart-pulse',
      color: 'from-rose-500 via-red-500 to-orange-600',
      component: Fitness,
      isVisible: true
    },
    {
      id: 'isler',
      name: 'İşler',
      icon: 'fas fa-briefcase',
      color: 'from-sky-500 via-blue-500 to-indigo-600',
      component: Isler,
      isVisible: true
    },
    {
      id: 'hedef',
      name: 'Pusula',
      icon: 'fas fa-mountain-sun',
      color: 'from-amber-500 via-yellow-500 to-orange-600',
      component: Hedef,
      isVisible: true
    },
    {
      id: 'fiyatlistesi',
      name: 'Stok',
      icon: 'fas fa-chart-line',
      color: 'from-blue-500 via-cyan-500 to-teal-600',
      component: Stok,
      isVisible: true
    },
    {
      id: 'cocukbilgi',
      name: 'Çocuk Bilgi',
      icon: 'fas fa-baby',
      color: 'from-pink-500 via-rose-500 to-red-500',
      component: CocukBilgi,
      isVisible: true
    }
  ];

  const [appModules, setAppModules] = useState<AppModule[]>(defaultAppModules);

  // Load app configuration from Firebase
  const loadAppConfig = useCallback(async () => {
    if (!user) return;
    
    try {
      const userConfigRef = doc(db, 'appConfig', user.uid);
      const configSnap = await getDoc(userConfigRef);
      if (configSnap.exists()) {
        const config = configSnap.data();
        if (config.modules && Array.isArray(config.modules)) {
          // Merge saved config with default modules
          const savedModules = config.modules.map((savedModule: any) => {
            const defaultModule = defaultAppModules.find(m => m.id === savedModule.id);
            return defaultModule ? { ...defaultModule, ...savedModule } : null;
          }).filter(Boolean);
          setAppModules(savedModules);
        }
        if (config.currentApp && config.currentApp !== currentApp) {
          setCurrentApp(config.currentApp);
        }
      }
    } catch (error) {
      console.error('Uygulama yapılandırması yükleme hatası:', error);
    }
  }, [user, currentApp, defaultAppModules]);

  // Save app configuration to Firebase
  const saveAppConfig = useCallback(async () => {
    if (!user) return;
    
    try {
      const userConfigRef = doc(db, 'appConfig', user.uid);
      await setDoc(userConfigRef, {
        modules: appModules.map(({ component, ...rest }) => rest), // Remove component from save
        currentApp,
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      console.error('Uygulama yapılandırması kaydetme hatası:', error);
    }
  }, [appModules, currentApp, user]);

  // Load config when user changes
  useEffect(() => {
    if (user) {
      loadAppConfig();
    }
  }, [user, loadAppConfig]);

  // Save config when modules or currentApp changes
  useEffect(() => {
    if (user) {
      saveAppConfig();
    }
  }, [user, saveAppConfig]);

  // Eğer mevcut uygulama gizlenmişse, ilk görünür uygulamaya geç
  useEffect(() => {
    const currentModule = appModules.find(m => m.id === currentApp);
    const visibleModules = appModules.filter(module => module.isVisible !== false);
    
    if (currentModule && currentModule.isVisible === false && visibleModules.length > 0) {
      setCurrentApp(visibleModules[0].id);
    }
  }, [appModules, currentApp]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-600 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg font-semibold text-gray-200">Demo Yükleniyor...</p>
        </div>
      </div>
    );
  }

  // Show auth screen if no user
  if (!user) {
    return <AuthScreen />;
  }

  const handleDragStart = (e: React.DragEvent, appId: AppType) => {
    setDraggedItem(appId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetId: AppType) => {
    e.preventDefault();
    if (!draggedItem || draggedItem === targetId) return;

    const draggedIndex = appModules.findIndex(app => app.id === draggedItem);
    const targetIndex = appModules.findIndex(app => app.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newModules = [...appModules];
    const [draggedModule] = newModules.splice(draggedIndex, 1);
    newModules.splice(targetIndex, 0, draggedModule);

    setAppModules(newModules);
    setDraggedItem(null);
  };

  const toggleAppVisibility = (appId: AppType) => {
    setAppModules(prevModules => {
      const currentVisibleCount = prevModules.filter(m => m.isVisible !== false).length;
      const moduleToToggle = prevModules.find(m => m.id === appId);
      
      // En az bir uygulama görünür olmalı
      if (moduleToToggle?.isVisible !== false && currentVisibleCount <= 1) {
        return prevModules; // Değişiklik yapma
      }
      
      return prevModules.map(module =>
        module.id === appId
          ? { ...module, isVisible: !module.isVisible }
          : module
      );
    });
  };

  const getVisibleModules = () => appModules.filter(module => module.isVisible !== false);

  const renderCurrentApp = () => {
    const currentModule = appModules.find(module => module.id === currentApp);
    if (currentModule) {
      const Component = currentModule.component;
      return <Component />;
    }
    return <KutuphanemNew />;
  };

  return (
    <div className="App">
      {/* Navigation Header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-slate-900/95 via-gray-800/95 to-slate-900/95 backdrop-blur-xl border-b border-white/10 shadow-2xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">A</span>
                </div>
                <div className="text-xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                  Uygulamalarım
                </div>
              </div>
              
              <nav className="hidden md:flex space-x-2">
                {getVisibleModules().map((module) => (
                  <button
                    key={module.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, module.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, module.id)}
                    onClick={() => setCurrentApp(module.id)}
                    className={`group relative px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 transform hover:scale-105 ${
                      currentApp === module.id
                        ? `bg-gradient-to-r ${module.color} text-white shadow-lg shadow-${module.color.split('-')[1]}-500/25`
                        : 'text-gray-300 hover:bg-white/10 hover:text-white'
                    } ${draggedItem === module.id ? 'opacity-50 scale-95' : ''}`}
                  >
                    <div className="flex items-center space-x-2">
                      <i className={`${module.icon} text-lg`}></i>
                      <span>{module.name}</span>
                    </div>
                  </button>
                ))}
              </nav>
            </div>
            
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Ayarlar"
              >
                <i className="fas fa-cog text-lg"></i>
              </button>
              <div className="text-sm text-gray-400">
                <span className="bg-blue-500/20 text-blue-300 px-2 py-1 rounded-full text-xs">
                  Çevrimiçi
                </span>
              </div>
              <div className="text-sm text-gray-300">
                {user?.email}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Mobile Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-r from-slate-900/95 via-gray-800/95 to-slate-900/95 backdrop-blur-xl border-t border-white/10 shadow-2xl">
        {/* First Row - 4 items */}
        <div className="grid grid-cols-4 gap-1 p-2 pb-1">
          {getVisibleModules().slice(0, 4).map((module) => (
            <button
              key={module.id}
              onClick={() => setCurrentApp(module.id)}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-xs font-medium transition-all duration-300 min-h-[55px] ${
                currentApp === module.id
                  ? `bg-gradient-to-br ${module.color} text-white shadow-lg transform scale-95`
                  : 'text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <i className={`${module.icon} text-sm mb-1`}></i>
              <span className="truncate text-center leading-tight text-[9px]">{module.name}</span>
            </button>
          ))}
        </div>
        
        {/* Second Row - 3 items centered */}
        <div className="grid grid-cols-4 gap-1 px-2 pb-2">
          <div></div> {/* Empty space */}
          {getVisibleModules().slice(4, 7).map((module) => (
            <button
              key={module.id}
              onClick={() => setCurrentApp(module.id)}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-xs font-medium transition-all duration-300 min-h-[55px] ${
                currentApp === module.id
                  ? `bg-gradient-to-br ${module.color} text-white shadow-lg transform scale-95`
                  : 'text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <i className={`${module.icon} text-sm mb-1`}></i>
              <span className="truncate text-center leading-tight text-[9px]">{module.name}</span>
            </button>
          ))}
        </div>
      </div>
      
      {/* Settings Panel */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-gray-800/95 to-gray-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b border-white/10">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white">Uygulama Ayarları</h3>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
            </div>
            
            <div className="p-6">
              <h4 className="text-lg font-semibold text-white mb-4">Görünür Uygulamalar</h4>
              <p className="text-sm text-gray-400 mb-4">
                Hangi uygulamaların navigasyonda görüneceğini seçin. Sürükleyerek sırasını değiştirebilirsiniz.
              </p>
              
              <div className="space-y-2">
                {appModules.map((module, index) => (
                  <div
                    key={module.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, module.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, module.id)}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all duration-300 ${
                      module.isVisible 
                        ? 'bg-white/5 border-white/10 text-white' 
                        : 'bg-gray-800/50 border-gray-700/50 text-gray-500'
                    } ${draggedItem === module.id ? 'opacity-50 scale-95' : 'hover:bg-white/10'}`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-2 cursor-move">
                        <i className="fas fa-grip-vertical text-gray-400"></i>
                        <i className={`${module.icon} text-lg`}></i>
                      </div>
                      <span className="font-medium">{module.name}</span>
                    </div>
                    
                    <button
                      onClick={() => toggleAppVisibility(module.id)}
                      className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors duration-300 focus:outline-none ${
                        module.isVisible ? 'bg-blue-600' : 'bg-gray-600'
                      }`}
                    >
                      <span
                        className={`inline-block w-4 h-4 bg-white rounded-full shadow-lg transform transition-transform duration-300 ${
                          module.isVisible ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
              
              <div className="mt-6 text-xs text-gray-500">
                <i className="fas fa-info-circle mr-1"></i>
                En az bir uygulama görünür olmalıdır. Değişiklikler otomatik olarak kaydedilir.
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Main Content */}
      <div className="pt-16 pb-32 md:pb-0">
        {renderCurrentApp()}
      </div>
    </div>
  );
}

export default App;