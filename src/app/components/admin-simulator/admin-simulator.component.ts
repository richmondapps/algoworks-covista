import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Functions, httpsCallable } from '@angular/fire/functions';

@Component({
  selector: 'app-admin-simulator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-simulator.component.html'
})
export class AdminSimulatorComponent {
  private functions = inject(Functions);
  
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

  async writeToBigQuery() {
    this.isWriting = true;
    try {
      const bqWriteFn = httpsCallable(this.functions, 'updateBigQueryMockData');
      await bqWriteFn({
        studentUid: this.selectedStudent,
        startDate: this.startDate || null,
        reserveDate: this.reserveDate || null,
        loginAccreditedDate: this.loginAccreditedDate ? new Date(this.loginAccreditedDate).toISOString() : null,
        loginNonAccreditedDate: this.loginNonAccreditedDate ? new Date(this.loginNonAccreditedDate).toISOString() : null,
        discussionDate: this.discussionDate ? new Date(this.discussionDate).toISOString() : null,
        transcriptCleared: this.transcriptCleared,
        fundingComplete: this.fundingComplete,
        wwowStarted: this.wwowStarted
      });
      alert('Raw Data successfully injected into BigQuery!');
    } catch(e) { console.error('Write Failed:', e); }
    this.isWriting = false;
  }

  async simulatePubSubSync() {
    this.isSyncing = true;
    this.syncResult = 'Executing Delta Sync Engine...';
    try {
      const syncFn = httpsCallable(this.functions, 'manualSyncBQtoFirestore');
      const res: any = await syncFn({});
      this.syncResult = res.data?.success ? `SUCCESS! Synced ${res.data?.count} updated records dynamically.` : 'Sync failed!';
    } catch(e) { console.error('Sync error:', e); this.syncResult = 'FAILED TO SYNC'; }
    this.isSyncing = false;
  }
}
