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
    aiInsights?: any;
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
