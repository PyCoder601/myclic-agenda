'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar as CalendarIcon } from 'lucide-react';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      router.push('/dashboard');
    } else {
      router.push('/login');
    }
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#001a24] to-[#003a52]">
      <div className="text-center">
        <CalendarIcon className="w-16 h-16 text-[#005f82] mx-auto mb-4 animate-pulse" />
        <h1 className="text-2xl font-semibold text-white">Chargement...</h1>
      </div>
    </div>
  );
}
