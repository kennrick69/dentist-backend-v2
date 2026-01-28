// ==============================================================================
// BACKEND DENTAL ULTRA - VERSÃO 6.0 COM AGENDA MULTI-DENTISTA
// Sistema completo de gestão odontológica com PostgreSQL
// Inclui: Dentistas da clínica, Agendamentos, Fila de Encaixe
// ==============================================================================

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dental-ultra-secret-key-change-in-production-2024';

// ==============================================================================
// MIDDLEWARES
// ==============================================================================

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

// ==============================================================================
// POSTGRESQL CONNECTION
// ==============================================================================

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Erro PostgreSQL:', err.message);
    } else {
        console.log('PostgreSQL conectado:', res.rows[0].now);
    }
});

// ==============================================================================
// DATABASE INITIALIZATION
// ==============================================================================

async function initDatabase() {
    try {
        // Tabela de usuários/dentistas (quem faz login)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS dentistas (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                cro VARCHAR(50) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                senha VARCHAR(255) NOT NULL,
                clinica VARCHAR(255),
                especialidade VARCHAR(255),
                telefone VARCHAR(20),
                ativo BOOLEAN DEFAULT true,
                plano VARCHAR(50) DEFAULT 'premium',
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de profissionais da clínica (dentistas que aparecem na agenda)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS profissionais (
                id SERIAL PRIMARY KEY,
                dentista_id INTEGER REFERENCES dentistas(id) ON DELETE CASCADE,
                nome VARCHAR(255) NOT NULL,
                cro VARCHAR(30),
                especialidade VARCHAR(100) DEFAULT 'Clínico Geral',
                icone VARCHAR(10) DEFAULT '🦷',
                foto TEXT,
                cor VARCHAR(20) DEFAULT '#2d7a5f',
                ativo BOOLEAN DEFAULT true,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de pacientes (com suporte a menores de idade)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pacientes (
                id SERIAL PRIMARY KEY,
                dentista_id INTEGER REFERENCES dentistas(id) ON DELETE CASCADE,
                nome VARCHAR(255) NOT NULL,
                cpf VARCHAR(14),
                rg VARCHAR(20),
                data_nascimento DATE,
                sexo VARCHAR(20),
                telefone VARCHAR(20),
                celular VARCHAR(20),
                email VARCHAR(255),
                endereco VARCHAR(255),
                numero VARCHAR(20),
                complemento VARCHAR(100),
                bairro VARCHAR(100),
                cidade VARCHAR(100),
                estado VARCHAR(2),
                cep VARCHAR(10),
                convenio VARCHAR(100),
                numero_convenio VARCHAR(50),
                observacoes TEXT,
                menor_idade BOOLEAN DEFAULT false,
                responsavel_nome VARCHAR(255),
                responsavel_cpf VARCHAR(14),
                responsavel_rg VARCHAR(20),
                responsavel_telefone VARCHAR(20),
                responsavel_email VARCHAR(255),
                responsavel_parentesco VARCHAR(50),
                responsavel_endereco TEXT,
                ativo BOOLEAN DEFAULT true,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de agendamentos (ATUALIZADA para multi-dentista)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS agendamentos (
                id SERIAL PRIMARY KEY,
                dentista_id INTEGER REFERENCES dentistas(id) ON DELETE CASCADE,
                profissional_id INTEGER REFERENCES profissionais(id) ON DELETE CASCADE,
                paciente_id INTEGER REFERENCES pacientes(id) ON DELETE SET NULL,
                paciente_nome VARCHAR(255),
                paciente_telefone VARCHAR(30),
                data DATE NOT NULL,
                hora TIME NOT NULL,
                horario TIME,
                duracao INTEGER DEFAULT 30,
                procedimento VARCHAR(255),
                valor DECIMAL(10,2),
                status VARCHAR(50) DEFAULT 'agendado',
                encaixe BOOLEAN DEFAULT false,
                observacoes TEXT,
                codigo_confirmacao VARCHAR(10) UNIQUE,
                rotulo VARCHAR(50),
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de fila de encaixe (NOVA)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS fila_encaixe (
                id SERIAL PRIMARY KEY,
                dentista_id INTEGER REFERENCES dentistas(id) ON DELETE CASCADE,
                nome VARCHAR(255) NOT NULL,
                telefone VARCHAR(30) NOT NULL,
                motivo TEXT,
                urgente BOOLEAN DEFAULT false,
                resolvido BOOLEAN DEFAULT false,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                resolvido_em TIMESTAMP
            )
        `);

        // Tabela de prontuarios
        await pool.query(`
            CREATE TABLE IF NOT EXISTS prontuarios (
                id SERIAL PRIMARY KEY,
                dentista_id INTEGER REFERENCES dentistas(id) ON DELETE CASCADE,
                paciente_id INTEGER REFERENCES pacientes(id) ON DELETE CASCADE,
                data DATE NOT NULL,
                descricao TEXT NOT NULL,
                procedimento VARCHAR(255),
                dente VARCHAR(50),
                valor DECIMAL(10,2),
                anexos TEXT,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de financeiro
        await pool.query(`
            CREATE TABLE IF NOT EXISTS financeiro (
                id SERIAL PRIMARY KEY,
                dentista_id INTEGER REFERENCES dentistas(id) ON DELETE CASCADE,
                paciente_id INTEGER REFERENCES pacientes(id) ON DELETE SET NULL,
                tipo VARCHAR(20) NOT NULL,
                descricao VARCHAR(255) NOT NULL,
                valor DECIMAL(10,2) NOT NULL,
                data DATE NOT NULL,
                status VARCHAR(50) DEFAULT 'pendente',
                forma_pagamento VARCHAR(50),
                parcelas INTEGER DEFAULT 1,
                observacoes TEXT,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de notas fiscais
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notas_fiscais (
                id SERIAL PRIMARY KEY,
                dentista_id INTEGER REFERENCES dentistas(id) ON DELETE CASCADE,
                paciente_id INTEGER REFERENCES pacientes(id) ON DELETE SET NULL,
                numero VARCHAR(50),
                valor DECIMAL(10,2) NOT NULL,
                data_emissao DATE NOT NULL,
                descricao_servico TEXT,
                status VARCHAR(50) DEFAULT 'emitida',
                xml TEXT,
                pdf_url TEXT,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Adicionar colunas para bancos existentes
        const alterQueries = [
            // Agendamentos
            'ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS encaixe BOOLEAN DEFAULT false',
            'ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS valor DECIMAL(10,2)',
            'ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS codigo_confirmacao VARCHAR(10) UNIQUE',
            'ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS rotulo VARCHAR(50)',
            'ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS profissional_id INTEGER REFERENCES profissionais(id)',
            'ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS paciente_nome VARCHAR(255)',
            'ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS paciente_telefone VARCHAR(30)',
            'ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS hora TIME',
            // Pacientes
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS convenio VARCHAR(100)',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS numero_convenio VARCHAR(50)',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS menor_idade BOOLEAN DEFAULT false',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS responsavel_nome VARCHAR(255)',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS responsavel_cpf VARCHAR(14)',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS responsavel_rg VARCHAR(20)',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS responsavel_telefone VARCHAR(20)',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS responsavel_email VARCHAR(255)',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS responsavel_parentesco VARCHAR(50)',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS responsavel_endereco TEXT',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS estrangeiro BOOLEAN DEFAULT false',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS passaporte VARCHAR(50)',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS pais VARCHAR(100)',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS nacionalidade VARCHAR(100)',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(20) DEFAULT \'cpf\''
        ];

        for (const query of alterQueries) {
            try { await pool.query(query); } catch (e) {}
        }

        // Criar índices
        const indexQueries = [
            'CREATE INDEX IF NOT EXISTS idx_agendamentos_profissional ON agendamentos(profissional_id)',
            'CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos(data)',
            'CREATE INDEX IF NOT EXISTS idx_agendamentos_prof_data ON agendamentos(profissional_id, data)',
            'CREATE INDEX IF NOT EXISTS idx_profissionais_dentista ON profissionais(dentista_id)',
            'CREATE INDEX IF NOT EXISTS idx_fila_dentista ON fila_encaixe(dentista_id)'
        ];

        for (const query of indexQueries) {
            try { await pool.query(query); } catch (e) {}
        }

        console.log('Banco de dados inicializado com sucesso!');
    } catch (error) {
        console.error('Erro ao inicializar banco:', error.message);
    }
}

// ==============================================================================
// FUNÇÃO PARA GERAR CÓDIGO ÚNICO DE CONFIRMAÇÃO
// ==============================================================================

function gerarCodigoConfirmacao() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let codigo = '';
    for (let i = 0; i < 6; i++) {
        codigo += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return codigo;
}

async function gerarCodigoUnico() {
    for (let tentativa = 0; tentativa < 10; tentativa++) {
        const codigo = gerarCodigoConfirmacao();
        const existe = await pool.query(
            'SELECT id FROM agendamentos WHERE codigo_confirmacao = $1',
            [codigo]
        );
        if (existe.rows.length === 0) {
            return codigo;
        }
    }
    return gerarCodigoConfirmacao() + gerarCodigoConfirmacao().substring(0, 2);
}

// ==============================================================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ==============================================================================

function authMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, erro: 'Token não fornecido' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ success: false, erro: 'Token inválido' });
        }
        req.user = decoded;
        next();
    });
}

// ==============================================================================
// ROTAS DE AUTENTICAÇÃO
// ==============================================================================

app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, cro, email, password, clinic, specialty } = req.body;

        if (!name || !cro || !email || !password) {
            return res.status(400).json({ success: false, erro: 'Campos obrigatórios faltando' });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, erro: 'Senha deve ter no mínimo 6 caracteres' });
        }

        const existing = await pool.query('SELECT id FROM dentistas WHERE email = $1', [email.toLowerCase()]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ success: false, erro: 'Email já cadastrado' });
        }

        const senhaHash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO dentistas (nome, cro, email, senha, clinica, especialidade)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, nome, cro, email, clinica, especialidade`,
            [name, cro, email.toLowerCase(), senhaHash, clinic || '', specialty || '']
        );

        res.status(201).json({
            success: true,
            message: 'Cadastro realizado com sucesso!',
            dentista: { id: result.rows[0].id.toString(), nome: result.rows[0].nome, email: result.rows[0].email }
        });
    } catch (error) {
        console.error('Erro registro:', error);
        res.status(500).json({ success: false, erro: 'Erro interno' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, erro: 'Email e senha obrigatórios' });
        }

        const result = await pool.query('SELECT * FROM dentistas WHERE email = $1', [email.toLowerCase()]);
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, erro: 'Email ou senha incorretos' });
        }

        const dentista = result.rows[0];
        const senhaValida = await bcrypt.compare(password, dentista.senha);
        if (!senhaValida) {
            return res.status(401).json({ success: false, erro: 'Email ou senha incorretos' });
        }

        if (!dentista.ativo) {
            return res.status(403).json({ success: false, erro: 'Conta desativada' });
        }

        const token = jwt.sign(
            { id: dentista.id.toString(), email: dentista.email, nome: dentista.nome },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            message: 'Login realizado!',
            token,
            dentista: {
                id: dentista.id.toString(),
                nome: dentista.nome,
                cro: dentista.cro,
                email: dentista.email,
                clinica: dentista.clinica,
                especialidade: dentista.especialidade,
                plano: dentista.plano
            }
        });
    } catch (error) {
        console.error('Erro login:', error);
        res.status(500).json({ success: false, erro: 'Erro interno' });
    }
});

app.get('/api/auth/verify', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, nome, cro, email, clinica, especialidade, plano FROM dentistas WHERE id = $1',
            [parseInt(req.user.id)]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Usuário não encontrado' });
        }
        const d = result.rows[0];
        res.json({
            success: true,
            dentista: { id: d.id.toString(), nome: d.nome, cro: d.cro, email: d.email, clinica: d.clinica, especialidade: d.especialidade, plano: d.plano }
        });
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro interno' });
    }
});

// ==============================================================================
// ROTAS DE PROFISSIONAIS DA CLÍNICA (DENTISTAS DA AGENDA)
// ==============================================================================

// Listar profissionais
app.get('/api/dentistas', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM profissionais WHERE dentista_id = $1 AND ativo = true ORDER BY nome',
            [parseInt(req.user.id)]
        );
        
        const profissionais = result.rows.map(p => ({
            id: p.id,
            nome: p.nome,
            cro: p.cro,
            especialidade: p.especialidade,
            icone: p.icone,
            foto: p.foto,
            cor: p.cor
        }));
        
        res.json(profissionais);
    } catch (error) {
        console.error('Erro ao buscar profissionais:', error);
        res.status(500).json({ erro: 'Erro ao buscar profissionais' });
    }
});

// Buscar profissional por ID
app.get('/api/dentistas/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'SELECT * FROM profissionais WHERE id = $1 AND dentista_id = $2 AND ativo = true',
            [parseInt(id), parseInt(req.user.id)]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ erro: 'Profissional não encontrado' });
        }
        
        const p = result.rows[0];
        res.json({
            id: p.id,
            nome: p.nome,
            cro: p.cro,
            especialidade: p.especialidade,
            icone: p.icone,
            foto: p.foto
        });
    } catch (error) {
        console.error('Erro ao buscar profissional:', error);
        res.status(500).json({ erro: 'Erro ao buscar profissional' });
    }
});

// Criar profissional
app.post('/api/dentistas', authMiddleware, async (req, res) => {
    try {
        const { nome, cro, especialidade, icone, foto } = req.body;
        
        if (!nome) {
            return res.status(400).json({ erro: 'Nome é obrigatório' });
        }
        
        const result = await pool.query(
            `INSERT INTO profissionais (dentista_id, nome, cro, especialidade, icone, foto) 
             VALUES ($1, $2, $3, $4, $5, $6) 
             RETURNING *`,
            [parseInt(req.user.id), nome, cro || null, especialidade || 'Clínico Geral', icone || '🦷', foto || null]
        );
        
        const p = result.rows[0];
        res.status(201).json({
            id: p.id,
            nome: p.nome,
            cro: p.cro,
            especialidade: p.especialidade,
            icone: p.icone,
            foto: p.foto
        });
    } catch (error) {
        console.error('Erro ao criar profissional:', error);
        res.status(500).json({ erro: 'Erro ao criar profissional' });
    }
});

// Atualizar profissional
app.put('/api/dentistas/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, cro, especialidade, icone, foto } = req.body;
        
        const result = await pool.query(
            `UPDATE profissionais 
             SET nome = COALESCE($1, nome), 
                 cro = COALESCE($2, cro), 
                 especialidade = COALESCE($3, especialidade), 
                 icone = COALESCE($4, icone),
                 foto = COALESCE($5, foto),
                 atualizado_em = NOW()
             WHERE id = $6 AND dentista_id = $7 AND ativo = true
             RETURNING *`,
            [nome, cro, especialidade, icone, foto, parseInt(id), parseInt(req.user.id)]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ erro: 'Profissional não encontrado' });
        }
        
        const p = result.rows[0];
        res.json({
            id: p.id,
            nome: p.nome,
            cro: p.cro,
            especialidade: p.especialidade,
            icone: p.icone,
            foto: p.foto
        });
    } catch (error) {
        console.error('Erro ao atualizar profissional:', error);
        res.status(500).json({ erro: 'Erro ao atualizar profissional' });
    }
});

// Excluir profissional (COM VALIDAÇÃO DE SENHA)
app.delete('/api/dentistas/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { senha } = req.query;
        
        // Validar senha
        if (!senha) {
            return res.status(400).json({ erro: 'Senha é obrigatória para excluir' });
        }
        
        // Buscar usuário e verificar senha
        const userResult = await pool.query(
            'SELECT senha FROM dentistas WHERE id = $1',
            [parseInt(req.user.id)]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(401).json({ erro: 'Usuário não encontrado' });
        }
        
        // Verificar senha com bcrypt
        const senhaValida = await bcrypt.compare(senha, userResult.rows[0].senha);
        if (!senhaValida) {
            return res.status(403).json({ erro: 'Senha incorreta' });
        }
        
        // Senha correta, fazer soft delete
        await pool.query(
            'UPDATE profissionais SET ativo = false, atualizado_em = NOW() WHERE id = $1 AND dentista_id = $2',
            [parseInt(id), parseInt(req.user.id)]
        );
        
        res.json({ message: 'Profissional removido com sucesso' });
    } catch (error) {
        console.error('Erro ao excluir profissional:', error);
        res.status(500).json({ erro: 'Erro ao excluir profissional' });
    }
});

// ==============================================================================
// ROTAS DE AGENDAMENTOS (MULTI-DENTISTA)
// ==============================================================================

// Listar agendamentos (com filtros)
app.get('/api/agendamentos', authMiddleware, async (req, res) => {
    try {
        const { dentista_id, data, data_inicio, data_fim } = req.query;
        
        let query = `
            SELECT a.*, 
                   p.nome as profissional_nome, 
                   p.icone as profissional_icone,
                   p.especialidade as profissional_especialidade,
                   pac.nome as nome_paciente
            FROM agendamentos a
            LEFT JOIN profissionais p ON a.profissional_id = p.id
            LEFT JOIN pacientes pac ON a.paciente_id = pac.id
            WHERE a.dentista_id = $1
        `;
        const params = [parseInt(req.user.id)];
        let paramCount = 2;
        
        if (dentista_id) {
            query += ` AND a.profissional_id = $${paramCount}`;
            params.push(parseInt(dentista_id));
            paramCount++;
        }
        
        if (data) {
            query += ` AND a.data = $${paramCount}`;
            params.push(data);
            paramCount++;
        } else if (data_inicio && data_fim) {
            query += ` AND a.data BETWEEN $${paramCount} AND $${paramCount + 1}`;
            params.push(data_inicio, data_fim);
            paramCount += 2;
        }
        
        query += ' ORDER BY a.data, COALESCE(a.hora, a.horario)';
        
        const result = await pool.query(query, params);
        
        const agendamentos = result.rows.map(a => ({
            id: a.id,
            dentista_id: a.profissional_id,
            paciente_id: a.paciente_id,
            paciente_nome: a.paciente_nome || a.nome_paciente,
            paciente_telefone: a.paciente_telefone,
            data: a.data,
            hora: a.hora ? a.hora.substring(0, 5) : (a.horario ? a.horario.substring(0, 5) : null),
            duracao: a.duracao || 30,
            procedimento: a.procedimento,
            status: a.status,
            observacoes: a.observacoes,
            encaixe: a.encaixe,
            profissional_nome: a.profissional_nome,
            profissional_icone: a.profissional_icone
        }));
        
        res.json(agendamentos);
    } catch (error) {
        console.error('Erro ao buscar agendamentos:', error);
        res.status(500).json({ erro: 'Erro ao buscar agendamentos' });
    }
});

// Buscar agendamento por ID
app.get('/api/agendamentos/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT a.*, p.nome as profissional_nome 
             FROM agendamentos a 
             LEFT JOIN profissionais p ON a.profissional_id = p.id 
             WHERE a.id = $1 AND a.dentista_id = $2`,
            [parseInt(id), parseInt(req.user.id)]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ erro: 'Agendamento não encontrado' });
        }
        
        const a = result.rows[0];
        res.json({
            id: a.id,
            dentista_id: a.profissional_id,
            paciente_id: a.paciente_id,
            paciente_nome: a.paciente_nome,
            paciente_telefone: a.paciente_telefone,
            data: a.data,
            hora: a.hora ? a.hora.substring(0, 5) : (a.horario ? a.horario.substring(0, 5) : null),
            duracao: a.duracao,
            procedimento: a.procedimento,
            status: a.status,
            observacoes: a.observacoes,
            encaixe: a.encaixe
        });
    } catch (error) {
        console.error('Erro ao buscar agendamento:', error);
        res.status(500).json({ erro: 'Erro ao buscar agendamento' });
    }
});

// Criar agendamento
app.post('/api/agendamentos', authMiddleware, async (req, res) => {
    try {
        const { 
            dentista_id, 
            paciente_id, 
            paciente_nome,
            paciente_telefone,
            data, 
            hora, 
            duracao, 
            procedimento, 
            observacoes,
            encaixe 
        } = req.body;
        
        if (!dentista_id || !data || !hora) {
            return res.status(400).json({ erro: 'Profissional, data e hora são obrigatórios' });
        }
        
        // Verificar conflito (exceto encaixes)
        if (!encaixe) {
            const conflito = await pool.query(
                `SELECT id FROM agendamentos 
                 WHERE profissional_id = $1 AND data = $2 AND (hora = $3 OR horario = $3)
                 AND status NOT IN ('cancelado', 'faltou')`,
                [parseInt(dentista_id), data, hora]
            );
            
            if (conflito.rows.length > 0) {
                return res.status(409).json({ erro: 'Horário já ocupado para este profissional' });
            }
        }
        
        // Gerar código de confirmação
        const codigo = await gerarCodigoUnico();
        
        const result = await pool.query(
            `INSERT INTO agendamentos 
             (dentista_id, profissional_id, paciente_id, paciente_nome, paciente_telefone, data, hora, horario, duracao, procedimento, observacoes, encaixe, codigo_confirmacao)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10, $11, $12)
             RETURNING *`,
            [
                parseInt(req.user.id),
                parseInt(dentista_id), 
                paciente_id ? parseInt(paciente_id) : null, 
                paciente_nome || null,
                paciente_telefone || null,
                data, 
                hora, 
                duracao || 30, 
                procedimento || null, 
                observacoes || null,
                encaixe || false,
                codigo
            ]
        );
        
        const a = result.rows[0];
        res.status(201).json({
            id: a.id,
            dentista_id: a.profissional_id,
            paciente_id: a.paciente_id,
            paciente_nome: a.paciente_nome,
            data: a.data,
            hora: a.hora ? a.hora.substring(0, 5) : null,
            duracao: a.duracao,
            procedimento: a.procedimento,
            codigo_confirmacao: a.codigo_confirmacao
        });
    } catch (error) {
        console.error('Erro ao criar agendamento:', error);
        res.status(500).json({ erro: 'Erro ao criar agendamento' });
    }
});

// Atualizar agendamento
app.put('/api/agendamentos/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            paciente_id, 
            paciente_nome,
            paciente_telefone,
            data, 
            hora, 
            duracao, 
            procedimento, 
            status,
            observacoes 
        } = req.body;
        
        const result = await pool.query(
            `UPDATE agendamentos SET 
             paciente_id = COALESCE($1, paciente_id),
             paciente_nome = COALESCE($2, paciente_nome),
             paciente_telefone = COALESCE($3, paciente_telefone),
             data = COALESCE($4, data),
             hora = COALESCE($5, hora),
             horario = COALESCE($5, horario),
             duracao = COALESCE($6, duracao),
             procedimento = COALESCE($7, procedimento),
             status = COALESCE($8, status),
             observacoes = COALESCE($9, observacoes),
             atualizado_em = NOW()
             WHERE id = $10 AND dentista_id = $11
             RETURNING *`,
            [
                paciente_id ? parseInt(paciente_id) : null, 
                paciente_nome, 
                paciente_telefone, 
                data, 
                hora, 
                duracao, 
                procedimento, 
                status, 
                observacoes, 
                parseInt(id),
                parseInt(req.user.id)
            ]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ erro: 'Agendamento não encontrado' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Erro ao atualizar agendamento:', error);
        res.status(500).json({ erro: 'Erro ao atualizar agendamento' });
    }
});

// Atualizar status do agendamento
app.patch('/api/agendamentos/:id/status', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const statusValidos = ['agendado', 'confirmado', 'atendido', 'faltou', 'cancelado'];
        if (!statusValidos.includes(status)) {
            return res.status(400).json({ erro: 'Status inválido' });
        }
        
        const result = await pool.query(
            `UPDATE agendamentos SET status = $1, atualizado_em = NOW() 
             WHERE id = $2 AND dentista_id = $3 RETURNING *`,
            [status, parseInt(id), parseInt(req.user.id)]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ erro: 'Agendamento não encontrado' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Erro ao atualizar status:', error);
        res.status(500).json({ erro: 'Erro ao atualizar status' });
    }
});

// Excluir agendamento
app.delete('/api/agendamentos/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            'DELETE FROM agendamentos WHERE id = $1 AND dentista_id = $2 RETURNING id',
            [parseInt(id), parseInt(req.user.id)]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ erro: 'Agendamento não encontrado' });
        }
        
        res.json({ message: 'Agendamento excluído com sucesso' });
    } catch (error) {
        console.error('Erro ao excluir agendamento:', error);
        res.status(500).json({ erro: 'Erro ao excluir agendamento' });
    }
});

// ==============================================================================
// ROTAS DE FILA DE ENCAIXE
// ==============================================================================

// Listar fila de encaixe
app.get('/api/fila-encaixe', authMiddleware, async (req, res) => {
    try {
        const { incluir_resolvidos } = req.query;
        
        let query = 'SELECT * FROM fila_encaixe WHERE dentista_id = $1';
        if (incluir_resolvidos !== 'true') {
            query += ' AND resolvido = false';
        }
        query += ' ORDER BY urgente DESC, criado_em ASC';
        
        const result = await pool.query(query, [parseInt(req.user.id)]);
        
        const fila = result.rows.map(f => ({
            id: f.id,
            nome: f.nome,
            telefone: f.telefone,
            motivo: f.motivo,
            urgente: f.urgente,
            resolvido: f.resolvido,
            created_at: f.criado_em
        }));
        
        res.json(fila);
    } catch (error) {
        console.error('Erro ao buscar fila:', error);
        res.status(500).json({ erro: 'Erro ao buscar fila de encaixe' });
    }
});

// Adicionar à fila de encaixe
app.post('/api/fila-encaixe', authMiddleware, async (req, res) => {
    try {
        const { nome, telefone, motivo, urgente } = req.body;
        
        if (!nome || !telefone) {
            return res.status(400).json({ erro: 'Nome e telefone são obrigatórios' });
        }
        
        const result = await pool.query(
            `INSERT INTO fila_encaixe (dentista_id, nome, telefone, motivo, urgente)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [parseInt(req.user.id), nome, telefone, motivo || null, urgente || false]
        );
        
        const f = result.rows[0];
        res.status(201).json({
            id: f.id,
            nome: f.nome,
            telefone: f.telefone,
            motivo: f.motivo,
            urgente: f.urgente,
            created_at: f.criado_em
        });
    } catch (error) {
        console.error('Erro ao adicionar à fila:', error);
        res.status(500).json({ erro: 'Erro ao adicionar à fila' });
    }
});

// Marcar como resolvido
app.patch('/api/fila-encaixe/:id/resolver', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            `UPDATE fila_encaixe 
             SET resolvido = true, resolvido_em = NOW() 
             WHERE id = $1 AND dentista_id = $2
             RETURNING *`,
            [parseInt(id), parseInt(req.user.id)]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ erro: 'Item não encontrado' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Erro ao resolver item:', error);
        res.status(500).json({ erro: 'Erro ao marcar como resolvido' });
    }
});

// Remover da fila
app.delete('/api/fila-encaixe/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            'DELETE FROM fila_encaixe WHERE id = $1 AND dentista_id = $2 RETURNING id',
            [parseInt(id), parseInt(req.user.id)]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ erro: 'Item não encontrado' });
        }
        
        res.json({ message: 'Removido da fila com sucesso' });
    } catch (error) {
        console.error('Erro ao remover da fila:', error);
        res.status(500).json({ erro: 'Erro ao remover da fila' });
    }
});

// ==============================================================================
// ROTAS DE PACIENTES
// ==============================================================================

app.get('/api/pacientes', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM pacientes WHERE dentista_id = $1 AND (ativo = true OR ativo IS NULL) ORDER BY nome ASC`,
            [parseInt(req.user.id)]
        );

        const pacientes = result.rows.map(p => ({
            id: p.id.toString(),
            nome: p.nome,
            cpf: p.cpf,
            rg: p.rg,
            dataNascimento: p.data_nascimento,
            sexo: p.sexo,
            telefone: p.telefone,
            celular: p.celular,
            email: p.email,
            endereco: p.endereco,
            numero: p.numero,
            complemento: p.complemento,
            bairro: p.bairro,
            cidade: p.cidade,
            estado: p.estado,
            cep: p.cep,
            convenio: p.convenio,
            numeroConvenio: p.numero_convenio,
            observacoes: p.observacoes,
            menorIdade: p.menor_idade,
            responsavelNome: p.responsavel_nome,
            responsavelCpf: p.responsavel_cpf,
            responsavelTelefone: p.responsavel_telefone,
            responsavelEmail: p.responsavel_email,
            responsavelParentesco: p.responsavel_parentesco,
            estrangeiro: p.estrangeiro,
            passaporte: p.passaporte,
            pais: p.pais,
            tipoDocumento: p.tipo_documento,
            criadoEm: p.criado_em
        }));

        res.json({ success: true, pacientes, total: pacientes.length });
    } catch (error) {
        console.error('Erro listar pacientes:', error);
        res.status(500).json({ success: false, erro: 'Erro ao listar pacientes' });
    }
});

app.get('/api/pacientes/:id', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM pacientes WHERE id = $1 AND dentista_id = $2',
            [parseInt(req.params.id), parseInt(req.user.id)]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Paciente não encontrado' });
        }

        const p = result.rows[0];
        res.json({
            success: true,
            paciente: {
                id: p.id.toString(),
                nome: p.nome,
                cpf: p.cpf,
                rg: p.rg,
                dataNascimento: p.data_nascimento,
                sexo: p.sexo,
                telefone: p.telefone,
                celular: p.celular,
                email: p.email,
                endereco: p.endereco,
                numero: p.numero,
                complemento: p.complemento,
                bairro: p.bairro,
                cidade: p.cidade,
                estado: p.estado,
                cep: p.cep,
                convenio: p.convenio,
                numeroConvenio: p.numero_convenio,
                observacoes: p.observacoes,
                menorIdade: p.menor_idade,
                responsavelNome: p.responsavel_nome,
                responsavelCpf: p.responsavel_cpf,
                responsavelRg: p.responsavel_rg,
                responsavelTelefone: p.responsavel_telefone,
                responsavelEmail: p.responsavel_email,
                responsavelParentesco: p.responsavel_parentesco,
                responsavelEndereco: p.responsavel_endereco,
                estrangeiro: p.estrangeiro,
                passaporte: p.passaporte,
                pais: p.pais,
                nacionalidade: p.nacionalidade,
                tipoDocumento: p.tipo_documento
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro ao buscar paciente' });
    }
});

app.post('/api/pacientes', authMiddleware, async (req, res) => {
    try {
        const {
            nome, cpf, rg, dataNascimento, sexo, telefone, celular, email,
            endereco, numero, complemento, bairro, cidade, estado, cep,
            convenio, numeroConvenio, observacoes,
            menorIdade, responsavelNome, responsavelCpf, responsavelRg,
            responsavelTelefone, responsavelEmail, responsavelParentesco, responsavelEndereco,
            estrangeiro, passaporte, pais, nacionalidade, tipoDocumento
        } = req.body;

        if (!nome) {
            return res.status(400).json({ success: false, erro: 'Nome é obrigatório' });
        }

        const result = await pool.query(
            `INSERT INTO pacientes (
                dentista_id, nome, cpf, rg, data_nascimento, sexo, telefone, celular, email,
                endereco, numero, complemento, bairro, cidade, estado, cep,
                convenio, numero_convenio, observacoes,
                menor_idade, responsavel_nome, responsavel_cpf, responsavel_rg,
                responsavel_telefone, responsavel_email, responsavel_parentesco, responsavel_endereco,
                estrangeiro, passaporte, pais, nacionalidade, tipo_documento
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
            RETURNING *`,
            [
                parseInt(req.user.id), nome, cpf, rg, dataNascimento || null, sexo, telefone, celular, email,
                endereco, numero, complemento, bairro, cidade, estado, cep,
                convenio, numeroConvenio, observacoes,
                menorIdade || false, responsavelNome, responsavelCpf, responsavelRg,
                responsavelTelefone, responsavelEmail, responsavelParentesco, responsavelEndereco,
                estrangeiro || false, passaporte, pais, nacionalidade, tipoDocumento || 'cpf'
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Paciente cadastrado com sucesso!',
            paciente: { id: result.rows[0].id.toString(), nome: result.rows[0].nome }
        });
    } catch (error) {
        console.error('Erro criar paciente:', error);
        res.status(500).json({ success: false, erro: 'Erro ao cadastrar paciente' });
    }
});

app.put('/api/pacientes/:id', authMiddleware, async (req, res) => {
    try {
        const {
            nome, cpf, rg, dataNascimento, sexo, telefone, celular, email,
            endereco, numero, complemento, bairro, cidade, estado, cep,
            convenio, numeroConvenio, observacoes,
            menorIdade, responsavelNome, responsavelCpf, responsavelRg,
            responsavelTelefone, responsavelEmail, responsavelParentesco, responsavelEndereco,
            estrangeiro, passaporte, pais, nacionalidade, tipoDocumento
        } = req.body;

        const result = await pool.query(
            `UPDATE pacientes SET
                nome = COALESCE($1, nome), cpf = $2, rg = $3, data_nascimento = $4, sexo = $5,
                telefone = $6, celular = $7, email = $8, endereco = $9, numero = $10,
                complemento = $11, bairro = $12, cidade = $13, estado = $14, cep = $15,
                convenio = $16, numero_convenio = $17, observacoes = $18,
                menor_idade = $19, responsavel_nome = $20, responsavel_cpf = $21, responsavel_rg = $22,
                responsavel_telefone = $23, responsavel_email = $24, responsavel_parentesco = $25, responsavel_endereco = $26,
                estrangeiro = $27, passaporte = $28, pais = $29, nacionalidade = $30, tipo_documento = $31,
                atualizado_em = NOW()
            WHERE id = $32 AND dentista_id = $33
            RETURNING *`,
            [
                nome, cpf, rg, dataNascimento || null, sexo, telefone, celular, email,
                endereco, numero, complemento, bairro, cidade, estado, cep,
                convenio, numeroConvenio, observacoes,
                menorIdade || false, responsavelNome, responsavelCpf, responsavelRg,
                responsavelTelefone, responsavelEmail, responsavelParentesco, responsavelEndereco,
                estrangeiro || false, passaporte, pais, nacionalidade, tipoDocumento || 'cpf',
                parseInt(req.params.id), parseInt(req.user.id)
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Paciente não encontrado' });
        }

        res.json({ success: true, message: 'Paciente atualizado!' });
    } catch (error) {
        console.error('Erro atualizar paciente:', error);
        res.status(500).json({ success: false, erro: 'Erro ao atualizar paciente' });
    }
});

app.delete('/api/pacientes/:id', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'UPDATE pacientes SET ativo = false WHERE id = $1 AND dentista_id = $2 RETURNING id',
            [parseInt(req.params.id), parseInt(req.user.id)]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Paciente não encontrado' });
        }

        res.json({ success: true, message: 'Paciente removido!' });
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro ao remover paciente' });
    }
});

// ==============================================================================
// ROTAS DE PRONTUÁRIOS
// ==============================================================================

app.get('/api/prontuarios', authMiddleware, async (req, res) => {
    try {
        const { pacienteId } = req.query;
        let query = `
            SELECT pr.*, p.nome as paciente_nome FROM prontuarios pr
            LEFT JOIN pacientes p ON pr.paciente_id = p.id
            WHERE pr.dentista_id = $1
        `;
        const params = [parseInt(req.user.id)];

        if (pacienteId) {
            query += ' AND pr.paciente_id = $2';
            params.push(parseInt(pacienteId));
        }

        query += ' ORDER BY pr.data DESC, pr.criado_em DESC';

        const result = await pool.query(query, params);
        const prontuarios = result.rows.map(pr => ({
            id: pr.id.toString(), pacienteId: pr.paciente_id?.toString(), pacienteNome: pr.paciente_nome,
            data: pr.data, descricao: pr.descricao, procedimento: pr.procedimento,
            dente: pr.dente, valor: pr.valor ? parseFloat(pr.valor) : null, criadoEm: pr.criado_em
        }));

        res.json({ success: true, prontuarios, total: prontuarios.length });
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro ao listar prontuários' });
    }
});

app.post('/api/prontuarios', authMiddleware, async (req, res) => {
    try {
        const { pacienteId, data, descricao, procedimento, dente, valor } = req.body;

        if (!pacienteId || !data || !descricao) {
            return res.status(400).json({ success: false, erro: 'Paciente, data e descrição obrigatórios' });
        }

        const result = await pool.query(
            `INSERT INTO prontuarios (dentista_id, paciente_id, data, descricao, procedimento, dente, valor)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
            [parseInt(req.user.id), parseInt(pacienteId), data, descricao, procedimento, dente, valor ? parseFloat(valor) : null]
        );

        res.status(201).json({ success: true, message: 'Registro adicionado!', prontuario: { id: result.rows[0].id.toString() } });
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro ao adicionar registro' });
    }
});

// ==============================================================================
// ROTAS DE FINANCEIRO
// ==============================================================================

app.get('/api/financeiro', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT f.*, p.nome as paciente_nome FROM financeiro f 
             LEFT JOIN pacientes p ON f.paciente_id = p.id 
             WHERE f.dentista_id = $1 ORDER BY f.data DESC`,
            [parseInt(req.user.id)]
        );

        const movimentacoes = result.rows.map(m => ({
            id: m.id.toString(), tipo: m.tipo, descricao: m.descricao, valor: parseFloat(m.valor),
            data: m.data, status: m.status, formaPagamento: m.forma_pagamento, parcelas: m.parcelas,
            pacienteId: m.paciente_id ? m.paciente_id.toString() : null, pacienteNome: m.paciente_nome,
            observacoes: m.observacoes, criadoEm: m.criado_em
        }));

        res.json({ success: true, movimentacoes, total: movimentacoes.length });
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro ao listar movimentações' });
    }
});

app.post('/api/financeiro', authMiddleware, async (req, res) => {
    try {
        const { tipo, descricao, valor, data, status, formaPagamento, parcelas, pacienteId, observacoes } = req.body;

        if (!tipo || !descricao || !valor || !data) {
            return res.status(400).json({ success: false, erro: 'Tipo, descrição, valor e data obrigatórios' });
        }

        const result = await pool.query(
            `INSERT INTO financeiro (dentista_id, tipo, descricao, valor, data, status, forma_pagamento, parcelas, paciente_id, observacoes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
            [parseInt(req.user.id), tipo, descricao, parseFloat(valor), data, status || 'pendente', formaPagamento, parcelas || 1, pacienteId ? parseInt(pacienteId) : null, observacoes]
        );

        res.status(201).json({ success: true, message: 'Movimentação registrada!', movimentacao: { id: result.rows[0].id.toString() } });
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro ao registrar movimentação' });
    }
});

// ==============================================================================
// ROTAS DE DASHBOARD
// ==============================================================================

app.get('/api/dashboard', authMiddleware, async (req, res) => {
    try {
        const hoje = new Date().toISOString().split('T')[0];
        const inicioMes = new Date();
        inicioMes.setDate(1);
        const inicioMesStr = inicioMes.toISOString().split('T')[0];

        const [pacientes, hojeAgend, mesAgend, receitas, proximos] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM pacientes WHERE dentista_id = $1 AND (ativo = true OR ativo IS NULL)', [parseInt(req.user.id)]),
            pool.query('SELECT COUNT(*) FROM agendamentos WHERE dentista_id = $1 AND data = $2', [parseInt(req.user.id), hoje]),
            pool.query('SELECT COUNT(*) FROM agendamentos WHERE dentista_id = $1 AND data >= $2', [parseInt(req.user.id), inicioMesStr]),
            pool.query(`SELECT COALESCE(SUM(valor), 0) as total FROM financeiro WHERE dentista_id = $1 AND tipo = 'receita' AND data >= $2`, [parseInt(req.user.id), inicioMesStr]),
            pool.query(`SELECT a.*, p.nome as paciente_nome FROM agendamentos a LEFT JOIN pacientes p ON a.paciente_id = p.id WHERE a.dentista_id = $1 AND a.data >= $2 ORDER BY a.data ASC, COALESCE(a.hora, a.horario) ASC LIMIT 5`, [parseInt(req.user.id), hoje])
        ]);

        res.json({
            success: true,
            dashboard: {
                totalPacientes: parseInt(pacientes.rows[0].count),
                agendamentosHoje: parseInt(hojeAgend.rows[0].count),
                agendamentosMes: parseInt(mesAgend.rows[0].count),
                receitasMes: parseFloat(receitas.rows[0].total),
                proximosAgendamentos: proximos.rows.map(a => ({
                    id: a.id.toString(), pacienteNome: a.paciente_nome || a.paciente_nome, data: a.data, horario: a.hora || a.horario, procedimento: a.procedimento
                }))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro ao carregar dashboard' });
    }
});

// ==============================================================================
// ROTAS UTILITÁRIAS
// ==============================================================================

app.get('/', (req, res) => {
    res.json({
        name: 'Dental Ultra API',
        version: '6.0.0',
        status: 'online',
        database: 'PostgreSQL',
        features: ['Multi-dentista', 'Fila de Encaixe', 'Upload de Foto'],
        timestamp: new Date().toISOString()
    });
});

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'healthy', database: 'connected', timestamp: new Date().toISOString() });
    } catch (error) {
        res.status(500).json({ status: 'unhealthy', database: 'disconnected' });
    }
});

app.use((req, res) => {
    res.status(404).json({ success: false, erro: 'Endpoint não encontrado' });
});

// ==============================================================================
// START SERVER
// ==============================================================================

initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log('');
        console.log('==============================================');
        console.log('   DENTAL ULTRA API - VERSÃO 6.0');
        console.log('   COM AGENDA MULTI-DENTISTA');
        console.log('==============================================');
        console.log('   Servidor: http://localhost:' + PORT);
        console.log('   Banco: PostgreSQL');
        console.log('   Status: Online');
        console.log('==============================================');
        console.log('');
    });
});

module.exports = app;
