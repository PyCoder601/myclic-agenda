'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { logout } from '@/store/authSlice';
import { Calendar as CalendarIcon, LogOut, Plus, CheckCircle2, Clock, TrendingUp, User, ChevronRight, ChevronLeft, RefreshCw, Settings } from 'lucide-react';
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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
      console.error('Erreur lors de la récupération des tâches:', error);
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
      console.error('Erreur lors de la sauvegarde de la tâche:', error);
    }
  };

  const handleDeleteTask = async (id: number) => {
    try {
      await api.delete(`/tasks/${id}/`);
      await fetchTasks();
    } catch (error) {
      console.error('Erreur lors de la suppression de la tâche:', error);
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

  const getStats = () => {
    const total = filteredTasks.length;
    const completed = filteredTasks.filter(t => t.is_completed).length;
    const upcoming = filteredTasks.filter(t => {
      const now = new Date();
      const start = new Date(t.start_date);
      return start > now && !t.is_completed;
    }).length;

    return { total, completed, upcoming };
  };

  const getUpcomingTasks = () => {
    const now = new Date();
    return filteredTasks
      .filter(t => new Date(t.start_date) > now && !t.is_completed)
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
      .slice(0, 5);
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

  const stats = getStats();
  const upcomingTasks = getUpcomingTasks();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-lg border-b border-slate-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-[1920px] mx-auto px-6 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-[#005f82] to-[#007ba8] p-2 rounded-lg shadow-md">
                <CalendarIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-[#005f82] to-[#007ba8] bg-clip-text text-transparent">
                  Mon Agenda
                </h1>
                <p className="text-xs text-slate-600">Bonjour, {user?.first_name || user?.username} 👋</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {syncMessage && (
                <div className="text-xs bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 animate-fadeIn">
                  {syncMessage}
                </div>
              )}
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg transition-all border border-slate-200 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Synchroniser avec Baikal"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => router.push('/settings')}
                className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg transition-all border border-slate-200 hover:border-slate-300"
                title="Paramètres"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setSelectedTask(null);
                  setModalInitialDate(undefined);
                  setModalInitialHour(undefined);
                  setIsModalOpen(true);
                }}
                className="flex items-center gap-2 bg-gradient-to-r from-[#005f82] to-[#007ba8] hover:shadow-lg text-white px-4 py-2 rounded-lg transition-all font-medium text-sm shadow-md hover:scale-105 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                Nouvelle tâche
              </button>
              <div className="h-6 w-px bg-slate-300"></div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg transition-all border border-slate-200 hover:border-slate-300"
              >
                <LogOut className="w-4 h-4" />
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
            <div className="mb-3 flex items-center gap-3">
              <div className="flex gap-1.5 bg-white p-1 rounded-lg shadow-sm border border-slate-200 w-fit">
                <button
                  onClick={() => setViewMode('day')}
                  className={`px-4 py-1.5 rounded-md font-medium transition-all text-sm ${
                    viewMode === 'day'
                      ? 'bg-gradient-to-r from-[#005f82] to-[#007ba8] text-white shadow-md'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Aujourd&apos;hui
                </button>
                <button
                  onClick={() => setViewMode('week')}
                  className={`px-4 py-1.5 rounded-md font-medium transition-all text-sm ${
                    viewMode === 'week'
                      ? 'bg-gradient-to-r from-[#005f82] to-[#007ba8] text-white shadow-md'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Cette semaine
                </button>
                <button
                  onClick={() => setViewMode('month')}
                  className={`px-4 py-1.5 rounded-md font-medium transition-all text-sm ${
                    viewMode === 'month'
                      ? 'bg-gradient-to-r from-[#005f82] to-[#007ba8] text-white shadow-md'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Ce mois
                </button>
              </div>

              {/* Calendar Dropdown Selector */}
              {calendars.length > 0 && (
                <div className="relative calendar-dropdown-container">
                  <button
                    onClick={() => setIsCalendarDropdownOpen(!isCalendarDropdownOpen)}
                    className="flex items-center gap-2 bg-white hover:bg-slate-50 px-4 py-1.5 rounded-lg shadow-sm border border-slate-200 transition-all text-sm font-medium text-slate-700"
                  >
                    <CalendarIcon className="w-4 h-4" />
                    <span>Agendas</span>
                    <span className="text-xs bg-[#005f82] text-white px-1.5 py-0.5 rounded-full">
                      {calendars.filter(c => c.is_enabled).length}
                    </span>
                    <svg
                      className={`w-4 h-4 transition-transform ${isCalendarDropdownOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  {isCalendarDropdownOpen && (
                    <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-slate-200 z-50 max-h-96 overflow-y-auto">
                      <div className="p-3">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-slate-700">Mes agendas</h3>
                          <button
                            onClick={() => setIsCalendarDropdownOpen(false)}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>

                        {/* Calendriers de l'utilisateur */}
                        <div className="mb-3">
                          <div className="text-xs font-medium text-[#005f82] mb-2 px-2">
                            Calendriers de {user?.username}
                          </div>
                          <div className="space-y-1">
                            {calendars.filter(cal =>
                              cal.name.toLowerCase().includes('default') ||
                              cal.name.toLowerCase().includes(user?.username?.toLowerCase() || '')
                            ).map((calendar) => (
                              <button
                                key={calendar.id}
                                onClick={() => handleToggleCalendar(calendar)}
                                className="w-full flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg transition-all"
                              >
                                <div className="flex items-center gap-2 flex-1">
                                  <input
                                    type="checkbox"
                                    checked={calendar.is_enabled}
                                    onChange={() => {}}
                                    className="h-4 w-4 text-[#005f82] focus:ring-[#005f82] border-gray-300 rounded pointer-events-none"
                                  />
                                  <div
                                    className="w-3 h-3 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: calendar.color }}
                                  />
                                  <span className="text-sm text-slate-700 truncate">{calendar.name}</span>
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
                            <div className="text-xs font-medium text-[#005f82] mb-2 px-2 border-t border-slate-200 pt-3">
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
                                  className="w-full flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg transition-all"
                                >
                                  <div className="flex items-center gap-2 flex-1">
                                    <input
                                      type="checkbox"
                                      checked={calendar.is_enabled}
                                      onChange={() => {}}
                                      className="h-4 w-4 text-[#005f82] focus:ring-[#005f82] border-gray-300 rounded pointer-events-none"
                                    />
                                    <div
                                      className="w-3 h-3 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: calendar.color }}
                                    />
                                    <span className="text-sm text-slate-700 truncate">{calendar.name}</span>
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

          {/* Sidebar Toggle Button */}
          {!isSidebarOpen && (
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="w-10 h-10 bg-white hover:bg-slate-50 rounded-lg shadow-md border border-slate-200 flex items-center justify-center transition-all hover:scale-105"
              title="Afficher les statistiques"
            >
              <ChevronRight className="w-5 h-5 text-slate-600" />
            </button>
          )}

          {/* Sidebar */}
          {isSidebarOpen && (
            <div className="w-80 flex flex-col gap-3 animate-slideIn">
              {/* Close Button */}
              <div className="flex justify-end">
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="w-8 h-8 bg-white hover:bg-slate-50 rounded-lg shadow-sm border border-slate-200 flex items-center justify-center transition-all"
                  title="Masquer les statistiques"
                >
                  <ChevronLeft className="w-4 h-4 text-slate-600" />
                </button>
              </div>

              {/* User Info Card - Compact */}
              <div className="bg-gradient-to-br from-[#005f82] to-[#007ba8] rounded-xl p-4 shadow-lg text-white">
                <div className="flex items-center gap-3 mb-3">
                  <div className="bg-white/20 backdrop-blur-sm p-2 rounded-lg">
                    <User className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{user?.first_name || user?.username}</h3>
                    <p className="text-xs text-blue-100 truncate">{user?.email}</p>
                  </div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2">
                  <p className="text-xs text-blue-100">Productivité</p>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-2xl font-bold">{stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%</span>
                    <span className="text-xs text-blue-100">complétées</span>
                  </div>
                </div>
              </div>

              {/* Stats - Compact */}
              <div className="bg-white rounded-xl p-4 shadow-lg border border-slate-200">
                <h2 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#005f82]" />
                  Statistiques
                </h2>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
                    <div className="bg-blue-500 p-2 rounded-lg">
                      <CalendarIcon className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-600 font-medium">Total</div>
                      <div className="text-xl font-bold text-slate-800">{stats.total}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-100">
                    <div className="bg-green-500 p-2 rounded-lg">
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-600 font-medium">Terminées</div>
                      <div className="text-xl font-bold text-slate-800">{stats.completed}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg border border-orange-100">
                    <div className="bg-orange-500 p-2 rounded-lg">
                      <Clock className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-600 font-medium">À venir</div>
                      <div className="text-xl font-bold text-slate-800">{stats.upcoming}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Upcoming Tasks - Compact */}
              <div className="bg-white rounded-xl p-4 shadow-lg border border-slate-200 flex-1 overflow-hidden flex flex-col min-h-0">
                <h2 className="text-sm font-semibold text-slate-800 mb-3">Prochaines tâches</h2>
                <div className="space-y-2 overflow-y-auto flex-1">
                  {upcomingTasks.length === 0 ? (
                    <div className="text-center py-6">
                      <Clock className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-slate-500 text-xs">Aucune tâche à venir</p>
                    </div>
                  ) : (
                    upcomingTasks.map(task => (
                      <div
                        key={task.id}
                        onClick={() => handleTaskClick(task)}
                        className="group p-3 bg-gradient-to-r from-slate-50 to-blue-50 rounded-lg border border-slate-200 hover:border-[#005f82] cursor-pointer transition-all hover:shadow-md"
                      >
                        <div className="flex items-start gap-2">
                          <div className="bg-[#005f82] w-1 h-1 rounded-full mt-1.5 group-hover:scale-150 transition-transform"></div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-slate-800 text-xs mb-0.5 group-hover:text-[#005f82] transition-colors truncate">{task.title}</h3>
                            <p className="text-[10px] text-slate-500">
                              {new Date(task.start_date).toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
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

