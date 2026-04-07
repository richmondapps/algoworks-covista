import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, getDocs, orderBy, query } from '@angular/fire/firestore';

@Component({
  selector: 'app-feedback-summary',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './feedback-summary.component.html',
  styleUrl: './feedback-summary.component.scss'
})
export class FeedbackSummaryComponent implements OnInit {
  private firestore = inject(Firestore);
  
  feedbacks: any[] = [];
  loading = true;

  async ngOnInit() {
    try {
      const q = query(collection(this.firestore, 'feedback_submissions'), orderBy('timestamp', 'desc'));
      const snapshot = await getDocs(q);
      this.feedbacks = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
      console.error('Failed to load feedback', e);
    } finally {
      this.loading = false;
    }
  }
}
