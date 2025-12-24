'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { EyeIcon, EyeOffIcon, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { setTokens, setUser } = useAuthStore();
  const [nip, setNip] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Hydrate store on mount
  useEffect(() => {
    useAuthStore.persist.rehydrate();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await authApi.login(nip, password);
      setTokens(data.accessToken, data.refreshToken);
      
      const user = await authApi.me();
      setUser(user);
      
      router.push('/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Login Card */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-6">
              <img src="/logo.png" alt="Drive" className="w-16 h-16 object-contain" />
            </div>
            <h1 className="text-2xl font-normal text-gray-900">Sign in</h1>
            <p className="text-gray-600 mt-2">to continue to Drive</p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm text-gray-700 mb-1.5">
                NIP
              </label>
              <input
                type="text"
                value={nip}
                onChange={(e) => setNip(e.target.value)}
                placeholder="25129120"
                className="w-full px-3 py-2.5 rounded-md border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 rounded-md border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all pr-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {showPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                </button>
              </div>
            </div>

           
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Quick Login Credentials */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500 text-center mb-3">Demo Credentials (click to fill)</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => { setNip('00000001'); setPassword('admin123'); }}
                className="p-2 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-center"
              >
                <div className="text-xs font-medium text-blue-600">Admin</div>
                <div className="text-[10px] text-gray-400 mt-0.5">00000001</div>
              </button>
              <button
                type="button"
                onClick={() => { setNip('00000002'); setPassword('admin123'); }}
                className="p-2 rounded-lg border border-gray-200 hover:border-green-400 hover:bg-green-50 transition-all text-center"
              >
                <div className="text-xs font-medium text-green-600">User 1</div>
                <div className="text-[10px] text-gray-400 mt-0.5">00000002</div>
              </button>
              <button
                type="button"
                onClick={() => { setNip('00000003'); setPassword('admin123'); }}
                className="p-2 rounded-lg border border-gray-200 hover:border-purple-400 hover:bg-purple-50 transition-all text-center"
              >
                <div className="text-xs font-medium text-purple-600">User 2</div>
                <div className="text-[10px] text-gray-400 mt-0.5">00000003</div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between text-sm text-gray-500">
          <span>Indonesia</span>
          <div className="flex gap-4">
            <a href="#" className="hover:text-gray-700">Help</a>
            <a href="#" className="hover:text-gray-700">Privacy</a>
            <a href="#" className="hover:text-gray-700">Terms</a>
          </div>
        </div>
      </div>
    </div>
  );
}
