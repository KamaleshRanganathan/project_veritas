import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HomeTeacher } from './home-teacher';

describe('HomeTeacher', () => {
  let component: HomeTeacher;
  let fixture: ComponentFixture<HomeTeacher>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeTeacher]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HomeTeacher);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
