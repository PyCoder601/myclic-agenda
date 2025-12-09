'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { logout } from '@/store/authSlice';
import {
  fetchCalendars,
  fetchEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  updateCalendar,
  optimisticUpdateEvent,
  optimisticDeleteEvent,
} from '@/store/calendarSlice';
import { Calendar as CalendarIcon, LogOut, Plus, RefreshCw, Settings } from 'lucide-react';
import Calendar from '@/components/Calendar';
import TaskModal from '@/components/TaskModal';
import { Task, ViewMode } from '@/lib/types';

export default function DashboardPage() {
  const { user, loading: authLoading } = useAppSelector((state) => state.auth);
  const { calendars, events, loading, eventsLoading } = useAppSelector((state) => state.calendar);
  const dispatch = useAppDispatch();
  const router = useRouter();
  
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [mainViewMode, setMainViewMode] = useState<'personal' | 'group'>('personal');
  const [groupViewMode, setGroupViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [modalInitialDate, setModalInitialDate] = useState<Date>();
  const [modalInitialHour, setModalInitialHour] = useState<number>();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isCalendarDropdownOpen, setIsCalendarDropdownOpen] = useState(false);

  // Cache pour gérer les requêtes par période
  const lastFetchPeriod = useRef<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

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

  // Charger les calendriers au montage
  useEffect(() => {
    if (user) {
      dispatch(fetchCalendars());
    }
  }, [user, dispatch]);

  // Charger les événements quand la date change
  useEffect(() => {
    if (user) {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();

      // Début du mois - 7 jours avant
      const start = new Date(year, month, -7);
      // Fin du mois + 7 jours après
      const end = new Date(year, month + 1, 7);

      const periodKey = `${start.toISOString()}-${end.toISOString()}`;

      // Éviter de recharger si déjà chargé
      if (periodKey !== lastFetchPeriod.current) {
        lastFetchPeriod.current = periodKey;
        dispatch(fetchEvents({
          start_date: start.toISOString().split('T')[0],
          end_date: end.toISOString().split('T')[0]
        }));
      }
    }
  }, [user, currentDate, dispatch]);

  const handleToggleCalendar = useCallback(async (calendar: any) => {
    // Dispatch updateCalendar thunk
    dispatch(updateCalendar({
      id: calendar.id,
      data: { is_enabled: !calendar.is_enabled }
    }));
  }, [dispatch]);

  // Filtrer les tâches en fonction des calendriers activés avec mémoïsation
  const filteredTasks = useMemo(() => {
    if (mainViewMode === 'group') {
      return events; // Ne pas filtrer les tâches en mode groupe
    }
    if (calendars.length === 0) return events;

    return events.filter(task => {
      const calendarId = task.calendar_id ?? task.calendar_source;
      if (!calendarId) return true;
      const calendar = calendars.find(cal => (cal.calendarid || cal.id) === calendarId);
      return !calendar || calendar.is_enabled !== false && calendar.display !== 0;
    });
  }, [events, calendars, mainViewMode]);

  const handleLogout = useCallback(() => {
    dispatch(logout());
    router.push('/login');
  }, [dispatch, router]);

  const handleSaveTask = useCallback(async (taskData: Omit<Task, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      if (selectedTask) {
        // Mise à jour avec optimistic update
        dispatch(optimisticUpdateEvent({ id: selectedTask.id, data: taskData }));

        // Dispatch updateEvent thunk
        await dispatch(updateEvent({ id: selectedTask.id, data: taskData })).unwrap();

      } else {
        // Création avec optimistic update complet
        // Le thunk createEvent gère automatiquement l'optimistic update
        await dispatch(createEvent(taskData)).unwrap();
      }

      // Fermer immédiatement le modal
      setIsModalOpen(false);
      setSelectedTask(null);

    } catch (error) {
      console.error('Erreur lors de la sauvegarde de l\'événement:', error);
      // En cas d'erreur, on laisse quand même fermer le modal
      setIsModalOpen(false);
      setSelectedTask(null);
    }
  }, [dispatch, selectedTask]);

  const handleDeleteTask = useCallback(async (id: number) => {
    try {
      // Optimistic delete
      dispatch(optimisticDeleteEvent(id));

      // Dispatch deleteEvent thunk
      await dispatch(deleteEvent(id)).unwrap();

    } catch (error) {
      console.error('Erreur lors de la suppression de l\'événement:', error);
      // En cas d'erreur, recharger les événements pour rollback
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const start = new Date(year, month, -7);
      const end = new Date(year, month + 1, 7);

      dispatch(fetchEvents({
        start_date: start.toISOString().split('T')[0],
        end_date: end.toISOString().split('T')[0]
      }));
    }
  }, [dispatch, currentDate]);

  const handleTaskClick = useCallback((task: Task) => {
    setSelectedTask(task);
    setModalInitialDate(undefined);
    setModalInitialHour(undefined);
    setIsModalOpen(true);
  }, []);

  const handleAddTask = useCallback((date: Date, hour?: number) => {
    setSelectedTask(null);
    setModalInitialDate(date);
    setModalInitialHour(hour);
    setIsModalOpen(true);
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsSyncing(true);
    setSyncMessage('Rafraîchissement...');

    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const start = new Date(year, month, -7);
      const end = new Date(year, month + 1, 7);

      // Recharger les calendriers et les événements via Redux
      await Promise.all([
        dispatch(fetchCalendars()).unwrap(),
        dispatch(fetchEvents({
          start_date: start.toISOString().split('T')[0],
          end_date: end.toISOString().split('T')[0]
        })).unwrap()
      ]);

      setSyncMessage('✓ Données actualisées');
      setTimeout(() => setSyncMessage(null), 3000);
    } catch (error) {
      setSyncMessage('✗ Erreur de rafraîchissement');
      setTimeout(() => setSyncMessage(null), 3000);
    } finally {
      setIsSyncing(false);
    }
  }, [dispatch, currentDate]);

  const handleTaskDrop = useCallback(async (taskId: number, newDate: Date) => {
    const task = events.find(t => t.id === taskId);
    if (!task) return;

    const oldStartDate = new Date(task.start_date);
    const oldEndDate = new Date(task.end_date);
    const duration = oldEndDate.getTime() - oldStartDate.getTime();

    const newStartDate = new Date(newDate);

    // If the drop is from month view, the time will be 00:00. Preserve original time.
    if (newStartDate.getHours() === 0 && newStartDate.getMinutes() === 0) {
      newStartDate.setHours(oldStartDate.getHours(), oldStartDate.getMinutes(), oldStartDate.getSeconds());
    }

    const newEndDate = new Date(newStartDate.getTime() + duration);

    // Optimistic update
    dispatch(optimisticUpdateEvent({
      id: taskId,
      data: {
        start_date: newStartDate.toISOString(),
        end_date: newEndDate.toISOString(),
      }
    }));

    try {
      // Dispatch updateEvent thunk
      await dispatch(updateEvent({
        id: taskId,
        data: {
          start_date: newStartDate.toISOString(),
          end_date: newEndDate.toISOString(),
        }
      })).unwrap();

    } catch (error) {
      console.error('Erreur lors de la mise à jour de l\'événement par glisser-déposer:', error);
      // En cas d'erreur, recharger pour rollback
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const start = new Date(year, month, -7);
      const end = new Date(year, month + 1, 7);

      dispatch(fetchEvents({
        start_date: start.toISOString().split('T')[0],
        end_date: end.toISOString().split('T')[0]
      }));
    }
  }, [events, dispatch, currentDate]);

  // Séparation des calendriers pour l'affichage
  const ownedCalendars = useMemo(() => 
    calendars.filter(cal => cal.user?.id === user?.id),
    [calendars, user]
  );
  const sharedCalendars = useMemo(() => 
    calendars.filter(cal => cal.user?.id !== user?.id),
    [calendars, user]
  );
  const sharedUserCalendars = useMemo(() => 
    sharedCalendars.filter(cal => !(cal.displayname || cal.name || '').toLowerCase().includes('kubicom')),
    [sharedCalendars]
  );
  const sharedResourceCalendars = useMemo(() =>
    sharedCalendars.filter(cal => (cal.displayname || cal.name || '').toLowerCase().includes('kubicom')),
    [sharedCalendars]
  );

  if (authLoading) {
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
                  Bonjour, {user?.prenom || user?.username}
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
                onClick={handleRefresh}
                disabled={isSyncing}
                className="group relative flex items-center gap-2 bg-white hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 text-slate-700 px-3 py-2 rounded-xl transition-all duration-300 border border-slate-200 hover:border-[#005f82] disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md"
                title="Rafraîchir les données"
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

                        {/* Mes calendriers */}
                        <div className="mb-4">
                          <div className="text-xs font-semibold text-[#005f82] mb-2 px-2 uppercase tracking-wider">
                            Mes calendriers
                          </div>
                          <div className="space-y-1">
                            {ownedCalendars.map((calendar) => (
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
                                      readOnly
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

                        {/* Calendriers partagés avec moi */}
                        {sharedUserCalendars.length > 0 && (
                          <div className="mb-4">
                            <div className="text-xs font-semibold text-blue-600 mb-2 px-2 border-t border-slate-200 pt-4 uppercase tracking-wider">
                              Calendriers partagés avec moi
                            </div>
                            <div className="space-y-1">
                              {sharedUserCalendars.map((calendar) => (
                                <button
                                  key={calendar.id}
                                  onClick={() => handleToggleCalendar(calendar)}
                                  className="group w-full flex items-center justify-between p-3 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 rounded-xl transition-all duration-200 border border-transparent hover:border-blue-200"
                                >
                                  <div className="flex items-center gap-3 flex-1">
                                    <input
                                      type="checkbox"
                                      checked={calendar.is_enabled}
                                      readOnly
                                      className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded pointer-events-none"
                                    />
                                    <div
                                      className="w-4 h-4 rounded-full flex-shrink-0 shadow-md ring-2 ring-white"
                                      style={{ backgroundColor: calendar.color }}
                                    />
                                    <span className={`text-sm font-medium ${calendar.is_enabled ? 'text-slate-800' : 'text-slate-400'}`}>
                                      {calendar.name}
                                    </span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Ressources partagées */}
                        {sharedResourceCalendars.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold text-purple-600 mb-2 px-2 border-t border-slate-200 pt-4 uppercase tracking-wider">
                              Ressources partagées avec moi
                            </div>
                            <div className="space-y-1">
                              {sharedResourceCalendars.map((calendar) => (
                                <button
                                  key={calendar.id}
                                  onClick={() => handleToggleCalendar(calendar)}
                                  className="group w-full flex items-center justify-between p-3 hover:bg-gradient-to-r hover:from-purple-50 hover:to-pink-50 rounded-xl transition-all duration-200 border border-transparent hover:border-purple-200"
                                >
                                  <div className="flex items-center gap-3 flex-1">
                                    <input
                                      type="checkbox"
                                      checked={calendar.is_enabled}
                                      readOnly
                                      className="h-5 w-5 text-purple-600 focus:ring-purple-500 border-gray-300 rounded pointer-events-none"
                                    />
                                    <div
                                      className="w-4 h-4 rounded-full flex-shrink-0 shadow-md ring-2 ring-white"
                                      style={{ backgroundColor: calendar.color }}
                                    />
                                    <span className={`text-sm font-medium ${calendar.is_enabled ? 'text-slate-800' : 'text-slate-400'}`}>
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
              <div className="flex gap-3">
                {/* Main View Mode Selector (Personal / Group) */}
                <div className="flex gap-2 bg-white/80 backdrop-blur-sm p-1.5 rounded-xl shadow-sm border border-slate-200">
                  <button
                    onClick={() => setMainViewMode('personal')}
                    className={`relative px-5 py-2 rounded-lg font-semibold transition-all duration-300 text-sm overflow-hidden ${
                      mainViewMode === 'personal'
                        ? 'text-white shadow-lg'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    {mainViewMode === 'personal' && (
                      <span className="absolute inset-0 bg-gradient-to-r from-[#005f82] to-[#007ba8] animate-slideInFromLeft"></span>
                    )}
                    <span className="relative z-10">Mes agendas</span>
                  </button>
                  <button
                    onClick={() => setMainViewMode('group')}
                    className={`relative px-5 py-2 rounded-lg font-semibold transition-all duration-300 text-sm overflow-hidden ${
                      mainViewMode === 'group'
                        ? 'text-white shadow-lg'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    {mainViewMode === 'group' && (
                      <span className="absolute inset-0 bg-gradient-to-r from-[#005f82] to-[#007ba8] animate-slideInFromLeft"></span>
                    )}
                    <span className="relative z-10">Agenda de groupe</span>
                  </button>
                </div>

                {/* Sub View Mode Selector (Day / Week / Month) */}
                <div className="flex gap-2 bg-white/80 backdrop-blur-sm p-1.5 rounded-xl shadow-sm border border-slate-200">
                  <button
                    onClick={() => mainViewMode === 'personal' ? setViewMode('day') : setGroupViewMode('day')}
                    className={`relative px-5 py-2 rounded-lg font-semibold transition-all duration-300 text-sm overflow-hidden ${
                      (mainViewMode === 'personal' ? viewMode : groupViewMode) === 'day'
                        ? 'text-white shadow-lg'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    {(mainViewMode === 'personal' ? viewMode : groupViewMode) === 'day' && (
                      <span className="absolute inset-0 bg-gradient-to-r from-[#005f82] to-[#007ba8] animate-slideInFromLeft"></span>
                    )}
                    <span className="relative z-10">Aujourd&apos;hui</span>
                  </button>
                  <button
                    onClick={() => mainViewMode === 'personal' ? setViewMode('week') : setGroupViewMode('week')}
                    className={`relative px-5 py-2 rounded-lg font-semibold transition-all duration-300 text-sm overflow-hidden ${
                      (mainViewMode === 'personal' ? viewMode : groupViewMode) === 'week'
                        ? 'text-white shadow-lg'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    {(mainViewMode === 'personal' ? viewMode : groupViewMode) === 'week' && (
                      <span className="absolute inset-0 bg-gradient-to-r from-[#005f82] to-[#007ba8] animate-slideInFromLeft"></span>
                    )}
                    <span className="relative z-10">Cette semaine</span>
                  </button>
                  <button
                    onClick={() => mainViewMode === 'personal' ? setViewMode('month') : setGroupViewMode('month')}
                    className={`relative px-5 py-2 rounded-lg font-semibold transition-all duration-300 text-sm overflow-hidden ${
                      (mainViewMode === 'personal' ? viewMode : groupViewMode) === 'month'
                        ? 'text-white shadow-lg'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    {(mainViewMode === 'personal' ? viewMode : groupViewMode) === 'month' && (
                      <span className="absolute inset-0 bg-gradient-to-r from-[#005f82] to-[#007ba8] animate-slideInFromLeft"></span>
                    )}
                    <span className="relative z-10">Ce mois</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Calendar */}
            <div className="flex-1 min-h-0">
              <Calendar
                tasks={filteredTasks}
                viewMode={mainViewMode === 'personal' ? viewMode : groupViewMode}
                mainViewMode={mainViewMode}
                currentDate={currentDate}
                onDateChange={setCurrentDate}
                onTaskClick={handleTaskClick}
                onAddTask={handleAddTask}
                onTaskDrop={handleTaskDrop}
                calendars={calendars}
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


