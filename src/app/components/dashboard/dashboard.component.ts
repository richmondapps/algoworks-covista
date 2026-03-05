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
  imports: [CommonModule, RouterLink, FormsModule, FilterRiskPipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  studentService = inject(StudentService);

  // Base raw stream from database
  allStudents = this.studentService.students;

  // The active UI filter state
  filterMode = signal<'All' | 'High Risk' | 'Action Required'>('All');

  // Inline edit state
  editingId = signal<string | null>(null);
  editEmail = signal<string>('');
  editPhone = signal<string>('');

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

  countAll = computed(() => this.allStudents().length);
  countHighRisk = computed(() => this.allStudents().filter(s => s.riskIndicator === 'High').length);
  countActionReq = computed(() => this.allStudents().filter(s => s.actionRequired).length);

  getMissingItems(checklist: any[]) {
    if (!checklist) return [];
    return checklist.filter(c => c.status === 'Missing');
  }

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

  startEdit(event: Event, student: Student) {
    event.stopPropagation();
    event.preventDefault();
    this.editingId.set(student.id);
    this.editEmail.set(student.email);
    this.editPhone.set(student.phone);
  }

  cancelEdit(event: Event) {
    event.stopPropagation();
    event.preventDefault();
    this.editingId.set(null);
  }

  async saveEdit(event: Event, student: Student) {
    event.stopPropagation();
    event.preventDefault();
    await this.studentService.updateStudent(student.id, {
      email: this.editEmail(),
      phone: this.editPhone()
    });
    this.editingId.set(null);
  }
}
