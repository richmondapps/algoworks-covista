import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StudentService } from '../../services/student.service';
import { Student, RecommendedAction, AiOutputsLatest, PersonalizedChecklist, StudentActivityLog } from '../../models/student';
import { toSignal } from '@angular/core/rxjs-interop';
import { computed, signal } from '@angular/core';
import { getFunctions, httpsCallable } from '@angular/fire/functions';
import { Storage, ref, listAll, getDownloadURL, getMetadata, uploadString } from '@angular/fire/storage';
import { Firestore, collection, addDoc } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { effect } from '@angular/core';

@Component({
  selector: 'app-opportunity-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './opportunity-detail.component.html',
  styleUrl: './opportunity-detail.component.scss'
})
export class OpportunityDetailComponent {
  private route = inject(ActivatedRoute);
  private studentService = inject(StudentService);
  private firestore = inject(Firestore);
  private auth = inject(Auth);


  private paramsStr = toSignal(this.route.paramMap);
  student = computed(() => {
    const p = this.paramsStr();
    return p ? this.studentService.getStudent(p.get('id')!) : undefined;
  });

  groupedCommunications = computed(() => {
    const s = this.student();
    if (!s || !s.communications) return [];

    const sorted = [...s.communications].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
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
            events: [{ status: log.status, timestamp: log.timestamp }]
          };
          grouped.push(currentEmailThread);
        } else if (currentEmailThread) {
          // Append Delivered/Opened/Clicked to the last email sent in the thread
          currentEmailThread.events.push({ status: log.status, timestamp: log.timestamp });
        } else {
          currentEmailThread = { type: 'Email', body: log.body, agentName: log.agentName, events: [{ status: log.status, timestamp: log.timestamp }] };
          grouped.push(currentEmailThread);
        }
      } else if (log.type === 'SMS') {
        if (log.status === 'Sent') {
          currentSmsThread = {
            type: 'SMS',
            body: log.body,
            agentName: log.agentName,
            events: [{ status: log.status, timestamp: log.timestamp }]
          };
          grouped.push(currentSmsThread);
        } else if (currentSmsThread) {
          currentSmsThread.events.push({ status: log.status, timestamp: log.timestamp });
        } else {
          currentSmsThread = { type: 'SMS', body: log.body, agentName: log.agentName, events: [{ status: log.status, timestamp: log.timestamp }] };
          grouped.push(currentSmsThread);
        }
      } else {
        grouped.push({
          type: log.type,
          body: log.body,
          agentName: log.agentName,
          events: [{ status: log.status, timestamp: log.timestamp }]
        });
      }
    }

    const statusOrder: { [key: string]: number } = {
      'Sent': 1,
      'Delivered': 2,
      'Opened': 3,
      'Clicked': 4,
      'Failed': 5,
      'Bounced': 6
    };

    grouped.forEach(group => {
      const uniqueEvents = new Map<string, { status: string; timestamp: string }>();
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
    
    const completed = chks.filter(chk => chk.is_satisfied).length;
    return Math.round((completed / chks.length) * 100);
  });

  sortedNextBestActions = computed(() => {
    const i = this.insights();
    if (!i || !i.nextBestActions) return [];
    
    // Sort so urgent actions are strictly at the top
    return [...i.nextBestActions].sort((a, b) => {
      if (a.urgent && !b.urgent) return -1;
      if (!a.urgent && b.urgent) return 1;
      return 0;
    });
  });

  calculateDaysDiff(dateStr?: string | null, isPast: boolean = false): string {
    if (!dateStr) return 'N/A';
    try {
      const targetDate = new Date(dateStr);
      const now = new Date();
      // Enforce strict UTC structural comparisons at midnight to avoid tz offset shifts shifting the day natively
      const targetUtc = Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate());
      const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      
      const diffMs = isPast ? (nowUtc - targetUtc) : (targetUtc - nowUtc);
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      return days < 0 ? '0 days' : `${days} day${days === 1 ? '' : 's'}`;
    } catch {
      return 'N/A';
    }
  }

  formatLevel(level?: string | null): string {
    if (!level) return 'Medium';
    let formatted = level.charAt(0).toUpperCase() + level.slice(1).toLowerCase();
    
    // Reverse logic: Python backend returns 'Risk' metrics (High = Bad). UI maps natively to 'Level' metric (Low = Bad).
    if (formatted === 'High') return 'Low';
    if (formatted === 'Low') return 'High';
    return formatted;
  }

  formatNote(note: string | undefined | null, rawLevel: string | undefined | null): string {
    const defaultNote = 'Stable activity based on recent actions';
    if (!note) return defaultNote;
    
    const correctedLevel = this.formatLevel(rawLevel).toLowerCase();
    
    // The Python LLM writes plain-text 'High'/'Low' adjectives dynamically, but incorrectly binds them. 
    // If the UI evaluates the real computed Level as 'low', the sub-text should physically match 'low', restricting the LLM from inserting inverted logic into the UI.
    let correctedNote = note;
    if (correctedLevel === 'low') {
        correctedNote = correctedNote.replace(/\bhigh\b/gi, 'low');
    } else if (correctedLevel === 'high') {
        correctedNote = correctedNote.replace(/\blow\b/gi, 'high');
    }
    
    return correctedNote;
  }

  formatSummary(summary: string | undefined | null, student: Student): string {
    const defaultSum = "System is actively calibrating a holistic summary matrix across both readiness parameters and active engagement metrics to provide a unified student success strategy.";
    if (!summary) return defaultSum;

    let correctedText = summary;
    const actualDaysStr = this.calculateDaysDiff(student.reserveDate, true);
    
    // 1. Fix Timeframe Hallucination
    // Replaces permutations of 'reserved 1 day ago', 'reserve was 4 days ago', 'reserved their spot just one day ago'
    correctedText = correctedText.replace(/(reserve[sd]?.*?)\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+days?\s+ago/gi, `$1${actualDaysStr} ago`);
    
    // 2. Fix Semantic Inversions
    // The LLM conflates Risk and Level terminology inside the overview body. 
    // We forcefully map the paragraph adjectives to match the mathematically validated UI chips.
    const computedReadiness = this.formatLevel(student.aiInsights?.readinessRisk?.level).toLowerCase();
    const computedEngagement = this.formatLevel(student.aiInsights?.engagementRisk?.level).toLowerCase();

    if (computedReadiness === 'low') {
        correctedText = correctedText.replace(/readiness([^.]*?)\bhigh\b/gi, 'readiness$1low');
    } else if (computedReadiness === 'high') {
        correctedText = correctedText.replace(/readiness([^.]*?)\blow\b/gi, 'readiness$1high');
    }

    if (computedEngagement === 'low') {
        correctedText = correctedText.replace(/engagement([^.]*?)\bhigh\b/gi, 'engagement$1low');
    } else if (computedEngagement === 'high') {
        correctedText = correctedText.replace(/engagement([^.]*?)\blow\b/gi, 'engagement$1high');
    }

    return correctedText;
  }

  isEditingContext = signal(false);
  isEditingEmail = signal(false);
  editEmail = signal('');
  editPhone = signal('');

  uploadedDocuments = signal<{ name: string, url: string, createdAt?: string }[]>([]);
  private storage = inject(Storage);

  selectedDocForAi = signal<{ name: string, url: string } | null>(null);
  docQuery = signal('');
  docAiResponse = signal('');
  isQueryingDoc = signal(false);

  selectDocumentForAi(doc: { name: string, url: string }) {
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
      const result = await this.studentService.queryDocumentInfo(s.studentUid, doc.name, query);
      if (result && result.answer) {
        this.docAiResponse.set(result.answer);
      } else {
        this.docAiResponse.set("No valid response gathered from document.");
      }
    } catch (e: any) {
      this.docAiResponse.set("Error: " + e.message);
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
  checklists = signal<PersonalizedChecklist[]>([]);
  activityLogs = signal<StudentActivityLog[]>([]);
  isLoadingSubcollections = signal(false);

  insights = computed(() => {
    const rootInsights = this.student()?.aiInsights || {};
    const subcollectionInsights = this.aiOutputs() || {};
    // Deep merge legacy root attributes with fresh subcollection outputs so decoupled communications aren't lost
    return Object.keys(rootInsights).length || Object.keys(subcollectionInsights).length 
      ? ({ ...rootInsights, ...subcollectionInsights } as any)
      : null;
  });

  private sanitizer = inject(DomSanitizer);

  formatActivityType(type: string | null | undefined): string {
    if (!type) return '-';
    let t = type.toLowerCase().trim();
    if (t === 'phone_call' || t === 'outbound_call' || t === 'inbound_call') return 'Phone';
    if (t === 'email') return 'Email';
    if (t === 'text' || t === 'sms') return 'SMS';
    if (t === 'file_review') return 'File Review';
    if (t === 'student_event') return 'System Event';
    // Fallback: convert snake_case or spaces to Title Case
    return t.split(/_|\s+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  formatNotes(text: any): any {
    if (!text || text === '') return '-';

    // If payload is an object, aggressively hunt for standard string properties
    if (typeof text === 'object') {
      text = text.bodyText || text.body || text.text || text.content || text.message || JSON.stringify(text);
    }
    
    if (typeof text !== 'string' || text.trim() === '') return '-';

    // 1. Convert URLs to shortened clickable Links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    let html = text.replace(urlRegex, (url: string) => {
      return `<a href="${url}" target="_blank" style="color: #3b82f6; text-decoration: underline;">[Link]</a>`;
    });
    
    // 2. Add line breaks before common header chunks so flattened chat/email transcripts wrap nicely using pre-wrap layouts.
    html = html.replace(/(From:|To:|Sent:|Subject:|Chat Transcript:)/gi, '<br><strong>$1</strong>');
    
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  activitySummary = computed(() => {
    const logs = this.activityLogs();
    if (!logs || !logs.length) return '';
    const counts: Record<string, number> = {};
    logs.forEach(log => {
      const rawType = log.communication_type || log.activity_category || 'Event';
      const type = this.formatActivityType(rawType);
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
      const [outputs, checklists, logs] = await Promise.all([
        this.studentService.loadAiOutputs(studentId),
        this.studentService.loadChecklists(studentId),
        this.studentService.loadActivityLogs(studentId),
      ]);
      this.aiOutputs.set(outputs);
      console.log('--- [DEBUG] PAGE LOAD AI PAYLOAD ---', outputs);
      this.checklists.set(checklists);
      console.log('--- [DEBUG] PAGE LOAD CHECKLISTS ---', checklists);
      this.activityLogs.set(logs);
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
      const docs = await Promise.all(res.items.map(async (itemRef) => {
        const url = await getDownloadURL(itemRef);
        let createdAt = '';
        try {
          const meta = await getMetadata(itemRef);
          createdAt = meta.timeCreated;
        } catch (e) {
          // Ignore
        }
        return { name: itemRef.name, url, createdAt };
      }));
      this.uploadedDocuments.set(docs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()));
    } catch (error) {
      console.error('Error loading documents from storage', error);
    }
  }

  isGeneratingAi = signal(false);
  transientAgentTrace = signal<any[] | null>(null);
  selectedOutreachTab = signal<'actions' | 'email' | 'sms'>('actions');

  daysRemaining(dueDate: string): number {
    const diff = new Date(dueDate).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 3600 * 24));
  }

  isFundingComplete(student: Student): boolean {
    if (!student || !student.requirements) return false;
    return student.requirements.fundingPlan;
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
      { agentName: 'Orchestrator', action: 'Initializing Swarm Request', status: 'Running...', duration: '0ms' }
    ];
    this.transientAgentTrace.set([...mockTrace]);

    let step = 1;
    const interval = setInterval(() => {
      if (step === 1) {
        mockTrace[0].status = 'Success';
        mockTrace[0].duration = '120ms';
        mockTrace.push({ agentName: 'Data Agent (Firestore)', action: 'Querying Historical Records & Engagement Rules', status: step >= 2 ? 'Success' : 'Running...', duration: step >= 2 ? '145ms' : '' });
      } else if (step === 2) {
        mockTrace[1].status = 'Success';
        mockTrace[1].duration = '1450ms';
        mockTrace.push({ agentName: 'Vertex AI (Gemini)', action: 'Synthesizing Distributed Context', status: 'Running...', duration: '0ms' });
      }
      this.transientAgentTrace.set([...mockTrace]);
      step++;
    }, 1500);

    try {
      const response: any = await this.studentService.generateAiInsights(student);
      clearInterval(interval);
      // Reload ai_insights/latest subcollection after generation
      const latestOutputs = await this.studentService.loadAiOutputs(student.id);
      this.aiOutputs.set(latestOutputs);
      console.log('--- [DEBUG] NEW AI PAYLOAD RECEIVED ---', latestOutputs);
      
      const resInsights = response?.aiInsights || latestOutputs;
      if (resInsights && resInsights.agentTrace) {
        this.transientAgentTrace.set(resInsights.agentTrace);
      }
    } catch (e) {
      clearInterval(interval);
      alert("Failed to generate AI insights.");
    } finally {
      this.isGeneratingAi.set(false);
    }
  }

  copyToClipboard(text: string, bullets: string[] = []) {
    const fullText = text + (bullets && bullets.length > 0 ? '\n\n' + bullets.map(b => '• ' + b).join('\n') : '');
    navigator.clipboard.writeText(fullText).then(() => {
      alert('Draft copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy: ', err);
    });
  }

  openMailClient(student: Student, text: string, bullets: string[] = []) {
    const fullText = text + (bullets && bullets.length > 0 ? '\n\n' + bullets.map(b => '• ' + b).join('\n') : '');

    // Copy draft to clipboard and open mailto
    navigator.clipboard.writeText(fullText).then(() => {
      const mailtoLink = `mailto:${student.email}?subject=${encodeURIComponent('Your Enrollment Update')}`;
      window.location.href = mailtoLink;

      setTimeout(() => {
        alert("Draft copied to clipboard! Simply hit Paste (Cmd+V/Ctrl+V) when your email app opens.");
      }, 500);
    }).catch(err => {
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
        phone: this.editPhone()
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
    communications: true
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
      author: 'Admissions Specialist'
    };

    const notes = student.notes ? [...student.notes, newNote] : [newNote];

    await this.studentService.updateStudent(student.id, { notes });
    this.newNoteText.set(''); // clear input
  }

  async triggerCommunication(student: Student, action: Partial<RecommendedAction>, customBody?: string) {
    let documentName = 'outstanding enrollment requirements';
    if (!student.requirements.officialTranscriptsReceived) documentName = 'Official Transcripts';
    else if (!student.requirements.fundingPlan) documentName = 'Funding Plan Application';
    
    // Generates a URL dynamically directing the student to the Upload Component
    let uploadLink = `${window.location.origin}/upload?uid=${student.studentUid}`;

    if (action.type === 'Email') {
        alert(`Simulated Action: Urgent Email drafted for ${student.email} regarding ${documentName}.`);
    } else if (action.type === 'SMS') {
        alert(`Simulated Action: Urgent SMS text executed to ${student.phone} regarding ${documentName}.`);
    } else {
        alert('Communication type not supported.');
    }
  }

  getOverallProgress(student: Student): number {
    if (!student || !student.requirements) return 0;
    const r = student.requirements;
    let completed = 0;
    if (r.fundingPlan) completed++;
    if (r.courseRegistration) completed++;
    if (r.wwowOrientationStarted) completed++;
    if (r.officialTranscriptsReceived) completed++;
    if (r.orientationStarted) completed++;
    if (r.firstAssignmentSubmitted) completed++;
    if (r.assignmentByCensusDay) completed++;
    
    return Math.round((completed / 7) * 100);
  }
}
