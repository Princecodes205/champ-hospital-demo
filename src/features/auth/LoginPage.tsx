import React, { useState } from 'react';
import { Button, Input } from '../../components/ui';
import { supabase } from '../../lib/supabase';

export const LoginPage = ({ onAuthSuccess }: { onAuthSuccess: (user: any) => void }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const email = `${username.toLowerCase()}@staff.champhospital.internal`;
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      // DYNAMIC PROFILE SYNC
      // Check if profile exists; if not, we let App.tsx handle the creation
      // or we can create it here. For best UX, we'll just verify the user is authenticated
      // and let the App's initAuth handle the profile sync.
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user?.id)
        .single();

      if (!profile) {
        // Instead of throwing "Profile not found", we let the user in
        // and the App.tsx will create the profile automatically.
        onAuthSuccess({
          id: data.user?.id,
          full_name: username,
          role: 'nurse' // Default temporary role to allow entry
        });
      } else {
        onAuthSuccess(profile);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isNetworkError =
        !navigator.onLine ||
        /failed to fetch/i.test(message) ||
        (err as { name?: string })?.name === 'FetchError';

      setError(
        isNetworkError
          ? 'Network error. Please check your internet connection and try again.'
          : 'Incorrect username or password.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-primary rounded-sm flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">C</div>
          <h1 className="text-2xl font-bold tracking-tight">Champ Hospital</h1>
          <p className="text-sm text-muted-foreground">Staff Login</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            label="Username"
            placeholder="Enter your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <div className="relative">
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-9 text-xs text-primary hover:underline"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          {error && (
            <div className="p-3 rounded-control bg-red-50 text-red-600 text-xs font-medium border border-red-100">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" isLoading={isLoading}>
            Sign In
          </Button>
        </form>
      </div>
    </div>
  );
};
