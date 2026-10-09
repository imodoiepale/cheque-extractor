// Minimal command palette state — module-level event emitter to avoid
// adding zustand as a dependency.

type CommandStore = {
  isOpen: boolean;
};

let _state: CommandStore = { isOpen: false };
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((l) => l());
}

export const commandPaletteStore = {
  getState: () => _state,
  open: () => {
    _state = { isOpen: true };
    notify();
  },
  close: () => {
    _state = { isOpen: false };
    notify();
  },
  subscribe: (fn: () => void) => {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  },
};

// React hook
import { useEffect, useState } from "react";

export function useCommandPalette() {
  const [state, setState] = useState(_state);

  useEffect(() => {
    const unsub = commandPaletteStore.subscribe(() => setState({ ..._state }));
    return () => { unsub(); };
  }, []);

  return {
    isOpen: state.isOpen,
    open: commandPaletteStore.open,
    close: commandPaletteStore.close,
  };
}
