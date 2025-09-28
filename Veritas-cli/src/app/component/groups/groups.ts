import { Component, Input } from '@angular/core';

export interface Group {
  id: number;
  name: string;
  date: string;
  status : string;
}

@Component({
  selector: 'app-group-item', // Make sure this matches what you're using in template
  standalone: true,
  templateUrl: './groups.html',
  styleUrls: ['./groups.css']
})
export class Groups {
  @Input() group!: Group; // Add the @Input() property
}