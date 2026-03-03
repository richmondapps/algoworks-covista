export interface ChecklistItem {
    id: string;
    name: string; // "College Transcripts", "Financial aid documents"
    status: 'Complete' | 'Pending' | 'Missing';
    dueDate: string; // ISO string for ease
}

export interface RecommendedAction {
    id: string;
    title: string;
    description: string;
    priority: 'High' | 'Medium' | 'Low';
    type: 'Email' | 'SMS' | 'Call' | 'Review';
}

export interface StudentStats {
    emailsSent?: number;
    emailOpens: number;
    smsSent?: number;
    smsClicks: number;
    bestMethod: 'Email' | 'SMS';
    lastSentAt?: any;
    lastOpenedAt?: any;
    lastSmsSentAt?: any;
    avgOpenDelayMinutes?: number;
}

export interface Student {
    id: string;
    uid: string; // Firebase UID format
    name: string;
    email: string;
    phone: string;
    checklist: ChecklistItem[];
    timeSinceReserveDays: number;
    timeUntilClassStartDays: number;
    engagementLevel: 'High' | 'Medium' | 'Low';
    riskIndicator: 'High' | 'Medium' | 'Low';
    recommendedActions: RecommendedAction[];
    stats: StudentStats;
    actionRequired: boolean; // For pub/sub filtering
}
