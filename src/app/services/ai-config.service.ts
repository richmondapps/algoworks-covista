import { Injectable, inject, signal } from '@angular/core';
import { Firestore, collection, doc, setDoc, deleteDoc, onSnapshot } from '@angular/fire/firestore';

export interface AiPromptConfig {
  id?: string;
  type: 'Readiness Checklist' | 'EmailPattern' | 'Elective Activity' | 'ChecklistItem';
  title: string;
  content: string; // The rich text payload
  condition?: string; // e.g., 'Risk > High'
  logicNotes?: string; // e.g. for ChecklistItem specifics
  templateId?: string; // e.g., 'EM-FAFSA-V1'
  subject?: string; // e.g., 'Important Update Regarding Your Enrollment'
  priority?: 'High' | 'Medium' | 'Low';
  
  // Readiness Checklist Specific Fields
  lowReadiness?: string;
  mediumReadiness?: string;
  highReadiness?: string;
  happyPath?: string;
  checklistNotes?: string; // Additional explicit notes for the UI

  // Elective Activity / Shared Fields
  nbaDisplay?: string; // Title & Language to display under Next Best Actions
  talkingPoints?: string;
  emailLanguage?: string;
  directLink?: string;
  guardrails?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AiConfigService {
  private firestore = inject(Firestore);
  private collectionName = 'ai_configurations';

  configs = signal<AiPromptConfig[]>([]);

  constructor() {
    this.initListener();
  }

  private initListener() {
    const configCollection = collection(this.firestore, this.collectionName);
    onSnapshot(configCollection, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AiPromptConfig));
      this.configs.set(data);
    });
  }

  async saveConfiguration(config: AiPromptConfig): Promise<void> {
    const isNew = !config.id;
    const docId = config.id || doc(collection(this.firestore, this.collectionName)).id;
    const docRef = doc(this.firestore, `${this.collectionName}/${docId}`);
    
    await setDoc(docRef, { ...config, id: docId }, { merge: true });
  }

  async deleteConfiguration(id: string): Promise<void> {
    const docRef = doc(this.firestore, `${this.collectionName}/${id}`);
    await deleteDoc(docRef);
  }
}
