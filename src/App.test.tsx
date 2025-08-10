import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

// Mock the authentication hook to avoid Firebase dependency during tests
jest.mock('./hooks/useAuth', () => ({
  useAuth: () => ({ user: null, loading: false })
}));

test('shows authentication screen when user is not logged in', () => {
  render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
  const heading = screen.getByText(/Tahaveli Unified/i);
  expect(heading).toBeInTheDocument();
});

