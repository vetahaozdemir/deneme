import React from 'react';
import { Settings } from '../hooks/useLibraryData';

interface Props {
  stats: {
    readBooks: number;
    totalPages: number;
    booksProgress: number;
    pagesProgress: number;
  };
  settings: Settings;
}

const GoalPanel: React.FC<Props> = ({ stats, settings }) => {
  return (
    <div className="mb-4">
      <h2 className="text-xl font-bold mb-2">Hedefler</h2>
      <div>
        <p>
          Kitap: {stats.readBooks} / {settings.goals.books} (
          {Math.round(stats.booksProgress * 100)}%)
        </p>
        <p>
          Sayfa: {stats.totalPages} / {settings.goals.pages} (
          {Math.round(stats.pagesProgress * 100)}%)
        </p>
      </div>
    </div>
  );
};

export default GoalPanel;
