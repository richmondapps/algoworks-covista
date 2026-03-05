import { Injectable, inject, signal, NgZone } from '@angular/core';
import { Firestore, collection, collectionData, doc, setDoc, query, orderBy, where, getDocs, writeBatch, onSnapshot } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Student } from '../models/student';

const COLLECTION_NAME = 'students';

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
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Student);
        if (data.length === 0) {
          this.initializeDummyData();
        } else {
          this.students.set(data);
        }
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

  async generateAiInsights(student: Student) {
    const callable = httpsCallable(this.functions, 'generateStudentInsights');
    try {
      const response = await callable({
        studentUid: student.id,
        dataContext: student
      });
      return response.data;
    } catch (e) {
      console.error('Failed to generate insights', e);
      throw e;
    }
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
        uid: 'M2ncaGellerUID1234567890123',
        name: 'Monica Geller',
        email: 'monica.geller.csc@gmail.com',
        phone: '+1-555-0102',
        timeSinceReserveDays: 30,
        timeUntilClassStartDays: 45,
        engagementLevel: 'High',
        riskIndicator: 'Low',
        actionRequired: false,
        stats: { emailOpens: 5, smsClicks: 2, bestMethod: 'Email' },
        checklist: [
          { id: 'c1', name: 'Initial Portal Login', status: 'Complete', dueDate: new Date().toISOString() },
          { id: 'c2', name: 'FAFSA Submission', status: 'Complete', dueDate: new Date().toISOString() },
          { id: 'c3', name: 'Course Registration', status: 'Complete', dueDate: new Date().toISOString() },
          { id: 'c4', name: 'WWOW (Log in)', status: 'Complete', dueDate: new Date().toISOString() },
          { id: 'c5', name: 'Official Transcripts', status: 'Complete', dueDate: new Date().toISOString() },
          { id: 'c6', name: 'Course Login', status: 'Complete', dueDate: new Date().toISOString() },
          { id: 'c7', name: 'Class Participation', status: 'Complete', dueDate: new Date().toISOString() }
        ],
        recommendedActions: []
      },
      {
        id: 'C3hndlrBingUID1234567890123',
        uid: 'C3hndlrBingUID1234567890123',
        name: 'Chandler Bing',
        email: 'purpletoothtigers@gmail.com',
        phone: '+1-555-0103',
        timeSinceReserveDays: 2,
        timeUntilClassStartDays: 7,
        engagementLevel: 'Low',
        riskIndicator: 'High',
        actionRequired: true,
        stats: { emailOpens: 0, smsClicks: 0, bestMethod: 'SMS' },
        checklist: [
          { id: 'c1', name: 'Initial Portal Login', status: 'Missing', dueDate: new Date(Date.now() + 86400000 * 2).toISOString() },
          { id: 'c2', name: 'FAFSA Submission', status: 'Missing', dueDate: new Date(Date.now() + 86400000 * 2).toISOString() },
          { id: 'c3', name: 'Course Registration', status: 'Missing', dueDate: new Date(Date.now() + 86400000 * 2).toISOString() },
          { id: 'c4', name: 'WWOW (Log in)', status: 'Missing', dueDate: new Date(Date.now() + 86400000 * 2).toISOString() },
          { id: 'c5', name: 'Official Transcripts', status: 'Missing', dueDate: new Date(Date.now() + 86400000 * 2).toISOString() },
          { id: 'c6', name: 'Course Login', status: 'Pending', dueDate: new Date(Date.now() + 86400000 * 9).toISOString() },
          { id: 'c7', name: 'Class Participation', status: 'Pending', dueDate: new Date(Date.now() + 86400000 * 17).toISOString() }
        ],
        recommendedActions: [
          { id: 'r1', title: 'Call immediately', description: 'Student is missing all requirements days before start.', priority: 'High', type: 'Call' }
        ]
      },
      {
        id: 'R1OsGellerUID12345678901234',
        uid: 'R1OsGellerUID12345678901234',
        name: 'Ross Geller',
        email: 'ross@paleontology.edu',
        phone: '+1-555-0101',
        timeSinceReserveDays: 14,
        timeUntilClassStartDays: 20,
        engagementLevel: 'Medium',
        riskIndicator: 'Medium',
        actionRequired: true,
        stats: { emailOpens: 1, smsClicks: 0, bestMethod: 'Email' },
        checklist: [
          { id: 'c1', name: 'Initial Portal Login', status: 'Complete', dueDate: new Date().toISOString() },
          { id: 'c2', name: 'FAFSA Submission', status: 'Missing', dueDate: new Date(Date.now() + 86400000 * 5).toISOString() },
          { id: 'c3', name: 'Course Registration', status: 'Complete', dueDate: new Date().toISOString() },
          { id: 'c4', name: 'WWOW (Log in)', status: 'Complete', dueDate: new Date().toISOString() },
          { id: 'c5', name: 'Official Transcripts', status: 'Missing', dueDate: new Date(Date.now() + 86400000 * 5).toISOString() },
          { id: 'c6', name: 'Course Login', status: 'Pending', dueDate: new Date(Date.now() + 86400000 * 22).toISOString() },
          { id: 'c7', name: 'Class Participation', status: 'Pending', dueDate: new Date(Date.now() + 86400000 * 30).toISOString() }
        ],
        recommendedActions: [
          { id: 'r1', title: 'Send Urgent SMS', description: 'Urgent reminder needed for missing financial aid.', priority: 'Medium', type: 'SMS' }
        ]
      },
      {
        id: 'P5oebeBuffyUID1234567890123',
        uid: 'P5oebeBuffyUID1234567890123',
        name: 'Phoebe Buffay',
        email: 'phoebe@music.com',
        phone: '+1-555-0105',
        timeSinceReserveDays: 10,
        timeUntilClassStartDays: 25,
        engagementLevel: 'Medium',
        riskIndicator: 'Medium',
        actionRequired: true,
        stats: { emailOpens: 2, smsClicks: 1, bestMethod: 'Email' },
        checklist: [
          { id: 'c1', name: 'Initial Portal Login', status: 'Complete', dueDate: new Date().toISOString() },
          { id: 'c2', name: 'FAFSA Submission', status: 'Complete', dueDate: new Date().toISOString() },
          { id: 'c3', name: 'Course Registration', status: 'Missing', dueDate: new Date(Date.now() + 86400000 * 4).toISOString() },
          { id: 'c4', name: 'WWOW (Log in)', status: 'Missing', dueDate: new Date(Date.now() + 86400000 * 4).toISOString() },
          { id: 'c5', name: 'Official Transcripts', status: 'Complete', dueDate: new Date().toISOString() },
          { id: 'c6', name: 'Course Login', status: 'Pending', dueDate: new Date(Date.now() + 86400000 * 27).toISOString() },
          { id: 'c7', name: 'Class Participation', status: 'Pending', dueDate: new Date(Date.now() + 86400000 * 35).toISOString() }
        ],
        recommendedActions: [
          { id: 'r1', title: 'Email Transcripts Form', description: 'Student needs transcripts released.', priority: 'Medium', type: 'Email' }
        ]
      },
      {
        id: 'R6achelGrenUID1234567890123',
        uid: 'R6achelGrenUID1234567890123',
        name: 'Rachel Green',
        email: 'rachel@fashion.com',
        phone: '+1-555-0106',
        timeSinceReserveDays: 5,
        timeUntilClassStartDays: 14,
        engagementLevel: 'Medium',
        riskIndicator: 'High',
        actionRequired: true,
        stats: { emailOpens: 3, smsClicks: 3, bestMethod: 'SMS' },
        checklist: [
          { id: 'c1', name: 'Initial Portal Login', status: 'Complete', dueDate: new Date().toISOString() },
          { id: 'c2', name: 'FAFSA Submission', status: 'Missing', dueDate: new Date(Date.now() + 86400000 * 7).toISOString() },
          { id: 'c3', name: 'Course Registration', status: 'Missing', dueDate: new Date(Date.now() + 86400000 * 7).toISOString() },
          { id: 'c4', name: 'WWOW (Log in)', status: 'Missing', dueDate: new Date(Date.now() + 86400000 * 7).toISOString() },
          { id: 'c5', name: 'Official Transcripts', status: 'Missing', dueDate: new Date(Date.now() + 86400000 * 7).toISOString() },
          { id: 'c6', name: 'Course Login', status: 'Pending', dueDate: new Date(Date.now() + 86400000 * 16).toISOString() },
          { id: 'c7', name: 'Class Participation', status: 'Pending', dueDate: new Date(Date.now() + 86400000 * 24).toISOString() }
        ],
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
}
