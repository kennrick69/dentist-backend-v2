// ==================== BACKEND DENTISTA PRO - VERSÃO 3.0 COM POSTGRESQL ====================
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

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

// ===== POSTGRESQL CONNECTION =====
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Testar conexão
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Erro ao conectar PostgreSQL:', err);
    } else {
        console.log('✅ PostgreSQL conectado:', res.rows[0].now);
    }
});

// ===== CRIAR TABELAS =====
async function initDB() {
    try {
        // Tabela dentistas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS dentistas (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                cro VARCHAR(50) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                clinic VARCHAR(255),
                specialty VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                subscription_active BOOLEAN DEFAULT true,
                subscription_plan VARCHAR(50) DEFAULT 'premium'
            )
        `);

        // Tabela pacientes
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pacientes (
                id SERIAL PRIMARY KEY,
                dentista_id INTEGER REFERENCES dentistas(id) ON DELETE CASCADE,
                nome VARCHAR(255) NOT NULL,
                cpf VARCHAR(14),
                telefone VARCHAR(20),
                email VARCHAR(255),
                data_nascimento DATE,
                endereco TEXT,
                cidade VARCHAR(100),
                estado VARCHAR(2),
                cep VARCHAR(10),
                observacoes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela agendamentos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS agendamentos (
                id SERIAL PRIMARY KEY,
                dentista_id INTEGER REFERENCES dentistas(id) ON DELETE CASCADE,
                paciente_id INTEGER REFERENCES pacientes(id) ON DELETE CASCADE,
                paciente_nome VARCHAR(255),
                data DATE NOT NULL,
                horario TIME NOT NULL,
                duracao INTEGER DEFAULT 60,
                procedimento VARCHAR(255),
                status VARCHAR(50) DEFAULT 'confirmado',
                observacoes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ Tabelas criadas/verificadas com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao criar tabelas:', error);
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

        // Verificar se email já existe
        const existingUser = await pool.query(
            'SELECT id FROM dentistas WHERE email = $1',
            [email.toLowerCase()]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ 
                success: false, 
                erro: 'Email já cadastrado' 
            });
        }

        // Hash da senha
        const passwordHash = await bcrypt.hash(password, 10);

        // Criar dentista
        const result = await pool.query(
            `INSERT INTO dentistas (name, cro, email, password, clinic, specialty)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, name, cro, email, clinic, specialty, created_at, subscription_active, subscription_plan`,
            [name, cro, email.toLowerCase(), passwordHash, clinic || '', specialty || '']
        );

        const newDentista = result.rows[0];

        res.json({
            success: true,
            dentista: {
                id: newDentista.id.toString(),
                name: newDentista.name,
                cro: newDentista.cro,
                email: newDentista.email,
                clinic: newDentista.clinic,
                specialty: newDentista.specialty,
                createdAt: newDentista.created_at,
                subscription: {
                    active: newDentista.subscription_active,
                    plan: newDentista.subscription_plan
                }
            },
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

        const result = await pool.query(
            'SELECT * FROM dentistas WHERE email = $1',
            [email.toLowerCase()]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ 
                success: false, 
                erro: 'Email ou senha incorretos' 
            });
        }

        const dentista = result.rows[0];

        // Verificar senha
        const validPassword = await bcrypt.compare(password, dentista.password);
        if (!validPassword) {
            return res.status(401).json({ 
                success: false, 
                erro: 'Email ou senha incorretos' 
            });
        }

        // Verificar assinatura
        if (!dentista.subscription_active) {
            return res.status(403).json({ 
                success: false, 
                erro: 'Assinatura inativa' 
            });
        }

        // Gerar token JWT
        const token = jwt.sign(
            { 
                id: dentista.id.toString(), 
                email: dentista.email,
                name: dentista.name 
            },
            JWT_SECRET,
            { expiresIn: '1y' }
        );

        res.json({
            success: true,
            token,
            dentista: {
                id: dentista.id.toString(),
                name: dentista.name,
                cro: dentista.cro,
                email: dentista.email,
                clinic: dentista.clinic,
                specialty: dentista.specialty,
                subscription: {
                    active: dentista.subscription_active,
                    plan: dentista.subscription_plan
                }
            },
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
        const result = await pool.query(
            'SELECT id, name, cro, email, clinic, specialty, subscription_active, subscription_plan FROM dentistas WHERE id = $1',
            [parseInt(req.user.id)]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                erro: 'Dentista não encontrado' 
            });
        }

        const dentista = result.rows[0];

        res.json({
            success: true,
            dentista: {
                id: dentista.id.toString(),
                name: dentista.name,
                cro: dentista.cro,
                email: dentista.email,
                clinic: dentista.clinic,
                specialty: dentista.specialty,
                subscription: {
                    active: dentista.subscription_active,
                    plan: dentista.subscription_plan
                }
            }
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

// Listar pacientes
app.get('/api/pacientes', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM pacientes WHERE dentista_id = $1 ORDER BY created_at DESC',
            [parseInt(req.user.id)]
        );

        const pacientes = result.rows.map(p => ({
            id: p.id.toString(),
            dentistaId: p.dentista_id.toString(),
            nome: p.nome,
            cpf: p.cpf,
            telefone: p.telefone,
            email: p.email,
            dataNascimento: p.data_nascimento,
            endereco: p.endereco,
            cidade: p.cidade,
            estado: p.estado,
            cep: p.cep,
            observacoes: p.observacoes,
            dataCadastro: p.created_at,
            dataAtualizacao: p.updated_at
        }));

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
        const { nome, cpf, telefone, email, dataNascimento, endereco, cidade, estado, cep, observacoes } = req.body;

        const result = await pool.query(
            `INSERT INTO pacientes (dentista_id, nome, cpf, telefone, email, data_nascimento, endereco, cidade, estado, cep, observacoes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING *`,
            [parseInt(req.user.id), nome, cpf, telefone, email, dataNascimento, endereco, cidade, estado, cep, observacoes]
        );

        const paciente = result.rows[0];

        res.json({
            success: true,
            paciente: {
                id: paciente.id.toString(),
                dentistaId: paciente.dentista_id.toString(),
                nome: paciente.nome,
                cpf: paciente.cpf,
                telefone: paciente.telefone,
                email: paciente.email,
                dataNascimento: paciente.data_nascimento,
                endereco: paciente.endereco,
                cidade: paciente.cidade,
                estado: paciente.estado,
                cep: paciente.cep,
                observacoes: paciente.observacoes,
                dataCadastro: paciente.created_at
            },
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
        const { nome, cpf, telefone, email, dataNascimento, endereco, cidade, estado, cep, observacoes } = req.body;

        const result = await pool.query(
            `UPDATE pacientes 
             SET nome = $1, cpf = $2, telefone = $3, email = $4, data_nascimento = $5, 
                 endereco = $6, cidade = $7, estado = $8, cep = $9, observacoes = $10, 
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $11 AND dentista_id = $12
             RETURNING *`,
            [nome, cpf, telefone, email, dataNascimento, endereco, cidade, estado, cep, observacoes, parseInt(id), parseInt(req.user.id)]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                erro: 'Paciente não encontrado' 
            });
        }

        const paciente = result.rows[0];

        res.json({
            success: true,
            paciente: {
                id: paciente.id.toString(),
                nome: paciente.nome,
                cpf: paciente.cpf,
                telefone: paciente.telefone,
                email: paciente.email
            },
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

        const result = await pool.query(
            'DELETE FROM pacientes WHERE id = $1 AND dentista_id = $2 RETURNING id',
            [parseInt(id), parseInt(req.user.id)]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                erro: 'Paciente não encontrado' 
            });
        }

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
        const result = await pool.query(
            'SELECT * FROM agendamentos WHERE dentista_id = $1 ORDER BY data, horario',
            [parseInt(req.user.id)]
        );

        const agendamentos = result.rows.map(a => ({
            id: a.id.toString(),
            dentistaId: a.dentista_id.toString(),
            pacienteId: a.paciente_id ? a.paciente_id.toString() : null,
            pacienteNome: a.paciente_nome,
            data: a.data,
            horario: a.horario,
            duracao: a.duracao,
            procedimento: a.procedimento,
            status: a.status,
            observacoes: a.observacoes,
            dataCriacao: a.created_at
        }));

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
        const { pacienteId, pacienteNome, data, horario, duracao, procedimento, status, observacoes } = req.body;

        const result = await pool.query(
            `INSERT INTO agendamentos (dentista_id, paciente_id, paciente_nome, data, horario, duracao, procedimento, status, observacoes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [parseInt(req.user.id), pacienteId ? parseInt(pacienteId) : null, pacienteNome, data, horario, duracao || 60, procedimento, status || 'confirmado', observacoes]
        );

        const agendamento = result.rows[0];

        res.json({
            success: true,
            agendamento: {
                id: agendamento.id.toString(),
                pacienteNome: agendamento.paciente_nome,
                data: agendamento.data,
                horario: agendamento.horario,
                procedimento: agendamento.procedimento,
                status: agendamento.status
            },
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
        const { data, horario, duracao, procedimento, status, observacoes } = req.body;

        const result = await pool.query(
            `UPDATE agendamentos 
             SET data = $1, horario = $2, duracao = $3, procedimento = $4, status = $5, observacoes = $6, updated_at = CURRENT_TIMESTAMP
             WHERE id = $7 AND dentista_id = $8
             RETURNING *`,
            [data, horario, duracao, procedimento, status, observacoes, parseInt(id), parseInt(req.user.id)]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                erro: 'Agendamento não encontrado' 
            });
        }

        res.json({
            success: true,
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

        const result = await pool.query(
            'DELETE FROM agendamentos WHERE id = $1 AND dentista_id = $2 RETURNING id',
            [parseInt(id), parseInt(req.user.id)]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                erro: 'Agendamento não encontrado' 
            });
        }

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
        message: 'Backend Dentista Pro - Versão 3.0 (PostgreSQL)',
        version: '3.0.0',
        status: 'online',
        database: 'PostgreSQL',
        features: {
            authentication: 'JWT',
            database: 'PostgreSQL (Persistente)',
            endpoints: {
                auth: ['POST /api/auth/register', 'POST /api/auth/login', 'GET /api/auth/verify'],
                pacientes: ['GET /api/pacientes', 'POST /api/pacientes', 'PUT /api/pacientes/:id', 'DELETE /api/pacientes/:id'],
                agendamentos: ['GET /api/agendamentos', 'POST /api/agendamentos', 'PUT /api/agendamentos/:id', 'DELETE /api/agendamentos/:id']
            }
        }
    });
});

// ===== HEALTH CHECK =====
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'OK', database: 'Connected', timestamp: new Date().toISOString() });
    } catch (error) {
        res.status(500).json({ status: 'ERROR', database: 'Disconnected', error: error.message });
    }
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
        console.log(`🚀 Backend Dentista Pro v3.0 rodando na porta ${PORT}`);
        console.log(`🔗 http://localhost:${PORT}`);
        console.log(`🗄️ Banco de dados: PostgreSQL`);
        console.log(`✅ Pronto para uso!`);
    });
});

module.exports = app;
