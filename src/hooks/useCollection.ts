import { useEffect, useState } from 'react';
import { collection, onSnapshot, QueryConstraint, query, DocumentData } from 'firebase/firestore';
import { db } from '../firebase/config';

export const useCollection = <T = DocumentData>(path: string | null, constraints: QueryConstraint[] = []) => {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!path) {
      setData([]);
      setLoading(false);
      return;
    }

    const q = query(collection(db, path), ...constraints);
    setLoading(true);
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as unknown as T);
        setData(results);
        setLoading(false);
      },
      (err) => {
        console.error('Firestore collection error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [path, JSON.stringify(constraints)]);

  return { data, loading, error };
};
