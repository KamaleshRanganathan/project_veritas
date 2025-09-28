import { Component, inject } from '@angular/core';
import { AuthService } from '../../services/auth';
import { Groups } from '../../component/groups/groups';
import { CommonModule } from '@angular/common'; // Import CommonModule for *ngFor


export interface Group {
  id: number;
  name: string;
  date: string;
  status : string;
}

@Component({
  selector: 'app-home-student',
  imports: [CommonModule, Groups], 
  templateUrl: './home-student.html',
  styleUrl: './home-student.css'
})
export class HomeStudent {
  private authService : AuthService = inject(AuthService);

  logout() {
    this.authService.logout();
  }
  
  groups: Group[] = [
    { id: 1, name: 'MATHS DA -1 ', date: '2025-09-30', status: 'Completed' },
    { id: 2, name: 'NOSQL DA -2', date: '2025-09-30' , status: 'Pending' },
    { id: 3, name: 'RTA HOMEWORK', date: '2025-09-30', status: 'In Progress' }
  ];

  trackByGroupId(index: number, groups: Group): number {
    return groups.id;
  }
}