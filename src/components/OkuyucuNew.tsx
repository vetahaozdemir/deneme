import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useNotify } from '../hooks/useNotify';

interface Book {
  id: string;
  title: string;
  author: string;
  cover: string;
  fileUrl: string;
  fileType: 'epub' | 'pdf';
  currentPage: number;
  totalPages: number;
  progress: number;
  lastRead: any;
  createdAt: any;
}

interface ReaderSettings {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  theme: string;
  margin: number;
}

const defaultSettings: ReaderSettings = {
  fontSize: 16,
  fontFamily: 'Georgia, serif',
  lineHeight: 1.6,
  theme: 'light',
  margin: 20
};

const OkuyucuNew: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [settings, setSettings] = useState<ReaderSettings>(defaultSettings);
  const [showSettings, setShowSettings] = useState(false);
  const { notifyError } = useNotify();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showBookModal, setShowBookModal] = useState(false);
  const [newBookData, setNewBookData] = useState({
    title: '',
    author: '',
    cover: '',
    fileUrl: '',
    fileType: 'epub' as 'epub' | 'pdf'
  });

  const readerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<any>(null);

  // Load books from Firebase
  useEffect(() => {
    const q = query(collection(db, 'books'), orderBy('lastRead', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const booksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Book[];
      setBooks(booksData);
    });

    return () => unsubscribe();
  }, []);

  // Load settings from localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem('readerSettings');
    if (savedSettings) {
      setSettings({ ...defaultSettings, ...JSON.parse(savedSettings) });
    }
  }, []);

  // Save settings to localStorage
  const saveSettings = (newSettings: ReaderSettings) => {
    setSettings(newSettings);
    localStorage.setItem('readerSettings', JSON.stringify(newSettings));
    applyReaderStyles(newSettings);
  };

  // Apply reader styles
  const applyReaderStyles = (settings: ReaderSettings) => {
    if (readerRef.current) {
      const readerEl = readerRef.current;
      readerEl.style.fontSize = `${settings.fontSize}px`;
      readerEl.style.fontFamily = settings.fontFamily;
      readerEl.style.lineHeight = settings.lineHeight.toString();
      readerEl.style.padding = `${settings.margin}px`;
      
      // Apply theme
      readerEl.className = `reader-content theme-${settings.theme}`;
    }

    // Apply theme to body
    document.body.className = `theme-${settings.theme}`;
  };

  // Load EPUB book
  const loadEpubBook = async (book: Book) => {
    try {
      if (window.ePub) {
        const rendition = window.ePub(book.fileUrl);
        await rendition.display();
        
        if (readerRef.current) {
          readerRef.current.innerHTML = '';
          await rendition.attachTo(readerRef.current);
        }
        
        renditionRef.current = rendition;
        
        // Go to saved page
        if (book.currentPage > 0) {
          rendition.display(book.currentPage);
        }
        
        // Apply current settings
        applyReaderStyles(settings);
        
        // Update last read
        await updateDoc(doc(db, 'books', book.id), {
          lastRead: Timestamp.now()
        });
      }
    } catch (error) {
      console.error('Error loading EPUB:', error);
      notifyError('Kitap yüklenirken hata oluştu');
    }
  };

  // Load PDF book
  const loadPdfBook = async (book: Book) => {
    try {
      if (readerRef.current) {
        readerRef.current.innerHTML = `
          <embed src="${book.fileUrl}" type="application/pdf" width="100%" height="100%" />
        `;
        
        // Update last read
        await updateDoc(doc(db, 'books', book.id), {
          lastRead: Timestamp.now()
        });
      }
    } catch (error) {
      console.error('Error loading PDF:', error);
      notifyError('PDF yüklenirken hata oluştu');
    }
  };

  // Open book for reading
  const openBook = async (book: Book) => {
    setSelectedBook(book);
    setIsReading(true);
    setShowMobileMenu(false);
    
    if (book.fileType === 'epub') {
      await loadEpubBook(book);
    } else {
      await loadPdfBook(book);
    }
  };

  // Close reader
  const closeReader = () => {
    setIsReading(false);
    setSelectedBook(null);
    if (renditionRef.current) {
      renditionRef.current.destroy();
      renditionRef.current = null;
    }
  };

  // Add new book
  const addBook = async () => {
    if (!newBookData.title || !newBookData.fileUrl) return;
    
    try {
      await addDoc(collection(db, 'books'), {
        ...newBookData,
        currentPage: 0,
        totalPages: 0,
        progress: 0,
        lastRead: Timestamp.now(),
        createdAt: Timestamp.now()
      });
      
      setNewBookData({
        title: '',
        author: '',
        cover: '',
        fileUrl: '',
        fileType: 'epub'
      });
      setShowBookModal(false);
    } catch (error) {
      console.error('Error adding book:', error);
      notifyError('Kitap eklenirken hata oluştu');
    }
  };

  // Delete book
  const deleteBook = async (bookId: string) => {
    if (window.confirm('Bu kitabı silmek istediğinize emin misiniz?')) {
      try {
        await deleteDoc(doc(db, 'books', bookId));
      } catch (error) {
        console.error('Error deleting book:', error);
        notifyError('Kitap silinirken hata oluştu');
      }
    }
  };

  // Navigation functions for EPUB
  const goToPrevPage = () => {
    if (renditionRef.current && selectedBook?.fileType === 'epub') {
      renditionRef.current.prev();
    }
  };

  const goToNextPage = () => {
    if (renditionRef.current && selectedBook?.fileType === 'epub') {
      renditionRef.current.next();
    }
  };

  // Theme options
  const themes = [
    { name: 'Açık', value: 'light', bg: 'white', text: 'black' },
    { name: 'Koyu', value: 'dark', bg: '#1a1a1a', text: 'white' },
    { name: 'Sepia', value: 'sepia', bg: '#f4f1ea', text: '#5c4b37' },
    { name: 'Krem', value: 'cream', bg: '#fdf6e3', text: '#657b83' },
    { name: 'Yeşil', value: 'green', bg: '#0d1117', text: '#58a6ff' }
  ];

  // Font families
  const fontFamilies = [
    { name: 'Georgia', value: 'Georgia, serif' },
    { name: 'Times', value: 'Times, serif' },
    { name: 'Arial', value: 'Arial, sans-serif' },
    { name: 'Verdana', value: 'Verdana, sans-serif' },
    { name: 'Helvetica', value: 'Helvetica, sans-serif' }
  ];

  if (isReading && selectedBook) {
    return (
      <div className={`reader-container theme-${settings.theme}`}>
        {/* Reader Header */}
        <div className="reader-header">
          <div className="reader-header-left">
            <button onClick={closeReader} className="btn-back">
              ← Geri
            </button>
            <span className="book-title">{selectedBook.title}</span>
          </div>
          
          <div className="reader-header-right">
            <button onClick={() => setShowMobileMenu(!showMobileMenu)} className="btn-menu mobile-only">
              ☰
            </button>
            <button onClick={() => setShowSettings(!showSettings)} className="btn-settings desktop-only">
              ⚙️
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {showMobileMenu && (
          <div className="mobile-menu">
            <button onClick={() => setShowSettings(true)} className="mobile-menu-item">
              ⚙️ Ayarlar
            </button>
            <button onClick={goToPrevPage} className="mobile-menu-item" disabled={selectedBook.fileType !== 'epub'}>
              ← Önceki Sayfa
            </button>
            <button onClick={goToNextPage} className="mobile-menu-item" disabled={selectedBook.fileType !== 'epub'}>
              Sonraki Sayfa →
            </button>
          </div>
        )}

        {/* Settings Panel */}
        {showSettings && (
          <div className="settings-panel">
            <div className="settings-content">
              <div className="settings-header">
                <h3>Okuma Ayarları</h3>
                <button onClick={() => setShowSettings(false)} className="btn-close">×</button>
              </div>

              <div className="settings-body">
                {/* Font Size */}
                <div className="setting-group">
                  <label>Font Boyutu: {settings.fontSize}px</label>
                  <input
                    type="range"
                    min="12"
                    max="24"
                    value={settings.fontSize}
                    onChange={(e) => saveSettings({...settings, fontSize: parseInt(e.target.value)})}
                  />
                </div>

                {/* Font Family */}
                <div className="setting-group">
                  <label>Font Ailesi</label>
                  <select
                    value={settings.fontFamily}
                    onChange={(e) => saveSettings({...settings, fontFamily: e.target.value})}
                  >
                    {fontFamilies.map(font => (
                      <option key={font.value} value={font.value}>{font.name}</option>
                    ))}
                  </select>
                </div>

                {/* Line Height */}
                <div className="setting-group">
                  <label>Satır Aralığı: {settings.lineHeight}</label>
                  <input
                    type="range"
                    min="1.2"
                    max="2.0"
                    step="0.1"
                    value={settings.lineHeight}
                    onChange={(e) => saveSettings({...settings, lineHeight: parseFloat(e.target.value)})}
                  />
                </div>

                {/* Margin */}
                <div className="setting-group">
                  <label>Kenar Boşluğu: {settings.margin}px</label>
                  <input
                    type="range"
                    min="10"
                    max="50"
                    value={settings.margin}
                    onChange={(e) => saveSettings({...settings, margin: parseInt(e.target.value)})}
                  />
                </div>

                {/* Themes */}
                <div className="setting-group">
                  <label>Tema</label>
                  <div className="theme-options">
                    {themes.map(theme => (
                      <button
                        key={theme.value}
                        className={`theme-option ${settings.theme === theme.value ? 'active' : ''}`}
                        style={{ backgroundColor: theme.bg, color: theme.text }}
                        onClick={() => saveSettings({...settings, theme: theme.value})}
                      >
                        {theme.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reader Content */}
        <div className="reader-content-wrapper">
          <div ref={readerRef} className={`reader-content theme-${settings.theme}`}>
            {/* EPUB/PDF content will be loaded here */}
          </div>
        </div>

        {/* Navigation Controls */}
        {selectedBook.fileType === 'epub' && (
          <div className="reader-navigation desktop-only">
            <button onClick={goToPrevPage} className="nav-btn nav-prev">← Önceki</button>
            <button onClick={goToNextPage} className="nav-btn nav-next">Sonraki →</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="okuyucu-container">
      {/* Header */}
      <div className="okuyucu-header">
        <h1 className="okuyucu-title">📚 Okuyucu</h1>
        <button onClick={() => setShowBookModal(true)} className="btn-add-book">
          + Kitap Ekle
        </button>
      </div>

      {/* Books Grid */}
      <div className="books-grid">
        {books.length === 0 ? (
          <div className="empty-state">
            <p>Henüz kitap eklenmemiş. Okumaya başlamak için kitap ekleyin!</p>
          </div>
        ) : (
          books.map(book => (
            <div key={book.id} className="book-card">
              <div className="book-cover">
                {book.cover ? (
                  <img src={book.cover} alt={book.title} />
                ) : (
                  <div className="book-placeholder">
                    <span>📖</span>
                    <div className="book-spine"></div>
                  </div>
                )}
              </div>
              
              <div className="book-info">
                <h3 className="book-title">{book.title}</h3>
                <p className="book-author">{book.author}</p>
                <div className="book-type">{book.fileType.toUpperCase()}</div>
                
                {book.progress > 0 && (
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${book.progress}%` }}
                    ></div>
                    <span className="progress-text">{Math.round(book.progress)}%</span>
                  </div>
                )}
              </div>
              
              <div className="book-actions">
                <button onClick={() => openBook(book)} className="btn-read">
                  Oku
                </button>
                <button onClick={() => deleteBook(book.id)} className="btn-delete">
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Book Modal */}
      {showBookModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Yeni Kitap Ekle</h3>
              <button onClick={() => setShowBookModal(false)} className="btn-close">×</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Kitap Adı</label>
                <input
                  type="text"
                  value={newBookData.title}
                  onChange={(e) => setNewBookData({...newBookData, title: e.target.value})}
                  placeholder="Kitap adını girin"
                />
              </div>
              
              <div className="form-group">
                <label>Yazar</label>
                <input
                  type="text"
                  value={newBookData.author}
                  onChange={(e) => setNewBookData({...newBookData, author: e.target.value})}
                  placeholder="Yazar adını girin"
                />
              </div>
              
              <div className="form-group">
                <label>Kapak Resmi URL (Opsiyonel)</label>
                <input
                  type="url"
                  value={newBookData.cover}
                  onChange={(e) => setNewBookData({...newBookData, cover: e.target.value})}
                  placeholder="https://example.com/cover.jpg"
                />
              </div>
              
              <div className="form-group">
                <label>Kitap Dosyası URL</label>
                <input
                  type="url"
                  value={newBookData.fileUrl}
                  onChange={(e) => setNewBookData({...newBookData, fileUrl: e.target.value})}
                  placeholder="https://example.com/book.epub"
                />
              </div>
              
              <div className="form-group">
                <label>Dosya Tipi</label>
                <select
                  value={newBookData.fileType}
                  onChange={(e) => setNewBookData({...newBookData, fileType: e.target.value as 'epub' | 'pdf'})}
                >
                  <option value="epub">EPUB</option>
                  <option value="pdf">PDF</option>
                </select>
              </div>
            </div>
            
            <div className="modal-footer">
              <button onClick={() => setShowBookModal(false)} className="btn-cancel">
                İptal
              </button>
              <button onClick={addBook} className="btn-confirm">
                Ekle
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .okuyucu-container {
          padding: 20px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .okuyucu-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 2px solid rgba(255, 255, 255, 0.1);
        }

        .okuyucu-title {
          font-size: 2rem;
          font-weight: 600;
          color: white;
          margin: 0;
        }

        .btn-add-book {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .btn-add-book:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
        }

        .books-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 20px;
          margin-bottom: 40px;
        }

        .book-card {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 20px;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .book-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.2);
          background: rgba(255, 255, 255, 0.15);
        }

        .book-cover {
          width: 100%;
          height: 200px;
          margin-bottom: 15px;
          border-radius: 12px;
          overflow: hidden;
          position: relative;
        }

        .book-cover img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .book-placeholder {
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          font-size: 3rem;
          color: white;
          position: relative;
        }

        .book-spine {
          position: absolute;
          left: 20px;
          top: 0;
          bottom: 0;
          width: 4px;
          background: rgba(255, 255, 255, 0.3);
        }

        .book-info {
          flex: 1;
          margin-bottom: 15px;
        }

        .book-title {
          font-size: 1.1rem;
          font-weight: 600;
          color: white;
          margin: 0 0 5px 0;
          line-height: 1.3;
        }

        .book-author {
          color: rgba(255, 255, 255, 0.7);
          margin: 0 0 10px 0;
          font-size: 0.9rem;
        }

        .book-type {
          display: inline-block;
          background: rgba(255, 255, 255, 0.2);
          color: white;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 500;
        }

        .progress-bar {
          margin-top: 10px;
          height: 8px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
          overflow: hidden;
          position: relative;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
          transition: width 0.3s ease;
        }

        .progress-text {
          position: absolute;
          right: 8px;
          top: -20px;
          font-size: 0.8rem;
          color: white;
        }

        .book-actions {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .btn-read {
          flex: 1;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          padding: 10px 16px;
          border-radius: 8px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .btn-read:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .btn-delete {
          background: rgba(255, 255, 255, 0.1);
          color: #ff4757;
          border: none;
          width: 40px;
          height: 40px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .btn-delete:hover {
          background: rgba(255, 71, 87, 0.2);
          transform: scale(1.1);
        }

        .empty-state {
          grid-column: 1 / -1;
          text-align: center;
          padding: 60px 20px;
          color: rgba(255, 255, 255, 0.6);
          font-size: 1.1rem;
        }

        /* Reader Styles */
        .reader-container {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 1000;
          display: flex;
          flex-direction: column;
        }

        .theme-light {
          background: #ffffff;
          color: #333333;
        }

        .theme-dark {
          background: #1a1a1a;
          color: #ffffff;
        }

        .theme-sepia {
          background: #f4f1ea;
          color: #5c4b37;
        }

        .theme-cream {
          background: #fdf6e3;
          color: #657b83;
        }

        .theme-green {
          background: #0d1117;
          color: #58a6ff;
        }

        .reader-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.1);
        }

        .reader-header-left {
          display: flex;
          align-items: center;
          gap: 15px;
        }

        .btn-back {
          background: none;
          border: none;
          color: inherit;
          font-size: 1rem;
          cursor: pointer;
          padding: 8px 12px;
          border-radius: 6px;
          transition: background 0.3s ease;
        }

        .btn-back:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .book-title {
          font-weight: 500;
          font-size: 1.1rem;
        }

        .btn-menu, .btn-settings {
          background: none;
          border: none;
          color: inherit;
          font-size: 1.2rem;
          cursor: pointer;
          padding: 8px;
          border-radius: 6px;
          transition: background 0.3s ease;
        }

        .btn-menu:hover, .btn-settings:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .mobile-menu {
          position: absolute;
          top: 100%;
          right: 20px;
          background: rgba(0, 0, 0, 0.9);
          backdrop-filter: blur(10px);
          border-radius: 8px;
          padding: 10px;
          z-index: 1001;
          min-width: 200px;
        }

        .mobile-menu-item {
          display: block;
          width: 100%;
          background: none;
          border: none;
          color: white;
          padding: 12px 16px;
          text-align: left;
          cursor: pointer;
          border-radius: 6px;
          transition: background 0.3s ease;
        }

        .mobile-menu-item:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
        }

        .mobile-menu-item:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .settings-panel {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: 320px;
          background: rgba(0, 0, 0, 0.9);
          backdrop-filter: blur(10px);
          z-index: 1002;
          transform: translateX(100%);
          animation: slideIn 0.3s ease forwards;
        }

        @keyframes slideIn {
          to {
            transform: translateX(0);
          }
        }

        .settings-content {
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .settings-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .settings-header h3 {
          margin: 0;
          color: white;
          font-size: 1.2rem;
        }

        .btn-close {
          background: none;
          border: none;
          color: white;
          font-size: 1.5rem;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: background 0.3s ease;
        }

        .btn-close:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .settings-body {
          flex: 1;
          padding: 20px;
          overflow-y: auto;
        }

        .setting-group {
          margin-bottom: 25px;
        }

        .setting-group label {
          display: block;
          color: white;
          margin-bottom: 8px;
          font-weight: 500;
        }

        .setting-group input, .setting-group select {
          width: 100%;
          padding: 10px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          font-size: 1rem;
        }

        .setting-group input[type="range"] {
          padding: 0;
          height: 6px;
          background: rgba(255, 255, 255, 0.2);
          outline: none;
          border-radius: 3px;
        }

        .setting-group input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 18px;
          height: 18px;
          background: #667eea;
          border-radius: 50%;
          cursor: pointer;
        }

        .theme-options {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .theme-option {
          padding: 12px 16px;
          border: 2px solid transparent;
          border-radius: 8px;
          cursor: pointer;
          text-align: center;
          font-weight: 500;
          transition: all 0.3s ease;
        }

        .theme-option.active {
          border-color: #667eea;
          box-shadow: 0 0 12px rgba(102, 126, 234, 0.4);
        }

        .reader-content-wrapper {
          flex: 1;
          overflow: auto;
          position: relative;
        }

        .reader-content {
          height: 100%;
          padding: 40px;
          font-family: Georgia, serif;
          line-height: 1.6;
          max-width: 800px;
          margin: 0 auto;
        }

        .reader-navigation {
          position: fixed;
          bottom: 30px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 20px;
          z-index: 1001;
        }

        .nav-btn {
          background: rgba(0, 0, 0, 0.7);
          color: white;
          border: none;
          padding: 12px 20px;
          border-radius: 25px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
          backdrop-filter: blur(10px);
        }

        .nav-btn:hover:not(:disabled) {
          background: rgba(102, 126, 234, 0.8);
          transform: translateY(-2px);
        }

        .nav-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }

        .modal-content {
          background: rgba(30, 30, 30, 0.95);
          backdrop-filter: blur(20px);
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          width: 100%;
          max-width: 500px;
          max-height: 80vh;
          overflow: hidden;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .modal-header h3 {
          margin: 0;
          color: white;
          font-size: 1.3rem;
        }

        .modal-body {
          padding: 20px;
          max-height: 400px;
          overflow-y: auto;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-group label {
          display: block;
          color: white;
          margin-bottom: 8px;
          font-weight: 500;
        }

        .form-group input, .form-group select {
          width: 100%;
          padding: 12px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          font-size: 1rem;
        }

        .form-group input::placeholder {
          color: rgba(255, 255, 255, 0.5);
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .btn-cancel {
          background: rgba(255, 255, 255, 0.1);
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .btn-cancel:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .btn-confirm {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .btn-confirm:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        /* Responsive */
        .mobile-only {
          display: none;
        }

        .desktop-only {
          display: block;
        }

        @media (max-width: 768px) {
          .mobile-only {
            display: block;
          }
          
          .desktop-only {
            display: none;
          }

          .okuyucu-container {
            padding: 15px;
          }

          .books-grid {
            grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
            gap: 15px;
          }

          .settings-panel {
            width: 100%;
            right: 0;
          }

          .reader-content {
            padding: 20px 15px;
          }

          .modal-content {
            margin: 20px;
          }
        }
      `}</style>
    </div>
  );
};

export default OkuyucuNew;