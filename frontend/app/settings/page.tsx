'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { caldavAPI } from '@/lib/api';
import { CalDAVConfig } from '@/lib/types';

export default function SettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hasConfig, setHasConfig] = useState(false);
  
  const [formData, setFormData] = useState({
    caldav_url: '',
    username: '',
    password: '',
    calendar_name: 'default',
    sync_enabled: true,
  });

  const [config, setConfig] = useState<CalDAVConfig | null>(null);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    loadConfig();
  }, [user, router]);

  const loadConfig = async () => {
    try {
      const response = await caldavAPI.getConfig();
      setConfig(response.data);
      setHasConfig(true);
      setFormData({
        caldav_url: response.data.caldav_url,
        username: response.data.username,
        password: '',
        calendar_name: response.data.calendar_name,
        sync_enabled: response.data.sync_enabled,
      });
    } catch (error: any) {
      if (error.response?.status === 404) {
        setHasConfig(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = hasConfig 
        ? await caldavAPI.updateConfig(formData)
        : await caldavAPI.saveConfig(formData);
      
      setConfig(response.data);
      setHasConfig(true);
      
      if (response.data.connection_status === 'success') {
        setMessage({ type: 'success', text: 'Configuration CalDAV sauvegardée et connexion réussie !' });
      } else {
        setMessage({ type: 'error', text: 'Configuration sauvegardée mais connexion échouée. Vérifiez vos paramètres.' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Erreur lors de la sauvegarde' });
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setMessage(null);

    try {
      const response = await caldavAPI.testConnection();
      if (response.data.success) {
        setMessage({ 
          type: 'success', 
          text: `Connexion réussie ! Calendrier: ${response.data.calendar}` 
        });
      } else {
        setMessage({ type: 'error', text: 'Échec de la connexion' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Erreur lors du test de connexion' });
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setMessage(null);

    try {
      const response = await caldavAPI.sync();
      setMessage({ 
        type: 'success', 
        text: `Synchronisation terminée ! ${response.data.stats.pushed} tâches envoyées, ${response.data.stats.pulled} tâches reçues` 
      });
      await loadConfig();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Erreur lors de la synchronisation' });
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer la configuration CalDAV ?')) {
      return;
    }

    try {
      await caldavAPI.deleteConfig();
      setHasConfig(false);
      setConfig(null);
      setFormData({
        caldav_url: '',
        username: '',
        password: '',
        calendar_name: 'default',
        sync_enabled: true,
      });
      setMessage({ type: 'success', text: 'Configuration supprimée' });
    } catch (error: any) {
      setMessage({ type: 'error', text: 'Erreur lors de la suppression' });
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Paramètres</h1>
            <p className="text-gray-600 mt-2">Configuration de la synchronisation CalDAV (Baikal)</p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 text-[#005f82] hover:bg-gray-100 rounded-lg transition-colors"
          >
            Retour au tableau de bord
          </button>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}>
            {message.text}
          </div>
        )}

        {config && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Dernière synchronisation:</p>
                <p className="font-medium text-gray-900">
                  {config.last_sync 
                    ? new Date(config.last_sync).toLocaleString('fr-FR') 
                    : 'Jamais synchronisé'}
                </p>
              </div>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="px-4 py-2 bg-[#005f82] text-white rounded-lg hover:bg-[#004a66] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {syncing ? 'Synchronisation...' : 'Synchroniser maintenant'}
              </button>
            </div>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            Configuration du serveur Baikal
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="caldav_url" className="block text-sm font-medium text-gray-700 mb-2">
                URL du serveur CalDAV
              </label>
              <input
                type="url"
                id="caldav_url"
                value={formData.caldav_url}
                onChange={(e) => setFormData({ ...formData, caldav_url: e.target.value })}
                placeholder="https://votre-serveur.com/baikal/dav.php"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#005f82] focus:border-transparent"
                required
              />
              <p className="mt-1 text-sm text-gray-500">
                L&#39;URL complète de votre serveur Baikal (se termine généralement par /dav.php)
              </p>
            </div>

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                Nom d&#39;utilisateur
              </label>
              <input
                type="text"
                id="username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="votre-username"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#005f82] focus:border-transparent"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Mot de passe
              </label>
              <input
                type="password"
                id="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder={hasConfig ? "Laisser vide pour ne pas changer" : "votre-password"}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#005f82] focus:border-transparent"
                required={!hasConfig}
              />
            </div>

            <div>
              <label htmlFor="calendar_name" className="block text-sm font-medium text-gray-700 mb-2">
                Nom du calendrier
              </label>
              <input
                type="text"
                id="calendar_name"
                value={formData.calendar_name}
                onChange={(e) => setFormData({ ...formData, calendar_name: e.target.value })}
                placeholder="default"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#005f82] focus:border-transparent"
              />
              <p className="mt-1 text-sm text-gray-500">
                Le nom du calendrier sur votre serveur Baikal
              </p>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="sync_enabled"
                checked={formData.sync_enabled}
                onChange={(e) => setFormData({ ...formData, sync_enabled: e.target.checked })}
                className="h-4 w-4 text-[#005f82] focus:ring-[#005f82] border-gray-300 rounded"
              />
              <label htmlFor="sync_enabled" className="ml-2 block text-sm text-gray-700">
                Activer la synchronisation automatique
              </label>
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-6 py-3 bg-[#005f82] text-white rounded-lg hover:bg-[#004a66] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {loading ? 'Sauvegarde...' : hasConfig ? 'Mettre à jour' : 'Sauvegarder'}
              </button>

              {hasConfig && (
                <>
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={testing}
                    className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {testing ? 'Test...' : 'Tester la connexion'}
                  </button>

                  <button
                    type="button"
                    onClick={handleDelete}
                    className="px-6 py-3 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium"
                  >
                    Supprimer
                  </button>
                </>
              )}
            </div>
          </form>
        </div>

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Comment configurer Baikal
          </h3>
          <div className="space-y-2 text-sm text-gray-700">
            <p><strong>1.</strong> Connectez-vous à votre serveur Baikal</p>
            <p><strong>2.</strong> Créez un utilisateur si ce n&#39;est pas déjà fait</p>
            <p><strong>3.</strong> Notez l&#39;URL CalDAV (généralement https://votre-domaine.com/dav.php)</p>
            <p><strong>4.</strong> Utilisez les identifiants de votre utilisateur Baikal</p>
            <p><strong>5.</strong> La synchronisation se fera automatiquement à chaque création/modification de tâche</p>
          </div>
        </div>
      </div>
    </div>
  );
}

