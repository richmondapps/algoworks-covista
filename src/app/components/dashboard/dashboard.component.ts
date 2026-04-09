import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { StudentService } from '../../services/student.service';
import { FilterRiskPipe } from '../../pipes/filter-risk.pipe';
import { Student } from '../../models/student';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  studentService = inject(StudentService);

  // Base raw stream from database
  allStudents = this.studentService.students;

  // Dynamic filtering states
  engagementFilter = signal<'All' | 'High' | 'Medium' | 'Low'>('All');
  readinessFilter = signal<'All' | 'High' | 'Medium' | 'Low'>('All');

  // Unified sorting states
  sortField = signal<'name' | 'readiness' | 'engagement' | 'timeReserve' | 'timeStart' | ''>('');
  sortDir = signal<'asc' | 'desc'>('asc');

  // Computed projection combining multi-layered filtering AND sorting natively
  students = computed(() => {
    let list = this.allStudents();

    // 1. Evaluate Filters
    const eFilt = this.engagementFilter();
    if (eFilt !== 'All') {
      list = list.filter(s => (s.aiInsights?.engagementRisk?.level || s.engagementLevel) === eFilt);
    }
    
    const rFilt = this.readinessFilter();
    if (rFilt !== 'All') {
      list = list.filter(s => (s.aiInsights?.readinessRisk?.level || s.riskIndicator) === rFilt);
    }

    // 2. Evaluate Sorting matrix
    const field = this.sortField();
    const dir = this.sortDir() === 'asc' ? 1 : -1;

    if (field) {
      list = [...list].sort((a, b) => {
        let valA: any = 0;
        let valB: any = 0;

        if (field === 'name') {
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
        } else if (field === 'readiness') {
          // Normalize rank map (High > Medium > Low)
          const rank: any = { 'High': 3, 'Medium': 2, 'Low': 1 };
          valA = rank[a.aiInsights?.readinessRisk?.level || a.riskIndicator || 'Low'] || 0;
          valB = rank[b.aiInsights?.readinessRisk?.level || b.riskIndicator || 'Low'] || 0;
        } else if (field === 'engagement') {
          const rank: any = { 'High': 3, 'Medium': 2, 'Low': 1 };
          valA = rank[a.aiInsights?.engagementRisk?.level || a.engagementLevel || 'Low'] || 0;
          valB = rank[b.aiInsights?.engagementRisk?.level || b.engagementLevel || 'Low'] || 0;
        } else if (field === 'timeReserve') {
          valA = a.timeSinceReserveDays || 0;
          valB = b.timeSinceReserveDays || 0;
        } else if (field === 'timeStart') {
          valA = a.timeUntilClassStartDays || 0;
          valB = b.timeUntilClassStartDays || 0;
        }

        if (valA < valB) return -1 * dir;
        if (valA > valB) return 1 * dir;
        return 0;
      });
    }

    return list;
  });

  setSort(field: 'name' | 'readiness' | 'engagement' | 'timeReserve' | 'timeStart') {
    if (this.sortField() === field) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortField.set(field);
      this.sortDir.set('asc');
    }
  }


}
