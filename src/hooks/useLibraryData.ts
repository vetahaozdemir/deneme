import { useState, useEffect, useRef } from 'react';
import { collection, doc, query, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { useAuth } from './useAuth';

export interface Book {
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
  readingHistory?: Array<{ date: string; value: number; type: 'pages' | 'minutes' }>; 
  createdAt: any;
  updatedAt?: any;
}

export interface Settings {
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

export function useLibraryData() {
  const { user } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [settings, setSettings] = useState<Settings>({
    goals: { books: 12, pages: 3000, minutes: 6000 },
    streak: { current: 0, longest: 0, lastDate: null }
  });
  const [formData, setFormData] = useState<Partial<Book>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'users', user.uid, 'library_books'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Book[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...(docSnap.data() as Book) });
      });
      setBooks(list);
    });

    loadSettings();
    return unsubscribe;
  }, [user]);

  const loadSettings = async () => {
    if (!user) return;
    const settingsDoc = await getDoc(doc(db, 'users', user.uid, 'library_settings', 'config'));
    if (settingsDoc.exists()) {
      const data = settingsDoc.data();
      setSettings((prev) => ({
        goals: { ...prev.goals, ...(data.goals as Settings['goals']) },
        streak: { ...prev.streak, ...(data.streak as Settings['streak']) }
      }));
    }
  };

  const saveSettings = async (newSettings: Partial<Settings>) => {
    if (!user) return;
    const updated = { ...settings, ...newSettings };
    await setDoc(doc(db, 'users', user.uid, 'library_settings', 'config'), updated);
    setSettings(updated);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const path = `covers/${user.uid}/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, file);
    const url = await getDownloadURL(snapshot.ref);

    setFormData((prev) => ({ ...prev, coverUrl: url, coverPath: path }));
  };

  const addBook = async () => {
    if (!user || !formData.title || !formData.author || !formData.totalPages) return;

    await addDoc(collection(db, 'users', user.uid, 'library_books'), {
      ...formData,
      currentPage: 0,
      readingHistory: [],
      createdAt: serverTimestamp()
    });

    setFormData({});
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const updateBook = async (book: Book) => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid, 'library_books', book.id), {
      ...book,
      updatedAt: serverTimestamp()
    });
  };

  const deleteBook = async (book: Book) => {
    if (!user) return;
    if (book.coverPath) {
      try {
        await deleteObject(ref(storage, book.coverPath));
      } catch (err) {
        console.log('Kapak silinemedi', err);
      }
    }
    await deleteDoc(doc(db, 'users', user.uid, 'library_books', book.id));
  };

  return {
    books,
    settings,
    formData,
    setFormData,
    fileInputRef,
    handleFileUpload,
    addBook,
    updateBook,
    deleteBook,
    saveSettings
  };
}

export default useLibraryData;
