'use client';

import {createSlice, createAsyncThunk, PayloadAction} from '@reduxjs/toolkit';
import api from '@/lib/api';
import {User, AuthResponse, Application} from '@/lib/types';

interface AuthState {
    user: User | null;
    application: Application | null;
    loading: boolean;
    error: string | null;
    token: string | null;
}

const initialState: AuthState = {
    user: null,
    application: null,
    loading: true,
    error: null,
    token: null,
};

export const checkAuth = createAsyncThunk('auth/checkAuth', async (_, {rejectWithValue}) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        try {
            const response = await api.get('/auth/profile/');
            return {user: response.data, token};
        } catch {
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            return rejectWithValue('Token expired or invalid');
        }
    }
    return rejectWithValue('No token found');
});

export const login = createAsyncThunk(
    'auth/login',
    async ({email, password}: { email: string; password: string }, {rejectWithValue}) => {
        try {
            const response = await api.post<AuthResponse>('/auth/login/', {email, password});
            const {user, application, access, refresh} = response.data;
            localStorage.setItem('access_token', access);
            localStorage.setItem('refresh_token', refresh);
            return {user, application, token: access};
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: string } } };
            return rejectWithValue(error.response?.data?.error || 'Erreur de connexion');
        }
    }
);

export const signup = createAsyncThunk(
    'auth/signup',
    async (
        {username, email, password, prenom, nom}: {
            username: string;
            email: string;
            password: string;
            prenom?: string;
            nom?: string;
        },
        {rejectWithValue}
    ) => {
        try {
            const response = await api.post<AuthResponse>('/auth/signup/', {
                username,
                email,
                password,
                prenom,
                nom,
            });
            const {user, access, refresh} = response.data;
            localStorage.setItem('access_token', access);
            localStorage.setItem('refresh_token', refresh);
            return {user, token: access};
        } catch (err: unknown) {
            const error = err as { response?: { data?: { username?: string[]; email?: string[] } } };
            return rejectWithValue(error.response?.data?.username?.[0] || error.response?.data?.email?.[0] || "Erreur lors de l'inscription");
        }
    }
);

const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        logout: (state) => {
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            state.user = null;
            state.token = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(checkAuth.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(checkAuth.fulfilled, (state, action: PayloadAction<{ user: User; token: string }>) => {
                state.user = action.payload.user;
                state.token = action.payload.token;
                state.loading = false;
            })
            .addCase(checkAuth.rejected, (state) => {
                state.loading = false;
                state.user = null;
                state.token = null;
            })
            .addCase(login.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(login.fulfilled, (state, action: PayloadAction<{ user: User; application: Application; token: string }>) => {
                state.user = action.payload.user;
                state.application = action.payload.application;
                state.token = action.payload.token;
                state.loading = false;
            })
            .addCase(login.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            })
            .addCase(signup.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(signup.fulfilled, (state, action: PayloadAction<{ user: User; token: string }>) => {
                state.user = action.payload.user;
                state.token = action.payload.token;
                state.loading = false;
            })
            .addCase(signup.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload as string;
            });
    },
});

export const {logout} = authSlice.actions;

export default authSlice.reducer;
