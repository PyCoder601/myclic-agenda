'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppSelector } from '@/store/hooks';
import { caldavAPI } from '@/lib/api';
import { CalDAVConfig, CalendarSource } from '@/lib/types';

export default function SettingsPage() {
  const router = useRouter();
  const { user } = useAppSelector((state) => state.auth);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hasConfig, setHasConfig] = useState(false);
  const [calendars, setCalendars] = useState<CalendarSource[]>([]);

  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [selectedCalendar, setSelectedCalendar] = useState<CalendarSource | null>(null);
  const [shareSearchQuery, setShareSearchQuery] = useState('');
  const [shareSearchResults, setShareSearchResults] = useState<any[]>([]);
  const [sharingLoading, setSharingLoading] = useState(false);
  const [permissionLevel, setPermissionLevel] = useState<'read' | 'write'>('read');

  const [formData, setFormData] = useState({
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

  const openShareModal = (calendar: CalendarSource) => {
    setSelectedCalendar(calendar);
    setIsShareModalOpen(true);
  };

  const closeShareModal = () => {
    setSelectedCalendar(null);
    setIsShareModalOpen(false);
    setShareSearchQuery('');
    setShareSearchResults([]);
  };

  const loadConfig = async () => {
    try {
      // Charger la configuration de base
      const configResponse = await caldavAPI.getConfig();
      setConfig(configResponse.data);
      setHasConfig(true);
      setFormData({
        username: configResponse.data.username,
        password: '',
        calendar_name: configResponse.data.calendar_name,
        sync_enabled: configResponse.data.sync_enabled,
      });

      // Charger tous les calendriers (possédés et partagés)
      const calendarsResponse = await caldavAPI.getAllCalendars();
      setCalendars(calendarsResponse.data);

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
        // Découvrir automatiquement les calendriers après configuration
        handleDiscoverCalendars();
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

  const handleDiscoverCalendars = async () => {
    setDiscovering(true);
    setMessage(null);

    try {
      const response = await caldavAPI.discoverCalendars();
      setCalendars(response.data.calendars || []);
      setMessage({
        type: 'success',
        text: `${response.data.count} calendrier(s) découvert(s) !`
      });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Erreur lors de la découverte des calendriers' });
    } finally {
      setDiscovering(false);
    }
  };

  const handleToggleCalendar = async (calendar: CalendarSource) => {
    try {
      await caldavAPI.updateCalendar(calendar.id, { is_enabled: !calendar.is_enabled });
      setCalendars(calendars.map(cal =>
        cal.id === calendar.id ? { ...cal, is_enabled: !cal.is_enabled } : cal
      ));
    } catch (error: any) {
      setMessage({ type: 'error', text: 'Erreur lors de la mise à jour du calendrier' });
    }
  };

  const handleColorChange = async (calendar: CalendarSource, color: string) => {
    try {
      await caldavAPI.updateCalendar(calendar.id, { color });
      setCalendars(calendars.map(cal =>
        cal.id === calendar.id ? { ...cal, color } : cal
      ));
    } catch (error: any) {
      setMessage({ type: 'error', text: 'Erreur lors de la mise à jour de la couleur' });
    }
  };
  const handleSync = async () => {
    setSyncing(true);
    setMessage(null);

    try {
      const response = await caldavAPI.sync();
      setMessage({ 
        type: 'success', 
        text: `Synchronisation terminée ! ${response.data.stats.pushed} événements envoyés, ${response.data.stats.pulled} événements reçus`
      });
      await loadConfig();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Erreur lors de la synchronisation' });
    } finally {
      setSyncing(false);
    }
  };

  const handleRemoveShare = async (userId: number) => {
    if (!selectedCalendar) return;

    setSharingLoading(true);
    try {
      await caldavAPI.unshareCalendar(selectedCalendar.id, userId);
      
      // Recharger la config pour avoir les données à jour
      await loadConfig();

      setMessage({ type: 'success', text: 'Partage révoqué' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Erreur lors de la révocation du partage' });
    } finally {
      setSharingLoading(false);
      closeShareModal(); // Fermer la modale après l'action
    }
  };

  const handleAddShare = async (userId: number, permission: 'read' | 'write') => {
    if (!selectedCalendar) return;

    setSharingLoading(true);
    try {
      await caldavAPI.shareCalendar(selectedCalendar.id, userId, permission);
      
      // Recharger la configuration pour obtenir la liste à jour
      await loadConfig();
      
      setShareSearchQuery('');
      setShareSearchResults([]);
      setMessage({ type: 'success', text: 'Calendrier partagé !' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Erreur lors du partage' });
    } finally {
      setSharingLoading(false);
      closeShareModal(); // Fermer la modale après l'action
    }
  };

  useEffect(() => {
    if (shareSearchQuery.length < 2) {
      setShareSearchResults([]);
      return;
    }

    const searchUsers = async () => {
      try {
        const response = await caldavAPI.searchUsers(shareSearchQuery);
        setShareSearchResults(response.data.users);
      } catch (error) {
        console.error("Erreur lors de la recherche d'utilisateurs", error);
      }
    };

    const debounceSearch = setTimeout(() => {
      searchUsers();
    }, 300);

    return () => clearTimeout(debounceSearch);
  }, [shareSearchQuery]);

  const handleDelete = async () => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer la configuration CalDAV ?')) {
      return;
    }

    try {
      await caldavAPI.deleteConfig();
      setHasConfig(false);
      setConfig(null);
      setCalendars([]);
      setFormData({
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 page-enter">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header avec gradient et animations */}
        <div className="flex items-center justify-between mb-8 animate-slideInDown">
          <div className="group">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#005f82] to-[#007ba8] bg-clip-text text-transparent">
              Paramètres
            </h1>
            <p className="text-slate-600 mt-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-[#005f82]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Configuration de la synchronisation CalDAV (Baikal)
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="group flex items-center gap-2 px-4 py-2.5 text-[#005f82] hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 rounded-xl transition-all duration-300 border border-transparent hover:border-[#005f82]/20 hover:shadow-md"
          >
            <svg className="w-4 h-4 transition-transform duration-300 group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="font-medium">Retour au tableau de bord</span>
          </button>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-xl animate-slideInRight ${
            message.type === 'success' 
              ? 'bg-gradient-to-r from-green-50 to-emerald-50 text-green-800 border border-green-200 shadow-lg' 
              : 'bg-gradient-to-r from-red-50 to-rose-50 text-red-800 border border-red-200 shadow-lg'
          }`}>
            <div className="flex items-center gap-2">
              {message.type === 'success' ? (
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <span className="font-medium">{message.text}</span>
            </div>
          </div>
        )}

        {config && (
          <div className="mb-6 p-5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200/50 shadow-lg animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white rounded-lg shadow-sm">
                  <svg className="w-5 h-5 text-[#005f82]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-slate-600 font-medium">Dernière synchronisation:</p>
                  <p className="font-semibold text-slate-900">
                    {config.last_sync
                      ? new Date(config.last_sync).toLocaleString('fr-FR')
                      : 'Jamais synchronisé'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="group flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#005f82] to-[#007ba8] hover:from-[#007ba8] hover:to-[#005f82] text-white rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
              >
                <svg className={`w-4 h-4 transition-transform duration-300 ${syncing ? 'animate-spin' : 'group-hover:rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="font-medium">{syncing ? 'Synchronisation...' : 'Synchroniser maintenant'}</span>
              </button>
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200/50 rounded-2xl shadow-xl p-6 mb-8 hover-lift animate-fadeIn">
          <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-[#005f82] to-[#007ba8] rounded-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
            </div>
            Configuration du serveur Baikal
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">


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
                className="group flex-1 px-6 py-3 bg-gradient-to-r from-[#005f82] to-[#007ba8] hover:from-[#007ba8] hover:to-[#005f82] text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Sauvegarde...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {hasConfig ? 'Mettre à jour' : 'Sauvegarder'}
                  </span>
                )}
              </button>

              {hasConfig && (
                <>
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={testing}
                    className="group px-6 py-3 bg-white hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 text-slate-700 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 font-semibold border border-slate-200 hover:border-[#005f82]/30 hover:shadow-lg"
                  >
                    {testing ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Test...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <svg className="w-5 h-5 transition-transform duration-300 group-hover:rotate-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Tester
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleDelete}
                    className="group px-6 py-3 bg-white hover:bg-gradient-to-r hover:from-red-50 hover:to-rose-50 text-red-700 rounded-xl transition-all duration-300 font-semibold border border-red-200 hover:border-red-300 hover:shadow-lg"
                  >
                    <span className="flex items-center gap-2">
                      <svg className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Supprimer
                    </span>
                  </button>
                </>
              )}
            </div>
          </form>
        </div>

        {/* Section Agendas - Liste des calendriers */}
        {hasConfig && (
          <div className="bg-white border border-slate-200/50 rounded-2xl shadow-xl p-6 hover-lift animate-fadeIn">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <div className="p-2 bg-gradient-to-br from-[#005f82] to-[#007ba8] rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                Agendas
              </h2>
              <button
                onClick={handleDiscoverCalendars}
                disabled={discovering}
                className="group flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#005f82] to-[#007ba8] hover:from-[#007ba8] hover:to-[#005f82] text-white rounded-xl disabled:opacity-50 transition-all duration-300 text-sm font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
              >
                <svg className={`w-4 h-4 transition-transform duration-300 ${discovering ? 'animate-spin' : 'group-hover:rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {discovering ? 'Découverte...' : 'Découvrir les calendriers'}
              </button>
            </div>

            {calendars.length > 0 ? (
              <div className="space-y-6">
                {/* Calendriers de l'utilisateur */}
                <div className="animate-slideInDown">
                  <h3 className="text-sm font-bold text-[#005f82] mb-3 pb-2 border-b border-[#005f82]/20 uppercase tracking-wider flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Calendriers de {user?.username}
                  </h3>
                  <div className="space-y-2">
                    {calendars.filter(cal => cal.user?.id === user?.id).map((calendar, index) => (
                      <div
                        key={calendar.id}
                        className="group flex items-center justify-between p-4 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 rounded-xl transition-all duration-300 border border-transparent hover:border-[#005f82]/20 hover:shadow-md animate-fadeIn"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <input
                              type="checkbox"
                              checked={calendar.is_enabled}
                              onChange={() => handleToggleCalendar(calendar)}
                              className="h-5 w-5 text-[#005f82] focus:ring-[#005f82] border-slate-300 rounded transition-all duration-200 cursor-pointer"
                            />
                          </div>
                          <div
                            className="w-4 h-4 rounded-full shadow-lg ring-2 ring-white transition-all duration-300 group-hover:scale-125"
                            style={{ backgroundColor: calendar.color }}
                          />
                          <span className="text-slate-900 font-medium group-hover:text-[#005f82] transition-colors duration-200">
                            {calendar.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={calendar.color}
                            onChange={(e) => handleColorChange(calendar, e.target.value)}
                            className="w-10 h-10 rounded-xl cursor-pointer border-2 border-slate-200 hover:border-[#005f82] transition-all duration-300 hover:scale-110"
                            title="Changer la couleur"
                          />
                          <button
                            onClick={() => openShareModal(calendar)}
                            className="p-2 rounded-xl hover:bg-slate-200 transition-all"
                            title="Partager le calendrier"
                          >
                            <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Calendriers partagés */}
                {calendars.filter(cal => cal.user?.id !== user?.id).length > 0 && (
                  <div className="animate-slideInDown" style={{ animationDelay: '100ms' }}>
                    <h3 className="text-sm font-bold text-purple-700 mb-3 pb-2 border-b border-purple-200 uppercase tracking-wider flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      Calendriers partagés avec vous
                    </h3>
                    <div className="space-y-2">
                      {calendars.filter(cal => cal.user?.id !== user?.id).map((calendar, index) => (
                        <div
                          key={calendar.id}
                          className="group flex items-center justify-between p-4 hover:bg-gradient-to-r hover:from-purple-50 hover:to-pink-50 rounded-xl transition-all duration-300 border border-transparent hover:border-purple-200 hover:shadow-md animate-fadeIn"
                          style={{ animationDelay: `${(index + 1) * 50}ms` }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <input
                                type="checkbox"
                                checked={calendar.is_enabled}
                                onChange={() => handleToggleCalendar(calendar)}
                                className="h-5 w-5 text-purple-600 focus:ring-purple-500 border-slate-300 rounded transition-all duration-200 cursor-pointer"
                              />
                            </div>
                            <div
                              className="w-4 h-4 rounded-full shadow-lg ring-2 ring-white transition-all duration-300 group-hover:scale-125"
                              style={{ backgroundColor: calendar.color }}
                            />
                            <div>
                                <span className="text-slate-900 font-medium group-hover:text-purple-700 transition-colors duration-200">
                                {calendar.name}
                                </span>
                                <span className="text-xs text-slate-500 ml-2">(de {calendar.user?.username})</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={calendar.color}
                              onChange={(e) => handleColorChange(calendar, e.target.value)}
                              className="w-10 h-10 rounded-xl cursor-pointer border-2 border-slate-200 hover:border-purple-300 transition-all duration-300 hover:scale-110"
                              title="Changer la couleur"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 animate-fadeIn">
                <svg className="w-16 h-16 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-slate-500 font-medium">Aucun calendrier découvert.</p>
                <p className="text-sm text-slate-400 mt-2">Cliquez sur &quot;Découvrir les calendriers&quot; pour les charger.</p>
              </div>
            )}
          </div>
        )}

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
            <p><strong>5.</strong> La synchronisation se fera automatiquement à chaque création/modification d&#39;événement</p>
          </div>
        </div>

        {isShareModalOpen && selectedCalendar && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-lg w-full">
              <h3 className="text-xl font-bold text-slate-900 mb-4">
                Partager &quot;{selectedCalendar.name}&quot;
              </h3>

              {/* Utilisateurs déjà partagés */}
              <div className="mb-6">
                <h4 className="font-semibold text-slate-700 mb-2">Partagé avec :</h4>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {selectedCalendar.shares && selectedCalendar.shares.length > 0 ? (
                    selectedCalendar.shares.map(share => (
                      <div key={share.id} className="flex justify-between items-center bg-slate-100 p-2 rounded-lg">
                        <span>{share.user.username}</span>
                        <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${share.permission === 'write' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                                {share.permission === 'write' ? 'Lecture/Écriture' : 'Lecture seule'}
                            </span>
                            <button
                                onClick={() => handleRemoveShare(share.user.id)}
                                disabled={sharingLoading}
                                className="text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
                            >
                                {sharingLoading ? '...' : 'Retirer'}
                            </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-500 text-sm">Ce calendrier n&#39;est partagé avec personne.</p>
                  )}
                </div>
              </div>

              {/* Recherche d'utilisateurs */}
              <div className="mb-4">
                <label htmlFor="user-search" className="font-semibold text-slate-700 mb-2 block">
                  Ajouter un utilisateur :
                </label>
                <div className="flex gap-2">
                    <input
                        type="text"
                        id="user-search"
                        value={shareSearchQuery}
                        onChange={(e) => setShareSearchQuery(e.target.value)}
                        placeholder="Rechercher un nom d'utilisateur..."
                        className="w-full px-4 py-2 border border-slate-300 rounded-xl"
                    />
                    <select value={permissionLevel} onChange={(e) => setPermissionLevel(e.target.value as 'read' | 'write')} className="border border-slate-300 rounded-xl px-2">
                        <option value="read">Lecture seule</option>
                        <option value="write">Lecture/Écriture</option>
                    </select>
                </div>
              </div>

              {/* Résultats de la recherche */}
              {shareSearchResults.length > 0 && (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {shareSearchResults.map(foundUser => (
                    <div key={foundUser.id} className="flex justify-between items-center bg-blue-50 p-2 rounded-lg">
                      <span>{foundUser.username}</span>
                      <button
                        onClick={() => handleAddShare(foundUser.id, permissionLevel)}
                        disabled={sharingLoading}
                        className="text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
                      >
                        {sharingLoading ? '...' : 'Ajouter'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 text-right">
                <button
                  onClick={closeShareModal}
                  className="px-6 py-2 bg-slate-200 text-slate-800 rounded-xl hover:bg-slate-300"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}