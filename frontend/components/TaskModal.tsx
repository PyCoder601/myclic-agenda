'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Task, CalendarSource } from '@/lib/types';
import RichTextEditor from './RichTextEditor';
import { baikalAPI } from '@/lib/api';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Omit<Task, 'id' | 'created_at' | 'updated_at'>) => void;
  onDelete?: (id: number) => void;
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
  const [calendars, setCalendars] = useState<CalendarSource[]>([]);

  const [formData, setFormData] = useState(() => {
    if (task) {
      return {
        title: task.title,
        description: task.description || '',
        start_date: task.start_date.slice(0, 16),
        end_date: task.end_date.slice(0, 16),
        is_completed: task.is_completed,
        calendar_source: task.calendar_source || 'personal',
      };
    }
    
    const baseDate = initialDate ? new Date(initialDate) : new Date();
    const currentTime = new Date();
    const hour = initialHour !== undefined ? initialHour : currentTime.getHours();

    const start = new Date(baseDate);
    start.setHours(hour, 0, 0, 0);

    const end = new Date(start);
    end.setHours(hour + 1, 0, 0, 0);
    
    return {
      title: '',
      description: '',
      start_date: formatDateTimeLocal(start),
      end_date: formatDateTimeLocal(end),
      is_completed: false,
      calendar_source: 'personal',
    };
  });

  // Réinitialiser le formulaire quand le modal s'ouvre ou que les props changent
  useEffect(() => {
    if (isOpen) {
      // Charger les calendriers Baikal
      const fetchCalendars = async () => {
        try {
          const response = await baikalAPI.getCalendars();
          setCalendars(response.data);
        } catch (error) {
          console.error("Erreur lors de la récupération des calendriers:", error);
        }
      };
      fetchCalendars();
    }
  }, [isOpen]);

  // Mettre à jour le formulaire séparément
  useEffect(() => {
    if (!isOpen) return;

    if (task) {
      setFormData({
        title: task.title,
        description: task.description || '',
        start_date: task.start_date.slice(0, 16),
        end_date: task.end_date.slice(0, 16),
        is_completed: task.is_completed,
        calendar_source: String((task as any).calendar_id || task.calendar_source || 'personal'),
      });
    } else {
      const baseDate = initialDate ? new Date(initialDate) : new Date();
      const currentTime = new Date();
      const hour = initialHour !== undefined ? initialHour : currentTime.getHours();

      const start = new Date(baseDate);
      start.setHours(hour, 0, 0, 0);

      const end = new Date(start);
      end.setHours(hour + 1, 0, 0, 0);

      setFormData({
        title: '',
        description: '',
        start_date: formatDateTimeLocal(start),
        end_date: formatDateTimeLocal(end),
        is_completed: false,
        calendar_source: calendars.length > 0 ? String(calendars[0].calendarid || calendars[0].id) : 'personal',
      });
    }
  }, [isOpen, task, initialDate, initialHour, calendars]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const calendarSourceValue = formData.calendar_source === 'personal' 
      ? null 
      : Number(formData.calendar_source);

    onSave({
      ...formData,
      calendar_source: calendarSourceValue,
      start_date: new Date(formData.start_date).toISOString(),
      end_date: new Date(formData.end_date).toISOString(),
    });
    onClose();
  };

  const handleDelete = () => {
    if (task && onDelete) {
      onDelete(task.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-[#005f82] to-[#007ba8] bg-clip-text text-transparent">
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
                  const calId = String(cal.calendarid || cal.id);
                  const calName = cal.displayname || cal.name || cal.defined_name || 'Calendrier';
                  const username = cal.username || cal.user?.username || '';
                  return (
                    <option key={calId} value={calId}>
                      {calName} {username && `(${username})`}
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

          <div className="flex items-center p-4 bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl border border-slate-200">
            <input
              type="checkbox"
              id="completed"
              checked={formData.is_completed}
              onChange={(e) => setFormData({ ...formData, is_completed: e.target.checked })}
              className="w-5 h-5 text-[#005f82] bg-white border-slate-300 rounded focus:ring-[#005f82] cursor-pointer"
            />
            <label htmlFor="completed" className="ml-3 text-sm font-semibold text-slate-700 cursor-pointer">
              Événement terminé
            </label>
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

