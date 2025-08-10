import { render, screen, fireEvent } from '@testing-library/react';
import AuthScreen from './AuthScreen';

jest.mock('../firebase/config', () => ({ auth: {} }));

jest.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
}));

describe('AuthScreen', () => {
  it('renders login form by default', () => {
    render(<AuthScreen />);
    expect(
      screen.getByRole('heading', { name: /tahaveli unified/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /giriş yap/i })).toBeInTheDocument();
  });

  it('toggles to register form when Kayıt Ol is clicked', () => {
    render(<AuthScreen />);
    fireEvent.click(screen.getByRole('button', { name: /kayıt ol/i }));
    expect(
      screen.getByRole('heading', { name: /kayıt ol/i })
    ).toBeInTheDocument();
  });
});
