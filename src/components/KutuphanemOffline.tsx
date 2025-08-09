import React, { useState, useEffect, useCallback } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { collection, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';
import dayjs from 'dayjs';
import localeData from 'dayjs/plugin/localeData';
import 'dayjs/locale/tr';

dayjs.extend(localeData);
dayjs.locale('tr');

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

interface Book {
  id: string;
  title: string;
  author: string;
  publisher?: string;
  status: 'Okunmadı' | 'Şu An Okuyorum' | 'Okudum' | 'Yarıda Bıraktım';
  format: 'Fiziksel Kitap' | 'E-Kitap' | 'Sesli Kitap';
  totalPages: number;
  currentPage?: number;
  coverUrl?: string;
  readingHistory?: Array<{
    date: string;
    value: number;
    type: 'pages' | 'minutes';
  }>;
  createdAt?: any;
  updatedAt?: any;
}

interface Settings {
  goals: {
    books: number;
    pages: number;
    minutes: number;
  };
  streak: {
    current: number;
    longest: number;
    lastDate: string | null;
  };
  notifications: boolean;
  theme: 'light' | 'dark';
}

const KutuphanemOffline: React.FC = () => {
  const { user } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [settings, setSettings] = useState<Settings>({
    goals: { books: 24, pages: 12000, minutes: 7200 },
    streak: { current: 7, longest: 15, lastDate: '2024-01-15' },
    notifications: true,
    theme: 'dark'
  });
  type ViewType = 'library' | 'reader' | 'statistics' | 'settings';
  const [currentView, setCurrentView] = useState<ViewType>('library');
  const [readerFile, setReaderFile] = useState<string | null>(null);
  const [readerFormat, setReaderFormat] = useState<'epub' | 'pdf' | 'txt'>('epub');
  const [showModal, setShowModal] = useState<'add' | 'edit' | 'progress' | 'goals' | null>(null);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [formData, setFormData] = useState<Partial<Book>>({});
  const [progressData, setProgressData] = useState({ value: 0, type: 'pages' as 'pages' | 'minutes' });

  // Load demo data
  const loadDemoData = useCallback(() => {
    const demoBooks: Book[] = [
      {
        id: '1',
        title: 'Suç ve Ceza',
        author: 'Fyodor Dostoyevski',
        publisher: 'İş Bankası Yayınları',
        status: 'Şu An Okuyorum',
        format: 'Fiziksel Kitap',
        totalPages: 650,
        currentPage: 234,
        coverUrl: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=300&h=400&fit=crop',
        readingHistory: [
          { date: '2024-01-15', value: 25, type: 'pages' },
          { date: '2024-01-14', value: 30, type: 'pages' }
        ]
      },
      {
        id: '2',
        title: 'Simyacı',
        author: 'Paulo Coelho',
        publisher: 'Can Yayınları',
        status: 'Okudum',
        format: 'E-Kitap',
        totalPages: 198,
        currentPage: 198,
        coverUrl: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=300&h=400&fit=crop'
      },
      {
        id: '3',
        title: 'Sapiens',
        author: 'Yuval Noah Harari',
        publisher: 'Kolektif Kitap',
        status: 'Okunmadı',
        format: 'Sesli Kitap',
        totalPages: 512,
        currentPage: 0
      }
    ];
    setBooks(demoBooks);
  }, []);

  // Load data from Firebase
  const loadData = useCallback(async () => {
    if (!user) return;
    
    try {
      // Kitapları subcollection'dan yükle
      const booksCollectionRef = collection(db, 'users', user.uid, 'library_books');
      const booksSnapshot = await getDocs(booksCollectionRef);
      const loadedBooks: Book[] = [];
      
      booksSnapshot.forEach((doc) => {
        loadedBooks.push({ id: doc.id, ...doc.data() } as Book);
      });
      
      // Ayarları ana dokümantan yükle
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);
      
      if (loadedBooks.length > 0) {
        setBooks(loadedBooks);
      } else {
        loadDemoData();
      }
      
      if (userDocSnap.exists() && userDocSnap.data().librarySettings) {
        setSettings(userDocSnap.data().librarySettings);
      }
      
    } catch (error) {
      console.error('Kütüphane veri yükleme hatası:', error);
      loadDemoData();
    }
  }, [user, loadDemoData]);

  // Save data to Firebase
  const saveData = useCallback(async () => {
    if (!user) return;
    
    try {
      // Ayarları ana dokümanda sakla
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, {
        librarySettings: settings,
        lastUpdated: serverTimestamp()
      }, { merge: true });
      
      // Not: Kitaplar ayrı ayrı subcollection'da saklanır, burası sadece ayarlar için
    } catch (error) {
      console.error('Kütüphane veri kaydetme hatası:', error);
    }
  }, [user, settings]);


  // Load data when user changes
  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, loadData]);

  // Save data when state changes
  useEffect(() => {
    if (user && books.length > 0) {
      saveData();
    }
  }, [user, books, settings, saveData]);

  const calculateStats = () => {
    const totalBooks = books.length;
    const readBooks = books.filter(book => book.status === 'Okudum').length;
    const currentlyReading = books.filter(book => book.status === 'Şu An Okuyorum').length;
    
    const totalPages = books.reduce((sum, book) => sum + (book.currentPage || 0), 0);
    const totalMinutes = books.reduce((sum, book) => {
      if (book.readingHistory) {
        return sum + book.readingHistory.reduce((hist, entry) => {
          return hist + (entry.type === 'minutes' ? entry.value : 0);
        }, 0);
      }
      return sum;
    }, 0);

    // Calculate current year progress (Jan 1 to Dec 31 of current year)
    const currentYear = dayjs().year();
    const yearStart = dayjs().startOf('year').format('YYYY-MM-DD');
    const yearEnd = dayjs().endOf('year').format('YYYY-MM-DD');
    
    // Count books finished this year
    const booksThisYear = books.filter(book => 
      book.status === 'Okudum' && 
      book.updatedAt && 
      dayjs(book.updatedAt).year() === currentYear
    ).length;
    
    // Calculate pages and minutes for current year only
    const pagesThisYear = books.reduce((sum, book) => {
      if (book.readingHistory) {
        return sum + book.readingHistory.reduce((hist, entry) => {
          const entryYear = dayjs(entry.date).year();
          if (entryYear === currentYear && entry.type === 'pages') {
            return hist + entry.value;
          }
          return hist;
        }, 0);
      }
      return sum;
    }, 0);
    
    const minutesThisYear = books.reduce((sum, book) => {
      if (book.readingHistory) {
        return sum + book.readingHistory.reduce((hist, entry) => {
          const entryYear = dayjs(entry.date).year();
          if (entryYear === currentYear && entry.type === 'minutes') {
            return hist + entry.value;
          }
          return hist;
        }, 0);
      }
      return sum;
    }, 0);

    // Calculate progress based on current year data
    const progressBooks = Math.round((booksThisYear / settings.goals.books) * 100);
    const progressPages = Math.round((pagesThisYear / settings.goals.pages) * 100);
    const progressMinutes = Math.round((minutesThisYear / settings.goals.minutes) * 100);

    // Calculate monthly statistics for the chart
    const monthlyStats = [];
    for (let month = 0; month < 12; month++) {
      const monthStart = dayjs().month(month).startOf('month');
      const monthEnd = dayjs().month(month).endOf('month');
      
      const monthBooks = books.filter(book => {
        if (book.status !== 'Okudum' || !book.updatedAt) return false;
        const bookDate = dayjs(book.updatedAt);
        return bookDate.isAfter(monthStart) && bookDate.isBefore(monthEnd);
      }).length;
      
      monthlyStats.push({
        month: monthStart.format('MMM'),
        books: monthBooks
      });
    }

    return {
      totalBooks,
      readBooks,
      currentlyReading,
      totalPages,
      totalMinutes,
      booksThisYear,
      pagesThisYear, 
      minutesThisYear,
      progressBooks,
      progressPages,
      progressMinutes,
      monthlyStats,
      currentYear
    };
  };

  const addBook = () => {
    if (!formData.title || !formData.author || !formData.totalPages) return;

    const newBook: Book = {
      id: Date.now().toString(),
      title: formData.title,
      author: formData.author,
      publisher: formData.publisher,
      status: formData.status || 'Okunmadı',
      format: formData.format || 'Fiziksel Kitap',
      totalPages: formData.totalPages,
      currentPage: 0,
      coverUrl: formData.coverUrl,
      readingHistory: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    setBooks([...books, newBook]);
    setShowModal(null);
    setFormData({});
  };

  // Note: updateBook function is defined but not used in demo version
  // const updateBook = () => {
  //   if (!selectedBook || !formData.title || !formData.author) return;

  //   const updatedBooks = books.map(book => 
  //     book.id === selectedBook.id 
  //       ? { ...book, ...formData, updatedAt: new Date() }
  //       : book
  //   );

  //   setBooks(updatedBooks);
  //   setShowModal(null);
  //   setSelectedBook(null);
  //   setFormData({});
  // };

  const deleteBook = (bookToDelete: Book) => {
    if (!window.confirm('Bu kitabı silmek istediğinizden emin misiniz?')) return;
    setBooks(books.filter(book => book.id !== bookToDelete.id));
  };

  const updateStreak = useCallback(() => {
    const today = dayjs().format('YYYY-MM-DD');
    const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    
    // Check if there's reading activity today
    const todayActivity = books.some(book => 
      book.readingHistory?.some(entry => entry.date === today && entry.value > 0)
    );
    
    if (!todayActivity) return settings;
    
    const lastDate = settings.streak.lastDate;
    let newStreak = { ...settings.streak };
    
    if (!lastDate) {
      // First time tracking
      newStreak = {
        current: 1,
        longest: Math.max(1, settings.streak.longest),
        lastDate: today
      };
    } else if (lastDate === today) {
      // Already updated today
      return settings;
    } else if (lastDate === yesterday) {
      // Continue streak
      newStreak = {
        current: settings.streak.current + 1,
        longest: Math.max(settings.streak.current + 1, settings.streak.longest),
        lastDate: today
      };
    } else {
      // Streak broken, start new
      newStreak = {
        current: 1,
        longest: Math.max(1, settings.streak.longest),
        lastDate: today
      };
    }
    
    const newSettings = { ...settings, streak: newStreak };
    setSettings(newSettings);
    return newSettings;
  }, [books, settings]);

  const addProgress = () => {
    if (!selectedBook || !progressData.value) return;

    const today = dayjs().format('YYYY-MM-DD');
    const updatedBooks = books.map(book => {
      if (book.id === selectedBook.id) {
        const currentHistory = book.readingHistory || [];
        const todayIndex = currentHistory.findIndex(entry => entry.date === today);
        
        let newHistory;
        if (todayIndex >= 0) {
          newHistory = [...currentHistory];
          newHistory[todayIndex] = {
            date: today,
            value: newHistory[todayIndex].value + progressData.value,
            type: progressData.type
          };
        } else {
          newHistory = [...currentHistory, {
            date: today,
            value: progressData.value,
            type: progressData.type
          }];
        }

        let newCurrentPage = book.currentPage || 0;
        if (progressData.type === 'pages') {
          newCurrentPage = Math.min(newCurrentPage + progressData.value, book.totalPages);
        }

        let newStatus = book.status;
        if (newCurrentPage >= book.totalPages && book.status !== 'Okudum') {
          newStatus = 'Okudum';
        } else if (newCurrentPage > 0 && book.status === 'Okunmadı') {
          newStatus = 'Şu An Okuyorum';
        }

        return {
          ...book,
          readingHistory: newHistory,
          currentPage: newCurrentPage,
          status: newStatus,
          updatedAt: new Date()
        };
      }
      return book;
    });

    setBooks(updatedBooks);
    
    // Update streak after progress is added
    setTimeout(updateStreak, 100);
    
    setShowModal(null);
    setSelectedBook(null);
    setProgressData({ value: 0, type: 'pages' });
  };

  const openEditModal = (book: Book) => {
    setSelectedBook(book);
    setFormData(book);
    setShowModal('edit');
  };

  const openProgressModal = (book: Book) => {
    setSelectedBook(book);
    setProgressData({ value: 0, type: 'pages' });
    setShowModal('progress');
  };

  const stats = calculateStats();

  if (currentView === 'reader') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-800 text-white">
        <div className="flex h-screen">
          {/* Reader Sidebar */}
          <div className="w-80 bg-black/20 backdrop-blur-sm border-r border-white/10 p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Okuyucu</h2>
              <button 
                onClick={() => setCurrentView('library')}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            {/* File Upload */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Dosya Seç</label>
              <input
                type="file"
                accept=".epub,.pdf,.txt"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const url = URL.createObjectURL(file);
                    setReaderFile(url);
                    const ext = file.name.split('.').pop()?.toLowerCase();
                    if (ext === 'epub' || ext === 'pdf' || ext === 'txt') {
                      setReaderFormat(ext);
                    }
                  }
                }}
                className="w-full p-2 bg-white/10 border border-white/20 rounded-lg text-sm"
              />
            </div>

            {/* Reader Settings */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Yazı Boyutu</label>
                <input
                  type="range"
                  min="12"
                  max="24"
                  defaultValue="16"
                  className="w-full"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Tema</label>
                <select className="w-full p-2 bg-white/10 border border-white/20 rounded-lg text-sm">
                  <option value="dark">Koyu</option>
                  <option value="light">Açık</option>
                  <option value="sepia">Sepia</option>
                </select>
              </div>
            </div>
          </div>

          {/* Reader Content */}
          <div className="flex-1 p-6">
            <div className="h-full bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center">
              {readerFile ? (
                <div className="w-full h-full">
                  {readerFormat === 'pdf' && (
                    <iframe 
                      src={readerFile} 
                      className="w-full h-full rounded-xl"
                      title="PDF Reader"
                    />
                  )}
                  {readerFormat === 'txt' && (
                    <div className="p-8 h-full overflow-y-auto">
                      <div className="max-w-4xl mx-auto prose prose-invert">
                        <p>Metin dosyası yüklendi. İçerik burada gösterilecek.</p>
                      </div>
                    </div>
                  )}
                  {readerFormat === 'epub' && (
                    <div className="p-8 h-full overflow-y-auto">
                      <div className="max-w-4xl mx-auto prose prose-invert">
                        <p>EPUB dosyası yüklendi. Kitap içeriği burada gösterilecek.</p>
                        <p className="text-gray-400">ePub.js kütüphanesi entegrasyonu gerekli.</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-gray-400">
                  <i className="fas fa-book-open text-6xl mb-4 opacity-50"></i>
                  <h3 className="text-xl font-semibold mb-2">Okuyucu Hazır</h3>
                  <p>Sol panelden bir dosya seçin</p>
                  <p className="text-sm mt-2">Desteklenen formatlar: EPUB, PDF, TXT</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 md:p-8">
      <div className="background-container fixed top-0 left-0 w-full h-full overflow-hidden -z-10">
        <div className="aurora-bg absolute w-[150%] h-[150%] bg-gradient-to-br from-indigo-500/20 via-transparent to-blue-500/20 animate-aurora"></div>
      </div>
      
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <i className="fas fa-library text-2xl text-indigo-400"></i>
              <h1 className="text-2xl font-bold text-white">Kütüphanem</h1>
              <span className="bg-blue-500/20 text-blue-300 px-2 py-1 rounded-full text-xs">Offline Mod</span>
            </div>
            
            <div className="flex items-center gap-4">
              <nav className="flex gap-2 bg-white/10 rounded-lg p-1">
                <button
                  onClick={() => setCurrentView('library')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentView === 'library'
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  <i className="fas fa-books mr-2"></i>
                  Kütüphane
                </button>
                
                <button
                  onClick={() => setCurrentView('reader')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentView === ('reader' as ViewType)
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  <i className="fas fa-book-reader mr-2"></i>
                  Okuyucu
                </button>
                
                <button
                  onClick={() => setCurrentView('statistics')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentView === 'statistics'
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  <i className="fas fa-chart-bar mr-2"></i>
                  İstatistikler
                </button>
                
                <button
                  onClick={() => setCurrentView('settings')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentView === 'settings'
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  <i className="fas fa-cog mr-2"></i>
                  Ayarlar
                </button>
              </nav>
            </div>
          </div>
        </header>

        {/* Library View */}
        {currentView === 'library' && (
          <>
            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="glass-card p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center">
                    <i className="fas fa-book text-indigo-400"></i>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Toplam Kitap</p>
                    <p className="text-xl font-bold text-white">{stats.totalBooks}</p>
                  </div>
                </div>
              </div>
              
              <div className="glass-card p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                    <i className="fas fa-check text-emerald-400"></i>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Okunan</p>
                    <p className="text-xl font-bold text-white">{stats.readBooks}</p>
                  </div>
                </div>
              </div>
              
              <div className="glass-card p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
                    <i className="fas fa-bookmark text-orange-400"></i>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Okuyorum</p>
                    <p className="text-xl font-bold text-white">{stats.currentlyReading}</p>
                  </div>
                </div>
              </div>
              
              <div className="glass-card p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    <i className="fas fa-fire text-purple-400"></i>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Streak</p>
                    <p className="text-xl font-bold text-white">{settings.streak.current}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 mb-8">
              <button
                onClick={() => setShowModal('add')}
                className="primary-btn flex items-center gap-2"
              >
                <i className="fas fa-plus"></i>
                Yeni Kitap Ekle
              </button>
              
              <button
                onClick={() => setShowModal('goals')}
                className="secondary-btn flex items-center gap-2"
              >
                <i className="fas fa-target"></i>
                Hedefleri Düzenle
              </button>
            </div>

            {/* Books Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
              {books.map((book) => (
                <div key={book.id} className="glass-card group hover:scale-105 transition-transform duration-300">
                  <div className="aspect-[3/4] relative overflow-hidden rounded-t-xl">
                    {book.coverUrl ? (
                      <img 
                        src={book.coverUrl} 
                        alt={book.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center">
                        <i className="fas fa-book text-4xl text-white/80"></i>
                      </div>
                    )}
                    
                    {/* Progress bar */}
                    <div className="absolute bottom-0 left-0 right-0 h-2 bg-black/30">
                      <div 
                        className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600"
                        style={{ width: `${Math.min(((book.currentPage || 0) / book.totalPages) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                  
                  <div className="p-4">
                    <h3 className="font-semibold text-white text-sm mb-1 line-clamp-2" title={book.title}>
                      {book.title}
                    </h3>
                    <p className="text-xs text-gray-400 mb-2 line-clamp-1" title={book.author}>
                      {book.author}
                    </p>
                    
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        book.status === 'Okudum' ? 'bg-emerald-500/20 text-emerald-300' :
                        book.status === 'Şu An Okuyorum' ? 'bg-orange-500/20 text-orange-300' :
                        book.status === 'Yarıda Bıraktım' ? 'bg-red-500/20 text-red-300' :
                        'bg-gray-500/20 text-gray-300'
                      }`}>
                        {book.status}
                      </span>
                    </div>
                    
                    <p className="text-xs text-gray-500 mb-3">
                      {book.currentPage || 0} / {book.totalPages} sayfa
                    </p>
                    
                    <div className="flex items-center justify-between">
                      <button 
                        onClick={() => openProgressModal(book)}
                        className="text-indigo-400 hover:text-indigo-300 text-sm font-medium"
                      >
                        <i className="fas fa-plus-circle mr-1"></i>
                        İlerleme
                      </button>
                      
                      <div className="flex gap-2">
                        <button 
                          onClick={() => openEditModal(book)}
                          className="text-gray-400 hover:text-white"
                        >
                          <i className="fas fa-edit text-sm"></i>
                        </button>
                        
                        <button 
                          onClick={() => deleteBook(book)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <i className="fas fa-trash text-sm"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Statistics View */}
        {currentView === 'statistics' && (
          <div className="space-y-8">
            {/* Progress Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">Kitap Hedefi</h3>
                  <i className="fas fa-book text-indigo-400"></i>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">İlerleme</span>
                    <span className="text-white">{stats.booksThisYear} / {settings.goals.books}</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(stats.progressBooks, 100)}%` }}
                    />
                  </div>
                  <p className="text-right text-xs text-gray-400">{stats.progressBooks}%</p>
                </div>
              </div>
              
              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">Sayfa Hedefi</h3>
                  <i className="fas fa-file-alt text-emerald-400"></i>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">İlerleme</span>
                    <span className="text-white">{stats.pagesThisYear} / {settings.goals.pages}</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(stats.progressPages, 100)}%` }}
                    />
                  </div>
                  <p className="text-right text-xs text-gray-400">{stats.progressPages}%</p>
                </div>
              </div>
              
              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">Dakika Hedefi</h3>
                  <i className="fas fa-clock text-orange-400"></i>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">İlerleme</span>
                    <span className="text-white">{stats.minutesThisYear} / {settings.goals.minutes}</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-orange-500 to-orange-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(stats.progressMinutes, 100)}%` }}
                    />
                  </div>
                  <p className="text-right text-xs text-gray-400">{stats.progressMinutes}%</p>
                </div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="glass-card p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Kitap Durumları</h3>
                <div className="h-64">
                  <Doughnut
                    data={{
                      labels: ['Okudum', 'Şu An Okuyorum', 'Okunmadı', 'Yarıda Bıraktım'],
                      datasets: [{
                        data: [
                          books.filter(b => b.status === 'Okudum').length,
                          books.filter(b => b.status === 'Şu An Okuyorum').length,
                          books.filter(b => b.status === 'Okunmadı').length,
                          books.filter(b => b.status === 'Yarıda Bıraktım').length,
                        ],
                        backgroundColor: [
                          'rgba(34, 197, 94, 0.8)',
                          'rgba(249, 115, 22, 0.8)',
                          'rgba(107, 114, 128, 0.8)',
                          'rgba(239, 68, 68, 0.8)',
                        ],
                        borderColor: [
                          'rgba(34, 197, 94, 1)',
                          'rgba(249, 115, 22, 1)',
                          'rgba(107, 114, 128, 1)',
                          'rgba(239, 68, 68, 1)',
                        ],
                        borderWidth: 1
                      }]
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          position: 'bottom',
                          labels: {
                            color: 'rgb(229, 231, 235)',
                            padding: 20
                          }
                        }
                      }
                    }}
                  />
                </div>
              </div>
              
              <div className="glass-card p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Kitap Formatları</h3>
                <div className="h-64">
                  <Bar
                    data={{
                      labels: ['Fiziksel Kitap', 'E-Kitap', 'Sesli Kitap'],
                      datasets: [{
                        label: 'Kitap Sayısı',
                        data: [
                          books.filter(b => b.format === 'Fiziksel Kitap').length,
                          books.filter(b => b.format === 'E-Kitap').length,
                          books.filter(b => b.format === 'Sesli Kitap').length,
                        ],
                        backgroundColor: [
                          'rgba(99, 102, 241, 0.8)',
                          'rgba(168, 85, 247, 0.8)',
                          'rgba(236, 72, 153, 0.8)',
                        ],
                        borderColor: [
                          'rgba(99, 102, 241, 1)',
                          'rgba(168, 85, 247, 1)',
                          'rgba(236, 72, 153, 1)',
                        ],
                        borderWidth: 1
                      }]
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          display: false
                        }
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                          grid: {
                            color: 'rgba(75, 85, 99, 0.3)'
                          },
                          ticks: {
                            color: 'rgb(229, 231, 235)'
                          }
                        },
                        x: {
                          grid: {
                            color: 'rgba(75, 85, 99, 0.3)'
                          },
                          ticks: {
                            color: 'rgb(229, 231, 235)'
                          }
                        }
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Settings View */}
        {currentView === 'settings' && (
          <div className="max-w-2xl mx-auto space-y-8">
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold text-white mb-6">Genel Ayarlar</h3>
              
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-white">Bildirimler</label>
                    <p className="text-xs text-gray-400">Günlük okuma hatırlatmaları</p>
                  </div>
                  <button
                    onClick={() => setSettings({
                      ...settings,
                      notifications: !settings.notifications
                    })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.notifications ? 'bg-indigo-600' : 'bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.notifications ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
            
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold text-white mb-6">Streak Bilgileri</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-indigo-400">{settings.streak.current}</p>
                  <p className="text-sm text-gray-400">Mevcut Streak</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-purple-400">{settings.streak.longest}</p>
                  <p className="text-sm text-gray-400">En Uzun Streak</p>
                </div>
              </div>
              
              {settings.streak.lastDate && (
                <p className="text-center text-xs text-gray-500 mt-4">
                  Son güncelleme: {dayjs(settings.streak.lastDate).format('DD MMMM YYYY')}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showModal === 'add' && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Yeni Kitap Ekle</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Kitap Adı</label>
                <input
                  type="text"
                  value={formData.title || ''}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                  placeholder="Kitap adını girin"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Yazar</label>
                <input
                  type="text"
                  value={formData.author || ''}
                  onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                  placeholder="Yazar adını girin"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Durum</label>
                  <select
                    value={formData.status || 'Okunmadı'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as Book['status'] })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="Okunmadı">Okunmadı</option>
                    <option value="Şu An Okuyorum">Şu An Okuyorum</option>
                    <option value="Okudum">Okudum</option>
                    <option value="Yarıda Bıraktım">Yarıda Bıraktım</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Format</label>
                  <select
                    value={formData.format || 'Fiziksel Kitap'}
                    onChange={(e) => setFormData({ ...formData, format: e.target.value as Book['format'] })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="Fiziksel Kitap">Fiziksel Kitap</option>
                    <option value="E-Kitap">E-Kitap</option>
                    <option value="Sesli Kitap">Sesli Kitap</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Toplam Sayfa</label>
                <input
                  type="number"
                  value={formData.totalPages || ''}
                  onChange={(e) => setFormData({ ...formData, totalPages: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                  placeholder="Toplam sayfa sayısını girin"
                  min="1"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={addBook}
                disabled={!formData.title || !formData.author || !formData.totalPages}
                className="flex-1 primary-btn disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Kitap Ekle
              </button>
              
              <button
                onClick={() => {
                  setShowModal(null);
                  setFormData({});
                }}
                className="flex-1 secondary-btn"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal === 'progress' && selectedBook && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-white mb-4">İlerleme Ekle</h3>
            <p className="text-gray-400 mb-4">{selectedBook.title}</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">İlerleme Türü</label>
                <select
                  value={progressData.type}
                  onChange={(e) => setProgressData({ ...progressData, type: e.target.value as 'pages' | 'minutes' })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="pages">Sayfa</option>
                  <option value="minutes">Dakika</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {progressData.type === 'pages' ? 'Okunan Sayfa Sayısı' : 'Okuma Süresi (Dakika)'}
                </label>
                <input
                  type="number"
                  value={progressData.value || ''}
                  onChange={(e) => setProgressData({ ...progressData, value: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                  placeholder={progressData.type === 'pages' ? 'Sayfa sayısını girin' : 'Dakika girin'}
                  min="1"
                />
              </div>
              
              {progressData.type === 'pages' && (
                <p className="text-xs text-gray-400">
                  Mevcut: {selectedBook.currentPage || 0} / {selectedBook.totalPages} sayfa
                </p>
              )}
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={addProgress}
                disabled={!progressData.value}
                className="flex-1 primary-btn disabled:opacity-50 disabled:cursor-not-allowed"
              >
                İlerleme Ekle
              </button>
              
              <button
                onClick={() => {
                  setShowModal(null);
                  setSelectedBook(null);
                  setProgressData({ value: 0, type: 'pages' });
                }}
                className="flex-1 secondary-btn"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Goals Modal */}
      {showModal === 'goals' && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">Hedeflerini Ayarla</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Yıllık Kitap Hedefi</label>
                <input
                  type="number"
                  value={settings.goals.books}
                  onChange={(e) => setSettings({
                    ...settings,
                    goals: { ...settings.goals, books: parseInt(e.target.value) || 0 }
                  })}
                  className="w-full bg-gray-900/50 border border-gray-600/50 rounded-lg px-4 py-3 text-white"
                  placeholder="24"
                  min="1"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Yıllık Sayfa Hedefi</label>
                <input
                  type="number"
                  value={settings.goals.pages}
                  onChange={(e) => setSettings({
                    ...settings,
                    goals: { ...settings.goals, pages: parseInt(e.target.value) || 0 }
                  })}
                  className="w-full bg-gray-900/50 border border-gray-600/50 rounded-lg px-4 py-3 text-white"
                  placeholder="12000"
                  min="1"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Yıllık Dakika Hedefi</label>
                <input
                  type="number"
                  value={settings.goals.minutes}
                  onChange={(e) => setSettings({
                    ...settings,
                    goals: { ...settings.goals, minutes: parseInt(e.target.value) || 0 }
                  })}
                  className="w-full bg-gray-900/50 border border-gray-600/50 rounded-lg px-4 py-3 text-white"
                  placeholder="7200"
                  min="1"
                />
              </div>
              
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 mt-4">
                <h4 className="text-sm font-medium text-blue-400 mb-2">Mevcut İlerleme</h4>
                <div className="space-y-1 text-xs text-gray-300">
                  <div className="flex justify-between">
                    <span>Kitaplar:</span>
                    <span>{stats.booksThisYear} / {settings.goals.books} ({stats.progressBooks}%)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Sayfalar:</span>
                    <span>{stats.pagesThisYear} / {settings.goals.pages} ({stats.progressPages}%)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Dakikalar:</span>
                    <span>{stats.minutesThisYear} / {settings.goals.minutes} ({stats.progressMinutes}%)</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(null)}
                className="flex-1 primary-btn"
              >
                Kaydet
              </button>
              <button
                onClick={() => setShowModal(null)}
                className="flex-1 secondary-btn"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      <style>
        {`
        .primary-btn {
          background-color: #4f46e5;
          color: white;
          font-weight: 600;
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          transition: background-color 0.2s;
        }
        .primary-btn:hover {
          background-color: #3730a3;
        }
        .secondary-btn {
          background-color: #4b5563;
          color: white;
          font-weight: 600;
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          transition: background-color 0.2s;
        }
        .secondary-btn:hover {
          background-color: #374151;
        }
        .glass-card {
          background: rgba(17, 24, 39, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-radius: 1.5rem;
          padding: 1rem;
        }
        .aurora-bg {
          animation: moveAurora 25s alternate infinite ease-in-out;
        }
        @keyframes moveAurora {
          0% { transform: translate(-20%, -20%) rotate(0deg); }
          100% { transform: translate(20%, 20%) rotate(180deg); }
        }
        .line-clamp-1 {
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
        }
        .line-clamp-2 {
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        `}
      </style>
    </div>
  );
};

export default KutuphanemOffline;