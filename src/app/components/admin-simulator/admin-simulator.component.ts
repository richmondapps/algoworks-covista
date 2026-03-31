import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StudentService } from '../../services/student.service';

@Component({
  selector: 'app-admin-simulator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-simulator.component.html'
})
export class AdminSimulatorComponent {
  private studentService = inject(StudentService);
  
  selectedStudent = 'A00302996'; 
  
  startDate = '';
  reserveDate = '';
  loginAccreditedDate = '';
  loginNonAccreditedDate = '';
  discussionDate = '';
  
  transcriptCleared = false;
  fundingComplete = false;
  wwowStarted = false;

  isWriting = false;
  isSyncing = false;
  syncResult = '';

  async writeToFirestore() {
    this.isWriting = true;
    try {
      const student = this.studentService.getStudent(this.selectedStudent);
      if (!student) throw new Error('Student not tracked in live context.');
      
      const req = { ...student.requirements } as any;

      if (this.fundingComplete) req.fundingPlan = true;
      if (this.transcriptCleared) req.officialTranscriptsReceived = true;

      const mockCourses = [];
      if (this.loginAccreditedDate || this.discussionDate) {
        mockCourses.push({
            courseId: 'ACCREDITED_MOCK',
            isAccredited: true,
            firstLoginAt: this.loginAccreditedDate ? new Date(this.loginAccreditedDate).toISOString() : undefined,
            firstDiscussionPostAt: this.discussionDate ? new Date(this.discussionDate).toISOString() : undefined
        });
      }
      if (this.loginNonAccreditedDate) {
        mockCourses.push({
            courseId: 'NON_ACCREDITED_MOCK',
            isAccredited: false,
            firstLoginAt: new Date(this.loginNonAccreditedDate).toISOString()
        });
      }

      await this.studentService.updateStudent(this.selectedStudent, {
        programStartDate: this.startDate ? new Date(this.startDate).toISOString() : student.programStartDate,
        reserveDate: this.reserveDate ? new Date(this.reserveDate).toISOString() : student.reserveDate,
        courseActivity: mockCourses.length > 0 ? mockCourses : student.courseActivity,
        requirements: req
      });

      alert('Student payload written instantaneously directly into operational Firestore DB!');
    } catch(e) { console.error('Write Failed:', e); }
    this.isWriting = false;
  }

  async simulatePubSubSync() {
    this.isSyncing = true;
    this.syncResult = 'Executing Delta Sync Engine...';
    setTimeout(() => {
      this.syncResult = 'SUCCESS! Architecture is now completely Firestore-First. Syncs are zero-latency WebSockets. The BigQuery Poll is officially decommissioned.';
      this.isSyncing = false;
    }, 1000);
  }
}
