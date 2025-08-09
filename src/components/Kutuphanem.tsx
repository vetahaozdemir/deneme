import React, { useState, useEffect, useRef } from 'react';
import { collection, doc, query, onSnapshot, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { db, storage } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';
import dayjs from 'dayjs';
import localeData from 'dayjs/plugin/localeData';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import 'dayjs/locale/tr';
import Okuyucu from './Okuyucu';

dayjs.extend(localeData);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
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
  coverPath?: string;
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

const Kutuphanem: React.FC = () => {
  const { user } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [settings, setSettings] = useState<Settings>({
    goals: { books: 24, pages: 12000, minutes: 7200 },
    streak: { current: 0, longest: 0, lastDate: null },
    notifications: true,
    theme: 'dark'
  });
  const [currentView, setCurrentView] = useState<'library' | 'reader' | 'statistics' | 'settings'>('library');
  const [showModal, setShowModal] = useState<'add' | 'edit' | 'progress' | 'goals' | null>(null);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [formData, setFormData] = useState<Partial<Book>>({});
  const [progressData, setProgressData] = useState({ value: 0, type: 'pages' as 'pages' | 'minutes' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load data on mount
  useEffect(() => {
    if (user) {
      const unsubscribe = loadBooks();
      loadSettings();
      return unsubscribe;
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Books değiştiğinde streak'i güncelle
  useEffect(() => {
    if (books.length > 0) {
      updateStreak();
    }
  }, [books]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadBooks = () => {
    if (!user) return;
    
    const q = query(collection(db, 'users', user.uid, 'books'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bookList: Book[] = [];
      snapshot.forEach((doc) => {
        bookList.push({ id: doc.id, ...doc.data() } as Book);
      });
      setBooks(bookList);
    });

    return unsubscribe;
  };

  const loadSettings = async () => {
    if (!user) return;
    
    try {
      const settingsDoc = await getDoc(doc(db, 'users', user.uid, 'settings', 'main'));
      if (settingsDoc.exists()) {
        setSettings({ ...settings, ...settingsDoc.data() });
      }
    } catch (err) {
      console.error('Settings yüklenirken hata:', err);
    }
  };

  const saveSettings = async (newSettings: Partial<Settings>) => {
    if (!user) return;
    
    try {
      const updatedSettings = { ...settings, ...newSettings };
      await setDoc(doc(db, 'users', user.uid, 'settings', 'main'), updatedSettings);
      setSettings(updatedSettings);
    } catch (err) {
      console.error('Settings kaydedilirken hata:', err);
      setError('Ayarlar kaydedilirken bir hata oluştu.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsLoading(true);
    try {
      const fileRef = ref(storage, `users/${user.uid}/covers/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(fileRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      setFormData({ ...formData, coverUrl: downloadURL, coverPath: snapshot.ref.fullPath });
    } catch (err) {
      console.error('Dosya yükleme hatası:', err);
      setError('Kapak resmi yüklenirken bir hata oluştu.');
    } finally {
      setIsLoading(false);
    }
  };

  const addBook = async () => {
    if (!user || !formData.title || !formData.author || !formData.totalPages) return;

    setIsLoading(true);
    try {
      await addDoc(collection(db, 'users', user.uid, 'books'), {
        ...formData,
        status: formData.status || 'Okunmadı',
        format: formData.format || 'Fiziksel Kitap',
        currentPage: 0,
        readingHistory: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      setShowModal(null);
      setFormData({});
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Kitap ekleme hatası:', err);
      setError('Kitap eklenirken bir hata oluştu.');
    } finally {
      setIsLoading(false);
    }
  };

  const updateBook = async () => {
    if (!user || !selectedBook || !formData.title || !formData.author) return;

    setIsLoading(true);
    try {
      const updatedData = {
        ...formData,
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'users', user.uid, 'books', selectedBook.id), updatedData);
      
      setShowModal(null);
      setSelectedBook(null);
      setFormData({});
    } catch (err) {
      console.error('Kitap güncelleme hatası:', err);
      setError('Kitap güncellenirken bir hata oluştu.');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteBook = async (book: Book) => {
    if (!user || !window.confirm('Bu kitabı silmek istediğinizden emin misiniz?')) return;

    setIsLoading(true);
    try {
      // Delete cover image if exists
      if (book.coverPath) {
        try {
          const coverRef = ref(storage, book.coverPath);
          await deleteObject(coverRef);
        } catch (err) {
          console.log('Kapak resmi silinemedi:', err);
        }
      }

      await deleteDoc(doc(db, 'users', user.uid, 'books', book.id));
    } catch (err) {
      console.error('Kitap silme hatası:', err);
      setError('Kitap silinirken bir hata oluştu.');
    } finally {
      setIsLoading(false);
    }
  };

  const addProgress = async () => {
    if (!user || !selectedBook || !progressData.value) return;

    setIsLoading(true);
    try {
      const today = dayjs().format('YYYY-MM-DD');
      const currentHistory = selectedBook.readingHistory || [];
      
      // Check if there's already an entry for today
      const todayIndex = currentHistory.findIndex(entry => entry.date === today);
      let newHistory;
      
      if (todayIndex >= 0) {
        // Update today's entry
        newHistory = [...currentHistory];
        newHistory[todayIndex] = {
          date: today,
          value: progressData.value,
          type: progressData.type
        };
      } else {
        // Add new entry
        newHistory = [...currentHistory, {
          date: today,
          value: progressData.value,
          type: progressData.type
        }];
      }

      // Calculate new current page for book progress
      let newCurrentPage = selectedBook.currentPage || 0;
      if (progressData.type === 'pages') {
        newCurrentPage = Math.min(newCurrentPage + progressData.value, selectedBook.totalPages);
      }

      // Update book status if completed
      let newStatus = selectedBook.status;
      if (newCurrentPage >= selectedBook.totalPages && selectedBook.status !== 'Okudum') {
        newStatus = 'Okudum';
      } else if (newCurrentPage > 0 && selectedBook.status === 'Okunmadı') {
        newStatus = 'Şu An Okuyorum';
      }

      await updateDoc(doc(db, 'users', user.uid, 'books', selectedBook.id), {
        readingHistory: newHistory,
        currentPage: newCurrentPage,
        status: newStatus,
        updatedAt: serverTimestamp()
      });

      // Update streak
      await updateStreak();

      setShowModal(null);
      setSelectedBook(null);
      setProgressData({ value: 0, type: 'pages' });
    } catch (err) {
      console.error('İlerleme ekleme hatası:', err);
      setError('İlerleme kaydedilirken bir hata oluştu.');
    } finally {
      setIsLoading(false);
    }
  };

  const calculateCurrentStreak = (readingHistory: Array<{ date: string; value: number; type: 'pages' | 'minutes' }>): { current: number; longest: number; lastDate: string | null } => {
    if (!readingHistory || readingHistory.length === 0) {
      return { current: 0, longest: 0, lastDate: null };
    }
    
    // Tüm tarihleri topla ve sırala
    const dates = Array.from(new Set(readingHistory.map(entry => entry.date))).sort();
    
    if (dates.length === 0) {
      return { current: 0, longest: 0, lastDate: null };
    }
    
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 1;
    
    const today = dayjs().format('YYYY-MM-DD');
    const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    
    // En son tarihten başlayarak geriye doğru say
    for (let i = dates.length - 1; i >= 0; i--) {
      const currentDate = dates[i];
      
      if (i === dates.length - 1) {
        // Son tarih bugün veya dün ise streak devam ediyor
        if (currentDate === today || currentDate === yesterday) {
          tempStreak = 1;
        } else {
          tempStreak = 0;
        }
      } else {
        const nextDate = dates[i + 1];
        const dayDiff = dayjs(nextDate).diff(dayjs(currentDate), 'day');
        
        if (dayDiff === 1) {
          tempStreak++;
        } else {
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
        }
      }
    }
    
    longestStreak = Math.max(longestStreak, tempStreak);
    
    // Mevcut streak hesapla
    const lastDate = dates[dates.length - 1];
    if (lastDate === today || lastDate === yesterday) {
      currentStreak = tempStreak;
    } else {
      currentStreak = 0;
    }
    
    return { current: currentStreak, longest: longestStreak, lastDate };
  };

  const updateStreak = async () => {
    if (!user) return;
    
    try {
      // Tüm kitapların okuma geçmişini birleştir
      const allReadingHistory: Array<{ date: string; value: number; type: 'pages' | 'minutes' }> = [];
      
      books.forEach(book => {
        if (book.readingHistory) {
          allReadingHistory.push(...book.readingHistory);
        }
      });
      
      const newStreak = calculateCurrentStreak(allReadingHistory);
      await saveSettings({ streak: newStreak });
    } catch (err) {
      console.error('Streak güncelleme hatası:', err);
    }
  };

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

    const progressBooks = Math.round((readBooks / settings.goals.books) * 100);
    const progressPages = Math.round((totalPages / settings.goals.pages) * 100);
    const progressMinutes = Math.round((totalMinutes / settings.goals.minutes) * 100);

    return {
      totalBooks,
      readBooks,
      currentlyReading,
      totalPages,
      totalMinutes,
      progressBooks,
      progressPages,
      progressMinutes
    };
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
              {/* Streak Counter */}
              {(currentView === 'statistics' || currentView === 'library') && (
                <div 
                  className="flex items-center gap-2 bg-gray-800/50 border border-white/10 rounded-full px-3 py-1.5 text-sm font-semibold text-orange-400"
                  title="Okuma Serisi"
                >
                  <i className="fas fa-fire"></i>
                  <span>{settings.streak.current}</span>
                </div>
              )}
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
                    currentView === 'reader'
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

        {error && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300">
            {error}
          </div>
        )}

        {/* Reader View */}
        {currentView === 'reader' && (
          <Okuyucu />
        )}

        {/* Library View */}
        {currentView === 'library' && (
          <>
            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="glass-card">
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
              
              <div className="glass-card">
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
              
              <div className="glass-card">
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
              
              <div className="glass-card">
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
            {books.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <i className="fas fa-inbox text-5xl text-gray-600 mb-4"></i>
                <h3 className="text-xl font-semibold mb-2">Kütüphaneniz boş</h3>
                <p>"Yeni Kitap Ekle" butonuyla ilk kitabınızı ekleyin.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {books.map((book) => (
                  <div key={book.id} className="glass-card group hover:scale-105 transition-transform duration-300">
                    <div className="aspect-[3/4] book-cover-container">
                      {book.coverUrl ? (
                        <img 
                          src={book.coverUrl} 
                          alt={book.title}
                          className="book-cover-image"
                        />
                      ) : (
                        <div className="book-cover-fallback">
                          <i className="fas fa-book text-4xl text-white/90 mb-2"></i>
                          <span className="text-xs text-center px-2 text-white/70">{book.title}</span>
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
            )}
          </>
        )}

        {/* Statistics View */}
        {currentView === 'statistics' && (
          <div className="space-y-8">
            {/* Progress Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="glass-card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">Kitap Hedefi</h3>
                  <i className="fas fa-book text-indigo-400"></i>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">İlerleme</span>
                    <span className="text-white">{stats.readBooks} / {settings.goals.books}</span>
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
              
              <div className="glass-card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">Sayfa Hedefi</h3>
                  <i className="fas fa-file-alt text-emerald-400"></i>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">İlerleme</span>
                    <span className="text-white">{stats.totalPages} / {settings.goals.pages}</span>
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
              
              <div className="glass-card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">Dakika Hedefi</h3>
                  <i className="fas fa-clock text-orange-400"></i>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">İlerleme</span>
                    <span className="text-white">{stats.totalMinutes} / {settings.goals.minutes}</span>
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
              <div className="glass-card">
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
              
              <div className="glass-card">
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
            <div className="glass-card">
              <h3 className="text-lg font-semibold text-white mb-6">Genel Ayarlar</h3>
              
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-white">Bildirimler</label>
                    <p className="text-xs text-gray-400">Günlük okuma hatırlatmaları</p>
                  </div>
                  <button
                    onClick={() => saveSettings({ notifications: !settings.notifications })}
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
            
            <div className="glass-card">
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
          <div className="glass-card w-full max-w-md max-h-[90vh] overflow-y-auto">
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
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Yayınevi (İsteğe Bağlı)</label>
                <input
                  type="text"
                  value={formData.publisher || ''}
                  onChange={(e) => setFormData({ ...formData, publisher: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                  placeholder="Yayınevi adını girin"
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
                  onChange={(e) => setFormData({ ...formData, totalPages: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                  placeholder="Toplam sayfa sayısını girin"
                  min="1"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Kapak Resmi (İsteğe Bağlı)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                />
                {formData.coverUrl && (
                  <img src={formData.coverUrl} alt="Kapak önizleme" className="mt-2 w-20 h-28 object-cover rounded" />
                )}
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={addBook}
                disabled={isLoading || !formData.title || !formData.author || !formData.totalPages}
                className="flex-1 primary-btn disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Ekleniyor...' : 'Kitap Ekle'}
              </button>
              
              <button
                onClick={() => {
                  setShowModal(null);
                  setFormData({});
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
                className="flex-1 secondary-btn"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal === 'edit' && selectedBook && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-white mb-4">Kitap Düzenle</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Kitap Adı</label>
                <input
                  type="text"
                  value={formData.title || ''}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Yazar</label>
                <input
                  type="text"
                  value={formData.author || ''}
                  onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Yayınevi</label>
                <input
                  type="text"
                  value={formData.publisher || ''}
                  onChange={(e) => setFormData({ ...formData, publisher: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Durum</label>
                  <select
                    value={formData.status || ''}
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
                    value={formData.format || ''}
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
                  onChange={(e) => setFormData({ ...formData, totalPages: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                  min="1"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Kapak Resmi</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                />
                {formData.coverUrl && (
                  <img src={formData.coverUrl} alt="Kapak önizleme" className="mt-2 w-20 h-28 object-cover rounded" />
                )}
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={updateBook}
                disabled={isLoading || !formData.title || !formData.author}
                className="flex-1 primary-btn disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Güncelleniyor...' : 'Güncelle'}
              </button>
              
              <button
                onClick={() => {
                  setShowModal(null);
                  setSelectedBook(null);
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
          <div className="glass-card w-full max-w-md">
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
                  onChange={(e) => setProgressData({ ...progressData, value: parseInt(e.target.value) })}
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
                disabled={isLoading || !progressData.value}
                className="flex-1 primary-btn disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Ekleniyor...' : 'İlerleme Ekle'}
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

      {showModal === 'goals' && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">Hedefleri Düzenle</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Yıllık Kitap Hedefi</label>
                <input
                  type="number"
                  value={settings.goals.books}
                  onChange={(e) => setSettings({ 
                    ...settings, 
                    goals: { ...settings.goals, books: parseInt(e.target.value) }
                  })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
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
                    goals: { ...settings.goals, pages: parseInt(e.target.value) }
                  })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
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
                    goals: { ...settings.goals, minutes: parseInt(e.target.value) }
                  })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                  min="1"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  saveSettings(settings);
                  setShowModal(null);
                }}
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

      <style>{`
        .book-cover-container {
          position: relative;
          overflow: hidden;
          border-radius: 12px 12px 0 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        
        .book-cover-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.3s ease;
        }
        
        .book-cover-fallback {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          text-align: center;
          padding: 1rem;
        }
        
        .group:hover .book-cover-image {
          transform: scale(1.05);
        }
        
        .primary-btn {
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
          font-weight: 600;
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          transition: all 0.3s ease;
          border: none;
        }
        
        .primary-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 25px rgba(102, 126, 234, 0.4);
        }
        
        .secondary-btn {
          background: rgba(75, 85, 99, 0.5);
          color: white;
          font-weight: 600;
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          transition: all 0.3s ease;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .secondary-btn:hover {
          background: rgba(75, 85, 99, 0.8);
        }
        
        .glass-card {
          background: rgba(17, 24, 39, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(16px);
          padding: 1.5rem;
          border-radius: 1rem;
        }
      `}</style>
    </div>
  );
};

export default Kutuphanem;