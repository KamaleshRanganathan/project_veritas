import { Component, inject, OnInit } from '@angular/core';
import { ApiService } from '../../services/api';
import { AuthService } from '../../services/auth';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home-teacher',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './home-teacher.html',
  styleUrl: './home-teacher.css'
})
export class HomeTeacher implements OnInit {
  private apiService: ApiService = inject(ApiService);
  private authService: AuthService = inject(AuthService);
  private formBuilder: FormBuilder = inject(FormBuilder);

  createTeamForm: FormGroup;
  teacherId: string | null = null;
  teams: any[] = [];

  constructor() {
    this.createTeamForm = this.formBuilder.group({
      teamName: ['', Validators.required],
      teamCode: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    this.authService.authState$.subscribe(user => {
      if (user) {
        this.teacherId = user.uid;
        this.loadTeams();
      }
    });
  }

  loadTeams(): void {
    if (this.teacherId) {
      this.apiService.getTeacherTeams(this.teacherId).subscribe(
        (response) => {
          this.teams = response;
        },
        (error) => {
          console.error('Failed to get teams:', error);
        }
      );
    }
  }

  onCreateTeam(): void {
    console.log('Form Valid:', this.createTeamForm.valid);
    console.log('Form Values:', this.createTeamForm.value);
    console.log('Teacher ID:', this.teacherId);

    if (this.createTeamForm.valid && this.teacherId) {
      const { teamName, teamCode } = this.createTeamForm.value;
      this.apiService.createTeam(this.teacherId, teamName, teamCode).subscribe(
        (response) => {
          console.log('Team created successfully:', response);
          alert('Team created successfully!');
          this.createTeamForm.reset();
          this.loadTeams(); // Refresh the teams list
        },
        (error) => {
          console.error('Failed to create team:', error);
          alert('Failed to create team. Please try again.');
        }
      );
    }
  }

  logout() {
    this.authService.logout();
  }
}
