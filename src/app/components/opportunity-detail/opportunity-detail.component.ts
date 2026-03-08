import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StudentService } from '../../services/student.service';
import { Student, RecommendedAction } from '../../models/student';
import { toSignal } from '@angular/core/rxjs-interop';
import { computed, signal } from '@angular/core';
import { getFunctions, httpsCallable } from '@angular/fire/functions';
import { Storage, ref, listAll, getDownloadURL, getMetadata } from '@angular/fire/storage';
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
    if (!s || !s.checklist || s.checklist.length === 0) return 0;
    const completed = s.checklist.filter(c => c.status === 'Complete').length;
    return Math.round((completed / s.checklist.length) * 100);
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
      const result = await this.studentService.queryDocumentInfo(s.uid, doc.name, query);
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
        this.loadDocuments(s.uid);
      }
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
  selectedOutreachTab = signal<'actions' | 'email' | 'sms'>('actions');

  daysRemaining(dueDate: string): number {
    const diff = new Date(dueDate).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 3600 * 24));
  }

  isFundingComplete(student: Student): boolean {
    if (!student || !student.checklist || student.checklist.length === 0) return false;
    return student.checklist.every(item => item.status === 'Complete');
  }

  async generateAi(student: Student) {
    this.isGeneratingAi.set(true);
    try {
      await this.studentService.generateAiInsights(student);
    } catch (e) {
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

    // 1. Copy the massive AI payload to the user's clipboard automatically
    navigator.clipboard.writeText(fullText).then(() => {
      // 2. Fire a standard mailto link with ONLY the 'To' and 'Subject' fields.
      // This completely bypasses the browser 2000-character limit AND the Azure O365 licensing error,
      // and launches whichever native app (Desktop Outlook, Apple Mail) the user prefers!
      const mailtoLink = `mailto:${student.email}?subject=${encodeURIComponent('Your Enrollment Update')}`;
      window.location.href = mailtoLink;

      // 3. Briefly alert the user so they know all they have to do is hit Paste.
      // We use a small timeout so the mail app has time to launch first.
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
    // Generate simulated communication logic
    let missingItem = student.checklist.find(c => c.status !== 'Complete');
    let documentName = missingItem ? missingItem.name : 'your missing documents';
    let days = missingItem ? this.daysRemaining(missingItem.dueDate) : 0;

    // Generates a URL dynamically directing the student directly to your Angular Upload Component
    let uploadLink = `${window.location.origin}/upload?uid=${student.uid}`;

    if (action.type === 'Email') {
      try {
        console.log('Invoking sendOpportunityEmail Cloud Function...');
        const functions = getFunctions();
        const sendEmailFn = httpsCallable(functions, 'sendOpportunityEmail');

        await sendEmailFn({
          studentUid: student.uid,
          email: student.email,
          name: student.name,
          daysLeft: days,
          documentName: documentName,
          uploadLink: uploadLink,
          customHtml: customBody
        });

        alert(`Success: Urgent Email generated and sent to ${student.email} via SendGrid.`);
      } catch (error) {
        console.error("Function call error", error);
        alert('Failed to send email. Check console.');
      }
    } else if (action.type === 'SMS') {
      alert("A2P 10DLC Compliance Notice:\n\nIn accordance with new FCC regulations and carrier requirements, Twilio SMS campaigns are currently paused pending active brand and campaign registration approval. Expected resolution: 2-4 Days.");

      try {
        console.log('Invoking sendOpportunitySms Cloud Function...');
        const functions = getFunctions();
        const sendSmsFn = httpsCallable(functions, 'sendOpportunitySms');

        await sendSmsFn({
          studentUid: student.uid,
          phone: student.phone,
          name: student.name,
          daysLeft: days,
          documentName: documentName,
          uploadLink: uploadLink,
          customText: customBody
        });
        alert(`Success: Urgent SMS simulated execution sent to ${student.phone}.`);
      } catch (error) {
        console.error("Sms Function Error:", error);
        alert('Simulation Error sending SMS. See console log for missing backend function payload format');
      }
    } else {
      alert('Communication type not supported in this simulation.');
    }
  }

  getOverallProgress(student: Student): number {
    if (!student.checklist || student.checklist.length === 0) return 0;
    const complete = student.checklist.filter(c => c.status === 'Complete').length;
    return Math.round((complete / student.checklist.length) * 100);
  }
}
