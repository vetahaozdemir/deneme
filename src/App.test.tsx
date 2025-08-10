import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

// Mock the authentication hook to avoid Firebase dependency during tests
jest.mock('./hooks/useAuth', () => ({
  useAuth: () => ({ user: null, loading: false })
}));

test('shows authentication screen when user is not logged in', () => {
  render(<App />);
  const heading = screen.getByText(/Tahaveli Unified/i);
  expect(heading).toBeInTheDocument();
});

