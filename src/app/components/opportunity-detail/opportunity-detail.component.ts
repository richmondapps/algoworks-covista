import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StudentService } from '../../services/student.service';
import { Student, RecommendedAction } from '../../models/student';
import { toSignal } from '@angular/core/rxjs-interop';
import { computed, signal } from '@angular/core';
import { getFunctions, httpsCallable } from '@angular/fire/functions';
import { Storage, ref, listAll, getDownloadURL, getMetadata, uploadString } from '@angular/fire/storage';
import { Firestore, collection, addDoc } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { effect } from '@angular/core';
import { onSnapshot } from '@angular/fire/firestore';

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
    const s = this.student();
    if (!s || !s.requirements) return 0;
    
    const total = 7;
    let completed = 0;
    const r = s.requirements;
    if (r.fundingPlan) completed++;
    if (r.courseRegistration) completed++;
    if (r.wwowOrientationStarted) completed++;
    if (r.officialTranscriptsReceived) completed++;
    if (r.orientationStarted) completed++;
    if (r.firstAssignmentSubmitted) completed++;
    if (r.assignmentByCensusDay) completed++;
    
    return Math.round((completed / total) * 100);
  });

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
        this.loadActivityLogs(s.id);
      }
    });
  }

  liveActivityLogs = signal<any[]>([]);

  async loadActivityLogs(uid: string) {
    const logsRef = collection(this.firestore, `salesforce_opportunities/${uid}/activity_logs`);
    onSnapshot(logsRef, (snap) => {
       const logs = snap.docs.map(d => d.data());
       logs.sort((a,b) => new Date(b['activity_datetime'] || b['last_updated_timestamp']).getTime() - new Date(a['activity_datetime'] || a['last_updated_timestamp']).getTime());
       this.liveActivityLogs.set(logs);
    });
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
  isGeneratingComms = signal(false);
  transientAgentTrace = signal<any[] | null>(null);

  async requestCommunications(student: Student) {
    if (this.isGeneratingComms()) return;
    this.isGeneratingComms.set(true);

    try {
      await this.studentService.generateCommunications(student);
      console.log('Explicit Communications request finalized successfully via Python Agent native bindings.');
    } catch (e) {
      console.error('Failed to command comms agent natively:', e);
      alert('Internal architecture failed to hook into explicitly detached generation payload.');
    } finally {
      this.isGeneratingComms.set(false);
    }
  }
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
        mockTrace.push(          { agentName: 'Data Agent (Firestore)', action: 'Querying Historical Records & Engagement Rules', status: step >= 2 ? 'Success' : 'Running...', duration: step >= 2 ? '145ms' : '' },);
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
      if (response && response.aiInsights && response.aiInsights.agentTrace) {
        this.transientAgentTrace.set(response.aiInsights.agentTrace);
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

  accordions = signal<{ [key: string]: boolean }>({
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
