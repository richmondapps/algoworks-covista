import { Injectable, inject, signal, NgZone } from '@angular/core';
import { Firestore, collection, collectionData, doc, setDoc, query, orderBy, where, getDocs, writeBatch, onSnapshot } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Student } from '../models/student';

const COLLECTION_NAME = 'student_records'; // Migrated to bypass cached legacy windows

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
          { id: 'r1', title: 'Email Reminder', description: 'Student needs to login to WWOW.', priority: 'Medium', type: 'Email' }
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
}
