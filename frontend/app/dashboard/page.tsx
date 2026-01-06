'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { logout } from '@/store/authSlice';
import {
  fetchCalendars,
  fetchEvents,
  fetchAllGroupEvents,
  fetchAllCalendars,
  fetchAllEventsBackground,
  createEvent,
  updateEvent,
  deleteEvent,
  optimisticUpdateEvent,
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
    allEvents,
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
  const allEventsBackgroundLoaded = useRef(false);

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

  // Charger TOUS les événements en arrière-plan après le chargement des calendriers et événements initiaux
  useEffect(() => {
    if (user && calendars.length > 0 && events.length > 0 && !allEventsBackgroundLoaded.current) {
      allEventsBackgroundLoaded.current = true;
      console.log('🔄 [Arrière-plan] Chargement de TOUS les événements');
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const start = new Date(year, month - 3, 1); // 3 mois avant
      const end = new Date(year, month + 4, 0); // 3 mois après

      dispatch(fetchAllEventsBackground({
        start_date: start.toISOString().split('T')[0],
        end_date: end.toISOString().split('T')[0]
      }));
    }
  }, [user, calendars.length, events.length, currentDate, dispatch]);

  // Fonction de chargement des événements
  const loadEventsForPeriod = useCallback(async (date: Date): Promise<boolean> => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const start = new Date(year, month, -7);
    const end = new Date(year, month + 1, 7);

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    console.log(`📡 Chargement des événements pour ${startStr} à ${endStr}... (Mode: ${mainViewMode})`);

    try {
      // Utiliser fetchAllGroupEvents en mode groupe, fetchEvents en mode personnel
      if (mainViewMode === 'group') {
        await dispatch(fetchAllGroupEvents({
          start_date: startStr,
          end_date: endStr
        })).unwrap();
        console.log(`✅ Événements de groupe chargés depuis le backend`);
        return true; // Toujours depuis le backend en mode groupe
      } else {
        const result = await dispatch(fetchEvents({
          start_date: startStr,
          end_date: endStr
        })).unwrap();

        // Vérifier si les données viennent du cache
        const fromCache = (result as { fromCache?: boolean })?.fromCache === true;
        console.log(`✅ Événements chargés ${fromCache ? '(depuis le cache)' : '(depuis le backend)'}`);

        return !fromCache; // Retourne true si fetch backend, false si cache
      }
    } catch (error) {
      console.error('❌ Erreur lors du chargement des événements:', error);
      return false;
    }
  }, [dispatch, mainViewMode]);

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

    // Utiliser allEvents en mode groupe, events en mode personnel
    const sourceEvents = mainViewMode === 'group' ? allEvents : events;

    // Filtrer par la plage de dates visible
    const filteredByDate = sourceEvents.filter(event => {
      const eventStart = new Date(event.start_date);
      const eventEnd = new Date(event.end_date);

      // Inclure l'événement s'il se trouve dans la plage visible
      return (eventStart >= start && eventStart <= end) ||
             (eventEnd >= start && eventEnd <= end) ||
             (eventStart <= start && eventEnd >= end);
    });

    console.log(`📊 Mode: ${mainViewMode} - ${filteredByDate.length} événements dans la plage visible (${sourceEvents.length} en cache)`);
    return filteredByDate;
  }, [events, allEvents, currentDate, mainViewMode]);

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

  const handleDeleteTask = useCallback(async (url: string, id: string, recurrenceId?: string) => {
    try {

      // Dispatch deleteEvent thunk en arrière-plan
      console.log(`🗑️ Suppression de l'événement ${url}...`);
      await dispatch(deleteEvent({url, recurrenceId, id})).unwrap();

      console.log(`✅ Événement ${url} supprimé`);
    } catch (error) {
      console.error('Erreur lors de la suppression de l\'événement:', error);

      // En cas d'erreur, recharger pour avoir les vraies données
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const start = new Date(year, month, -7);
      const end = new Date(year, month + 1, 7);

      if (mainViewMode === 'group') {
        dispatch(fetchAllGroupEvents({
          start_date: start.toISOString().split('T')[0],
          end_date: end.toISOString().split('T')[0]
        }));
      } else {
        dispatch(fetchEvents({
          start_date: start.toISOString().split('T')[0],
          end_date: end.toISOString().split('T')[0]
        }));
      }
    }
  }, [dispatch, currentDate, mainViewMode]);

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

      if (mainViewMode === 'group') {
        dispatch(fetchAllGroupEvents({
          start_date: start.toISOString().split('T')[0],
          end_date: end.toISOString().split('T')[0]
        }));
      } else {
        dispatch(fetchEvents({
          start_date: start.toISOString().split('T')[0],
          end_date: end.toISOString().split('T')[0]
        }));
      }
    }
  }, [events, dispatch, currentDate, mainViewMode]);

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

      if (mainViewMode === 'group') {
        dispatch(fetchAllGroupEvents({
          start_date: start.toISOString().split('T')[0],
          end_date: end.toISOString().split('T')[0]
        }));
      } else {
        dispatch(fetchEvents({
          start_date: start.toISOString().split('T')[0],
          end_date: end.toISOString().split('T')[0]
        }));
      }
    }
  }, [events, dispatch, currentDate, mainViewMode]);

  // Séparation des calendriers pour l'affichage
  const ownCalendars = useMemo(() =>
    calendarsToUse.filter(cal => (cal.share_displayname === "" && !cal.description?.toLowerCase().includes("resource"))),
    [calendarsToUse]
  );

  const sharedUserCalendars = useMemo(() => 
    calendarsToUse.filter(cal => (cal.share_displayname !== "" && !cal.description?.toLowerCase().includes("resource"))),
    [calendarsToUse]
  );

  const sharedResourceCalendars = useMemo(() =>
    calendarsToUse.filter(cal => (cal.description || '').toLowerCase().includes('resource')),
    [calendarsToUse]
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
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50/50 to-indigo-50/30">
      {/* Header - Version compacte optimisée */}
      <header className="bg-white/95 backdrop-blur-xl border-b border-slate-200/60 shadow-sm sticky top-0 z-50">
        <div className="max-w-[1920px] mx-auto px-2.5 py-1.5">
          <div className="flex items-center justify-between gap-1.5 sm:gap-2.5">
            {/* Logo et Titre */}
            <div className="flex items-center gap-2 group cursor-pointer">
              <div className="relative">
                <div className="relative bg-gradient-to-br from-[#005f82] to-[#007ba8] p-1.5 rounded-md shadow-sm">
                  <CalendarIcon className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
              <div className="hidden sm:block">
                <p className="text-xs text-slate-600 font-medium">Bonjour {user?.prenom || 'Utilisateur'}</p>
              </div>
            </div>

            {/* View Mode Switches - Dans le header avec liste calendriers intégrée */}
            <div className="flex items-center gap-1.5 flex-1 justify-center">
              {/* Main View Mode Selector (Personal / Group) avec dropdown intégré */}
              <div className="relative calendar-dropdown-container">
                <div className="flex gap-1 bg-gradient-to-r from-white/90 to-white/80 backdrop-blur-sm p-1 rounded-lg shadow-sm border border-slate-200/80">
                  <button
                    onClick={() => {
                      setMainViewMode('personal');
                      setIsCalendarDropdownOpen(!isCalendarDropdownOpen);
                    }}
                    className={`relative px-2 sm:px-2.5 py-1.5 rounded-md font-semibold transition-all duration-200 text-xs overflow-hidden ${
                      mainViewMode === 'personal'
                        ? 'text-white shadow-sm scale-[1.02]'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50/80'
                    }`}
                  >
                    {mainViewMode === 'personal' && (
                      <span className="absolute inset-0 bg-gradient-to-r from-[#005f82] to-[#007ba8]"></span>
                    )}
                    <span className="relative z-10 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span className="hidden sm:inline">Mes agendas</span>
                      <span className="sm:hidden">Mes</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${mainViewMode === 'personal' ? 'bg-white/30' : 'bg-[#005f82]/10 text-[#005f82]'}`}>
                        {calendarsToUse.filter(c => c.display).length}
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setMainViewMode('group');
                      setIsCalendarDropdownOpen(!isCalendarDropdownOpen);
                    }}
                    className={`relative px-2 sm:px-2.5 py-1.5 rounded-md font-semibold transition-all duration-200 text-xs overflow-hidden ${
                      mainViewMode === 'group'
                        ? 'text-white shadow-sm scale-[1.02]'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50/80'
                    }`}
                  >
                    {mainViewMode === 'group' && (
                      <span className="absolute inset-0 bg-linear-to-r from-[#005f82] to-[#007ba8]"></span>
                    )}
                    <span className="relative z-10 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <span className="hidden sm:inline">Groupe</span>
                      <span className="sm:hidden">Grp</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${mainViewMode === 'group' ? 'bg-white/30' : 'bg-[#005f82]/10 text-[#005f82]'}`}>
                        {calendarsToUse.filter(c => c.display && !c.description?.toLowerCase().includes("resource")).length}
                      </span>
                    </span>
                  </button>
                </div>

                {/* Dropdown Menu - Collé au bouton */}
                {isCalendarDropdownOpen && calendarsToUse.length > 0 && (
                  <div className="absolute top-full left-0 mt-0 w-80 bg-linear-to-br from-white via-white to-slate-50/50 rounded-b-2xl shadow-2xl border-2 border-slate-200/80 border-t-0 z-50 max-h-96 overflow-y-auto animate-slideInDown backdrop-blur-sm">
                    <div className="p-4">
                      {/* Mes calendriers */}
                      {mainViewMode === 'personal' && (
                        <div className="mb-4">
                          <div className="flex items-center gap-2 text-xs font-bold text-[#005f82] mb-3 uppercase tracking-wider">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                            </svg>
                            Mes calendriers
                          </div>
                          <div className="space-y-1.5">
                            {ownCalendars.map((calendar) => (
                              <button
                                key={calendar.id}
                                onClick={() => dispatch(toggleCalendarEnabled(calendar.id))}
                                className="group w-full flex items-center gap-3 p-3 hover:bg-linear-to-r hover:from-blue-50/80 hover:to-indigo-50/80 rounded-xl transition-all duration-200 hover:shadow-md hover:scale-[1.02] border border-transparent hover:border-blue-200/50"
                              >
                                <input
                                  type="checkbox"
                                  checked={calendar.display}
                                  readOnly
                                  className="h-4 w-4 text-[#005f82] focus:ring-[#005f82] border-gray-300 rounded pointer-events-none transition-transform duration-200 group-hover:scale-110"
                                />
                                <div
                                  className="w-4 h-4 rounded-full shrink-0 shadow-lg ring-2 ring-white group-hover:ring-[#005f82]/20 transition-all duration-200 group-hover:scale-110"
                                  style={{ backgroundColor: calendar.calendarcolor }}
                                />
                                <span className={`text-sm font-semibold truncate transition-colors duration-200 ${calendar.display ? 'text-slate-800 group-hover:text-[#005f82]' : 'text-slate-400 group-hover:text-slate-600'}`}>
                                  {calendar.defined_name || calendar.share_href || calendar.displayname}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Calendriers partagés avec moi */}
                      {mainViewMode === 'personal' && sharedUserCalendars.length > 0 && (
                        <div className="mb-4 border-t-2 border-slate-200/60 pt-4">
                          <div className="flex items-center gap-2 text-xs font-bold text-blue-600 mb-3 uppercase tracking-wider">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/>
                            </svg>
                            Partagés avec moi
                          </div>
                          <div className="space-y-1.5">
                            {sharedUserCalendars.map((calendar) => (
                              <button
                                key={calendar.id}
                                onClick={() => dispatch(toggleCalendarEnabled(calendar.id))}
                                className="group w-full flex items-center gap-3 p-3 hover:bg-gradient-to-r hover:from-blue-50/80 hover:to-indigo-50/80 rounded-xl transition-all duration-200 hover:shadow-md hover:scale-[1.02] border border-transparent hover:border-blue-200/50"
                              >
                                <input
                                  type="checkbox"
                                  checked={calendar.display}
                                  readOnly
                                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded pointer-events-none transition-transform duration-200 group-hover:scale-110"
                                />
                                <div
                                  className="w-4 h-4 rounded-full shrink-0 shadow-lg ring-2 ring-white group-hover:ring-blue-400/30 transition-all duration-200 group-hover:scale-110"
                                  style={{ backgroundColor: calendar.calendarcolor }}
                                />
                                <span className={`text-sm font-semibold truncate transition-colors duration-200 ${calendar.display ? 'text-slate-800 group-hover:text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`}>
                                  {calendar.defined_name || calendar.share_href || calendar.displayname}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Ressources partagées */}
                      {mainViewMode === 'personal' && sharedResourceCalendars.length > 0 && (
                        <div className="border-t-2 border-slate-200/60 pt-4">
                          <div className="flex items-center gap-2 text-xs font-bold text-purple-600 mb-3 uppercase tracking-wider">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z"/>
                            </svg>
                            Ressources
                          </div>
                          <div className="space-y-1.5">
                            {sharedResourceCalendars.map((calendar) => (
                              <button
                                key={calendar.id}
                                onClick={() => dispatch(toggleCalendarEnabled(calendar.id))}
                                className="group w-full flex items-center gap-3 p-3 hover:bg-gradient-to-r hover:from-purple-50/80 hover:to-pink-50/80 rounded-xl transition-all duration-200 hover:shadow-md hover:scale-[1.02] border border-transparent hover:border-purple-200/50"
                              >
                                <input
                                  type="checkbox"
                                  checked={calendar.display}
                                  readOnly
                                  className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded pointer-events-none transition-transform duration-200 group-hover:scale-110"
                                />
                                <div
                                  className="w-4 h-4 rounded-full shrink-0 shadow-lg ring-2 ring-white group-hover:ring-purple-400/30 transition-all duration-200 group-hover:scale-110"
                                  style={{ backgroundColor: calendar.calendarcolor }}
                                />
                                <span className={`text-sm font-semibold truncate transition-colors duration-200 ${calendar.display ? 'text-slate-800 group-hover:text-purple-600' : 'text-slate-400 group-hover:text-slate-600'}`}>
                                  {calendar.displayname}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Tous les calendriers en mode groupe */}
                      {mainViewMode === 'group' && (
                        <div>
                          <div className="flex items-center gap-2 text-xs font-bold text-[#005f82] mb-3 uppercase tracking-wider">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                            </svg>
                            Tous les calendriers
                          </div>
                          <div className="space-y-1.5">
                            {calendarsToUse.filter(cal => !cal.description?.toLowerCase().includes("resource")).map((calendar) => (
                              <button
                                key={calendar.id}
                                onClick={() => dispatch(toggleCalendarEnabled(calendar.id))}
                                className="group w-full flex items-center gap-3 p-3 hover:bg-gradient-to-r hover:from-blue-50/80 hover:to-indigo-50/80 rounded-xl transition-all duration-200 hover:shadow-md hover:scale-[1.02] border border-transparent hover:border-blue-200/50"
                              >
                                <input
                                  type="checkbox"
                                  checked={calendar.display}
                                  readOnly
                                  className="h-4 w-4 text-[#005f82] focus:ring-[#005f82] border-gray-300 rounded pointer-events-none transition-transform duration-200 group-hover:scale-110"
                                />
                                <div
                                  className="w-4 h-4 rounded-full shrink-0 shadow-lg ring-2 ring-white group-hover:ring-[#005f82]/20 transition-all duration-200 group-hover:scale-110"
                                  style={{ backgroundColor: calendar.calendarcolor }}
                                />
                                <span className={`text-sm font-semibold truncate transition-colors duration-200 ${calendar.display ? 'text-slate-800 group-hover:text-[#005f82]' : 'text-slate-400 group-hover:text-slate-600'}`}>
                                  {calendar.defined_name || calendar.share_href || calendar.displayname}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Spacer entre les deux groupes de switches */}
              <div className="hidden sm:block w-px h-6 bg-gradient-to-b from-transparent via-slate-300 to-transparent"></div>

              {/* Sub View Mode Selector (Day / Week / Month) - Version compacte optimisée */}
              <div className="hidden sm:flex gap-1 bg-gradient-to-r from-white/90 to-white/80 backdrop-blur-sm p-1 rounded-lg shadow-sm border border-slate-200/80">
                <button
                  onClick={() => mainViewMode === 'personal' ? setViewMode('day') : setGroupViewMode('day')}
                  className={`relative px-2.5 py-1.5 rounded-md font-semibold transition-all duration-200 text-xs overflow-hidden ${
                    (mainViewMode === 'personal' ? viewMode : groupViewMode) === 'day'
                      ? 'text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50/80'
                  }`}
                >
                  {(mainViewMode === 'personal' ? viewMode : groupViewMode) === 'day' && (
                    <span className="absolute inset-0 bg-gradient-to-r from-[#005f82] to-[#007ba8]"></span>
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Jour
                  </span>
                </button>
                <button
                  onClick={() => mainViewMode === 'personal' ? setViewMode('week') : setGroupViewMode('week')}
                  className={`relative px-2.5 py-1.5 rounded-md font-semibold transition-all duration-200 text-xs overflow-hidden ${
                    (mainViewMode === 'personal' ? viewMode : groupViewMode) === 'week'
                      ? 'text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50/80'
                  }`}
                >
                  {(mainViewMode === 'personal' ? viewMode : groupViewMode) === 'week' && (
                    <span className="absolute inset-0 bg-gradient-to-r from-[#005f82] to-[#007ba8]"></span>
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Semaine
                  </span>
                </button>
                <button
                  onClick={() => mainViewMode === 'personal' ? setViewMode('month') : setGroupViewMode('month')}
                  className={`relative px-2.5 py-1.5 rounded-md font-semibold transition-all duration-200 text-xs overflow-hidden ${
                    (mainViewMode === 'personal' ? viewMode : groupViewMode) === 'month'
                      ? 'text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50/80'
                  }`}
                >
                  {(mainViewMode === 'personal' ? viewMode : groupViewMode) === 'month' && (
                    <span className="absolute inset-0 bg-gradient-to-r from-[#005f82] to-[#007ba8]"></span>
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                    </svg>
                    Mois
                  </span>
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1.5 bg-white px-2 py-1.5 rounded-lg shadow-sm border border-slate-200/80">
                <svg className="w-3.5 h-3.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span className="hidden sm:inline text-xs font-semibold text-slate-700">Rappels</span>
                <button
                  onClick={() => setShowRappels(!showRappels)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-200 ${
                    showRappels ? 'bg-gradient-to-r from-purple-500 to-purple-600' : 'bg-slate-300'
                  }`}
                  title={showRappels ? 'Masquer les rappels' : 'Afficher les rappels'}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      showRappels ? 'translate-x-4.5' : 'translate-x-0.5'
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
                className="group relative flex items-center gap-1.5 overflow-hidden bg-gradient-to-r from-[#005f82] to-[#007ba8] text-white px-2.5 sm:px-3.5 py-1.5 rounded-lg transition-all duration-200 font-semibold text-xs shadow-sm hover:shadow-md"
              >
                <Plus className="relative z-10 w-3.5 h-3.5" />
                <span className="relative z-10 hidden sm:inline">Nouveau</span>
              </button>
              <button
                onClick={handleLogout}
                className="group flex items-center justify-center bg-white hover:bg-red-50 text-slate-700 hover:text-red-600 p-2 rounded-lg transition-all duration-200 border border-slate-200 hover:border-red-300 shadow-sm"
                title="Déconnexion"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1920px] mx-auto px-1 sm:px-2 py-1 pb-4">
        <div className="flex gap-2">
          {/* Main Calendar */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Mobile View Mode Selector (Day/Week/Month) - Visible seulement sur mobile */}
            <div className="sm:hidden mb-1.5 flex justify-center">
              <div className="flex gap-1 bg-white p-1 rounded-lg shadow-sm border border-slate-200/80">
                <button
                  onClick={() => mainViewMode === 'personal' ? setViewMode('day') : setGroupViewMode('day')}
                  className={`relative px-2.5 py-1.5 rounded-md font-semibold transition-all duration-200 text-xs overflow-hidden ${
                    (mainViewMode === 'personal' ? viewMode : groupViewMode) === 'day'
                      ? 'text-white shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  {(mainViewMode === 'personal' ? viewMode : groupViewMode) === 'day' && (
                    <span className="absolute inset-0 bg-linear-to-r from-[#005f82] to-[#007ba8]"></span>
                  )}
                  <span className="relative z-10">Jour</span>
                </button>
                <button
                  onClick={() => mainViewMode === 'personal' ? setViewMode('week') : setGroupViewMode('week')}
                  className={`relative px-2.5 py-1.5 rounded-md font-semibold transition-all duration-200 text-xs overflow-hidden ${
                    (mainViewMode === 'personal' ? viewMode : groupViewMode) === 'week'
                      ? 'text-white shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  {(mainViewMode === 'personal' ? viewMode : groupViewMode) === 'week' && (
                    <span className="absolute inset-0 bg-linear-to-r from-[#005f82] to-[#007ba8]"></span>
                  )}
                  <span className="relative z-10">Semaine</span>
                </button>
                <button
                  onClick={() => mainViewMode === 'personal' ? setViewMode('month') : setGroupViewMode('month')}
                  className={`relative px-2.5 py-1.5 rounded-md font-semibold transition-all duration-200 text-xs overflow-hidden ${
                    (mainViewMode === 'personal' ? viewMode : groupViewMode) === 'month'
                      ? 'text-white shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  {(mainViewMode === 'personal' ? viewMode : groupViewMode) === 'month' && (
                    <span className="absolute inset-0 bg-linear-to-r from-[#005f82] to-[#007ba8]"></span>
                  )}
                  <span className="relative z-10">Mois</span>
                </button>
              </div>
            </div>

            {/* Calendar */}
            <div className="flex-1 relative bg-white/60 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-200/50 p-2">

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

