import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SignUpTeacher } from './sign-up-teacher';

describe('SignUpTeacher', () => {
  let component: SignUpTeacher;
  let fixture: ComponentFixture<SignUpTeacher>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SignUpTeacher]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SignUpTeacher);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
