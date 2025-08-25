document.addEventListener('DOMContentLoaded', () => {
    // --- 상태 관리 ---
    const state = {
        token: localStorage.getItem('token'),
        currentPage: 'auth', // 'auth', 'students', 'feedback'
        selectedStudentId: null,
        selectedStudentName: null,
        grades: [],
        students: []
    };

    // --- API 클라이언트 ---
    const BASE_URL = "http://127.0.0.1:8000";

    class ApiClient {
        async _request(method, endpoint, body = null, isFormData = false) {
            const url = `${BASE_URL}${endpoint}`;
            const headers = {};
            if (state.token) {
                headers['Authorization'] = `Bearer ${state.token}`;
            }

            const options = { method, headers };

            if (body) {
                if (isFormData) {
                    options.body = new URLSearchParams(body);
                } else {
                    headers['Content-Type'] = 'application/json';
                    options.body = JSON.stringify(body);
                }
            }

            try {
                const response = await fetch(url, options);
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
                    throw new Error(errorData.detail || '오류가 발생했습니다.');
                }
                if (response.status === 204) {
                    return null;
                }
                return response.json();
            } catch (error) {
                showToast(`오류: ${error.message}`, 'error');
                console.error(error);
                return null;
            }
        }

        signup(email, password, name) {
            return this._request('post', 'api/v1/teachers/', { email, password, name });
        }

        login(email, password) {
            return this._request('post', 'api/v1/auth/token', { username: email, password }, true);
        }

        getGrades() {
            return this._request('get', 'api/v1/grades');
        }

        getStudents() {
            return this._request('get', 'api/v1/students');
        }
        
        createStudent(name, grade_id) {
            return this._request('post', 'api/v1/students', { name, grade_id });
        }

        updateStudent(student_id, name, grade_id) {
            return this._request('put', `api/v1/students/${student_id}`, { name, grade_id });
        }

        deleteStudent(student_id) {
            return this._request('delete', `api/v1/students/${student_id}`);
        }
        
        getFeedbacks(student_id) {
            return this._request('get', `api/v1/students/${student_id}/feedbacks`);
        }

        createFeedback(student_id, class_info, feedback_info) {
            return this._request('post', `api/v1/students/${student_id}/feedbacks`, { class_info, feedback_info });
        }
    }

    const api = new ApiClient();

    // --- UI 요소 ---
    const pages = {
        auth: document.getElementById('auth-page'),
        main: document.getElementById('main-page'),
        students: document.getElementById('student-management-page'),
        feedback: document.getElementById('feedback-management-page'),
    };
    const loadingSpinner = document.getElementById('loading-spinner');

    // --- 라우팅 및 페이지 렌더링 ---
    function navigate(page) {
        state.currentPage = page;
        render();
    }
    
    async function render() {
        // 모든 페이지 숨기기
        Object.values(pages).forEach(p => p.style.display = 'none');
        document.getElementById('content-area').querySelectorAll('.content-page').forEach(p => p.style.display = 'none');

        if (state.token) {
            pages.main.style.display = 'flex';
            if (state.currentPage === 'students') {
                pages.students.style.display = 'block';
                await renderStudentManagementPage();
            } else if (state.currentPage === 'feedback') {
                pages.feedback.style.display = 'block';
                await renderFeedbackManagementPage();
            }
        } else {
            pages.auth.style.display = 'block';
            state.currentPage = 'auth';
        }
    }

    // --- 학생 관리 페이지 렌더링 ---
    async function renderStudentManagementPage() {
        // 학년 정보 가져오기
        if (state.grades.length === 0) {
            state.grades = await api.getGrades() || [];
            populateGradeSelect(document.getElementById('new-student-grade'), state.grades);
        }

        // 학생 목록 가져오기
        state.students = await api.getStudents() || [];
        const studentList = document.getElementById('student-list');
        studentList.innerHTML = '';

        if (state.students.length === 0) {
            studentList.innerHTML = '<p>등록된 학생이 없습니다. 먼저 학생을 추가해주세요.</p>';
            return;
        }

        state.students.forEach(student => {
            const card = document.createElement('div');
            card.className = 'student-card';
            card.innerHTML = `
                <div class="student-card-header">
                    <h3>${student.name} <span>(${student.grade_info.grade_name})</span></h3>
                    <div class="actions">
                        <button class="manage-feedback-btn" data-id="${student.student_id}" data-name="${student.name}">피드백 관리</button>
                    </div>
                </div>
                <details class="collapsible">
                    <summary>학생 정보 수정/삭제</summary>
                    <form class="edit-form" data-id="${student.student_id}">
                        <input type="text" name="name" value="${student.name}" required>
                        <select name="grade_id"></select>
                        <div class="form-actions">
                            <button type="submit">수정</button>
                            <button type="button" class="delete-btn">삭제</button>
                        </div>
                    </form>
                </details>
            `;
            const gradeSelect = card.querySelector('select');
            populateGradeSelect(gradeSelect, state.grades, student.grade_info.grade_id);
            studentList.appendChild(card);
        });
    }

    // --- 피드백 관리 페이지 렌더링 ---
    async function renderFeedbackManagementPage() {
        document.getElementById('feedback-page-title').textContent = `'${state.selectedStudentName}' 학생 피드백 관리`;
        document.getElementById('fb-class-date').valueAsDate = new Date();
        
        const feedbacks = await api.getFeedbacks(state.selectedStudentId) || [];
        const feedbackList = document.getElementById('feedback-list');
        feedbackList.innerHTML = '';
        
        if (feedbacks.length === 0) {
            feedbackList.innerHTML = '<p>작성된 피드백이 없습니다.</p>';
            return;
        }

        // 수업 날짜 정보를 찾기 위해 학생 정보를 다시 로드 (Streamlit 코드 로직과 동일)
        const studentDetails = await api.getStudents();
        const studentMap = {};
        if (studentDetails) {
            studentDetails.forEach(s => {
                s.classes.forEach(c => {
                    if (c.feedback) {
                        studentMap[c.feedback.feedback_id] = c.class_date;
                    }
                });
            });
        }

        feedbacks.forEach(fb => {
            const classDate = studentMap[fb.feedback_id] || '날짜 정보 없음';
            const card = document.createElement('details');
            card.className = 'collapsible feedback-card';
            card.innerHTML = `
                <summary>${classDate} 수업 피드백</summary>
                <div class="feedback-item feedback-improvement">
                    <h4>👍 발전한 점</h4>
                    <p>${fb.ai_comment_improvement || '내용 없음'}</p>
                </div>
                <div class="feedback-item feedback-attitude">
                    <h4>💪 개선할 점</h4>
                    <p>${fb.ai_comment_attitude || '내용 없음'}</p>
                </div>
                <div class="feedback-item feedback-overall">
                    <h4>📝 총평</h4>
                    <p>${fb.ai_comment_overall || '내용 없음'}</p>
                </div>
            `;
            feedbackList.appendChild(card);
        });
    }

    // --- 헬퍼 함수 ---
    function populateGradeSelect(selectElement, grades, selectedId = null) {
        selectElement.innerHTML = '';
        grades.forEach(grade => {
            const option = document.createElement('option');
            option.value = grade.grade_id;
            option.textContent = grade.grade_name;
            if (grade.grade_id === selectedId) {
                option.selected = true;
            }
            selectElement.appendChild(option);
        });
    }
    
    function showToast(message, type = 'success') {
        const toast = document.getElementById('toast-message');
        toast.textContent = message;
        toast.className = 'toast show';
        if (type === 'error') {
            toast.style.backgroundColor = '#dc3545';
        } else {
            toast.style.backgroundColor = '#333';
        }
        setTimeout(() => {
            toast.className = 'toast';
        }, 3000);
    }

    function showLoading(show) {
        loadingSpinner.style.display = show ? 'flex' : 'none';
    }


    // --- 이벤트 리스너 ---
    
    // 탭 전환
    window.openTab = (evt, tabName) => {
        const tabcontent = document.getElementsByClassName("tab-content");
        for (let i = 0; i < tabcontent.length; i++) {
            tabcontent[i].style.display = "none";
        }
        const tablinks = document.getElementsByClassName("tab-link");
        for (let i = 0; i < tablinks.length; i++) {
            tablinks[i].className = tablinks[i].className.replace(" active", "");
        }
        document.getElementById(tabName).style.display = "block";
        evt.currentTarget.className += " active";
    };

    // 로그인
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const response = await api.login(email, password);
        if (response && response.access_token) {
            state.token = response.access_token;
            localStorage.setItem('token', state.token);
            showToast('로그인 성공!');
            navigate('students');
        } else {
            showToast('로그인에 실패했습니다. 이메일과 비밀번호를 확인하세요.', 'error');
        }
    });

    // 회원가입
    document.getElementById('signup-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const response = await api.signup(email, password, name);
        if (response) {
            showToast('회원가입 성공! 로그인 탭에서 로그인해주세요.');
            // 로그인 탭으로 자동 전환
            document.querySelector('.tab-link[onclick*="login"]').click();
            document.getElementById('signup-form').reset();
        }
    });
    
    // 로그아웃
    document.getElementById('logout-btn').addEventListener('click', () => {
        state.token = null;
        localStorage.removeItem('token');
        showToast('로그아웃 되었습니다.');
        navigate('auth');
    });

    // 신규 학생 추가
    document.getElementById('new-student-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('new-student-name').value;
        const grade_id = document.getElementById('new-student-grade').value;
        const response = await api.createStudent(name, parseInt(grade_id));
        if (response) {
            showToast(`✅ ${name} 학생을 추가했습니다.`);
            document.getElementById('new-student-form').reset();
            renderStudentManagementPage();
        }
    });

    // 학생 목록 내 이벤트 위임 (수정, 삭제, 피드백 관리)
    document.getElementById('student-list').addEventListener('click', async (e) => {
        const target = e.target;
        
        // 피드백 관리 버튼
        if (target.classList.contains('manage-feedback-btn')) {
            state.selectedStudentId = parseInt(target.dataset.id);
            state.selectedStudentName = target.dataset.name;
            navigate('feedback');
        }

        // 삭제 버튼
        if (target.classList.contains('delete-btn')) {
            if (confirm('정말로 이 학생을 삭제하시겠습니까?')) {
                const form = target.closest('.edit-form');
                const studentId = parseInt(form.dataset.id);
                const response = await api.deleteStudent(studentId);
                if (response === null) {
                    showToast('✅ 학생을 삭제했습니다.');
                    renderStudentManagementPage();
                }
            }
        }
    });

    document.getElementById('student-list').addEventListener('submit', async (e) => {
        e.preventDefault();
        // 수정 폼 제출
        if (e.target.classList.contains('edit-form')) {
            const form = e.target;
            const studentId = parseInt(form.dataset.id);
            const name = form.querySelector('input[name="name"]').value;
            const grade_id = parseInt(form.querySelector('select[name="grade_id"]').value);
            
            const response = await api.updateStudent(studentId, name, grade_id);
            if(response) {
                showToast(`✅ ${name} 학생 정보를 수정했습니다.`);
                renderStudentManagementPage();
            }
        }
    });


    // 피드백 페이지 > 학생 목록으로 돌아가기
    document.getElementById('back-to-students').addEventListener('click', () => {
        state.selectedStudentId = null;
        state.selectedStudentName = null;
        navigate('students');
    });

    // 피드백 생성 폼 슬라이더 값 표시
    document.querySelectorAll('#new-feedback-form input[type="range"]').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const valueSpan = document.getElementById(`${e.target.id.replace('fb-','')}-value`);
            if (valueSpan) {
                valueSpan.textContent = e.target.value;
            }
        });
    });

    // 신규 피드백 생성
    document.getElementById('new-feedback-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const class_info = {
            subject: document.getElementById('fb-subject').value,
            class_date: document.getElementById('fb-class-date').value,
            progress_text: document.getElementById('fb-progress').value,
            class_memo: document.getElementById('fb-memo').value
        };
        const feedback_info = {
            attitude_score: parseInt(document.getElementById('fb-attitude').value),
            understanding_score: parseInt(document.getElementById('fb-understanding').value),
            homework_score: parseInt(document.getElementById('fb-homework').value),
            qa_score: parseInt(document.getElementById('fb-qa').value)
        };

        showLoading(true);
        const response = await api.createFeedback(state.selectedStudentId, class_info, feedback_info);
        showLoading(false);

        if (response) {
            showToast('✅ AI 피드백 생성을 완료했습니다.');
            document.getElementById('new-feedback-form').reset();
            // 슬라이더 값 초기화
            document.querySelectorAll('#new-feedback-form input[type="range"]').forEach(slider => {
                slider.value = 3;
                slider.dispatchEvent(new Event('input'));
            });
            renderFeedbackManagementPage();
        }
    });

    // --- 앱 초기화 ---
    function initialize() {
        if (state.token) {
            navigate('students');
        } else {
            navigate('auth');
        }
    }

    initialize();
});