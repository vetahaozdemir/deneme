import React, { useState, useEffect, useRef } from 'react';
import { collection, doc, setDoc, onSnapshot, query, orderBy, deleteDoc, addDoc, serverTimestamp, getDocs, getDoc, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';
import { DEFAULT_THEME } from '../config/defaults';

interface ReaderBook {
  id: string;
  filename: string;
  title: string;
  bookUrl: string;
  coverImageUrl?: string;
  uploadDate: any;
  currentPosition?: string;
  lastReadDate?: any;
  readingProgress?: number;
}

interface ReaderSettings {
  theme: 'light' | 'dark' | 'sepia';
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
}

const Okuyucu: React.FC = () => {
  const { user } = useAuth();
  const [books, setBooks] = useState<ReaderBook[]>([]);
  const [currentBook, setCurrentBook] = useState<ReaderBook | null>(null);
  const [showReader, setShowReader] = useState(false);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() => {
    const saved = localStorage.getItem('readerSettings');
    return saved ? JSON.parse(saved) : {
      theme: DEFAULT_THEME,
      fontSize: 16,
      lineHeight: 1.6,
      fontFamily: 'Manrope, sans-serif'
    };
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [, setEpubBook] = useState<any>(null);
  const [rendition, setRendition] = useState<any>(null);

  // Load books on mount
  useEffect(() => {
    if (user) {
      const unsubscribe = loadBooks();
      return unsubscribe;
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadBooks = () => {
    if (!user) return;
    
    // Hosting'deki okuyucu pozisyonlarından kitapları yükle
    const positionsQuery = query(
      collection(db, 'users', user.uid, 'standalone_reader_positions'),
      orderBy('updatedAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(positionsQuery, (snapshot) => {
      const bookList: ReaderBook[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        bookList.push({
          id: doc.id,
          filename: data.title + '.epub', // Default filename
          title: data.title || 'İsimsiz Kitap',
          author: data.author || '',
          bookUrl: data.originalUrl || '',
          coverImageUrl: data.coverImageUrl,
          uploadDate: data.updatedAt || data.createdAt,
          currentPosition: data.lastPosition,
          lastReadDate: data.updatedAt,
          readingProgress: 0, // Calculate based on position if needed
          libraryBookId: data.libraryBookId
        } as ReaderBook);
      });
      setBooks(bookList);
    });

    return unsubscribe;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const allowedTypes = ['.pdf', '.epub', '.txt', '.html', '.md'];
    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedTypes.includes(fileExt)) {
      setError('Desteklenmeyen dosya formatı. PDF, EPUB, TXT, HTML veya MD dosyası seçin.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', user.uid);
      formData.append('title', file.name.replace(/\.[^/.]+$/, ""));

      const response = await fetch('https://tahaveli.com/upload_book.php', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      
      if (result.success) {
        // Save book info to Firestore
        await addDoc(collection(db, 'users', user.uid, 'library_books'), {
          filename: file.name,
          title: result.title || file.name.replace(/\.[^/.]+$/, ""),
          bookUrl: result.bookUrl,
          coverImageUrl: result.coverImageUrl || null,
          uploadDate: serverTimestamp(),
          currentPosition: '',
          readingProgress: 0
        });
      } else {
        throw new Error(result.message || 'Yükleme başarısız');
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError('Dosya yüklenirken bir hata oluştu.');
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const openBook = async (book: ReaderBook) => {
    setCurrentBook(book);
    setShowReader(true);
    setIsLoading(true);
    
    try {
      const fileExt = book.filename.split('.').pop()?.toLowerCase();
      
      if (fileExt === 'pdf') {
        await loadPDF(book.bookUrl);
      } else if (fileExt === 'epub') {
        await loadEPUB(book.bookUrl);
      } else {
        await loadTextFile(book.bookUrl);
      }
      
      // Update last read date
      if (user && book.id) {
        await setDoc(
          doc(db, 'users', user.uid, 'library_books', book.id),
          { lastReadDate: serverTimestamp() },
          { merge: true }
        );
      }
    } catch (err) {
      console.error('Error opening book:', err);
      setError('Kitap açılırken bir hata oluştu.');
      setShowReader(false);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPDF = async (url: string) => {
    const pdfjsLib = (window as any).pdfjsLib;
    if (!pdfjsLib) {
      throw new Error('PDF.js yüklenmedi');
    }
    
    const loadingTask = pdfjsLib.getDocument(url);
    const pdf = await loadingTask.promise;
    setPdfDoc(pdf);
    setTotalPages(pdf.numPages);
    setCurrentPage(1);
    await renderPDFPage(pdf, 1);
  };

  const renderPDFPage = async (pdf: any, pageNum: number) => {
    const page = await pdf.getPage(pageNum);
    const canvas = pdfCanvasRef.current;
    if (!canvas) return;
    
    const context = canvas.getContext('2d');
    const viewport = page.getViewport({ scale: 1.5 });
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;
  };

  const loadEPUB = async (url: string) => {
    const ePub = (window as any).ePub || (window as any).epub;
    if (!ePub) {
      throw new Error('EPUB.js yüklenmedi');
    }
    
    const book = ePub(url);
    setEpubBook(book);
    
    if (viewerRef.current) {
      const renditionInstance = book.renderTo(viewerRef.current, {
        width: '100%',
        height: '100%',
        spread: 'none'
      });
      
      setRendition(renditionInstance);
      
      // Apply font settings
      try {
        renditionInstance.themes.default({
          'body': { 
            'font-family': `"${readerSettings.fontFamily}" !important`, 
            'line-height': readerSettings.lineHeight + ' !important', 
            'font-size': readerSettings.fontSize + 'px !important' 
          },
          'p': {
            'font-family': `"${readerSettings.fontFamily}" !important`, 
            'line-height': readerSettings.lineHeight + ' !important', 
            'font-size': readerSettings.fontSize + 'px !important'
          }
        });
      } catch (error) {
        console.warn('Theme application failed:', error);
      }
      
      await renditionInstance.display();
      
      // Add navigation
      renditionInstance.on('click', (event: any) => {
        const { x } = event;
        const width = viewerRef.current?.offsetWidth || 0;
        
        if (x < width * 0.3) {
          renditionInstance.prev();
        } else if (x > width * 0.7) {
          renditionInstance.next();
        }
      });
    }
  };

  const loadTextFile = async (url: string) => {
    const response = await fetch(url);
    const text = await response.text();
    
    if (viewerRef.current) {
      viewerRef.current.innerHTML = `
        <div class="prose prose-lg max-w-none p-8 leading-relaxed" style="
          font-size: ${readerSettings.fontSize}px;
          line-height: ${readerSettings.lineHeight};
          font-family: ${readerSettings.fontFamily};
        ">
          ${text.replace(/\n/g, '<br>')}
        </div>
      `;
    }
  };

  const closeReader = () => {
    setShowReader(false);
    setCurrentBook(null);
    setPdfDoc(null);
    setEpubBook(null);
    setRendition(null);
    setCurrentPage(1);
    setTotalPages(0);
  };

  const deleteBook = async (bookId: string) => {
    if (!user || !window.confirm('Bu kitabı silmek istediğinizden emin misiniz?')) {
      return;
    }
    
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'library_books', bookId));
    } catch (err) {
      console.error('Error deleting book:', err);
      setError('Kitap silinirken bir hata oluştu.');
    }
  };

  const nextPage = async () => {
    if (pdfDoc && currentPage < totalPages) {
      const newPage = currentPage + 1;
      setCurrentPage(newPage);
      await renderPDFPage(pdfDoc, newPage);
    } else if (rendition) {
      rendition.next();
    }
  };

  const prevPage = async () => {
    if (pdfDoc && currentPage > 1) {
      const newPage = currentPage - 1;
      setCurrentPage(newPage);
      await renderPDFPage(pdfDoc, newPage);
    } else if (rendition) {
      rendition.prev();
    }
  };

  const getFileFormat = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const formats: { [key: string]: string } = {
      pdf: 'PDF',
      epub: 'ePub',
      txt: 'TXT',
      html: 'HTML',
      htm: 'HTML',
      md: 'Markdown',
      markdown: 'Markdown'
    };
    return formats[ext || ''] || 'Bilinmeyen';
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Bilinmiyor';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('tr-TR');
  };

  if (showReader && currentBook) {
    return (
      <div className="fixed inset-0 bg-white z-40 w-full h-screen flex flex-col">
        {/* Reader Header */}
        <div className="bg-gray-800/90 backdrop-blur-sm px-3 sm:px-4 py-3 flex items-center justify-between border-b border-gray-700 z-20">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <button onClick={closeReader} className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-700/50 transition-colors flex-shrink-0">
              <i className="fas fa-arrow-left text-lg"></i>
            </button>
            <div className="text-white min-w-0 flex-1">
              <h2 className="font-semibold text-sm sm:text-lg truncate" title={currentBook.title}>{currentBook.title}</h2>
              <p className="text-xs sm:text-sm text-gray-400 hidden sm:block">Yazar belirtilmemiş</p>
            </div>
          </div>
          
          {/* Mobile Menu Button */}
          <button 
            className="sm:hidden p-2 text-gray-400 hover:text-white transition-colors rounded" 
            title="Menü"
            onClick={() => {
              const menu = document.getElementById('reader-mobile-menu');
              if (menu) menu.classList.toggle('hidden');
            }}
          >
            <i className="fas fa-ellipsis-vertical"></i>
          </button>
          
          {/* Desktop Controls */}
          <div className="hidden sm:flex items-center gap-2">
            {/* Theme Controls */}
            <div className="flex bg-gray-700 rounded-lg p-1">
              <button 
                onClick={() => {
                  const newSettings = {...readerSettings, theme: 'light' as const};
                  setReaderSettings(newSettings);
                  localStorage.setItem('readerSettings', JSON.stringify(newSettings));
                }}
                className={`px-2 sm:px-3 py-1 text-xs rounded transition-colors ${
                  readerSettings.theme === 'light' ? 'bg-white text-black' : 'text-gray-400'
                }`}
              >
                <i className="fas fa-sun"></i>
              </button>
              <button 
                onClick={() => {
                  const newSettings = {...readerSettings, theme: 'dark' as const};
                  setReaderSettings(newSettings);
                  localStorage.setItem('readerSettings', JSON.stringify(newSettings));
                }}
                className={`px-2 sm:px-3 py-1 text-xs rounded transition-colors ${
                  readerSettings.theme === 'dark' ? 'bg-gray-900 text-white' : 'text-gray-400'
                }`}
              >
                <i className="fas fa-moon"></i>
              </button>
              <button 
                onClick={() => {
                  const newSettings = {...readerSettings, theme: 'sepia' as const};
                  setReaderSettings(newSettings);
                  localStorage.setItem('readerSettings', JSON.stringify(newSettings));
                }}
                className={`px-2 sm:px-3 py-1 text-xs rounded transition-colors ${
                  readerSettings.theme === 'sepia' ? 'bg-yellow-100 text-yellow-900' : 'text-gray-400'
                }`}
              >
                <i className="fas fa-leaf"></i>
              </button>
            </div>
            
            {/* Font Size */}
            <div className="flex items-center gap-1 bg-gray-700 rounded-lg p-1">
              <button 
                onClick={() => {
                  const newSettings = {...readerSettings, fontSize: Math.max(12, readerSettings.fontSize - 2)};
                  setReaderSettings(newSettings);
                  localStorage.setItem('readerSettings', JSON.stringify(newSettings));
                }}
                className="px-2 py-1 text-xs text-gray-400 hover:text-white transition-colors"
              >
                A-
              </button>
              <span className="text-xs text-gray-300 px-2">{readerSettings.fontSize}px</span>
              <button 
                onClick={() => {
                  const newSettings = {...readerSettings, fontSize: Math.min(24, readerSettings.fontSize + 2)};
                  setReaderSettings(newSettings);
                  localStorage.setItem('readerSettings', JSON.stringify(newSettings));
                }}
                className="px-2 py-1 text-xs text-gray-400 hover:text-white transition-colors"
              >
                A+
              </button>
            </div>
            
            {pdfDoc && (
              <div className="flex items-center space-x-2 text-sm">
                <span>{currentPage} / {totalPages}</span>
              </div>
            )}
          </div>
          
          {/* Mobile Menu Panel */}
          <div id="reader-mobile-menu" className="sm:hidden absolute top-full right-3 mt-2 bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl z-30 min-w-48 hidden">
            <div className="p-2 space-y-1">
              <div className="px-3 py-2">
                <p className="text-xs text-gray-400 mb-2">Tema</p>
                <div className="flex gap-1">
                  <button 
                    onClick={() => {
                      const newSettings = {...readerSettings, theme: 'light' as const};
                      setReaderSettings(newSettings);
                      localStorage.setItem('readerSettings', JSON.stringify(newSettings));
                    }}
                    className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                      readerSettings.theme === 'light' ? 'bg-white text-black' : 'text-gray-400 bg-gray-700'
                    }`}
                  >
                    <i className="fas fa-sun"></i>
                  </button>
                  <button 
                    onClick={() => {
                      const newSettings = {...readerSettings, theme: 'dark' as const};
                      setReaderSettings(newSettings);
                      localStorage.setItem('readerSettings', JSON.stringify(newSettings));
                    }}
                    className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                      readerSettings.theme === 'dark' ? 'bg-gray-900 text-white' : 'text-gray-400 bg-gray-700'
                    }`}
                  >
                    <i className="fas fa-moon"></i>
                  </button>
                  <button 
                    onClick={() => {
                      const newSettings = {...readerSettings, theme: 'sepia' as const};
                      setReaderSettings(newSettings);
                      localStorage.setItem('readerSettings', JSON.stringify(newSettings));
                    }}
                    className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                      readerSettings.theme === 'sepia' ? 'bg-yellow-100 text-yellow-900' : 'text-gray-400 bg-gray-700'
                    }`}
                  >
                    <i className="fas fa-leaf"></i>
                  </button>
                </div>
              </div>
              <div className="px-3 py-2">
                <p className="text-xs text-gray-400 mb-2">Font Boyutu</p>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      const newSettings = {...readerSettings, fontSize: Math.max(12, readerSettings.fontSize - 2)};
                      setReaderSettings(newSettings);
                      localStorage.setItem('readerSettings', JSON.stringify(newSettings));
                    }}
                    className="px-2 py-1 text-xs text-gray-400 hover:text-white bg-gray-700 rounded transition-colors"
                  >
                    A-
                  </button>
                  <span className="text-xs text-gray-300 flex-1 text-center">{readerSettings.fontSize}px</span>
                  <button 
                    onClick={() => {
                      const newSettings = {...readerSettings, fontSize: Math.min(24, readerSettings.fontSize + 2)};
                      setReaderSettings(newSettings);
                      localStorage.setItem('readerSettings', JSON.stringify(newSettings));
                    }}
                    className="px-2 py-1 text-xs text-gray-400 hover:text-white bg-gray-700 rounded transition-colors"
                  >
                    A+
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Reader Content */}
        <div 
          id="reader-content"
          data-theme={readerSettings.theme}
          className="flex-1 relative overflow-hidden"
          style={{
            backgroundColor: readerSettings.theme === 'dark' ? '#111827' : 
                           readerSettings.theme === 'sepia' ? '#f4f1ea' : '#ffffff',
            color: readerSettings.theme === 'dark' ? '#f9fafb' : 
                   readerSettings.theme === 'sepia' ? '#5c4b37' : '#1f2937'
          }}
        >
          {/* Navigation Buttons */}
          <button 
            onClick={prevPage}
            className="absolute left-0 top-0 bottom-0 w-1/6 z-10 opacity-0 hover:opacity-100 transition-opacity duration-300 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-black hover:bg-opacity-10"
          >
            <i className="fas fa-chevron-left text-2xl"></i>
          </button>
          
          <button 
            onClick={nextPage}
            className="absolute right-0 top-0 bottom-0 w-1/6 z-10 opacity-0 hover:opacity-100 transition-opacity duration-300 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-black hover:bg-opacity-10"
          >
            <i className="fas fa-chevron-right text-2xl"></i>
          </button>
          
          {/* PDF Canvas */}
          {currentBook.filename.endsWith('.pdf') && (
            <div className="w-full h-full overflow-auto text-center p-8 bg-gray-500">
              <canvas 
                ref={pdfCanvasRef}
                className="max-w-full h-auto shadow-2xl"
              />
            </div>
          )}
          
          {/* EPUB/Text Viewer */}
          {!currentBook.filename.endsWith('.pdf') && (
            <div 
              ref={viewerRef}
              className="w-full h-full overflow-auto"
              style={{
                fontSize: `${readerSettings.fontSize}px`,
                lineHeight: readerSettings.lineHeight,
                fontFamily: readerSettings.fontFamily
              }}
            />
          )}
        </div>
        
        {isLoading && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 flex items-center space-x-4">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              <span>Kitap yükleniyor...</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 md:p-8">
      <div className="background-container fixed top-0 left-0 w-full h-full overflow-hidden -z-10">
        <div className="aurora-bg absolute w-[150%] h-[150%] bg-gradient-to-br from-indigo-500/20 via-transparent to-blue-500/20 animate-aurora"></div>
      </div>
      
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <i className="fas fa-book-open-reader text-2xl text-indigo-400"></i>
              <h1 className="text-2xl font-bold text-white">Kitap Okuyucu</h1>
            </div>
            
            <div className="flex items-center gap-4">
              <label htmlFor="file-upload" className="primary-btn cursor-pointer flex items-center gap-2">
                <i className="fas fa-upload"></i>
                <span>Yeni Kitap Yükle</span>
              </label>
              <input 
                ref={fileInputRef}
                id="file-upload" 
                type="file" 
                className="hidden" 
                accept=".pdf,.epub,.txt,.html,.md"
                onChange={handleFileUpload}
              />
            </div>
          </div>
        </header>
        
        {error && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300">
            {error}
          </div>
        )}
        
        {isLoading && (
          <div className="mb-6 p-4 bg-indigo-500/20 border border-indigo-500/30 rounded-lg text-indigo-300 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
            Kitap yükleniyor...
          </div>
        )}
        
        {books.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <i className="fas fa-inbox text-5xl text-gray-600 mb-4"></i>
            <h3 className="text-xl font-semibold mb-2">Kitaplığınız boş</h3>
            <p>"Yeni Kitap Yükle" butonuyla ilk kitabınızı ekleyin.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {books.map((book) => (
              <div key={book.id} className="glass-card group hover:scale-105 transition-transform duration-300">
                <div className="aspect-[3/4] relative overflow-hidden rounded-t-xl">
                  {book.coverImageUrl ? (
                    <img 
                      src={book.coverImageUrl} 
                      alt={book.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center">
                      <i className="fas fa-book text-4xl text-white/80"></i>
                    </div>
                  )}
                  
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <button 
                      onClick={() => openBook(book)}
                      className="bg-white/90 hover:bg-white text-gray-900 px-4 py-2 rounded-lg font-semibold transition-colors duration-200"
                    >
                      <i className="fas fa-play mr-2"></i>
                      Oku
                    </button>
                  </div>
                </div>
                
                <div className="p-4">
                  <h3 className="font-semibold text-white text-sm mb-2 line-clamp-2" title={book.title}>
                    {book.title}
                  </h3>
                  
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
                    <span className="bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded-full">
                      {getFileFormat(book.filename)}
                    </span>
                    <span>{formatDate(book.uploadDate)}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <button 
                      onClick={() => openBook(book)}
                      className="text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors duration-200"
                    >
                      Devam Et
                    </button>
                    
                    <button 
                      onClick={() => deleteBook(book.id)}
                      className="text-red-400 hover:text-red-300 transition-colors duration-200"
                    >
                      <i className="fas fa-trash text-sm"></i>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
    </div>
  );
};

export default Okuyucu;