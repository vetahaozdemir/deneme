import React from 'react';
import useLibraryData from '../hooks/useLibraryData';
import useReadingStats from '../hooks/useReadingStats';
import BookList from './BookList';
import GoalPanel from './GoalPanel';

const KutuphanemNew: React.FC = () => {
  const {
    books,
    settings,
    formData,
    setFormData,
    addBook,
    deleteBook
  } = useLibraryData();

  const stats = useReadingStats(books, settings);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addBook();
  };

  return (
    <div className="p-4">
      <GoalPanel stats={stats} settings={settings} />

      <form onSubmit={handleSubmit} className="mb-4 space-y-2">
        <input
          type="text"
          placeholder="Kitap Başlığı"
          value={formData.title || ''}
          onChange={e => setFormData({ ...formData, title: e.target.value })}
          className="border p-1 w-full"
        />
        <input
          type="text"
          placeholder="Yazar"
          value={formData.author || ''}
          onChange={e => setFormData({ ...formData, author: e.target.value })}
          className="border p-1 w-full"
        />
        <input
          type="number"
          placeholder="Toplam Sayfa"
          value={formData.totalPages || ''}
          onChange={e => setFormData({ ...formData, totalPages: Number(e.target.value) })}
          className="border p-1 w-full"
        />
        <button type="submit" className="bg-blue-500 text-white px-2 py-1">Ekle</button>
      </form>

      <BookList books={books} onDelete={deleteBook} />
    </div>
  );
};

export default KutuphanemNew;
