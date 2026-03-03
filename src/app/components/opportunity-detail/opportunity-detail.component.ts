import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StudentService } from '../../services/student.service';
import { Student, RecommendedAction } from '../../models/student';
import { toSignal } from '@angular/core/rxjs-interop';
import { computed, signal } from '@angular/core';
import { getFunctions, httpsCallable } from '@angular/fire/functions';
import { Storage, ref, listAll, getDownloadURL } from '@angular/fire/storage';
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

  isEditingContext = signal(false);
  editEmail = signal('');
  editPhone = signal('');

  uploadedDocuments = signal<{ name: string, url: string }[]>([]);
  private storage = inject(Storage);

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
        return { name: itemRef.name, url };
      }));
      this.uploadedDocuments.set(docs);
    } catch (error) {
      console.error('Error loading documents from storage', error);
    }
  }

  isGeneratingAi = signal(false);

  daysRemaining(dueDate: string): number {
    const diff = new Date(dueDate).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 3600 * 24));
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

  async triggerCommunication(student: Student, action: Partial<RecommendedAction>) {
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
          uploadLink: uploadLink
        });

        alert(`Success: Urgent Email generated and sent to ${student.email} via SendGrid.`);
      } catch (error) {
        console.error("Function call error", error);
        alert('Failed to send email. Check console.');
      }
    } else if (action.type === 'SMS') {
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
          uploadLink: uploadLink
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
