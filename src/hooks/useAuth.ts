import { useState, useEffect } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const unsubscribe = onAuthStateChanged(auth, 
      (firebaseUser) => {
        if (mounted) {
          setUser(firebaseUser);
          setLoading(false);
        }
      },
      (error) => {
        console.warn('Firebase Auth Error:', error);
        if (mounted) {
          setUser(null);
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return { user, loading };
};