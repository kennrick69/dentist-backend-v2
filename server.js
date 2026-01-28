// ==============================================================================
// BACKEND DENTAL ULTRA - VERSÃO 6.0 - AGENDA MULTI-DENTISTA
// Sistema completo de gestão odontológica com PostgreSQL
// Inclui suporte a pacientes menores de idade com dados do responsável
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
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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
        // Tabela de dentistas
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

        // Tabela de agendamentos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS agendamentos (
                id SERIAL PRIMARY KEY,
                dentista_id INTEGER REFERENCES dentistas(id) ON DELETE CASCADE,
                paciente_id INTEGER REFERENCES pacientes(id) ON DELETE SET NULL,
                paciente_nome VARCHAR(255),
                data DATE NOT NULL,
                horario TIME NOT NULL,
                duracao INTEGER DEFAULT 60,
                procedimento VARCHAR(255),
                valor DECIMAL(10,2),
                status VARCHAR(50) DEFAULT 'confirmado',
                encaixe BOOLEAN DEFAULT false,
                observacoes TEXT,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

        // Tabela de fila de encaixe
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

        // Adicionar colunas para bancos existentes
        const alterQueries = [
            'ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS encaixe BOOLEAN DEFAULT false',
            'ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS valor DECIMAL(10,2)',
            'ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS codigo_confirmacao VARCHAR(10) UNIQUE',
            'ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS rotulo VARCHAR(50)',
            'ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS profissional_id INTEGER',
            'ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS paciente_nome VARCHAR(255)',
            'ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS paciente_telefone VARCHAR(30)',
            'ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS hora TIME',
            'ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS duracao INTEGER DEFAULT 30',
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
            // Campos para paciente estrangeiro
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS estrangeiro BOOLEAN DEFAULT false',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS passaporte VARCHAR(50)',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS pais VARCHAR(100)',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS nacionalidade VARCHAR(100)',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(20) DEFAULT \'cpf\''
        ];

        for (const query of alterQueries) {
            try { await pool.query(query); } catch (e) {}
        }

        console.log('Banco de dados inicializado!');
    } catch (error) {
        console.error('Erro ao inicializar banco:', error.message);
    }
}

// ==============================================================================
// FUNÇÃO PARA GERAR CÓDIGO ÚNICO DE CONFIRMAÇÃO
// ==============================================================================

function gerarCodigoConfirmacao() {
    // Gera código de 6 caracteres (letras maiúsculas + números)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sem 0, O, 1, I para evitar confusão
    let codigo = '';
    for (let i = 0; i < 6; i++) {
        codigo += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return codigo;
}

async function gerarCodigoUnico() {
    // Tenta até 10 vezes gerar um código que não existe
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
    // Se falhar 10 vezes, gera um código maior
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
            `INSERT INTO dentistas (name, cro, email, password, clinic, specialty)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, cro, email, clinic, specialty`,
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
        if (!dentista.password) {
            return res.status(401).json({ success: false, erro: 'Email ou senha incorretos' });
        }
        const senhaValida = await bcrypt.compare(password, dentista.password);
        if (!senhaValida) {
            return res.status(401).json({ success: false, erro: 'Email ou senha incorretos' });
        }

        if (!dentista.ativo) {
            return res.status(403).json({ success: false, erro: 'Conta desativada' });
        }

        const token = jwt.sign(
            { id: dentista.id.toString(), email: dentista.email, nome: dentista.name },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            message: 'Login realizado!',
            token,
            dentista: {
                id: dentista.id.toString(),
                nome: dentista.name,
                cro: dentista.cro,
                email: dentista.email,
                clinica: dentista.clinic,
                especialidade: dentista.specialty,
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
            'SELECT id, name, cro, email, clinic, specialty, plano FROM dentistas WHERE id = $1',
            [parseInt(req.user.id)]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Usuário não encontrado' });
        }
        const d = result.rows[0];
        res.json({
            success: true,
            dentista: { id: d.id.toString(), nome: d.name, cro: d.cro, email: d.email, clinica: d.clinic, especialidade: d.specialty, plano: d.plano }
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
        
        if (!senha) {
            return res.status(400).json({ erro: 'Senha é obrigatória para excluir' });
        }
        
        const userResult = await pool.query(
            'SELECT password FROM dentistas WHERE id = $1',
            [parseInt(req.user.id)]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(401).json({ erro: 'Usuário não encontrado' });
        }
        
        const senhaValida = await bcrypt.compare(senha, userResult.rows[0].password);
        if (!senhaValida) {
            return res.status(403).json({ erro: 'Senha incorreta' });
        }
        
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

// Listar pacientes
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
            menorIdade: p.menor_idade || false,
            responsavelNome: p.responsavel_nome,
            responsavelCpf: p.responsavel_cpf,
            responsavelRg: p.responsavel_rg,
            responsavelTelefone: p.responsavel_telefone,
            responsavelEmail: p.responsavel_email,
            responsavelParentesco: p.responsavel_parentesco,
            responsavelEndereco: p.responsavel_endereco,
            // Campos de estrangeiro
            estrangeiro: p.estrangeiro || false,
            passaporte: p.passaporte,
            pais: p.pais,
            nacionalidade: p.nacionalidade,
            tipo_documento: p.tipo_documento || 'cpf',
            criadoEm: p.criado_em
        }));

        res.json({ success: true, pacientes, total: pacientes.length });
    } catch (error) {
        console.error('Erro listar pacientes:', error);
        res.status(500).json({ success: false, erro: 'Erro ao listar pacientes' });
    }
});

// Buscar paciente por ID
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
                menorIdade: p.menor_idade || false,
                responsavelNome: p.responsavel_nome,
                responsavelCpf: p.responsavel_cpf,
                responsavelRg: p.responsavel_rg,
                responsavelTelefone: p.responsavel_telefone,
                responsavelEmail: p.responsavel_email,
                responsavelParentesco: p.responsavel_parentesco,
                responsavelEndereco: p.responsavel_endereco,
                criadoEm: p.criado_em
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro ao buscar paciente' });
    }
});

// Criar paciente
app.post('/api/pacientes', authMiddleware, async (req, res) => {
    try {
        const {
            nome, cpf, rg, dataNascimento, sexo, telefone, celular, email,
            endereco, numero, complemento, bairro, cidade, estado, cep,
            convenio, numeroConvenio, observacoes,
            menorIdade, responsavelNome, responsavelCpf, responsavelRg,
            responsavelTelefone, responsavelEmail, responsavelParentesco, responsavelEndereco,
            // Campos de estrangeiro
            estrangeiro, passaporte, pais, nacionalidade, tipo_documento
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
                parseInt(req.user.id), nome, cpf || null, rg || null,
                dataNascimento || null, sexo || null, telefone || null, celular || null, email || null,
                endereco || null, numero || null, complemento || null, bairro || null,
                cidade || null, estado || null, cep || null,
                convenio || null, numeroConvenio || null, observacoes || null,
                menorIdade || false, responsavelNome || null, responsavelCpf || null, responsavelRg || null,
                responsavelTelefone || null, responsavelEmail || null, responsavelParentesco || null, responsavelEndereco || null,
                estrangeiro || false, passaporte || null, pais || null, nacionalidade || null, tipo_documento || 'cpf'
            ]
        );

        const p = result.rows[0];
        res.status(201).json({
            success: true,
            message: 'Paciente cadastrado com sucesso!',
            paciente: {
                id: p.id.toString(),
                nome: p.nome,
                cpf: p.cpf,
                telefone: p.telefone,
                celular: p.celular,
                email: p.email,
                menorIdade: p.menor_idade || false,
                responsavelNome: p.responsavel_nome,
                estrangeiro: p.estrangeiro || false,
                passaporte: p.passaporte,
                pais: p.pais,
                nacionalidade: p.nacionalidade,
                tipo_documento: p.tipo_documento
            }
        });
    } catch (error) {
        console.error('Erro criar paciente:', error);
        res.status(500).json({ success: false, erro: 'Erro ao cadastrar paciente' });
    }
});

// Atualizar paciente
app.put('/api/pacientes/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            nome, cpf, rg, dataNascimento, sexo, telefone, celular, email,
            endereco, numero, complemento, bairro, cidade, estado, cep,
            convenio, numeroConvenio, observacoes,
            menorIdade, responsavelNome, responsavelCpf, responsavelRg,
            responsavelTelefone, responsavelEmail, responsavelParentesco, responsavelEndereco
        } = req.body;

        const result = await pool.query(
            `UPDATE pacientes SET
                nome = COALESCE($1, nome), cpf = $2, rg = $3, data_nascimento = $4, sexo = $5,
                telefone = $6, celular = $7, email = $8, endereco = $9, numero = $10,
                complemento = $11, bairro = $12, cidade = $13, estado = $14, cep = $15,
                convenio = $16, numero_convenio = $17, observacoes = $18,
                menor_idade = $19, responsavel_nome = $20, responsavel_cpf = $21, responsavel_rg = $22,
                responsavel_telefone = $23, responsavel_email = $24, responsavel_parentesco = $25, responsavel_endereco = $26,
                atualizado_em = CURRENT_TIMESTAMP
            WHERE id = $27 AND dentista_id = $28 RETURNING *`,
            [
                nome, cpf || null, rg || null, dataNascimento || null, sexo || null,
                telefone || null, celular || null, email || null, endereco || null, numero || null,
                complemento || null, bairro || null, cidade || null, estado || null, cep || null,
                convenio || null, numeroConvenio || null, observacoes || null,
                menorIdade || false, responsavelNome || null, responsavelCpf || null, responsavelRg || null,
                responsavelTelefone || null, responsavelEmail || null, responsavelParentesco || null, responsavelEndereco || null,
                parseInt(id), parseInt(req.user.id)
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

// Deletar paciente (soft delete)
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
// ROTAS PÚBLICAS DE CONFIRMAÇÃO (SEM AUTENTICAÇÃO)
// ==============================================================================

// Buscar agendamento pelo código (para mostrar detalhes ao paciente)
app.get('/api/agendamentos/buscar-codigo/:codigo', async (req, res) => {
    try {
        const { codigo } = req.params;
        
        if (!codigo || codigo.length < 6) {
            return res.status(400).json({ success: false, erro: 'Codigo invalido' });
        }
        
        const result = await pool.query(
            `SELECT a.*, d.name as dentista_nome, d.clinic as clinica_nome, d.telefone as clinica_telefone
             FROM agendamentos a 
             JOIN dentistas d ON a.dentista_id = d.id
             WHERE a.codigo_confirmacao = $1`,
            [codigo.toUpperCase()]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Agendamento nao encontrado' });
        }
        
        const a = result.rows[0];
        res.json({
            success: true,
            agendamento: {
                pacienteNome: a.paciente_nome,
                data: a.data,
                horario: a.horario,
                procedimento: a.procedimento,
                status: a.status,
                dentistaNome: a.dentista_nome,
                clinicaNome: a.clinica_nome,
                clinicaTelefone: a.clinica_telefone
            }
        });
    } catch (error) {
        console.error('Erro buscar agendamento por codigo:', error);
        res.status(500).json({ success: false, erro: 'Erro ao buscar agendamento' });
    }
});

// Confirmar ou cancelar agendamento via código (paciente clica no link)
app.post('/api/agendamentos/confirmar', async (req, res) => {
    try {
        const { codigo, acao } = req.body;
        
        if (!codigo || codigo.length < 6) {
            return res.status(400).json({ success: false, erro: 'Codigo invalido' });
        }
        
        if (!acao || !['confirmar', 'cancelar'].includes(acao)) {
            return res.status(400).json({ success: false, erro: 'Acao invalida' });
        }
        
        // Buscar agendamento
        const busca = await pool.query(
            `SELECT a.*, d.name as dentista_nome, d.clinic as clinica_nome, d.telefone as clinica_telefone
             FROM agendamentos a 
             JOIN dentistas d ON a.dentista_id = d.id
             WHERE a.codigo_confirmacao = $1`,
            [codigo.toUpperCase()]
        );
        
        if (busca.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Agendamento nao encontrado' });
        }
        
        const agendamento = busca.rows[0];
        
        // Verificar se já foi confirmado/cancelado
        if (agendamento.status === 'confirmado' && acao === 'confirmar') {
            return res.json({ 
                success: true, 
                message: 'Consulta ja estava confirmada',
                agendamento: {
                    pacienteNome: agendamento.paciente_nome,
                    data: agendamento.data,
                    horario: agendamento.horario,
                    procedimento: agendamento.procedimento,
                    status: 'confirmado',
                    dentistaNome: agendamento.dentista_nome,
                    clinicaNome: agendamento.clinica_nome,
                    clinicaTelefone: agendamento.clinica_telefone
                }
            });
        }
        
        // Atualizar status
        const novoStatus = acao === 'confirmar' ? 'confirmado' : 'cancelado';
        await pool.query(
            'UPDATE agendamentos SET status = $1, atualizado_em = NOW() WHERE id = $2',
            [novoStatus, agendamento.id]
        );
        
        console.log(`Agendamento ${agendamento.id} ${novoStatus} via link pelo paciente`);
        
        res.json({
            success: true,
            message: acao === 'confirmar' ? 'Consulta confirmada!' : 'Consulta cancelada',
            agendamento: {
                pacienteNome: agendamento.paciente_nome,
                data: agendamento.data,
                horario: agendamento.horario,
                procedimento: agendamento.procedimento,
                status: novoStatus,
                dentistaNome: agendamento.dentista_nome,
                clinicaNome: agendamento.clinica_nome,
                clinicaTelefone: agendamento.clinica_telefone
            }
        });
    } catch (error) {
        console.error('Erro confirmar agendamento:', error);
        res.status(500).json({ success: false, erro: 'Erro ao processar confirmacao' });
    }
});

// ==============================================================================
// ROTAS DE AGENDAMENTOS
// ==============================================================================

app.get('/api/agendamentos', authMiddleware, async (req, res) => {
    try {
        const { data, inicio, fim } = req.query;
        let query = 'SELECT * FROM agendamentos WHERE dentista_id = $1';
        const params = [parseInt(req.user.id)];

        if (data) {
            query += ' AND data = $2';
            params.push(data);
        } else if (inicio && fim) {
            query += ' AND data >= $2 AND data <= $3';
            params.push(inicio, fim);
        }

        query += ' ORDER BY data ASC, horario ASC';
        const result = await pool.query(query, params);

        const agendamentos = result.rows.map(a => ({
            id: a.id.toString(),
            pacienteId: a.paciente_id ? a.paciente_id.toString() : null,
            pacienteNome: a.paciente_nome,
            data: a.data,
            horario: a.horario,
            duracao: a.duracao,
            procedimento: a.procedimento,
            valor: a.valor,
            status: a.status,
            encaixe: a.encaixe || false,
            observacoes: a.observacoes,
            codigoConfirmacao: a.codigo_confirmacao,
            rotulo: a.rotulo,
            criadoEm: a.criado_em
        }));

        res.json({ success: true, agendamentos, total: agendamentos.length });
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro ao listar agendamentos' });
    }
});

app.post('/api/agendamentos', authMiddleware, async (req, res) => {
    try {
        const { pacienteId, pacienteNome, data, horario, duracao, procedimento, valor, status, encaixe, observacoes, rotulo } = req.body;

        if (!data || !horario) {
            return res.status(400).json({ success: false, erro: 'Data e horário obrigatórios' });
        }

        let nomePaciente = pacienteNome;
        if (pacienteId && !nomePaciente) {
            const pacResult = await pool.query('SELECT nome FROM pacientes WHERE id = $1', [parseInt(pacienteId)]);
            if (pacResult.rows.length > 0) nomePaciente = pacResult.rows[0].nome;
        }

        // Gerar código único de confirmação
        const codigoConfirmacao = await gerarCodigoUnico();

        const result = await pool.query(
            `INSERT INTO agendamentos (dentista_id, paciente_id, paciente_nome, data, horario, duracao, procedimento, valor, status, encaixe, observacoes, codigo_confirmacao, rotulo)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
            [parseInt(req.user.id), pacienteId ? parseInt(pacienteId) : null, nomePaciente, data, horario, duracao || 60, procedimento, valor, status || 'agendado', encaixe || false, observacoes, codigoConfirmacao, rotulo || null]
        );

        const a = result.rows[0];
        res.status(201).json({
            success: true,
            message: 'Agendamento criado!',
            agendamento: { 
                id: a.id.toString(), 
                pacienteNome: a.paciente_nome, 
                data: a.data, 
                horario: a.horario, 
                procedimento: a.procedimento, 
                status: a.status, 
                encaixe: a.encaixe,
                codigoConfirmacao: a.codigo_confirmacao,
                rotulo: a.rotulo
            }
        });
    } catch (error) {
        console.error('Erro criar agendamento:', error);
        res.status(500).json({ success: false, erro: 'Erro ao criar agendamento' });
    }
});

app.put('/api/agendamentos/:id', authMiddleware, async (req, res) => {
    try {
        const { pacienteId, pacienteNome, data, horario, duracao, procedimento, valor, status, encaixe, observacoes } = req.body;

        let nomePaciente = pacienteNome;
        if (pacienteId && !nomePaciente) {
            const pacResult = await pool.query('SELECT nome FROM pacientes WHERE id = $1', [parseInt(pacienteId)]);
            if (pacResult.rows.length > 0) nomePaciente = pacResult.rows[0].nome;
        }

        const result = await pool.query(
            `UPDATE agendamentos SET paciente_id = $1, paciente_nome = $2, data = COALESCE($3, data), horario = COALESCE($4, horario),
             duracao = COALESCE($5, duracao), procedimento = $6, valor = $7, status = COALESCE($8, status), encaixe = COALESCE($9, encaixe),
             observacoes = $10, atualizado_em = CURRENT_TIMESTAMP WHERE id = $11 AND dentista_id = $12 RETURNING *`,
            [pacienteId ? parseInt(pacienteId) : null, nomePaciente, data, horario, duracao, procedimento, valor, status, encaixe, observacoes, parseInt(req.params.id), parseInt(req.user.id)]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Agendamento não encontrado' });
        }

        res.json({ success: true, message: 'Agendamento atualizado!' });
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro ao atualizar agendamento' });
    }
});

app.delete('/api/agendamentos/:id', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'DELETE FROM agendamentos WHERE id = $1 AND dentista_id = $2 RETURNING id',
            [parseInt(req.params.id), parseInt(req.user.id)]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Agendamento não encontrado' });
        }

        res.json({ success: true, message: 'Agendamento removido!' });
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro ao remover agendamento' });
    }
});

// ==============================================================================
// ROTAS DE PRONTUÁRIO
// ==============================================================================

app.get('/api/prontuarios/:pacienteId', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM prontuarios WHERE paciente_id = $1 AND dentista_id = $2 ORDER BY data DESC`,
            [parseInt(req.params.pacienteId), parseInt(req.user.id)]
        );

        const prontuarios = result.rows.map(p => ({
            id: p.id.toString(), pacienteId: p.paciente_id.toString(), data: p.data,
            descricao: p.descricao, procedimento: p.procedimento, dente: p.dente, valor: p.valor, criadoEm: p.criado_em
        }));

        res.json({ success: true, prontuarios, total: prontuarios.length });
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro ao listar prontuários' });
    }
});

app.post('/api/prontuarios', authMiddleware, async (req, res) => {
    try {
        const { pacienteId, data, descricao, procedimento, dente, valor } = req.body;

        if (!pacienteId || !descricao) {
            return res.status(400).json({ success: false, erro: 'Paciente e descrição obrigatórios' });
        }

        const result = await pool.query(
            `INSERT INTO prontuarios (dentista_id, paciente_id, data, descricao, procedimento, dente, valor)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
            [parseInt(req.user.id), parseInt(pacienteId), data || new Date().toISOString().split('T')[0], descricao, procedimento, dente, valor]
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
        const { inicio, fim, tipo } = req.query;
        let query = 'SELECT f.*, p.nome as paciente_nome FROM financeiro f LEFT JOIN pacientes p ON f.paciente_id = p.id WHERE f.dentista_id = $1';
        const params = [parseInt(req.user.id)];

        if (inicio && fim) {
            query += ' AND f.data >= $2 AND f.data <= $3';
            params.push(inicio, fim);
        }
        if (tipo) {
            query += ` AND f.tipo = $${params.length + 1}`;
            params.push(tipo);
        }

        query += ' ORDER BY f.data DESC';
        const result = await pool.query(query, params);

        const movimentacoes = result.rows.map(f => ({
            id: f.id.toString(), tipo: f.tipo, descricao: f.descricao, valor: parseFloat(f.valor),
            data: f.data, status: f.status, formaPagamento: f.forma_pagamento, parcelas: f.parcelas,
            pacienteId: f.paciente_id ? f.paciente_id.toString() : null, pacienteNome: f.paciente_nome,
            observacoes: f.observacoes, criadoEm: f.criado_em
        }));

        let totalReceitas = 0, totalDespesas = 0;
        movimentacoes.forEach(m => {
            if (m.tipo === 'receita') totalReceitas += m.valor;
            else if (m.tipo === 'despesa') totalDespesas += m.valor;
        });

        res.json({
            success: true, movimentacoes, total: movimentacoes.length,
            resumo: { receitas: totalReceitas, despesas: totalDespesas, saldo: totalReceitas - totalDespesas }
        });
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro ao listar financeiro' });
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

app.put('/api/financeiro/:id', authMiddleware, async (req, res) => {
    try {
        const { status } = req.body;
        const result = await pool.query(
            'UPDATE financeiro SET status = $1 WHERE id = $2 AND dentista_id = $3 RETURNING *',
            [status, parseInt(req.params.id), parseInt(req.user.id)]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Movimentação não encontrada' });
        }

        res.json({ success: true, message: 'Movimentação atualizada!' });
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro ao atualizar' });
    }
});

app.delete('/api/financeiro/:id', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'DELETE FROM financeiro WHERE id = $1 AND dentista_id = $2 RETURNING id',
            [parseInt(req.params.id), parseInt(req.user.id)]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Movimentação não encontrada' });
        }

        res.json({ success: true, message: 'Movimentação removida!' });
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro ao remover' });
    }
});

// ==============================================================================
// ROTAS DE NOTAS FISCAIS
// ==============================================================================

app.get('/api/notas', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT n.*, p.nome as paciente_nome FROM notas_fiscais n 
             LEFT JOIN pacientes p ON n.paciente_id = p.id 
             WHERE n.dentista_id = $1 ORDER BY n.data_emissao DESC`,
            [parseInt(req.user.id)]
        );

        const notas = result.rows.map(n => ({
            id: n.id.toString(), numero: n.numero, valor: parseFloat(n.valor),
            dataEmissao: n.data_emissao, descricaoServico: n.descricao_servico, status: n.status,
            pacienteId: n.paciente_id ? n.paciente_id.toString() : null, pacienteNome: n.paciente_nome,
            criadoEm: n.criado_em
        }));

        res.json({ success: true, notas, total: notas.length });
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro ao listar notas' });
    }
});

app.post('/api/notas', authMiddleware, async (req, res) => {
    try {
        const { pacienteId, valor, descricaoServico } = req.body;

        if (!valor) {
            return res.status(400).json({ success: false, erro: 'Valor é obrigatório' });
        }

        // Gerar número da nota (simplificado)
        const countResult = await pool.query('SELECT COUNT(*) FROM notas_fiscais WHERE dentista_id = $1', [parseInt(req.user.id)]);
        const numero = 'NF' + String(parseInt(countResult.rows[0].count) + 1).padStart(6, '0');

        const result = await pool.query(
            `INSERT INTO notas_fiscais (dentista_id, paciente_id, numero, valor, data_emissao, descricao_servico)
             VALUES ($1,$2,$3,$4,CURRENT_DATE,$5) RETURNING *`,
            [parseInt(req.user.id), pacienteId ? parseInt(pacienteId) : null, numero, parseFloat(valor), descricaoServico]
        );

        res.status(201).json({
            success: true,
            message: 'Nota fiscal emitida!',
            nota: { id: result.rows[0].id.toString(), numero: result.rows[0].numero }
        });
    } catch (error) {
        console.error('Erro criar nota:', error);
        res.status(500).json({ success: false, erro: 'Erro ao emitir nota' });
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
            pool.query(`SELECT a.*, p.nome as paciente_nome FROM agendamentos a LEFT JOIN pacientes p ON a.paciente_id = p.id WHERE a.dentista_id = $1 AND a.data >= $2 ORDER BY a.data ASC, a.horario ASC LIMIT 5`, [parseInt(req.user.id), hoje])
        ]);

        res.json({
            success: true,
            dashboard: {
                totalPacientes: parseInt(pacientes.rows[0].count),
                agendamentosHoje: parseInt(hojeAgend.rows[0].count),
                agendamentosMes: parseInt(mesAgend.rows[0].count),
                receitasMes: parseFloat(receitas.rows[0].total),
                proximosAgendamentos: proximos.rows.map(a => ({
                    id: a.id.toString(), pacienteNome: a.paciente_nome || a.paciente_nome, data: a.data, horario: a.horario, procedimento: a.procedimento
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
        console.log('==============================================');
        console.log('   Servidor: http://localhost:' + PORT);
        console.log('   Banco: PostgreSQL');
        console.log('   Status: Online');
        console.log('==============================================');
        console.log('');
    });
});

module.exports = app;
