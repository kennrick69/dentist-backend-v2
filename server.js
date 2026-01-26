// ==================== BACKEND DENTISTA PRO - VERSÃO 2.0 ====================
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'seu-secret-super-seguro-aqui-123';

// ===== MIDDLEWARES =====
app.use(cors());
app.use(express.json());

// ===== LOGGING =====
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// ===== DATABASE (JSON FILE) =====
const DB_PATH = path.join(__dirname, 'database.json');

// Inicializar banco de dados
async function initDB() {
    try {
        await fs.access(DB_PATH);
    } catch {
        const initialData = {
            dentistas: [],
            pacientes: [],
            agendamentos: [],
            notas: []
        };
        await fs.writeFile(DB_PATH, JSON.stringify(initialData, null, 2));
        console.log('📊 Banco de dados criado!');
    }
}

// Ler banco
async function readDB() {
    try {
        const data = await fs.readFile(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Erro ao ler DB:', error);
        return { dentistas: [], pacientes: [], agendamentos: [], notas: [] };
    }
}

// Escrever banco
async function writeDB(data) {
    try {
        await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Erro ao escrever DB:', error);
        return false;
    }
}

// ===== MIDDLEWARE DE AUTENTICAÇÃO =====
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, erro: 'Token não fornecido' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, erro: 'Token inválido' });
        }
        req.user = user;
        next();
    });
}

// ===== ROTAS DE AUTENTICAÇÃO =====

// Registrar novo dentista
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, cro, email, password, clinic, specialty } = req.body;

        // Validações
        if (!name || !cro || !email || !password) {
            return res.status(400).json({ 
                success: false, 
                erro: 'Campos obrigatórios faltando' 
            });
        }

        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                erro: 'Senha deve ter no mínimo 6 caracteres' 
            });
        }

        const db = await readDB();

        // Verificar se email já existe
        const existingUser = db.dentistas.find(d => d.email.toLowerCase() === email.toLowerCase());
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                erro: 'Email já cadastrado' 
            });
        }

        // Hash da senha
        const passwordHash = await bcrypt.hash(password, 10);

        // Criar dentista
        const newDentista = {
            id: Date.now().toString(),
            name,
            cro,
            email: email.toLowerCase(),
            password: passwordHash,
            clinic: clinic || '',
            specialty: specialty || '',
            createdAt: new Date().toISOString(),
            subscription: {
                active: true,
                startDate: new Date().toISOString(),
                plan: 'premium'
            }
        };

        db.dentistas.push(newDentista);
        await writeDB(db);

        // Remover senha da resposta
        const { password: _, ...dentistaPublic } = newDentista;

        res.json({
            success: true,
            dentista: dentistaPublic,
            message: 'Dentista cadastrado com sucesso!'
        });

    } catch (error) {
        console.error('Erro ao registrar:', error);
        res.status(500).json({ 
            success: false, 
            erro: 'Erro ao cadastrar dentista' 
        });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                erro: 'Email e senha são obrigatórios' 
            });
        }

        const db = await readDB();
        const dentista = db.dentistas.find(d => d.email.toLowerCase() === email.toLowerCase());

        if (!dentista) {
            return res.status(401).json({ 
                success: false, 
                erro: 'Email ou senha incorretos' 
            });
        }

        // Verificar senha
        const validPassword = await bcrypt.compare(password, dentista.password);
        if (!validPassword) {
            return res.status(401).json({ 
                success: false, 
                erro: 'Email ou senha incorretos' 
            });
        }

        // Verificar assinatura
        if (!dentista.subscription || !dentista.subscription.active) {
            return res.status(403).json({ 
                success: false, 
                erro: 'Assinatura inativa' 
            });
        }

        // Gerar token JWT
        const token = jwt.sign(
            { 
                id: dentista.id, 
                email: dentista.email,
                name: dentista.name 
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Remover senha da resposta
        const { password: _, ...dentistaPublic } = dentista;

        res.json({
            success: true,
            token,
            dentista: dentistaPublic,
            message: 'Login realizado com sucesso!'
        });

    } catch (error) {
        console.error('Erro ao fazer login:', error);
        res.status(500).json({ 
            success: false, 
            erro: 'Erro ao fazer login' 
        });
    }
});

// Verificar token
app.get('/api/auth/verify', authenticateToken, async (req, res) => {
    try {
        const db = await readDB();
        const dentista = db.dentistas.find(d => d.id === req.user.id);

        if (!dentista) {
            return res.status(404).json({ 
                success: false, 
                erro: 'Dentista não encontrado' 
            });
        }

        const { password: _, ...dentistaPublic } = dentista;

        res.json({
            success: true,
            dentista: dentistaPublic
        });

    } catch (error) {
        console.error('Erro ao verificar token:', error);
        res.status(500).json({ 
            success: false, 
            erro: 'Erro ao verificar token' 
        });
    }
});

// ===== ROTAS DE PACIENTES =====

// Listar pacientes do dentista
app.get('/api/pacientes', authenticateToken, async (req, res) => {
    try {
        const db = await readDB();
        const pacientes = db.pacientes.filter(p => p.dentistaId === req.user.id);

        res.json({
            success: true,
            pacientes,
            total: pacientes.length
        });

    } catch (error) {
        console.error('Erro ao listar pacientes:', error);
        res.status(500).json({ 
            success: false, 
            erro: 'Erro ao listar pacientes' 
        });
    }
});

// Criar paciente
app.post('/api/pacientes', authenticateToken, async (req, res) => {
    try {
        const pacienteData = req.body;

        const newPaciente = {
            id: Date.now().toString(),
            dentistaId: req.user.id,
            ...pacienteData,
            dataCadastro: new Date().toISOString()
        };

        const db = await readDB();
        db.pacientes.push(newPaciente);
        await writeDB(db);

        res.json({
            success: true,
            paciente: newPaciente,
            message: 'Paciente cadastrado com sucesso!'
        });

    } catch (error) {
        console.error('Erro ao criar paciente:', error);
        res.status(500).json({ 
            success: false, 
            erro: 'Erro ao criar paciente' 
        });
    }
});

// Atualizar paciente
app.put('/api/pacientes/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const db = await readDB();
        const index = db.pacientes.findIndex(p => p.id === id && p.dentistaId === req.user.id);

        if (index === -1) {
            return res.status(404).json({ 
                success: false, 
                erro: 'Paciente não encontrado' 
            });
        }

        db.pacientes[index] = {
            ...db.pacientes[index],
            ...updates,
            id, // Manter ID original
            dentistaId: req.user.id, // Manter dentistaId
            dataAtualizacao: new Date().toISOString()
        };

        await writeDB(db);

        res.json({
            success: true,
            paciente: db.pacientes[index],
            message: 'Paciente atualizado com sucesso!'
        });

    } catch (error) {
        console.error('Erro ao atualizar paciente:', error);
        res.status(500).json({ 
            success: false, 
            erro: 'Erro ao atualizar paciente' 
        });
    }
});

// Deletar paciente
app.delete('/api/pacientes/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const db = await readDB();
        const index = db.pacientes.findIndex(p => p.id === id && p.dentistaId === req.user.id);

        if (index === -1) {
            return res.status(404).json({ 
                success: false, 
                erro: 'Paciente não encontrado' 
            });
        }

        db.pacientes.splice(index, 1);
        await writeDB(db);

        res.json({
            success: true,
            message: 'Paciente removido com sucesso!'
        });

    } catch (error) {
        console.error('Erro ao deletar paciente:', error);
        res.status(500).json({ 
            success: false, 
            erro: 'Erro ao deletar paciente' 
        });
    }
});

// ===== ROTAS DE AGENDAMENTOS =====

// Listar agendamentos
app.get('/api/agendamentos', authenticateToken, async (req, res) => {
    try {
        const db = await readDB();
        const agendamentos = db.agendamentos.filter(a => a.dentistaId === req.user.id);

        res.json({
            success: true,
            agendamentos,
            total: agendamentos.length
        });

    } catch (error) {
        console.error('Erro ao listar agendamentos:', error);
        res.status(500).json({ 
            success: false, 
            erro: 'Erro ao listar agendamentos' 
        });
    }
});

// Criar agendamento
app.post('/api/agendamentos', authenticateToken, async (req, res) => {
    try {
        const agendamentoData = req.body;

        const newAgendamento = {
            id: Date.now().toString(),
            dentistaId: req.user.id,
            ...agendamentoData,
            dataCriacao: new Date().toISOString()
        };

        const db = await readDB();
        db.agendamentos.push(newAgendamento);
        await writeDB(db);

        res.json({
            success: true,
            agendamento: newAgendamento,
            message: 'Agendamento criado com sucesso!'
        });

    } catch (error) {
        console.error('Erro ao criar agendamento:', error);
        res.status(500).json({ 
            success: false, 
            erro: 'Erro ao criar agendamento' 
        });
    }
});

// Atualizar agendamento
app.put('/api/agendamentos/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const db = await readDB();
        const index = db.agendamentos.findIndex(a => a.id === id && a.dentistaId === req.user.id);

        if (index === -1) {
            return res.status(404).json({ 
                success: false, 
                erro: 'Agendamento não encontrado' 
            });
        }

        db.agendamentos[index] = {
            ...db.agendamentos[index],
            ...updates,
            id,
            dentistaId: req.user.id,
            dataAtualizacao: new Date().toISOString()
        };

        await writeDB(db);

        res.json({
            success: true,
            agendamento: db.agendamentos[index],
            message: 'Agendamento atualizado com sucesso!'
        });

    } catch (error) {
        console.error('Erro ao atualizar agendamento:', error);
        res.status(500).json({ 
            success: false, 
            erro: 'Erro ao atualizar agendamento' 
        });
    }
});

// Deletar agendamento
app.delete('/api/agendamentos/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const db = await readDB();
        const index = db.agendamentos.findIndex(a => a.id === id && a.dentistaId === req.user.id);

        if (index === -1) {
            return res.status(404).json({ 
                success: false, 
                erro: 'Agendamento não encontrado' 
            });
        }

        db.agendamentos.splice(index, 1);
        await writeDB(db);

        res.json({
            success: true,
            message: 'Agendamento removido com sucesso!'
        });

    } catch (error) {
        console.error('Erro ao deletar agendamento:', error);
        res.status(500).json({ 
            success: false, 
            erro: 'Erro ao deletar agendamento' 
        });
    }
});

// ===== ROTA RAIZ =====
app.get('/', (req, res) => {
    res.json({
        message: 'Backend Dentista Pro - Versão 2.0',
        version: '2.0.0',
        status: 'online',
        features: {
            authentication: 'JWT',
            database: 'JSON File',
            endpoints: {
                auth: ['POST /api/auth/register', 'POST /api/auth/login', 'GET /api/auth/verify'],
                pacientes: ['GET /api/pacientes', 'POST /api/pacientes', 'PUT /api/pacientes/:id', 'DELETE /api/pacientes/:id'],
                agendamentos: ['GET /api/agendamentos', 'POST /api/agendamentos', 'PUT /api/agendamentos/:id', 'DELETE /api/agendamentos/:id'],
                nfse: ['POST /api/nfse/emitir', 'POST /api/nfse/cancelar']
            }
        }
    });
});

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ===== ERROR HANDLER =====
app.use((err, req, res, next) => {
    console.error('Erro:', err);
    res.status(500).json({
        success: false,
        erro: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// ===== START SERVER =====
initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Backend Dentista Pro rodando na porta ${PORT}`);
        console.log(`🔗 http://localhost:${PORT}`);
        console.log(`📊 Banco de dados: ${DB_PATH}`);
        console.log(`✅ Pronto para uso!`);
    });
});

module.exports = app;
