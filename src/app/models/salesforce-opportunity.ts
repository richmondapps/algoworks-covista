/**
 * V17.3 Data Contract: Salesforce Opportunities & Unified Event Ledger
 */

export interface SalesforceOpportunityProfile {
    id?: string; // Maps to Firestore document ID natively (student_id)
    student_id: string;
    student_name: string;
    institution: string;
    program: string;
    program_name: string;
    term_code: string;
    term_desc: string;
    status_stage: string;
    enrollment_specialist_name: string;

    program_start_date: string | null;  // ISO Date Strings preferred for raw ingress mapping
    reserve_date: string | null;
    census_date: string | null;
    funding_type: string;

    time_to_program_start_days: number | null;
    time_since_reserve_days: number | null;

    last_updated_at: string | null;

    // Contingency
    contingency_document_flag?: boolean;
    institution_name?: string;
    institution_name_text?: string;
    contingency_description?: string;

    // AI Payload Output Destination (Mapped later by the asynchronous Eventarc Agent)
    aiInsights?: {
        readinessLevel?: { level: 'High' | 'Medium' | 'Low' | string; text: string; trendDirection?: 'up' | 'down' | 'stable' | string; trendNote?: string; };
        engagementLevel?: { level: 'High' | 'Medium' | 'Low' | string; text: string; trendDirection?: 'up' | 'down' | 'stable' | string; trendNote?: string; };
        metrics?: {
            timeSinceReserve: string;
            timeToProgramStart: string;
            timeToCensus: string;
        };
        nextBestActions?: { title: string; points: string[]; urgent: boolean; }[];
        emailDraft?: { subject: string; bodyText: string; bullets: string[]; };
        smsDraft?: string;
        generatedAt?: string;
        
        // Legacy fallbacks
        overview?: any; 
        riskSignals?: any;
    };
    isGeneratingAi?: boolean;
}

export interface SalesforceActivityLog {
    log_id: string; // Document ID of the Subcollection Element
    student_id: string;
    term_code: string;

    activity_category: string;
    activity_name: string;
    activity_datetime: string | null;

    // Task / Interaction 
    communication_type?: string | null;     // Phone, Email, Text, Chat, File Review
    task_notes?: string | null;
    task_comments?: string | null;
    interaction_direction?: string | null;  // inbound, outbound

    // Case Management
    case_number?: string | null;
    case_subject?: string | null;
    case_record_type?: string | null;
    case_type?: string | null;
    case_subtype?: string | null;
    case_status?: string | null;            // open, in_progress, pending, resolved, closed
    case_closed_reason?: string | null;
    case_closed_datetime?: string | null;
    case_created_date?: string | null;
    case_comments?: string | null;

    // Source Telemetry
    actor?: string | null; // student, enrollment_specialist, system
    source_system?: string | null;
    last_updated_timestamp: string | null;

    // Course Context
    course_identification?: string | null;
    course_level?: string | null;
    course_status?: string | null;
    is_accredited?: boolean | null;
}

export interface SalesforcePersonalizedChecklist {
    requirement_id: string;      // e.g., 'fafsa_submission', 'initial_portal_login'
    student_id: string;
    
    // Core Identity
    requirement_name: string;    // "Funding - FAFSA Submission"
    requirement_type: string;    // "Checklist" or "Contingency"
    is_personalized: boolean;    // false = Common for all, true = Student specific
    
    // Live State
    is_satisfied: boolean;       
    satisfied_at: string | null; 

    // Risk Vector Definitions (Bound via CSV)
    risk_thresholds: {
        happy_path_rule: string | null;
        low_risk_rule: string | null;
        medium_risk_rule: string | null;
        high_risk_rule: string | null;
    };
    
    // Evaluated Intelligence Engine State
    current_risk_level: 'Happy Path' | 'Low Risk' | 'Medium Risk' | 'High Risk' | 'Cleared' | 'Pending'; 
    
    // Telemetry
    notes: string | null;
    last_evaluated_timestamp: string;
}
