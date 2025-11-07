import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:5000/api'; // Base URL for the backend API

  // Method to get all assignments for a specific team
  getAssignmentsForTeam(teamId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/works/${teamId}`);
  }

  // Method to submit a new assignment
  submitAssignment(teamId: string, studentId: string, docContent: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/works/${teamId}/${studentId}/doc_content`, { docContent });
  }

  // Method to get all assignments for a specific student in a specific team
  getAssignmentsForStudent(teamId: string, studentId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/works/${teamId}/${studentId}`);
  }

  // Method to get all groups for a student
  getStudentGroups(studentId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/students/${studentId}/teams`);
  }

  // Method to upload a document
  uploadDocument(teamId: string, studentId: string, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('docFile', file);
    return this.http.post(`${this.apiUrl}/works/${teamId}/${studentId}/doc_content`, formData);
  }

  // Method for student to join a team
  joinTeam(studentId: string, teamCode: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/students/${studentId}/join-team`, { teamCode });
  }

  // Method for teacher to create a team
  createTeam(teacherId: string, teamName: string, teamCode: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/teams`, { teacherId, teamName, teamCode });
  }

  // Method to get all teams for a teacher
  getTeacherTeams(teacherId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/teachers/${teacherId}/teams`);
  }

  // Method to create a teacher
  createTeacher(teacherId: string, name: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/teachers`, { teacherId, name });
  }

  // Method to create a student
  createStudent(studentId: string, name: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/students`, { studentId, name });
  }

  // Method to get assignments by teamId
  getAssignments(teamId: string): Observable<any> {
    let params = new HttpParams();
    if (teamId) {
      params = params.set('teamId', teamId);
    }
    return this.http.get(`${this.apiUrl}/assignments`, { params });
  }

  // Method to get plagiarism report
  getPlagiarismReport(teamId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/plagiarism/report/${teamId}`, {
      responseType: 'blob'
    });
  }
}