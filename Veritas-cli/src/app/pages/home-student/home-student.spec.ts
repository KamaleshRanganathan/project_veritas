import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HomeStudent } from './home-student';

describe('HomeStudent', () => {
  let component: HomeStudent;
  let fixture: ComponentFixture<HomeStudent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeStudent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HomeStudent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
