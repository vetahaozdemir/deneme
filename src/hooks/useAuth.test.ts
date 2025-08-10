import { renderHook, waitFor } from '@testing-library/react';
import { useAuth } from './useAuth';

jest.mock('../firebase/config', () => ({ auth: {} }));

const mockOnAuthStateChanged = jest.fn();

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args) => mockOnAuthStateChanged(...args),
}));

describe('useAuth', () => {
  beforeEach(() => {
    mockOnAuthStateChanged.mockReset();
  });

  it('updates user and loading state after auth change', async () => {
    const mockUser = { uid: '123' } as any;
    mockOnAuthStateChanged.mockImplementation((auth, next) => {
      next(mockUser);
      return () => {};
    });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual(mockUser);
  });
});
