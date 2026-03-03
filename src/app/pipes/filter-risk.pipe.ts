import { Pipe, PipeTransform } from '@angular/core';
import { Student } from '../models/student';

@Pipe({
  name: 'filterRisk',
  standalone: true
})
export class FilterRiskPipe implements PipeTransform {
  transform(students: Student[] | null | undefined, riskLevel: string): Student[] {
    if (!students) return [];
    return students.filter(s => s.riskIndicator === riskLevel);
  }
}
