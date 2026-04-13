export interface ChecklistItem {
    id: string;
    name: string; // "College Transcripts", "Financial aid documents"
    status: 'Complete' | 'Pending' | 'Missing';
    dueDate: string; // ISO string for ease
}

// ---------------------------------------------------------------
// Subcollection: personalized_checklists/{checklist_id}
// ---------------------------------------------------------------
export interface PersonalizedChecklist {
    checklist_id: string;
    student_id: string;
    item_name: string;
    category: string;
    is_satisfied: boolean;
    due_date?: string | null;
    completed_at?: string | null;
    source?: string;
}

// ---------------------------------------------------------------
// Subcollection: activity_logs/{log_id}
// ---------------------------------------------------------------
export interface StudentActivityLog {
    log_id: string;
    student_id: string;
    term_code?: string;
    activity_category: 'Enrollment' | 'Financial Aid' | 'Academic' | 'Engagement' | 'SystemEvent' | string;
    activity_name: string;
    activity_datetime: string | null;
    communication_type?: 'Phone' | 'Email' | 'Text' | 'Chat' | 'File Review' | null;
    task_notes?: string | null;
    task_comments?: string | null;
    interaction_direction?: 'inbound' | 'outbound' | null;
    case_number?: string | null;
    case_status?: string | null;
}

// ---------------------------------------------------------------
// Subcollection: ai_insights/latest
// ---------------------------------------------------------------
export interface AiOutputsLatest {
    generatedAt: string;
    overviewSummary?: string;
    readinessRisk?: { level: string; trendDirection?: string; trendNote?: string };
    engagementRisk?: { level: string; trendDirection?: string; trendNote?: string };
    metrics?: { timeSinceReserve: string; timeToProgramStart: string; timeToCensus: string };
    nextBestActions: { title: string; urgent: boolean; points: string[]; buttonText: string }[];
    emailDraft?: { subject?: string; bodyText: string; bullets: string[] };
    smsDraft?: string;
    agentTrace?: { agentName: string; action: string; status: string; duration: string; timestamp: string }[];
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
    dataContext?: any;
    overviewSummary?: string;
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
    dynamicTranscripts?: {name: string; valid: boolean;}[];
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
    /** Root-level AI summary fields — written by Cloud Function for dashboard filtering */
    readinessLevel?: 'High' | 'Medium' | 'Low' | null;
    engagementLevel: 'High' | 'Medium' | 'Low';
    riskIndicator: 'High' | 'Medium' | 'Low';
    recommendedActions: RecommendedAction[];
    stats: StudentStats;
    actionRequired: boolean; // For pub/sub filtering
    isGeneratingAi?: boolean;
    lastAiError?: string | null;
    syncTimestamp?: number | null;
    aiInsights?: AiInsights;  // backward compat — use aiOutputs for new code
    notes?: StudentNote[];
    communications?: CommunicationLog[];
}
