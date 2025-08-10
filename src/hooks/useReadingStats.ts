import { useMemo } from 'react';
import { Book, Settings } from './useLibraryData';

export function useReadingStats(books: Book[], settings: Settings) {
  return useMemo(() => {
    const readBooks = books.filter(b => b.status === 'Okudum').length;
    const totalPages = books.reduce((sum, b) => sum + (b.currentPage || 0), 0);

    const booksProgress = settings.goals.books ? readBooks / settings.goals.books : 0;
    const pagesProgress = settings.goals.pages ? totalPages / settings.goals.pages : 0;

    return {
      readBooks,
      totalPages,
      booksProgress,
      pagesProgress
    };
  }, [books, settings]);
}

export default useReadingStats;
