'use client';

import { useRef, useEffect } from 'react';
import { Provider } from 'react-redux';
import { store } from './store';
import { checkAuth } from './authSlice';

export default function StoreProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const ranOnce = useRef(false);

  useEffect(() => {
    if (!ranOnce.current) {
      store.dispatch(checkAuth());
      ranOnce.current = true;
    }
  }, []);

  return <Provider store={store}>{children}</Provider>;
}
