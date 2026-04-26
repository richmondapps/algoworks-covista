import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StudentService } from '../../services/student.service';
import {
  Student,
  RecommendedAction,
  AiOutputsLatest,
  PersonalizedChecklist,
  StudentActivityLog,
} from '../../models/student';
import { toSignal } from '@angular/core/rxjs-interop';
import { computed, signal } from '@angular/core';
import { getFunctions, httpsCallable } from '@angular/fire/functions';
import {
  Storage,
  ref,
  listAll,
  getDownloadURL,
  getMetadata,
  uploadString,
} from '@angular/fire/storage';
import { Firestore, collection, addDoc } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { effect } from '@angular/core';

@Component({
  selector: 'app-opportunity-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './opportunity-detail.component.html',
  styleUrl: './opportunity-detail.component.scss',
})
export class OpportunityDetailComponent {
  private route = inject(ActivatedRoute);
  private studentService = inject(StudentService);
  private firestore = inject(Firestore);
  private auth = inject(Auth);
  hoveredChecklist: string | null = null;

  private paramsStr = toSignal(this.route.paramMap);
  student = computed(() => {
    const p = this.paramsStr();
    return p ? this.studentService.getStudent(p.get('id')!) : undefined;
  });

  groupedCommunications = computed(() => {
    const s = this.student();
    if (!s || !s.communications) return [];

    const sorted = [...s.communications].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    const grouped: {
      type: string;
      body?: string;
      agentName?: string;
      events: { status: string; timestamp: string }[];
    }[] = [];

    let currentEmailThread: any = null;
    let currentSmsThread: any = null;

    for (const log of sorted) {
      if (log.type === 'Email') {
        if (log.status === 'Sent') {
          currentEmailThread = {
            type: 'Email',
            body: log.body,
            agentName: log.agentName,
            events: [{ status: log.status, timestamp: log.timestamp }],
          };
          grouped.push(currentEmailThread);
        } else if (currentEmailThread) {
          // Append Delivered/Opened/Clicked to the last email sent in the thread
          currentEmailThread.events.push({
            status: log.status,
            timestamp: log.timestamp,
          });
        } else {
          currentEmailThread = {
            type: 'Email',
            body: log.body,
            agentName: log.agentName,
            events: [{ status: log.status, timestamp: log.timestamp }],
          };
          grouped.push(currentEmailThread);
        }
      } else if (log.type === 'SMS') {
        if (log.status === 'Sent') {
          currentSmsThread = {
            type: 'SMS',
            body: log.body,
            agentName: log.agentName,
            events: [{ status: log.status, timestamp: log.timestamp }],
          };
          grouped.push(currentSmsThread);
        } else if (currentSmsThread) {
          currentSmsThread.events.push({
            status: log.status,
            timestamp: log.timestamp,
          });
        } else {
          currentSmsThread = {
            type: 'SMS',
            body: log.body,
            agentName: log.agentName,
            events: [{ status: log.status, timestamp: log.timestamp }],
          };
          grouped.push(currentSmsThread);
        }
      } else {
        grouped.push({
          type: log.type,
          body: log.body,
          agentName: log.agentName,
          events: [{ status: log.status, timestamp: log.timestamp }],
        });
      }
    }

    const statusOrder: { [key: string]: number } = {
      Sent: 1,
      Delivered: 2,
      Opened: 3,
      Clicked: 4,
      Failed: 5,
      Bounced: 6,
    };

    grouped.forEach((group) => {
      const uniqueEvents = new Map<
        string,
        { status: string; timestamp: string }
      >();
      for (const evt of group.events) {
        // Overwrites duplicate statuses chronologically, keeping only the latest occurrence
        uniqueEvents.set(evt.status, evt);
      }

      // Sort logically based on email flow instead of just timestamp
      group.events = Array.from(uniqueEvents.values()).sort((a, b) => {
        const orderA = statusOrder[a.status] || 99;
        const orderB = statusOrder[b.status] || 99;
        return orderA - orderB;
      });
    });

    // Return descending so newest is at top
    return grouped.reverse();
  });

  checklistProgress = computed(() => {
    const chks = this.checklists();
    if (!chks || chks.length === 0) return 0;

    const completed = chks.filter((chk) => chk.is_satisfied).length;
    return Math.round((completed / chks.length) * 100);
  });

  computedReadinessLevel = computed(() => {
    const chks = this.checklists();
    if (!chks || chks.length === 0) return 'Low';

    const s = this.student();
    const msInDay = 1000 * 60 * 60 * 24;
    const now = new Date();
    let timeToStart = 30;
    if (s?.programStartDate) {
      const pStart = new Date(s.programStartDate);
      timeToStart = (pStart.getTime() - now.getTime()) / msInDay;
    }

    // Default core count assumes all items are actionable
    let actionableCoreCount = chks.length;
    let satisfiedMax = chks.filter((chk) => chk.is_satisfied).length;

    // If program hasn't started, gracefully exempt course login/participation from the mathematical requirements
    if (timeToStart > 0) {
      actionableCoreCount -= 2; // Exempt Course Login and Class Participation from max denominator
      satisfiedMax = chks.filter(
        (chk) =>
          chk.is_satisfied &&
          chk.requirement_id !== 'logged_into_course' &&
          chk.requirement_id !== 'class_participation',
      ).length;
    }

    if (satisfiedMax >= actionableCoreCount) return 'High';
    if (satisfiedMax >= (actionableCoreCount / 2)) return 'Medium';
    return 'Low';
  });

  sortedNextBestActions = computed(() => {
    const i = this.insights();
    if (!i || !i.nextBestActions) return [];

    // Sort so urgent actions are strictly at the top, then slice to strictly max 3
    return [...i.nextBestActions]
      .sort((a, b) => {
        if (a.urgent && !b.urgent) return -1;
        if (!a.urgent && b.urgent) return 1;
        return 0;
      })
      .slice(0, 3);
  });

  calculateDaysDiff(
    dateString: string | undefined | null,
    isPast: boolean = false,
  ): string {
    if (!dateString) return 'N/A';
    try {
      // Split safely to enforce exact static local interpretation regardless of UTC boundaries
      const parts = dateString.split('T')[0].split('-');
      if (parts.length < 3) return 'N/A';

      const targetDateLocal = new Date(
        parseInt(parts[0], 10),
        parseInt(parts[1], 10) - 1,
        parseInt(parts[2], 10),
      );

      const now = new Date();
      const nowLocal = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );

      const diffMs = isPast
        ? nowLocal.getTime() - targetDateLocal.getTime()
        : targetDateLocal.getTime() - nowLocal.getTime();
      const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
      return days < 0 ? '0 days' : `${days} day${days === 1 ? '' : 's'}`;
    } catch {
      return 'N/A';
    }
  }

  selectedActivityModal = signal<StudentActivityLog | null>(null);
  selectedActivityName = signal<string>('');
  showAiPayloadModal = signal(false);

  aiPayloadDebug = computed(() => {
    const logs = this.activityLogs();
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const aggregatedSummary: any[] = [];
    const counters: { [key: string]: { count: number; latest: string } } = {};
    const allowedMultiple = [
      'email',
      'sms',
      'call',
      'wow_login',
      'course_login',
    ];

    logs.forEach((log) => {
      const dt = new Date(log.activity_datetime || 0);
      if (
        dt >= fourteenDaysAgo &&
        (log.interaction_direction === 'inbound' ||
          log.task_status === 'Received' ||
          log.task_status === 'Talked To' ||
          log.activity_category === 'Voicemail Received')
      ) {
        let key =
          log.communication_type?.toLowerCase() ||
          log.activity_name?.toLowerCase();
        if (!key) return;
        if (!counters[key]) {
          counters[key] = { count: 0, latest: '' };
        }
        if (allowedMultiple.includes(key)) {
          counters[key].count++;
        } else {
          counters[key].count = 1;
        }

        if (
          !counters[key].latest ||
          (log.activity_datetime &&
            log.activity_datetime > counters[key].latest)
        ) {
          counters[key].latest = log.activity_datetime || '';
        }
      }
    });

    for (const [key, data] of Object.entries(counters)) {
      aggregatedSummary.push({
        [key]: data.count,
        latest_datetime: data.latest,
      });
    }

    return aggregatedSummary;
  });

  viewActivity(requirementId: string, reqName?: string) {
    const mapping: Record<string, string[]> = {
      fafsa_submission: ['financial_aid_activity', 'document_submission'],
      funding: ['funding_plan_completed', 'document_submission'],
      course_registration: ['course_registration'],
      wwow_login: ['wow_login', 'wwow_login'],
      wow_login: ['wow_login', 'wwow_login'],
      initial_portal_login: ['course_login', 'portal_login'],
      logged_into_course: ['course_login', 'course_entry'],
      class_participation: [
        'course_participation',
        'initial_assignment_submission',
      ],
      contingencies: ['contingency_resolution', 'pending_contingency'],
    };

    const possibleNames = mapping[requirementId];
    if (!possibleNames) return;

    const logs = this.activityLogs();
    const targetLog = logs.find((log) =>
      possibleNames.includes(log.activity_name || ''),
    );

    this.selectedActivityName.set(
      reqName ||
        targetLog?.activity_name?.toUpperCase() ||
        'Activity Verification',
    );

    if (targetLog) {
      this.selectedActivityModal.set(targetLog);
    } else {
      let contextualReason =
        'Event was manually verified or fulfilled prior to digital tracking mechanisms.';

      if (requirementId === 'funding' && this.student()?.fundingType) {
        contextualReason = `Satisfied natively via Active Funding Demographic: ${this.student()?.fundingType}`;
      } else if (requirementId === 'reg' && this.student()?.status) {
        contextualReason = `Satisfied natively via CRM Student Pipeline Status: ${this.student()?.status}`;
      }

      let dt = this.student()?.syncTimestamp
        ? new Date(this.student()!.syncTimestamp!).toISOString()
        : null;

      this.selectedActivityModal.set({
        log_id: 'legacy',
        student_id: '',
        activity_category: 'SystemEvent',
        activity_name: reqName || contextualReason,
        activity_datetime: dt,
        task_status:
          this.student()?.status || 'Pre-existing Upstream Verification',
        communication_type: 'CRM Demographic Sync',
      } as any);
    }
  }

  safeFormatDate(dtStr: string | null | undefined): string {
    if (!dtStr) return 'N/A';
    try {
      // safely handle any weird SQL string like "2026-04-09 08:27:00"
      const normalized = dtStr.replace(' ', 'T').replace(' UTC', 'Z');
      const d = new Date(normalized);
      if (isNaN(d.getTime())) return dtStr;
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'UTC',
      });
    } catch {
      return dtStr;
    }
  }

  formatLevel(level?: string | null): string {
    if (!level) return 'Medium';
    let formatted =
      level.charAt(0).toUpperCase() + level.slice(1).toLowerCase();

    // Legacy mapping removed; backend now provides native Readiness Level correctly.
    return formatted;
  }

  alignDatesWithUI(text: string, student: Student): string {
    let correctedText = text;
    const actualDaysStr = this.calculateDaysDiff(student.reserveDate, true);
    const actualStartDaysStr = this.calculateDaysDiff(
      student.programStartDate,
      false,
    );
    const actualCensusDaysStr = this.calculateDaysDiff(
      student.censusDate,
      false,
    );

    // 1. Fix Timeframe Hallucination: Reserves (e.g. "Reserved 15 days ago", "reserved their spot just one day ago")
    correctedText = correctedText.replace(
      /(reserve[sd]?.*?)\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+days?\s+ago/gi,
      `$1${actualDaysStr} ago`,
    );

    // 2. Fix Timeframe Hallucination: Program Start (e.g. "there are 34 days until program start", "34 days before program start", "in 34 days")
    correctedText = correctedText.replace(
      /(\b(?:are|is)\b)\s+(?:only\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+days?\s+(?:until\s+program|before\s+program|to\s+program|until\s+start)/gi,
      `$1 ${actualStartDaysStr} until program`,
    );

    return correctedText;
  }

  formatNote(
    note: string | undefined | null,
    rawLevel: string | undefined | null,
  ): string {
    const defaultNote = 'Stable activity based on recent actions';
    if (!note) return defaultNote;

    const s = this.student();
    if (s) {
      return this.alignDatesWithUI(note, s);
    }
    return note;
  }

  formatSummary(summary: string | undefined | null, student: Student): string {
    const defaultSum =
      'System is actively calibrating a holistic summary matrix across both readiness parameters and active engagement metrics to provide a unified student success strategy.';
    if (!summary) return defaultSum;

    return this.alignDatesWithUI(summary, student);
  }

  isEditingContext = signal(false);
  isEditingEmail = signal(false);
  editEmail = signal('');
  editPhone = signal('');

  uploadedDocuments = signal<
    { name: string; url: string; createdAt?: string }[]
  >([]);
  private storage = inject(Storage);

  selectedDocForAi = signal<{ name: string; url: string } | null>(null);
  docQuery = signal('');
  docAiResponse = signal('');
  isQueryingDoc = signal(false);
  isGeneratingAi = signal(false);
  isGeneratingComms = signal(false);

  selectDocumentForAi(doc: { name: string; url: string }) {
    if (this.selectedDocForAi()?.name === doc.name) {
      this.selectedDocForAi.set(null); // toggle off
    } else {
      this.selectedDocForAi.set(doc);
      this.docAiResponse.set('');
      this.docQuery.set('');
    }
  }

  async queryDocumentAI() {
    const s = this.student();
    const doc = this.selectedDocForAi();
    const query = this.docQuery();
    if (!s || !doc || !query) return;

    this.isQueryingDoc.set(true);
    this.docAiResponse.set('');
    try {
      const result = await this.studentService.queryDocumentInfo(
        s.studentUid,
        doc.name,
        query,
      );
      if (result && result.answer) {
        this.docAiResponse.set(result.answer);
      } else {
        this.docAiResponse.set('No valid response gathered from document.');
      }
    } catch (e: any) {
      this.docAiResponse.set('Error: ' + e.message);
    } finally {
      this.isQueryingDoc.set(false);
    }
  }

  constructor() {
    effect(() => {
      const s = this.student();
      if (s) {
        this.loadDocuments(s.studentUid);
        this.loadSubcollections(s.id);
      }
    });
  }

  // ---------------------------------------------------------------
  // Subcollection signals (loaded lazily on detail page only)
  // ---------------------------------------------------------------
  aiOutputs = signal<AiOutputsLatest | null>(null);
  checklistsRaw = signal<PersonalizedChecklist[]>([]);

  checklists = computed<PersonalizedChecklist[]>(() => {
    const s = this.student();
    if (!s) return [];

    const req = s.requirements || {};
    const rawList = this.checklistsRaw();

    // Helper to safely resolve the literal subcollection state if it exists, otherwise fallback to legacy root prop
    const getStatus = (reqId: string, legacyFlag: any) => {
      const match = rawList.find((x) => x.requirement_id === reqId);
      if (match) return match.is_satisfied || false;
      return legacyFlag || false;
    };

    // Natively construct the Core UI checklist in the precise, prioritized custom order
    const list: PersonalizedChecklist[] = [];

    list.push({
      requirement_id: 'initial_portal_login',
      student_id: s.id,
      requirement_name: 'Initial Portal Login',
      is_satisfied: getStatus('initial_portal_login', req.initialPortalLogin),
    });
    list.push({
      requirement_id: 'fafsa_submission',
      student_id: s.id,
      requirement_name: 'FAFSA Submission (or Alternative Funding)',
      is_satisfied: getStatus('fafsa_submission', req.fafsaSubmitted),
    });
    list.push({
      requirement_id: 'course_registration',
      student_id: s.id,
      requirement_name: 'Course Registration',
      is_satisfied: getStatus('course_registration', req.courseRegistration),
    });

    const contingencyDoc: any = rawList.find(
      (x) => x.requirement_id === 'contingencies',
    );
    const institutionList: { name: string }[] =
      contingencyDoc?.contingency_institution_name || [];

    if (institutionList.length > 0) {
      const transcriptsSat =
        req.officialTranscriptsReceived || getStatus('cont_trans', false);

      institutionList.forEach((inst, idx) => {
        list.push({
          requirement_id: `cont_trans_${idx}`,
          student_id: s.id,
          requirement_name: `Contingency: ${inst.name} (Transcript)`,
          is_satisfied: transcriptsSat,
        } as any);
      });
    } else {
      // No Contingencies natively maps to fully satisfied
      list.push({
        requirement_id: 'contingencies',
        student_id: s.id,
        requirement_name: 'No Contingencies',
        is_satisfied: true,
      } as any);
    }

    list.push({
      requirement_id: 'wwow_login',
      student_id: s.id,
      requirement_name: 'WOW Login',
      is_satisfied: getStatus('wwow_login', req.wowOrientation),
    });

    list.push({
      requirement_id: 'logged_into_course',
      student_id: s.id,
      requirement_name: 'Course Login',
      is_satisfied: getStatus('logged_into_course', req.courseLogin),
    });
    list.push({
      requirement_id: 'class_participation',
      student_id: s.id,
      requirement_name: 'Course Participation',
      is_satisfied: getStatus('class_participation', req.classParticipation),
    });

    return list;
  });

  activityLogs = signal<StudentActivityLog[]>([]);
  isLoadingSubcollections = signal(false);

  recentActivitySummary = computed(() => {
    const logs = this.activityLogs();
    if (!logs || !logs.length)
      return { message: 'No recent logins or inbound engagements.' };

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    // Filter inbound / system events inside the 14 day window natively
    const validLogs = logs.filter((log) => {
      const dt = new Date(log.activity_datetime || 0);
      return (
        dt >= fourteenDaysAgo &&
        (log.interaction_direction === 'inbound' ||
          log.task_status === 'Received' ||
          log.task_status === 'Talked To' ||
          log.activity_category === 'Student Event')
      );
    });

    if (validLogs.length === 0)
      return { message: 'No recent logins or inbound engagements.' };

    // Find the absolute latest
    const latest = validLogs.sort(
      (a, b) =>
        new Date(b.activity_datetime || 0).getTime() -
        new Date(a.activity_datetime || 0).getTime(),
    )[0];

    let typeName = latest.activity_name;
    let descriptiveAction = 'Logged interaction';
    if (typeName === 'wow_login' || typeName === 'wwow_login')
      descriptiveAction = 'Logged into WOW Orientation';
    else if (typeName === 'course_login')
      descriptiveAction = 'Logged into course';
    else if (latest?.communication_type) {
      let friendlyType = latest.communication_type.replace(/_/g, ' ').toLowerCase();
      // capitalize first letter of each word
      friendlyType = friendlyType.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      descriptiveAction = `Engaged via ${friendlyType}`;
    } else if (typeName) {
      descriptiveAction = `Logged interaction: ${typeName}`;
    }

    return {
      message: descriptiveAction,
      date: latest.activity_datetime,
    };
  });

  recentReadinessSummary = computed(() => {
    const chks = this.checklists();
    if (!chks || chks.length === 0)
      return { message: 'Pending initial orientation steps.' };

    // Traverse the pre-sorted checklist dynamically backwards to locate the deepest milestone achieved natively
    const reversed = [...chks].reverse();
    const furthest = reversed.find(
      (c) => c.is_satisfied && c.requirement_id !== 'contingencies',
    );

    if (!furthest)
      return {
        message: 'No formal checklist components completed.',
        date: null,
      };

    // Intelligently scan the event trajectory to locate the explicit timeline of completion
    let resolvedDate: string | null = null;
    const logs = this.activityLogs();
    
    // Legacy mapper
    const mapping: Record<string, string[]> = {
      fafsa_submission: ['financial_aid_activity', 'document_submission'],
      funding: ['funding_plan_completed', 'document_submission'],
      course_registration: ['course_registration'],
      wwow_login: ['wow_login', 'wwow_login'],
      initial_portal_login: ['course_login', 'portal_login'],
      logged_into_course: ['course_login', 'course_entry'],
      class_participation: ['course_participation', 'initial_assignment_submission'],
      contingencies: ['contingency_resolution', 'pending_contingency'],
    };

    const targetEvents = mapping[furthest.requirement_id] || [furthest.requirement_id];
    let matchedEvent = logs.find(log => targetEvents.includes(String(log.activity_name).toLowerCase()));
    
    if (matchedEvent && matchedEvent.activity_datetime) {
      resolvedDate = matchedEvent.activity_datetime;
    } else {
      // Fallback safely by wrapping the numerical syncTimestamp into a string
      const syncNum = this.student()?.syncTimestamp;
      resolvedDate = syncNum ? new Date(syncNum).toISOString() : new Date().toISOString();
    }

    return {
      message: `Latest Milestone Achieved: ${furthest.requirement_name}`,
      date: resolvedDate,
    };
  });

  insights = computed(() => {
    const rootInsights = this.student()?.aiInsights || {};
    const subcollectionInsights = this.aiOutputs() || {};

    // Deep merge legacy root attributes with fresh subcollection outputs so decoupled communications aren't lost
    const merged =
      Object.keys(rootInsights).length ||
      Object.keys(subcollectionInsights).length
        ? ({ ...rootInsights, ...subcollectionInsights } as any)
        : null;

    if (merged) {
      // Ensure fallback native levels are computed gracefully
      merged.readinessLevel = merged.readinessLevel || 'Low';
      merged.engagementLevel = merged.engagementLevel || 'Low';

      if (
        merged.engagementLevel?.trendNote?.includes('No engagement activities')
      ) {
        // Force engagement into Low if there are no engagement activities
        merged.engagementLevel.level = 'Low';
      }
    }

    return merged;
  });

  private sanitizer = inject(DomSanitizer);

  formatActivityType(type: string | null | undefined, activityName?: string | null): string {
    if (!type) return '-';
    let t = type.toLowerCase().trim();
    
    // Normalize n to remove spaces and underscores to match broadly
    let n = (activityName || '').toLowerCase().replace(/_|\s+/g, '');

    // Enforce strict Data Dictionary taxonomy dynamically over legacy raw sync data
    const knownStudentEvents = [
      'wowlogin', 'wwowlogin', 'initialportallogin', 
      'fafsasubmission', 'alternatefundingsubmission', 
      'firstcourseregistration', 'loggedintocourse', 
      'discussionboardsubmission', 'coursedrop(dd)', 'coursedrop'
    ];

    if (knownStudentEvents.includes(n)) return 'Student Event';

    // Core literal mappings
    if (t === 'phone_call' || t === 'outbound_call' || t === 'inbound_call') return 'Phone';
    if (t === 'email') return 'Email';
    if (t === 'text' || t === 'sms') return 'SMS';
    if (t === 'file_review') return 'File Review';
    if (t === 'student_event') return 'Student Event';
    if (t === 'systemevent' || t === 'system_event') return 'System Event';

    // Fallback: convert snake_case or spaces to Title Case
    return t
      .split(/_|\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  formatNotes(text: any): any {
    if (!text || text === '') return '-';

    // If payload is an object, aggressively hunt for standard string properties
    if (typeof text === 'object') {
      text =
        text.bodyText ||
        text.body ||
        text.text ||
        text.content ||
        text.message ||
        JSON.stringify(text);
    }

    if (typeof text !== 'string' || text.trim() === '') return '-';

    // 1. Unpack Markdown links so the raw URL is visible as requested
    let html = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1: $2');

    // 2. Wrap ALL raw URLs into links displaying "Learn More" for a premium UI
    html = html.replace(
      /(^|[^="'])(https?:\/\/[^\s<)]+)/g,
      (match: string, prefix: string, url: string) => {
        return `${prefix}<a href="${url}" target="_blank" style="color: #3b82f6; text-decoration: underline; display: inline-flex; align-items: center; gap: 4px;">Learn More <span class="material-icons" style="font-size: 14px; color: #3b82f6; text-decoration: none;">launch</span></a>`;
      },
    );

    // 3. Wrap email addresses safely
    html = html.replace(
      /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g,
      `<a href="mailto:$1" style="color: #3b82f6; text-decoration: underline;">$1</a>`,
    );

    // 4. Basic Markdown aesthetics
    html = html.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^\*]+)\*/g, '<em>$1</em>');

    // 5. Add line breaks before common header chunks so flattened chat/email transcripts wrap nicely using pre-wrap layouts.
    html = html.replace(
      /(From:|To:|Sent:|Subject:|Chat Transcript:)/gi,
      '<br><strong>$1</strong>',
    );


    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  activitySummary = computed(() => {
    const logs = this.activityLogs();
    if (!logs || !logs.length) return '';
    const counts: Record<string, number> = {};
    logs.forEach((log) => {
      const rawType =
        log.communication_type || log.activity_category || 'Event';
      const type = this.formatActivityType(rawType, log.communication_type || log.activity_name);
      counts[type] = (counts[type] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `${type} (${count})`)
      .join(', ');
  });

  async loadSubcollections(studentId: string) {
    this.isLoadingSubcollections.set(true);
    try {
      const [outputs, logs, clists] = await Promise.all([
        this.studentService.loadAiOutputs(studentId),
        this.studentService.loadActivityLogs(studentId),
        this.studentService.loadChecklists(studentId),
      ]);
      this.aiOutputs.set(outputs);
      console.log('--- [DEBUG] PAGE LOAD AI PAYLOAD ---', outputs);
      this.activityLogs.set(logs);
      this.checklistsRaw.set(clists);
    } catch (e) {
      console.error('[opportunity-detail] Failed to load subcollections:', e);
    } finally {
      this.isLoadingSubcollections.set(false);
    }
  }

  async loadDocuments(uid: string) {
    const listRef = ref(this.storage, `uploads/${uid}`);
    try {
      const res = await listAll(listRef);
      const docs = await Promise.all(
        res.items.map(async (itemRef) => {
          const url = await getDownloadURL(itemRef);
          let createdAt = '';
          try {
            const meta = await getMetadata(itemRef);
            createdAt = meta.timeCreated;
          } catch (e) {
            // Ignore
          }
          return { name: itemRef.name, url, createdAt };
        }),
      );
      this.uploadedDocuments.set(
        docs.sort(
          (a, b) =>
            new Date(b.createdAt || 0).getTime() -
            new Date(a.createdAt || 0).getTime(),
        ),
      );
    } catch (error) {
      console.error('Error loading documents from storage', error);
    }
  }
  transientAgentTrace = signal<any[] | null>(null);
  selectedOutreachTab = signal<'actions' | 'email' | 'sms'>('actions');

  daysRemaining(dueDate: string): number {
    const diff = new Date(dueDate).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 3600 * 24));
  }

  isFundingComplete(student: Student): boolean {
    if (!student || !student.requirements) return false;
    return student.requirements.fafsaSubmitted;
  }

  async generateAi(student: Student) {
    // Clear existing AI insights to show loading state
    if (student.id) {
      await this.studentService.clearAiInsights(student.id);
      this.aiOutputs.set(null);
    }

    this.isGeneratingAi.set(true);
    // Initialize loading trace
    const mockTrace: any[] = [
      {
        agentName: 'Orchestrator',
        action: 'Initializing Swarm Request',
        status: 'Running...',
        duration: '0ms',
      },
    ];
    this.transientAgentTrace.set([...mockTrace]);

    let step = 1;
    const interval = setInterval(() => {
      if (step === 1) {
        mockTrace[0].status = 'Success';
        mockTrace[0].duration = '120ms';
        mockTrace.push({
          agentName: 'Data Agent (Firestore)',
          action: 'Querying Historical Records & Engagement Rules',
          status: step >= 2 ? 'Success' : 'Running...',
          duration: step >= 2 ? '145ms' : '',
        });
      } else if (step === 2) {
        mockTrace[1].status = 'Success';
        mockTrace[1].duration = '1450ms';
        mockTrace.push({
          agentName: 'Vertex AI (Gemini)',
          action: 'Synthesizing Distributed Context',
          status: 'Running...',
          duration: '0ms',
        });
      }
      this.transientAgentTrace.set([...mockTrace]);
      step++;
    }, 1500);

    try {
      await this.studentService.triggerAiGeneration(student.id!);

      const responseSnap = await this.studentService.waitForAiGeneration(
        student.id!,
      );

      clearInterval(interval);
      // Reload ai_insights/latest subcollection after core generation securely
      const latestOutputs = await this.studentService.loadAiOutputs(
        student.id!,
      );
      this.aiOutputs.set(latestOutputs);
      console.log('--- [DEBUG] CORE AI PAYLOAD RECEIVED ---', latestOutputs);

      const resInsights = responseSnap?.['aiInsights'] || latestOutputs;
      if (resInsights && resInsights.agentTrace) {
        this.transientAgentTrace.set(resInsights.agentTrace);
      }

      this.isGeneratingAi.set(false);
      this.isGeneratingComms.set(true);

      // Spin up isolated background listener for decoupled async Communications Payload
      this.studentService.waitForCommsGeneration(student.id!).then(async () => {
        const finalOutputs = await this.studentService.loadAiOutputs(
          student.id!,
        );
        this.aiOutputs.set(finalOutputs);
        console.log(
          '--- [DEBUG] ASYNC COMMS PAYLOAD RECEIVED ---',
          finalOutputs,
        );
        this.isGeneratingComms.set(false);
      });
    } catch (e: any) {
      clearInterval(interval);
      alert(
        'Failed to generate AI insights: ' +
          (e?.message || 'Unknown background process crash'),
      );
      this.isGeneratingAi.set(false);
      this.isGeneratingComms.set(false);
    }
  }

  copyToClipboard(text: string, bullets: string[] = []) {
    const fullText =
      text +
      (bullets && bullets.length > 0
        ? '\n\n' + bullets.map((b) => '• ' + b).join('\n')
        : '');
    navigator.clipboard
      .writeText(fullText)
      .then(() => {
        alert('Draft copied to clipboard!');
      })
      .catch((err) => {
        console.error('Failed to copy: ', err);
      });
  }

  openMailClient(student: Student, text: string, bullets: string[] = []) {
    const fullText =
      text +
      (bullets && bullets.length > 0
        ? '\n\n' + bullets.map((b) => '• ' + b).join('\n')
        : '');

    // Copy draft to clipboard and open mailto
    navigator.clipboard
      .writeText(fullText)
      .then(() => {
        const mailtoLink = `mailto:${student.email}?subject=${encodeURIComponent('Your Enrollment Update')}`;
        window.location.href = mailtoLink;

        setTimeout(() => {
          alert(
            'Draft copied to clipboard! Simply hit Paste (Cmd+V/Ctrl+V) when your email app opens.',
          );
        }, 500);
      })
      .catch((err) => {
        console.error('Failed to copy text before opening mail: ', err);
      });
  }

  startEdit(student: Student) {
    this.isEditingContext.set(true);
    this.editEmail.set(student.email);
    this.editPhone.set(student.phone);
  }

  cancelEdit() {
    this.isEditingContext.set(false);
  }

  async saveEdit(student: Student) {
    if (this.editEmail() && this.editPhone()) {
      await this.studentService.updateStudent(student.id, {
        email: this.editEmail(),
        phone: this.editPhone(),
      });
      this.isEditingContext.set(false);
    }
  }

  newNoteText = signal('');

  accordions = signal<{ [key: string]: boolean }>({
    notes: true,
    cases: false,
    docs: false,
    progress: false,
    checklist: false,
    communications: true,
  });

  toggleAccordion(key: string) {
    const current = this.accordions();
    this.accordions.set({ ...current, [key]: !current[key] });
  }

  async submitNote(student: Student) {
    if (!this.newNoteText().trim()) return;

    const newNote = {
      text: this.newNoteText().trim(),
      timestamp: new Date().toISOString(),
      author: 'Admissions Specialist',
    };

    const notes = student.notes ? [...student.notes, newNote] : [newNote];

    await this.studentService.updateStudent(student.id, { notes });
    this.newNoteText.set(''); // clear input
  }

  async triggerCommunication(
    student: Student,
    action: Partial<RecommendedAction>,
    customBody?: string,
  ) {
    let documentName = 'outstanding enrollment requirements';
    if (!student.requirements.officialTranscriptsReceived)
      documentName = 'Official Transcripts';
    else if (!student.requirements.fafsaSubmitted)
      documentName = 'FAFSA Missing';

    // Generates a URL dynamically directing the student to the Upload Component
    let uploadLink = `${window.location.origin}/upload?uid=${student.studentUid}`;

    if (action.type === 'Email') {
      alert(
        `Simulated Action: Urgent Email drafted for ${student.email} regarding ${documentName}.`,
      );
    } else if (action.type === 'SMS') {
      alert(
        `Simulated Action: Urgent SMS text executed to ${student.phone} regarding ${documentName}.`,
      );
    } else {
      alert('Communication type not supported.');
    }
  }

  getOverallProgress(student: Student): number {
    if (!student || !student.requirements) return 0;
    const r = student.requirements;
    let completed = 0;
    if (r.initialPortalLogin) completed++;
    if (r.fafsaSubmitted) completed++;
    if (r.courseRegistration) completed++;
    if (r.wowOrientation) completed++;
    if (r.courseLogin) completed++;
    if (r.classParticipation) completed++;
    if (r.officialTranscriptsReceived) completed++;
    if (r.nursingLicenseReceived) completed++;

    return Math.round((completed / 8) * 100);
  }
}
