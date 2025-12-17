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

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // ✅ Logging détaillé pour déboguer
    console.log('=== DEBUG TaskModal Submit ===');
    console.log('formData.calendar_source:', formData.calendar_source);
    console.log('Calendriers disponibles:', calendars.map(cal => ({
      id: cal.id,
      calendarid: cal.calendarid,
      displayname: cal.displayname,
      stringId: String(cal.id),
      stringCalendarId: String(cal.calendarid || cal.id)
    })));

    // Trouver le calendrier sélectionné dans le state global
    // ✅ Rechercher par id OU calendarid
    const selectedCalendar = calendars.find(
      cal => String(cal.id) === formData.calendar_source ||
             String(cal.calendarid) === formData.calendar_source
    );

    if (!selectedCalendar) {
      console.error('❌ Calendrier sélectionné non trouvé');
      console.error('Valeur recherchée:', formData.calendar_source);
      console.error('Calendriers disponibles:', calendars);

      // ✅ Fallback : utiliser le premier calendrier disponible
      if (calendars.length > 0) {
        console.warn('⚠️ Utilisation du premier calendrier par défaut');
        const fallbackCalendar = calendars[0];

        // Mettre à jour formData pour la prochaine fois
        setFormData({ ...formData, calendar_source: String(fallbackCalendar.id) });

        // Utiliser ce calendrier
        const selectedCalendar = fallbackCalendar;

        // Continuer avec ce calendrier
        console.log('✅ Calendrier de secours utilisé:', selectedCalendar);
        submitWithCalendar(selectedCalendar);
        return;
      }

      // Si vraiment aucun calendrier, impossible de continuer
      alert('Aucun calendrier disponible. Veuillez créer ou activer un calendrier.');
      return;
    }

    submitWithCalendar(selectedCalendar);
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
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex-shrink-0">
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
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Calendrier <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.calendar_source}
                  onChange={(e) => setFormData({ ...formData, calendar_source: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-base bg-white border border-slate-300 focus:outline-none focus:ring-1 focus:ring-[#005f82] focus:border-[#005f82] text-slate-900 transition-shadow"
                >
                  {calendars.map(cal => {
                    const calId = String(cal.id);
                    const calName = cal.displayname || 'Calendrier';
                    return (
                      <option key={calId} value={calId}>
                        {calName}
                      </option>
                    );
                  })}
                </select>
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
