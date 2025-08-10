export interface BookGoals {
  books: number;
  pages: number;
  minutes: number;
}

export const DEFAULT_BOOK_GOALS: BookGoals = {
  books: 24,
  pages: 12000,
  minutes: 7200
};

export const DEFAULT_THEME: 'light' | 'dark' = 'dark';
