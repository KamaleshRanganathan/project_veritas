import { Component, inject, OnInit } from '@angular/core';
import { AuthService } from '../../services/auth';
import { CommonModule } from '@angular/common'; // Import CommonModule for *ngFor
import { ApiService } from '../../services/api';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

export interface Group {
  id: string;
  name: string;
  code: string;
}

@Component({
  selector: 'app-home-student',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './home-student.html',
  styleUrl: './home-student.css'
})
export class HomeStudent implements OnInit {
  private authService : AuthService = inject(AuthService);
  private apiService: ApiService = inject(ApiService);
  private formBuilder: FormBuilder = inject(FormBuilder);

  uploadForm: FormGroup;
  joinTeamForm: FormGroup; // New form for joining a team
  groups: Group[] = [];
  studentId: string | null = null;
  userEmail: string | null = null;
  selectedTeam: Group | null = null;

  constructor() {
    this.uploadForm = this.formBuilder.group({
      docFile: [null, Validators.required]
    });
    this.joinTeamForm = this.formBuilder.group({
      teamCode: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    this.authService.authState$.subscribe(user => {
      if (user) {
        this.studentId = user.uid;
        this.userEmail = user.email;
        this.loadGroups();
      }
    });
  }

  loadGroups(): void {
    if (this.studentId) {
      this.apiService.getStudentGroups(this.studentId).subscribe(
        (data) => {
          this.groups = data;
        },
        (error) => {
          console.error('Error fetching groups:', error);
        }
      );
    }
  }

  onFileChange(event: any): void {
    if (event.target.files.length > 0) {
      const file = event.target.files[0];
      this.uploadForm.patchValue({
        docFile: file
      });
    }
  }

  onSubmit(): void {
    if (this.uploadForm.valid && this.studentId && this.selectedTeam) {
      const { docFile } = this.uploadForm.value;
      this.apiService.uploadDocument(this.selectedTeam.id, this.studentId, docFile).subscribe(
        (response) => {
          console.log('Upload successful:', response);
          alert('Upload successful!');
          this.selectedTeam = null;
        },
        (error) => {
          console.error('Upload failed:', error);
          alert('Upload failed. Please try again.');
        }
      );
    }
  }

  onJoinTeam(): void {
    if (this.joinTeamForm.valid && this.studentId) {
      const { teamCode } = this.joinTeamForm.value;
      this.apiService.joinTeam(this.studentId, teamCode).subscribe(
        (response) => {
          console.log('Joined team successfully:', response);
          this.loadGroups(); // Reload groups after joining
          this.joinTeamForm.reset(); // Clear the form
        },
        (error) => {
          console.error('Failed to join team:', error);
          alert('Failed to join team. Please check the code.');
        }
      );
    }
  }

  selectTeamForUpload(team: Group): void {
    this.selectedTeam = team;
  }

  logout() {
    this.authService.logout();
  }

  trackByGroupId(index: number, group: Group): string {
    return group.id;
  }
}