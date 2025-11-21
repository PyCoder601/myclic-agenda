'use client';

import { useState, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { signup } from '@/store/authSlice';
import { Calendar as CalendarIcon, Lock, Mail, User } from 'lucide-react';
import Link from 'next/link';
import {useRouter} from "next/navigation";

export default function SignupPage() {
  const dispatch = useAppDispatch();
  const { loading, error: authError, user } = useAppSelector((state) => state.auth);
  const router = useRouter();

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
  });
  const [passwordError, setPasswordError] = useState('');


  useEffect(() => {
    if (user) {
      router.push('/dashboard');
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');

    if (formData.password !== formData.confirmPassword) {
      setPasswordError('Les mots de passe ne correspondent pas');
      return;
    }

    if (formData.password.length < 8) {
      setPasswordError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    dispatch(signup({
        username: formData.username,
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#001a24] to-[#003a52] flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#005f82] rounded-2xl mb-4">
            <CalendarIcon className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Créer un compte</h1>
          <p className="text-gray-300">Rejoignez-nous pour gérer vos tâches</p>
        </div>

        <div className="bg-[#002633] rounded-2xl shadow-xl p-8 border border-[#005f82]">
          <form onSubmit={handleSubmit} className="space-y-6">
            {(authError || passwordError) && (
              <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg">
                {authError || passwordError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Prénom
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full px-4 py-3 bg-[#001a24] border border-[#003a52] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#005f82] text-white"
                  placeholder="Votre prénom"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Nom
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full px-4 py-3 bg-[#001a24] border border-[#003a52] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#005f82] text-white"
                  placeholder="Votre nom"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Nom d&apos;utilisateur *
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 bg-[#001a24] border border-[#003a52] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#005f82] text-white"
                  placeholder="Choisissez un nom d'utilisateur"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Email *
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 bg-[#001a24] border border-[#003a52] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#005f82] text-white"
                  placeholder="votre@email.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Mot de passe *
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 bg-[#001a24] border border-[#003a52] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#005f82] text-white"
                    placeholder="Min. 8 caractères"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Confirmer le mot de passe *
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    required
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 bg-[#001a24] border border-[#003a52] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#005f82] text-white"
                    placeholder="Confirmez votre mot de passe"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#005f82] hover:bg-[#007ba8] text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Inscription...' : "S'inscrire"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-400">
              Déjà un compte ?{' '}
              <Link href="/login" className="text-[#005f82] hover:text-[#007ba8] font-medium">
                Se connecter
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

