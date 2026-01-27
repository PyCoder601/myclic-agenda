'use client';

import { Copy, Trash2, Edit } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface EventContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export default function EventContextMenu({
  x,
  y,
  onClose,
  onEdit,
  onDuplicate,
  onDelete,
}: EventContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Ajuster la position du menu si nécessaire pour rester à l'écran
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      if (rect.right > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
      }

      if (rect.bottom > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 10;
      }

      menuRef.current.style.left = `${adjustedX}px`;
      menuRef.current.style.top = `${adjustedY}px`;
    }
  }, [x, y]);

  const menuItems = [
    {
      label: 'Modifier',
      icon: Edit,
      onClick: () => {
        onEdit();
        onClose();
      },
      color: 'text-blue-600 hover:bg-blue-50',
    },
    {
      label: 'Dupliquer',
      icon: Copy,
      onClick: () => {
        onDuplicate();
        onClose();
      },
      color: 'text-green-600 hover:bg-green-50',
    },
    {
      label: 'Supprimer',
      icon: Trash2,
      onClick: () => {
        onDelete();
        onClose();
      },
      color: 'text-red-600 hover:bg-red-50',
    },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed bg-white rounded-lg shadow-2xl border border-gray-200 py-1 min-w-[180px] z-[300] animate-in fade-in zoom-in duration-150"
      style={{ left: x, top: y }}
    >
      {menuItems.map((item, index) => (
        <button
          key={index}
          onClick={item.onClick}
          className={`w-full px-4 py-2.5 text-left flex items-center gap-3 transition-all ${item.color}`}
        >
          <item.icon className="w-4 h-4" />
          <span className="text-sm font-medium">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
