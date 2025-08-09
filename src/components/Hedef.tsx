import React, { useState, useEffect, useCallback } from 'react';
import { doc, setDoc, getDoc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';

interface UserData {
  startDate?: string;
  progress?: { [key: string]: any };
  books?: { [key: string]: any };
  weightLog?: { [key: string]: number };
  goals?: { [key: string]: any };
  settings?: { workoutDays: number[]; bookGoal: number };
}

interface Goal {
  name: string;
  type: 'number' | 'reading' | 'udemy' | 'weight' | 'custom';
  unit: string;
  active: boolean;
  baseTarget?: number;
  useCampSystem?: boolean;
  campType?: 'steps' | 'udemy' | 'standard';
  weeklyOnly?: boolean;
  dailyGoal?: (dayCounter: number) => number;
  sixMonthGoal?: number | string;
}

const Hedef: React.FC = () => {
  const { user } = useAuth();
  const [userData, setUserData] = useState<UserData>({});
  const [currentView, setCurrentView] = useState<'today' | 'books' | 'progress' | 'goals' | 'settings'>('today');
  const [showModal, setShowModal] = useState(false);
  const [modalContent, setModalContent] = useState<any>(null);
  const [countdownInterval, setCountdownInterval] = useState<NodeJS.Timeout | null>(null);
  const [unsubscribe, setUnsubscribe] = useState<(() => void) | null>(null);

  // Utility functions
  const createDefaultUserData = (): UserData => ({
    settings: { workoutDays: [1, 3, 5], bookGoal: 8 },
    progress: {},
    books: {},
    weightLog: {},
    goals: {
      steps: {
        name: 'Adım Sayısı',
        type: 'number',
        unit: 'adım',
        active: true,
        baseTarget: 10000,
        useCampSystem: true,
        campType: 'steps'
      },
      books: {
        name: 'Kitap Okuma',
        type: 'reading',
        unit: 'sayfa',
        active: true,
        useCampSystem: false
      },
      videos: {
        name: 'Eğitim Videoları',
        type: 'udemy',
        unit: 'dakika',
        active: true,
        baseTarget: 30,
        useCampSystem: true,
        campType: 'udemy'
      },
      water: {
        name: 'Su Tüketimi',
        type: 'number',
        unit: 'ml',
        active: true,
        baseTarget: 2000,
        useCampSystem: false
      },
      weight: {
        name: 'Haftalık Kilo Girişi',
        type: 'weight',
        unit: 'kg',
        active: true,
        weeklyOnly: true,
        useCampSystem: false
      }
    }
  });

  const getTahaveliCampGoal = (baseTarget: number, dayCounter: number, goalType = 'standard'): number => {
    const week = Math.ceil(dayCounter / 7);
    const month = Math.ceil(dayCounter / 30);

    if (goalType === 'steps') {
      if (week <= 4) return baseTarget;
      if (week <= 8) return Math.round(baseTarget * 1.2);
      return Math.round(baseTarget * 1.5);
    } else if (goalType === 'udemy') {
      if (week <= 4) return baseTarget;
      if (week <= 12) return Math.round(baseTarget * 1.5);
      return Math.round(baseTarget * 2);
    } else {
      if (month <= 1) return baseTarget;
      if (month <= 2) return Math.round(baseTarget * 1.3);
      if (month <= 4) return Math.round(baseTarget * 1.6);
      return Math.round(baseTarget * 2);
    }
  };

  const getDailyStepGoal = (dayCounter: number): number => {
    const week = Math.ceil(dayCounter / 7);
    if (week <= 4) return 10000;
    if (week <= 8) return 12000;
    return 15000;
  };

  const getDailyUdemyGoal = (dayCounter: number): number => {
    const week = Math.ceil(dayCounter / 7);
    if (week <= 4) return 30;
    if (week <= 12) return 45;
    return 60;
  };

  const getDayCounter = (): number => {
    if (!userData.startDate) return 0;
    const today = new Date();
    const startDate = new Date(userData.startDate + "T00:00:00");
    return Math.floor((today.getTime() - startDate.getTime()) / 86400000) + 1;
  };

  const formatDate = (date: string): string => {
    return new Date(date).toLocaleDateString('tr-TR');
  };

  const calculateTodaysTotalPages = (todayProgress: any): number => {
    return todayProgress.readingLog ? Object.values(todayProgress.readingLog).reduce((sum: number, pages: any) => sum + (Number(pages) || 0), 0) : 0;
  };

  const calculateTodaysTotalUdemy = (todayProgress: any): number => {
    return todayProgress.udemy ? Object.values(todayProgress.udemy).reduce((sum: number, minutes: any) => sum + (Number(minutes) || 0), 0) : 0;
  };

  // Load data from Firebase
  const loadData = useCallback(async () => {
    if (!user) return;

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const unsubscribeSnapshot = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists() && Object.keys(docSnap.data()).length > 0) {
          const data = docSnap.data() as UserData;
          setUserData(data);
        } else {
          const defaultData = createDefaultUserData();
          setUserData(defaultData);
        }
      });
      setUnsubscribe(() => unsubscribeSnapshot);
    } catch (error) {
      console.error('Pusula veri yükleme hatası:', error);
      const defaultData = createDefaultUserData();
      setUserData(defaultData);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadData();
    } else {
      if (unsubscribe) {
        unsubscribe();
        setUnsubscribe(null);
      }
      setUserData({});
    }
  }, [user, loadData, unsubscribe]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubscribe) unsubscribe();
      if (countdownInterval) clearInterval(countdownInterval);
    };
  }, [unsubscribe, countdownInterval]);

  const handleSetup = async (startDate: string) => {
    if (!startDate || !user) return;
    try {
      await setDoc(doc(db, "users", user.uid), {
        ...createDefaultUserData(),
        startDate: startDate
      });
    } catch (error) {
      console.error('Setup hatası:', error);
    }
  };

  const updateUserData = async (updates: any) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "users", user.uid), updates);
    } catch (error) {
      console.error('Güncelleme hatası:', error);
    }
  };

  const openModal = (title: string, content: React.ReactNode) => {
    setModalContent({ title, content });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalContent(null);
  };

  // Render different views based on app state
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-emerald-400 mb-4">Başarım Pusulası</h1>
          <p className="text-gray-400">Lütfen giriş yapın</p>
        </div>
      </div>
    );
  }

  if (!userData.startDate) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="background-container fixed top-0 left-0 w-full h-full overflow-hidden -z-10">
          <div className="aurora-bg absolute w-[150%] h-[150%] bg-gradient-to-br from-emerald-500/20 via-transparent to-blue-500/20 animate-aurora"></div>
        </div>

        <div className="flex items-center justify-center min-h-screen p-4">
          <div className="text-center glass-card p-8 max-w-md">
            <h2 className="text-3xl font-bold text-white mb-4">Dönüşüme Hoş Geldin!</h2>
            <p className="text-gray-300 mb-6">Harika bir yolculuğa çıkmak üzeresin. Lütfen kampın için bir başlangıç tarihi seç.</p>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target as HTMLFormElement);
              const startDate = formData.get('startDate') as string;
              handleSetup(startDate);
            }}>
              <input
                type="date"
                name="startDate"
                min={new Date().toISOString().split("T")[0]}
                className="form-input w-full text-center text-lg mb-6"
                required
              />
              <button type="submit" className="primary-btn w-full">
                Yolculuğu Başlat
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const startDate = new Date(userData.startDate + "T00:00:00");
  const now = new Date();

  // Countdown view if start date is in the future
  if (startDate > now) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="background-container fixed top-0 left-0 w-full h-full overflow-hidden -z-10">
          <div className="aurora-bg absolute w-[150%] h-[150%] bg-gradient-to-br from-emerald-500/20 via-transparent to-blue-500/20 animate-aurora"></div>
        </div>

        <div className="flex items-center justify-center min-h-screen p-4">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-white mb-2">Yolculuk Başlıyor...</h2>
            <p className="text-gray-300 mb-8">Pusula hedefe kilitlendi!</p>
            <CountdownTimer targetDate={startDate} />
          </div>
        </div>
      </div>
    );
  }

  // Main app view
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="background-container fixed top-0 left-0 w-full h-full overflow-hidden -z-10">
        <div className="aurora-bg absolute w-[150%] h-[150%] bg-gradient-to-br from-emerald-500/20 via-transparent to-blue-500/20 animate-aurora"></div>
      </div>

      <div className="flex flex-col md:flex-row min-h-screen">
        {/* Navigation */}
        <nav className="glass-card border-none md:border-r border-white/10 shadow-lg md:shadow-none fixed bottom-0 md:relative w-full md:w-64 flex-shrink-0 flex flex-row md:flex-col justify-around md:justify-start z-10">
          {/* Desktop Header */}
          <div className="hidden md:block p-6 text-center border-b border-white/10">
            <h1 className="text-2xl font-bold text-emerald-400">Başarım Pusulası</h1>
            <p className="text-xs text-gray-400 mt-1">Dönüşüm Kampı</p>
          </div>

          {/* Nav Links */}
          <ul className="flex flex-row md:flex-col justify-around md:justify-start flex-grow md:mt-4 md:px-3 md:space-y-2">
            {[
              { id: 'today', title: 'Bugün', icon: '🌙' },
              { id: 'books', title: 'Kitaplık', icon: '📚' },
              { id: 'progress', title: 'İlerleme', icon: '📊' },
              { id: 'goals', title: 'Hedefler', icon: '🎯' },
              { id: 'settings', title: 'Ayarlar', icon: '⚙️' }
            ].map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setCurrentView(item.id as any)}
                  className={`nav-link flex-1 md:flex-none flex flex-col md:flex-row items-center justify-center md:justify-start p-2 md:px-4 md:py-3 text-gray-300 hover:bg-white/10 md:text-base rounded-lg transition-colors duration-200 w-full ${
                    currentView === item.id ? 'bg-emerald-500/20 text-emerald-400 font-semibold' : ''
                  }`}
                >
                  <span className="text-xl md:mr-3">{item.icon}</span>
                  <span className="text-xs mt-1 md:mt-0 md:text-sm">{item.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-8 lg:p-12 pb-24 md:pb-6">
          <div id="page-container">
            {currentView === 'today' && <TodayView userData={userData} updateUserData={updateUserData} openModal={openModal} />}
            {currentView === 'books' && <BooksView userData={userData} updateUserData={updateUserData} openModal={openModal} />}
            {currentView === 'progress' && <ProgressView userData={userData} />}
            {currentView === 'goals' && <GoalsView userData={userData} updateUserData={updateUserData} openModal={openModal} />}
            {currentView === 'settings' && <SettingsView userData={userData} updateUserData={updateUserData} user={user} />}
          </div>
        </main>
      </div>

      {/* Modal */}
      {showModal && modalContent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-md flex flex-col">
            <header className="p-5 flex justify-between items-center border-b border-white/10">
              <h3 className="text-lg font-semibold text-white">{modalContent.title}</h3>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-full text-gray-400 hover:bg-gray-600 transition-colors"
              >
                <i className="fa-solid fa-times text-xl"></i>
              </button>
            </header>
            <div className="p-6">{modalContent.content}</div>
          </div>
        </div>
      )}

      <style>
        {`
        .primary-btn {
          background-color: #10b981;
          color: white;
          font-weight: 600;
          padding: 0.75rem 1.5rem;
          border-radius: 0.75rem;
          transition: all 0.3s ease;
          border: 1px solid transparent;
        }
        .primary-btn:hover {
          background-color: #059669;
          box-shadow: 0 0 20px rgba(16, 185, 129, 0.5);
          transform: translateY(-2px);
        }
        .glass-card {
          background: rgba(17, 24, 39, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-radius: 1.5rem;
        }
        .form-input {
          background-color: rgba(31, 41, 55, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #e5e7eb;
          border-radius: 0.75rem;
          padding: 0.75rem 1rem;
          transition: all 0.3s ease;
          width: 100%;
        }
        .form-input::placeholder {
          color: #9ca3af;
        }
        .form-input:focus {
          outline: none;
          border-color: #10b981;
          box-shadow: 0 0 15px rgba(16, 185, 129, 0.5);
        }
        .aurora-bg {
          animation: moveAurora 25s alternate infinite ease-in-out;
        }
        @keyframes moveAurora {
          0% { transform: translate(-20%, -20%) rotate(0deg); }
          100% { transform: translate(20%, 20%) rotate(180deg); }
        }
        `}
      </style>
    </div>
  );
};

// Sub-components for different views
const CountdownTimer: React.FC<{ targetDate: Date }> = ({ targetDate }) => {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const distance = targetDate.getTime() - now;

      if (distance < 0) {
        clearInterval(interval);
        window.location.reload(); // Reload to show main app
        return;
      }

      setTimeLeft({
        days: Math.floor(distance / 86400000),
        hours: Math.floor((distance % 86400000) / 3600000),
        minutes: Math.floor((distance % 3600000) / 60000),
        seconds: Math.floor((distance % 60000) / 1000)
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [targetDate]);

  return (
    <div className="flex justify-center space-x-2 sm:space-x-4 text-white mb-8">
      <div className="bg-emerald-500 p-4 rounded-lg w-20 sm:w-24">
        <div className="text-3xl sm:text-4xl font-bold">{timeLeft.days.toString().padStart(2, '0')}</div>
        <div className="text-xs">GÜN</div>
      </div>
      <div className="bg-emerald-500 p-4 rounded-lg w-20 sm:w-24">
        <div className="text-3xl sm:text-4xl font-bold">{timeLeft.hours.toString().padStart(2, '0')}</div>
        <div className="text-xs">SAAT</div>
      </div>
      <div className="bg-emerald-500 p-4 rounded-lg w-20 sm:w-24">
        <div className="text-3xl sm:text-4xl font-bold">{timeLeft.minutes.toString().padStart(2, '0')}</div>
        <div className="text-xs">DAKİKA</div>
      </div>
      <div className="bg-emerald-500 p-4 rounded-lg w-20 sm:w-24">
        <div className="text-3xl sm:text-4xl font-bold">{timeLeft.seconds.toString().padStart(2, '0')}</div>
        <div className="text-xs">SANİYE</div>
      </div>
    </div>
  );
};

const TodayView: React.FC<{ userData: UserData; updateUserData: Function; openModal: Function }> = ({ userData, updateUserData, openModal }) => {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const startDate = new Date(userData.startDate! + "T00:00:00");
  const dayCounter = Math.floor((today.getTime() - startDate.getTime()) / 86400000) + 1;
  const todayProgress = userData.progress?.[todayStr] || {};
  const isMonday = today.getDay() === 1;

  const goals = userData.goals || {};
  const activeGoals = Object.entries(goals).filter(([id, goal]: [string, any]) => goal.active);

  const getDailyStepGoal = (dayCounter: number): number => {
    const week = Math.ceil(dayCounter / 7);
    if (week <= 4) return 10000;
    if (week <= 8) return 12000;
    return 15000;
  };

  const getDailyUdemyGoal = (dayCounter: number): number => {
    const week = Math.ceil(dayCounter / 7);
    if (week <= 4) return 30;
    if (week <= 12) return 45;
    return 60;
  };

  const calculateTodaysTotalPages = (todayProgress: any): number => {
    return todayProgress.readingLog ? Object.values(todayProgress.readingLog).reduce((sum: number, pages: any) => sum + (Number(pages) || 0), 0) : 0;
  };

  const calculateTodaysTotalUdemy = (todayProgress: any): number => {
    return todayProgress.udemy ? Object.values(todayProgress.udemy).reduce((sum: number, minutes: any) => sum + (Number(minutes) || 0), 0) : 0;
  };

  const taskCards = activeGoals.map(([goalId, goal]: [string, any]) => {
    let subtitle = '';

    switch (goal.type) {
      case 'number':
        if (goalId === 'steps') {
          subtitle = `${(todayProgress.steps || 0).toLocaleString('tr-TR')} / ${getDailyStepGoal(dayCounter).toLocaleString('tr-TR')} ${goal.unit}`;
        } else if (goalId === 'water') {
          subtitle = `${(todayProgress.water || 0).toLocaleString('tr-TR')} ${goal.unit} içildi`;
        } else {
          const currentValue = todayProgress[goalId] || 0;
          const dailyGoal = goal.baseTarget || 0;
          subtitle = dailyGoal > 0 ? `${currentValue} / ${dailyGoal} ${goal.unit}` : `${currentValue} ${goal.unit}`;
        }
        break;
      case 'reading':
        subtitle = `${calculateTodaysTotalPages(todayProgress)} sayfa okundu`;
        break;
      case 'udemy':
        subtitle = `${calculateTodaysTotalUdemy(todayProgress)} / ${getDailyUdemyGoal(dayCounter)} dakika`;
        break;
      case 'weight':
        if (goal.weeklyOnly && !isMonday) return null;
        subtitle = userData.weightLog && userData.weightLog[todayStr] ? userData.weightLog[todayStr] + ' kg' : 'Bugün kilonu gir';
        break;
      default:
        const value = todayProgress[goalId] || 0;
        subtitle = `${value} ${goal.unit}`;
    }

    return (
      <div key={goalId} className="glass-card p-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-white">{goal.name}</h3>
            <p className="text-sm text-gray-400">{subtitle}</p>
          </div>
          <button
            onClick={() => {
              if (goal.type === 'number') {
                openUpdateNumberModal(goal.name, goalId, todayProgress[goalId] || 0, updateUserData, todayStr);
              } else if (goal.type === 'reading') {
                openAddReadingLogModal(userData, updateUserData, todayStr);
              } else if (goal.type === 'udemy') {
                openUpdateUdemyModal(todayProgress.udemy || {}, updateUserData, todayStr);
              } else if (goal.type === 'weight') {
                openUpdateWeightModal(String(userData.weightLog?.[todayStr] || ''), updateUserData, todayStr);
              }
            }}
            className="bg-emerald-100 text-emerald-600 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-emerald-200 transition-colors"
          >
            +
          </button>
        </div>
      </div>
    );
  }).filter(Boolean);

  const openUpdateNumberModal = (title: string, key: string, currentValue: number, updateUserData: Function, todayStr: string) => {
    openModal(title, (
      <div>
        <input
          type="number"
          id="modal-number-input"
          defaultValue={currentValue}
          className="w-full form-input text-center text-2xl mb-4"
        />
        <button
          onClick={async () => {
            const input = document.getElementById('modal-number-input') as HTMLInputElement;
            await updateUserData({ [`progress.${todayStr}.${key}`]: parseInt(input.value) || 0 });
            openModal(null, null); // Close modal
          }}
          className="primary-btn w-full"
        >
          Kaydet
        </button>
      </div>
    ));
  };

  const openAddReadingLogModal = (userData: UserData, updateUserData: Function, todayStr: string) => {
    const books = userData.books || {};
    const currentlyReading = Object.entries(books).filter(([id, book]: [string, any]) => !book.finished);

    if (currentlyReading.length === 0) {
      openModal('Yeni Kitap Ekle', (
        <div>
          <input
            type="text"
            id="modal-book-title"
            placeholder="Kitap Adı"
            className="w-full form-input mb-4"
          />
          <button
            onClick={async () => {
              const input = document.getElementById('modal-book-title') as HTMLInputElement;
              const title = input.value;
              if (!title) return;
              const bookId = `book_${Date.now()}`;
              await updateUserData({ [`books.${bookId}`]: { title: title, finished: false, pagesRead: 0 } });
              openModal(null, null);
            }}
            className="primary-btn w-full"
          >
            Kitaplığıma Ekle
          </button>
        </div>
      ));
      return;
    }

    openModal('Okuma Kaydı Ekle', (
      <div className="space-y-4">
        <select id="modal-book-select" className="w-full form-input">
          {currentlyReading.map(([id, book]: [string, any]) => (
            <option key={id} value={id}>{book.title}</option>
          ))}
        </select>
        <input
          type="number"
          id="modal-pages-read"
          placeholder="Okunan sayfa sayısı"
          className="w-full form-input"
        />
        <div className="flex items-center">
          <input type="checkbox" id="modal-book-finished" className="h-4 w-4 mr-2 rounded" />
          <label htmlFor="modal-book-finished">Kitabı bitirdim</label>
        </div>
        <button
          onClick={async () => {
            const bookSelect = document.getElementById('modal-book-select') as HTMLSelectElement;
            const pagesInput = document.getElementById('modal-pages-read') as HTMLInputElement;
            const finishedCheck = document.getElementById('modal-book-finished') as HTMLInputElement;
            
            const bookId = bookSelect.value;
            const pages = parseInt(pagesInput.value) || 0;
            const finished = finishedCheck.checked;
            
            if (!bookId || pages <= 0) return;

            const updates: any = {
              [`progress.${todayStr}.readingLog.${bookId}`]: pages,
              [`books.${bookId}.pagesRead`]: (userData.books![bookId].pagesRead || 0) + pages
            };
            if (finished) updates[`books.${bookId}.finished`] = true;
            
            await updateUserData(updates);
            openModal(null, null);
          }}
          className="primary-btn w-full"
        >
          Kaydet
        </button>
      </div>
    ));
  };

  const openUpdateUdemyModal = (currentValues: any, updateUserData: Function, todayStr: string) => {
    openModal('Eğitim Videoları İlerlemesi (dk)', (
      <div className="space-y-4">
        <div>
          <label className="font-semibold text-gray-200">Kodlama Eğitimleri</label>
          <input type="number" id="udemy-coding" defaultValue={currentValues.coding || 0} className="w-full form-input mt-1" />
        </div>
        <div>
          <label className="font-semibold text-gray-200">Tasarım Eğitimleri</label>
          <input type="number" id="udemy-design" defaultValue={currentValues.design || 0} className="w-full form-input mt-1" />
        </div>
        <div>
          <label className="font-semibold text-gray-200">Finans Eğitimleri</label>
          <input type="number" id="udemy-finance" defaultValue={currentValues.finance || 0} className="w-full form-input mt-1" />
        </div>
        <button
          onClick={async () => {
            const coding = (document.getElementById('udemy-coding') as HTMLInputElement).value;
            const design = (document.getElementById('udemy-design') as HTMLInputElement).value;
            const finance = (document.getElementById('udemy-finance') as HTMLInputElement).value;
            
            const udemyProgress = {
              coding: parseInt(coding) || 0,
              design: parseInt(design) || 0,
              finance: parseInt(finance) || 0,
            };
            
            await updateUserData({ [`progress.${todayStr}.udemy`]: udemyProgress });
            openModal(null, null);
          }}
          className="primary-btn w-full"
        >
          Kaydet
        </button>
      </div>
    ));
  };

  const openUpdateWeightModal = (currentWeight: string, updateUserData: Function, todayStr: string) => {
    openModal('Haftalık Kilo Girişi', (
      <div>
        <input
          type="number"
          step="0.1"
          id="modal-weight-input"
          defaultValue={currentWeight}
          placeholder="Örn: 85.5"
          className="w-full form-input text-center text-2xl mb-4"
        />
        <button
          onClick={async () => {
            const input = document.getElementById('modal-weight-input') as HTMLInputElement;
            const weight = parseFloat(input.value);
            if (!weight || weight <= 0) return;
            await updateUserData({ [`weightLog.${todayStr}`]: weight });
            openModal(null, null);
          }}
          className="primary-btn w-full"
        >
          Kaydet
        </button>
      </div>
    ));
  };

  return (
    <div>
      <h2 className="text-3xl font-bold mb-1">Bugün</h2>
      <p className="text-sm text-gray-400 mb-6">Dönüşüm Kampı: <span className="font-bold text-emerald-600">{dayCounter}</span>. Gün</p>
      <div className="space-y-4">
        {taskCards}
      </div>
    </div>
  );
};

const BooksView: React.FC<{ userData: UserData; updateUserData: Function; openModal: Function }> = ({ userData, updateUserData, openModal }) => {
  const books = userData.books || {};
  const currentlyReading = Object.entries(books).filter(([id, book]: [string, any]) => !book.finished);
  const finishedBooks = Object.entries(books).filter(([id, book]: [string, any]) => book.finished);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold">Kitaplık</h2>
        <button
          onClick={() => {
            openModal('Yeni Kitap Ekle', (
              <div>
                <input
                  type="text"
                  id="modal-book-title"
                  placeholder="Kitap Adı"
                  className="w-full form-input mb-4"
                />
                <button
                  onClick={async () => {
                    const input = document.getElementById('modal-book-title') as HTMLInputElement;
                    const title = input.value;
                    if (!title) return;
                    const bookId = `book_${Date.now()}`;
                    await updateUserData({ [`books.${bookId}`]: { title: title, finished: false, pagesRead: 0 } });
                    openModal(null, null);
                  }}
                  className="primary-btn w-full"
                >
                  Kitaplığıma Ekle
                </button>
              </div>
            ));
          }}
          className="primary-btn text-sm"
        >
          Yeni Kitap Ekle
        </button>
      </div>
      <div className="glass-card p-6">
        <h3 className="text-xl font-bold mb-4">Okuduklarım</h3>
        <div className="space-y-3">
          {currentlyReading.length > 0 ? currentlyReading.map(([id, book]: [string, any]) => (
            <div key={id} className="form-input p-3 rounded-lg border border-gray-200">
              {book.title}
            </div>
          )) : <p className="text-sm text-gray-400">Şu an okuduğun bir kitap yok.</p>}
        </div>
        <h3 className="text-xl font-bold mt-8 mb-4">Bitirdiklerim</h3>
        <div className="space-y-3">
          {finishedBooks.length > 0 ? finishedBooks.map(([id, book]: [string, any]) => (
            <div key={id} className="form-input p-3 rounded-lg border border-gray-200 opacity-70">
              {book.title}
            </div>
          )) : <p className="text-sm text-gray-400">Henüz bir kitap bitirmedin.</p>}
        </div>
      </div>
    </div>
  );
};

const ProgressView: React.FC<{ userData: UserData }> = ({ userData }) => {
  const calculateTotals = () => {
    if (!userData.progress) return { totals: { steps: 0, pages: 0, booksFinished: 0 }, weightChange: { start: 0, current: 0, change: 0 } };
    
    const allProgress = Object.values(userData.progress);
    const books = userData.books || {};
    const weightLog = userData.weightLog || {};
    const sortedWeights = Object.entries(weightLog).sort(([dateA], [dateB]) => new Date(dateA).getTime() - new Date(dateB).getTime());
    const startWeight = sortedWeights.length > 0 ? sortedWeights[0][1] : 0;
    const currentWeight = sortedWeights.length > 0 ? sortedWeights[sortedWeights.length - 1][1] : 0;

    return {
      totals: {
        steps: allProgress.reduce((s, d: any) => s + (d.steps || 0), 0),
        pages: Object.values(books).reduce((s, b: any) => s + (b.pagesRead || 0), 0),
        booksFinished: Object.values(books).filter((b: any) => b.finished).length,
        udemyMinutes: allProgress.reduce((s, d: any) => {
          if (d.udemy) {
            return s + Object.values(d.udemy).reduce((sum: any, minutes: any) => sum + minutes, 0);
          }
          return s;
        }, 0)
      },
      weightChange: { start: startWeight, current: currentWeight, change: currentWeight - startWeight }
    };
  };

  const { totals, weightChange } = calculateTotals();

  const progressItems = [
    { label: 'Toplam Adım', value: totals.steps, goal: 350000 * 6 },
    { label: 'Toplam Sayfa', value: totals.pages, goal: 2000 * 6 },
    { label: 'Bitirilen Kitap', value: totals.booksFinished, goal: (userData.settings?.bookGoal || 8) * 6 },
    { label: 'Eğitim Videoları', value: totals.udemyMinutes, goal: 8100, unit: 'dakika' },
    { label: 'Kilo Değişimi', value: `${weightChange.start}kg ➔ ${weightChange.current}kg`, special: `(${weightChange.change > 0 ? '+' : ''}${weightChange.change.toFixed(1)} kg)` },
  ];

  return (
    <div>
      <h2 className="text-3xl font-bold mb-6">Genel İlerleme</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {progressItems.map((item, index) => {
          if (item.special) {
            return (
              <div key={index} className="glass-card p-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-bold text-gray-200">{item.label}</h4>
                  <span className={`font-bold text-lg ${weightChange.change < 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {item.special}
                  </span>
                </div>
                <p className="text-center text-gray-400 text-sm mt-2">{item.value}</p>
              </div>
            );
          }
          
          const percentage = (item.goal && item.goal > 0) ? Math.min(100, (item.value / item.goal) * 100) : 0;
          const unit = item.unit ? ` ${item.unit}` : '';
          
          return (
            <div key={index} className="glass-card p-4">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-sm font-bold text-gray-200">{item.label}</h4>
                <p className="text-xs text-gray-400">
                  {parseFloat(item.value.toString()).toLocaleString('tr-TR')} / {item.goal?.toLocaleString('tr-TR') || 0}{unit}
                </p>
              </div>
              <div className="w-full bg-gray-600 rounded-full h-2.5">
                <div
                  className="bg-emerald-500 h-2.5 rounded-full"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const GoalsView: React.FC<{ userData: UserData; updateUserData: Function; openModal: Function }> = ({ userData, updateUserData, openModal }) => {
  const goals = userData.goals || {};
  const goalEntries = Object.entries(goals);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold">Hedefler</h2>
        <button className="primary-btn text-sm">
          <i className="fa-solid fa-plus mr-2"></i>Yeni Hedef
        </button>
      </div>
      <div className="space-y-4">
        {goalEntries.map(([goalId, goal]: [string, any]) => {
          const statusIcon = goal.active ?
            <i className="fa-solid fa-check-circle text-emerald-500"></i> :
            <i className="fa-solid fa-times-circle text-gray-500"></i>;

          return (
            <div key={goalId} className="glass-card p-4 flex justify-between items-center">
              <div className="flex items-center space-x-3">
                {statusIcon}
                <div>
                  <h3 className="font-semibold text-white">{goal.name}</h3>
                  <p className="text-sm text-gray-400">{goal.type} • {goal.unit}</p>
                </div>
              </div>
              <div className="flex space-x-2">
                <button className="text-blue-400 hover:text-blue-300 p-2">
                  <i className="fa-solid fa-edit"></i>
                </button>
                <button
                  onClick={async () => {
                    await updateUserData({ [`goals.${goalId}.active`]: !goal.active });
                  }}
                  className="text-gray-400 hover:text-gray-300 p-2"
                >
                  <i className={`fa-solid fa-${goal.active ? 'pause' : 'play'}`}></i>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SettingsView: React.FC<{ userData: UserData; updateUserData: Function; user: any }> = ({ userData, updateUserData, user }) => {
  return (
    <div>
      <h2 className="text-3xl font-bold mb-6">Ayarlar</h2>
      <div className="glass-card p-6 space-y-6">
        <div>
          <p className="text-sm text-gray-300">Kullanıcı: <span className="font-semibold">{user?.email}</span></p>
        </div>
        <div className="border-t border-white/10 pt-6">
          <p className="text-sm text-gray-400 mb-2">Yeni bir başlangıç yapmak için mevcut ilerlemenizi sıfırlayabilirsiniz. Bu işlem geri alınamaz.</p>
          <button
            onClick={async () => {
              if (window.confirm('Programı sıfırlamak istediğinizden emin misiniz? Bu işlem geri alınamaz.')) {
                try {
                  await setDoc(doc(db, "users", user.uid), {});
                  window.location.reload();
                } catch (error) {
                  console.error('Sıfırlama hatası:', error);
                }
              }
            }}
            className="px-5 py-2 bg-yellow-400 text-yellow-800 font-bold rounded-lg hover:bg-yellow-500 transition-colors text-sm"
          >
            Programı Sıfırla
          </button>
        </div>
      </div>
    </div>
  );
};

export default Hedef;