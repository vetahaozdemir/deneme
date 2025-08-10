import React, { useState, useEffect, useRef } from 'react';
import { collection, doc, query, onSnapshot, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch, getDoc } from 'firebase/firestore';
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
import { DEFAULT_BOOK_GOALS } from '../config/defaults';

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
}

interface KitapTakipProps {
  onNavigateToReader?: () => void;
}

const KitapTakip: React.FC<KitapTakipProps> = ({ onNavigateToReader }) => {
  const { user } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [settings, setSettings] = useState<Settings>({
    goals: DEFAULT_BOOK_GOALS,
    streak: { current: 0, longest: 0, lastDate: null }
  });
  const [currentView, setCurrentView] = useState<'kutuphane' | 'panel'>('kutuphane');
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    author: '',
    publisher: '',
    sort: 'title-asc'
  });
  const [showBookModal, setShowBookModal] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressBook, setProgressBook] = useState<Book | null>(null);
  const [activeGoalTab, setActiveGoalTab] = useState<'books' | 'pages' | 'minutes'>('books');
  const [activeActivityFilter, setActiveActivityFilter] = useState('today');

  // Helper functions
  const timeToMinutes = (h: string | number, m: string | number) => 
    (parseInt(h.toString(), 10) || 0) * 60 + (parseInt(m.toString(), 10) || 0);
  
  const minutesToTime = (mins: number) => ({ h: Math.floor(mins / 60), m: mins % 60 });
  
  const formatMinutes = (mins: number) => {
    if (!mins || mins === 0) return '0 dk';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h > 0 ? `${h} sa ` : ''}${m > 0 ? `${m} dk` : ''}`.trim() || '0 dk';
  };

  // Firebase listeners
  useEffect(() => {
    if (!user) return;

    const uid = user.uid;
    const userPath = `users/${uid}`;

    // Books listener
    const booksQuery = query(collection(db, userPath, "library_books"));
    const unsubscribeBooks = onSnapshot(booksQuery, (snapshot) => {
      const booksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Book));
      setBooks(booksData);
    }, (error) => console.error("Kitaplar alınırken hata:", error));

    // Settings listener
    const settingsRef = doc(db, userPath, "library_settings", "config");
    const unsubscribeSettings = onSnapshot(settingsRef, (docSnap) => {
      const defaults = { goals: DEFAULT_BOOK_GOALS, streak: { current: 0, longest: 0, lastDate: null } };
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSettings({
          ...defaults,
          ...data,
          goals: {...defaults.goals, ...data.goals}, 
          streak: {...defaults.streak, ...data.streak} 
        });
      } else {
        setSettings(defaults);
        updateSettings(defaults);
      }
    }, (error) => console.error("Ayarlar alınırken hata:", error));

    return () => {
      unsubscribeBooks();
      unsubscribeSettings();
    };
  }, [user]);

  const updateSettings = async (newSettings: Settings) => {
    if (!user) return;
    const settingsRef = doc(db, `users/${user.uid}/library_settings/config`);
    await setDoc(settingsRef, newSettings, { merge: true });
  };

  const saveBook = async (bookData: Partial<Book>, file?: File) => {
    if (!user) return;
    const uid = user.uid;
    
    if (file) {
      const filePath = `covers/${uid}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, filePath);
      const snapshot = await uploadBytes(storageRef, file);
      bookData.coverUrl = await getDownloadURL(snapshot.ref);
      bookData.coverPath = filePath;
    }

    const booksCollectionRef = collection(db, `users/${uid}/library_books`);
    if (bookData.id) {
      const bookRef = doc(booksCollectionRef, bookData.id);
      const id = bookData.id;
      delete bookData.id;
      await updateDoc(bookRef, { ...bookData, updatedAt: serverTimestamp() });
      return id;
    } else {
      delete bookData.id;
      const docRef = await addDoc(booksCollectionRef, { 
        ...bookData, 
        currentPage: 0, 
        readingHistory: [], 
        createdAt: serverTimestamp() 
      });
      return docRef.id;
    }
  };

  const deleteBook = async (bookId: string) => {
    if (!user) return;
    const book = books.find(b => b.id === bookId);
    if (!book) return;

    if (book.coverPath) {
      try {
        const storageRef = ref(storage, book.coverPath);
        await deleteObject(storageRef);
      } catch (error) {
        console.error("Kapak resmi silinirken hata:", error);
      }
    }
    
    await deleteDoc(doc(db, `users/${user.uid}/library_books`, bookId));
  };

  const logActivity = async (bookId: string, progressDelta: number, type: 'pages' | 'minutes') => {
    if (!user || progressDelta === 0) return;
    const uid = user.uid;
    const userPath = `users/${uid}`;
    const bookRef = doc(db, userPath, "library_books", bookId);
    
    const batch = writeBatch(db);
    
    const bookDoc = await getDoc(bookRef);
    if (!bookDoc.exists()) return;
    const book = bookDoc.data();
    const readingHistory = book.readingHistory || [];
    readingHistory.push({ date: new Date().toISOString(), value: progressDelta, type });
    batch.update(bookRef, { readingHistory });

    const today = dayjs().startOf('day');
    const lastDate = settings.streak?.lastDate ? dayjs(settings.streak.lastDate).startOf('day') : null;
    let newStreak = settings.streak?.current || 0;
    let newLongest = settings.streak?.longest || 0;
    if (!lastDate || !lastDate.isSame(today)) {
      if (lastDate && lastDate.isSame(today.subtract(1, 'day'))) newStreak++;
      else newStreak = 1;
    }
    if (newStreak > newLongest) newLongest = newStreak;
    const newStreakData = { current: newStreak, longest: newLongest, lastDate: today.toISOString() };
    
    const settingsRef = doc(db, userPath, "library_settings", "config");
    batch.set(settingsRef, { streak: newStreakData }, { merge: true });
    
    await batch.commit();
  };

  // Filter and sort books
  const getFilteredBooks = () => {
    const { search, status, author, publisher, sort } = filters;
    
    let filtered = books;
    
    if (status) filtered = filtered.filter(book => book.status === status);
    if (author) filtered = filtered.filter(book => book.author === author);
    if (publisher) filtered = filtered.filter(book => book.publisher === publisher);
    
    if (search) {
      const searchLower = search.toLowerCase();
      const searchTerms = searchLower.split(' ').filter(term => term.length > 0);
      
      filtered = filtered.filter(book => {
        const bookText = `${book.title} ${book.author} ${book.publisher || ''}`.toLowerCase();
        return searchTerms.every(term => bookText.includes(term));
      });
    }

    if (filtered.length > 0) {
      const [sortField, sortDir] = sort.split('-');
      const multiplier = sortDir === 'asc' ? 1 : -1;
      
      filtered.sort((a, b) => {
        const valA = (a[sortField as keyof Book] || '').toString().toLowerCase();
        const valB = (b[sortField as keyof Book] || '').toString().toLowerCase();
        return valA.localeCompare(valB, 'tr') * multiplier;
      });
    }
    
    return filtered;
  };

  // Get unique authors and publishers for filters
  const getUniqueValues = (field: 'author' | 'publisher') => {
    const values = books.map(b => b[field]).filter(Boolean);
    return Array.from(new Set(values)).sort();
  };

  // Calculate activity data based on filter
  const getActivityData = () => {
    const today = new Date();
    let startMs: number, endMs: number;
    
    switch (activeActivityFilter) {
      case 'today':
        startMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
        endMs = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).getTime();
        break;
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        startMs = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()).getTime();
        endMs = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59).getTime();
        break;
      case 'last7':
        startMs = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6).getTime();
        endMs = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).getTime();
        break;
      case 'last30':
        startMs = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29).getTime();
        endMs = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).getTime();
        break;
      case 'thisYear':
        startMs = new Date(today.getFullYear(), 0, 1).getTime();
        endMs = new Date(today.getFullYear(), 11, 31, 23, 59, 59).getTime();
        break;
      case 'all':
        startMs = 0;
        endMs = Date.now();
        break;
      default:
        startMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
        endMs = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).getTime();
    }

    let totalPages = 0, totalMinutes = 0;
    
    books.forEach(book => {
      const history = book.readingHistory || [];
      history.forEach(entry => {
        if (entry.date && entry.value) {
          const entryMs = new Date(entry.date).getTime();
          if (entryMs >= startMs && entryMs <= endMs) {
            const value = parseInt(entry.value.toString()) || 0;
            if (entry.type === 'pages') {
              totalPages += value;
            } else if (entry.type === 'minutes') {
              totalMinutes += value;
            }
          }
        }
      });
    });
    
    return { totalPages, totalMinutes };
  };

  // Get monthly reading data for chart
  const getMonthlyData = () => {
    const monthlyPages = Array(12).fill(0);
    const currentYear = dayjs().year();
    
    books.forEach(book => {
      const pageEntries = (book.readingHistory || []).filter(entry => entry.type === 'pages');
      pageEntries.forEach(entry => {
        if (entry.date && entry.value) {
          const entryDate = dayjs(entry.date);
          if (entryDate.isValid() && entryDate.year() === currentYear) {
            const month = entryDate.month();
            monthlyPages[month] += entry.value || 0;
          }
        }
      });
    });
    
    return monthlyPages;
  };

  // Get format distribution for pie chart
  const getFormatData = () => {
    return books.reduce((acc, book) => {
      acc[book.format] = (acc[book.format] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  };

  // Calculate goal progress
  const getGoalProgress = () => {
    const readBooks = books.filter(b => b.status === 'Okudum');
    const currentYear = dayjs().year();
    
    const totalPagesRead = books.flatMap(b => b.readingHistory || [])
      .filter(e => e.type === 'pages' && e.date && dayjs(e.date).isValid() && dayjs(e.date).year() === currentYear)
      .reduce((sum, e) => sum + (e.value || 0), 0);
    
    const totalMinutesListened = books.flatMap(b => b.readingHistory || [])
      .filter(e => e.type === 'minutes' && e.date && dayjs(e.date).isValid() && dayjs(e.date).year() === currentYear)
      .reduce((sum, e) => sum + (e.value || 0), 0);

    return {
      books: { current: readBooks.length, target: settings.goals.books },
      pages: { current: totalPagesRead, target: settings.goals.pages },
      minutes: { current: totalMinutesListened, target: settings.goals.minutes }
    };
  };

  const BookCard: React.FC<{ book: Book }> = ({ book }) => {
    const progress = book.totalPages > 0 ? Math.round(((book.currentPage || 0) / book.totalPages) * 100) : 0;
    const isAudio = book.format === 'Sesli Kitap';
    const progressDisplay = isAudio 
      ? `${formatMinutes(book.currentPage || 0)} / ${formatMinutes(book.totalPages)}`
      : `${book.currentPage || 0} / ${book.totalPages}`;

    return (
      <div className="glass-card p-5 flex flex-col gap-4 hover:border-indigo-400/50 transition-all duration-300 transform hover:-translate-y-1">
        <div className="flex gap-4">
          <img 
            src={book.coverUrl || 'https://placehold.co/96x144/1f2937/9ca3af?text=Kapak'} 
            alt={book.title} 
            className="w-24 h-36 object-cover rounded-md shadow-lg flex-shrink-0 bg-gray-800"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'https://placehold.co/96x144/1f2937/9ca3af?text=Kapak';
            }}
          />
          <div className="flex flex-col min-w-0 flex-grow">
            <h3 className="font-bold text-lg truncate text-white" title={book.title}>{book.title}</h3>
            <p className="text-sm text-gray-400 truncate" title={book.author}>{book.author}</p>
            {book.totalPages > 0 && (
              <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-1">
                <i className="fas fa-clock w-3 h-3"></i>
                {isAudio ? formatMinutes(book.totalPages) : `${book.totalPages} sayfa`}
              </p>
            )}
            <div className="mt-auto pt-2 w-full">
              {book.status === 'Şu An Okuyorum' ? (
                <>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div className="bg-indigo-500 h-2 rounded-full" style={{width: `${progress}%`}}></div>
                  </div>
                  <p className="text-xs text-right text-gray-400 mt-1.5" title={progressDisplay}>{progress}%</p>
                </>
              ) : (
                <>
                  <div className="h-2 mt-1.5"></div>
                  <p className="text-xs text-right text-gray-400 mt-1.5 invisible">0%</p>
                </>
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
                className="text-gray-400 hover:text-indigo-400 p-1.5 rounded-full hover:bg-white/10" 
                title="İlerleme Kaydet"
                onClick={() => {
                  setProgressBook(book);
                  setShowProgressModal(true);
                }}
              >
                <i className="fas fa-check-circle text-lg"></i>
              </button>
            )}
            <button 
              className="text-gray-400 hover:text-amber-400 p-1.5 rounded-full hover:bg-white/10" 
              title="Düzenle"
              onClick={() => {
                setEditingBook(book);
                setShowBookModal(true);
              }}
            >
              <i className="fas fa-edit text-lg"></i>
            </button>
            <button 
              className="text-gray-400 hover:text-red-400 p-1.5 rounded-full hover:bg-white/10" 
              title="Sil"
              onClick={() => {
                if (window.confirm(`"${book.title}" kitabını kalıcı olarak silmek istediğinizden emin misiniz?`)) {
                  deleteBook(book.id);
                }
              }}
            >
              <i className="fas fa-trash text-lg"></i>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const BookModal: React.FC = () => {
    const isAudio = editingBook?.format === 'Sesli Kitap';
    const totalTime = isAudio && editingBook ? minutesToTime(editingBook.totalPages) : { h: 0, m: 0 };
    const [formData, setFormData] = useState({
      title: editingBook?.title || '',
      author: editingBook?.author || '',
      publisher: editingBook?.publisher || '',
      status: editingBook?.status || 'Okunmadı',
      format: editingBook?.format || 'Fiziksel Kitap',
      totalPages: editingBook?.totalPages || 0,
      coverUrl: editingBook?.coverUrl || '',
      coverPath: editingBook?.coverPath || ''
    });
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverPreview, setCoverPreview] = useState(editingBook?.coverUrl || 'https://placehold.co/96x144/1f2937/9ca3af?text=Kapak');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoading(true);
      
      try {
        const bookData: Partial<Book> = {
          ...formData,
          id: editingBook?.id,
          totalPages: isAudio 
            ? timeToMinutes(totalTime.h, totalTime.m)
            : formData.totalPages
        };

        await saveBook(bookData, coverFile || undefined);
        setShowBookModal(false);
        setEditingBook(null);
      } catch (error) {
        console.error('Kitap kaydedilirken hata:', error);
        alert('Kitap kaydedilirken bir hata oluştu.');
      } finally {
        setIsLoading(false);
      }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setCoverFile(file);
        setCoverPreview(URL.createObjectURL(file));
      }
    };

    if (!showBookModal) return null;

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="glass-card w-full max-w-lg">
          <div className="p-5 border-b border-white/10">
            <h3 className="text-lg font-semibold text-white">
              {editingBook ? 'Kitabı Düzenle' : 'Yeni Kitap Ekle'}
            </h3>
          </div>
          
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="flex items-center gap-4">
              <img 
                src={coverPreview} 
                alt="Kapak Önizleme" 
                className="w-24 h-36 object-cover rounded-md bg-gray-800"
              />
              <div className="w-full">
                <label className="block text-sm font-medium text-gray-400 mb-2">Kapak Yükle</label>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-500/20 file:text-indigo-300 hover:file:bg-indigo-500/30"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-400">Kitap Adı</label>
              <input 
                type="text" 
                required 
                className="form-input mt-1" 
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400">Yazar</label>
                <input 
                  type="text" 
                  required 
                  className="form-input mt-1" 
                  value={formData.author}
                  onChange={(e) => setFormData({...formData, author: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400">Yayınevi</label>
                <input 
                  type="text" 
                  className="form-input mt-1" 
                  value={formData.publisher}
                  onChange={(e) => setFormData({...formData, publisher: e.target.value})}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400">Format</label>
                <select 
                  className="form-input mt-1" 
                  value={formData.format}
                  onChange={(e) => setFormData({...formData, format: e.target.value as Book['format']})}
                >
                  <option>Fiziksel Kitap</option>
                  <option>E-Kitap</option>
                  <option>Sesli Kitap</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400">Durum</label>
                <select 
                  className="form-input mt-1" 
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value as Book['status']})}
                >
                  <option>Okunmadı</option>
                  <option>Şu An Okuyorum</option>
                  <option>Okudum</option>
                  <option>Yarıda Bıraktım</option>
                </select>
              </div>
            </div>
            
            {isAudio ? (
              <div>
                <label className="block text-sm font-medium text-gray-400">Toplam Süre</label>
                <div className="flex gap-2 mt-1">
                  <input 
                    type="number" 
                    min="0" 
                    placeholder="sa" 
                    className="form-input" 
                    value={totalTime.h}
                    onChange={(e) => setFormData({...formData, totalPages: timeToMinutes(e.target.value, totalTime.m)})}
                  />
                  <input 
                    type="number" 
                    min="0" 
                    max="59" 
                    placeholder="dk" 
                    className="form-input" 
                    value={totalTime.m}
                    onChange={(e) => setFormData({...formData, totalPages: timeToMinutes(totalTime.h, e.target.value)})}
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-400">Toplam Sayfa</label>
                <input 
                  type="number" 
                  min="1" 
                  className="form-input mt-1" 
                  value={formData.totalPages}
                  onChange={(e) => setFormData({...formData, totalPages: parseInt(e.target.value) || 0})}
                />
              </div>
            )}
          </form>
          
          <div className="p-5 border-t border-white/10 flex justify-end gap-3">
            <button 
              type="button" 
              className="bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg"
              onClick={() => {
                setShowBookModal(false);
                setEditingBook(null);
              }}
            >
              İptal
            </button>
            <button 
              type="submit" 
              disabled={isLoading}
              className="primary-btn !py-2 !px-4"
              onClick={(e) => {
                e.preventDefault();
                const form = document.querySelector('form') as HTMLFormElement;
                if (form) form.requestSubmit();
              }}
            >
              {isLoading ? 'Kaydediliyor...' : (editingBook ? 'Güncelle' : 'Kaydet')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const ProgressModal: React.FC = () => {
    const isAudio = progressBook?.format === 'Sesli Kitap';
    const currentProgress = progressBook?.currentPage || 0;
    const totalValue = progressBook?.totalPages || 0;
    const progressTime = isAudio ? minutesToTime(currentProgress) : {h:0, m:0};
    const [newProgress, setNewProgress] = useState(currentProgress);
    const [newTime, setNewTime] = useState(progressTime);

    if (!showProgressModal || !progressBook) return null;

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      
      const finalProgress = isAudio ? timeToMinutes(newTime.h, newTime.m) : newProgress;
      const progressDelta = finalProgress - currentProgress;
      
      if (progressDelta !== 0) {
        await updateDoc(doc(db, `users/${user!.uid}/library_books`, progressBook.id), { 
          currentPage: finalProgress 
        });
        await logActivity(progressBook.id, progressDelta, isAudio ? 'minutes' : 'pages');
      }
      
      setShowProgressModal(false);
      setProgressBook(null);
    };

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="glass-card w-full max-w-md">
          <div className="p-5 border-b border-white/10">
            <h3 className="text-lg font-semibold text-white">
              "{progressBook.title}" İlerleme Kaydet
            </h3>
          </div>
          
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="text-center text-gray-400">
              <p>Mevcut İlerleme: <b className="text-white">
                {isAudio ? formatMinutes(currentProgress) : `${currentProgress} sayfa`}
              </b></p>
              <p>Toplam: <b className="text-white">
                {isAudio ? formatMinutes(totalValue) : `${totalValue} sayfa`}
              </b></p>
            </div>
            
            {isAudio ? (
              <div>
                <label className="block text-sm font-medium text-gray-400">Yeni Süre</label>
                <div className="flex gap-2 mt-1">
                  <input 
                    type="number" 
                    min="0" 
                    placeholder="sa" 
                    className="form-input" 
                    value={newTime.h}
                    onChange={(e) => setNewTime({...newTime, h: parseInt(e.target.value) || 0})}
                  />
                  <input 
                    type="number" 
                    min="0" 
                    max="59" 
                    placeholder="dk" 
                    className="form-input" 
                    value={newTime.m}
                    onChange={(e) => setNewTime({...newTime, m: parseInt(e.target.value) || 0})}
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-400">Yeni Sayfa Numarası</label>
                <input 
                  type="number" 
                  min="0" 
                  max={totalValue}
                  className="form-input mt-1" 
                  value={newProgress}
                  onChange={(e) => setNewProgress(parseInt(e.target.value) || 0)}
                />
              </div>
            )}
          </form>
          
          <div className="p-5 border-t border-white/10 flex justify-end gap-3">
            <button 
              type="button" 
              className="bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg"
              onClick={() => {
                setShowProgressModal(false);
                setProgressBook(null);
              }}
            >
              İptal
            </button>
            <button 
              type="submit" 
              className="primary-btn !py-2 !px-4"
              onClick={(e) => {
                e.preventDefault();
                const form = document.querySelector('form') as HTMLFormElement;
                if (form) form.requestSubmit();
              }}
            >
              Güncelle
            </button>
          </div>
        </div>
      </div>
    );
  };

  const filteredBooks = getFilteredBooks();
  const { totalPages, totalMinutes } = getActivityData();
  const monthlyData = getMonthlyData();
  const formatData = getFormatData();
  const goalProgress = getGoalProgress();
  const currentGoal = goalProgress[activeGoalTab];
  const progressPercentage = currentGoal.target > 0 ? Math.min((currentGoal.current / currentGoal.target) * 100, 100) : 0;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(255,255,255,0.1)' },
        ticks: {
          color: '#9ca3af'
        }
      },
      x: {
        grid: { color: 'rgba(255,255,255,0.1)' },
        ticks: {
          color: '#9ca3af'
        }
      }
    }
  };

  const monthlyChartData = {
    labels: dayjs.localeData().monthsShort(),
    datasets: [{
      label: 'Okunan Sayfa',
      data: monthlyData,
      backgroundColor: 'rgba(79, 70, 229, 0.6)',
      borderColor: 'rgba(79, 70, 229, 1)',
      borderWidth: 1,
      borderRadius: 4
    }]
  };

  const formatChartData = {
    labels: Object.keys(formatData),
    datasets: [{
      data: Object.values(formatData),
      backgroundColor: ['#4f46e5', '#3b82f6', '#8b5cf6', '#ec4899'],
      borderColor: '#111827',
      borderWidth: 4
    }]
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="background-container fixed top-0 left-0 w-full h-full overflow-hidden -z-10">
        <div className="aurora-bg absolute w-[150%] h-[150%] bg-gradient-to-br from-indigo-500/20 via-transparent to-blue-500/20 animate-aurora"></div>
      </div>
      
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 h-screen bg-gray-900/50 backdrop-blur-lg border-r border-white/10 flex flex-col">
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
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                currentView === 'kutuphane' 
                  ? 'bg-indigo-600 text-white' 
                  : 'text-gray-300 hover:bg-white/10'
              }`}
            >
              <i className="fas fa-library w-5 h-5"></i>
              <span>Kütüphane</span>
            </button>
            
            <button
              onClick={() => setCurrentView('panel')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                currentView === 'panel' 
                  ? 'bg-indigo-600 text-white' 
                  : 'text-gray-300 hover:bg-white/10'
              }`}
            >
              <i className="fas fa-chart-bar w-5 h-5"></i>
              <span>Panel & İstatistikler</span>
            </button>

            {onNavigateToReader && (
              <button
                onClick={onNavigateToReader}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10 transition-colors"
              >
                <i className="fas fa-book-reader w-5 h-5"></i>
                <span>Kitap Okuyucu</span>
              </button>
            )}
          </nav>
          
          <div className="p-4 border-t border-white/10">
            <div className="flex items-center gap-2 bg-gray-800/50 border border-white/10 rounded-full px-3 py-1.5 text-sm font-semibold text-orange-400">
              <i className="fas fa-fire w-5 h-5"></i>
              <span>{settings.streak?.current || 0}</span>
            </div>
          </div>
        </aside>
        
        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="h-20 flex items-center justify-between px-8 border-b border-white/10">
            <h1 className="text-2xl font-bold text-white">
              {currentView === 'kutuphane' ? 'Kütüphane' : 'Panel & İstatistikler'}
            </h1>
            
            {currentView === 'kutuphane' && (
              <button 
                onClick={() => {
                  setEditingBook(null);
                  setShowBookModal(true);
                }}
                className="primary-btn !py-2 !px-4 text-sm flex items-center gap-2"
              >
                <i className="fas fa-plus"></i>
                Yeni Kitap
              </button>
            )}
          </header>
          
          <div className="flex-1 overflow-y-auto p-8">
            {currentView === 'kutuphane' ? (
              <div className="space-y-6">
                {/* Filters */}
                <div className="glass-card p-4 space-y-4">
                  <div className="relative">
                    <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5"></i>
                    <input 
                      type="text" 
                      placeholder="Kitap, yazar veya yayınevi ara..." 
                      className="form-input !py-2.5 pl-12" 
                      value={filters.search}
                      onChange={(e) => setFilters({...filters, search: e.target.value})}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <select 
                      className="form-input text-sm" 
                      value={filters.sort}
                      onChange={(e) => setFilters({...filters, sort: e.target.value})}
                    >
                      <option value="title-asc">A-Z (Başlık)</option>
                      <option value="title-desc">Z-A (Başlık)</option>
                      <option value="author-asc">A-Z (Yazar)</option>
                      <option value="author-desc">Z-A (Yazar)</option>
                    </select>
                    
                    <select 
                      className="form-input text-sm" 
                      value={filters.status}
                      onChange={(e) => setFilters({...filters, status: e.target.value})}
                    >
                      <option value="">Tüm Durumlar</option>
                      <option value="Okunmadı">Okunmadı</option>
                      <option value="Şu An Okuyorum">Şu An Okuyorum</option>
                      <option value="Okudum">Okudum</option>
                      <option value="Yarıda Bıraktım">Yarıda Bıraktım</option>
                    </select>
                    
                    <select 
                      className="form-input text-sm" 
                      value={filters.author}
                      onChange={(e) => setFilters({...filters, author: e.target.value})}
                    >
                      <option value="">Tüm Yazarlar</option>
                      {getUniqueValues('author').map(author => (
                        <option key={author} value={author}>{author}</option>
                      ))}
                    </select>
                    
                    <select 
                      className="form-input text-sm" 
                      value={filters.publisher}
                      onChange={(e) => setFilters({...filters, publisher: e.target.value})}
                    >
                      <option value="">Tüm Yayınevleri</option>
                      {getUniqueValues('publisher').map(publisher => (
                        <option key={publisher} value={publisher}>{publisher}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                {/* Books Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {filteredBooks.map(book => (
                    <BookCard key={book.id} book={book} />
                  ))}
                </div>
                
                {filteredBooks.length === 0 && (
                  <div className="text-center text-gray-400 py-16">
                    {books.length === 0 ? (
                      <>
                        <h3 className="text-2xl font-bold">Kütüphaneniz Henüz Boş</h3>
                        <p className="mt-2">Yukarıdaki 'Yeni Kitap' butonuyla ilk kitabınızı ekleyin.</p>
                      </>
                    ) : (
                      <>
                        <h3 className="text-2xl font-bold">Sonuç Bulunamadı</h3>
                        <p className="mt-2">Filtrelerinizi değiştirmeyi deneyin.</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Panel View */
              <div className="space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Goals */}
                  <div className="glass-card p-6">
                    <h2 className="text-xl font-bold mb-4 flex items-center">
                      <i className="fas fa-target mr-3 text-indigo-400"></i>
                      Yıllık Hedefler
                    </h2>
                    
                    <div className="border-b border-white/10 mb-4">
                      <nav className="-mb-px flex space-x-6 text-sm font-medium text-gray-400">
                        {(['books', 'pages', 'minutes'] as const).map(tab => (
                          <button
                            key={tab}
                            onClick={() => setActiveGoalTab(tab)}
                            className={`py-2 px-1 transition-colors ${
                              activeGoalTab === tab 
                                ? 'text-indigo-400 border-b-2 border-indigo-400 font-semibold' 
                                : 'hover:text-gray-300'
                            }`}
                          >
                            {tab === 'books' ? 'Kitap' : tab === 'pages' ? 'Sayfa' : 'Süre'}
                          </button>
                        ))}
                      </nav>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="w-full bg-gray-700 rounded-full h-3">
                        <div 
                          className="bg-indigo-500 h-3 rounded-full transition-all duration-500" 
                          style={{width: `${progressPercentage}%`}}
                        ></div>
                      </div>
                      <div className="text-sm text-center text-gray-300">
                        {currentGoal.current.toLocaleString()} / {currentGoal.target.toLocaleString()} {activeGoalTab === 'books' ? 'kitap' : activeGoalTab === 'pages' ? 'sayfa' : 'dk'}
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <label className="text-sm font-semibold text-gray-300">Hedef:</label>
                        <input 
                          type="number" 
                          min="1" 
                          value={currentGoal.target}
                          onChange={(e) => {
                            const newGoal = parseInt(e.target.value, 10);
                            if (newGoal > 0) {
                              const newSettings = { 
                                ...settings, 
                                goals: { ...settings.goals, [activeGoalTab]: newGoal }
                              };
                              updateSettings(newSettings);
                            }
                          }}
                          className="w-24 p-1 form-input !text-sm !py-1 !px-2 text-center"
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Activity */}
                  <div className="glass-card p-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
                      <div>
                        <h2 className="text-xl font-bold flex items-center mb-2 sm:mb-0">
                          <i className="fas fa-chart-line mr-3 text-indigo-400"></i>
                          Okuma Aktivitesi
                        </h2>
                      </div>
                      <select 
                        className="w-full sm:w-auto form-input !text-sm !py-2 mt-2 sm:mt-0"
                        value={activeActivityFilter}
                        onChange={(e) => setActiveActivityFilter(e.target.value)}
                      >
                        <option value="today">Bugün</option>
                        <option value="yesterday">Dün</option>
                        <option value="last7">Son 7 Gün</option>
                        <option value="last30">Son 30 Gün</option>
                        <option value="thisYear">Bu Yıl</option>
                        <option value="all">Tüm Zamanlar</option>
                      </select>
                    </div>
                    
                    <div className="bg-gray-800/50 p-4 rounded-lg flex justify-around items-center text-center">
                      <div>
                        <div className="flex items-center justify-center gap-2 text-2xl md:text-3xl font-bold text-white">
                          <i className="fas fa-book-open w-6 h-6 text-indigo-400"></i>
                          <span>{totalPages.toLocaleString()}</span>
                        </div>
                        <div className="text-sm text-gray-400 mt-1">Sayfa</div>
                      </div>
                      
                      <div>
                        <div className="flex items-center justify-center gap-2 text-2xl md:text-3xl font-bold text-white">
                          <i className="fas fa-headphones w-6 h-6 text-indigo-400"></i>
                          <span>{formatMinutes(totalMinutes)}</span>
                        </div>
                        <div className="text-sm text-gray-400 mt-1">Süre</div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Statistics */}
                <div className="glass-card p-6">
                  <h2 className="text-xl font-bold mb-6 text-center">
                    <i className="fas fa-chart-bar mr-3 text-indigo-400 inline-block"></i>
                    Kütüphane İstatistikleri
                  </h2>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div>
                      <h3 className="text-lg font-semibold mb-4 text-center text-gray-300">
                        Aylık Okuma (Sayfa)
                      </h3>
                      <div className="relative h-64">
                        <Bar data={monthlyChartData} options={chartOptions} />
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-lg font-semibold mb-4 text-center text-gray-300">
                        Format Dağılımı
                      </h3>
                      <div className="relative h-64 flex justify-center">
                        <Doughnut data={formatChartData} options={{...chartOptions, scales: undefined}} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
      
      {/* Modals */}
      <BookModal />
      <ProgressModal />
    </div>
  );
};

export default KitapTakip;