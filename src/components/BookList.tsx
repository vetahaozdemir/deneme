import React from 'react';
import { Book } from '../hooks/useLibraryData';

interface Props {
  books: Book[];
  onDelete: (book: Book) => void;
  onEdit?: (book: Book) => void;
}

const BookList: React.FC<Props> = ({ books, onDelete, onEdit }) => {
  return (
    <div>
      {books.map(book => (
        <div key={book.id} className="border p-2 mb-2">
          <h3 className="font-bold">{book.title}</h3>
          <p className="text-sm">{book.author}</p>
          <div className="space-x-2 mt-2">
            {onEdit && (
              <button onClick={() => onEdit(book)} className="text-blue-600">Düzenle</button>
            )}
            <button onClick={() => onDelete(book)} className="text-red-600">Sil</button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default BookList;
