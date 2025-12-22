'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Task, CalendarSource, Client, Affaire } from '@/lib/types';
import RichTextEditor from './RichTextEditor';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { fetchCalendars } from '@/store/calendarSlice';
import { baikalAPI } from '@/lib/api';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Omit<Task, 'id' | 'created_at' | 'updated_at'>) => void;
  onDelete?: (url: string) => void;
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

  // États pour les dates et heures séparées
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');

  // État pour le préréglage horaire sélectionné
  const [timePreset, setTimePreset] = useState<'morning' | 'afternoon' | 'fullday' | 'custom'>('custom');

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



  // Helper pour extraire date et heure d'un datetime-local string
  const extractDateAndTime = (dateTimeString: string) => {
    const [date, time] = dateTimeString.split('T');
    return { date: date || '', time: time || '09:00' };
  };

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

      // Extraire dates et heures séparées
      const startDateTime = task.start_date.slice(0, 16);
      const endDateTime = task.end_date.slice(0, 16);
      const { date: sDate, time: sTime } = extractDateAndTime(startDateTime);
      const { date: eDate, time: eTime } = extractDateAndTime(endDateTime);

      // Initialiser les états de date/heure
      setStartDate(sDate);
      setStartTime(sTime);
      setEndDate(eDate);
      setEndTime(eTime);
      setTimePreset('custom');

      return {
        title: task.title,
        description: task.description || '',
        location: task.location || '',
        start_date: startDateTime,
        end_date: endDateTime,
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

    const { date: sDate, time: sTime } = extractDateAndTime(startDateTimeLocal);
    const { date: eDate, time: eTime } = extractDateAndTime(endDateTimeLocal);

    // Initialiser les états de date/heure
    setStartDate(sDate);
    setStartTime(sTime);
    setEndDate(eDate);
    setEndTime(eTime);
    setTimePreset('custom');

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
    };

    if (showCalendarDropdown || showResourceDropdown || showClientDropdown || showAffairDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showCalendarDropdown, showResourceDropdown, showClientDropdown, showAffairDropdown]);

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

  // Synchroniser les dates/heures avec formData
  useEffect(() => {
    if (startDate && startTime && endDate && endTime) {
      setFormData(prev => ({
        ...prev,
        start_date: `${startDate}T${startTime}`,
        end_date: `${endDate}T${endTime}`,
      }));
    }
  }, [startDate, startTime, endDate, endTime]);

  // Gérer les préréglages horaires
  const handleTimePreset = (preset: 'morning' | 'afternoon' | 'fullday') => {
    setTimePreset(preset);

    if (preset === 'morning') {
      setStartTime('09:00');
      setEndTime('12:30');
    } else if (preset === 'afternoon') {
      setStartTime('14:00');
      setEndTime('18:00');
    } else if (preset === 'fullday') {
      setStartTime('09:00');
      setEndTime('17:30');
    }
  };

  // Gérer les changements manuels d'heure
  const handleTimeChange = (field: 'start' | 'end', value: string) => {
    if (field === 'start') {
      setStartTime(value);
    } else {
      setEndTime(value);
    }
    setTimePreset('custom'); // Passer en mode personnalisé si l'utilisateur modifie
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // ✅ Vérifier qu'au moins un calendrier est sélectionné
    if (!formData.calendar_sources || formData.calendar_sources.length === 0) {
      alert('Veuillez sélectionner au moins un calendrier.');
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
    onSave({
      title: formData.title,
      description: formData.description,
      location: formData.location,
      start_date: new Date(formData.start_date).toISOString(),
      end_date: new Date(formData.end_date).toISOString(),
      calendar_source_name: selectedCalendar.displayname,
      calendar_source_id: selectedCalendar.id,
      calendar_source_uri: selectedCalendar.uri || '',
      calendar_source_color: selectedCalendar.calendarcolor,
      // ✅ Ajouter client et affaire
      ...(selectedClient && { client_id: selectedClient.id }),
      ...(selectedAffair && { affair_id: selectedAffair.id }),
      // ✅ IMPORTANT : Inclure l'URL de l'événement pour les mises à jour
      ...(task && { url: task.url }),
    });
    onClose();
  };

  const submitWithMultipleCalendars = (selectedCalendars: CalendarSource[]) => {
    console.log('=== TaskModal Submit Multiple Calendars ===');
    console.log('Calendriers sélectionnés:', selectedCalendars);

    // Créer l'événement dans chaque calendrier sélectionné
    // Note: chaque appel sera traité individuellement par le store Redux
    selectedCalendars.forEach(calendar => {
      console.log('Création dans:', calendar.displayname || calendar.defined_name);

      onSave({
        title: formData.title,
        description: formData.description,
        location: formData.location,
        start_date: new Date(formData.start_date).toISOString(),
        end_date: new Date(formData.end_date).toISOString(),
        calendar_source_name: calendar.displayname,
        calendar_source_id: calendar.id,
        calendar_source_uri: calendar.uri || '',
        calendar_source_color: calendar.calendarcolor,
        // ✅ Ajouter client et affaire
        ...(selectedClient && { client_id: selectedClient.id }),
        ...(selectedAffair && { affair_id: selectedAffair.id }),
      });
    });

    onClose();
  };

  const handleDelete = () => {
    if (task && onDelete) {
      onDelete(task.url || '');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4 animate-fadeIn">
      <div className="bg-white max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-xl border border-slate-200/80 flex flex-col">
        {/* Header compact */}
        <div className="flex items-center justify-between px-2 py-2 border-b border-slate-200 bg-linear-to-r from-slate-50 to-white shrink-0">
          <h2 className="text-2xl font-bold text-[#005f82] flex items-center gap-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {task ? 'Modifier l\'événement' : 'Nouvel événement'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-700"
            type="button"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Formulaire avec scroll */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
          <div className="p-6 space-y-5">
            {/* Titre */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Titre <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-3 text-base bg-white border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#005f82] focus:border-[#005f82] text-slate-900 transition-all"
                placeholder="Ex: Réunion d'équipe"
              />
            </div>

            {/* Grille compacte : Lieu + Calendrier */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Lieu
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full px-4 py-3 text-base bg-white border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#005f82] focus:border-[#005f82] text-slate-900 transition-all"
                  placeholder="Salle 201"
                />
                  {application?.entreprise && (
                      <div className="mt-2 text-right">
                          <button
                              type="button"
                              onClick={() => setFormData({ ...formData, location: application.adresse || '' })}
                              className="text-xs font-medium text-slate-500 hover:text-[#005f82] transition-colors"
                          >
                              <span className="font-semibold">Chez {application.entreprise}</span>
                          </button>
                      </div>
                  )}
              </div>

              <div className="calendar-dropdown-container">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Calendrier(s) <span className="text-red-500">*</span>
                </label>

                {/* Champ de recherche */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Rechercher et sélectionner..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setShowCalendarDropdown(true)}
                    className="w-full px-4 py-3 text-base bg-white border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#005f82] focus:border-[#005f82] text-slate-900 transition-all"
                  />

                  {/* Dropdown de sélection */}
                  {showCalendarDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 shadow-lg max-h-60 overflow-y-auto">
                      {filteredCalendars.length === 0 ? (
                        <div className="p-3 text-sm text-slate-500 text-center">
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
                              className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-slate-50 transition-colors ${
                                isSelected ? 'bg-[#005f82]/5' : ''
                              }`}
                            >
                              <div
                                className="w-3 h-3 shrink-0"
                                style={{ backgroundColor: cal.calendarcolor || '#005f82' }}
                              />
                              <span className={`flex-1 ${isSelected ? 'font-medium text-[#005f82]' : 'text-slate-700'}`}>
                                {calName}
                              </span>
                              {isSelected && (
                                <svg className="w-4 h-4 text-[#005f82]" fill="currentColor" viewBox="0 0 20 20">
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

                {/* Calendriers sélectionnés (badges) */}
                {formData.calendar_sources && formData.calendar_sources.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {formData.calendar_sources.map(calId => {
                      const cal = calendars.filter(cal => !cal.description?.toLowerCase().includes("resource")).find(c => String(c.id) === calId);
                      if (!cal) return null;
                      const calName = cal.defined_name || cal.share_href || cal.displayname || 'Calendrier';

                      return (
                        <span
                          key={calId}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#005f82]/10 text-[#005f82] text-sm"
                        >
                          <div
                            className="w-2 h-2"
                            style={{ backgroundColor: cal.calendarcolor || '#005f82' }}
                          />
                          <span className="font-medium">{calName}</span>
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
                            className="ml-1 hover:bg-[#005f82]/20 p-0.5 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

             <div className="resource-dropdown-container">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Ressource(s)
                </label>

                {/* Champ de recherche */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Rechercher des ressources..."
                    value={resourceSearchQuery}
                    onChange={(e) => setResourceSearchQuery(e.target.value)}
                    onFocus={() => setShowResourceDropdown(true)}
                    className="w-full px-4 py-3 text-base bg-white border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#005f82] focus:border-[#005f82] text-slate-900 transition-all"
                  />

                  {/* Dropdown de sélection */}
                  {showResourceDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 shadow-lg max-h-60 overflow-y-auto">
                      {filteredResources.length === 0 ? (
                        <div className="p-3 text-sm text-slate-500 text-center">
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
                              className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-slate-50 transition-colors ${
                                isSelected ? 'bg-[#005f82]/5' : ''
                              }`}
                            >
                              <div
                                className="w-3 h-3 shrink-0"
                                style={{ backgroundColor: cal.calendarcolor || '#005f82' }}
                              />
                              <span className={`flex-1 ${isSelected ? 'font-medium text-[#005f82]' : 'text-slate-700'}`}>
                                {calName}
                              </span>
                              {isSelected && (
                                <svg className="w-4 h-4 text-[#005f82]" fill="currentColor" viewBox="0 0 20 20">
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

                {/* Ressources sélectionnées (badges) */}
                {formData.calendar_sources && formData.calendar_sources.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {formData.calendar_sources.map(calId => {
                      const cal = calendars.find(c => String(c.id) === calId && c.description?.toLowerCase().includes("resource"));
                      if (!cal) return null;
                      const calName = cal.displayname || cal.defined_name || cal.share_href || 'Ressource';

                      return (
                        <span
                          key={calId}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 text-sm border border-amber-200"
                        >
                          <div
                            className="w-2 h-2"
                            style={{ backgroundColor: cal.calendarcolor || '#f59e0b' }}
                          />
                          <span className="font-medium">{calName}</span>
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
                            className="ml-1 hover:bg-amber-200 p-0.5 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

            {/* Dates et heures séparées */}
            <div className="space-y-5">
              {/* Dates */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Date de début <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      // Si la date de fin est vide ou antérieure, la synchroniser
                      if (!endDate || e.target.value > endDate) {
                        setEndDate(e.target.value);
                      }
                    }}
                    className="w-full px-4 py-3 text-base bg-white border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#005f82] focus:border-[#005f82] text-slate-900 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Date de fin <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate}
                    className="w-full px-4 py-3 text-base bg-white border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#005f82] focus:border-[#005f82] text-slate-900 transition-all"
                  />
                </div>
              </div>

              {/* Préréglages horaires */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-3">
                  Plage horaire
                </label>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                  <label className="flex items-center gap-2 px-3 py-2.5 bg-white border-2 border-slate-300 rounded-lg cursor-pointer hover:border-[#005f82] hover:bg-slate-50 transition-all has-checked:border-[#005f82] has-checked:bg-[#005f82]/5">
                    <input
                      type="radio"
                      name="timePreset"
                      checked={timePreset === 'morning'}
                      onChange={() => handleTimePreset('morning')}
                      className="text-[#005f82] focus:ring-[#005f82]"
                    />
                    <span className="text-sm flex-1">
                      <span className="font-semibold block">Matinée</span>
                      <span className="text-slate-500 text-xs">9h - 12h30</span>
                    </span>
                  </label>

                  <label className="flex items-center gap-2 px-3 py-2.5 bg-white border-2 border-slate-300 rounded-lg cursor-pointer hover:border-[#005f82] hover:bg-slate-50 transition-all has-checked:border-[#005f82] has-checked:bg-[#005f82]/5">
                    <input
                      type="radio"
                      name="timePreset"
                      checked={timePreset === 'afternoon'}
                      onChange={() => handleTimePreset('afternoon')}
                      className="text-[#005f82] focus:ring-[#005f82]"
                    />
                    <span className="text-sm flex-1">
                      <span className="font-semibold block">Après-midi</span>
                      <span className="text-slate-500 text-xs">14h - 18h</span>
                    </span>
                  </label>

                  <label className="flex items-center gap-2 px-3 py-2.5 bg-white border-2 border-slate-300 rounded-lg cursor-pointer hover:border-[#005f82] hover:bg-slate-50 transition-all has-checked:border-[#005f82] has-checked:bg-[#005f82]/5">
                    <input
                      type="radio"
                      name="timePreset"
                      checked={timePreset === 'fullday'}
                      onChange={() => handleTimePreset('fullday')}
                      className="text-[#005f82] focus:ring-[#005f82]"
                    />
                    <span className="text-sm flex-1">
                      <span className="font-semibold block">Journée</span>
                      <span className="text-slate-500 text-xs">9h - 17h30</span>
                    </span>
                  </label>

                  <label className="flex items-center gap-2 px-3 py-2.5 bg-white border-2 border-slate-300 cursor-pointer hover:border-[#005f82] hover:bg-slate-50 transition-all has-checked:border-[#005f82] has-checked:bg-[#005f82]/5">
                    <input
                      type="radio"
                      name="timePreset"
                      checked={timePreset === 'custom'}
                      onChange={() => setTimePreset('custom')}
                      className="text-[#005f82] focus:ring-[#005f82]"
                    />
                    <span className="text-sm flex-1">
                      <span className="font-semibold block">Personnalisé</span>
                      <span className="text-slate-500 text-xs invisible">--</span>
                    </span>
                  </label>
                </div>

                {/* Champs d'heure */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Heure de début <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="time"
                      required
                      value={startTime}
                      onChange={(e) => handleTimeChange('start', e.target.value)}
                      className="w-full px-4 py-3 text-base bg-white border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#005f82] focus:border-[#005f82] text-slate-900 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Heure de fin <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="time"
                      required
                      value={endTime}
                      onChange={(e) => handleTimeChange('end', e.target.value)}
                      className="w-full px-4 py-3 text-base bg-white border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#005f82] focus:border-[#005f82] text-slate-900 transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Client et Affaire */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Recherche Client */}
              <div className="client-dropdown-container">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Client
                </label>

                {selectedClient ? (
                  <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex-1">
                      <div className="font-semibold text-slate-900">
                        {selectedClient.nom}
                      </div>
                      {(selectedClient.email || selectedClient.telephone) && (
                        <div className="text-sm text-slate-600">
                          {selectedClient.email && <span>{selectedClient.email}</span>}
                          {selectedClient.email && selectedClient.telephone && <span> • </span>}
                          {selectedClient.telephone && <span>{selectedClient.telephone}</span>}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedClient(null);
                        setSelectedAffair(null);
                        setClientSearchQuery('');
                        setAffairs([]);
                      }}
                      className="p-1 hover:bg-blue-200 rounded-full transition-colors"
                    >
                      <X className="w-4 h-4 text-blue-700" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Rechercher un client (min. 3 caractères)..."
                      value={clientSearchQuery}
                      onChange={(e) => setClientSearchQuery(e.target.value)}
                      onFocus={() => setShowClientDropdown(true)}
                      className="w-full px-4 py-3 text-base bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#005f82] focus:border-[#005f82] text-slate-900 transition-all"
                    />

                    {showClientDropdown && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {clientSearchLoading ? (
                          <div className="p-3 text-sm text-slate-500 text-center">
                            Recherche en cours...
                          </div>
                        ) : clientSearchQuery.length < 3 ? (
                          <div className="p-3 text-sm text-slate-500 text-center">
                            Saisissez au moins 3 caractères
                          </div>
                        ) : clients.length === 0 ? (
                          <div className="p-3 text-sm text-slate-500 text-center">
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
                              className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 transition-colors"
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
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Affaire
                </label>

                {!selectedClient ? (
                  <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-500">
                    Sélectionnez d&apos;abord un client
                  </div>
                ) : selectedAffair ? (
                  <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex-1">
                      <div className="font-semibold text-slate-900">{selectedAffair.nom}</div>
                      {selectedAffair.descriptif && (
                        <div className="text-sm text-slate-600">{selectedAffair.descriptif}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAffair(null);
                        setAffairSearchQuery('');
                      }}
                      className="p-1 hover:bg-green-200 rounded-full transition-colors"
                    >
                      <X className="w-4 h-4 text-green-700" />
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
                      className="w-full px-4 py-3 text-base bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#005f82] focus:border-[#005f82] text-slate-900 transition-all"
                    />

                    {showAffairDropdown && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {affairSearchLoading ? (
                          <div className="p-3 text-sm text-slate-500 text-center">
                            Recherche en cours...
                          </div>
                        ) : affairs.length === 0 ? (
                          <div className="p-3 text-sm text-slate-500 text-center">
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
                              className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 transition-colors"
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
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Description
              </label>
              <div className="border border-slate-300 focus-within:ring-1 focus-within:ring-[#005f82] focus-within:border-[#005f82] transition-shadow">
                <RichTextEditor
                  content={formData.description}
                  onChange={(newContent) => setFormData({ ...formData, description: newContent })}
                />
              </div>
            </div>
          </div>

          {/* Footer avec boutons */}
          <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 flex gap-3 shrink-0">
            <button
              type="submit"
              className="flex-1 bg-[#005f82] hover:bg-[#004a65] text-white font-semibold py-3 px-6 text-base transition-colors focus:outline-none focus:ring-2 focus:ring-[#005f82] focus:ring-offset-2 shadow-sm"
            >
              {task ? 'Mettre à jour' : 'Créer l\'événement'}
            </button>
            {task && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 text-base transition-colors focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 shadow-sm"
              >
                Supprimer
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="bg-white hover:bg-slate-100 text-slate-700 font-semibold py-3 px-6 text-base border border-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
            >
              Annuler
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
