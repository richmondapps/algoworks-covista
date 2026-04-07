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

export interface AiInsights {
    generatedAt?: string;
    readinessRisk?: {
        level: string;
        text: string;
        trendDirection?: string;
        trendNote?: string;
    };
    engagementRisk?: {
        level: string;
        text: string;
        trendDirection?: string;
        trendNote?: string;
    };
    metrics?: {
        timeSinceReserve: string;
        timeToProgramStart: string;
        timeToCensus: string;
    };
    overview?: {
        intro: string;
        highlight: string;
        outro: string;
    };
    riskSignals?: {
        timeSinceReserve: string;
        timeUntilClassStart: string;
        engagementLevel: string;
        checklistProgress: string;
        riskIndicator: string;
    };
    nextBestActions: {
        title: string;
        urgent: boolean;
        points: string[];
        buttonText: string;
    }[];
    emailDraft?: {
        subject?: string;
        bodyText: string;
        bullets: string[];
    };
    smsDraft?: string;
    agentTrace?: {
        agentName: string;
        action: string;
        status: string;
        duration: string;
        timestamp: string;
    }[];
}

export interface StudentNote {
    text: string;
    timestamp: any;
    author: string;
}

export interface CommunicationLog {
    type: 'Email' | 'SMS';
    status: 'Sent' | 'Delivered' | 'Opened' | 'Clicked' | 'Failed';
    timestamp: any;
    body: string;
    agentName?: string;
}

export interface StudentRequirements {
    fafsaSubmitted: boolean;
    fundingPlan: boolean;
    courseRegistration: boolean;
    wwowOrientationStarted: boolean;
    officialTranscriptsReceived: boolean;
    nursingLicenseReceived: boolean;
    orientationStarted: boolean;
    firstAssignmentSubmitted: boolean;
    assignmentByCensusDay: boolean;
}

export interface Student {
    id: string;
    studentUid: string; // Firebase UID format natively captured
    name: string;
    email: string;
    phone: string;
    requirements: StudentRequirements;
    programStartDate?: string;
    reserveDate?: string;
    courseActivity?: {
        courseId: string;
        isAccredited: boolean;
        firstLoginAt?: string;
        firstDiscussionPostAt?: string;
    }[];
    timeSinceReserveDays?: number;
    timeUntilClassStartDays?: number;
    engagementLevel: 'High' | 'Medium' | 'Low';
    riskIndicator: 'High' | 'Medium' | 'Low';
    recommendedActions: RecommendedAction[];
    stats: StudentStats;
    actionRequired: boolean; // For pub/sub filtering
    aiInsights?: AiInsights;
    notes?: StudentNote[];
    communications?: CommunicationLog[];
}
