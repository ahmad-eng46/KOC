'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginForm) {
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });

    if (error) {
      setServerError('Invalid email or password.');
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Khaliq Oil Company</h1>
        <p className="text-sm text-gray-500 mt-1">Sign in to your account</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-5">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="w-full h-11 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="you@example.com"
            {...register('email')}
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="w-full h-11 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="••••••••"
            {...register('password')}
          />
          {errors.password && (
            <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
          )}
        </div>

        {serverError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
            <p className="text-sm text-red-700">{serverError}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-11 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-center text-xs text-gray-500">
          Forgot password? Contact your admin.
        </p>
      </form>
    </div>
  );
}
