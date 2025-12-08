export interface User {
    id: number;
    username: string;
    email: string;
    prenom: string;
    nom: string;
}

export interface CalendarShare {
    id: number;
    user: { id: number; username: string };
    permission: 'read' | 'write';
}

export interface CalendarSource {
    id: number;
    user?: { id: number; username: string };
    name?: string;
    calendar_url?: string;
    is_enabled?: boolean;
    color?: string;
    created_at?: string;
    updated_at?: string;
    shares?: CalendarShare[];
    // Champs spécifiques à Baikal
    calendarid?: number;
    principaluri?: string;
    username?: string;
    access?: number;
    displayname?: string;
    uri?: string;
    description?: string;
    calendarorder?: number;
    display?: number;
    defined_name?: string;
    user_id?: number;
}

export interface Task {
    id: number;
    title: string;
    description: string;
    is_completed: boolean;
    start_date: string;
    end_date: string;
    created_at?: string;
    updated_at?: string;
    caldav_uid?: string;
    caldav_etag?: string;
    last_synced?: string;
    calendar_source?: number | null;
    calendar_source_name?: string;
    calendar_source_color?: string;
    // Champs Baikal
    calendar_id?: number;
    uid?: string;
    etag?: string;
    uri?: string;
    lastmodified?: number;
}

export interface CalDAVConfig {
    id: number;
    username: string;
    calendar_name: string;
    sync_enabled: boolean;
    last_sync: string | null;
    created_at: string;
    updated_at: string;
    calendars?: CalendarSource[];
}

export interface AuthResponse {
    user: User;
    access: string;
    refresh: string;
}

export type ViewMode = 'day' | 'week' | 'month' | 'group';



