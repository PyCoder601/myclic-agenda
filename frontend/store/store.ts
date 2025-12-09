import {configureStore} from '@reduxjs/toolkit';
import authReducer from './authSlice';
import calendarReducer from './calendarSlice';

export const store = configureStore({
    reducer: {
        auth: authReducer,
        calendar: calendarReducer,
    },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
