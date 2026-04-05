import { Component, inject, OnInit, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, doc, setDoc, collection, addDoc, onSnapshot, Unsubscribe } from '@angular/fire/firestore';
import { SalesforceOpportunityProfile, SalesforceActivityLog, SalesforcePersonalizedChecklist } from '../../models/salesforce-opportunity';

@Component({
  selector: 'app-admin-simulator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-simulator.component.html'
})
export class AdminSimulatorComponent implements OnInit, OnDestroy {
  private firestore = inject(Firestore);
  private zone = inject(NgZone);
  private profileSub?: Unsubscribe;
  private checklistSub?: Unsubscribe;
  
  // Profile Foundation
  selectedStudent = 'A00302996'; 
  programStartDate = '';
  reserveDate = '';
  censusDate = '';
  fundingType = 'Federal';

  // Event Context
  activityCategory = 'student_event';
  activityName = 'fafsa_submission';
  activityDate = new Date().toISOString().slice(0, 16);
  actor = 'student';
  interactionDirection = 'inbound';
  
  taskNotes = '';
  caseStatus = 'open';
  caseRecordType = 'General';
  isAccredited = true;

  isWriting = false;
  syncResult = '';

  checklists = [
    { id: 'initial_portal_login', name: 'Initial Portal Login', satisfied: false },
    { id: 'fafsa_submission', name: 'Funding - FAFSA Submission', satisfied: false },
    { id: 'course_registration', name: 'Course Registration', satisfied: false },
    { id: 'wwow_login', name: 'WWOW (Log in)', satisfied: false },
    { id: 'contingencies', name: 'Contingencies', satisfied: false },
    { id: 'logged_into_course', name: 'Logged into course', satisfied: false },
    { id: 'class_participation', name: 'Class Participation', satisfied: false }
  ];

  studentsBase = {
    'A00302996': { name: 'Amy Collins', program: 'MSEL', program_name: 'MS Early Ed', es: 'Jennifer Lawson' },
    'A00409782': { name: 'Barbara Woods', program: 'BSN', program_name: 'BS Nursing', es: 'Kevin Smith' },
    'A00437050': { name: 'Angela Catour', program: 'MHA', program_name: 'Master Health Admin', es: 'Jessica Thompson' },
  } as any;

  ngOnInit() {
    this.bindStudentState();
  }

  ngOnDestroy() {
    this.cleanupSubs();
  }

  onStudentChange() {
    this.bindStudentState();
  }

  private cleanupSubs() {
    if (this.profileSub) this.profileSub();
    if (this.checklistSub) this.checklistSub();
  }

  private bindStudentState() {
    this.cleanupSubs();
    const studentId = this.selectedStudent;

    // Listen to Profile
    this.profileSub = onSnapshot(doc(this.firestore, 'salesforce_opportunities', studentId), (snapshot) => {
      this.zone.run(() => {
        if (snapshot.exists()) {
          const data = snapshot.data() as SalesforceOpportunityProfile;
          this.programStartDate = data.program_start_date ? data.program_start_date.split('T')[0] : '';
          this.reserveDate = data.reserve_date ? data.reserve_date.split('T')[0] : '';
          this.censusDate = data.census_date ? data.census_date.split('T')[0] : '';
          this.fundingType = data.funding_type || 'Federal';
        } else {
          // Reset explicitly if no physical doc is instantiated
          this.programStartDate = '';
          this.reserveDate = '';
          this.censusDate = '';
          this.fundingType = 'Federal';
        }
      });
    });

    // Listen to Checklists
    this.checklistSub = onSnapshot(collection(this.firestore, `salesforce_opportunities/${studentId}/personalized_checklists`), (snapshot) => {
      this.zone.run(() => {
        // Reset to false natively initially
        this.checklists.forEach(c => c.satisfied = false);
        
        snapshot.docs.forEach(docSnap => {
          const item = docSnap.data() as SalesforcePersonalizedChecklist;
          const localMatch = this.checklists.find(c => c.id === item.requirement_id);
          if (localMatch) {
            localMatch.satisfied = item.is_satisfied;
          }
        });
      });
    });
  }

  async toggleChecklist(chk: any) {
    const studentId = this.selectedStudent;
    try {
      const payload: SalesforcePersonalizedChecklist = {
        requirement_id: chk.id,
        student_id: studentId,
        requirement_name: chk.name,
        requirement_type: 'Checklist',
        is_personalized: false,
        is_satisfied: chk.satisfied,
        satisfied_at: chk.satisfied ? new Date().toISOString() : null,
        risk_thresholds: { happy_path_rule: null, low_risk_rule: null, medium_risk_rule: null, high_risk_rule: null },
        current_risk_level: chk.satisfied ? 'Cleared' : 'Pending',
        notes: null,
        last_evaluated_timestamp: new Date().toISOString()
      };

      await setDoc(doc(this.firestore, `salesforce_opportunities/${studentId}/personalized_checklists/${chk.id}`), payload, { merge: true });
      this.syncResult = `SUCCESS! Requirement [${chk.name}] natively set to [${chk.satisfied}].`;
    } catch(e) {
      console.error('Checklist Write Failed:', e); 
      this.syncResult = `ERROR: ${e}`;
    }
  }

  async pushToV17Schema() {
    this.isWriting = true;
    try {
      const base = this.studentsBase[this.selectedStudent];
      const studentId = this.selectedStudent;

      const profile: SalesforceOpportunityProfile = {
        student_id: studentId,
        student_name: base.name,
        institution: 'Covista University',
        program: base.program,
        program_name: base.program_name,
        term_code: '2026-T1',
        term_desc: 'Spring 2026',
        status_stage: 'Enrolled',
        enrollment_specialist_name: base.es,
        program_start_date: this.programStartDate ? new Date(this.programStartDate + 'T00:00:00-04:00').toISOString() : null,
        reserve_date: this.reserveDate ? new Date(this.reserveDate + 'T00:00:00-04:00').toISOString() : null,
        census_date: this.censusDate ? new Date(this.censusDate + 'T00:00:00-04:00').toISOString() : null,
        funding_type: this.fundingType,
        time_to_program_start_days: this.calculateDaysToProgramStart(this.programStartDate),
        time_since_reserve_days: this.calculateDaysSinceReserve(this.reserveDate),
        last_updated_at: new Date().toISOString()
      };

      // 1. Force the Profile Root Document
      await setDoc(doc(this.firestore, 'salesforce_opportunities', studentId), profile, { merge: true });

      // 2. Generate and Append the Active Activity Subcollection Row
      if (this.activityCategory && this.activityName) {
        const eventLog: SalesforceActivityLog = {
          log_id: 'auto-gen',
          student_id: studentId,
          term_code: '2026-T1',
          activity_category: this.activityCategory,
          activity_name: this.activityName,
          activity_datetime: new Date(this.activityDate + ':00-04:00').toISOString(),
          
          communication_type: this.activityCategory === 'task_history' ? 'Email' : null,
          task_notes: this.taskNotes || null,
          interaction_direction: this.interactionDirection,

          case_status: this.activityCategory === 'case' ? this.caseStatus : null,
          case_record_type: this.activityCategory === 'case' ? this.caseRecordType : null,

          actor: this.actor,
          source_system: 'Salesforce Simulator',
          last_updated_timestamp: new Date().toISOString(),

          is_accredited: this.isAccredited
        };

        const activityRef = collection(this.firestore, `salesforce_opportunities/${studentId}/activity_logs`);
        await addDoc(activityRef, eventLog);
      }

      this.syncResult = `SUCCESS! Student Profile explicitly mapped into core collection. Engine is fully operational!`;

    } catch(e) { 
      console.error('Write Failed:', e); 
      this.syncResult = `ERROR: ${e}`;
    }
    this.isWriting = false;
  }

  private calculateDaysSinceReserve(reserveDateStr: string | null): number | null {
    if (!reserveDateStr) return null;
    const currentEasternStr = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
    const currentEasternDate = new Date(currentEasternStr);
    const reserveDate = new Date(reserveDateStr + "T00:00:00-04:00"); 
    return Math.floor((currentEasternDate.getTime() - reserveDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  private calculateDaysToProgramStart(startDateStr: string | null): number | null {
    if (!startDateStr) return null;
    const currentEasternStr = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
    const currentEasternDate = new Date(currentEasternStr);
    const startDate = new Date(startDateStr + "T00:00:00-04:00");
    return Math.floor((startDate.getTime() - currentEasternDate.getTime()) / (1000 * 60 * 60 * 24));
  }
}
