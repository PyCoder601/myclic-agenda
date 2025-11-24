'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { logout } from '@/store/authSlice';
import { Calendar as CalendarIcon, LogOut, Plus, RefreshCw, Settings } from 'lucide-react';
import Calendar from '@/components/Calendar';
import TaskModal from '@/components/TaskModal';
import api, { caldavAPI } from '@/lib/api';
import { Task, ViewMode, CalendarSource } from '@/lib/types';

export default function DashboardPage() {
  const { user, loading: authLoading } = useAppSelector((state) => state.auth);
  const dispatch = useAppDispatch();
  const router = useRouter();
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [calendars, setCalendars] = useState<CalendarSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [modalInitialDate, setModalInitialDate] = useState<Date>();
  const [modalInitialHour, setModalInitialHour] = useState<number>();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isCalendarDropdownOpen, setIsCalendarDropdownOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      fetchTasks();
      fetchCalendars();
    }
  }, [user]);

  // Fermer le dropdown quand on clique en dehors
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (isCalendarDropdownOpen && !target.closest('.calendar-dropdown-container')) {
        setIsCalendarDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCalendarDropdownOpen]);

  const fetchTasks = async () => {
    try {
      const response = await api.get('/tasks/');
      setTasks(response.data);
    } catch (error) {
      console.error('Erreur lors de la récupération des événements:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCalendars = async () => {
    try {
      const response = await caldavAPI.getConfig();
      setCalendars(response.data.calendars || []);
    } catch (error) {
      // Pas de configuration CalDAV ou erreur
      setCalendars([]);
    }
  };

  const handleToggleCalendar = async (calendar: CalendarSource) => {
    try {
      await caldavAPI.updateCalendar(calendar.id, { is_enabled: !calendar.is_enabled });
      setCalendars(calendars.map(cal =>
        cal.id === calendar.id ? { ...cal, is_enabled: !cal.is_enabled } : cal
      ));
    } catch (error) {
      console.error('Erreur lors de la mise à jour du calendrier:', error);
    }
  };

  // Filtrer les tâches en fonction des calendriers activés
  const filteredTasks = tasks.filter(task => {
    if (calendars.length === 0) return true; // Pas de calendriers configurés, afficher toutes les tâches
    if (!task.calendar_source) return true; // Tâches sans calendrier source
    const calendar = calendars.find(cal => cal.id === task.calendar_source);
    return !calendar || calendar.is_enabled; // Afficher si le calendrier est activé ou non trouvé
  });

  const handleLogout = () => {
    dispatch(logout());
    router.push('/login');
  };

  const handleSaveTask = async (taskData: Omit<Task, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      if (selectedTask) {
        await api.put(`/tasks/${selectedTask.id}/`, taskData);
      } else {
        await api.post('/tasks/', taskData);
      }
      await fetchTasks();
      setIsModalOpen(false);
      setSelectedTask(null);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de l\'événement:', error);
    }
  };

  const handleDeleteTask = async (id: number) => {
    try {
      await api.delete(`/tasks/${id}/`);
      await fetchTasks();
    } catch (error) {
      console.error('Erreur lors de la suppression de l\'événement:', error);
    }
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setModalInitialDate(undefined);
    setModalInitialHour(undefined);
    setIsModalOpen(true);
  };

  const handleAddTask = (date: Date, hour?: number) => {
    setSelectedTask(null);
    setModalInitialDate(date);
    setModalInitialHour(hour);
    setIsModalOpen(true);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncMessage(null);

    try {
      const response = await caldavAPI.sync();
      setSyncMessage(`✓ ${response.data.stats.pushed} envoyées, ${response.data.stats.pulled} reçues`);
      await fetchTasks();
      setTimeout(() => setSyncMessage(null), 5000);
    } catch (error) {
      if ((error as {response?: {status?: number}}).response?.status === 404) {
        setSyncMessage('⚠ CalDAV non configuré');
      } else {
        setSyncMessage('✗ Erreur de synchronisation');
      }
      setTimeout(() => setSyncMessage(null), 5000);
    } finally {
      setIsSyncing(false);
    }
  };


  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <div className="text-center">
          <CalendarIcon className="w-16 h-16 text-[#005f82] mx-auto mb-4 animate-pulse" />
          <h1 className="text-2xl font-semibold text-gray-800">Chargement...</h1>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-xl border-b border-slate-200/50 shadow-sm sticky top-0 z-50 transition-all duration-300">
        <div className="max-w-[1920px] mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 group">
              <div className="bg-gradient-to-br from-[#005f82] to-[#007ba8] p-2.5 rounded-xl shadow-lg transform transition-all duration-300 group-hover:scale-110 group-hover:rotate-3">
                <CalendarIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-[#005f82] to-[#007ba8] bg-clip-text text-transparent">
                  Mon Agenda
                </h1>
                <p className="text-xs text-slate-600 flex items-center gap-1">
                  <span className="inline-block animate-wave">👋</span>
                  Bonjour, {user?.first_name || user?.username}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {syncMessage && (
                <div className="text-xs bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 shadow-sm animate-slideInRight">
                  {syncMessage}
                </div>
              )}
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="group relative flex items-center gap-2 bg-white hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 text-slate-700 px-3 py-2 rounded-xl transition-all duration-300 border border-slate-200 hover:border-[#005f82] disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md"
                title="Synchroniser avec Baikal"
              >
                <RefreshCw className={`w-4 h-4 transition-transform duration-300 ${isSyncing ? 'animate-spin' : 'group-hover:rotate-180'}`} />
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
              </button>
              <button
                onClick={() => router.push('/settings')}
                className="group relative flex items-center gap-2 bg-white hover:bg-gradient-to-r hover:from-purple-50 hover:to-pink-50 text-slate-700 px-3 py-2 rounded-xl transition-all duration-300 border border-slate-200 hover:border-purple-300 hover:shadow-md"
                title="Paramètres"
              >
                <Settings className="w-4 h-4 transition-transform duration-300 group-hover:rotate-90" />
              </button>
              <button
                onClick={() => {
                  setSelectedTask(null);
                  setModalInitialDate(undefined);
                  setModalInitialHour(undefined);
                  setIsModalOpen(true);
                }}
                className="group flex items-center gap-2 bg-gradient-to-r from-[#005f82] to-[#007ba8] hover:from-[#007ba8] hover:to-[#005f82] text-white px-5 py-2.5 rounded-xl transition-all duration-300 font-medium text-sm shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
              >
                <Plus className="w-4 h-4 transition-transform duration-300 group-hover:rotate-90" />
                <span>Nouvel événement</span>
              </button>
              <div className="h-8 w-px bg-gradient-to-b from-transparent via-slate-300 to-transparent"></div>
              <button
                onClick={handleLogout}
                className="group flex items-center gap-2 bg-white hover:bg-red-50 text-slate-700 hover:text-red-600 px-3 py-2 rounded-xl transition-all duration-300 border border-slate-200 hover:border-red-300 hover:shadow-md"
                title="Déconnexion"
              >
                <LogOut className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1920px] mx-auto px-6 py-3">
        <div className="flex gap-4 h-[calc(100vh-85px)]">
          {/* Main Calendar */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* View Mode Selector and Calendar Filter */}
            <div className="mb-3 flex items-center justify-between gap-3">
              {/* Calendar Dropdown Selector */}
              {calendars.length > 0 && (
                <div className="relative calendar-dropdown-container">
                  <button
                    onClick={() => setIsCalendarDropdownOpen(!isCalendarDropdownOpen)}
                    className="group flex items-center gap-2 bg-white hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 px-4 py-2 rounded-xl shadow-sm border border-slate-200 hover:border-[#005f82] transition-all duration-300 text-sm font-medium text-slate-700 hover:shadow-md"
                  >
                    <CalendarIcon className="w-4 h-4 transition-transform duration-300 group-hover:scale-110" />
                    <span>Agendas</span>
                    <span className="text-xs bg-gradient-to-r from-[#005f82] to-[#007ba8] text-white px-2 py-0.5 rounded-full font-semibold shadow-sm">
                      {calendars.filter(c => c.is_enabled).length}
                    </span>
                    <svg
                      className={`w-4 h-4 transition-transform duration-300 ${isCalendarDropdownOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  {isCalendarDropdownOpen && (
                    <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 max-h-96 overflow-y-auto animate-slideInDown">
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                            <CalendarIcon className="w-4 h-4 text-[#005f82]" />
                            Mes agendas
                          </h3>
                          <button
                            onClick={() => setIsCalendarDropdownOpen(false)}
                            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1 rounded-lg transition-all duration-200"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>

                        {/* Calendriers de l'utilisateur */}
                        <div className="mb-4">
                          <div className="text-xs font-semibold text-[#005f82] mb-2 px-2 uppercase tracking-wider">
                            Mes calendriers
                          </div>
                          <div className="space-y-1">
                            {calendars.filter(cal =>
                              cal.name.toLowerCase().includes('default') ||
                              cal.name.toLowerCase().includes(user?.username?.toLowerCase() || '')
                            ).map((calendar) => (
                              <button
                                key={calendar.id}
                                onClick={() => handleToggleCalendar(calendar)}
                                className="group w-full flex items-center justify-between p-3 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 rounded-xl transition-all duration-200 border border-transparent hover:border-[#005f82]/20"
                              >
                                <div className="flex items-center gap-3 flex-1">
                                  <div className={`relative transition-all duration-200 ${calendar.is_enabled ? 'scale-100' : 'scale-90 opacity-50'}`}>
                                    <input
                                      type="checkbox"
                                      checked={calendar.is_enabled}
                                      onChange={() => {}}
                                      className="h-5 w-5 text-[#005f82] focus:ring-[#005f82] border-gray-300 rounded transition-all duration-200 pointer-events-none"
                                    />
                                  </div>
                                  <div
                                    className="w-4 h-4 rounded-full flex-shrink-0 shadow-md ring-2 ring-white transition-all duration-200 group-hover:scale-110"
                                    style={{ backgroundColor: calendar.color }}
                                  />
                                  <span className={`text-sm font-medium transition-all duration-200 ${calendar.is_enabled ? 'text-slate-800' : 'text-slate-400'}`}>
                                    {calendar.name}
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Calendriers partagés */}
                        {calendars.filter(cal =>
                          !cal.name.toLowerCase().includes('default') &&
                          !cal.name.toLowerCase().includes(user?.username?.toLowerCase() || '')
                        ).length > 0 && (
                          <div>
                            <div className="text-xs font-semibold text-[#005f82] mb-2 px-2 border-t border-slate-200 pt-4 uppercase tracking-wider">
                              Calendriers partagés
                            </div>
                            <div className="space-y-1">
                              {calendars.filter(cal =>
                                !cal.name.toLowerCase().includes('default') &&
                                !cal.name.toLowerCase().includes(user?.username?.toLowerCase() || '')
                              ).map((calendar) => (
                                <button
                                  key={calendar.id}
                                  onClick={() => handleToggleCalendar(calendar)}
                                  className="group w-full flex items-center justify-between p-3 hover:bg-gradient-to-r hover:from-purple-50 hover:to-pink-50 rounded-xl transition-all duration-200 border border-transparent hover:border-purple-200"
                                >
                                  <div className="flex items-center gap-3 flex-1">
                                    <div className={`relative transition-all duration-200 ${calendar.is_enabled ? 'scale-100' : 'scale-90 opacity-50'}`}>
                                      <input
                                        type="checkbox"
                                        checked={calendar.is_enabled}
                                        onChange={() => {}}
                                        className="h-5 w-5 text-[#005f82] focus:ring-[#005f82] border-gray-300 rounded transition-all duration-200 pointer-events-none"
                                      />
                                    </div>
                                    <div
                                      className="w-4 h-4 rounded-full flex-shrink-0 shadow-md ring-2 ring-white transition-all duration-200 group-hover:scale-110"
                                      style={{ backgroundColor: calendar.color }}
                                    />
                                    <span className={`text-sm font-medium transition-all duration-200 ${calendar.is_enabled ? 'text-slate-800' : 'text-slate-400'}`}>
                                      {calendar.name}
                                    </span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* View Mode Selector */}
              <div className="flex gap-2 bg-white/80 backdrop-blur-sm p-1.5 rounded-xl shadow-sm border border-slate-200">
                <button
                  onClick={() => setViewMode('day')}
                  className={`relative px-5 py-2 rounded-lg font-semibold transition-all duration-300 text-sm overflow-hidden ${
                    viewMode === 'day'
                      ? 'text-white shadow-lg'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {viewMode === 'day' && (
                    <span className="absolute inset-0 bg-gradient-to-r from-[#005f82] to-[#007ba8] animate-slideInFromLeft"></span>
                  )}
                  <span className="relative z-10">Aujourd&apos;hui</span>
                </button>
                <button
                  onClick={() => setViewMode('week')}
                  className={`relative px-5 py-2 rounded-lg font-semibold transition-all duration-300 text-sm overflow-hidden ${
                    viewMode === 'week'
                      ? 'text-white shadow-lg'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {viewMode === 'week' && (
                    <span className="absolute inset-0 bg-gradient-to-r from-[#005f82] to-[#007ba8] animate-slideInFromLeft"></span>
                  )}
                  <span className="relative z-10">Cette semaine</span>
                </button>
                <button
                  onClick={() => setViewMode('month')}
                  className={`relative px-5 py-2 rounded-lg font-semibold transition-all duration-300 text-sm overflow-hidden ${
                    viewMode === 'month'
                      ? 'text-white shadow-lg'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {viewMode === 'month' && (
                    <span className="absolute inset-0 bg-gradient-to-r from-[#005f82] to-[#007ba8] animate-slideInFromLeft"></span>
                  )}
                  <span className="relative z-10">Ce mois</span>
                </button>
              </div>
            </div>

            {/* Calendar */}
            <div className="flex-1 min-h-0">
              <Calendar
                tasks={filteredTasks}
                viewMode={viewMode}
                currentDate={currentDate}
                onDateChange={setCurrentDate}
                onTaskClick={handleTaskClick}
                onAddTask={handleAddTask}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Task Modal */}
      <TaskModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedTask(null);
          setModalInitialDate(undefined);
          setModalInitialHour(undefined);
        }}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
        task={selectedTask}
        initialDate={modalInitialDate}
        initialHour={modalInitialHour}
      />
    </div>
  );
}

