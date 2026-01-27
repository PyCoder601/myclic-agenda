'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Task, CalendarSource, Client, Affaire } from '@/lib/types';
import RichTextEditor from './RichTextEditor';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { fetchCalendars, addBulkEvents, createMultipleDateEvents } from '@/store/calendarSlice';
import { baikalAPI } from '@/lib/api';
import ConfirmDialog, { RecurrenceConfirmDialog } from './ConfirmDialog';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Omit<Task, 'id' | 'created_at' | 'updated_at'>) => void;
  onDelete?: (url: string, id: string, recurrenceId?: string) => void;
  task?: Task | null;
  initialDate?: Date;
  initialHour?: number;
}

// Fonction helper pour formater la date en heure locale pour datetime-local input
const formatDateTimeLocal = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

// Fonction helper pour obtenir le nom du jour en français
const getDayName = (date: Date): string => {
  const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  return days[date.getDay()];
};

// Fonction helper pour formater la date complète
const formatFullDate = (date: Date): string => {
  const day = date.getDate();
  const month = date.toLocaleDateString('fr-FR', { month: 'long' });
  return `${day} ${month}`;
};

export default function TaskModal({ isOpen, onClose, onSave, onDelete, task, initialDate, initialHour }: TaskModalProps) {
  // ✅ Utiliser les calendriers depuis le store Redux
  const dispatch = useAppDispatch();
  const { calendars } = useAppSelector((state) => state.calendar);
  const { application } = useAppSelector((state) => state.auth);

  // États pour la recherche et le dropdown - Calendriers
  const [searchQuery, setSearchQuery] = useState('');
  const [showCalendarDropdown, setShowCalendarDropdown] = useState(false);

  // États pour la recherche et le dropdown - Ressources
  const [resourceSearchQuery, setResourceSearchQuery] = useState('');
  const [showResourceDropdown, setShowResourceDropdown] = useState(false);

  // État pour les onglets
  const [activeTab, setActiveTab] = useState<'details' | 'recurrence' | 'multipleDates'>('details');

  // États pour les dates multiples
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // États pour la récurrence
  const [recurrenceType, setRecurrenceType] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'biweekly' | 'triweekly' | 'yearly' | 'custom'>('none');
  const [recurrenceEndType, setRecurrenceEndType] = useState<'never' | 'count' | 'until'>('never');
  const [recurrenceCount, setRecurrenceCount] = useState(10);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');

  // État de chargement pour la création d'événements
  const [isCreating, setIsCreating] = useState(false);
  const [customRecurrenceInterval, setCustomRecurrenceInterval] = useState(1);
  const [customRecurrenceUnit, setCustomRecurrenceUnit] = useState<'days' | 'weeks' | 'months' | 'years'>('weeks');
  const [showRecurrenceDropdown, setShowRecurrenceDropdown] = useState(false);
  const [showEndTypeDropdown, setShowEndTypeDropdown] = useState(false);

  // États pour la recherche de clients
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientSearchLoading, setClientSearchLoading] = useState(false);

  // États pour la recherche d'affaires
  const [affairSearchQuery, setAffairSearchQuery] = useState('');
  const [showAffairDropdown, setShowAffairDropdown] = useState(false);
  const [affairs, setAffairs] = useState<Affaire[]>([]);
  const [selectedAffair, setSelectedAffair] = useState<Affaire | null>(null);
  const [affairSearchLoading, setAffairSearchLoading] = useState(false);

  // États pour le chargement des informations client/affaire d'un événement existant
  const [clientInfoLoading, setClientInfoLoading] = useState(false);
  const [affairInfoLoading, setAffairInfoLoading] = useState(false);

  // État pour la boîte de dialogue de confirmation de suppression
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSimpleConfirm, setShowSimpleConfirm] = useState(false);

  // Filtrer les calendriers (non-ressources) selon la recherche
  const filteredCalendars = calendars.filter(cal => {
    const calName = (cal.defined_name || cal.share_href || cal.displayname || '').toLowerCase();
    return calName.includes(searchQuery.toLowerCase()) && !cal.description?.toLowerCase().includes("resource");
  });

  // Filtrer les ressources selon la recherche
  const filteredResources = calendars.filter(cal => {
    const calName = (cal.displayname || cal.defined_name || cal.share_href || '').toLowerCase();
    return calName.includes(resourceSearchQuery.toLowerCase()) && cal.description?.toLowerCase().includes("resource");
  });

  console.log('📅 Calendriers disponibles:', filteredCalendars.length);
  console.log('🔧 Ressources disponibles:', filteredResources.length);

  // Calculer les valeurs initiales du formulaire
  const getInitialFormData = () => {
    if (task) {
      // ✅ Utiliser l'ID du calendrier de l'événement existant
      let calendarSourceId = String(task.calendar_source_id || '');

      // Si on a des calendriers chargés, vérifier que l'ID existe
      if (calendars.length > 0) {
        const taskCalendar = calendars.find(
          cal => cal.id === task.calendar_source_id || cal.calendarid === task.calendar_source_id
        );
        if (taskCalendar) {
          calendarSourceId = String(taskCalendar.id);
        } else {
          // Si le calendrier de la tâche n'existe pas, utiliser le premier disponible
          calendarSourceId = String(calendars[0].id);
          console.warn('⚠️ Calendrier de l\'événement non trouvé, utilisation du premier disponible');
        }
      }

      return {
        title: task.title,
        description: task.description || '',
        location: task.location || '',
        start_date: task.start_date.slice(0, 16),
        end_date: task.end_date.slice(0, 16),
        calendar_source: calendarSourceId,
        calendar_sources: [calendarSourceId],
      };
    }
    
    const baseDate = initialDate ? new Date(initialDate) : new Date();
    const currentTime = new Date();

    // Si initialDate contient déjà une heure/minute spécifique, les utiliser
    const start = new Date(baseDate);
    if (initialHour !== undefined) {
      start.setHours(initialHour, 0, 0, 0);
    } else if (initialDate && (initialDate.getHours() !== 0 || initialDate.getMinutes() !== 0)) {
      console.log(`📅 Préservation de l'heure: ${initialDate.getHours()}:${initialDate.getMinutes()}`);
    } else {
      start.setHours(currentTime.getHours(), 0, 0, 0);
    }

    const end = new Date(start);
    end.setTime(start.getTime() + 60 * 60 * 1000); // +1 heure

    const startDateTimeLocal = formatDateTimeLocal(start);
    const endDateTimeLocal = formatDateTimeLocal(end);

    // ✅ Utiliser le premier calendrier disponible comme défaut
    const defaultCalendarSource = calendars.length > 0
      ? String(calendars[0].id)
      : '';

    return {
      title: '',
      description: '',
      location: '',
      start_date: startDateTimeLocal,
      end_date: endDateTimeLocal,
      calendar_source: defaultCalendarSource,
      calendar_sources: [defaultCalendarSource],
    };
  };

  const [formData, setFormData] = useState(getInitialFormData);

  // Réinitialiser le formulaire quand le modal s'ouvre ou que les props changent
  useEffect(() => {
    if (isOpen) {
      // ✅ Charger les calendriers depuis le store (avec cache)
      if (calendars.length === 0) {
        console.log('📅 Chargement des calendriers depuis le store');
        dispatch(fetchCalendars(false)); // ✅ Paramètre par défaut explicite
      } else {
        console.log('✅ Calendriers déjà en cache:', calendars.length);
      }

      // ✅ Réinitialiser le formulaire quand le modal s'ouvre
      const newFormData = getInitialFormData();

      // ✅ S'assurer qu'un calendrier valide est sélectionné
      if (calendars.length > 0 && !newFormData.calendar_source) {
        newFormData.calendar_source = String(calendars[0].id);
      }

      setFormData(newFormData);

      // Réinitialiser les recherches et dropdowns
      setSearchQuery('');
      setResourceSearchQuery('');
      setShowCalendarDropdown(false);
      setShowResourceDropdown(false);

      // Réinitialiser les états de récurrence
      setActiveTab('details');
      setRecurrenceType('none');
      setRecurrenceEndType('never');
      setRecurrenceCount(10);
      setRecurrenceEndDate('');
      setCustomRecurrenceInterval(1);
      setCustomRecurrenceUnit('weeks');

      // ✅ Réinitialiser les dates multiples (uniquement pour création)
      if (!task) {
        setSelectedDates([]);
      }

      // ✅ Réinitialiser les clients et affaires (uniquement pour création)
      if (!task) {
        setSelectedClient(null);
        setSelectedAffair(null);
        setClientSearchQuery('');
        setAffairSearchQuery('');
      }

      console.log('📋 Initialisation du modal avec:', {
        isEdit: !!task,
        taskId: task?.id,
        title: newFormData.title,
        description: newFormData.description?.substring(0, 50),
        calendar: newFormData.calendar_source
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, task?.id, initialDate, initialHour]);

  // Fermer le dropdown lors du clic en dehors
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.calendar-dropdown-container')) {
        setShowCalendarDropdown(false);
      }
      if (!target.closest('.resource-dropdown-container')) {
        setShowResourceDropdown(false);
      }
      if (!target.closest('.client-dropdown-container')) {
        setShowClientDropdown(false);
      }
      if (!target.closest('.affair-dropdown-container')) {
        setShowAffairDropdown(false);
      }
      if (!target.closest('.recurrence-dropdown-container')) {
        setShowRecurrenceDropdown(false);
      }
      if (!target.closest('.endtype-dropdown-container')) {
        setShowEndTypeDropdown(false);
      }
    };

    if (showCalendarDropdown || showResourceDropdown || showClientDropdown || showAffairDropdown || showRecurrenceDropdown || showEndTypeDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showCalendarDropdown, showResourceDropdown, showClientDropdown, showAffairDropdown, showRecurrenceDropdown, showEndTypeDropdown]);

  // Rechercher les clients
  useEffect(() => {
    const searchClients = async () => {
      if (clientSearchQuery.length < 3) {
        setClients([]);
        return;
      }

      setClientSearchLoading(true);
      try {
        const response = await baikalAPI.searchClients(clientSearchQuery);
        setClients(response.data.clients || []);
      } catch (error) {
        console.error('Erreur recherche clients:', error);
        setClients([]);
      } finally {
        setClientSearchLoading(false);
      }
    };

    const debounceTimer = setTimeout(searchClients, 300);
    return () => clearTimeout(debounceTimer);
  }, [clientSearchQuery]);

  // Rechercher les affaires quand un client est sélectionné
  useEffect(() => {
    const searchAffairs = async () => {
      if (!selectedClient) {
        setAffairs([]);
        return;
      }

      setAffairSearchLoading(true);
      try {
        const response = await baikalAPI.searchAffairs(selectedClient.id, affairSearchQuery);
        setAffairs(response.data.affairs || []);
      } catch (error) {
        console.error('Erreur recherche affaires:', error);
        setAffairs([]);
      } finally {
        setAffairSearchLoading(false);
      }
    };

    const debounceTimer = setTimeout(searchAffairs, 300);
    return () => clearTimeout(debounceTimer);
  }, [selectedClient, affairSearchQuery]);

  // Charger les informations du client et de l'affaire quand un événement est ouvert
  useEffect(() => {
    const loadClientAffairInfo = async () => {
      if (task && isOpen) {
        // Vérifier si l'événement a des IDs de client ou d'affaire
        const clientId = task.client_id;
        const affairId = task.affair_id


        console.log(clientId, affairId)

        if (clientId || affairId) {
          // Activer les indicateurs de chargement
          if (clientId) setClientInfoLoading(true);
          if (affairId) setAffairInfoLoading(true);

          try {
            const response = await baikalAPI.getClientAffairInfo(clientId, affairId);

            if (response.data.client) {
              setSelectedClient(response.data.client);
            }

            if (response.data.affair) {
              setSelectedAffair(response.data.affair);
            }

            console.log('✅ Infos client/affaire chargées:', response.data);
          } catch (error) {
            console.error('❌ Erreur chargement client/affaire:', error);
          } finally {
            // Désactiver les indicateurs de chargement
            setClientInfoLoading(false);
            setAffairInfoLoading(false);
          }
        }
      } else {
        // Réinitialiser si pas d'événement
        setSelectedClient(null);
        setSelectedAffair(null);
        setClientInfoLoading(false);
        setAffairInfoLoading(false);
      }
    };

    loadClientAffairInfo();
  }, [task, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // ✅ Vérifier qu'au moins un calendrier est sélectionné
    if (!formData.calendar_sources || formData.calendar_sources.length === 0) {
      alert('Veuillez sélectionner au moins un calendrier.');
      return;
    }

    // ✅ Vérification spécifique pour l'onglet dates multiples
    if (activeTab === 'multipleDates' && selectedDates.length === 0) {
      alert('Veuillez sélectionner au moins une date.');
      return;
    }

    // ✅ Trouver tous les calendriers sélectionnés
    const selectedCalendars = calendars.filter(
      cal => formData.calendar_sources?.includes(String(cal.id))
    );

    if (selectedCalendars.length === 0) {
      console.error('❌ Aucun calendrier sélectionné trouvé');
      alert('Erreur: calendriers sélectionnés non trouvés.');
      return;
    }

    console.log('=== DEBUG TaskModal Submit ===');
    console.log('Calendriers sélectionnés:', selectedCalendars.map(cal => ({
      id: cal.id,
      displayname: cal.displayname,
      defined_name: cal.defined_name,
    })));

    // Si c'est une modification, on garde un seul calendrier (le premier)
    if (task) {
      submitWithCalendar(selectedCalendars[0]);
    } else {
      // Si c'est une création, on crée dans tous les calendriers sélectionnés
      submitWithMultipleCalendars(selectedCalendars);
    }
  };

  const submitWithCalendar = (selectedCalendar: CalendarSource) => {

    console.log('=== TaskModal Submit ===');
    console.log('Selected calendar:', selectedCalendar);
    console.log('Calendar data to send:', {
      calendar_source_name: selectedCalendar.displayname,
      calendar_source_id: selectedCalendar.id,
      calendar_source_uri: selectedCalendar.uri,
      calendar_source_color: selectedCalendar.calendarcolor,
    });
    console.log('=======================');

    // Envoyer les données avec toutes les infos du calendrier
    // ✅ CORRECTION : Ne pas utiliser toISOString() qui convertit en UTC
    // On garde l'heure locale en formatant manuellement
    const formatLocalISO = (dateString: string) => {
      const date = new Date(dateString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
    };

    onSave({
      title: formData.title,
      description: formData.description,
      location: formData.location,
      start_date: formatLocalISO(formData.start_date),
      end_date: formatLocalISO(formData.end_date),
      calendar_source_name: selectedCalendar.displayname,
      calendar_source_id: selectedCalendar.id,
      calendar_source_uri: selectedCalendar.uri || '',
      calendar_source_color: selectedCalendar.calendarcolor,
      // ✅ Ajouter client et affaire
      ...(selectedClient && { client_id: selectedClient.id }),
      ...(selectedAffair && { affair_id: selectedAffair.id }),
    });
    onClose();
  };

  const submitWithMultipleCalendars = async (selectedCalendars: CalendarSource[]) => {
    console.log('=== TaskModal Submit Multiple Calendars ===');
    console.log('Calendriers sélectionnés:', selectedCalendars);

    // Générer les dates de récurrence
    const recurrenceDates = generateRecurrenceDates();
    console.log('📅 Dates de récurrence générées:', recurrenceDates.length);

    // ✅ CORRECTION : Fonction pour formater en ISO local (sans conversion UTC)
    const formatLocalISO = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
    };

    // Si pas de récurrence OU une seule occurrence, utiliser l'ancienne méthode
    if (recurrenceDates.length === 1) {
      selectedCalendars.forEach(calendar => {
        const dateInfo = recurrenceDates[0];
        onSave({
          title: formData.title,
          description: formData.description,
          location: formData.location,
          start_date: formatLocalISO(dateInfo.start),
          end_date: formatLocalISO(dateInfo.end),
          calendar_source_name: calendar.displayname,
          calendar_source_id: calendar.id,
          calendar_source_uri: calendar.uri || '',
          calendar_source_color: calendar.calendarcolor,
          ...(selectedClient && { client_id: selectedClient.id }),
          ...(selectedAffair && { affair_id: selectedAffair.id }),
        });
      });
      onClose();
      return;
    }

    // ✅ Pour les dates multiples (onglet spécifique), utiliser l'action optimisée
    if (activeTab === 'multipleDates') {
      setIsCreating(true);
      try {
        // Extraire l'heure de début et fin depuis formData
        const startDate = new Date(formData.start_date);
        const endDate = new Date(formData.end_date);
        const startTime = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`;
        const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;

        for (const calendar of selectedCalendars) {
          console.log('🔄 Création optimisée dates multiples dans:', calendar.displayname || calendar.defined_name);

          // Utiliser l'action Redux optimisée avec création optimiste
          await dispatch(createMultipleDateEvents({
            title: formData.title,
            description: formData.description,
            location: formData.location || '',
            start_time: startTime,
            end_time: endTime,
            dates: selectedDates.map(date => {
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              return `${year}-${month}-${day}`;
            }),
            calendar_source_id: calendar.id,
            calendar_source_name: calendar.displayname || calendar.defined_name || '',
            calendar_source_color: calendar.calendarcolor || '#005f82',
            calendar_source_uri: calendar.uri || '',
            client_id: selectedClient?.id,
            affair_id: selectedAffair?.id,
          })).unwrap();

          console.log(`✅ ${selectedDates.length} événements créés de manière optimiste pour ${calendar.displayname}`);
        }

        setIsCreating(false);
        onClose();
      } catch (error) {
        console.error('❌ Erreur lors de la création dates multiples:', error);
        setIsCreating(false);
        alert(`Erreur lors de la création des événements.\n${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      }
      return;
    }

    // ✅ Pour les récurrences multiples, utiliser bulk_create
    setIsCreating(true); // Activer le loading
    try {
      for (const calendar of selectedCalendars) {
        console.log('🔄 Création bulk dans:', calendar.displayname || calendar.defined_name);

        // Préparer tous les événements pour ce calendrier
        // ✅ Pour les récurrences, ajouter recurrence_id = date de début de chaque occurrence
        const isRecurrence = recurrenceDates.length > 1;
        const events = recurrenceDates.map((dateInfo) => ({
          title: formData.title,
          description: formData.description,
          location: formData.location || '',
          start_date: formatLocalISO(dateInfo.start),
          end_date: formatLocalISO(dateInfo.end),
          // ✅ Ajouter recurrence_id pour chaque occurrence (= date de début)
          ...(isRecurrence && { recurrence_id: formatLocalISO(dateInfo.start) }),
        }));

        console.log('📅 Événements avec recurrence_id:', events);

        // ✅ Envoyer UNE SEULE requête pour tous les événements
        const response = await baikalAPI.bulkCreateEvents({
          events,
          calendar_source_name: calendar.displayname || calendar.defined_name as string,
          calendar_source_color: calendar.calendarcolor || '#005f82',
          calendar_source_uri: calendar.uri || '',
          calendar_source_id: calendar.id,
          client_id: selectedClient?.id,
          affair_id: selectedAffair?.id,
          // ✅ SEQUENCE : nombre total d'occurrences (pas l'index)
          sequence: recurrenceDates.length,
        });

        console.log(`✅ ${events.length} événements créés en bulk pour ${calendar.displayname}`);

        // ⚡ Ajouter les événements au store Redux immédiatement
        if (response.data && Array.isArray(response.data)) {
          dispatch(addBulkEvents(response.data));
        }
      }

      // ✅ Fermer le modal et désactiver le loading
      setIsCreating(false);
      onClose();

    } catch (error) {
      console.error('❌ Erreur lors de la création bulk:', error);
      setIsCreating(false); // Désactiver le loading en cas d'erreur
      alert(`Erreur lors de la création des événements récurrents.\n${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  };

  // Fonction pour générer les dates de récurrence
  const generateRecurrenceDates = (): Array<{ start: Date; end: Date }> => {
    const dates: Array<{ start: Date; end: Date }> = [];
    const startDateTime = new Date(formData.start_date);
    const endDateTime = new Date(formData.end_date);
    const duration = endDateTime.getTime() - startDateTime.getTime();

    // ✅ Si on est dans l'onglet dates multiples, générer les événements pour chaque date sélectionnée
    if (activeTab === 'multipleDates' && selectedDates.length > 0) {
      selectedDates.forEach(selectedDate => {
        // Créer une nouvelle date avec la date sélectionnée et les heures du formulaire
        const start = new Date(selectedDate);
        start.setHours(startDateTime.getHours(), startDateTime.getMinutes(), startDateTime.getSeconds());

        const end = new Date(start.getTime() + duration);

        dates.push({ start, end });
      });
      return dates;
    }

    // Si pas de récurrence, retourner juste la date initiale
    if (recurrenceType === 'none') {
      return [{ start: startDateTime, end: endDateTime }];
    }

    const currentDate = new Date(startDateTime);
    let count = 0;
    const maxOccurrences = recurrenceEndType === 'count' ? recurrenceCount : 365; // Limite de sécurité
    const endDate = recurrenceEndType === 'until' ? new Date(recurrenceEndDate) : null;

    while (count < maxOccurrences) {
      // Vérifier si on dépasse la date de fin
      if (endDate && currentDate > endDate) break;

      // Ajouter la date actuelle
      const start = new Date(currentDate);
      const end = new Date(currentDate.getTime() + duration);
      dates.push({ start, end });
      count++;

      // Si on a atteint le nombre d'occurrences souhaité, arrêter
      if (recurrenceEndType === 'count' && count >= recurrenceCount) break;

      // Calculer la prochaine date selon le type de récurrence
      switch (recurrenceType) {
        case 'daily':
          currentDate.setDate(currentDate.getDate() + 1);
          break;
        case 'weekly':
          currentDate.setDate(currentDate.getDate() + 7);
          break;
        case 'biweekly':
          currentDate.setDate(currentDate.getDate() + 14);
          break;
        case 'triweekly':
          currentDate.setDate(currentDate.getDate() + 21);
          break;
        case 'monthly':
          currentDate.setMonth(currentDate.getMonth() + 1);
          break;
        case 'yearly':
          currentDate.setFullYear(currentDate.getFullYear() + 1);
          break;
        case 'custom':
          switch (customRecurrenceUnit) {
            case 'days':
              currentDate.setDate(currentDate.getDate() + customRecurrenceInterval);
              break;
            case 'weeks':
              currentDate.setDate(currentDate.getDate() + (customRecurrenceInterval * 7));
              break;
            case 'months':
              currentDate.setMonth(currentDate.getMonth() + customRecurrenceInterval);
              break;
            case 'years':
              currentDate.setFullYear(currentDate.getFullYear() + customRecurrenceInterval);
              break;
          }
          break;
      }
    }

    return dates;
  };

  const handleDelete = () => {
    if (task) {
      // Toujours afficher la confirmation, que l'événement soit récurrent ou non
      if (task.recurrence_id) {
        setShowDeleteConfirm(true);
      } else {
        setShowSimpleConfirm(true);
      }
    }
  };

  const handleConfirmDeleteSingle = () => {
    if (task && onDelete) {
      if (task.recurrence_id) {
        // Supprimer uniquement cette occurrence
        onDelete(task.url || '', task.id, task.recurrence_id);
      } else {
        // Supprimer l'événement non récurrent
        onDelete(task.url || '', task.id);
      }
      setShowDeleteConfirm(false);
      setShowSimpleConfirm(false);
      onClose();
    }
  };

  const handleConfirmDeleteAll = () => {
    if (task && onDelete) {
      // Supprimer toutes les occurrences
      onDelete(task.url || '', task.id);
      setShowDeleteConfirm(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-3 animate-fadeIn">
      {/* Popup de confirmation simple pour événements non récurrents */}
      <ConfirmDialog
        isOpen={showSimpleConfirm}
        onClose={() => setShowSimpleConfirm(false)}
        onConfirm={handleConfirmDeleteSingle}
        title="Supprimer l'événement ?"
        message="Cette action est irréversible"
        confirmLabel="Supprimer"
        itemName={task?.title || ''}
      />

      {/* Popup de confirmation pour événements récurrents */}
      <RecurrenceConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirmSingle={handleConfirmDeleteSingle}
        onConfirmAll={handleConfirmDeleteAll}
      />

      <div className="bg-white max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-xl border border-slate-200/80 flex flex-col rounded-xl">
        {/* Header compact */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-200 bg-linear-to-r from-slate-50 to-white shrink-0">
          <h2 className="text-2xl font-bold text-[#005f82] flex items-center gap-2.5">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-700"
            type="button"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Onglets */}
        <div className="border-b border-slate-200 bg-white shrink-0">
          <div className="flex px-5">
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              className={`px-4 py-2.5 font-semibold text-base border-b-2 transition-colors ${
                activeTab === 'details'
                  ? 'border-[#005f82] text-[#005f82]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Détails
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('recurrence')}
              className={`px-4 py-2.5 font-semibold text-base border-b-2 transition-colors ${
                activeTab === 'recurrence'
                  ? 'border-[#005f82] text-[#005f82]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Récurrence
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('multipleDates')}
              className={`px-4 py-2.5 font-semibold text-base border-b-2 transition-colors ${
                activeTab === 'multipleDates'
                  ? 'border-[#005f82] text-[#005f82]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              📅 Dates multiples
            </button>
          </div>
        </div>

        {/* Formulaire avec scroll */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
          <div className="p-5 space-y-4">
            {/* Contenu de l'onglet Détails */}
            {activeTab === 'details' && (
              <>
            {/* Titre et Lieu côte à côte */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="block text-base font-semibold text-slate-700 mb-2">
                  Titre <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2.5 text-lg bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#005f82] focus:border-[#005f82] text-slate-900 transition-all hover:border-slate-400"
                  placeholder="Ex: Réunion d'équipe"
                />
              </div>

              <div>
                <label className="block text-base font-semibold text-slate-700 mb-2">
                  Lieu
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full px-4 py-2.5 text-lg bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#005f82] focus:border-[#005f82] text-slate-900 transition-all hover:border-slate-400"
                  placeholder="Indiquez un lieu ou une adresse"
                />
                  {application?.entreprise && (
                      <div className="mt-2 text-right">
                          <button
                              type="button"
                              onClick={() => setFormData({ ...formData, location: application.adresse || '' })}
                              className="text-sm font-medium text-slate-500 hover:text-[#005f82] transition-colors"
                          >
                              <span className="font-semibold">Chez {application.entreprise}</span>
                          </button>
                      </div>
                  )}
              </div>
            </div>

            {/* Calendrier(s) et Ressource(s) côte à côte */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Calendrier(s) */}
              <div className="calendar-dropdown-container">
                <label className="block text-base font-semibold text-slate-700 mb-2">
                  Calendrier(s) <span className="text-red-500">*</span>
                </label>

                {/* Champ de recherche avec badges intégrés */}
                <div className="relative">
                  <div className="w-full min-h-[42px] px-2.5 py-1.5 text-base bg-white border border-slate-300 rounded-lg focus-within:outline-none focus-within:ring-2 focus-within:ring-[#005f82] focus-within:border-[#005f82] text-slate-900 transition-all hover:border-slate-400 flex flex-wrap items-center gap-1.5">
                    {/* Calendriers sélectionnés (badges intégrés) */}
                    {formData.calendar_sources && formData.calendar_sources.map(calId => {
                      const cal = calendars.filter(cal => !cal.description?.toLowerCase().includes("resource")).find(c => String(c.id) === calId);
                      if (!cal) return null;
                      const calName = cal.defined_name || cal.share_href || cal.displayname || 'Calendrier';

                      return (
                        <span
                          key={calId}
                          className="inline-flex items-center gap-1.5 px-2 py-1 bg-[#005f82]/10 text-[#005f82] text-sm shrink-0 rounded-md"
                        >
                          <div
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: cal.calendarcolor || '#005f82' }}
                          />
                          <span className="font-medium max-w-[110px] truncate">{calName}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const newSources = formData.calendar_sources?.filter(id => id !== calId) || [];
                              setFormData({
                                ...formData,
                                calendar_sources: newSources,
                                calendar_source: newSources[0] || ''
                              });
                            }}
                            className="hover:bg-[#005f82]/20 p-1 rounded transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                    <input
                      type="text"
                      placeholder={formData.calendar_sources?.length ? "" : "Rechercher..."}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => setShowCalendarDropdown(true)}
                      className="flex-1 min-w-24 outline-none bg-transparent text-base"
                    />
                  </div>

                  {/* Dropdown de sélection */}
                  {showCalendarDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredCalendars.length === 0 ? (
                        <div className="p-2.5 text-base text-slate-500 text-center">
                          Aucun calendrier trouvé
                        </div>
                      ) : (
                        filteredCalendars.map(cal => {
                          const calId = String(cal.id);
                          const calName = cal.defined_name || cal.share_href || cal.displayname || 'Calendrier';
                          const isSelected = formData.calendar_sources?.includes(calId) || false;

                          return (
                            <button
                              key={calId}
                              type="button"
                              onClick={() => {
                                const newSources = isSelected
                                  ? (formData.calendar_sources || []).filter(id => id !== calId)
                                  : [...(formData.calendar_sources || []), calId];
                                setFormData({
                                  ...formData,
                                  calendar_sources: newSources,
                                  calendar_source: newSources[0] || ''
                                });
                              }}
                              className={`w-full px-3 py-2 text-left text-base flex items-center gap-2.5 hover:bg-slate-50 active:bg-slate-100 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                                isSelected ? 'bg-[#005f82]/5' : ''
                              }`}
                            >
                              <div
                                className="w-3.5 h-3.5 shrink-0"
                                style={{ backgroundColor: cal.calendarcolor || '#005f82' }}
                              />
                              <span className={`flex-1 ${isSelected ? 'font-medium text-[#005f82]' : 'text-slate-700'}`}>
                                {calName}
                              </span>
                              {isSelected && (
                                <svg className="w-5 h-5 text-[#005f82]" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Ressource(s) */}
              <div className="resource-dropdown-container">
                <label className="block text-base font-semibold text-slate-700 mb-2">
                  Ressource(s)
                </label>

                {/* Champ de recherche avec badges intégrés */}
                <div className="relative">
                  <div className="w-full min-h-[42px] px-2.5 py-1.5 text-base bg-white border border-slate-300 rounded-lg focus-within:outline-none focus-within:ring-2 focus-within:ring-[#005f82] focus-within:border-[#005f82] text-slate-900 transition-all hover:border-slate-400 flex flex-wrap items-center gap-1.5">
                    {/* Ressources sélectionnées (badges intégrés) */}
                    {formData.calendar_sources && formData.calendar_sources.map(calId => {
                      const cal = calendars.find(c => String(c.id) === calId && c.description?.toLowerCase().includes("resource"));
                      if (!cal) return null;
                      const calName = cal.displayname || cal.defined_name || cal.share_href || 'Ressource';

                      return (
                        <span
                          key={calId}
                          className="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-700 text-sm border border-amber-200 shrink-0 rounded-md"
                        >
                          <div
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: cal.calendarcolor || '#f59e0b' }}
                          />
                          <span className="font-medium max-w-[110px] truncate">{calName}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const newSources = formData.calendar_sources?.filter(id => id !== calId) || [];
                              setFormData({
                                ...formData,
                                calendar_sources: newSources,
                                calendar_source: newSources[0] || ''
                              });
                            }}
                            className="hover:bg-amber-200 p-1 rounded transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                    <input
                      type="text"
                      placeholder={formData.calendar_sources?.some(id => calendars.find(c => String(c.id) === id && c.description?.toLowerCase().includes("resource"))) ? "" : "Rechercher..."}
                      value={resourceSearchQuery}
                      onChange={(e) => setResourceSearchQuery(e.target.value)}
                      onFocus={() => setShowResourceDropdown(true)}
                      className="flex-1 min-w-24 outline-none bg-transparent text-base"
                    />
                  </div>

                  {/* Dropdown de sélection */}
                  {showResourceDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredResources.length === 0 ? (
                        <div className="p-2.5 text-base text-slate-500 text-center">
                          Aucune ressource trouvée
                        </div>
                      ) : (
                        filteredResources.map(cal => {
                          const calId = String(cal.id);
                          const calName = cal.displayname || cal.defined_name || cal.share_href || 'Ressource';
                          const isSelected = formData.calendar_sources?.includes(calId) || false;

                          return (
                            <button
                              key={calId}
                              type="button"
                              onClick={() => {
                                const newSources = isSelected
                                  ? (formData.calendar_sources || []).filter(id => id !== calId)
                                  : [...(formData.calendar_sources || []), calId];
                                setFormData({
                                  ...formData,
                                  calendar_sources: newSources,
                                  calendar_source: newSources[0] || ''
                                });
                              }}
                              className={`w-full px-3 py-2 text-left text-base flex items-center gap-2.5 hover:bg-slate-50 active:bg-slate-100 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                                isSelected ? 'bg-[#005f82]/5' : ''
                              }`}
                            >
                              <div
                                className="w-3.5 h-3.5 shrink-0"
                                style={{ backgroundColor: cal.calendarcolor || '#005f82' }}
                              />
                              <span className={`flex-1 ${isSelected ? 'font-medium text-[#005f82]' : 'text-slate-700'}`}>
                                {calName}
                              </span>
                              {isSelected && (
                                <svg className="w-5 h-5 text-[#005f82]" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Dates et heures combinées */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="block text-base font-semibold text-slate-700 mb-2">
                  Date et heure de début <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  value={formData.start_date}
                  onChange={(e) => {
                    setFormData({ ...formData, start_date: e.target.value });
                    // Si la date de fin est vide ou antérieure, la synchroniser avec +1h
                    if (!formData.end_date || e.target.value >= formData.end_date) {
                      const endDateTime = new Date(e.target.value);
                      endDateTime.setHours(endDateTime.getHours() + 1);
                      setFormData({
                        ...formData,
                        start_date: e.target.value,
                        end_date: formatDateTimeLocal(endDateTime)
                      });
                    }
                  }}
                  className="w-full px-4 py-2.5 text-base bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#005f82] focus:border-[#005f82] text-slate-900 transition-all hover:border-slate-400"
                />
              </div>

              <div>
                <label className="block text-base font-semibold text-slate-700 mb-2">
                  Date et heure de fin <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  min={formData.start_date}
                  className="w-full px-4 py-2.5 text-base bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#005f82] focus:border-[#005f82] text-slate-900 transition-all hover:border-slate-400"
                />
              </div>
            </div>

            {/* Préréglages horaires rapides - plus compacts */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">
                Préréglages rapides
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const startDate = formData.start_date ? new Date(formData.start_date) : new Date();
                    startDate.setHours(9, 0, 0, 0);
                    const endDate = new Date(startDate);
                    endDate.setHours(12, 30, 0, 0);
                    setFormData({
                      ...formData,
                      start_date: formatDateTimeLocal(startDate),
                      end_date: formatDateTimeLocal(endDate)
                    });
                  }}
                  className="flex flex-col items-center justify-center px-2.5 py-2 bg-white border border-slate-300 rounded-md hover:border-[#005f82] hover:bg-[#005f82]/5 hover:shadow-sm transition-all active:scale-95"
                >
                  <span className="text-xs font-semibold text-slate-700">Matinée</span>
                  <span className="text-[10px] text-slate-500">9h - 12h30</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const startDate = formData.start_date ? new Date(formData.start_date) : new Date();
                    startDate.setHours(14, 0, 0, 0);
                    const endDate = new Date(startDate);
                    endDate.setHours(18, 0, 0, 0);
                    setFormData({
                      ...formData,
                      start_date: formatDateTimeLocal(startDate),
                      end_date: formatDateTimeLocal(endDate)
                    });
                  }}
                  className="flex flex-col items-center justify-center px-2.5 py-2 bg-white border border-slate-300 rounded-md hover:border-[#005f82] hover:bg-[#005f82]/5 hover:shadow-sm transition-all active:scale-95"
                >
                  <span className="text-xs font-semibold text-slate-700">Après-midi</span>
                  <span className="text-[10px] text-slate-500">14h - 18h</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const startDate = formData.start_date ? new Date(formData.start_date) : new Date();
                    startDate.setHours(9, 0, 0, 0);
                    const endDate = new Date(startDate);
                    endDate.setHours(17, 30, 0, 0);
                    setFormData({
                      ...formData,
                      start_date: formatDateTimeLocal(startDate),
                      end_date: formatDateTimeLocal(endDate)
                    });
                  }}
                  className="flex flex-col items-center justify-center px-2.5 py-2 bg-white border border-slate-300 rounded-md hover:border-[#005f82] hover:bg-[#005f82]/5 hover:shadow-sm transition-all active:scale-95"
                >
                  <span className="text-xs font-semibold text-slate-700">Journée</span>
                  <span className="text-[10px] text-slate-500">9h - 17h30</span>
                </button>
              </div>
            </div>

            {/* Client et Affaire */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              {/* Recherche Client */}
              <div className="client-dropdown-container">
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Client
                </label>

                {clientInfoLoading ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="flex-1">
                      <div className="h-4 bg-slate-200 rounded w-2/3 mb-1 animate-pulse"></div>
                      <div className="h-3 bg-slate-200 rounded w-1/2 animate-pulse"></div>
                    </div>
                  </div>
                ) : selectedClient ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer">
                    <div className="flex-1">
                      <div className="font-semibold text-slate-900 text-sm">
                        {selectedClient.nom}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedClient(null);
                        setSelectedAffair(null);
                        setClientSearchQuery('');
                        setAffairs([]);
                      }}
                      className="p-1 hover:bg-blue-200 rounded-full transition-colors active:scale-90"
                    >
                      <X className="w-3.5 h-3.5 text-blue-700" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Rechercher un client..."
                      value={clientSearchQuery}
                      onChange={(e) => setClientSearchQuery(e.target.value)}
                      onFocus={() => setShowClientDropdown(true)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#005f82] focus:border-[#005f82] text-slate-900 transition-all hover:border-slate-400"
                    />

                    {showClientDropdown && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {clientSearchLoading ? (
                          <div className="p-2 text-sm text-slate-500 text-center">
                            Recherche en cours...
                          </div>
                        ) : clientSearchQuery.length < 3 ? (
                          <div className="p-2 text-sm text-slate-500 text-center">
                            Saisissez au moins 3 caractères
                          </div>
                        ) : clients.length === 0 ? (
                          <div className="p-2 text-sm text-slate-500 text-center">
                            Aucun client trouvé
                          </div>
                        ) : (
                          clients.map(client => (
                            <button
                              key={client.id}
                              type="button"
                              onClick={() => {
                                setSelectedClient(client);
                                setShowClientDropdown(false);
                                setClientSearchQuery('');
                              }}
                              className="w-full px-2.5 py-1.5 text-left text-sm hover:bg-slate-50 active:bg-slate-100 transition-colors first:rounded-t-lg last:rounded-b-lg"
                            >
                              <div className="font-medium text-slate-900">
                                {client.nom}
                              </div>
                              {(client.email || client.telephone) && (
                                <div className="text-xs text-slate-600">
                                  {client.email && <span>{client.email}</span>}
                                  {client.email && client.telephone && <span> • </span>}
                                  {client.telephone && <span>{client.telephone}</span>}
                                </div>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Recherche Affaire */}
              <div className="affair-dropdown-container">
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Affaire
                </label>

                {!selectedClient && !affairInfoLoading ? (
                  <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
                    Sélectionnez d&apos;abord un client
                  </div>
                ) : affairInfoLoading ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="flex-1">
                      <div className="h-4 bg-slate-200 rounded w-2/3 mb-1 animate-pulse"></div>
                      <div className="h-3 bg-slate-200 rounded w-1/2 animate-pulse"></div>
                    </div>
                  </div>
                ) : selectedAffair ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors cursor-pointer">
                    <div className="flex-1">
                      <div className="font-semibold text-slate-900 text-sm">{selectedAffair.nom}</div>
                      {selectedAffair.descriptif && (
                        <div className="text-xs text-slate-600">{selectedAffair.descriptif}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAffair(null);
                        setAffairSearchQuery('');
                      }}
                      className="p-1 hover:bg-green-200 rounded-full transition-colors active:scale-90"
                    >
                      <X className="w-3.5 h-3.5 text-green-700" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Rechercher une affaire..."
                      value={affairSearchQuery}
                      onChange={(e) => setAffairSearchQuery(e.target.value)}
                      onFocus={() => setShowAffairDropdown(true)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#005f82] focus:border-[#005f82] text-slate-900 transition-all hover:border-slate-400"
                    />

                    {showAffairDropdown && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {affairSearchLoading ? (
                          <div className="p-2 text-sm text-slate-500 text-center">
                            Recherche en cours...
                          </div>
                        ) : affairs.length === 0 ? (
                          <div className="p-2 text-sm text-slate-500 text-center">
                            Aucune affaire trouvée
                          </div>
                        ) : (
                          affairs.map(affair => (
                            <button
                              key={affair.id}
                              type="button"
                              onClick={() => {
                                setSelectedAffair(affair);
                                setShowAffairDropdown(false);
                                setAffairSearchQuery('');
                              }}
                              className="w-full px-2.5 py-1.5 text-left text-sm hover:bg-slate-50 active:bg-slate-100 transition-colors first:rounded-t-lg last:rounded-b-lg"
                            >
                              <div className="font-medium text-slate-900">{affair.nom}</div>
                              {affair.descriptif && (
                                <div className="text-xs text-slate-600">{affair.descriptif}</div>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Description
              </label>
              <div className="border border-slate-300 focus-within:ring-1 focus-within:ring-[#005f82] focus-within:border-[#005f82] transition-shadow">
                <RichTextEditor
                  content={formData.description}
                  onChange={(newContent) => setFormData({ ...formData, description: newContent })}
                />
              </div>
            </div>
              </>
            )}

            {/* Contenu de l'onglet Récurrence */}
            {activeTab === 'recurrence' && (
              <div className="space-y-4">
                {/* Cartes de fréquence - Simple et Moderne */}
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-4">Fréquence de répétition</h3>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Une seule fois */}
                    <button
                      type="button"
                      onClick={() => setRecurrenceType('none')}
                      className={`group relative p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                        recurrenceType === 'none'
                          ? 'border-[#005f82] bg-gradient-to-br from-[#005f82]/10 to-[#007ba7]/5 shadow-xl scale-105'
                          : 'border-slate-200 hover:border-[#005f82]/50 hover:shadow-lg hover:scale-102'
                      }`}
                    >
                      <div className="text-3xl mb-2">📅</div>
                      <div className="text-base font-bold text-slate-900 mb-1">Une seule fois</div>
                      <div className="text-xs text-slate-600">Pas de répétition</div>
                      {recurrenceType === 'none' && (
                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#005f82] flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </button>

                    {/* Tous les jours */}
                    <button
                      type="button"
                      onClick={() => setRecurrenceType('daily')}
                      className={`group relative p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                        recurrenceType === 'daily'
                          ? 'border-[#005f82] bg-gradient-to-br from-[#005f82]/10 to-[#007ba7]/5 shadow-xl scale-105'
                          : 'border-slate-200 hover:border-[#005f82]/50 hover:shadow-lg hover:scale-102'
                      }`}
                    >
                      <div className="text-3xl mb-2">☀️</div>
                      <div className="text-base font-bold text-slate-900 mb-1">Tous les jours</div>
                      <div className="text-xs text-slate-600">Répétition quotidienne</div>
                      {recurrenceType === 'daily' && (
                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#005f82] flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </button>

                    {/* Toutes les semaines */}
                    <button
                      type="button"
                      onClick={() => setRecurrenceType('weekly')}
                      className={`group relative p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                        recurrenceType === 'weekly'
                          ? 'border-[#005f82] bg-gradient-to-br from-[#005f82]/10 to-[#007ba7]/5 shadow-xl scale-105'
                          : 'border-slate-200 hover:border-[#005f82]/50 hover:shadow-lg hover:scale-102'
                      }`}
                    >
                      <div className="text-3xl mb-2">📆</div>
                      <div className="text-base font-bold text-slate-900 mb-1">Chaque semaine</div>
                      <div className="text-xs text-slate-600">Le {formData.start_date ? getDayName(new Date(formData.start_date)) : getDayName(new Date())}</div>
                      {recurrenceType === 'weekly' && (
                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#005f82] flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </button>

                    {/* Tous les mois */}
                    <button
                      type="button"
                      onClick={() => setRecurrenceType('monthly')}
                      className={`group relative p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                        recurrenceType === 'monthly'
                          ? 'border-[#005f82] bg-gradient-to-br from-[#005f82]/10 to-[#007ba7]/5 shadow-xl scale-105'
                          : 'border-slate-200 hover:border-[#005f82]/50 hover:shadow-lg hover:scale-102'
                      }`}
                    >
                      <div className="text-3xl mb-2">🗓️</div>
                      <div className="text-base font-bold text-slate-900 mb-1">Chaque mois</div>
                      <div className="text-xs text-slate-600">Le {formData.start_date ? getDayName(new Date(formData.start_date)) : getDayName(new Date())}</div>
                      {recurrenceType === 'monthly' && (
                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#005f82] flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </button>

                    {/* Toutes les 2 semaines */}
                    <button
                      type="button"
                      onClick={() => setRecurrenceType('biweekly')}
                      className={`group relative p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                        recurrenceType === 'biweekly'
                          ? 'border-[#005f82] bg-gradient-to-br from-[#005f82]/10 to-[#007ba7]/5 shadow-xl scale-105'
                          : 'border-slate-200 hover:border-[#005f82]/50 hover:shadow-lg hover:scale-102'
                      }`}
                    >
                      <div className="text-4xl mb-4">📊</div>
                      <div className="text-lg font-bold text-slate-900 mb-2">Toutes les 2 semaines</div>
                      <div className="text-sm text-slate-600">Le {formData.start_date ? getDayName(new Date(formData.start_date)) : getDayName(new Date())}</div>
                      {recurrenceType === 'biweekly' && (
                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#005f82] flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </button>

                    {/* Toutes les 3 semaines */}
                    <button
                      type="button"
                      onClick={() => setRecurrenceType('triweekly')}
                      className={`group relative p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                        recurrenceType === 'triweekly'
                          ? 'border-[#005f82] bg-gradient-to-br from-[#005f82]/10 to-[#007ba7]/5 shadow-xl scale-105'
                          : 'border-slate-200 hover:border-[#005f82]/50 hover:shadow-lg hover:scale-102'
                      }`}
                    >
                      <div className="text-3xl mb-2">📋</div>
                      <div className="text-base font-bold text-slate-900 mb-1">Toutes les 3 semaines</div>
                      <div className="text-xs text-slate-600">Le {formData.start_date ? getDayName(new Date(formData.start_date)) : getDayName(new Date())}</div>
                      {recurrenceType === 'triweekly' && (
                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#005f82] flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </button>

                    {/* Tous les ans */}
                    <button
                      type="button"
                      onClick={() => setRecurrenceType('yearly')}
                      className={`group relative p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                        recurrenceType === 'yearly'
                          ? 'border-[#005f82] bg-gradient-to-br from-[#005f82]/10 to-[#007ba7]/5 shadow-xl scale-105'
                          : 'border-slate-200 hover:border-[#005f82]/50 hover:shadow-lg hover:scale-102'
                      }`}
                    >
                      <div className="text-3xl mb-2">🎂</div>
                      <div className="text-base font-bold text-slate-900 mb-1">Chaque année</div>
                      <div className="text-xs text-slate-600">Le {formData.start_date ? formatFullDate(new Date(formData.start_date)) : formatFullDate(new Date())}</div>
                      {recurrenceType === 'yearly' && (
                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#005f82] flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </button>

                    {/* Personnalisé */}
                    <button
                      type="button"
                      onClick={() => setRecurrenceType('custom')}
                      className={`group relative p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                        recurrenceType === 'custom'
                          ? 'border-[#005f82] bg-gradient-to-br from-[#005f82]/10 to-[#007ba7]/5 shadow-xl scale-105'
                          : 'border-slate-200 hover:border-[#005f82]/50 hover:shadow-lg hover:scale-102'
                      }`}
                    >
                      <div className="text-3xl mb-2">⚙️</div>
                      <div className="text-base font-bold text-slate-900 mb-1">Personnalisé</div>
                      <div className="text-xs text-slate-600">Configuration avancée</div>
                      {recurrenceType === 'custom' && (
                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#005f82] flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </button>
                  </div>

                  {/* Config personnalisée */}
                  {recurrenceType === 'custom' && (
                    <div className="mt-4 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm font-semibold text-slate-700">Répéter tous les</span>
                        <input
                          type="number"
                          min="1"
                          max="99"
                          value={customRecurrenceInterval}
                          onChange={(e) => setCustomRecurrenceInterval(parseInt(e.target.value) || 1)}
                          className="w-20 px-3 py-2 text-lg font-bold text-center bg-white border-2 border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#005f82] focus:border-[#005f82] shadow-sm"
                        />
                        <select
                          value={customRecurrenceUnit}
                          onChange={(e) => setCustomRecurrenceUnit(e.target.value as 'days' | 'weeks' | 'months' | 'years')}
                          className="px-4 py-2 text-sm font-semibold bg-white border-2 border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#005f82] focus:border-[#005f82] shadow-sm"
                        >
                          <option value="days">jour(s)</option>
                          <option value="weeks">semaine(s)</option>
                          <option value="months">mois</option>
                          <option value="years">année(s)</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Cartes de fin de récurrence */}
                {recurrenceType !== 'none' && (
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 mb-4">Quand arrêter</h3>

                    <div className="space-y-3">
                      {/* Jamais */}
                      <button
                        type="button"
                        onClick={() => setRecurrenceEndType('never')}
                        className={`group relative w-full p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                          recurrenceEndType === 'never'
                            ? 'border-purple-500 bg-gradient-to-br from-purple-50 to-pink-50 shadow-xl scale-102'
                            : 'border-slate-200 hover:border-purple-300 hover:shadow-lg'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-3xl">♾️</div>
                          <div className="flex-1">
                            <div className="text-base font-bold text-slate-900 mb-0.5">Jamais</div>
                            <div className="text-xs text-slate-600">Continue indéfiniment (max 365)</div>
                          </div>
                          {recurrenceEndType === 'never' && (
                            <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center">
                              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </button>

                      {/* Après X fois */}
                      <button
                        type="button"
                        onClick={() => setRecurrenceEndType('count')}
                        className={`group relative w-full p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                          recurrenceEndType === 'count'
                            ? 'border-purple-500 bg-gradient-to-br from-purple-50 to-pink-50 shadow-xl scale-102'
                            : 'border-slate-200 hover:border-purple-300 hover:shadow-lg'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-3xl">🔢</div>
                          <div className="flex-1">
                            <div className="text-base font-bold text-slate-900 mb-0.5">Après un nombre de fois</div>
                            <div className="text-xs text-slate-600">Définir le nombre d&apos;occurrences</div>
                          </div>
                          {recurrenceEndType === 'count' && (
                            <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center">
                              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </button>

                      {/* À une date */}
                      <button
                        type="button"
                        onClick={() => setRecurrenceEndType('until')}
                        className={`group relative w-full p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                          recurrenceEndType === 'until'
                            ? 'border-purple-500 bg-gradient-to-br from-purple-50 to-pink-50 shadow-xl scale-102'
                            : 'border-slate-200 hover:border-purple-300 hover:shadow-lg'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-3xl">📅</div>
                          <div className="flex-1">
                            <div className="text-base font-bold text-slate-900 mb-0.5">À une date précise</div>
                            <div className="text-xs text-slate-600">Choisir une date de fin</div>
                          </div>
                          {recurrenceEndType === 'until' && (
                            <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center">
                              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </button>
                    </div>

                    {/* Configuration count */}
                    {recurrenceEndType === 'count' && (
                      <div className="mt-4 p-4 bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm font-semibold text-slate-700">Répéter</span>
                          <input
                            type="number"
                            min="1"
                            max="999"
                            value={recurrenceCount}
                            onChange={(e) => setRecurrenceCount(parseInt(e.target.value) || 1)}
                            className="w-24 px-3 py-2 text-lg font-bold text-center bg-white border-2 border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 shadow-sm"
                          />
                          <span className="text-sm font-semibold text-slate-700">fois au total</span>
                        </div>
                      </div>
                    )}

                    {/* Configuration until */}
                    {recurrenceEndType === 'until' && (
                      <div className="mt-4 p-4 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm font-semibold text-slate-700">Arrêter le</span>
                          <input
                            type="date"
                            value={recurrenceEndDate}
                            onChange={(e) => setRecurrenceEndDate(e.target.value)}
                            className="flex-1 min-w-[200px] px-4 py-2 text-sm font-semibold bg-white border-2 border-green-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 shadow-sm"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Résumé */}
                {recurrenceType !== 'none' && (
                  <div className="p-4 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 border-2 border-blue-200 rounded-xl shadow-md">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0 shadow-lg">
                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h4 className="text-base font-bold text-slate-900 mb-2">Résumé</h4>
                        <p className="text-sm text-slate-700 leading-relaxed">
                          <span className="font-semibold text-[#005f82]">
                            {recurrenceType === 'daily' && '☀️ Tous les jours'}
                            {recurrenceType === 'weekly' && `📆 Tous les ${formData.start_date ? getDayName(new Date(formData.start_date)) : getDayName(new Date())}`}
                            {recurrenceType === 'monthly' && `🗓️ Le ${formData.start_date ? getDayName(new Date(formData.start_date)) : getDayName(new Date())} de chaque mois`}
                            {recurrenceType === 'biweekly' && `📊 Toutes les 2 semaines le ${formData.start_date ? getDayName(new Date(formData.start_date)) : getDayName(new Date())}`}
                            {recurrenceType === 'triweekly' && `📋 Toutes les 3 semaines le ${formData.start_date ? getDayName(new Date(formData.start_date)) : getDayName(new Date())}`}
                            {recurrenceType === 'yearly' && `🎂 Chaque année le ${formData.start_date ? formatFullDate(new Date(formData.start_date)) : formatFullDate(new Date())}`}
                            {recurrenceType === 'custom' && `⚙️ Tous les ${customRecurrenceInterval} ${
                              customRecurrenceUnit === 'days' ? 'jour(s)' :
                              customRecurrenceUnit === 'weeks' ? 'semaine(s)' :
                              customRecurrenceUnit === 'months' ? 'mois' : 'année(s)'
                            }`}
                          </span>
                          {recurrenceEndType === 'never' && ', ♾️ indéfiniment'}
                          {recurrenceEndType === 'count' && `, 🔢 ${recurrenceCount} fois`}
                          {recurrenceEndType === 'until' && recurrenceEndDate && `, 📅 jusqu'au ${new Date(recurrenceEndDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Contenu de l'onglet Dates multiples */}
            {activeTab === 'multipleDates' && (
              <div className="space-y-6">
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-blue-700">
                        Sélectionnez plusieurs dates pour créer le même événement à différentes dates. Les heures de début et de fin définies dans l'onglet <strong>Détails</strong> seront appliquées à toutes les dates.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Sélection des dates avec style amélioré */}
                <div>
                  <label className="block text-base font-semibold text-slate-700 mb-3">
                    📅 Sélectionner des dates
                  </label>

                  <div className="space-y-3">
                    {/* Input pour ajouter une date */}
                    <div className="flex gap-2">
                      <input
                        type="date"
                        onChange={(e) => {
                          if (e.target.value) {
                            const newDate = new Date(e.target.value + 'T12:00:00');
                            // Vérifier que la date n'est pas déjà sélectionnée
                            const dateExists = selectedDates.some(d =>
                              d.toDateString() === newDate.toDateString()
                            );
                            if (!dateExists) {
                              setSelectedDates([...selectedDates, newDate].sort((a, b) => a.getTime() - b.getTime()));
                            }
                            e.target.value = '';
                          }
                        }}
                        className="flex-1 px-4 py-2.5 text-base bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#005f82] focus:border-[#005f82] transition-all hover:border-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => setSelectedDates([])}
                        className="px-4 py-2.5 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-lg font-medium text-sm transition-colors"
                      >
                        Effacer tout
                      </button>
                    </div>

                    {/* Liste des dates sélectionnées */}
                    {selectedDates.length > 0 && (
                      <div className="border-2 border-slate-200 rounded-xl p-4 bg-slate-50">
                        <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                          <span>Dates sélectionnées ({selectedDates.length})</span>
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
                          {selectedDates.map((date, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between bg-white border border-slate-300 rounded-lg px-3 py-2 hover:border-[#005f82] transition-colors group"
                            >
                              <span className="text-sm font-medium text-slate-700">
                                {date.toLocaleDateString('fr-FR', {
                                  weekday: 'short',
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric'
                                })}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedDates(selectedDates.filter((_, i) => i !== index));
                                }}
                                className="text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedDates.length === 0 && (
                      <div className="text-center py-8 text-slate-400">
                        <svg className="w-16 h-16 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="text-sm">Aucune date sélectionnée</p>
                      </div>
                    )}

                    {/* Résumé des heures - Design amélioré */}
                    {selectedDates.length > 0 && formData.start_date && formData.end_date && (
                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shrink-0 shadow-lg">
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <h4 className="text-base font-bold text-slate-900 mb-2">Résumé</h4>
                            <p className="text-sm text-slate-700 leading-relaxed">
                              <span className="font-semibold text-green-700">
                                {selectedDates.length} événement{selectedDates.length > 1 ? 's' : ''} {selectedDates.length > 1 ? 'seront créés' : 'sera créé'}
                              </span>
                              <br />
                              🕐 Horaire : {new Date(formData.start_date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} - {new Date(formData.end_date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer avec boutons */}
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 flex gap-2 shrink-0">
            <button
              type="submit"
              disabled={isCreating}
              className={`flex-1 font-semibold py-2 px-5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#005f82] focus:ring-offset-2 shadow-sm flex items-center justify-center gap-2 ${
                isCreating
                  ? 'bg-slate-400 cursor-not-allowed'
                  : 'bg-[#005f82] hover:bg-[#004a65] text-white'
              }`}
            >
              {isCreating ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Création en cours...</span>
                </>
              ) : (
                <span>{task ? 'Mettre à jour' : 'Créer l\'événement'}</span>
              )}
            </button>
            {task && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isCreating}
                className={`font-semibold py-2 px-5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 shadow-sm ${
                  isCreating
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                Supprimer
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={isCreating}
              className={`font-semibold py-2 px-5 text-sm border border-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 ${
                isCreating
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-white hover:bg-slate-100 text-slate-700'
              }`}
            >
              Annuler
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

