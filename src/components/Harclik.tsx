import React, { useState, useEffect, useCallback } from 'react';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';

interface Child {
  isim: string;
  harclik: number;
  borc: number;
}

interface GeneralItem {
  aciklama: string;
  tutar: number;
}

interface HistoryLog {
  timestamp: string;
  description: string;
}

interface UserData {
  cocuklar: Child[];
  alinacaklar: GeneralItem[];
  digerGirdiler: {
    kasa: number;
    banka: number;
  };
  islemGecmisi: HistoryLog[];
}

const Harclik: React.FC = () => {
  const { user } = useAuth();
  const [currentView, setCurrentView] = useState<'harclik' | 'dis-islemler' | 'gecmis' | 'ozet'>('harclik');
  const [data, setData] = useState<UserData>({
    cocuklar: [],
    alinacaklar: [],
    digerGirdiler: { kasa: 0, banka: 0 },
    islemGecmisi: []
  });
  
  const [showChildModal, setShowChildModal] = useState(false);
  const [showGeneralItemModal, setShowGeneralItemModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showInputModal, setShowInputModal] = useState(false);
  const [modalData, setModalData] = useState<any>({});

  // Load data from Firebase
  const loadData = useCallback(async () => {
    if (!user) return;
    
    try {
      const userDocRef = doc(db, 'userData', user.uid);
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
        const userData = docSnap.data() as UserData;
        setData({
          cocuklar: userData.cocuklar || [],
          alinacaklar: userData.alinacaklar || [],
          digerGirdiler: userData.digerGirdiler || { kasa: 0, banka: 0 },
          islemGecmisi: userData.islemGecmisi || []
        });
      }
    } catch (error) {
      console.error('Veri yükleme hatası:', error);
    }
  }, [user]);

  // Save data to Firebase
  const saveData = useCallback(async (newData?: Partial<UserData>) => {
    if (!user) return;
    
    const dataToSave = newData || data;
    
    try {
      const userDocRef = doc(db, 'userData', user.uid);
      await setDoc(userDocRef, {
        ...dataToSave,
        lastUpdated: serverTimestamp()
      });
      
      if (newData) {
        setData(prevData => ({ ...prevData, ...newData }));
      }
    } catch (error) {
      console.error('Veri kaydetme hatası:', error);
    }
  }, [user, data]);

  // Log action to history
  const logAction = (description: string) => {
    const timestamp = new Date().toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'medium' });
    const newLog = { timestamp, description };
    const newHistory = [newLog, ...data.islemGecmisi];
    if (newHistory.length > 100) newHistory.pop();
    
    const newData = { ...data, islemGecmisi: newHistory };
    setData(newData);
    saveData(newData);
  };

  // Helper functions
  const formatCurrency = (value: number) => 
    (value != null ? parseFloat(value.toString()).toFixed(2) : '0.00').replace('.', ',') + " ₺";
  
  const formatNumber = (value: number) => 
    value != null ? parseFloat(value.toString()).toFixed(2) : '0.00';
  
  const parseFloatCustom = (str: string): number => 
    parseFloat(str.replace(',', '.')) || 0;

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, loadData]);

  // Calculate summary values
  const calculateSummary = () => {
    const j10 = data.cocuklar.reduce((sum, c) => sum + (c.harclik || 0), 0);
    const j6 = data.cocuklar.reduce((sum, c) => sum + (c.borc || 0), 0);
    const j8 = data.alinacaklar.reduce((sum, a) => sum + (a.tutar || 0), 0);
    const j7 = j10 - j6;
    const j11 = data.digerGirdiler.banka || 0;
    const j5 = (j7 - j8) - j11;
    const j2 = data.digerGirdiler.kasa || 0;
    const j3 = j5 - j2;
    const j12 = j10 - j11;

    return { j10, j6, j8, j7, j11, j5, j2, j3, j12 };
  };

  // Modal handlers
  const handleAddChild = (name: string, harclik: number, borc: number) => {
    const newData = {
      ...data,
      cocuklar: [...data.cocuklar, { isim: name, harclik, borc }]
    };
    setData(newData);
    logAction(`Çocuk eklendi: ${name}`);
    setShowChildModal(false);
  };

  const handleDeleteChild = (index: number) => {
    const child = data.cocuklar[index];
    const newData = {
      ...data,
      cocuklar: data.cocuklar.filter((_, i) => i !== index)
    };
    setData(newData);
    logAction(`Çocuk silindi: ${child.isim}`);
    setShowConfirmModal(false);
  };

  const handleAddGeneralItem = (description: string, amount: number) => {
    const newData = {
      ...data,
      alinacaklar: [...data.alinacaklar, { aciklama: description, tutar: amount }]
    };
    setData(newData);
    logAction(`Genel işlem eklendi: ${description}`);
    setShowGeneralItemModal(false);
  };

  const handleDeleteGeneralItem = (index: number) => {
    const item = data.alinacaklar[index];
    const newData = {
      ...data,
      alinacaklar: data.alinacaklar.filter((_, i) => i !== index)
    };
    setData(newData);
    logAction(`Genel işlem silindi: ${item.aciklama}`);
    setShowConfirmModal(false);
  };

  const handleUpdateChild = (index: number, field: 'harclik' | 'borc', value: number) => {
    const newCocuklar = [...data.cocuklar];
    newCocuklar[index][field] = value;
    const newData = { ...data, cocuklar: newCocuklar };
    setData(newData);
    saveData(newData);
  };

  const handleUpdateGeneralItem = (index: number, field: 'aciklama' | 'tutar', value: string | number) => {
    const newAlinacaklar = [...data.alinacaklar];
    if (field === 'aciklama') {
      newAlinacaklar[index].aciklama = value as string;
    } else {
      newAlinacaklar[index].tutar = value as number;
    }
    const newData = { ...data, alinacaklar: newAlinacaklar };
    setData(newData);
    saveData(newData);
  };

  const handleUpdateOtherInput = (field: 'kasa' | 'banka', value: number) => {
    const newData = {
      ...data,
      digerGirdiler: { ...data.digerGirdiler, [field]: value }
    };
    setData(newData);
    saveData(newData);
  };

  const handleOperationClick = (type: 'child' | 'general' | 'other', index: number, field: string, op: 'add' | 'subtract') => {
    let title = '';
    
    if (type === 'child') {
      const child = data.cocuklar[index];
      title = `'${child.isim}' için ${field === 'harclik' ? 'Harçlık' : 'Borç'} ${op === 'add' ? 'Ekle' : 'Çıkar'}`;
    } else if (type === 'general') {
      const item = data.alinacaklar[index];
      title = `'${item.aciklama}' için Tutar ${op === 'add' ? 'Ekle' : 'Çıkar'}`;
    } else {
      const fieldName = field === 'kasa' ? 'Kasa' : 'Banka';
      title = `${fieldName} için ${op === 'add' ? 'Ekle' : 'Çıkar'}`;
    }

    setModalData({ type, index, field, op, title });
    setShowInputModal(true);
  };

  const handleInputModalConfirm = (amount: number) => {
    const { type, index, field, op } = modalData;
    const change = op === 'add' ? amount : -amount;

    if (type === 'child') {
      const child = data.cocuklar[index];
      const newValue = (child[field as keyof Child] as number || 0) + change;
      handleUpdateChild(index, field as 'harclik' | 'borc', newValue);
      logAction(`${child.isim} - ${field} değiştirildi: ${op === 'add' ? '+' : ''}${formatCurrency(change)}`);
    } else if (type === 'general') {
      const item = data.alinacaklar[index];
      const newValue = (item.tutar || 0) + change;
      handleUpdateGeneralItem(index, 'tutar', newValue);
      logAction(`'${item.aciklama}' tutarı değiştirildi: ${op === 'add' ? '+' : ''}${formatCurrency(change)}`);
    } else {
      const currentValue = data.digerGirdiler[field as 'kasa' | 'banka'] || 0;
      const newValue = currentValue + change;
      handleUpdateOtherInput(field as 'kasa' | 'banka', newValue);
      const fieldName = field === 'kasa' ? 'Kasa' : 'Banka';
      logAction(`${fieldName} değiştirildi: ${op === 'add' ? '+' : ''}${formatCurrency(change)}`);
    }
    
    setShowInputModal(false);
  };

  // Child Modal Component
  const ChildModal: React.FC = () => {
    const [name, setName] = useState('');
    const [harclik, setHarclik] = useState('0');
    const [borc, setBorc] = useState('0');

    if (!showChildModal) return null;

    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
        <div className="glass-card w-full max-w-md">
          <div className="p-5 border-b border-white/10 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-white">Yeni Çocuk Ekle</h3>
            <button 
              onClick={() => setShowChildModal(false)}
              className="p-1.5 rounded-full text-gray-400 hover:bg-white/10 transition-colors"
            >
              ×
            </button>
          </div>
          
          <div className="p-6 space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-400 mb-1 block">İsim</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="form-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-400 mb-1 block">Başlangıç Harçlığı</label>
                <input 
                  type="number" 
                  value={harclik}
                  onChange={(e) => setHarclik(e.target.value)}
                  className="form-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-400 mb-1 block">Başlangıç Borcu</label>
                <input 
                  type="number" 
                  value={borc}
                  onChange={(e) => setBorc(e.target.value)}
                  className="form-input"
                />
              </div>
            </div>
          </div>
          
          <div className="p-5 border-t border-white/10 bg-black/20 rounded-b-2xl flex justify-end gap-3">
            <button 
              onClick={() => setShowChildModal(false)}
              className="bg-gray-500/50 hover:bg-gray-500/70 text-white font-semibold px-4 py-2 rounded-lg transition"
            >
              İptal
            </button>
            <button 
              onClick={() => {
                if (!name.trim()) return;
                handleAddChild(name.trim(), parseFloatCustom(harclik), parseFloatCustom(borc));
              }}
              className="primary-btn"
            >
              Ekle
            </button>
          </div>
        </div>
      </div>
    );
  };

  // General Item Modal Component
  const GeneralItemModal: React.FC = () => {
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('0');

    if (!showGeneralItemModal) return null;

    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
        <div className="glass-card w-full max-w-md">
          <div className="p-5 border-b border-white/10 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-white">Yeni Genel İşlem Ekle</h3>
            <button 
              onClick={() => setShowGeneralItemModal(false)}
              className="p-1.5 rounded-full text-gray-400 hover:bg-white/10 transition-colors"
            >
              ×
            </button>
          </div>
          
          <div className="p-6 space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-400 mb-1 block">Açıklama</label>
              <input 
                type="text" 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="form-input"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-400 mb-1 block">Tutar</label>
              <input 
                type="number" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="form-input"
              />
            </div>
          </div>
          
          <div className="p-5 border-t border-white/10 bg-black/20 rounded-b-2xl flex justify-end gap-3">
            <button 
              onClick={() => setShowGeneralItemModal(false)}
              className="bg-gray-500/50 hover:bg-gray-500/70 text-white font-semibold px-4 py-2 rounded-lg transition"
            >
              İptal
            </button>
            <button 
              onClick={() => {
                if (!description.trim()) return;
                handleAddGeneralItem(description.trim(), parseFloatCustom(amount));
              }}
              className="primary-btn"
            >
              Ekle
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Confirm Modal Component
  const ConfirmModal: React.FC = () => {
    if (!showConfirmModal) return null;

    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
        <div className="glass-card w-full max-w-md">
          <div className="p-6 text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-500/10 mb-4 border border-yellow-500/20">
              <i className="fas fa-exclamation-triangle text-2xl text-yellow-400"></i>
            </div>
            <h2 className="text-lg font-semibold text-white">{modalData.title}</h2>
            <p className="my-3 text-gray-300">{modalData.message}</p>
          </div>
          
          <div className="p-5 border-t border-white/10 bg-black/20 rounded-b-2xl flex justify-center gap-3">
            <button 
              onClick={() => setShowConfirmModal(false)}
              className="bg-gray-500/50 hover:bg-gray-500/70 text-white font-semibold px-6 py-2 rounded-lg transition"
            >
              İptal
            </button>
            <button 
              onClick={() => modalData.onConfirm()}
              className="primary-btn !bg-yellow-500 hover:!bg-yellow-600"
            >
              {modalData.confirmText || 'Onayla'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Input Modal Component
  const InputModal: React.FC = () => {
    const [inputValue, setInputValue] = useState('');

    if (!showInputModal) return null;

    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
        <div className="glass-card w-full max-w-md">
          <div className="p-5 border-b border-white/10 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-white">{modalData.title}</h3>
            <button 
              onClick={() => setShowInputModal(false)}
              className="p-1.5 rounded-full text-gray-400 hover:bg-white/10 transition-colors"
            >
              ×
            </button>
          </div>
          
          <div className="p-6">
            <input 
              type="number" 
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="form-input"
              placeholder="Miktar girin"
              step="0.01"
              autoFocus
            />
          </div>
          
          <div className="p-5 border-t border-white/10 bg-black/20 rounded-b-2xl flex justify-end gap-3">
            <button 
              onClick={() => setShowInputModal(false)}
              className="bg-gray-500/50 hover:bg-gray-500/70 text-white font-semibold px-4 py-2 rounded-lg transition"
            >
              İptal
            </button>
            <button 
              onClick={() => handleInputModalConfirm(parseFloatCustom(inputValue))}
              className="primary-btn"
            >
              Onayla
            </button>
          </div>
        </div>
      </div>
    );
  };

  const summary = calculateSummary();

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="background-container fixed top-0 left-0 w-full h-full overflow-hidden -z-10">
        <div className="aurora-bg absolute w-[150%] h-[150%] bg-gradient-to-br from-purple-500/20 via-transparent to-blue-500/20 animate-aurora"></div>
      </div>
      
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 h-screen bg-gray-900/50 backdrop-blur-lg border-r border-white/10 flex flex-col">
          <div className="h-20 flex items-center justify-center px-4 border-b border-white/10">
            <div className="text-xl font-bold text-white flex items-center gap-3">
              <i className="fas fa-coins text-purple-400"></i>
              <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                Harçlık Portalı
              </span>
            </div>
          </div>
          
          <nav className="flex-grow px-4 py-6 space-y-2">
            {[
              { key: 'harclik', icon: 'fa-children', label: 'Harçlık' },
              { key: 'dis-islemler', icon: 'fa-hand-holding-dollar', label: 'Dış İşlemler' },
              { key: 'gecmis', icon: 'fa-history', label: 'Geçmiş' },
              { key: 'ozet', icon: 'fa-chart-pie', label: 'Özet' }
            ].map(item => (
              <button
                key={item.key}
                onClick={() => setCurrentView(item.key as any)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                  currentView === item.key 
                    ? 'bg-purple-600 text-white' 
                    : 'text-gray-300 hover:bg-white/10'
                }`}
              >
                <i className={`fas ${item.icon} fa-fw`}></i>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>
        
        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="h-20 flex items-center justify-between px-8 border-b border-white/10">
            <h1 className="text-2xl font-bold text-white">
              {currentView === 'harclik' && 'Harçlık Yönetimi'}
              {currentView === 'dis-islemler' && 'Dış İşlemler'}
              {currentView === 'gecmis' && 'İşlem Geçmişi'}
              {currentView === 'ozet' && 'Özet'}
            </h1>
            
            <div>
              {currentView === 'harclik' && (
                <button 
                  onClick={() => setShowChildModal(true)}
                  className="primary-btn !py-2 !px-4 text-sm"
                >
                  <i className="fas fa-plus mr-2"></i>
                  Yeni Çocuk Ekle
                </button>
              )}
              
              {currentView === 'dis-islemler' && (
                <button 
                  onClick={() => setShowGeneralItemModal(true)}
                  className="primary-btn !py-2 !px-4 text-sm"
                >
                  <i className="fas fa-plus mr-2"></i>
                  Yeni İşlem Ekle
                </button>
              )}
              
              {currentView === 'gecmis' && (
                <button 
                  onClick={() => {
                    setModalData({
                      title: 'Geçmişi Temizle',
                      message: 'Tüm işlem geçmişini kalıcı olarak silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
                      confirmText: 'Evet, Hepsini Sil',
                      onConfirm: () => {
                        const newData = { ...data, islemGecmisi: [] };
                        setData(newData);
                        saveData(newData);
                        setShowConfirmModal(false);
                      }
                    });
                    setShowConfirmModal(true);
                  }}
                  className="bg-red-500/80 hover:bg-red-500 text-white font-semibold py-2 px-4 rounded-lg transition duration-300 text-sm"
                >
                  <i className="fas fa-trash mr-2"></i>
                  Geçmişi Temizle
                </button>
              )}
            </div>
          </header>
          
          <div className="flex-1 overflow-y-auto p-8">
            {/* Harçlık View */}
            {currentView === 'harclik' && (
              <section className="glass-card p-6">
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
                  <i className="fas fa-children text-purple-400"></i>
                  Çocuk Hesapları
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {data.cocuklar.length > 0 ? data.cocuklar.map((child, index) => {
                    const net = (child.harclik || 0) - (child.borc || 0);
                    
                    return (
                      <div key={index} className="bg-black/20 p-4 rounded-xl border border-white/10 space-y-3">
                        <div className="flex justify-between items-center">
                          <strong className="text-white">{child.isim}</strong>
                          <button 
                            onClick={() => {
                              setModalData({
                                title: 'Çocuk Silme Onayı',
                                message: `'${child.isim}' adlı çocuğu silmek istediğinizden emin misiniz?`,
                                onConfirm: () => handleDeleteChild(index)
                              });
                              setShowConfirmModal(true);
                            }}
                            className="bg-red-500/20 text-red-300 hover:bg-red-500/40 text-xs font-bold w-6 h-6 rounded-md transition"
                          >
                            X
                          </button>
                        </div>
                        
                        {/* Harçlık */}
                        <div className="space-y-1 text-sm">
                          <label className="text-gray-400">Harçlık:</label>
                          <div className="flex items-center border border-white/10 rounded-lg focus-within:border-purple-500 transition-all duration-300">
                            <input 
                              type="number" 
                              value={formatNumber(child.harclik)}
                              onChange={(e) => handleUpdateChild(index, 'harclik', parseFloatCustom(e.target.value))}
                              className="flex-grow w-full p-2 bg-transparent border-0 rounded-l-lg focus:outline-none focus:ring-0 transition"
                            />
                            <button 
                              onClick={() => handleOperationClick('child', index, 'harclik', 'subtract')}
                              className="bg-white/5 hover:bg-white/10 p-2 border-l border-r border-white/10 font-bold leading-none transition"
                            >
                              -
                            </button>
                            <button 
                              onClick={() => handleOperationClick('child', index, 'harclik', 'add')}
                              className="bg-white/5 hover:bg-white/10 p-2 border-r border-white/10 rounded-r-lg font-bold leading-none transition"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        
                        {/* Borç */}
                        <div className="space-y-1 text-sm">
                          <label className="text-gray-400">Borç:</label>
                          <div className="flex items-center border border-white/10 rounded-lg focus-within:border-purple-500 transition-all duration-300">
                            <input 
                              type="number" 
                              value={formatNumber(child.borc)}
                              onChange={(e) => handleUpdateChild(index, 'borc', parseFloatCustom(e.target.value))}
                              className="flex-grow w-full p-2 bg-transparent border-0 rounded-l-lg focus:outline-none focus:ring-0 transition"
                            />
                            <button 
                              onClick={() => handleOperationClick('child', index, 'borc', 'subtract')}
                              className="bg-white/5 hover:bg-white/10 p-2 border-l border-r border-white/10 font-bold leading-none transition"
                            >
                              -
                            </button>
                            <button 
                              onClick={() => handleOperationClick('child', index, 'borc', 'add')}
                              className="bg-white/5 hover:bg-white/10 p-2 border-r border-white/10 rounded-r-lg font-bold leading-none transition"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        
                        <div className={`text-right font-semibold pt-2 border-t border-white/10 ${
                          net < 0 ? 'text-red-400' : (net > 0 ? 'text-green-400' : '')
                        }`}>
                          Net: {formatCurrency(net)}
                        </div>
                      </div>
                    );
                  }) : (
                    <p className="text-center text-gray-400 text-sm col-span-2 py-8">
                      Henüz çocuk eklenmemiş.
                    </p>
                  )}
                </div>
              </section>
            )}
            
            {/* Dış İşlemler View */}
            {currentView === 'dis-islemler' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                  <section className="glass-card p-6">
                    <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
                      <i className="fas fa-hand-holding-dollar text-blue-400"></i>
                      Genel Borç / Alacak
                    </h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {data.alinacaklar.length > 0 ? data.alinacaklar.map((item, index) => (
                        <div key={index} className="bg-black/20 p-4 rounded-xl border border-white/10 space-y-3">
                          <div className="flex justify-between items-start">
                            <input 
                              type="text" 
                              value={item.aciklama}
                              onChange={(e) => handleUpdateGeneralItem(index, 'aciklama', e.target.value)}
                              className="text-white font-semibold bg-transparent border-none p-0 w-full focus:outline-none focus:ring-0"
                            />
                            <button 
                              onClick={() => {
                                setModalData({
                                  title: 'İşlem Silme Onayı',
                                  message: `'${item.aciklama}' işlemini silmek istediğinizden emin misiniz?`,
                                  onConfirm: () => handleDeleteGeneralItem(index)
                                });
                                setShowConfirmModal(true);
                              }}
                              className="bg-red-500/20 text-red-300 hover:bg-red-500/40 text-xs font-bold w-6 h-6 rounded-md transition flex-shrink-0"
                            >
                              X
                            </button>
                          </div>
                          
                          <div className="space-y-1 text-sm">
                            <label className="text-gray-400">Tutar:</label>
                            <div className="flex items-center border border-white/10 rounded-lg focus-within:border-blue-500 transition-all duration-300">
                              <input 
                                type="number" 
                                value={formatNumber(item.tutar)}
                                onChange={(e) => handleUpdateGeneralItem(index, 'tutar', parseFloatCustom(e.target.value))}
                                className="flex-grow w-full p-2 bg-transparent border-0 rounded-l-lg focus:outline-none focus:ring-0 transition"
                              />
                              <button 
                                onClick={() => handleOperationClick('general', index, 'tutar', 'subtract')}
                                className="bg-white/5 hover:bg-white/10 p-2 border-l border-r border-white/10 font-bold leading-none transition"
                              >
                                -
                              </button>
                              <button 
                                onClick={() => handleOperationClick('general', index, 'tutar', 'add')}
                                className="bg-white/5 hover:bg-white/10 p-2 border-r border-white/10 rounded-r-lg font-bold leading-none transition"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      )) : (
                        <p className="text-center text-gray-400 text-sm col-span-2 py-8">
                          Henüz genel işlem eklenmemiş.
                        </p>
                      )}
                    </div>
                  </section>
                </div>
                
                <div className="lg:col-span-1">
                  <section className="glass-card p-6 space-y-4">
                    <h2 className="text-xl font-bold text-white">Diğer Girdiler</h2>
                    
                    {/* Kasa */}
                    <div>
                      <label className="text-sm font-medium text-gray-400 mb-1 block flex items-center gap-2">
                        <i className="fas fa-cash-register text-emerald-400"></i>
                        Kasa (Fiili Para):
                      </label>
                      <div className="flex items-center border border-white/10 rounded-lg focus-within:border-emerald-500 transition-all duration-300">
                        <input 
                          type="number" 
                          value={formatNumber(data.digerGirdiler.kasa)}
                          onChange={(e) => handleUpdateOtherInput('kasa', parseFloatCustom(e.target.value))}
                          className="flex-grow w-full p-2.5 bg-transparent border-0 rounded-l-lg focus:outline-none focus:ring-0 transition"
                        />
                        <button 
                          onClick={() => handleOperationClick('other', 0, 'kasa', 'subtract')}
                          className="bg-white/5 hover:bg-white/10 p-2.5 border-l border-r border-white/10 font-bold leading-none transition"
                        >
                          -
                        </button>
                        <button 
                          onClick={() => handleOperationClick('other', 0, 'kasa', 'add')}
                          className="bg-white/5 hover:bg-white/10 p-2.5 border-r border-white/10 rounded-r-lg font-bold leading-none transition"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    
                    {/* Banka */}
                    <div>
                      <label className="text-sm font-medium text-gray-400 mb-1 block flex items-center gap-2">
                        <i className="fas fa-building-columns text-cyan-400"></i>
                        Banka:
                      </label>
                      <div className="flex items-center border border-white/10 rounded-lg focus-within:border-cyan-500 transition-all duration-300">
                        <input 
                          type="number" 
                          value={formatNumber(data.digerGirdiler.banka)}
                          onChange={(e) => handleUpdateOtherInput('banka', parseFloatCustom(e.target.value))}
                          className="flex-grow w-full p-2.5 bg-transparent border-0 rounded-l-lg focus:outline-none focus:ring-0 transition"
                        />
                        <button 
                          onClick={() => handleOperationClick('other', 0, 'banka', 'subtract')}
                          className="bg-white/5 hover:bg-white/10 p-2.5 border-l border-r border-white/10 font-bold leading-none transition"
                        >
                          -
                        </button>
                        <button 
                          onClick={() => handleOperationClick('other', 0, 'banka', 'add')}
                          className="bg-white/5 hover:bg-white/10 p-2.5 border-r border-white/10 rounded-r-lg font-bold leading-none transition"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            )}
            
            {/* Geçmiş View */}
            {currentView === 'gecmis' && (
              <div className="glass-card p-6">
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
                  <i className="fas fa-history text-cyan-400"></i>
                  İşlem Geçmişi
                </h2>
                
                <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-2">
                  {data.islemGecmisi.length > 0 ? data.islemGecmisi.map((log, index) => (
                    <div key={index} className="text-sm p-2 bg-white/5 rounded-md flex justify-between items-center">
                      <span className="text-gray-300">{log.description}</span>
                      <span className="text-gray-500 text-xs">{log.timestamp}</span>
                    </div>
                  )) : (
                    <p className="text-center text-gray-400 text-sm py-8">
                      İşlem geçmişi boş.
                    </p>
                  )}
                </div>
              </div>
            )}
            
            {/* Özet View */}
            {currentView === 'ozet' && (
              <div className="max-w-2xl mx-auto">
                <div className="glass-card p-6">
                  <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
                    <i className="fas fa-calculator text-yellow-400"></i>
                    Özet Hesaplama
                  </h2>
                  
                  <div className="space-y-2 text-sm">
                    {[
                      { label: 'Çocuk Toplam Harçlığı', value: formatCurrency(summary.j10) },
                      { label: 'Çocuk Toplam Borcu', value: formatCurrency(summary.j6) },
                      { label: 'Genel Borç/Alacak Toplamı', value: formatCurrency(summary.j8) },
                      { label: 'Çocuk Net Harçlık', value: formatCurrency(summary.j7), bold: true },
                      { label: 'Bankada Olan Para', value: formatCurrency(summary.j11) },
                      { label: 'Kasada Olması Gereken', value: formatCurrency(summary.j5), bold: true },
                      { label: 'Kasa (Fiili Para)', value: formatCurrency(summary.j2) },
                      { label: 'Hesap Açığı', value: formatCurrency(summary.j3), highlight: true, highlightValue: summary.j3 },
                      { label: 'Kasada Gözüken Resmi Para', value: formatCurrency(summary.j12) }
                    ].map((item, index) => {
                      let valueClass = '';
                      if (item.highlight) {
                        if (item.highlightValue! > 0.009) valueClass = 'text-red-400';
                        else if (item.highlightValue! < -0.009) valueClass = 'text-green-400';
                      }
                      
                      return (
                        <div 
                          key={index}
                          className={`flex justify-between items-center ${
                            item.bold ? 'py-2 border-t border-b border-white/10 my-1' : 'py-1'
                          }`}
                        >
                          <span className={`text-gray-400 ${
                            item.bold ? 'font-semibold text-gray-200' : ''
                          }`}>
                            {item.label}
                          </span>
                          <span className={`font-semibold ${valueClass} ${
                            item.bold ? 'text-base text-white' : 'text-gray-200'
                          }`}>
                            {item.value}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
      
      {/* Modals */}
      <ChildModal />
      <GeneralItemModal />
      <ConfirmModal />
      <InputModal />
    </div>
  );
};

export default Harclik;