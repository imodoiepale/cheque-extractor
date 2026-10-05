'use client';

import { AlertTriangle } from 'lucide-react';
import { Sheet } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

/**
 * Destructive confirmation.
 *
 * Slides up from the bottom, with Cancel as a SEPARATE group below the
 * destructive action (DESIGN-SYSTEM 5.8). That separation is what makes the
 * two read as "commit" and "back out" without reading the words — a centred
 * dialog with two adjacent buttons does not.
 *
 * The sheet translates from 110%, not 100%, so its shadow clears the viewport.
 */
export function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Delete',
  cancelText = 'Cancel',
}: DeleteConfirmModalProps) {
  return (
    <Sheet
      open={isOpen}
      onClose={onClose}
      side="bottom"
      hideClose
      className="mx-auto max-w-md pb-5 sm:bottom-6 sm:inset-x-6 sm:rounded-modal"
      title={
        <span className="flex items-center gap-2">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-error-bg"
            aria-hidden
          >
            <AlertTriangle className="h-4 w-4 text-error-text" />
          </span>
          {title}
        </span>
      }
      description={message}
      footer={
        <div className="flex flex-col gap-3">
          <Button
            variant="destructive"
            block
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmText}
          </Button>
          {/* Separate group: backing out is not one of the actions. */}
          <Button variant="ghost" block onClick={onClose}>
            {cancelText}
          </Button>
        </div>
      }
    />
  );
}

export default DeleteConfirmModal;
