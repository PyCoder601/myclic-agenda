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
        start_date: task.start_date.slice(0, 16),
        end_date: task.end_date.slice(0, 16),
        calendar_source: calendarSourceId,
      };
    }
    
    const baseDate = initialDate ? new Date(initialDate) : new Date();
    const currentTime = new Date();
    const hour = initialHour !== undefined ? initialHour : currentTime.getHours();

    const start = new Date(baseDate);
    start.setHours(hour, 0, 0, 0);

    const end = new Date(start);
    end.setHours(hour + 1, 0, 0, 0);
    
    // ✅ Utiliser le premier calendrier disponible comme défaut
    const defaultCalendarSource = calendars.length > 0
      ? String(calendars[0].id)
      : '';

    return {
      title: '',
      description: '',
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
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-linear-to-r from-slate-50 to-blue-50">
          <h2 className="text-2xl font-bold bg-linear-to-r from-[#005f82] to-[#007ba8] bg-clip-text text-transparent">
            {task ? 'Modifier l\'événement' : 'Nouvel événement'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white rounded-xl transition-all text-slate-600 hover:text-slate-800"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Titre *
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#005f82] focus:border-transparent text-slate-800 font-medium transition-all"
              placeholder="Titre de l'événement"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Calendrier
            </label>
            <div className="relative">
              <select
                value={formData.calendar_source}
                onChange={(e) => setFormData({ ...formData, calendar_source: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#005f82] focus:border-transparent text-slate-800 font-medium transition-all appearance-none"
              >
                {calendars.map(cal => {
                  // ✅ Toujours utiliser cal.id comme valeur pour uniformité
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

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Description
            </label>
            <RichTextEditor
              content={formData.description}
              onChange={(newContent) => setFormData({ ...formData, description: newContent })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Date et heure de début *
              </label>
              <input
                type="datetime-local"
                required
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#005f82] focus:border-transparent text-slate-800 font-medium transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Date et heure de fin *
              </label>
              <input
                type="datetime-local"
                required
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#005f82] focus:border-transparent text-slate-800 font-medium transition-all"
              />
            </div>
          </div>



          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-gradient-to-r from-[#005f82] to-[#007ba8] hover:shadow-lg text-white font-semibold py-3 px-4 rounded-xl transition-all hover:scale-105 active:scale-95"
            >
              {task ? 'Mettre à jour' : 'Créer'}
            </button>
            {task && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                className="bg-gradient-to-r from-red-500 to-red-600 hover:shadow-lg text-white font-semibold py-3 px-4 rounded-xl transition-all hover:scale-105 active:scale-95"
              >
                Supprimer
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 px-4 rounded-xl transition-all border border-slate-200"
            >
              Annuler
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

