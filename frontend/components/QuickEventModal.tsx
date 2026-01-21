'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Clock, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface QuickEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateQuick: (title: string, startDate: Date, endDate: Date) => void;
  onOpenFullModal: () => void;
  initialDate: Date;
  initialHour?: number;
  position?: { x: number; y: number };
}

export default function QuickEventModal({
  isOpen,
  onClose,
  onCreateQuick,
  onOpenFullModal,
  initialDate,
  initialHour = 9,
  position,
}: QuickEventModalProps) {
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState(`${initialHour.toString().padStart(2, '0')}:00`);
  const [endTime, setEndTime] = useState(`${(initialHour + 1).toString().padStart(2, '0')}:00`);

  const modalRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const timeoutId = setTimeout(() => {
        setTitle('');
        setStartTime(`${initialHour.toString().padStart(2, '0')}:00`);
        setEndTime(`${(initialHour + 1).toString().padStart(2, '0')}:00`);
        titleInputRef.current?.focus();
      }, 0);

      return () => clearTimeout(timeoutId);
    }
  }, [isOpen, initialDate, initialHour]);

  // Fermer si clic à l'extérieur
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Gestion de la touche Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    // Construire les dates complètes avec la date initiale
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);

    const startDate = new Date(initialDate);
    startDate.setHours(startHour, startMinute, 0, 0);

    const endDate = new Date(initialDate);
    endDate.setHours(endHour, endMinute, 0, 0);

    onCreateQuick(title, startDate, endDate);
    onClose();
  };

  const handleMoreOptions = () => {
    onClose();
    onOpenFullModal();
  };

  if (!isOpen) return null;

  // Calculer la position du modal
  const modalStyle: React.CSSProperties = position
    ? {
        position: 'fixed',
        left: `${Math.min(position.x, window.innerWidth - 340)}px`,
        top: `${Math.min(position.y, window.innerHeight - 200)}px`,
        zIndex: 100,
      }
    : {
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 100,
      };

  return (
    <div
      ref={modalRef}
      style={modalStyle}
      className="bg-white rounded-xl shadow-2xl border border-slate-200/60 w-[330px] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
    >
      {/* Header avec date */}
      <div className="px-4 py-2.5 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-slate-800">Nouvel événement</h3>
            <p className="text-xs text-slate-500 capitalize leading-snug">
              {format(initialDate, 'EEE d MMM yyyy', { locale: fr })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-100 rounded"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-4 space-y-2.5">
        {/* Titre sans bordure */}
        <input
          ref={titleInputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ajouter un titre..."
          className="w-full px-3 py-2 text-sm font-medium bg-slate-50 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#005f82]/20 transition-all placeholder:text-slate-400"
          required
        />

        {/* Horaires */}
        <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="shrink-0">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#005f82] to-[#007ba8] flex items-center justify-center shadow-sm">
                <Clock className="w-4 h-4 text-white" />
              </div>
            </div>
            <div className="flex-1 flex items-center gap-2">
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="flex-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#005f82]/30 focus:border-[#005f82] transition-all"
                required
              />
              <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="flex-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#005f82]/30 focus:border-[#005f82] transition-all"
                required
              />
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 pt-1.5">
          <button
            type="button"
            onClick={handleMoreOptions}
            className="flex-1 px-3 py-2 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-all hover:border-slate-300"
          >
            Plus d&apos;options
          </button>
          <button
            type="submit"
            disabled={!title.trim()}
            className="flex-1 px-3 py-2 text-xs font-bold text-white bg-gradient-to-r from-[#005f82] to-[#007ba8] hover:from-[#004d66] hover:to-[#006690] rounded-lg transition-all shadow-md shadow-[#005f82]/20 hover:shadow-lg hover:shadow-[#005f82]/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            Créer
          </button>
        </div>
      </form>
    </div>
  );
}
