import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { StudentService } from '../../services/student.service';
import { FilterRiskPipe } from '../../pipes/filter-risk.pipe';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FilterRiskPipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  studentService = inject(StudentService);

  // Base raw stream from database
  allStudents = this.studentService.students;

  // The active UI filter state
  filterMode = signal<'All' | 'High Risk' | 'Action Required'>('All');

  // Computed projection based on active filter
  students = computed(() => {
    const list = this.allStudents();
    const mode = this.filterMode();

    if (mode === 'High Risk') {
      return list.filter(s => s.riskIndicator === 'High');
    }
    if (mode === 'Action Required') {
      return list.filter(s => s.actionRequired);
    }

    return list;
  });

  isLoading = signal(false);

  async triggerAction() {
    this.isLoading.set(true);
    await this.studentService.triggerActionCheck();
    // Enforce view to newly fetched prioritized objects
    this.filterMode.set('Action Required');
    this.isLoading.set(false);
  }

  setFilter(mode: 'All' | 'High Risk' | 'Action Required') {
    this.filterMode.set(mode);
  }
}
