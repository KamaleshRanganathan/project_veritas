import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../services/api';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-team-assignments',
  imports: [CommonModule],
  templateUrl: './team-assignments.html',
  styleUrls: ['./team-assignments.css']
})
export class TeamAssignments implements OnInit {
  private route: ActivatedRoute = inject(ActivatedRoute);
  private apiService: ApiService = inject(ApiService);

  teamId: string | null = null;
  assignments: any[] = [];
  plagiarismDetails: any = null;

  ngOnInit(): void {
    this.teamId = this.route.snapshot.paramMap.get('id');
    if (this.teamId) {
      this.apiService.getAssignmentsForTeam(this.teamId).subscribe(
        (response) => {
          this.assignments = response.assignments;
          this.plagiarismDetails = response.plagiarism;
        },
        (error) => {
          console.error('Failed to get assignments:', error);
        }
      );
    }
  }
}
