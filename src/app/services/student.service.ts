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
        id: 'R1OsGellerUID12345678901234',
        uid: 'R1OsGellerUID12345678901234',
        name: 'Ross Geller',
        email: 'ross@paleontology.edu',
        phone: '+1-555-0101',
        timeSinceReserveDays: 14,
        timeUntilClassStartDays: 30,
        engagementLevel: 'Low',
        riskIndicator: 'High',
        actionRequired: true,
        stats: { emailOpens: 1, smsClicks: 0, bestMethod: 'Email' },
        checklist: [
          { id: 'c1', name: 'College Transcripts', status: 'Missing', dueDate: new Date(Date.now() + 86400000 * 5).toISOString() },
          { id: 'c2', name: 'Financial Aid Documents', status: 'Complete', dueDate: new Date().toISOString() }
        ],
        recommendedActions: [
          { id: 'r1', title: 'Request Transcripts', description: 'Urgent reminder needed for missing transcripts.', priority: 'High', type: 'Email' }
        ]
      },
      {
        id: 'M2ncaGellerUID1234567890123',
        uid: 'M2ncaGellerUID1234567890123',
        name: 'Monica Geller',
        email: 'monica.geller.csc@gmail.com',
        phone: '+1-555-0102',
        timeSinceReserveDays: 20,
        timeUntilClassStartDays: 45,
        engagementLevel: 'High',
        riskIndicator: 'Low',
        actionRequired: false,
        stats: { emailOpens: 5, smsClicks: 2, bestMethod: 'Email' },
        checklist: [
          { id: 'c1', name: 'College Transcripts', status: 'Complete', dueDate: new Date().toISOString() },
          { id: 'c2', name: 'Financial Aid Documents', status: 'Complete', dueDate: new Date().toISOString() }
        ],
        recommendedActions: []
      },
      {
        id: 'C3hndlrBingUID1234567890123',
        uid: 'C3hndlrBingUID1234567890123',
        name: 'Chandler Bing',
        email: 'purpletoothtigers@gmail.com',
        phone: '+1-555-0103',
        timeSinceReserveDays: 5,
        timeUntilClassStartDays: 15,
        engagementLevel: 'Medium',
        riskIndicator: 'Medium',
        actionRequired: true,
        stats: { emailOpens: 0, smsClicks: 3, bestMethod: 'SMS' },
        checklist: [
          { id: 'c1', name: 'College Transcripts', status: 'Complete', dueDate: new Date().toISOString() },
          { id: 'c2', name: 'Financial Aid Documents', status: 'Pending', dueDate: new Date(Date.now() + 86400000 * 10).toISOString() }
        ],
        recommendedActions: [
          { id: 'r1', title: 'Follow up on Financial Aid', description: 'Student has not submitted tax forms.', priority: 'Medium', type: 'SMS' }
        ]
      },
      {
        id: 'J4eyTribianUID1234567890123',
        uid: 'J4eyTribianUID1234567890123',
        name: 'Joey Tribbiani',
        email: 'joey@actor.com',
        phone: '+1-555-0104',
        timeSinceReserveDays: 30,
        timeUntilClassStartDays: 5,
        engagementLevel: 'Low',
        riskIndicator: 'High',
        actionRequired: true,
        stats: { emailOpens: 0, smsClicks: 0, bestMethod: 'SMS' },
        checklist: [
          { id: 'c1', name: 'College Transcripts', status: 'Missing', dueDate: new Date(Date.now() + 86400000 * 2).toISOString() },
          { id: 'c2', name: 'Financial Aid Documents', status: 'Missing', dueDate: new Date(Date.now() + 86400000 * 2).toISOString() }
        ],
        recommendedActions: [
          { id: 'r1', title: 'Call immediately', description: 'Student is at high risk of drop before census.', priority: 'High', type: 'Call' },
          { id: 'r2', title: 'Send Urgent SMS', description: 'Request missing documents.', priority: 'High', type: 'SMS' }
        ]
      },
      {
        id: 'P5oebeBuffyUID1234567890123',
        uid: 'P5oebeBuffyUID1234567890123',
        name: 'Phoebe Buffay',
        email: 'phoebe@music.com',
        phone: '+1-555-0105',
        timeSinceReserveDays: 10,
        timeUntilClassStartDays: 60,
        engagementLevel: 'Medium',
        riskIndicator: 'Low',
        actionRequired: false,
        stats: { emailOpens: 2, smsClicks: 1, bestMethod: 'Email' },
        checklist: [
          { id: 'c1', name: 'College Transcripts', status: 'Pending', dueDate: new Date(Date.now() + 86400000 * 20).toISOString() },
          { id: 'c2', name: 'Financial Aid Documents', status: 'Complete', dueDate: new Date().toISOString() }
        ],
        recommendedActions: []
      },
      {
        id: 'R6achelGrenUID1234567890123',
        uid: 'R6achelGrenUID1234567890123',
        name: 'Rachel Green',
        email: 'rachel@fashion.com',
        phone: '+1-555-0106',
        timeSinceReserveDays: 2,
        timeUntilClassStartDays: 14,
        engagementLevel: 'High',
        riskIndicator: 'Low',
        actionRequired: true,
        stats: { emailOpens: 3, smsClicks: 3, bestMethod: 'SMS' },
        checklist: [
          { id: 'c1', name: 'College Transcripts', status: 'Pending', dueDate: new Date(Date.now() + 86400000 * 7).toISOString() },
          { id: 'c2', name: 'Financial Aid Documents', status: 'Missing', dueDate: new Date(Date.now() + 86400000 * 7).toISOString() }
        ],
        recommendedActions: [
          { id: 'r1', title: 'Send SMS Reminder', description: 'Remind about Financial Aid.', priority: 'Medium', type: 'SMS' }
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
