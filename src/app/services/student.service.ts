import { Injectable, inject, signal, NgZone } from '@angular/core';
import { Firestore, collection, collectionData, doc, setDoc, query, orderBy, where, getDocs, writeBatch, onSnapshot, deleteField, getDoc, collectionGroup } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Student, AiOutputsLatest, PersonalizedChecklist, StudentActivityLog } from '../models/student';

const COLLECTION_NAME = 'salesforce_opportunities'; // Fully Migrated to V17.3 Data Contract

@Injectable({
  providedIn: 'root'
})
export class StudentService {
  private firestore: Firestore = inject(Firestore);
  private functions: Functions = inject(Functions);
  private zone: NgZone = inject(NgZone);

  public students = signal<Student[]>([]);

  constructor() {
    this.loadStudents();
  }

  loadStudents() {
    const studentsRef = collection(this.firestore, COLLECTION_NAME);

    // Realtime listener using native onSnapshot to bypass rxfire bugs with new firebase SDKs
    onSnapshot(studentsRef, (snapshot) => {
      this.zone.run(() => {
        const data = snapshot.docs.map(doc => {
          const raw = doc.data();
          const s = { 
            id: doc.id, 
            ...raw,
            name: raw['studentName'] || raw['student_name'] || raw['name'] || 'Unknown Student',
            programStartDate: raw['program_start_date'] || raw['programStartDate'],
            reserveDate: raw['reserve_date'] || raw['reserveDate'],
            censusDate: raw['census_date'] || raw['censusDate'],
            requirements: raw['requirements'] || {}
          } as any as Student;
          const today = new Date().getTime();
          
          if (s.programStartDate) {
            const start = new Date(s.programStartDate).getTime();
            s.timeUntilClassStartDays = Math.ceil((start - today) / (1000 * 3600 * 24));
          }
          if (s.reserveDate) {
            const reserve = new Date(s.reserveDate).getTime();
            s.timeSinceReserveDays = Math.floor((today - reserve) / (1000 * 3600 * 24));
          }
          

          
          if (!s.aiInsights) {
              s.aiInsights = {} as any;
          }

          // Only fall back to localized hardcoded constraints if the Python architecture hasn't mapped customized logic!
          const hasGeneratedActions = s.aiInsights?.nextBestActions && s.aiInsights.nextBestActions.length > 0;
          if (!hasGeneratedActions) {
            if (!s.aiInsights!.nextBestActions) {
                s.aiInsights!.nextBestActions = [];
            }

          if (!s.requirements.initialPortalLogin) {
            s.aiInsights!.nextBestActions.push({
              title: 'Initial portal login / Not logged into course',
              urgent: true,
              points: [
                'Link to student portal & Canvas course',
                'Reserves email address',
                'How to Log into Your Student Portal: https://youtu.be/ClgP0GtP2uQ',
                'How to Access Your Walden Orientation: https://youtu.be/67vGaf0uMEQ',
                'Estimated time to complete - 5 min'
              ],
              buttonText: 'Send Email'
            });
          }

          if (!s.requirements.fafsaSubmitted) {
            s.aiInsights!.nextBestActions.push({
              title: 'Funding - FAFSA Submission Needed',
              urgent: true,
              points: [
                'Walden Federal School Code: 025042',
                'FAFSA Link: https://studentaid.gov/h/apply-for-aid/fafsa',
                'Academic Year',
                'How to Apply for Financial Aid: https://youtu.be/pimitLbiBoE',
                'Estimated time to complete - 30 min'
              ],
              buttonText: 'Send Email'
            });
          }

          if (!s.requirements.courseRegistration) {
            s.aiInsights!.nextBestActions.push({
              title: 'No Course Registration - student dropped',
              urgent: true,
              points: [
                'Link to register or reregister for courses',
                'Suggested course recommendations',
                'Link to schedule appointment with ES'
              ],
              buttonText: 'Send Email'
            });
          }

          if (!s.requirements.wowOrientation) {
            s.aiInsights!.nextBestActions.push({
              title: 'No WOW Login',
              urgent: true,
              points: [
                'Link to WOW orientation',
                'Estimated time to complete - 25 min'
              ],
              buttonText: 'Send Email'
            });
          }

          if (!s.requirements.officialTranscriptsReceived) {
            s.aiInsights!.nextBestActions.push({
              title: 'Contingency - Official Transcript',
              urgent: true,
              points: [
                'School name',
                'Link to school transcript request',
                'Link for Walden to request TRF if applicable',
                'Estimated time to complete - 10 min'
              ],
              buttonText: 'Send Email'
            });
          }
          
            if (!s.requirements.nursingLicenseReceived) {
              s.aiInsights!.nextBestActions.push({
                title: 'Contingency - Nursing License',
                urgent: true,
                points: [
                  'Instruction on where to submit nursing license',
                  'Estimated time to complete - 5 min'
                ],
                buttonText: 'Send Email'
              });
            }
          }

          s.actionRequired = (s.aiInsights?.readinessRisk?.level === 'Low' || s.readinessLevel === 'Low') || (s.aiInsights?.engagementLevel?.level === 'Low' || s.engagementLevel === 'Low');
          
          return s;
        });
        
        this.students.set(data);
      });
    }, (error) => {
      console.error('Error in onSnapshot students listener:', error);
    });
  }

  // Mimic pub/sub button action to fetch and order
  async triggerActionCheck() {
    const studentsRef = collection(this.firestore, COLLECTION_NAME);
    const q = query(studentsRef, where('actionRequired', '==', true), orderBy('timeUntilClassStartDays', 'asc'));

    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
    this.students.set(data);
  }

  getStudent(id: string): Student | undefined {
    return this.students().find(s => s.id === id);
  }


  async updateStudent(id: string, data: Partial<Student>) {
    const studentDoc = doc(this.firestore, `${COLLECTION_NAME}/${id}`);
    await setDoc(studentDoc, data, { merge: true });
  }

  async clearAiInsights(id: string) {
    const studentDoc = doc(this.firestore, `${COLLECTION_NAME}/${id}`);
    await setDoc(studentDoc, { aiInsights: deleteField() }, { merge: true });
  }

  // ---------------------------------------------------------------
  // Subcollection: ai_insights/latest
  // ---------------------------------------------------------------
  async loadAiOutputs(studentId: string): Promise<AiOutputsLatest | null> {
    const latestRef = doc(this.firestore, `${COLLECTION_NAME}/${studentId}/ai_insights/latest`);
    try {
      const snap = await getDoc(latestRef);
      return snap.exists() ? (snap.data() as AiOutputsLatest) : null;
    } catch (e) {
      console.warn('[student.service] Subcollection schema read blocked by active Firestore Rules. Seamlessly yielding to root backward-compatibility...');
      return null;
    }
  }

  // ---------------------------------------------------------------
  // Subcollection: personalized_checklists
  // ---------------------------------------------------------------
  async loadChecklists(studentId: string): Promise<PersonalizedChecklist[]> {
    const ref = collection(this.firestore, `${COLLECTION_NAME}/${studentId}/personalized_checklists`);
    try {
      const snap = await getDocs(ref);
      return snap.docs.map(d => ({ requirement_id: d.id, ...d.data() } as PersonalizedChecklist));
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------------
  // Subcollection: activity_logs (last 100 events, most recent first)
  // ---------------------------------------------------------------
  async loadActivityLogs(studentId: string): Promise<StudentActivityLog[]> {
    const ref = collection(this.firestore, `${COLLECTION_NAME}/${studentId}/activity_logs`);
    const q = query(ref, orderBy('activity_datetime', 'desc'));
    try {
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ log_id: d.id, ...d.data() } as StudentActivityLog));
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------------
  // Trigger AI generation via isGeneratingAi signal field
  // ---------------------------------------------------------------
  async triggerAiGeneration(studentId: string): Promise<void> {
    const studentDoc = doc(this.firestore, `${COLLECTION_NAME}/${studentId}`);
    
    // Explicitly snap the user's localized browser date string to prevent Vertex UTC shift hallucinations
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const localDateStr = `${y}-${m}-${d}`;

    await setDoc(studentDoc, { 
      isGeneratingAi: true, 
      isGeneratingComms: true,
      syncTimestamp: Date.now(),
      uiCalculatedDateStr: localDateStr
    }, { merge: true });
  }

  async waitForAiGeneration(studentId: string): Promise<any> {
    let attempts = 0;
    while (attempts < 120) {
      await new Promise(r => setTimeout(r, 1000));
      const studentDoc = doc(this.firestore, `${COLLECTION_NAME}/${studentId}`);
      const snap = await getDoc(studentDoc);
      if (snap.exists() && snap.data()['isGeneratingAi'] === false) {
          if (snap.data()['lastAiError']) {
              throw new Error(snap.data()['lastAiError']);
          }
          return snap.data();
      }
      attempts++;
    }
    throw new Error("AI Generation timed out waiting for backend orchestrator.");
  }

  async waitForCommsGeneration(studentId: string): Promise<any> {
    let attempts = 0;
    while (attempts < 120) {
      await new Promise(r => setTimeout(r, 1000));
      const studentDoc = doc(this.firestore, `${COLLECTION_NAME}/${studentId}`);
      const snap = await getDoc(studentDoc);
      if (snap.exists() && snap.data()['isGeneratingComms'] === false) {
          return snap.data();
      }
      attempts++;
    }
    console.warn("Communications generation organically timed out. Returning partial UI.");
  }

  async queryDocumentInfo(studentUid: string, fileName: string, query: string) {
    const callable = httpsCallable<{ studentUid: string, fileName: string, query: string }, any>(this.functions, 'queryStudentDocument');
    try {
      const response = await callable({ studentUid, fileName, query });
      return response.data;
    } catch (e) {
      console.error('Failed to intelligently query document', e);
      throw e;
    }
  }

  async initializeDummyData() {
    const dummyStudents: Student[] = [
      {
        id: 'M2ncaGellerUID1234567890123',
        studentUid: 'M2ncaGellerUID1234567890123',
        name: 'Monica Geller',
        email: 'monica.geller.csc@gmail.com',
        phone: '+1-555-0102',
        timeSinceReserveDays: 30,
        timeUntilClassStartDays: 45,
        engagementLevel: 'High',
        riskIndicator: 'Low',
        actionRequired: false,
        stats: { emailOpens: 5, smsClicks: 2, bestMethod: 'Email' },
        requirements: {} as any,
        recommendedActions: []
      },
      {
        id: 'C3hndlrBingUID1234567890123',
        studentUid: 'C3hndlrBingUID1234567890123',
        name: 'Peter Griffin',
        email: 'peter.griffin@quahog.net',
        phone: '+1-555-0103',
        timeSinceReserveDays: 2,
        timeUntilClassStartDays: 7,
        engagementLevel: 'Low',
        riskIndicator: 'High',
        actionRequired: true,
        stats: { emailOpens: 0, smsClicks: 0, bestMethod: 'SMS' },
        requirements: {} as any,
        recommendedActions: [
          { id: 'r1', title: 'Call immediately', description: 'Student is missing all requirements days before start.', priority: 'High', type: 'Call' }
        ]
      },
      {
        id: 'R1OsGellerUID12345678901234',
        studentUid: 'R1OsGellerUID12345678901234',
        name: 'Ross Geller',
        email: 'ross@paleontology.edu',
        phone: '+1-555-0101',
        timeSinceReserveDays: 14,
        timeUntilClassStartDays: 20,
        engagementLevel: 'Medium',
        riskIndicator: 'Medium',
        actionRequired: true,
        stats: { emailOpens: 1, smsClicks: 0, bestMethod: 'Email' },
        requirements: {} as any,
        recommendedActions: [
          { id: 'r1', title: 'Send Urgent SMS', description: 'Urgent reminder needed for missing financial aid.', priority: 'Medium', type: 'SMS' }
        ]
      },
      {
        id: 'P5oebeBuffyUID1234567890123',
        studentUid: 'P5oebeBuffyUID1234567890123',
        name: 'Phoebe Buffay',
        email: 'phoebe@music.com',
        phone: '+1-555-0105',
        timeSinceReserveDays: 10,
        timeUntilClassStartDays: 25,
        engagementLevel: 'Medium',
        riskIndicator: 'Medium',
        actionRequired: true,
        stats: { emailOpens: 2, smsClicks: 1, bestMethod: 'Email' },
        requirements: {} as any,
        recommendedActions: [
          { id: 'r1', title: 'Email Reminder', description: 'Student needs to login to WOW.', priority: 'Medium', type: 'Email' }
        ]
      },
      {
        id: 'R6achelGrenUID1234567890123',
        studentUid: 'R6achelGrenUID1234567890123',
        name: 'Rachel Green',
        email: 'rachel@fashion.com',
        phone: '+1-555-0106',
        timeSinceReserveDays: 5,
        timeUntilClassStartDays: 14,
        engagementLevel: 'Medium',
        riskIndicator: 'High',
        actionRequired: true,
        stats: { emailOpens: 3, smsClicks: 3, bestMethod: 'SMS' },
        requirements: {} as any,
        recommendedActions: [
          { id: 'r1', title: 'Send Registration Reminder', description: 'Registration open but missing.', priority: 'High', type: 'SMS' }
        ]
      }
    ];

    const batch = writeBatch(this.firestore);
    dummyStudents.forEach(student => {
      const docRef = doc(this.firestore, `${COLLECTION_NAME}/${student.id}`);
      batch.set(docRef, student);
    });

    await batch.commit();
  }

  private computeReadinessLevel(s: Student): 'Low' | 'Medium' | 'High' {
    const reqs = s.requirements || {};
    let completed = 0;
    
    if (reqs.initialPortalLogin) completed++;
    if (reqs.fafsaSubmitted) completed++;
    if (reqs.courseRegistration) completed++;
    if (reqs.wowOrientation) completed++;
    if (reqs.courseLogin) completed++;
    if (reqs.classParticipation) completed++;
    
    if (completed === 6) return 'High';
    if (completed >= 3) return 'Medium';
    return 'Low';
  }

  private computeEngagementLevel(s: Student): 'Low' | 'Medium' | 'High' {
    const stats = s.stats || { emailOpens: 0, smsClicks: 0 };
    const interactions = (stats.emailOpens || 0) + (stats.smsClicks || 0);
    
    if (interactions > 3) return 'High';
    if (interactions > 0) return 'Medium';
    return 'Low';
  }
}
