// ===== AUTHENTICATION SYSTEM V2 - COM API =====

const API_URL = 'https://dentist-production-1912.up.railway.app';

// ===== STORAGE HELPERS =====
function saveToken(token) {
    localStorage.setItem('auth_token', token);
}

function getToken() {
    return localStorage.getItem('auth_token');
}

function removeToken() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('current_dentista');
}

function saveCurrentDentista(dentista) {
    localStorage.setItem('current_dentista', JSON.stringify(dentista));
}

function getCurrentDentista() {
    const dentista = localStorage.getItem('current_dentista');
    return dentista ? JSON.parse(dentista) : null;
}

// ===== API HELPERS =====
async function apiRequest(endpoint, options = {}) {
    const token = getToken();
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.erro || 'Erro na requisição');
        }
        
        return data;
    } catch (error) {
        console.error('Erro na API:', error);
        throw error;
    }
}

// ===== SHOW/HIDE FORMS =====
function showLogin() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
}

function showRegister() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
}

// ===== REGISTER HANDLER =====
document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const submitBtn = this.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Cadastrando...';
    submitBtn.disabled = true;
    
    try {
        const name = document.getElementById('regName').value;
        const cro = document.getElementById('regCRO').value;
        const email = document.getElementById('regEmail').value;
        const password = document.getElementById('regPassword').value;
        const clinic = document.getElementById('regClinic').value;
        const specialty = document.getElementById('regSpecialty').value;
        
        // Validações
        if (password.length < 6) {
            throw new Error('A senha deve ter no mínimo 6 caracteres');
        }
        
        // Registrar via API
        const response = await apiRequest('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({
                name,
                cro,
                email,
                password,
                clinic,
                specialty
            })
        });
        
        alert('✅ ' + response.message + '\n\nFaça login para continuar.');
        showLogin();
        
        // Limpa form
        this.reset();
        
    } catch (error) {
        alert('❌ Erro: ' + error.message);
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
});

// ===== LOGIN HANDLER =====
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const submitBtn = this.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Entrando...';
    submitBtn.disabled = true;
    
    try {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        // Login via API
        const response = await apiRequest('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({
                email,
                password
            })
        });
        
        // Salvar token e dados do dentista
        saveToken(response.token);
        saveCurrentDentista(response.dentista);
        
        // Redirecionar para dashboard
        window.location.href = 'dashboard.html';
        
    } catch (error) {
        alert('❌ Erro: ' + error.message);
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
});

// ===== CHECK IF ALREADY LOGGED IN =====
window.addEventListener('DOMContentLoaded', async function() {
    const token = getToken();
    
    if (token && window.location.pathname.endsWith('login.html')) {
        // Verificar se token ainda é válido
        try {
            const response = await apiRequest('/api/auth/verify');
            saveCurrentDentista(response.dentista);
            window.location.href = 'dashboard.html';
        } catch (error) {
            // Token inválido, remover
            removeToken();
        }
    }
});

// ===== LOGOUT FUNCTION =====
function logout() {
    if (confirm('Deseja realmente sair?')) {
        removeToken();
        window.location.href = 'login.html';
    }
}
