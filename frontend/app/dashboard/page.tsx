'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { logout } from '@/store/authSlice';
import {
  fetchCalendars,
  fetchEvents,
  fetchAllCalendars,
  createEvent,
  updateEvent,
  deleteEvent,
  optimisticUpdateEvent,
  optimisticDeleteEvent,
  toggleCalendarEnabled,
  setCalendarsEnabledByMode,
} from '@/store/calendarSlice';
import { Calendar as CalendarIcon, LogOut, Plus } from 'lucide-react';
import Calendar from '@/components/Calendar';
import TaskModal from '@/components/TaskModal';
import { Task, ViewMode } from '@/lib/types';

export default function DashboardPage() {
  const { user, loading: authLoading } = useAppSelector((state) => state.auth);
  const {
    calendars,
    events,
    allCalendars,
    allCalendarsLoaded
  } = useAppSelector((state) => state.calendar);
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
  const [isCalendarDropdownOpen, setIsCalendarDropdownOpen] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [pendingDate, setPendingDate] = useState<Date | null>(null);
  const [showRappels, setShowRappels] = useState(false);

  const calendarsLoaded = useRef(false);

  // Redirection si non authentifié
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

  // Charger les calendriers UNE SEULE FOIS au montage
  useEffect(() => {
    if (user && !calendarsLoaded.current) {
      calendarsLoaded.current = true;
      console.log('📅 Chargement initial des calendriers');
      dispatch(fetchCalendars(false)); // ✅ Utilise le cache automatiquement
    }
  }, [user, dispatch]);

  // Charger TOUS les calendriers en arrière-plan après le chargement initial
  useEffect(() => {
    if (user && calendars.length > 0 && !allCalendarsLoaded) {
      console.log('🔄 [Arrière-plan] Chargement de TOUS les calendriers');
      dispatch(fetchAllCalendars());
    }
  }, [user, calendars.length, allCalendarsLoaded, dispatch]);


  // // ✅ Activer/désactiver les calendriers selon le mode de vue
  // const previousMainViewMode = useRef<'personal' | 'group' | null>(null);
  // useEffect(() => {
  //   if (calendars.length > 0) {
  //     // Au premier montage (previousMainViewMode.current === null), on applique le mode initial
  //     if (previousMainViewMode.current === null) {
  //       console.log(`🔄 Initialisation du mode de vue: ${mainViewMode}`);
  //       dispatch(setCalendarsEnabledByMode(mainViewMode));
  //       previousMainViewMode.current = mainViewMode;
  //     }
  //     // Pour les changements ultérieurs, on vérifie si le mode a changé
  //     else if (previousMainViewMode.current !== mainViewMode) {
  //       console.log(`🔄 Changement de mode de vue: ${previousMainViewMode.current} → ${mainViewMode}`);
  //       dispatch(setCalendarsEnabledByMode(mainViewMode));
  //       previousMainViewMode.current = mainViewMode;
  //     }
  //   }
  // }, [mainViewMode, calendars.length, dispatch]);

  // Fonction de chargement des événements
  const loadEventsForPeriod = useCallback(async (date: Date): Promise<boolean> => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const start = new Date(year, month, -7);
    const end = new Date(year, month + 1, 7);

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    console.log(`📡 Chargement des événements pour ${startStr} à ${endStr}...`);

    try {
      const result = await dispatch(fetchEvents({
        start_date: startStr,
        end_date: endStr
      })).unwrap();

      // Vérifier si les données viennent du cache
      const fromCache = (result as any)?.fromCache === true;
      console.log(`✅ Événements chargés ${fromCache ? '(depuis le cache)' : '(depuis le backend)'}`);

      return !fromCache; // Retourne true si fetch backend, false si cache
    } catch (error) {
      console.error('❌ Erreur lors du chargement des événements:', error);
      return false;
    }
  }, [dispatch]);

  // Activer/désactiver les calendriers selon le mode de vue
  useEffect(() => {
    if (calendars.length > 0) {
      console.log(`🔄 Changement de mode de vue: ${mainViewMode}`);
      dispatch(setCalendarsEnabledByMode(mainViewMode));
    }
  }, [mainViewMode, calendars.length, dispatch]);

  // Fonction de navigation intelligente avec gestion du loading
  const handleDateNavigation = useCallback(async (newDate: Date) => {
    if (isNavigating) {
      console.log('⏳ Navigation déjà en cours, ignoré');
      return;
    }

    // Vérifier si on a déjà les données en cache
    setPendingDate(newDate);
    setIsNavigating(true);

    try {
      const wasFetchedFromBackend = await loadEventsForPeriod(newDate);

      if (wasFetchedFromBackend) {
        // Si les données viennent du backend, attendre un court instant pour l'UX
        console.log('⏳ Données chargées depuis le backend, mise à jour de la date...');
      } else {
        // Si les données viennent du cache, changement instantané
        console.log('⚡ Données en cache, changement instantané');
      }

      // Changer la date après le chargement
      setCurrentDate(newDate);
      setPendingDate(null);
    } finally {
      setIsNavigating(false);
    }
  }, [isNavigating, loadEventsForPeriod]);

  // Charger les événements pour la période visible au montage initial uniquement
  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (user && !initialLoadDone.current) {
      initialLoadDone.current = true;
      loadEventsForPeriod(currentDate);
    }
  }, [user, currentDate, loadEventsForPeriod]);

  // Sélectionner les événements à utiliser selon le mode et filtrer par date visible
  const eventsToUse = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const start = new Date(year, month, -7);
    const end = new Date(year, month + 1, 7);

    // Utiliser le cache global (events) qui contient tous les événements chargés
    // Filtrer par la plage de dates visible
    const filteredByDate = events.filter(event => {
      const eventStart = new Date(event.start_date);
      const eventEnd = new Date(event.end_date);

      // Inclure l'événement s'il se trouve dans la plage visible
      return (eventStart >= start && eventStart <= end) ||
             (eventEnd >= start && eventEnd <= end) ||
             (eventStart <= start && eventEnd >= end);
    });

    console.log(`📊 ${filteredByDate.length} événements dans la plage visible (${events.length} en cache)`);
    return filteredByDate;
  }, [events, currentDate]);

  // Sélectionner les calendriers à utiliser selon le mode
  const calendarsToUse = useMemo(() => {
    if (mainViewMode === 'group' && allCalendarsLoaded && allCalendars.length > 0) {
      console.log('📊 Utilisation de allCalendars pour le mode groupe');
      return allCalendars;
    }
    return calendars;
  }, [mainViewMode, allCalendarsLoaded, allCalendars, calendars]);

  // Filtrer les tâches en fonction des calendriers activés avec mémoïsation
  const filteredTasks = useMemo(() => {
    if (calendarsToUse.length === 0) return eventsToUse;

    return eventsToUse.filter(task => {
      // Filtrer par type d'événement : masquer les rappels par défaut
      if (task.type === 'rappel_event' && !showRappels) {
        return false;
      }

      // On identifie le calendrier par son displayname, qui correspond à calendar_source_name côté événements
      const calendarName = task.calendar_source_name || '';
      if (!calendarName) return true; // si pas d'info, on n'exclut pas

      const calendar = calendarsToUse.find(cal => cal.displayname === calendarName);
      if (!calendar) return true;

      // En mode "Agenda de groupe" comme en mode "Mes calendriers",
      // on respecte le toggle manuel de l'utilisateur (calendar.display)
      return calendar.display
    });
  }, [eventsToUse, calendarsToUse, showRappels]);

  const handleLogout = useCallback(() => {
    dispatch(logout());
    router.push('/login');
  }, [dispatch, router]);

  const handleSaveTask = useCallback(async (taskData: Omit<Task, 'id'>) => {
    try {
      if (selectedTask) {
        // ✅ Fusionner avec les données existantes pour préserver tous les champs
        const mergedData = {
          ...taskData,
          url: selectedTask.url, // Assurer que l'URL est toujours présente
          calendar_source_name: taskData.calendar_source_name || selectedTask.calendar_source_name,
          calendar_source_id: taskData.calendar_source_id || selectedTask.calendar_source_id,
          calendar_source_color: taskData.calendar_source_color || selectedTask.calendar_source_color,
          calendar_source_uri: taskData.calendar_source_uri || selectedTask.calendar_source_uri,
        };

        // Mise à jour avec optimistic update
        dispatch(optimisticUpdateEvent({ id: selectedTask.id, data: mergedData }));

        // Dispatch updateEvent thunk
        await dispatch(updateEvent({ id: selectedTask.id, data: mergedData })).unwrap();

      } else {
        // Création avec optimistic update complet
        // Le thunk createEvent gère automatiquement optimistic update
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

  const handleDeleteTask = useCallback(async (url: string) => {
    try {

      // Dispatch deleteEvent thunk en arrière-plan
      console.log(`🗑️ Suppression de l'événement ${url}...`);
      await dispatch(deleteEvent(url)).unwrap();

      console.log(`✅ Événement ${url} supprimé`);

    } catch (error) {
      console.error('Erreur lors de la suppression de l\'événement:', error);

      // En cas d'erreur, recharger pour avoir les vraies données
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
    // ✅ D'abord fermer le modal pour réinitialiser l'état
    setIsModalOpen(false);

    // ✅ Utiliser un micro-délai pour s'assurer que l'état est bien réinitialisé
    setTimeout(() => {
      setModalInitialDate(undefined);
      setModalInitialHour(undefined);
      setSelectedTask(task);
      setIsModalOpen(true);
    }, 0);
  }, []);

  const handleAddTask = useCallback((date: Date, hour?: number) => {
    setSelectedTask(null);
    setModalInitialDate(date);
    setModalInitialHour(hour);
    setIsModalOpen(true);
  }, []);

  const handleTaskDrop = useCallback(async (taskId: number, newDate: Date) => {
    const task = events.find(t => t.id === taskId);
    if (!task) return;

    const oldStartDate = new Date(task.start_date);
    const oldEndDate = new Date(task.end_date);
    const duration = oldEndDate.getTime() - oldStartDate.getTime();

    const newStartDate = new Date(newDate);

    // Si le drop vient de la vue mois, le temps sera 00:00. Préserver le temps original.
    if (newStartDate.getHours() === 0 && newStartDate.getMinutes() === 0) {
      newStartDate.setHours(oldStartDate.getHours(), oldStartDate.getMinutes(), oldStartDate.getSeconds());
    }

    const newEndDate = new Date(newStartDate.getTime() + duration);

    // Optimistic update immédiat - préserver les informations du calendrier
    dispatch(optimisticUpdateEvent({
      id: taskId,
      data: {
        start_date: newStartDate.toISOString(),
        end_date: newEndDate.toISOString(),
        // ✅ Préserver explicitement les informations de couleur
        calendar_source_color: task.calendar_source_color,
        calendar_source_name: task.calendar_source_name,
        calendar_source_id: task.calendar_source_id,
        calendar_source_uri: task.calendar_source_uri,
      }
    }));

    try {
      // Dispatch updateEvent thunk en arrière-plan
      await dispatch(updateEvent({
        id: taskId,
        data: {
          start_date: newStartDate.toISOString(),
          end_date: newEndDate.toISOString(),
          url: task.url, // ✅ Inclure l'URL pour assurer la mise à jour via CalDAV
          // ✅ Préserver les informations du calendrier pour éviter la perte de couleur
          calendar_source_color: task.calendar_source_color,
          calendar_source_name: task.calendar_source_name,
          calendar_source_id: task.calendar_source_id,
          calendar_source_uri: task.calendar_source_uri,
        }
      })).unwrap();

      console.log(`✅ Événement ${taskId} déplacé`);

    } catch (error) {
      console.error('Erreur lors du déplacement de l\'événement:', error);

      // En cas d'erreur, recharger
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

  const handleTaskResize = useCallback(async (taskId: number, newEndDate: Date) => {
    const task = events.find(t => t.id === taskId);
    if (!task) return;

    const startDate = new Date(task.start_date);

    console.log(`🎯 handleTaskResize appelé: taskId=${taskId}, startDate=${startDate.toISOString()}, newEndDate=${newEndDate.toISOString()}`);

    // Optimistic update immédiat
    dispatch(optimisticUpdateEvent({
      id: taskId,
      data: {
        start_date: startDate.toISOString(),
        end_date: newEndDate.toISOString(),
        // ✅ Préserver les informations du calendrier
        calendar_source_color: task.calendar_source_color,
        calendar_source_name: task.calendar_source_name,
        calendar_source_id: task.calendar_source_id,
        calendar_source_uri: task.calendar_source_uri,
      }
    }));

    try {
      // Dispatch updateEvent thunk en arrière-plan
      await dispatch(updateEvent({
        id: taskId,
        data: {
          start_date: startDate.toISOString(),
          end_date: newEndDate.toISOString(),
          url: task.url,
          // ✅ Préserver les informations du calendrier
          calendar_source_color: task.calendar_source_color,
          calendar_source_name: task.calendar_source_name,
          calendar_source_id: task.calendar_source_id,
          calendar_source_uri: task.calendar_source_uri,
        }
      })).unwrap();

      console.log(`✅ Événement ${taskId} redimensionné`);

    } catch (error) {
      console.error('Erreur lors du redimensionnement de l\'événement:', error);

      // En cas d'erreur, recharger
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
  const ownCalendars = useMemo(() =>
    calendarsToUse.filter(cal => cal.user_id === user?.id),
    [calendarsToUse, user]
  );
  const sharedCalendars = useMemo(() => 
    calendarsToUse.filter(cal => cal.user_id !== user?.id),
    [calendarsToUse, user]
  );
  const sharedUserCalendars = useMemo(() => 
    sharedCalendars.filter(cal => !(cal.displayname || '').toLowerCase().includes('kubicom')),
    [sharedCalendars]
  );
  const sharedResourceCalendars = useMemo(() =>
    sharedCalendars.filter(cal => (cal.displayname || '').toLowerCase().includes('kubicom')),
    [sharedCalendars]
  );

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-slate-50 via-blue-50 to-indigo-50">
        <div className="text-center">
          <CalendarIcon className="w-16 h-16 text-[#005f82] mx-auto mb-4 animate-pulse" />
          <h1 className="text-2xl font-semibold text-gray-800">Chargement...</h1>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-xl border-b border-slate-200/50 shadow-sm sticky top-0 z-50 transition-all duration-300">
        <div className="max-w-[1920px] mx-auto px-3 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            {/* Logo et Titre */}
            <div className="flex items-center gap-2 sm:gap-3 group">
              <div className="bg-linear-to-br from-[#005f82] to-[#007ba8] p-2 sm:p-2.5 rounded-xl shadow-lg transform transition-all duration-300 group-hover:scale-110 group-hover:rotate-3">
                <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-lg sm:text-xl font-bold bg-linear-to-r from-[#005f82] to-[#007ba8] bg-clip-text text-transparent">
                  Mon Agenda
                </h1>
                <p className="text-xs text-slate-600 flex items-center gap-1">
                  <span className="inline-block animate-wave">👋</span>
                  Bonjour, {user?.prenom || user?.username}
                </p>
              </div>
            </div>

            {/* View Mode Switches - Maintenant dans le header */}
            <div className="flex items-center gap-2 flex-1 justify-center">
              {/* Main View Mode Selector (Personal / Group) */}
              <div className="flex gap-1 sm:gap-2 bg-white/80 backdrop-blur-sm p-1 sm:p-1.5 rounded-lg sm:rounded-xl shadow-sm border border-slate-200">
                <button
                  onClick={() => setMainViewMode('personal')}
                  className={`relative px-2 sm:px-4 py-1.5 sm:py-2 rounded-md sm:rounded-lg font-semibold transition-all duration-300 text-xs sm:text-sm overflow-hidden ${
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
                  className={`relative px-2 sm:px-4 py-1.5 sm:py-2 rounded-md sm:rounded-lg font-semibold transition-all duration-300 text-xs sm:text-sm overflow-hidden ${
                    mainViewMode === 'group'
                      ? 'text-white shadow-lg'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {mainViewMode === 'group' && (
                    <span className="absolute inset-0 bg-gradient-to-r from-[#005f82] to-[#007ba8] animate-slideInFromLeft"></span>
                  )}
                  <span className="relative z-10">Groupe</span>
                </button>
              </div>

              {/* Sub View Mode Selector (Day / Week / Month) */}
              <div className="hidden sm:flex gap-1 sm:gap-2 bg-white/80 backdrop-blur-sm p-1 sm:p-1.5 rounded-lg sm:rounded-xl shadow-sm border border-slate-200">
                <button
                  onClick={() => mainViewMode === 'personal' ? setViewMode('day') : setGroupViewMode('day')}
                  className={`relative px-2 sm:px-4 py-1.5 sm:py-2 rounded-md sm:rounded-lg font-semibold transition-all duration-300 text-xs sm:text-sm overflow-hidden ${
                    (mainViewMode === 'personal' ? viewMode : groupViewMode) === 'day'
                      ? 'text-white shadow-lg'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {(mainViewMode === 'personal' ? viewMode : groupViewMode) === 'day' && (
                    <span className="absolute inset-0 bg-gradient-to-r from-[#005f82] to-[#007ba8] animate-slideInFromLeft"></span>
                  )}
                  <span className="relative z-10">Jour</span>
                </button>
                <button
                  onClick={() => mainViewMode === 'personal' ? setViewMode('week') : setGroupViewMode('week')}
                  className={`relative px-2 sm:px-4 py-1.5 sm:py-2 rounded-md sm:rounded-lg font-semibold transition-all duration-300 text-xs sm:text-sm overflow-hidden ${
                    (mainViewMode === 'personal' ? viewMode : groupViewMode) === 'week'
                      ? 'text-white shadow-lg'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {(mainViewMode === 'personal' ? viewMode : groupViewMode) === 'week' && (
                    <span className="absolute inset-0 bg-gradient-to-r from-[#005f82] to-[#007ba8] animate-slideInFromLeft"></span>
                  )}
                  <span className="relative z-10">Semaine</span>
                </button>
                <button
                  onClick={() => mainViewMode === 'personal' ? setViewMode('month') : setGroupViewMode('month')}
                  className={`relative px-2 sm:px-4 py-1.5 sm:py-2 rounded-md sm:rounded-lg font-semibold transition-all duration-300 text-xs sm:text-sm overflow-hidden ${
                    (mainViewMode === 'personal' ? viewMode : groupViewMode) === 'month'
                      ? 'text-white shadow-lg'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {(mainViewMode === 'personal' ? viewMode : groupViewMode) === 'month' && (
                    <span className="absolute inset-0 bg-gradient-to-r from-[#005f82] to-[#007ba8] animate-slideInFromLeft"></span>
                  )}
                  <span className="relative z-10">Mois</span>
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/*<button*/}
              {/*  onClick={handleRefresh}*/}
              {/*  disabled={isSyncing}*/}
              {/*  className="group relative flex items-center gap-2 bg-white hover:bg-linear-to-r hover:from-blue-50 hover:to-indigo-50 text-slate-700 px-3 py-2 rounded-xl transition-all duration-300 border border-slate-200 hover:border-[#005f82] disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md"*/}
              {/*  title="Rafraîchir les données"*/}
              {/*>*/}
              {/*  <RefreshCw className={`w-4 h-4 transition-transform duration-300 ${isSyncing ? 'animate-spin' : 'group-hover:rotate-180'}`} />*/}
              {/*  <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>*/}
              {/*</button>*/}
              {/*<button*/}
              {/*  onClick={() => router.push('/settings')}*/}
              {/*  className="group relative flex items-center gap-2 bg-white hover:bg-linear-to-r hover:from-purple-50 hover:to-pink-50 text-slate-700 px-3 py-2 rounded-xl transition-all duration-300 border border-slate-200 hover:border-purple-300 hover:shadow-md"*/}
              {/*  title="Paramètres"*/}
              {/*>*/}
              {/*  <Settings className="w-4 h-4 transition-transform duration-300 group-hover:rotate-90" />*/}
              {/*</button>*/}
              <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl shadow-sm border border-slate-200 transition-all duration-300">
                <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span className="hidden sm:inline text-xs sm:text-sm font-medium text-slate-700">Rappels</span>
                <button
                  onClick={() => setShowRappels(!showRappels)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                    showRappels ? 'bg-gradient-to-r from-purple-500 to-purple-600' : 'bg-slate-300'
                  }`}
                  title={showRappels ? 'Masquer les rappels' : 'Afficher les rappels'}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform duration-300 ${
                      showRappels ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              <button
                onClick={() => {
                  setSelectedTask(null);
                  setModalInitialDate(undefined);
                  setModalInitialHour(undefined);
                  setIsModalOpen(true);
                }}
                className="group flex items-center gap-1 sm:gap-2 bg-linear-to-r from-[#005f82] to-[#007ba8] hover:from-[#007ba8] hover:to-[#005f82] text-white px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl transition-all duration-300 font-medium text-xs sm:text-sm shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
              >
                <Plus className="w-3 h-3 sm:w-4 sm:h-4 transition-transform duration-300 group-hover:rotate-90" />
                <span className="hidden sm:inline">Nouvel événement</span>
                <span className="sm:hidden">Nouveau</span>
              </button>
              <div className="hidden sm:block h-8 w-px bg-linear-to-b from-transparent via-slate-300 to-transparent"></div>
              <button
                onClick={handleLogout}
                className="group flex items-center gap-1 sm:gap-2 bg-white hover:bg-red-50 text-slate-700 hover:text-red-600 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl transition-all duration-300 border border-slate-200 hover:border-red-300 hover:shadow-md"
                title="Déconnexion"
              >
                <LogOut className="w-3 h-3 sm:w-4 sm:h-4 transition-transform duration-300 group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1920px] mx-auto px-3 sm:px-6 py-2 sm:py-3">
        <div className="flex gap-2 sm:gap-4 h-[calc(100vh-80px)] sm:h-[calc(100vh-85px)]">
          {/* Main Calendar */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Mobile View Mode Selector (Day/Week/Month) - Visible seulement sur mobile */}
            <div className="sm:hidden mb-2 flex justify-center">
              <div className="flex gap-1 bg-white/80 backdrop-blur-sm p-1 rounded-lg shadow-sm border border-slate-200">
                <button
                  onClick={() => mainViewMode === 'personal' ? setViewMode('day') : setGroupViewMode('day')}
                  className={`relative px-3 py-1.5 rounded-md font-semibold transition-all duration-300 text-xs overflow-hidden ${
                    (mainViewMode === 'personal' ? viewMode : groupViewMode) === 'day'
                      ? 'text-white shadow-lg'
                      : 'text-slate-600'
                  }`}
                >
                  {(mainViewMode === 'personal' ? viewMode : groupViewMode) === 'day' && (
                    <span className="absolute inset-0 bg-gradient-to-r from-[#005f82] to-[#007ba8]"></span>
                  )}
                  <span className="relative z-10">Jour</span>
                </button>
                <button
                  onClick={() => mainViewMode === 'personal' ? setViewMode('week') : setGroupViewMode('week')}
                  className={`relative px-3 py-1.5 rounded-md font-semibold transition-all duration-300 text-xs overflow-hidden ${
                    (mainViewMode === 'personal' ? viewMode : groupViewMode) === 'week'
                      ? 'text-white shadow-lg'
                      : 'text-slate-600'
                  }`}
                >
                  {(mainViewMode === 'personal' ? viewMode : groupViewMode) === 'week' && (
                    <span className="absolute inset-0 bg-gradient-to-r from-[#005f82] to-[#007ba8]"></span>
                  )}
                  <span className="relative z-10">Semaine</span>
                </button>
                <button
                  onClick={() => mainViewMode === 'personal' ? setViewMode('month') : setGroupViewMode('month')}
                  className={`relative px-3 py-1.5 rounded-md font-semibold transition-all duration-300 text-xs overflow-hidden ${
                    (mainViewMode === 'personal' ? viewMode : groupViewMode) === 'month'
                      ? 'text-white shadow-lg'
                      : 'text-slate-600'
                  }`}
                >
                  {(mainViewMode === 'personal' ? viewMode : groupViewMode) === 'month' && (
                    <span className="absolute inset-0 bg-gradient-to-r from-[#005f82] to-[#007ba8]"></span>
                  )}
                  <span className="relative z-10">Mois</span>
                </button>
              </div>
            </div>

            {/* Calendar Dropdown Selector */}
            <div className="mb-2 sm:mb-3">
              {calendarsToUse.length > 0 && (
                <div className="relative calendar-dropdown-container">
                  <button
                    onClick={() => setIsCalendarDropdownOpen(!isCalendarDropdownOpen)}
                    className="group flex items-center gap-2 bg-white hover:bg-linear-to-r hover:from-blue-50 hover:to-indigo-50 px-4 py-2 rounded-xl shadow-sm border border-slate-200 hover:border-[#005f82] transition-all duration-300 text-sm font-medium text-slate-700 hover:shadow-md"
                  >
                    <CalendarIcon className="w-4 h-4 transition-transform duration-300 group-hover:scale-110" />
                    <span>Agendas</span>
                    <span className="text-xs bg-linear-to-r from-[#005f82] to-[#007ba8] text-white px-2 py-0.5 rounded-full font-semibold shadow-sm">
                      {calendarsToUse.filter(c => c.display).length}
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
                            {ownCalendars.map((calendar) => (
                              <button
                                key={calendar.id}
                                onClick={() => dispatch(toggleCalendarEnabled(calendar.id))}
                                className="group w-full flex items-center justify-between p-3 hover:bg-linear-to-r hover:from-blue-50 hover:to-indigo-50 rounded-xl transition-all duration-200 border border-transparent hover:border-[#005f82]/20"
                              >
                                <div className="flex items-center gap-3 flex-1">
                                  <div className={`relative transition-all duration-200 ${calendar.display ? 'scale-100' : 'scale-90 opacity-50'}`}>
                                    <input
                                      type="checkbox"
                                      checked={calendar.display}
                                      readOnly
                                      className="h-5 w-5 text-[#005f82] focus:ring-[#005f82] border-gray-300 rounded transition-all duration-200 pointer-events-none"
                                    />
                                  </div>
                                  <div
                                    className="w-4 h-4 rounded-full shrink-0 shadow-md ring-2 ring-white transition-all duration-200 group-hover:scale-110"
                                    style={{ backgroundColor: calendar.calendarcolor }}
                                  />
                                  <span className={`text-sm font-medium transition-all duration-200 ${calendar.display ? 'text-slate-800' : 'text-slate-400'}`}>
                                    {calendar.displayname}
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
                                  onClick={() => dispatch(toggleCalendarEnabled(calendar.id))}
                                  className="group w-full flex items-center justify-between p-3 hover:bg-linear-to-r hover:from-blue-50 hover:to-indigo-50 rounded-xl transition-all duration-200 border border-transparent hover:border-blue-200"
                                >
                                  <div className="flex items-center gap-3 flex-1">
                                    <input
                                      type="checkbox"
                                      checked={calendar.display}
                                      readOnly
                                      className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded pointer-events-none"
                                    />
                                    <div
                                      className="w-4 h-4 rounded-full shrink-0 shadow-md ring-2 ring-white"
                                      style={{ backgroundColor: calendar.calendarcolor }}
                                    />
                                    <span className={`text-sm font-medium ${calendar.display ? 'text-slate-800' : 'text-slate-400'}`}>
                                      {calendar.displayname}
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
                                  onClick={() => dispatch(toggleCalendarEnabled(calendar.id))}
                                  className="group w-full flex items-center justify-between p-3 hover:bg-linear-to-r hover:from-purple-50 hover:to-pink-50 rounded-xl transition-all duration-200 border border-transparent hover:border-purple-200"
                                >
                                  <div className="flex items-center gap-3 flex-1">
                                    <input
                                      type="checkbox"
                                      checked={calendar.display}
                                      readOnly
                                      className="h-5 w-5 text-purple-600 focus:ring-purple-500 border-gray-300 rounded pointer-events-none"
                                    />
                                    <div
                                      className="w-4 h-4 rounded-full shrink-0 shadow-md ring-2 ring-white"
                                      style={{ backgroundColor: calendar.calendarcolor }}
                                    />
                                    <span className={`text-sm font-medium ${calendar.display ? 'text-slate-800' : 'text-slate-400'}`}>
                                      {calendar.displayname}
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
            </div>

            {/* Calendar */}
            <div className="flex-1 min-h-0 relative">

              <Calendar
                tasks={filteredTasks}
                viewMode={mainViewMode === 'personal' ? viewMode : groupViewMode}
                mainViewMode={mainViewMode}
                currentDate={currentDate}
                onDateChange={handleDateNavigation}
                isNavigating={isNavigating}
                pendingDate={pendingDate}
                onTaskClick={handleTaskClick}
                onAddTask={handleAddTask}
                onTaskDrop={handleTaskDrop}
                onTaskResize={handleTaskResize}
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

