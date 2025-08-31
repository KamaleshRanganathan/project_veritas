import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LoginTeacher } from './login-teacher';

describe('LoginTeacher', () => {
  let component: LoginTeacher;
  let fixture: ComponentFixture<LoginTeacher>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginTeacher]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LoginTeacher);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
