import React, { useState, useEffect, useCallback, useRef } from 'react';
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, serverTimestamp, writeBatch, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';
import { useNotify } from '../hooks/useNotify';

interface Book {
  id: string;
  title: string;
  author: string;
  publisher?: string;
  status: 'Okunmadı' | 'Şu An Okuyorum' | 'Okudum' | 'Yarıda Bıraktım';
  format: 'Fiziksel Kitap' | 'E-Kitap' | 'Sesli Kitap';
  totalPages: number;
  currentPage: number;
  coverUrl?: string;
  coverPath?: string;
  readingHistory?: ReadingEntry[];
  createdAt: any;
  updatedAt?: any;
}

interface ReadingEntry {
  date: string;
  value: number;
  type: 'pages' | 'minutes';
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
}

const KutuphanemNew: React.FC = () => {
  const { user } = useAuth();
  const { notifySuccess, notifyError } = useNotify();
  const [currentView, setCurrentView] = useState<'kutuphane' | 'panel'>('kutuphane');
  const [books, setBooks] = useState<Book[]>([]);
  const [settings, setSettings] = useState<Settings>({
    goals: { books: 12, pages: 3000, minutes: 6000 },
    streak: { current: 0, longest: 0, lastDate: null }
  });
  
  // Filters and UI state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('title-asc');
  const [isLoading, setIsLoading] = useState(false);
  
  // Modals
  const [showModal, setShowModal] = useState<'add' | 'edit' | 'progress' | 'goals' | null>(null);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  
  // Form data
  const [formData, setFormData] = useState<Partial<Book>>({});
  const [progressData, setProgressData] = useState({ type: 'pages' as 'pages' | 'minutes', value: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Panel state
  const [activeGoalTab, setActiveGoalTab] = useState<'books' | 'pages' | 'minutes'>('books');
  const [activeActivityFilter, setActiveActivityFilter] = useState<'today' | 'week' | 'month' | 'year'>('week');

  // Load books
  const loadBooks = useCallback(() => {
    if (!user) return;
    
    const booksQuery = query(collection(db, 'users', user.uid, 'library_books'));
    const unsubscribe = onSnapshot(booksQuery, (snapshot) => {
      const booksList: Book[] = [];
      snapshot.forEach((doc) => {
        booksList.push({ id: doc.id, ...doc.data() } as Book);
      });
      setBooks(booksList);
    });
    
    return unsubscribe;
  }, [user]);

  // Load settings
  const loadSettings = useCallback(() => {
    if (!user) return;
    
    const settingsRef = doc(db, 'users', user.uid, 'library_settings', 'config');
    const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSettings(prevSettings => ({
          goals: { ...prevSettings.goals, ...data.goals },
          streak: { ...prevSettings.streak, ...data.streak }
        }));
      }
    });
    
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (user) {
      const unsubscribeBooks = loadBooks();
      const unsubscribeSettings = loadSettings();
      
      return () => {
        if (unsubscribeBooks) unsubscribeBooks();
        if (unsubscribeSettings) unsubscribeSettings();
      };
    }
  }, [user, loadBooks, loadSettings]);

  // File upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    setIsLoading(true);
    try {
      const filePath = `covers/${user.uid}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, filePath);
      const snapshot = await uploadBytes(storageRef, file);
      const coverUrl = await getDownloadURL(snapshot.ref);
      
      setFormData(prev => ({
        ...prev,
        coverUrl,
        coverPath: filePath
      }));
    } catch (error) {
      console.error('Upload error:', error);
      notifyError('Dosya yüklenirken hata oluştu.');
    } finally {
      setIsLoading(false);
    }
  };

  // Add book
  const addBook = async () => {
    if (!user || !formData.title || !formData.author || !formData.totalPages) return;
    
    setIsLoading(true);
    try {
      const bookData = {
        ...formData,
        currentPage: 0,
        readingHistory: [],
        createdAt: serverTimestamp()
      };
      
      await addDoc(collection(db, 'users', user.uid, 'library_books'), bookData);
      
      setShowModal(null);
      setFormData({});
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      console.error('Add book error:', error);
      notifyError('Kitap eklenirken hata oluştu.');
    } finally {
      setIsLoading(false);
    }
  };

  // Update book
  const updateBook = async () => {
    if (!user || !selectedBook || !formData.title || !formData.author) return;
    
    setIsLoading(true);
    try {
      const bookRef = doc(db, 'users', user.uid, 'library_books', selectedBook.id);
      await updateDoc(bookRef, {
        ...formData,
        updatedAt: serverTimestamp()
      });
      
      setShowModal(null);
      setSelectedBook(null);
      setFormData({});
    } catch (error) {
      console.error('Update book error:', error);
      notifyError('Kitap güncellenirken hata oluştu.');
    } finally {
      setIsLoading(false);
    }
  };

  // Delete book
  const deleteBook = async (bookId: string) => {
    if (!user || !window.confirm('Bu kitabı silmek istediğinizden emin misiniz?')) return;
    
    try {
      const book = books.find(b => b.id === bookId);
      if (book?.coverPath) {
        try {
          const storageRef = ref(storage, book.coverPath);
          await deleteObject(storageRef);
        } catch (error) {
          console.error('Cover delete error:', error);
        }
      }
      
      await deleteDoc(doc(db, 'users', user.uid, 'library_books', bookId));
    } catch (error) {
      console.error('Delete book error:', error);
      notifyError('Kitap silinirken hata oluştu.');
    }
  };

  // Log activity
  const logActivity = async (bookId: string, progressDelta: number, type: 'pages' | 'minutes') => {
    if (!user || progressDelta === 0) return;
    
    try {
      const batch = writeBatch(db);
      const bookRef = doc(db, 'users', user.uid, 'library_books', bookId);
      
      // Update reading history
      const bookDoc = await getDoc(bookRef);
      if (bookDoc.exists()) {
        const book = bookDoc.data() as Book;
        const readingHistory = book.readingHistory || [];
        readingHistory.push({
          date: new Date().toISOString(),
          value: progressDelta,
          type
        });
        
        batch.update(bookRef, { readingHistory });
        
        // Update streak
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const lastDate = settings.streak.lastDate ? new Date(settings.streak.lastDate) : null;
        
        let newStreak = settings.streak.current;
        let newLongest = settings.streak.longest;
        
        if (!lastDate || lastDate.getTime() !== today.getTime()) {
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          
          if (lastDate && lastDate.getTime() === yesterday.getTime()) {
            newStreak++;
          } else {
            newStreak = 1;
          }
          
          if (newStreak > newLongest) {
            newLongest = newStreak;
          }
          
          const settingsRef = doc(db, 'users', user.uid, 'library_settings', 'config');
          const newStreakData = {
            current: newStreak,
            longest: newLongest,
            lastDate: today.toISOString()
          };
          
          batch.update(settingsRef, { streak: newStreakData });
        }
        
        await batch.commit();
        setShowModal(null);
        setProgressData({ type: 'pages', value: 0 });
      }
    } catch (error) {
      console.error('Log activity error:', error);
      notifyError('İlerleme kaydedilirken hata oluştu.');
    }
  };

  // Save settings
  const saveSettings = async (newSettings: Settings) => {
    if (!user) return;
    
    try {
      const settingsRef = doc(db, 'users', user.uid, 'library_settings', 'config');
      await updateDoc(settingsRef, {
        goals: newSettings.goals,
        streak: newSettings.streak
      });
      notifySuccess('Ayarlar kaydedildi.');
    } catch (error) {
      console.error('Settings save error:', error);
      notifyError('Ayarlar kaydedilirken hata oluştu.');
    }
  };

  // Filter and sort books
  const getFilteredBooks = () => {
    let filtered = [...books];
    
    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(book =>
        book.title.toLowerCase().includes(term) ||
        book.author.toLowerCase().includes(term)
      );
    }
    
    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(book => book.status === statusFilter);
    }
    
    // Sort
    const [field, order] = sortBy.split('-');
    filtered.sort((a, b) => {
      let aVal = a[field as keyof Book] || '';
      let bVal = b[field as keyof Book] || '';
      
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      
      if (order === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    
    return filtered;
  };

  // Get statistics
  const getStats = () => {
    const totalBooks = books.length;
    const readBooks = books.filter(b => b.status === 'Okudum').length;
    const currentlyReading = books.filter(b => b.status === 'Şu An Okuyorum').length;
    
    const currentYear = new Date().getFullYear();
    const thisYearEntries = books.flatMap(b => b.readingHistory || [])
      .filter(e => new Date(e.date).getFullYear() === currentYear);
    
    const totalPages = thisYearEntries
      .filter(e => e.type === 'pages')
      .reduce((sum, e) => sum + e.value, 0);
    
    const totalMinutes = thisYearEntries
      .filter(e => e.type === 'minutes')
      .reduce((sum, e) => sum + e.value, 0);

    return {
      totalBooks,
      readBooks,
      currentlyReading,
      totalPages,
      totalMinutes,
      progressBooks: settings.goals.books > 0 ? (readBooks / settings.goals.books) * 100 : 0,
      progressPages: settings.goals.pages > 0 ? (totalPages / settings.goals.pages) * 100 : 0,
      progressMinutes: settings.goals.minutes > 0 ? (totalMinutes / settings.goals.minutes) * 100 : 0
    };
  };

  const stats = getStats();
  const filteredBooks = getFilteredBooks();

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Bilinmiyor';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('tr-TR');
  };

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}s ${mins}d` : `${mins}d`;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Background */}
      <div className="background-container fixed top-0 left-0 w-full h-full overflow-hidden -z-10">
        <div className="aurora-bg absolute w-[150%] h-[150%] bg-gradient-to-br from-indigo-500/20 via-transparent to-blue-500/20 animate-aurora"></div>
      </div>

      <div className="flex h-screen">
        {/* Sidebar */}
        <aside className="w-64 bg-gray-900/50 backdrop-blur-lg border-r border-white/10 flex flex-col">
          <div className="h-20 flex items-center justify-center px-4 border-b border-white/10">
            <div className="text-xl font-bold text-white flex items-center gap-3">
              <i className="fas fa-book-bookmark text-indigo-400"></i>
              <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                Kütüphanem
              </span>
            </div>
          </div>
          
          <nav className="flex-grow px-4 py-6 space-y-2">
            <button
              onClick={() => setCurrentView('kutuphane')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left transition-all duration-200 ${
                currentView === 'kutuphane'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                  : 'text-gray-300 hover:bg-white/5 hover:text-white hover:translate-x-1'
              }`}
            >
              <i className="fas fa-library"></i>
              <span>Kütüphane</span>
            </button>
            
            <button
              onClick={() => setCurrentView('panel')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left transition-all duration-200 ${
                currentView === 'panel'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                  : 'text-gray-300 hover:bg-white/5 hover:text-white hover:translate-x-1'
              }`}
            >
              <i className="fas fa-chart-bar"></i>
              <span>Panel & İstatistikler</span>
            </button>
          </nav>
          
          <div className="p-4 border-t border-white/10">
            <div className="text-sm">
              <p className="font-semibold text-white truncate">{user?.email}</p>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="h-20 flex items-center justify-between px-8 border-b border-white/10">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-white">
                {currentView === 'kutuphane' ? 'Kütüphane' : 'Panel & İstatistikler'}
              </h1>
              
              {/* Streak Counter */}
              {currentView === 'kutuphane' && (
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
              {currentView === 'kutuphane' && (
                <button
                  onClick={() => setShowModal('add')}
                  className="primary-btn flex items-center gap-2"
                >
                  <i className="fas fa-plus"></i>
                  Yeni Kitap
                </button>
              )}
            </div>
          </header>

          {/* Content */}
          <div className="flex-1 overflow-hidden p-8">
            {/* Kütüphane View */}
            {currentView === 'kutuphane' && (
              <>
                {/* Search and Filters */}
                <div className="glass-card p-6 mb-8">
                  <div className="flex flex-wrap gap-4 items-center">
                    <div className="flex-1 min-w-64">
                      <input
                        type="text"
                        placeholder="Kitap veya yazar ara..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="form-input"
                      />
                    </div>
                    
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="form-input w-48"
                    >
                      <option value="all">Tüm Durumlar</option>
                      <option value="Okunmadı">Okunmadı</option>
                      <option value="Şu An Okuyorum">Şu An Okuyorum</option>
                      <option value="Okudum">Okudum</option>
                      <option value="Yarıda Bıraktım">Yarıda Bıraktım</option>
                    </select>
                    
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="form-input w-48"
                    >
                      <option value="title-asc">İsim (A-Z)</option>
                      <option value="title-desc">İsim (Z-A)</option>
                      <option value="author-asc">Yazar (A-Z)</option>
                      <option value="author-desc">Yazar (Z-A)</option>
                    </select>
                  </div>
                </div>

                {/* Books Grid */}
                {filteredBooks.length === 0 ? (
                  <div className="text-center py-16 text-gray-500">
                    <i className="fas fa-inbox text-5xl text-gray-600 mb-4"></i>
                    <h3 className="text-xl font-semibold mb-2">
                      {books.length === 0 ? 'Kütüphaneniz boş' : 'Sonuç bulunamadı'}
                    </h3>
                    <p>
                      {books.length === 0 
                        ? '"Yeni Kitap" butonuyla ilk kitabınızı ekleyin.' 
                        : 'Filtrelerinizi değiştirmeyi deneyin.'
                      }
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredBooks.map((book) => {
                      const progress = book.totalPages > 0 ? Math.round(((book.currentPage || 0) / book.totalPages) * 100) : 0;
                      const isAudio = book.format === 'Sesli Kitap';
                      const progressDisplay = isAudio 
                        ? `${formatMinutes(book.currentPage || 0)} / ${formatMinutes(book.totalPages)}`
                        : `${book.currentPage || 0} / ${book.totalPages}`;

                      return (
                        <div key={book.id} className="glass-card p-5 flex flex-col gap-4 hover:border-indigo-400/50 transition-all duration-300 transform hover:-translate-y-1">
                          <div className="flex gap-4">
                            <img 
                              src={book.coverUrl || 'https://placehold.co/96x144/1f2937/9ca3af?text=Kapak'} 
                              alt={book.title}
                              className="w-24 h-36 object-cover rounded-md shadow-lg flex-shrink-0 bg-gray-800"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.src = 'https://placehold.co/96x144/1f2937/9ca3af?text=Kapak';
                              }}
                            />
                            <div className="flex flex-col min-w-0 flex-grow">
                              <h3 className="font-bold text-lg truncate" title={book.title}>
                                {book.title}
                              </h3>
                              <p className="text-sm text-gray-400 truncate" title={book.author}>
                                {book.author}
                              </p>
                              
                              {book.totalPages > 0 && (
                                <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-1">
                                  <i className={`fas ${isAudio ? 'fa-clock' : 'fa-book'} w-3 h-3`}></i>
                                  {isAudio ? formatMinutes(book.totalPages) : `${book.totalPages} sayfa`}
                                </p>
                              )}
                              
                              <div className="mt-auto pt-2 w-full">
                                {book.status === 'Şu An Okuyorum' ? (
                                  <>
                                    <div className="w-full bg-gray-700 rounded-full h-2">
                                      <div className="bg-indigo-500 h-2 rounded-full" style={{width: `${progress}%`}}></div>
                                    </div>
                                    <p className="text-xs text-right text-gray-400 mt-1.5" title={progressDisplay}>
                                      {progress}%
                                    </p>
                                  </>
                                ) : (
                                  <div className="h-2 mt-1.5"></div>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          <div className="border-t border-white/10 pt-3 flex justify-between items-center">
                            <span className="text-xs font-semibold text-indigo-300 bg-indigo-500/20 px-2.5 py-1 rounded-full">
                              {book.status}
                            </span>
                            <div className="flex items-center space-x-1">
                              {book.status === 'Şu An Okuyorum' && (
                                <button
                                  onClick={() => {
                                    setSelectedBook(book);
                                    setShowModal('progress');
                                  }}
                                  className="text-gray-400 hover:text-indigo-400 p-1.5 rounded-full hover:bg-white/10 transition-colors"
                                  title="İlerleme Kaydet"
                                >
                                  <i className="fas fa-check-circle"></i>
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setSelectedBook(book);
                                  setFormData(book);
                                  setShowModal('edit');
                                }}
                                className="text-gray-400 hover:text-amber-400 p-1.5 rounded-full hover:bg-white/10 transition-colors"
                                title="Düzenle"
                              >
                                <i className="fas fa-edit"></i>
                              </button>
                              <button
                                onClick={() => deleteBook(book.id)}
                                className="text-gray-400 hover:text-red-400 p-1.5 rounded-full hover:bg-white/10 transition-colors"
                                title="Sil"
                              >
                                <i className="fas fa-trash"></i>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* Panel View */}
            {currentView === 'panel' && (
              <div className="space-y-8">
                {/* Quick Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="glass-card p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-400">Toplam Kitap</p>
                        <p className="text-2xl font-bold text-white">{stats.totalBooks}</p>
                      </div>
                      <i className="fas fa-book text-3xl text-indigo-400"></i>
                    </div>
                  </div>
                  
                  <div className="glass-card p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-400">Okunan</p>
                        <p className="text-2xl font-bold text-white">{stats.readBooks}</p>
                      </div>
                      <i className="fas fa-check text-3xl text-emerald-400"></i>
                    </div>
                  </div>
                  
                  <div className="glass-card p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-400">Okuyorum</p>
                        <p className="text-2xl font-bold text-white">{stats.currentlyReading}</p>
                      </div>
                      <i className="fas fa-bookmark text-3xl text-orange-400"></i>
                    </div>
                  </div>
                  
                  <div className="glass-card p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-400">Streak</p>
                        <p className="text-2xl font-bold text-white">{settings.streak.current}</p>
                      </div>
                      <i className="fas fa-fire text-3xl text-purple-400"></i>
                    </div>
                  </div>
                </div>

                {/* Goals */}
                <div className="glass-card p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold flex items-center">
                      <i className="fas fa-target mr-3 text-indigo-400"></i>
                      Yıllık Hedefler
                    </h2>
                    <button
                      onClick={() => setShowModal('goals')}
                      className="text-gray-400 hover:text-white"
                    >
                      <i className="fas fa-cog"></i>
                    </button>
                  </div>
                  
                  <div className="border-b border-white/10 mb-4">
                    <nav className="-mb-px flex space-x-6 text-sm font-medium text-gray-400">
                      {[
                        { id: 'books', name: 'Kitap' },
                        { id: 'pages', name: 'Sayfa' },
                        { id: 'minutes', name: 'Süre' }
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setActiveGoalTab(tab.id as any)}
                          className={`py-2 px-1 border-b-2 transition-all duration-300 ${
                            activeGoalTab === tab.id
                              ? 'text-indigo-400 border-indigo-400 font-semibold'
                              : 'border-transparent hover:text-white hover:border-gray-300'
                          }`}
                        >
                          {tab.name}
                        </button>
                      ))}
                    </nav>
                  </div>
                  
                  <div className="space-y-3">
                    {(() => {
                      const goalData = {
                        books: { current: stats.readBooks, target: settings.goals.books, unit: 'kitap' },
                        pages: { current: stats.totalPages, target: settings.goals.pages, unit: 'sayfa' },
                        minutes: { current: stats.totalMinutes, target: settings.goals.minutes, unit: 'dk' }
                      };
                      
                      const currentGoal = goalData[activeGoalTab];
                      const progressPercentage = currentGoal.target > 0 ? Math.min((currentGoal.current / currentGoal.target) * 100, 100) : 0;
                      
                      return (
                        <>
                          <div className="w-full bg-gray-700 rounded-full h-3">
                            <div 
                              className="bg-indigo-500 h-3 rounded-full transition-all duration-500" 
                              style={{width: `${progressPercentage}%`}}
                            ></div>
                          </div>
                          <div className="text-sm text-center text-gray-300">
                            {currentGoal.current.toLocaleString()} / {currentGoal.target.toLocaleString()} {currentGoal.unit}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Add Book Modal */}
      {showModal === 'add' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="glass-card w-full max-w-lg p-6">
            <div className="flex justify-between items-center border-b border-white/10 pb-3 mb-4">
              <h3 className="text-xl font-semibold text-white">Yeni Kitap Ekle</h3>
              <button 
                onClick={() => setShowModal(null)}
                className="text-gray-400 hover:text-white text-2xl leading-none transition-colors"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Kitap Adı</label>
                <input
                  type="text"
                  value={formData.title || ''}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="form-input"
                  placeholder="Kitap adını girin"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Yazar</label>
                <input
                  type="text"
                  value={formData.author || ''}
                  onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                  className="form-input"
                  placeholder="Yazar adını girin"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Yayınevi (İsteğe Bağlı)</label>
                <input
                  type="text"
                  value={formData.publisher || ''}
                  onChange={(e) => setFormData({ ...formData, publisher: e.target.value })}
                  className="form-input"
                  placeholder="Yayınevi adını girin"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Durum</label>
                  <select
                    value={formData.status || 'Okunmadı'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as Book['status'] })}
                    className="form-input"
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
                    className="form-input"
                  >
                    <option value="Fiziksel Kitap">Fiziksel Kitap</option>
                    <option value="E-Kitap">E-Kitap</option>
                    <option value="Sesli Kitap">Sesli Kitap</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {formData.format === 'Sesli Kitap' ? 'Toplam Süre (Dakika)' : 'Toplam Sayfa'}
                </label>
                <input
                  type="number"
                  value={formData.totalPages || ''}
                  onChange={(e) => setFormData({ ...formData, totalPages: parseInt(e.target.value) })}
                  className="form-input"
                  placeholder={formData.format === 'Sesli Kitap' ? 'Toplam dakika' : 'Toplam sayfa sayısını girin'}
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
                  className="form-input"
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
                onClick={() => setShowModal(null)}
                className="flex-1 bg-gray-500/50 hover:bg-gray-500/70 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Book Modal */}
      {showModal === 'edit' && selectedBook && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="glass-card w-full max-w-lg p-6">
            <div className="flex justify-between items-center border-b border-white/10 pb-3 mb-4">
              <h3 className="text-xl font-semibold text-white">Kitabı Düzenle</h3>
              <button 
                onClick={() => setShowModal(null)}
                className="text-gray-400 hover:text-white text-2xl leading-none transition-colors"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Kitap Adı</label>
                <input
                  type="text"
                  value={formData.title || ''}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="form-input"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Yazar</label>
                <input
                  type="text"
                  value={formData.author || ''}
                  onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                  className="form-input"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Yayınevi</label>
                <input
                  type="text"
                  value={formData.publisher || ''}
                  onChange={(e) => setFormData({ ...formData, publisher: e.target.value })}
                  className="form-input"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Durum</label>
                  <select
                    value={formData.status || ''}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as Book['status'] })}
                    className="form-input"
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
                    className="form-input"
                  >
                    <option value="Fiziksel Kitap">Fiziksel Kitap</option>
                    <option value="E-Kitap">E-Kitap</option>
                    <option value="Sesli Kitap">Sesli Kitap</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {formData.format === 'Sesli Kitap' ? 'Toplam Süre (Dakika)' : 'Toplam Sayfa'}
                </label>
                <input
                  type="number"
                  value={formData.totalPages || ''}
                  onChange={(e) => setFormData({ ...formData, totalPages: parseInt(e.target.value) })}
                  className="form-input"
                  min="1"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Kapak Resmi</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="form-input"
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
                onClick={() => setShowModal(null)}
                className="flex-1 bg-gray-500/50 hover:bg-gray-500/70 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress Modal */}
      {showModal === 'progress' && selectedBook && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="glass-card w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-white mb-4">İlerleme Ekle</h3>
            <p className="text-gray-400 mb-4">{selectedBook.title}</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">İlerleme Türü</label>
                <select
                  value={progressData.type}
                  onChange={(e) => setProgressData({ ...progressData, type: e.target.value as 'pages' | 'minutes' })}
                  className="form-input"
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
                  value={progressData.value}
                  onChange={(e) => setProgressData({ ...progressData, value: parseInt(e.target.value) || 0 })}
                  className="form-input"
                  min="1"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => logActivity(selectedBook.id, progressData.value, progressData.type)}
                disabled={progressData.value <= 0}
                className="flex-1 primary-btn disabled:opacity-50 disabled:cursor-not-allowed"
              >
                İlerle Kaydet
              </button>
              <button
                onClick={() => setShowModal(null)}
                className="flex-1 bg-gray-500/50 hover:bg-gray-500/70 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Goals Modal */}
      {showModal === 'goals' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="glass-card w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Yıllık Hedefleri Düzenle</h3>
            
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
                  className="form-input"
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
                  className="form-input"
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
                  className="form-input"
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
                className="flex-1 bg-gray-500/50 hover:bg-gray-500/70 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .aurora-bg {
          animation: moveAurora 25s alternate infinite ease-in-out;
        }
        @keyframes moveAurora {
          0% { transform: translate(-20%, -20%) rotate(0deg); }
          100% { transform: translate(20%, 20%) rotate(180deg); }
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
        .form-input::placeholder { color: #9ca3af; }
        .form-input:focus {
          outline: none;
          border-color: #4f46e5;
          box-shadow: 0 0 15px rgba(79, 70, 229, 0.5);
        }
        
        .primary-btn {
          background-color: #4f46e5;
          color: white;
          font-weight: 700;
          padding: 0.75rem 1.5rem;
          border-radius: 0.75rem;
          transition: all 0.3s ease;
          border: 1px solid transparent;
        }
        .primary-btn:hover {
          background-color: #4338ca;
          box-shadow: 0 0 20px rgba(79, 70, 229, 0.5);
          transform: translateY(-2px);
        }
        .primary-btn:disabled {
          background-color: #374151;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
      `}</style>
    </div>
  );
};

export default KutuphanemNew;