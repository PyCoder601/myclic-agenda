'use client';

import { X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  itemName?: string;
  itemDetails?: string;
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  variant = 'danger',
  itemName,
  itemDetails,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const buttonClasses = variant === 'danger'
    ? 'bg-red-500 hover:bg-red-600'
    : 'bg-orange-500 hover:bg-orange-600';

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[200]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl p-5 max-w-sm mx-4 border border-gray-200 animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center mb-4">
          <h3 className="font-semibold text-lg text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500 mt-1">{message}</p>
        </div>

        {(itemName || itemDetails) && (
          <div className="bg-gray-50 rounded-lg p-3 mb-4 text-center">
            {itemName && <p className="text-sm font-medium text-gray-900">{itemName}</p>}
            {itemDetails && <p className="text-xs text-gray-500 mt-1">{itemDetails}</p>}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-all"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg transition-all shadow-sm ${buttonClasses}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

interface RecurrenceConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmSingle: () => void;
  onConfirmAll: () => void;
}

export function RecurrenceConfirmDialog({
  isOpen,
  onClose,
  onConfirmSingle,
  onConfirmAll,
}: RecurrenceConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[200]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl p-5 max-w-sm mx-4 border border-gray-200 animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center mb-4">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-3">
            <X className="w-6 h-6 text-red-500" />
          </div>
          <h3 className="font-semibold text-lg text-gray-900">Supprimer l&apos;événement ?</h3>
          <p className="text-sm text-gray-500 mt-1">Choisissez l&apos;option de suppression</p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => {
              onConfirmSingle();
              onClose();
            }}
            className="w-full px-4 py-2.5 text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg transition-all"
          >
            Cette occurrence uniquement
          </button>
          <button
            onClick={() => {
              onConfirmAll();
              onClose();
            }}
            className="w-full px-4 py-2.5 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all shadow-sm"
          >
            Toutes les occurrences
          </button>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm font-medium border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-all"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
