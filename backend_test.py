import requests
import sys
import json
from datetime import datetime, timedelta

class CRMAPITester:
    def __init__(self, base_url="https://ai-crm-hub-15.preview.emergentagent.com"):
        self.base_url = base_url
        self.session = requests.Session()
        self.tests_run = 0
        self.tests_passed = 0
        self.errors = []

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'} if not files else {}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = self.session.get(url, headers=headers)
            elif method == 'POST':
                if files:
                    response = self.session.post(url, files=files)
                else:
                    response = self.session.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = self.session.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = self.session.delete(url, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json() if response.content else {}
                except:
                    return success, {}
            else:
                error_msg = f"Expected {expected_status}, got {response.status_code}"
                try:
                    error_detail = response.json()
                    error_msg += f" - {error_detail}"
                except:
                    error_msg += f" - {response.text[:200]}"
                print(f"❌ Failed - {error_msg}")
                self.errors.append(f"{name}: {error_msg}")
                return False, {}

        except Exception as e:
            error_msg = f"Error: {str(e)}"
            print(f"❌ Failed - {error_msg}")
            self.errors.append(f"{name}: {error_msg}")
            return False, {}

    def test_auth_flow(self):
        """Test complete authentication flow"""
        print("\n" + "="*50)
        print("TESTING AUTHENTICATION")
        print("="*50)
        
        # Test login with admin credentials
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data={"email": "admin@example.com", "password": "Admin123!"}
        )
        
        if not success:
            print("❌ Admin login failed - cannot continue with authenticated tests")
            return False
            
        # Test get current user
        self.run_test("Get Current User", "GET", "auth/me", 200)
        
        # Test register new user
        test_email = f"test_{datetime.now().strftime('%H%M%S')}@example.com"
        self.run_test(
            "Register New User",
            "POST", 
            "auth/register",
            200,
            data={
                "email": test_email,
                "password": "TestPass123!",
                "name": "Test User",
                "role": "sales_rep"
            }
        )
        
        # Test logout
        self.run_test("Logout", "POST", "auth/logout", 200)
        
        # Login again for subsequent tests
        success, response = self.run_test(
            "Re-login Admin",
            "POST",
            "auth/login", 
            200,
            data={"email": "admin@example.com", "password": "Admin123!"}
        )
        
        return success

    def test_sales_module(self):
        """Test sales CRM functionality"""
        print("\n" + "="*50)
        print("TESTING SALES MODULE")
        print("="*50)
        
        # Test sales dashboard
        self.run_test("Sales Dashboard", "GET", "dashboard/sales", 200)
        
        # Test create lead
        lead_data = {
            "full_name": "John Doe",
            "email": "john.doe@example.com",
            "phone": "+1234567890",
            "company": "Test Company",
            "job_title": "Manager",
            "source": "Website",
            "status": "new",
            "notes": "Test lead for API testing"
        }
        
        success, response = self.run_test("Create Lead", "POST", "leads", 200, data=lead_data)
        lead_id = response.get('id') if success else None
        
        # Test get leads
        self.run_test("Get All Leads", "GET", "leads", 200)
        
        # Test get specific lead
        if lead_id:
            self.run_test(f"Get Lead {lead_id}", "GET", f"leads/{lead_id}", 200)
            
            # Test update lead
            self.run_test(
                f"Update Lead {lead_id}",
                "PUT",
                f"leads/{lead_id}",
                200,
                data={"status": "contacted", "notes": "Updated via API test"}
            )
        
        # Test tasks
        if lead_id:
            task_data = {
                "title": "Follow up with lead",
                "description": "Call the lead to discuss requirements",
                "due_date": (datetime.now() + timedelta(days=1)).isoformat(),
                "priority": "high",
                "lead_id": lead_id
            }
            success, task_response = self.run_test("Create Task", "POST", "tasks", 200, data=task_data)
            task_id = task_response.get('id') if success else None
            
            # Test get tasks
            self.run_test("Get Tasks", "GET", "tasks", 200)
            
            if task_id:
                # Test update task
                self.run_test(
                    f"Update Task {task_id}",
                    "PUT", 
                    f"tasks/{task_id}",
                    200,
                    data={"completed": True}
                )
        
        # Test reminders
        if lead_id:
            reminder_data = {
                "title": "Follow up reminder",
                "due_date": (datetime.now() + timedelta(days=2)).isoformat(),
                "lead_id": lead_id,
                "send_email": False
            }
            success, reminder_response = self.run_test("Create Reminder", "POST", "reminders", 200, data=reminder_data)
            
            # Test get reminders
            self.run_test("Get Reminders", "GET", "reminders", 200)
        
        # Test activities
        if lead_id:
            activity_data = {
                "lead_id": lead_id,
                "activity_type": "call",
                "description": "Called lead to discuss requirements"
            }
            self.run_test("Create Activity", "POST", "activities", 200, data=activity_data)
            self.run_test("Get Activities", "GET", f"activities?lead_id={lead_id}", 200)
        
        # Test users endpoints
        self.run_test("Get Users", "GET", "users", 200)
        self.run_test("Get Sales Reps", "GET", "users/sales-reps", 200)
        
        return lead_id

    def test_recruitment_module(self):
        """Test recruitment ATS functionality"""
        print("\n" + "="*50)
        print("TESTING RECRUITMENT MODULE")
        print("="*50)
        
        # Test recruitment dashboard
        self.run_test("Recruitment Dashboard", "GET", "dashboard/recruitment", 200)
        
        # Test create job
        job_data = {
            "title": "Software Engineer",
            "department": "Engineering",
            "location": "Remote",
            "employment_type": "Full-time",
            "description": "We are looking for a skilled software engineer",
            "requirements": "3+ years experience in Python/JavaScript",
            "salary_range": "$80,000 - $120,000",
            "is_active": True
        }
        
        success, response = self.run_test("Create Job", "POST", "jobs", 200, data=job_data)
        job_id = response.get('id') if success else None
        
        # Test get jobs
        self.run_test("Get All Jobs", "GET", "jobs", 200)
        
        # Test get specific job
        if job_id:
            self.run_test(f"Get Job {job_id}", "GET", f"jobs/{job_id}", 200)
            
            # Test update job
            self.run_test(
                f"Update Job {job_id}",
                "PUT",
                f"jobs/{job_id}",
                200,
                data={"salary_range": "$85,000 - $125,000"}
            )
        
        # Test create candidate
        candidate_data = {
            "full_name": "Jane Smith",
            "email": "jane.smith@example.com",
            "phone": "+1987654321",
            "current_company": "Tech Corp",
            "current_role": "Senior Developer",
            "experience_years": 5,
            "source": "LinkedIn",
            "job_id": job_id,
            "status": "sourced",
            "notes": "Strong candidate with relevant experience"
        }
        
        success, response = self.run_test("Create Candidate", "POST", "candidates", 200, data=candidate_data)
        candidate_id = response.get('id') if success else None
        
        # Test get candidates
        self.run_test("Get All Candidates", "GET", "candidates", 200)
        
        # Test pipeline
        self.run_test("Get Pipeline", "GET", "candidates/pipeline", 200)
        
        # Test get specific candidate
        if candidate_id:
            self.run_test(f"Get Candidate {candidate_id}", "GET", f"candidates/{candidate_id}", 200)
            
            # Test update candidate
            self.run_test(
                f"Update Candidate {candidate_id}",
                "PUT",
                f"candidates/{candidate_id}",
                200,
                data={"status": "screened", "notes": "Passed initial screening"}
            )
        
        # Test interviews
        if candidate_id and job_id:
            interview_data = {
                "candidate_id": candidate_id,
                "job_id": job_id,
                "scheduled_at": (datetime.now() + timedelta(days=3)).isoformat(),
                "interview_type": "Technical Interview",
                "interviewers": ["interviewer1@example.com"],
                "notes": "Technical round with senior engineer"
            }
            success, interview_response = self.run_test("Create Interview", "POST", "interviews", 200, data=interview_data)
            interview_id = interview_response.get('id') if success else None
            
            # Test get interviews
            self.run_test("Get Interviews", "GET", "interviews", 200)
            
            if interview_id:
                # Test update interview
                self.run_test(
                    f"Update Interview {interview_id}",
                    "PUT",
                    f"interviews/{interview_id}",
                    200,
                    data={"completed": True, "feedback": "Good technical skills", "rating": 4}
                )
        
        # Test recruitment tasks
        if candidate_id:
            task_data = {
                "title": "Review candidate resume",
                "description": "Detailed review of technical background",
                "due_date": (datetime.now() + timedelta(days=1)).isoformat(),
                "priority": "medium",
                "candidate_id": candidate_id
            }
            self.run_test("Create Recruitment Task", "POST", "tasks", 200, data=task_data)
        
        # Test get recruiters
        self.run_test("Get Recruiters", "GET", "users/recruiters", 200)
        
        return job_id, candidate_id

    def test_import_functionality(self):
        """Test CSV import functionality"""
        print("\n" + "="*50)
        print("TESTING IMPORT FUNCTIONALITY")
        print("="*50)
        
        # Create a simple CSV content for testing
        csv_content = """name,email,company,phone
John Test,john.test@example.com,Test Corp,+1234567890
Jane Test,jane.test@example.com,Another Corp,+1987654321"""
        
        # Test CSV import
        files = {'file': ('test_leads.csv', csv_content, 'text/csv')}
        success, response = self.run_test("Import Leads CSV", "POST", "leads/import", 200, files=files)
        
        if success:
            # Test get imports
            self.run_test("Get Import History", "GET", "imports", 200)

    def run_all_tests(self):
        """Run all test suites"""
        print("🚀 Starting CRM+ATS API Testing")
        print(f"Base URL: {self.base_url}")
        
        # Test authentication first
        if not self.test_auth_flow():
            print("\n❌ Authentication failed - stopping tests")
            return False
        
        # Test sales module
        lead_id = self.test_sales_module()
        
        # Test recruitment module  
        job_id, candidate_id = self.test_recruitment_module()
        
        # Test import functionality
        self.test_import_functionality()
        
        # Print final results
        print("\n" + "="*60)
        print("FINAL TEST RESULTS")
        print("="*60)
        print(f"✅ Tests passed: {self.tests_passed}/{self.tests_run}")
        print(f"❌ Tests failed: {len(self.errors)}")
        
        if self.errors:
            print("\n🔍 Failed Tests:")
            for error in self.errors:
                print(f"  • {error}")
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"\n📊 Success Rate: {success_rate:.1f}%")
        
        return len(self.errors) == 0

def main():
    tester = CRMAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())