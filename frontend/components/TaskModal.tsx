'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Task } from '@/lib/types';
import RichTextEditor from './RichTextEditor';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { fetchCalendars } from '@/store/calendarSlice';

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

  // États pour la recherche et le dropdown
  const [searchQuery, setSearchQuery] = useState('');
  const [showCalendarDropdown, setShowCalendarDropdown] = useState(false);

  // Filtrer les calendriers selon la recherche
  const filteredCalendars = calendars.filter(cal => {
    const calName = (cal.defined_name || cal.share_href || cal.displayname || '').toLowerCase();
    return calName.includes(searchQuery.toLowerCase());
  });

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
        calendar_sources: [calendarSourceId], // Pour la sélection multiple
      };
    }
    
    const baseDate = initialDate ? new Date(initialDate) : new Date();
    const currentTime = new Date();

    // Si initialDate contient déjà une heure/minute spécifique, les utiliser
    const start = new Date(baseDate);
    if (initialHour !== undefined) {
      // Si initialHour est fourni séparément (ancien comportement), l'utiliser avec minutes = 0
      start.setHours(initialHour, 0, 0, 0);
    } else if (initialDate && (initialDate.getHours() !== 0 || initialDate.getMinutes() !== 0)) {
      // Si initialDate a déjà une heure/minute spécifique (nouveau comportement), les préserver
      // Ne rien faire, on garde l'heure/minute de initialDate
      console.log(`📅 Préservation de l'heure: ${initialDate.getHours()}:${initialDate.getMinutes()}`);
    } else {
      // Sinon, utiliser l'heure actuelle avec minutes = 0
      start.setHours(currentTime.getHours(), 0, 0, 0);
    }

    const end = new Date(start);
    end.setTime(start.getTime() + 60 * 60 * 1000); // +1 heure

    // ✅ Utiliser le premier calendrier disponible comme défaut
    const defaultCalendarSource = calendars.length > 0
      ? String(calendars[0].id)
      : '';

    return {
      title: '',
      description: '',
      location: '',
      start_date: formatDateTimeLocal(start),
      end_date: formatDateTimeLocal(end),
      calendar_source: defaultCalendarSource,
      calendar_sources: [defaultCalendarSource], // Pour la sélection multiple
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

      // Réinitialiser la recherche
      setSearchQuery('');
      setShowCalendarDropdown(false);

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
    };

    if (showCalendarDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showCalendarDropdown]);

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

  const submitWithCalendar = (selectedCalendar: any) => {

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
      // ✅ IMPORTANT : Inclure l'URL de l'événement pour les mises à jour
      ...(task && { url: task.url }),
    });
    onClose();
  };

  const submitWithMultipleCalendars = (selectedCalendars: any[]) => {
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
      <div className="bg-white max-w-2xl w-full max-h-[85vh] overflow-hidden shadow-xl border border-slate-200/80 flex flex-col">
        {/* Header compact */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-linear-to-r from-slate-50 to-white flex-shrink-0">
          <h2 className="text-xl font-bold text-[#005f82] flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {task ? 'Modifier l\'événement' : 'Nouvel événement'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-700 rounded"
            type="button"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Formulaire avec scroll */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
          <div className="p-5 space-y-4">
            {/* Titre */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Titre <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3.5 py-2.5 text-base bg-white border border-slate-300 focus:outline-none focus:ring-1 focus:ring-[#005f82] focus:border-[#005f82] text-slate-900 transition-shadow"
                placeholder="Ex: Réunion d'équipe"
              />
            </div>

            {/* Grille compacte : Lieu + Calendrier */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Lieu
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-base bg-white border border-slate-300 focus:outline-none focus:ring-1 focus:ring-[#005f82] focus:border-[#005f82] text-slate-900 transition-shadow"
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
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Calendrier(s) <span className="text-red-500">*</span>
                </label>

                {/* Champ de recherche */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Rechercher et sélectionner des calendriers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setShowCalendarDropdown(true)}
                    className="w-full px-3.5 py-2.5 text-base bg-white border border-slate-300 focus:outline-none focus:ring-1 focus:ring-[#005f82] focus:border-[#005f82] text-slate-900"
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
                                className="w-3 h-3 rounded-full shrink-0"
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
                      const cal = calendars.find(c => String(c.id) === calId);
                      if (!cal) return null;
                      const calName = cal.defined_name || cal.share_href || cal.displayname || 'Calendrier';

                      return (
                        <span
                          key={calId}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#005f82]/10 text-[#005f82] text-sm rounded-full"
                        >
                          <div
                            className="w-2 h-2 rounded-full"
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
                            className="ml-1 hover:bg-[#005f82]/20 rounded-full p-0.5 transition-colors"
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

            {/* Dates compactes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Début <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-base bg-white border border-slate-300 focus:outline-none focus:ring-1 focus:ring-[#005f82] focus:border-[#005f82] text-slate-900 transition-shadow"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Fin <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-base bg-white border border-slate-300 focus:outline-none focus:ring-1 focus:ring-[#005f82] focus:border-[#005f82] text-slate-900 transition-shadow"
                />
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
          <div className="border-t border-slate-200 bg-slate-50 px-5 py-3.5 flex gap-2.5 flex-shrink-0">
            <button
              type="submit"
              className="flex-1 bg-[#005f82] hover:bg-[#004a65] text-white font-medium py-2.5 px-5 text-base transition-colors focus:outline-none focus:ring-2 focus:ring-[#005f82] focus:ring-offset-2"
            >
              {task ? 'Mettre à jour' : 'Créer l\'événement'}
            </button>
            {task && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 px-5 text-base transition-colors focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
              >
                Supprimer
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="bg-white hover:bg-slate-100 text-slate-700 font-medium py-2.5 px-5 text-base border border-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
            >
              Annuler
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
