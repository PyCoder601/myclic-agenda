export interface User {
    id: number;
    username: string;
    email: string;
    prenom: string;
    nom: string;
}


export interface CalendarSource {
    id: number;
    calendarid?: number;
    displayname?: string;
    principaluri?: string;
    uri?: string;
    description?: string;
    calendarcolor?: string;
    access?: number;
    share_href?: string;
    share_displayname?: string;
    display?: boolean;
    user_id?: number;
}

export interface Task {
    id: number;
    title: string;
    description: string;
    location?: string;
    start_date: string;
    end_date: string;
    lastmodified?: number;
    url?: string; // ✅ URL complète CalDAV pour PATCH/DELETE
    calendar_source_name?: string;
    calendar_source_id: number | string;
    calendar_source_uri: number | string;
    calendar_source_color?: string;
    type?: 'agenda_event' | 'rappel_event';
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



