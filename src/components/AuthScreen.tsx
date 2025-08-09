import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase/config';

const AuthScreen: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(mapAuthError(err.code));
    } finally {
      setLoading(false);
    }
  };

  const mapAuthError = (code: string) => {
    const errorMap: { [key: string]: string } = {
      'auth/invalid-email': 'Geçersiz e-posta formatı.',
      'auth/user-not-found': 'Kullanıcı bulunamadı.',
      'auth/wrong-password': 'Yanlış şifre.',
      'auth/email-already-in-use': 'Bu e-posta zaten kullanımda.',
      'auth/weak-password': 'Şifre en az 6 karakter olmalı.',
      'auth/missing-password': 'Lütfen şifrenizi girin.',
      'auth/invalid-credential': 'E-posta veya şifre hatalı.'
    };
    return errorMap[code] || 'Bilinmeyen bir hata oluştu.';
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="background-container fixed top-0 left-0 w-full h-full overflow-hidden -z-10">
        <div className="aurora-bg absolute w-[150%] h-[150%] bg-gradient-to-br from-indigo-500/20 via-transparent to-purple-500/20 animate-aurora"></div>
      </div>
      
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="text-5xl mb-4">🎆</div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Tahaveli Unified</h1>
          <p className="text-gray-400 mt-2">Tüm uygulamalarınız tek yerde</p>
        </div>
        
        <div className="glass-card p-8 space-y-6 bg-gray-800/30 backdrop-blur-lg border border-white/10 rounded-2xl">
          <h2 className="text-2xl font-semibold text-center text-white">
            {isLogin ? 'Giriş Yap' : 'Kayıt Ol'}
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="E-posta Adresi" 
                required 
                className="w-full p-3 bg-gray-700/50 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            
            <div>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isLogin ? 'Şifre' : 'Şifre (en az 6 karakter)'}
                required 
                className="w-full p-3 bg-gray-700/50 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            
            {error && (
              <div className="text-red-400 text-sm text-center">{error}</div>
            )}
            
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 text-white font-semibold py-3 px-4 rounded-lg transition duration-300"
            >
              {loading ? 'Yükleniyor...' : (isLogin ? 'Giriş Yap' : 'Kayıt Ol')}
            </button>
          </form>
          
          <div className="text-center text-sm text-gray-400">
            <span>{isLogin ? 'Hesabın yok mu?' : 'Zaten hesabın var mı?'}</span>
            <button 
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
              }}
              className="font-semibold text-indigo-400 hover:text-indigo-300 ml-1 transition"
            >
              <strong>{isLogin ? 'Kayıt Ol' : 'Giriş Yap'}</strong>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;