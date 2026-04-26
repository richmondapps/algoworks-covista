import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { StudentService } from '../../services/student.service';
import { AuthService } from '../../services/auth.service';
import { FilterRiskPipe } from '../../pipes/filter-risk.pipe';
import { Student } from '../../models/student';
import { Firestore, doc, setDoc } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  studentService = inject(StudentService);
  private firestore = inject(Firestore);
  private functions = inject(Functions);
  auth = inject(AuthService);



  // Base raw stream from database
  allStudents = this.studentService.students;

  // The active UI filter state
  searchQuery = signal<string>('');
  engagementFilter = signal<'All' | 'High' | 'Medium' | 'Low'>('All');
  readinessFilter = signal<'All' | 'High' | 'Medium' | 'Low'>('All');

  formatLevel(level?: string | null): string {
    if (!level) return 'Medium';
    let formatted = level.charAt(0).toUpperCase() + level.slice(1).toLowerCase();
    return formatted;
  }

  sortColumn = signal<string>('name');
  sortDirection = signal<'asc' | 'desc'>('asc');

  setSort(column: string) {
    if (this.sortColumn() === column) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
  }

  // Computed projection based on active filter
  students = computed(() => {
    const list = this.allStudents();
    const engFilter = this.engagementFilter();
    const readFilter = this.readinessFilter();
    const q = this.searchQuery().toLowerCase().trim();
    const col = this.sortColumn();
    const dir = this.sortDirection();

    const filtered = list.filter(s => {
      // Find actual values and apply native logic for the UI view
      const rawReadiness = s.aiInsights?.readinessRisk?.level || s.readinessLevel || s.riskIndicator || null;
      const rawEngagement = s.aiInsights?.engagementRisk?.level || s.engagementLevel || null;

      const sReadiness = this.formatLevel(rawReadiness);
      const sEngagement = this.formatLevel(rawEngagement);
      
      const passesReadiness = readFilter === 'All' || (sReadiness === readFilter);
      const passesEngagement = engFilter === 'All' || (sEngagement === engFilter);
      const passesSearch = !q || (s.name?.toLowerCase().includes(q) || s.id.toLowerCase().includes(q));
      
      return passesReadiness && passesEngagement && passesSearch;
    });

    return filtered.sort((a, b) => {
      let valA: any = '';
      let valB: any = '';
      
      if (col === 'name') {
         valA = a.name?.toLowerCase() || ''; valB = b.name?.toLowerCase() || '';
      } else if (col === 'readiness') {
         valA = this.formatLevel(a.aiInsights?.readinessRisk?.level || a.readinessLevel || a.riskIndicator);
         valB = this.formatLevel(b.aiInsights?.readinessRisk?.level || b.readinessLevel || b.riskIndicator);
      } else if (col === 'engagement') {
         valA = this.formatLevel(a.aiInsights?.engagementRisk?.level || a.engagementLevel);
         valB = this.formatLevel(b.aiInsights?.engagementRisk?.level || b.engagementLevel);
      } else if (col === 'timeReserve') {
         valA = a.timeSinceReserveDays || 0; valB = b.timeSinceReserveDays || 0;
      } else if (col === 'timeStart') {
         valA = a.timeUntilClassStartDays || 0; valB = b.timeUntilClassStartDays || 0;
      }

      if (valA < valB) return dir === 'asc' ? -1 : 1;
      if (valA > valB) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  });

  countAll = computed(() => this.allStudents().length);

  getMissingItems(checklist: any[]) {
    if (!checklist) return [];
    return checklist.filter(c => c.status === 'Missing');
  }


}
