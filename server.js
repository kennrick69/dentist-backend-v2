// ==============================================================================
// BACKEND DENTAL ULTRA - VERSÃO 7.0 - PRONTUÁRIO COMPLETO
// Sistema completo de gestão odontológica com PostgreSQL
// Inclui: anamnese, plano tratamento, receitas, atestados, odontograma geral,
// orçamentos com split autorizado/pendente, tabela de preços, retornos
// ==============================================================================

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const axios = require('axios');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dental-ultra-secret-key-change-in-production-2024';

// ==============================================================================
// MIDDLEWARES
// ==============================================================================

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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
                cadastro_completo BOOLEAN DEFAULT false,
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
                icone VARCHAR(10) DEFAULT '[dente]',
                foto TEXT,
                cor VARCHAR(20) DEFAULT '#2d7a5f',
                intervalo_minutos INTEGER DEFAULT 30,
                hora_entrada TIME DEFAULT '08:00',
                hora_saida TIME DEFAULT '18:00',
                almoco_inicio TIME DEFAULT '12:00',
                almoco_fim TIME DEFAULT '13:00',
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
            'ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS rg VARCHAR(20)',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS data_nascimento DATE',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS sexo VARCHAR(20)',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS celular VARCHAR(20)',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS endereco VARCHAR(255)',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS numero VARCHAR(20)',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS complemento VARCHAR(100)',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS bairro VARCHAR(100)',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS cidade VARCHAR(100)',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS estado VARCHAR(2)',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS cep VARCHAR(10)',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS observacoes TEXT',
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
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(20) DEFAULT \'cpf\'',
            // Campos para Tel. de Recados
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS tel_recados VARCHAR(20)',
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS nome_recado VARCHAR(100)',
            // Campo para controle de cadastro completo (importação/cadastro parcial)
            'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS cadastro_completo BOOLEAN DEFAULT false',
            // Campos de configuração do profissional
            'ALTER TABLE profissionais ADD COLUMN IF NOT EXISTS intervalo_minutos INTEGER DEFAULT 30',
            'ALTER TABLE profissionais ADD COLUMN IF NOT EXISTS hora_entrada TIME DEFAULT \'08:00\'',
            'ALTER TABLE profissionais ADD COLUMN IF NOT EXISTS hora_saida TIME DEFAULT \'18:00\'',
            'ALTER TABLE profissionais ADD COLUMN IF NOT EXISTS almoco_inicio TIME DEFAULT \'12:00\'',
            'ALTER TABLE profissionais ADD COLUMN IF NOT EXISTS almoco_fim TIME DEFAULT \'13:00\'',
            // Campo para vincular caso ao profissional que cadastrou
            'ALTER TABLE casos_proteticos ADD COLUMN IF NOT EXISTS profissional_id INTEGER REFERENCES profissionais(id) ON DELETE SET NULL',
            'ALTER TABLE casos_proteticos ADD COLUMN IF NOT EXISTS tipo_peca VARCHAR(20) DEFAULT \'definitiva\'',
            'ALTER TABLE casos_proteticos ADD COLUMN IF NOT EXISTS url_arquivos TEXT'
        ];

        for (const query of alterQueries) {
            try { await pool.query(query); } catch (e) {}
        }

        // Tabela de configurações da clínica
        await pool.query(`
            CREATE TABLE IF NOT EXISTS config_clinica (
                id SERIAL PRIMARY KEY,
                dentista_id INTEGER REFERENCES dentistas(id) ON DELETE CASCADE UNIQUE,
                nome_clinica VARCHAR(255),
                nome_dentista VARCHAR(255),
                telefone VARCHAR(20),
                whatsapp VARCHAR(20),
                endereco TEXT,
                assinatura TEXT,
                hora_abre TIME DEFAULT '08:00',
                hora_fecha TIME DEFAULT '18:00',
                intervalo_padrao INTEGER DEFAULT 30,
                dias_atendimento VARCHAR(100) DEFAULT 'Segunda a Sexta',
                periodo_confirmacao INTEGER DEFAULT 48,
                msg_aniversario TEXT,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // ========== TABELAS DE CASOS PROTÉTICOS ==========
        
        // Laboratórios parceiros
        await pool.query(`
            CREATE TABLE IF NOT EXISTS laboratorios (
                id SERIAL PRIMARY KEY,
                dentista_id INTEGER NOT NULL REFERENCES dentistas(id) ON DELETE CASCADE,
                nome VARCHAR(255) NOT NULL,
                cnpj VARCHAR(20),
                telefone VARCHAR(20),
                whatsapp VARCHAR(20),
                email VARCHAR(255),
                endereco TEXT,
                cidade VARCHAR(100),
                estado VARCHAR(2),
                cep VARCHAR(10),
                responsavel_tecnico VARCHAR(255),
                cro_responsavel VARCHAR(20),
                especialidades TEXT[],
                observacoes TEXT,
                ativo BOOLEAN DEFAULT true,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Casos protéticos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS casos_proteticos (
                id SERIAL PRIMARY KEY,
                dentista_id INTEGER NOT NULL REFERENCES dentistas(id) ON DELETE CASCADE,
                profissional_id INTEGER REFERENCES profissionais(id) ON DELETE SET NULL,
                paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
                laboratorio_id INTEGER REFERENCES laboratorios(id) ON DELETE SET NULL,
                codigo VARCHAR(20) UNIQUE NOT NULL,
                tipo_trabalho VARCHAR(50) NOT NULL,
                tipo_trabalho_detalhe TEXT,
                tipo_peca VARCHAR(20) DEFAULT 'definitiva',
                dentes TEXT[],
                material VARCHAR(50),
                material_detalhe TEXT,
                tecnica VARCHAR(20) DEFAULT 'convencional',
                cor_shade VARCHAR(20),
                escala_cor VARCHAR(50),
                urgencia VARCHAR(20) DEFAULT 'normal',
                data_envio DATE,
                data_prometida DATE,
                data_retorno_real DATE,
                status VARCHAR(30) DEFAULT 'criado',
                observacoes_clinicas TEXT,
                observacoes_tecnicas TEXT,
                url_arquivos TEXT,
                valor_combinado DECIMAL(10,2),
                valor_pago DECIMAL(10,2),
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Histórico de status dos casos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS casos_status_historico (
                id SERIAL PRIMARY KEY,
                caso_id INTEGER NOT NULL REFERENCES casos_proteticos(id) ON DELETE CASCADE,
                status_anterior VARCHAR(30),
                status_novo VARCHAR(30) NOT NULL,
                alterado_por VARCHAR(100),
                tipo_usuario VARCHAR(20),
                observacao TEXT,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Mensagens dos casos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS casos_mensagens (
                id SERIAL PRIMARY KEY,
                caso_id INTEGER NOT NULL REFERENCES casos_proteticos(id) ON DELETE CASCADE,
                remetente_tipo VARCHAR(20) NOT NULL,
                remetente_nome VARCHAR(255),
                mensagem TEXT NOT NULL,
                lida BOOLEAN DEFAULT false,
                lida_em TIMESTAMP,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Arquivos dos casos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS casos_arquivos (
                id SERIAL PRIMARY KEY,
                caso_id INTEGER NOT NULL REFERENCES casos_proteticos(id) ON DELETE CASCADE,
                tipo_arquivo VARCHAR(20) NOT NULL,
                nome_arquivo VARCHAR(255) NOT NULL,
                nome_original VARCHAR(255),
                tamanho_bytes BIGINT,
                mime_type VARCHAR(100),
                url_arquivo TEXT NOT NULL,
                versao INTEGER DEFAULT 1,
                descricao TEXT,
                enviado_por VARCHAR(20),
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Índices para performance
        const indicesCasos = [
            'CREATE INDEX IF NOT EXISTS idx_laboratorios_dentista ON laboratorios(dentista_id)',
            'CREATE INDEX IF NOT EXISTS idx_casos_dentista ON casos_proteticos(dentista_id)',
            'CREATE INDEX IF NOT EXISTS idx_casos_paciente ON casos_proteticos(paciente_id)',
            'CREATE INDEX IF NOT EXISTS idx_casos_status ON casos_proteticos(status)',
            'CREATE INDEX IF NOT EXISTS idx_casos_data_prometida ON casos_proteticos(data_prometida)'
        ];
        for (const idx of indicesCasos) {
            try { await pool.query(idx); } catch (e) {}
        }

        // ============ MÓDULO FINANÇAS - TABELA DE PREÇOS DOS LABORATÓRIOS ============
        await pool.query(`
            CREATE TABLE IF NOT EXISTS laboratorios_precos (
                id SERIAL PRIMARY KEY,
                laboratorio_id INTEGER NOT NULL REFERENCES laboratorios(id) ON DELETE CASCADE,
                material VARCHAR(100) NOT NULL,
                procedimento VARCHAR(200) NOT NULL,
                valor DECIMAL(10,2) NOT NULL,
                observacao TEXT,
                ativo BOOLEAN DEFAULT true,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Índices para preços
        try {
            await pool.query('CREATE INDEX IF NOT EXISTS idx_lab_precos_lab ON laboratorios_precos(laboratorio_id)');
            await pool.query('CREATE INDEX IF NOT EXISTS idx_lab_precos_material ON laboratorios_precos(material)');
        } catch (e) {}

        // ============ MIGRAÇÕES - CAMPOS DE CUSTO NOS CASOS ============
        const migracoesFinancas = [
            "ALTER TABLE casos_proteticos ADD COLUMN IF NOT EXISTS valor_custo DECIMAL(10,2)",
            "ALTER TABLE casos_proteticos ADD COLUMN IF NOT EXISTS data_finalizado TIMESTAMP",
            "ALTER TABLE casos_proteticos ADD COLUMN IF NOT EXISTS material_preco_id INTEGER REFERENCES laboratorios_precos(id) ON DELETE SET NULL",
            "ALTER TABLE casos_proteticos ADD COLUMN IF NOT EXISTS grupo_id VARCHAR(36)"
        ];
        for (const mig of migracoesFinancas) {
            try { await pool.query(mig); } catch (e) {}
        }

        // ============ MIGRAÇÕES - CONFIRMAÇÃO DE EMAIL ============
        const migracoesEmail = [
            "ALTER TABLE dentistas ADD COLUMN IF NOT EXISTS email_confirmado BOOLEAN DEFAULT false",
            "ALTER TABLE dentistas ADD COLUMN IF NOT EXISTS token_confirmacao VARCHAR(64)",
            "ALTER TABLE dentistas ADD COLUMN IF NOT EXISTS token_expira TIMESTAMP"
        ];
        for (const mig of migracoesEmail) {
            try { await pool.query(mig); } catch (e) {}
        }

        // ============ MÓDULO NFS-e - CONFIGURAÇÕES DE PREFEITURAS ============
        await pool.query(`
            CREATE TABLE IF NOT EXISTS config_prefeituras (
                id SERIAL PRIMARY KEY,
                dentista_id INTEGER REFERENCES dentistas(id) ON DELETE CASCADE,
                -- Identificação
                cidade VARCHAR(100) NOT NULL,
                uf CHAR(2) NOT NULL,
                codigo_tom VARCHAR(20),
                sistema VARCHAR(50) DEFAULT 'ipm',
                -- Conexão
                url_webservice TEXT NOT NULL,
                cpf_cnpj_prestador VARCHAR(20),
                senha_webservice VARCHAR(255),
                serie_nfse VARCHAR(10) DEFAULT '1',
                ambiente VARCHAR(20) DEFAULT 'producao',
                exige_certificado BOOLEAN DEFAULT false,
                -- Tributação ISS
                aliquota_iss DECIMAL(5,2) DEFAULT 3.00,
                codigo_servico VARCHAR(20),
                item_lista_servico VARCHAR(20) DEFAULT '4.12',
                codigo_trib_nacional VARCHAR(10) DEFAULT '041201',
                codigo_nbs VARCHAR(30),
                situacao_tributaria VARCHAR(10) DEFAULT '1',
                -- Reforma Tributária 2026 (IBS/CBS)
                cst_ibs_cbs VARCHAR(10),
                class_trib VARCHAR(20),
                fin_nfse VARCHAR(10),
                ind_final VARCHAR(10),
                c_ind_op VARCHAR(20),
                aliquota_ibs_uf DECIMAL(5,2),
                aliquota_ibs_mun DECIMAL(5,2),
                aliquota_cbs DECIMAL(5,2),
                reducao_aliquota DECIMAL(5,2),
                redutor_gov DECIMAL(5,2),
                -- PIS/COFINS
                tipo_retencao VARCHAR(10),
                aliquota_pis DECIMAL(5,2),
                aliquota_cofins DECIMAL(5,2),
                -- Metadata
                ativo BOOLEAN DEFAULT true,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Índice para buscar prefeituras por dentista
        try {
            await pool.query('CREATE INDEX IF NOT EXISTS idx_config_pref_dentista ON config_prefeituras(dentista_id)');
        } catch (e) {}
        
        // Adicionar nova coluna codigo_trib_nacional se não existir (para bancos existentes)
        try {
            await pool.query(`
                ALTER TABLE config_prefeituras 
                ADD COLUMN IF NOT EXISTS codigo_trib_nacional VARCHAR(10) DEFAULT '041201'
            `);
            console.log('Coluna codigo_trib_nacional verificada/adicionada');
        } catch (e) {
            // Coluna já existe ou erro - ignorar
        }
        
        // Corrigir valor padrão de item_lista_servico (era 4.11, agora é 4.12)
        try {
            await pool.query(`
                ALTER TABLE config_prefeituras 
                ALTER COLUMN item_lista_servico SET DEFAULT '4.12'
            `);
        } catch (e) {}

        // Tabela de usuários vinculados (secretárias, auxiliares, etc)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios_vinculados (
                id SERIAL PRIMARY KEY,
                dentista_id INTEGER REFERENCES dentistas(id) ON DELETE CASCADE,
                nome VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                senha VARCHAR(255) NOT NULL,
                cargo VARCHAR(100),
                ativo BOOLEAN DEFAULT true,
                -- Permissões (JSON com lista de módulos permitidos)
                permissoes JSONB DEFAULT '["agenda", "pacientes_visualizar"]',
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(dentista_id, email)
            )
        `);
        
        // Índice para buscar usuários por dentista
        try {
            await pool.query('CREATE INDEX IF NOT EXISTS idx_usuarios_vinc_dentista ON usuarios_vinculados(dentista_id)');
        } catch (e) {}

        // ====== TABELAS DO PRONTUÁRIO ======

        await pool.query(`
            CREATE TABLE IF NOT EXISTS anamnese (
                id SERIAL PRIMARY KEY,
                paciente_id INTEGER REFERENCES pacientes(id) ON DELETE CASCADE,
                dentista_id INTEGER REFERENCES dentistas(id),
                dados JSONB DEFAULT '{}',
                odontofobia BOOLEAN DEFAULT FALSE,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(paciente_id)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS odontograma_geral (
                id SERIAL PRIMARY KEY,
                paciente_id INTEGER REFERENCES pacientes(id) ON DELETE CASCADE,
                dados JSONB DEFAULT '{}',
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(paciente_id)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS plano_tratamento (
                id SERIAL PRIMARY KEY,
                paciente_id INTEGER REFERENCES pacientes(id) ON DELETE CASCADE,
                dentista_id INTEGER REFERENCES dentistas(id),
                status VARCHAR(50) DEFAULT 'ativo',
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS plano_tratamento_itens (
                id SERIAL PRIMARY KEY,
                plano_id INTEGER REFERENCES plano_tratamento(id) ON DELETE CASCADE,
                dente VARCHAR(10),
                face VARCHAR(20),
                procedimento VARCHAR(255) NOT NULL,
                posicao INTEGER,
                realizado BOOLEAN DEFAULT FALSE,
                realizado_em TIMESTAMP,
                origem VARCHAR(50) DEFAULT 'manual',
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS receitas (
                id SERIAL PRIMARY KEY,
                paciente_id INTEGER REFERENCES pacientes(id) ON DELETE CASCADE,
                dentista_id INTEGER REFERENCES dentistas(id),
                medicamento VARCHAR(255) NOT NULL,
                posologia TEXT,
                observacoes TEXT,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS atestados (
                id SERIAL PRIMARY KEY,
                paciente_id INTEGER REFERENCES pacientes(id) ON DELETE CASCADE,
                dentista_id INTEGER REFERENCES dentistas(id),
                tipo VARCHAR(50) DEFAULT 'atestado',
                dias INTEGER DEFAULT 1,
                cid VARCHAR(20),
                motivo TEXT,
                observacoes TEXT,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS tabela_precos (
                id SERIAL PRIMARY KEY,
                dentista_id INTEGER REFERENCES dentistas(id) ON DELETE CASCADE,
                procedimento VARCHAR(255) NOT NULL,
                valor DECIMAL(10,2) DEFAULT 0,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(dentista_id, procedimento)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS orcamentos (
                id SERIAL PRIMARY KEY,
                paciente_id INTEGER REFERENCES pacientes(id) ON DELETE CASCADE,
                dentista_id INTEGER REFERENCES dentistas(id),
                itens JSONB DEFAULT '[]',
                total DECIMAL(10,2) DEFAULT 0,
                status VARCHAR(50) DEFAULT 'aberto',
                validade_dias INTEGER DEFAULT 30,
                forma_pagamento VARCHAR(255),
                observacoes TEXT,
                assinatura_url TEXT,
                assinatura_ip VARCHAR(50),
                assinatura_em TIMESTAMP,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS orcamentos_pendentes (
                id SERIAL PRIMARY KEY,
                paciente_id INTEGER REFERENCES pacientes(id) ON DELETE CASCADE,
                dentista_id INTEGER REFERENCES dentistas(id),
                itens JSONB NOT NULL DEFAULT '[]',
                proximo_lembrete DATE NOT NULL,
                descartado BOOLEAN DEFAULT FALSE,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS retornos (
                id SERIAL PRIMARY KEY,
                paciente_id INTEGER REFERENCES pacientes(id) ON DELETE CASCADE,
                dentista_id INTEGER REFERENCES dentistas(id),
                data_retorno DATE NOT NULL,
                motivo TEXT,
                status VARCHAR(50) DEFAULT 'pendente',
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('Banco de dados inicializado!');
    } catch (error) {
        console.error('Erro ao inicializar banco:', error.message);
    }
}

// ==============================================================================
// FUNÇÃO PARA VALIDAR ID NUMÉRICO
// ==============================================================================

function validarId(valor) {
    const id = parseInt(valor);
    return !isNaN(id) && id > 0 ? id : null;
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
        console.log('Auth: Token não fornecido');
        return res.status(401).json({ success: false, erro: 'Token não fornecido' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            console.log('Auth: Token inválido -', err.message);
            if (err.name === 'TokenExpiredError') {
                return res.status(403).json({ success: false, erro: 'Sessão expirada. Faça login novamente.' });
            }
            return res.status(403).json({ success: false, erro: 'Token inválido' });
        }
        
        // Compatibilidade: se não tem tipo, é dentista (tokens antigos)
        if (!decoded.tipo) {
            decoded.tipo = 'dentista';
            decoded.permissoes = ['*']; // Acesso total
        }
        
        // Para usuários vinculados, o dentistaId vem do token
        if (decoded.tipo === 'usuario') {
            req.dentistaId = decoded.dentista_id;
            req.usuarioId = decoded.id;
            req.tipoUsuario = 'usuario';
            req.permissoes = decoded.permissoes || [];
            req.nomeUsuario = decoded.nome;
        } else {
            // Dentista normal
            req.dentistaId = decoded.id;
            req.usuarioId = null;
            req.tipoUsuario = 'dentista';
            req.permissoes = ['*']; // Acesso total
            req.nomeUsuario = decoded.nome;
        }
        
        req.user = decoded;
        next();
    });
}

// Middleware para verificar permissão específica
function verificarPermissao(permissaoNecessaria) {
    return (req, res, next) => {
        // Dentista tem acesso total
        if (req.tipoUsuario === 'dentista' || req.permissoes.includes('*')) {
            return next();
        }
        
        // Verifica se usuário tem a permissão
        if (req.permissoes.includes(permissaoNecessaria)) {
            return next();
        }
        
        return res.status(403).json({ 
            success: false, 
            erro: 'Você não tem permissão para acessar este recurso' 
        });
    };
}

// ==============================================================================
// ROTAS DE AUTENTICAÇÃO
// ==============================================================================

// Configuração do envio de email via PHP (Hostinger)
const EMAIL_PHP_URL = process.env.EMAIL_PHP_URL || 'https://dentalultra.com.br/api/enviar-email.php';
const EMAIL_CHAVE_SECRETA = process.env.EMAIL_CHAVE_SECRETA || 'DENTAL_ULTRA_EMAIL_2024_SECRETKEY';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://dentalultra.com.br';

// Função para gerar token aleatório
function gerarToken(tamanho = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < tamanho; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}

// Função para enviar email via PHP
async function enviarEmail(para, assunto, mensagemHtml) {
    try {
        const response = await fetch(EMAIL_PHP_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chave: EMAIL_CHAVE_SECRETA,
                para: para,
                assunto: assunto,
                mensagem: mensagemHtml,
                tipo: 'html'
            })
        });
        const data = await response.json();
        return data.success;
    } catch (error) {
        console.error('Erro ao enviar email:', error);
        return false;
    }
}

app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, cro, email, password, clinic, specialty } = req.body;

        if (!name || !cro || !email || !password) {
            return res.status(400).json({ success: false, erro: 'Campos obrigatórios faltando' });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, erro: 'Senha deve ter no mínimo 6 caracteres' });
        }

        // Verificar se email já existe (SELECT * para pegar todas as colunas disponíveis)
        const existing = await pool.query('SELECT * FROM dentistas WHERE email = $1', [email.toLowerCase()]);
        if (existing.rows.length > 0) {
            const existingUser = existing.rows[0];
            // Verificar se email_confirmado existe e é false (se a coluna não existir, considera como null)
            const emailConfirmado = existingUser.email_confirmado;
            
            // Se já existe mas não confirmou (ou coluna não existe ainda), permite reenviar
            if (emailConfirmado === false) {
                const token = gerarToken();
                const expira = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas
                
                await pool.query(
                    'UPDATE dentistas SET token_confirmacao = $1, token_expira = $2 WHERE id = $3',
                    [token, expira, existingUser.id]
                );
                
                // Enviar email
                const linkConfirmacao = `${FRONTEND_URL}/area-dentistas/confirmar-email.html?token=${token}`;
                const emailHtml = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <h1 style="color: #1FA2FF;">[dente] Dental Ultra</h1>
                        </div>
                        <h2 style="color: #333;">Confirme seu email</h2>
                        <p>Olá <strong>${name}</strong>,</p>
                        <p>Você já iniciou um cadastro anteriormente. Clique no botão abaixo para confirmar seu email:</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${linkConfirmacao}" style="background: linear-gradient(135deg, #1FA2FF, #12D8FA); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                                [OK] Confirmar Email
                            </a>
                        </div>
                        <p style="color: #666; font-size: 14px;">Este link expira em 24 horas.</p>
                        <p style="color: #666; font-size: 14px;">Se você não solicitou este cadastro, ignore este email.</p>
                        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                        <p style="color: #999; font-size: 12px; text-align: center;">
                            Dental Ultra - Sistema de Gestão Odontológica<br>
                            suporte@dentalultra.com.br
                        </p>
                    </div>
                `;
                
                await enviarEmail(email.toLowerCase(), '[dente] Confirme seu email - Dental Ultra', emailHtml);
                
                return res.status(200).json({
                    success: true,
                    message: 'Email de confirmação reenviado! Verifique sua caixa de entrada.',
                    aguardandoConfirmacao: true
                });
            }
            return res.status(400).json({ success: false, erro: 'Email já cadastrado' });
        }

        // Gerar token e data de expiração
        const token = gerarToken();
        const expira = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

        const senhaHash = await bcrypt.hash(password, 10);
        
        // Inserir usando nomes das colunas existentes no banco (inglês)
        const result = await pool.query(
            `INSERT INTO dentistas (name, cro, email, password, clinic, specialty, email_confirmado, token_confirmacao, token_expira)
             VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8) RETURNING id, name, cro, email, clinic, specialty`,
            [name, cro, email.toLowerCase(), senhaHash, clinic || '', specialty || '', token, expira]
        );

        // Enviar email de confirmação
        const linkConfirmacao = `${FRONTEND_URL}/area-dentistas/confirmar-email.html?token=${token}`;
        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #1FA2FF;">[dente] Dental Ultra</h1>
                </div>
                <h2 style="color: #333;">Bem-vindo(a) ao Dental Ultra!</h2>
                <p>Olá <strong>${name}</strong>,</p>
                <p>Obrigado por se cadastrar! Para ativar sua conta, clique no botão abaixo:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${linkConfirmacao}" style="background: linear-gradient(135deg, #1FA2FF, #12D8FA); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                        [OK] Confirmar Email
                    </a>
                </div>
                <p style="color: #666; font-size: 14px;">Este link expira em 24 horas.</p>
                <p style="color: #666; font-size: 14px;">Se você não solicitou este cadastro, ignore este email.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="color: #999; font-size: 12px; text-align: center;">
                    Dental Ultra - Sistema de Gestão Odontológica<br>
                    suporte@dentalultra.com.br
                </p>
            </div>
        `;
        
        const emailEnviado = await enviarEmail(email.toLowerCase(), '[dente] Confirme seu email - Dental Ultra', emailHtml);

        res.status(201).json({
            success: true,
            message: emailEnviado 
                ? 'Cadastro realizado! Verifique seu email para confirmar a conta.' 
                : 'Cadastro realizado! Por favor, entre em contato com o suporte para ativar sua conta.',
            aguardandoConfirmacao: true,
            emailEnviado: emailEnviado
        });
    } catch (error) {
        console.error('Erro registro:', error.message, error.stack);
        res.status(500).json({ success: false, erro: 'Erro interno: ' + error.message });
    }
});

// Rota para confirmar email
app.get('/api/auth/confirmar-email', async (req, res) => {
    try {
        const { token } = req.query;
        
        if (!token) {
            return res.status(400).json({ success: false, erro: 'Token não fornecido' });
        }
        
        const result = await pool.query(
            'SELECT id, name, email, token_expira FROM dentistas WHERE token_confirmacao = $1',
            [token]
        );
        
        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, erro: 'Token inválido ou já utilizado' });
        }
        
        const dentista = result.rows[0];
        
        // Verificar se expirou
        if (new Date() > new Date(dentista.token_expira)) {
            return res.status(400).json({ success: false, erro: 'Token expirado. Faça o cadastro novamente.' });
        }
        
        // Confirmar email
        await pool.query(
            'UPDATE dentistas SET email_confirmado = true, token_confirmacao = NULL, token_expira = NULL WHERE id = $1',
            [dentista.id]
        );
        
        res.json({ 
            success: true, 
            message: 'Email confirmado com sucesso! Você já pode fazer login.',
            nome: dentista.name
        });
    } catch (error) {
        console.error('Erro confirmar email:', error);
        res.status(500).json({ success: false, erro: 'Erro interno' });
    }
});

// Rota para reenviar email de confirmação
app.post('/api/auth/reenviar-confirmacao', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ success: false, erro: 'Email obrigatório' });
        }
        
        const result = await pool.query(
            'SELECT id, name, email_confirmado FROM dentistas WHERE email = $1',
            [email.toLowerCase()]
        );
        
        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, erro: 'Email não encontrado' });
        }
        
        if (result.rows[0].email_confirmado) {
            return res.status(400).json({ success: false, erro: 'Email já confirmado. Faça login.' });
        }
        
        const token = gerarToken();
        const expira = new Date(Date.now() + 24 * 60 * 60 * 1000);
        
        await pool.query(
            'UPDATE dentistas SET token_confirmacao = $1, token_expira = $2 WHERE id = $3',
            [token, expira, result.rows[0].id]
        );
        
        const linkConfirmacao = `${FRONTEND_URL}/area-dentistas/confirmar-email.html?token=${token}`;
        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #1FA2FF;">[dente] Dental Ultra</h1>
                </div>
                <h2 style="color: #333;">Confirme seu email</h2>
                <p>Olá <strong>${result.rows[0].name}</strong>,</p>
                <p>Clique no botão abaixo para confirmar seu email:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${linkConfirmacao}" style="background: linear-gradient(135deg, #1FA2FF, #12D8FA); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                        [OK] Confirmar Email
                    </a>
                </div>
                <p style="color: #666; font-size: 14px;">Este link expira em 24 horas.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="color: #999; font-size: 12px; text-align: center;">
                    Dental Ultra - Sistema de Gestão Odontológica<br>
                    suporte@dentalultra.com.br
                </p>
            </div>
        `;
        
        await enviarEmail(email.toLowerCase(), '[dente] Confirme seu email - Dental Ultra', emailHtml);
        
        res.json({ success: true, message: 'Email de confirmação reenviado!' });
    } catch (error) {
        console.error('Erro reenviar confirmação:', error);
        res.status(500).json({ success: false, erro: 'Erro interno' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, erro: 'Email e senha obrigatórios' });
        }

        const emailLower = email.toLowerCase();
        
        // 1. Primeiro tenta como dentista
        const resultDentista = await pool.query('SELECT * FROM dentistas WHERE email = $1', [emailLower]);
        
        if (resultDentista.rows.length > 0) {
            const dentista = resultDentista.rows[0];
            
            // Verificar se email foi confirmado
            if (dentista.email_confirmado === false) {
                return res.status(403).json({ 
                    success: false, 
                    erro: 'Email não confirmado. Verifique sua caixa de entrada.',
                    emailNaoConfirmado: true,
                    email: dentista.email
                });
            }
            
            // Verificar senha
            const senhaHash = dentista.senha || dentista.password;
            if (!senhaHash) {
                return res.status(401).json({ success: false, erro: 'Email ou senha incorretos' });
            }
            const senhaValida = await bcrypt.compare(password, senhaHash);
            if (!senhaValida) {
                return res.status(401).json({ success: false, erro: 'Email ou senha incorretos' });
            }

            // Verificar se conta está desativada
            if (dentista.subscription_active === false || dentista.ativo === false) {
                return res.status(403).json({ success: false, erro: 'Conta desativada' });
            }

            const nome = dentista.nome || dentista.name;

            const token = jwt.sign(
                { 
                    id: dentista.id.toString(), 
                    email: dentista.email, 
                    nome: nome,
                    tipo: 'dentista',
                    permissoes: ['*']
                },
                JWT_SECRET,
                { expiresIn: '30d' }
            );

            return res.json({
                success: true,
                message: 'Login realizado!',
                token,
                tipo: 'dentista',
                dentista: {
                    id: dentista.id.toString(),
                    nome: nome,
                    cro: dentista.cro,
                    email: dentista.email,
                    clinica: dentista.clinica || dentista.clinic,
                    especialidade: dentista.especialidade || dentista.specialty,
                    plano: dentista.subscription_plan || dentista.plano || 'premium'
                }
            });
        }
        
        // 2. Se não encontrou como dentista, tenta como usuário vinculado
        const resultUsuario = await pool.query(`
            SELECT u.*, d.nome as dentista_nome, d.clinica, d.cro
            FROM usuarios_vinculados u
            JOIN dentistas d ON u.dentista_id = d.id
            WHERE u.email = $1 AND u.ativo = true AND d.ativo = true
        `, [emailLower]);
        
        if (resultUsuario.rows.length > 0) {
            const usuario = resultUsuario.rows[0];
            
            // Verificar senha
            const senhaValida = await bcrypt.compare(password, usuario.senha);
            if (!senhaValida) {
                return res.status(401).json({ success: false, erro: 'Email ou senha incorretos' });
            }
            
            // Parse permissões
            let permissoes = [];
            try {
                permissoes = typeof usuario.permissoes === 'string' 
                    ? JSON.parse(usuario.permissoes) 
                    : usuario.permissoes || [];
            } catch (e) {
                permissoes = [];
            }

            const token = jwt.sign(
                { 
                    id: usuario.id.toString(),
                    dentista_id: usuario.dentista_id.toString(),
                    email: usuario.email, 
                    nome: usuario.nome,
                    tipo: 'usuario',
                    cargo: usuario.cargo,
                    permissoes: permissoes
                },
                JWT_SECRET,
                { expiresIn: '30d' }
            );

            return res.json({
                success: true,
                message: 'Login realizado!',
                token,
                tipo: 'usuario',
                usuario: {
                    id: usuario.id.toString(),
                    nome: usuario.nome,
                    email: usuario.email,
                    cargo: usuario.cargo,
                    permissoes: permissoes,
                    dentista_id: usuario.dentista_id.toString(),
                    dentista_nome: usuario.dentista_nome,
                    clinica: usuario.clinica
                }
            });
        }
        
        // Não encontrou em nenhuma tabela
        return res.status(401).json({ success: false, erro: 'Email ou senha incorretos' });

    } catch (error) {
        console.error('Erro login:', error);
        res.status(500).json({ success: false, erro: 'Erro interno' });
    }
});

app.get('/api/auth/verify', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, cro, email, clinic, specialty, subscription_plan, subscription_active FROM dentistas WHERE id = $1',
            [parseInt(req.user.id)]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Usuário não encontrado' });
        }
        const d = result.rows[0];
        res.json({
            success: true,
            dentista: { 
                id: d.id.toString(), 
                nome: d.name, 
                cro: d.cro, 
                email: d.email, 
                clinica: d.clinic, 
                especialidade: d.specialty, 
                plano: d.subscription_plan || 'premium' 
            }
        });
    } catch (error) {
        console.error('Erro verify:', error);
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
            cor: p.cor,
            intervalo_minutos: p.intervalo_minutos || 30,
            hora_entrada: p.hora_entrada ? p.hora_entrada.substring(0, 5) : '08:00',
            hora_saida: p.hora_saida ? p.hora_saida.substring(0, 5) : '18:00',
            almoco_inicio: p.almoco_inicio ? p.almoco_inicio.substring(0, 5) : '12:00',
            almoco_fim: p.almoco_fim ? p.almoco_fim.substring(0, 5) : '13:00'
        }));
        
        res.json(profissionais);
    } catch (error) {
        console.error('Erro ao buscar profissionais:', error);
        res.status(500).json({ erro: 'Erro ao buscar profissionais' });
    }
});

// Buscar dados do dentista logado
app.get('/api/dentistas/me', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM dentistas WHERE id = $1', [req.dentistaId]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, erro: 'Não encontrado' });
        const d = result.rows[0];
        res.json({ success: true, dentista: { id: d.id, nome: d.nome, email: d.email, clinica: d.clinica_nome, cro: d.cro, telefone: d.telefone } });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
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
            foto: p.foto,
            cor: p.cor,
            intervalo_minutos: p.intervalo_minutos || 30,
            hora_entrada: p.hora_entrada ? p.hora_entrada.substring(0, 5) : '08:00',
            hora_saida: p.hora_saida ? p.hora_saida.substring(0, 5) : '18:00',
            almoco_inicio: p.almoco_inicio ? p.almoco_inicio.substring(0, 5) : '12:00',
            almoco_fim: p.almoco_fim ? p.almoco_fim.substring(0, 5) : '13:00'
        });
    } catch (error) {
        console.error('Erro ao buscar profissional:', error);
        res.status(500).json({ erro: 'Erro ao buscar profissional' });
    }
});

// Criar profissional
app.post('/api/dentistas', authMiddleware, async (req, res) => {
    try {
        const { nome, cro, especialidade, icone, foto, intervalo_minutos, hora_entrada, hora_saida, almoco_inicio, almoco_fim } = req.body;
        
        if (!nome) {
            return res.status(400).json({ erro: 'Nome é obrigatório' });
        }
        
        const result = await pool.query(
            `INSERT INTO profissionais (dentista_id, nome, cro, especialidade, icone, foto, intervalo_minutos, hora_entrada, hora_saida, almoco_inicio, almoco_fim) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
             RETURNING *`,
            [
                parseInt(req.user.id), 
                nome, 
                cro || null, 
                especialidade || 'Clínico Geral', 
                icone || '[dente]', 
                foto || null,
                intervalo_minutos || 30,
                hora_entrada || '08:00',
                hora_saida || '18:00',
                almoco_inicio || '12:00',
                almoco_fim || '13:00'
            ]
        );
        
        const p = result.rows[0];
        res.status(201).json({
            id: p.id,
            nome: p.nome,
            cro: p.cro,
            especialidade: p.especialidade,
            icone: p.icone,
            foto: p.foto,
            intervalo_minutos: p.intervalo_minutos || 30,
            hora_entrada: p.hora_entrada ? p.hora_entrada.substring(0, 5) : '08:00',
            hora_saida: p.hora_saida ? p.hora_saida.substring(0, 5) : '18:00',
            almoco_inicio: p.almoco_inicio ? p.almoco_inicio.substring(0, 5) : '12:00',
            almoco_fim: p.almoco_fim ? p.almoco_fim.substring(0, 5) : '13:00'
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
        const { nome, cro, especialidade, icone, foto, intervalo_minutos, hora_entrada, hora_saida, almoco_inicio, almoco_fim } = req.body;
        
        const result = await pool.query(
            `UPDATE profissionais 
             SET nome = COALESCE($1, nome), 
                 cro = COALESCE($2, cro), 
                 especialidade = COALESCE($3, especialidade), 
                 icone = COALESCE($4, icone),
                 foto = COALESCE($5, foto),
                 intervalo_minutos = COALESCE($6, intervalo_minutos),
                 hora_entrada = COALESCE($7, hora_entrada),
                 hora_saida = COALESCE($8, hora_saida),
                 almoco_inicio = COALESCE($9, almoco_inicio),
                 almoco_fim = COALESCE($10, almoco_fim),
                 atualizado_em = NOW()
             WHERE id = $11 AND dentista_id = $12 AND ativo = true
             RETURNING *`,
            [nome, cro, especialidade, icone, foto, intervalo_minutos, hora_entrada, hora_saida, almoco_inicio, almoco_fim, parseInt(id), parseInt(req.user.id)]
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
            foto: p.foto,
            intervalo_minutos: p.intervalo_minutos || 30,
            hora_entrada: p.hora_entrada ? p.hora_entrada.substring(0, 5) : '08:00',
            hora_saida: p.hora_saida ? p.hora_saida.substring(0, 5) : '18:00',
            almoco_inicio: p.almoco_inicio ? p.almoco_inicio.substring(0, 5) : '12:00',
            almoco_fim: p.almoco_fim ? p.almoco_fim.substring(0, 5) : '13:00'
        });
    } catch (error) {
        console.error('Erro ao atualizar profissional:', error);
        res.status(500).json({ erro: 'Erro ao atualizar profissional' });
    }
});

// Atualizar só as configurações de horário do profissional
app.patch('/api/dentistas/:id/config', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { intervalo_minutos, hora_entrada, hora_saida, almoco_inicio, almoco_fim } = req.body;
        
        const result = await pool.query(
            `UPDATE profissionais 
             SET intervalo_minutos = COALESCE($1, intervalo_minutos),
                 hora_entrada = COALESCE($2, hora_entrada),
                 hora_saida = COALESCE($3, hora_saida),
                 almoco_inicio = COALESCE($4, almoco_inicio),
                 almoco_fim = COALESCE($5, almoco_fim),
                 atualizado_em = NOW()
             WHERE id = $6 AND dentista_id = $7 AND ativo = true
             RETURNING *`,
            [intervalo_minutos, hora_entrada, hora_saida, almoco_inicio, almoco_fim, parseInt(id), parseInt(req.user.id)]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ erro: 'Profissional não encontrado' });
        }
        
        const p = result.rows[0];
        res.json({
            success: true,
            message: 'Configurações atualizadas!',
            config: {
                intervalo_minutos: p.intervalo_minutos || 30,
                hora_entrada: p.hora_entrada ? p.hora_entrada.substring(0, 5) : '08:00',
                hora_saida: p.hora_saida ? p.hora_saida.substring(0, 5) : '18:00',
                almoco_inicio: p.almoco_inicio ? p.almoco_inicio.substring(0, 5) : '12:00',
                almoco_fim: p.almoco_fim ? p.almoco_fim.substring(0, 5) : '13:00'
            }
        });
    } catch (error) {
        console.error('Erro ao atualizar configurações:', error);
        res.status(500).json({ erro: 'Erro ao atualizar configurações' });
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
// ROTAS DE CONFIGURAÇÕES DA CLÍNICA
// ==============================================================================

// Buscar configurações da clínica
app.get('/api/config-clinica', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM config_clinica WHERE dentista_id = $1',
            [parseInt(req.user.id)]
        );
        
        if (result.rows.length === 0) {
            // Retorna config vazia se não existir
            return res.json({ 
                success: true, 
                config: {
                    nome_clinica: '',
                    nome_dentista: '',
                    telefone: '',
                    whatsapp: '',
                    endereco: '',
                    assinatura: '',
                    hora_abre: '08:00',
                    hora_fecha: '18:00',
                    intervalo_padrao: 30,
                    dias_atendimento: 'Segunda a Sexta',
                    periodo_confirmacao: 48,
                    msg_aniversario: ''
                }
            });
        }
        
        const c = result.rows[0];
        res.json({
            success: true,
            config: {
                nome_clinica: c.nome_clinica || '',
                nome_dentista: c.nome_dentista || '',
                telefone: c.telefone || '',
                whatsapp: c.whatsapp || '',
                endereco: c.endereco || '',
                assinatura: c.assinatura || '',
                hora_abre: c.hora_abre || '08:00',
                hora_fecha: c.hora_fecha || '18:00',
                intervalo_padrao: c.intervalo_padrao || 30,
                dias_atendimento: c.dias_atendimento || 'Segunda a Sexta',
                periodo_confirmacao: c.periodo_confirmacao || 48,
                msg_aniversario: c.msg_aniversario || ''
            }
        });
    } catch (error) {
        console.error('Erro buscar config:', error);
        res.status(500).json({ success: false, erro: 'Erro ao buscar configurações' });
    }
});

// Salvar configurações da clínica
app.put('/api/config-clinica', authMiddleware, async (req, res) => {
    try {
        const {
            nome_clinica, nome_dentista, telefone, whatsapp, endereco, assinatura,
            hora_abre, hora_fecha, intervalo_padrao, dias_atendimento,
            periodo_confirmacao, msg_aniversario
        } = req.body;
        
        // Usar UPSERT (INSERT ... ON CONFLICT UPDATE)
        const result = await pool.query(
            `INSERT INTO config_clinica (
                dentista_id, nome_clinica, nome_dentista, telefone, whatsapp, endereco, assinatura,
                hora_abre, hora_fecha, intervalo_padrao, dias_atendimento, periodo_confirmacao, msg_aniversario,
                atualizado_em
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
            ON CONFLICT (dentista_id) DO UPDATE SET
                nome_clinica = EXCLUDED.nome_clinica,
                nome_dentista = EXCLUDED.nome_dentista,
                telefone = EXCLUDED.telefone,
                whatsapp = EXCLUDED.whatsapp,
                endereco = EXCLUDED.endereco,
                assinatura = EXCLUDED.assinatura,
                hora_abre = EXCLUDED.hora_abre,
                hora_fecha = EXCLUDED.hora_fecha,
                intervalo_padrao = EXCLUDED.intervalo_padrao,
                dias_atendimento = EXCLUDED.dias_atendimento,
                periodo_confirmacao = EXCLUDED.periodo_confirmacao,
                msg_aniversario = EXCLUDED.msg_aniversario,
                atualizado_em = NOW()
            RETURNING *`,
            [
                parseInt(req.user.id),
                nome_clinica || null,
                nome_dentista || null,
                telefone || null,
                whatsapp || null,
                endereco || null,
                assinatura || null,
                hora_abre || '08:00',
                hora_fecha || '18:00',
                intervalo_padrao || 30,
                dias_atendimento || 'Segunda a Sexta',
                periodo_confirmacao || 48,
                msg_aniversario || null
            ]
        );
        
        console.log(`Config clínica salva para dentista ${req.user.id}`);
        res.json({ success: true, message: 'Configurações salvas!', config: result.rows[0] });
    } catch (error) {
        console.error('Erro salvar config:', error);
        res.status(500).json({ success: false, erro: 'Erro ao salvar configurações' });
    }
});

// ==============================================================================
// ROTAS DE USUÁRIOS VINCULADOS (Secretárias, Auxiliares, etc)
// ==============================================================================

// Lista de permissões disponíveis
const PERMISSOES_DISPONIVEIS = [
    { id: 'agenda', nome: 'Agenda', descricao: 'Visualizar e gerenciar agendamentos' },
    { id: 'agenda_editar', nome: 'Agenda - Editar', descricao: 'Criar, editar e excluir agendamentos' },
    { id: 'pacientes_visualizar', nome: 'Pacientes - Visualizar', descricao: 'Ver lista e dados básicos de pacientes' },
    { id: 'pacientes_editar', nome: 'Pacientes - Editar', descricao: 'Cadastrar e editar pacientes' },
    { id: 'prontuario', nome: 'Prontuário', descricao: 'Acessar prontuários e anamnese' },
    { id: 'odontograma', nome: 'Odontograma', descricao: 'Visualizar e editar odontograma' },
    { id: 'plano_tratamento', nome: 'Plano de Tratamento', descricao: 'Criar e editar planos de tratamento' },
    { id: 'financeiro_visualizar', nome: 'Financeiro - Visualizar', descricao: 'Ver recebimentos e pagamentos' },
    { id: 'financeiro_editar', nome: 'Financeiro - Editar', descricao: 'Registrar recebimentos e pagamentos' },
    { id: 'laboratorio', nome: 'Laboratório', descricao: 'Gerenciar casos protéticos' },
    { id: 'nfse', nome: 'Notas Fiscais', descricao: 'Emitir e gerenciar NFS-e' },
    { id: 'relatorios', nome: 'Relatórios', descricao: 'Acessar relatórios e dashboard' },
    { id: 'configuracoes', nome: 'Configurações', descricao: 'Alterar configurações do sistema' },
    { id: 'usuarios', nome: 'Gerenciar Usuários', descricao: 'Criar e gerenciar usuários vinculados' }
];

// Listar permissões disponíveis
app.get('/api/usuarios/permissoes-disponiveis', authMiddleware, (req, res) => {
    res.json({ success: true, permissoes: PERMISSOES_DISPONIVEIS });
});

// Listar usuários vinculados do dentista
app.get('/api/usuarios', authMiddleware, async (req, res) => {
    try {
        // Apenas dentistas podem ver usuários
        if (req.tipoUsuario !== 'dentista') {
            return res.status(403).json({ success: false, erro: 'Apenas o dentista pode gerenciar usuários' });
        }
        
        const dentistaId = req.user.id;
        
        const result = await pool.query(`
            SELECT id, nome, email, cargo, ativo, permissoes, criado_em, atualizado_em
            FROM usuarios_vinculados
            WHERE dentista_id = $1
            ORDER BY nome
        `, [dentistaId]);
        
        // Parse permissões
        const usuarios = result.rows.map(u => ({
            ...u,
            permissoes: typeof u.permissoes === 'string' ? JSON.parse(u.permissoes) : u.permissoes
        }));
        
        res.json({ success: true, usuarios });
    } catch (error) {
        console.error('Erro listar usuarios:', error);
        res.status(500).json({ success: false, erro: 'Erro ao listar usuários' });
    }
});

// Criar novo usuário vinculado
app.post('/api/usuarios', authMiddleware, async (req, res) => {
    try {
        // Apenas dentistas podem criar usuários
        if (req.tipoUsuario !== 'dentista') {
            return res.status(403).json({ success: false, erro: 'Apenas o dentista pode criar usuários' });
        }
        
        const dentistaId = req.user.id;
        const { nome, email, senha, cargo, permissoes } = req.body;
        
        // Validações
        if (!nome || !email || !senha) {
            return res.status(400).json({ success: false, erro: 'Nome, email e senha são obrigatórios' });
        }
        
        if (senha.length < 6) {
            return res.status(400).json({ success: false, erro: 'Senha deve ter no mínimo 6 caracteres' });
        }
        
        const emailLower = email.toLowerCase();
        
        // Verificar se email já existe (como dentista ou usuário)
        const existeDentista = await pool.query('SELECT id FROM dentistas WHERE email = $1', [emailLower]);
        if (existeDentista.rows.length > 0) {
            return res.status(400).json({ success: false, erro: 'Este email já está em uso' });
        }
        
        const existeUsuario = await pool.query(
            'SELECT id FROM usuarios_vinculados WHERE email = $1',
            [emailLower]
        );
        if (existeUsuario.rows.length > 0) {
            return res.status(400).json({ success: false, erro: 'Este email já está em uso' });
        }
        
        // Hash da senha
        const senhaHash = await bcrypt.hash(senha, 10);
        
        // Permissões padrão se não informadas
        const permsArray = permissoes || ['agenda', 'pacientes_visualizar'];
        
        const result = await pool.query(`
            INSERT INTO usuarios_vinculados (dentista_id, nome, email, senha, cargo, permissoes)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, nome, email, cargo, ativo, permissoes, criado_em
        `, [dentistaId, nome, emailLower, senhaHash, cargo || 'Secretária', JSON.stringify(permsArray)]);
        
        const usuario = result.rows[0];
        usuario.permissoes = permsArray;
        
        res.json({ success: true, message: 'Usuário criado com sucesso!', usuario });
    } catch (error) {
        console.error('Erro criar usuario:', error);
        if (error.code === '23505') {
            return res.status(400).json({ success: false, erro: 'Este email já está em uso' });
        }
        res.status(500).json({ success: false, erro: 'Erro ao criar usuário' });
    }
});

// Atualizar usuário vinculado
app.put('/api/usuarios/:id', authMiddleware, async (req, res) => {
    try {
        // Apenas dentistas podem editar usuários
        if (req.tipoUsuario !== 'dentista') {
            return res.status(403).json({ success: false, erro: 'Apenas o dentista pode editar usuários' });
        }
        
        const dentistaId = req.user.id;
        const usuarioId = validarId(req.params.id);
        
        if (!usuarioId) {
            return res.status(400).json({ success: false, erro: 'ID inválido' });
        }
        
        const { nome, email, senha, cargo, permissoes, ativo } = req.body;
        
        // Verificar se usuário pertence ao dentista
        const existe = await pool.query(
            'SELECT id FROM usuarios_vinculados WHERE id = $1 AND dentista_id = $2',
            [usuarioId, dentistaId]
        );
        if (existe.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Usuário não encontrado' });
        }
        
        // Montar query dinâmica
        const campos = [];
        const valores = [];
        let idx = 1;
        
        if (nome) {
            campos.push(`nome = $${idx++}`);
            valores.push(nome);
        }
        if (email) {
            // Verificar se novo email já existe
            const emailLower = email.toLowerCase();
            const existeEmail = await pool.query(
                'SELECT id FROM usuarios_vinculados WHERE email = $1 AND id != $2',
                [emailLower, usuarioId]
            );
            if (existeEmail.rows.length > 0) {
                return res.status(400).json({ success: false, erro: 'Este email já está em uso' });
            }
            const existeDentista = await pool.query('SELECT id FROM dentistas WHERE email = $1', [emailLower]);
            if (existeDentista.rows.length > 0) {
                return res.status(400).json({ success: false, erro: 'Este email já está em uso' });
            }
            campos.push(`email = $${idx++}`);
            valores.push(emailLower);
        }
        if (senha) {
            if (senha.length < 6) {
                return res.status(400).json({ success: false, erro: 'Senha deve ter no mínimo 6 caracteres' });
            }
            const senhaHash = await bcrypt.hash(senha, 10);
            campos.push(`senha = $${idx++}`);
            valores.push(senhaHash);
        }
        if (cargo !== undefined) {
            campos.push(`cargo = $${idx++}`);
            valores.push(cargo);
        }
        if (permissoes !== undefined) {
            campos.push(`permissoes = $${idx++}`);
            valores.push(JSON.stringify(permissoes));
        }
        if (ativo !== undefined) {
            campos.push(`ativo = $${idx++}`);
            valores.push(ativo);
        }
        
        if (campos.length === 0) {
            return res.status(400).json({ success: false, erro: 'Nenhum campo para atualizar' });
        }
        
        campos.push(`atualizado_em = CURRENT_TIMESTAMP`);
        valores.push(usuarioId);
        
        const query = `
            UPDATE usuarios_vinculados 
            SET ${campos.join(', ')}
            WHERE id = $${idx}
            RETURNING id, nome, email, cargo, ativo, permissoes, criado_em, atualizado_em
        `;
        
        const result = await pool.query(query, valores);
        const usuario = result.rows[0];
        usuario.permissoes = typeof usuario.permissoes === 'string' 
            ? JSON.parse(usuario.permissoes) 
            : usuario.permissoes;
        
        res.json({ success: true, message: 'Usuário atualizado!', usuario });
    } catch (error) {
        console.error('Erro atualizar usuario:', error);
        res.status(500).json({ success: false, erro: 'Erro ao atualizar usuário' });
    }
});

// Excluir usuário vinculado
app.delete('/api/usuarios/:id', authMiddleware, async (req, res) => {
    try {
        // Apenas dentistas podem excluir usuários
        if (req.tipoUsuario !== 'dentista') {
            return res.status(403).json({ success: false, erro: 'Apenas o dentista pode excluir usuários' });
        }
        
        const dentistaId = req.user.id;
        const usuarioId = validarId(req.params.id);
        
        if (!usuarioId) {
            return res.status(400).json({ success: false, erro: 'ID inválido' });
        }
        
        const result = await pool.query(
            'DELETE FROM usuarios_vinculados WHERE id = $1 AND dentista_id = $2 RETURNING id, nome',
            [usuarioId, dentistaId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Usuário não encontrado' });
        }
        
        res.json({ success: true, message: `Usuário ${result.rows[0].nome} excluído!` });
    } catch (error) {
        console.error('Erro excluir usuario:', error);
        res.status(500).json({ success: false, erro: 'Erro ao excluir usuário' });
    }
});

// ==============================================================================
// ROTAS DE PACIENTES
// ==============================================================================

// Listar pacientes
app.get('/api/pacientes', authMiddleware, async (req, res) => {
    try {
        // Paginação: limit e offset (padrão: 50 por página)
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const busca = req.query.busca || '';
        
        // Query base
        let query = `SELECT * FROM pacientes WHERE dentista_id = $1 AND (ativo = true OR ativo IS NULL)`;
        let countQuery = `SELECT COUNT(*) FROM pacientes WHERE dentista_id = $1 AND (ativo = true OR ativo IS NULL)`;
        let params = [parseInt(req.user.id)];
        let countParams = [parseInt(req.user.id)];
        
        // Se tiver busca, filtrar (ignorando acentos)
        if (busca) {
            // Normaliza a busca removendo acentos
            const buscaNorm = busca.toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            query += ` AND (
                LOWER(TRANSLATE(nome, 'áàãâäéèêëíìîïóòõôöúùûüçñÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')) LIKE $2 
                OR cpf LIKE $2 
                OR telefone LIKE $2 
                OR celular LIKE $2
            )`;
            countQuery += ` AND (
                LOWER(TRANSLATE(nome, 'áàãâäéèêëíìîïóòõôöúùûüçñÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')) LIKE $2 
                OR cpf LIKE $2 
                OR telefone LIKE $2 
                OR celular LIKE $2
            )`;
            params.push('%' + buscaNorm + '%');
            countParams.push('%' + buscaNorm + '%');
        }
        
        // Ordenar e paginar
        query += ` ORDER BY nome ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);
        
        // Queries de estatísticas (sempre retorna totais reais)
        const statsQueries = {
            total: `SELECT COUNT(*) FROM pacientes WHERE dentista_id = $1 AND (ativo = true OR ativo IS NULL)`,
            completos: `SELECT COUNT(*) FROM pacientes WHERE dentista_id = $1 AND (ativo = true OR ativo IS NULL) AND cadastro_completo = true`,
            incompletos: `SELECT COUNT(*) FROM pacientes WHERE dentista_id = $1 AND (ativo = true OR ativo IS NULL) AND (cadastro_completo = false OR cadastro_completo IS NULL)`,
            menores: `SELECT COUNT(*) FROM pacientes WHERE dentista_id = $1 AND (ativo = true OR ativo IS NULL) AND menor_idade = true`
        };
        
        // Executar todas as queries em paralelo
        const [result, countResult, completosResult, incompletosResult, menoresResult] = await Promise.all([
            pool.query(query, params),
            pool.query(countQuery, countParams),
            pool.query(statsQueries.completos, [parseInt(req.user.id)]),
            pool.query(statsQueries.incompletos, [parseInt(req.user.id)]),
            pool.query(statsQueries.menores, [parseInt(req.user.id)])
        ]);
        
        const total = parseInt(countResult.rows[0].count);
        const stats = {
            total: parseInt(countResult.rows[0].count),
            completos: parseInt(completosResult.rows[0].count),
            incompletos: parseInt(incompletosResult.rows[0].count),
            menores: parseInt(menoresResult.rows[0].count)
        };

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
            cadastroCompleto: p.cadastro_completo || false,
            criadoEm: p.criado_em
        }));

        res.json({ 
            success: true, 
            pacientes, 
            total,
            stats,
            limit,
            offset,
            hasMore: offset + pacientes.length < total
        });
    } catch (error) {
        console.error('Erro listar pacientes:', error);
        res.status(500).json({ success: false, erro: 'Erro ao listar pacientes' });
    }
});

// Buscar aniversariantes de hoje (DEVE FICAR ANTES DA ROTA :id)
app.get('/api/pacientes/aniversariantes', authMiddleware, async (req, res) => {
    try {
        const hoje = new Date();
        const dia = hoje.getDate();
        const mes = hoje.getMonth() + 1;
        
        const result = await pool.query(
            `SELECT id, nome, data_nascimento, celular
             FROM pacientes 
             WHERE dentista_id = $1 
               AND EXTRACT(DAY FROM data_nascimento) = $2
               AND EXTRACT(MONTH FROM data_nascimento) = $3
               AND ativo = true
             ORDER BY nome`,
            [parseInt(req.user.id), dia, mes]
        );
        
        res.json({ success: true, pacientes: result.rows });
    } catch (error) {
        console.error('Erro buscar aniversariantes:', error);
        res.status(500).json({ success: false, erro: 'Erro ao buscar aniversariantes' });
    }
});

// Buscar paciente por ID
app.get('/api/pacientes/:id', authMiddleware, async (req, res) => {
    try {
        const id = validarId(req.params.id);
        
        // Validar se ID é um número válido
        if (!id) {
            return res.status(400).json({ success: false, erro: 'ID de paciente inválido' });
        }
        
        const result = await pool.query(
            'SELECT * FROM pacientes WHERE id = $1 AND dentista_id = $2',
            [id, parseInt(req.user.id)]
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
            estrangeiro, passaporte, pais, nacionalidade, tipo_documento,
            // Campos de Tel. Recados
            tel_recados, nome_recado
        } = req.body;

        // ========== VALIDAÇÃO MÍNIMA ==========
        
        // Nome é sempre obrigatório
        if (!nome || nome.trim().length < 2) {
            return res.status(400).json({ success: false, erro: 'Nome é obrigatório (mínimo 2 caracteres)' });
        }
        
        // ========== CALCULAR SE CADASTRO ESTÁ COMPLETO ==========
        // Cadastro completo = Nome + CPF (ou passaporte) + CEP
        // Sem esses dados, não pode emitir NFS-e
        
        let cadastroCompleto = true;
        
        // Verificar documento (CPF ou passaporte)
        if (estrangeiro) {
            if (!passaporte) cadastroCompleto = false;
        } else {
            if (!cpf) cadastroCompleto = false;
        }
        
        // Verificar CEP
        if (!cep) {
            cadastroCompleto = false;
        }

        const result = await pool.query(
            `INSERT INTO pacientes (
                dentista_id, nome, cpf, rg, data_nascimento, sexo, telefone, celular, email,
                endereco, numero, complemento, bairro, cidade, estado, cep,
                convenio, numero_convenio, observacoes,
                menor_idade, responsavel_nome, responsavel_cpf, responsavel_rg,
                responsavel_telefone, responsavel_email, responsavel_parentesco, responsavel_endereco,
                estrangeiro, passaporte, pais, nacionalidade, tipo_documento,
                tel_recados, nome_recado, cadastro_completo
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35)
            RETURNING *`,
            [
                parseInt(req.user.id), nome, cpf || null, rg || null,
                dataNascimento || null, sexo || null, telefone || null, celular || null, email || null,
                endereco || null, numero || null, complemento || null, bairro || null,
                cidade || null, estado || null, cep || null,
                convenio || null, numeroConvenio || null, observacoes || null,
                menorIdade || false, responsavelNome || null, responsavelCpf || null, responsavelRg || null,
                responsavelTelefone || null, responsavelEmail || null, responsavelParentesco || null, responsavelEndereco || null,
                estrangeiro || false, passaporte || null, pais || null, nacionalidade || null, tipo_documento || 'cpf',
                tel_recados || null, nome_recado || null, cadastroCompleto
            ]
        );

        const p = result.rows[0];
        res.status(201).json({
            success: true,
            message: cadastroCompleto ? 'Paciente cadastrado com sucesso!' : 'Paciente cadastrado (cadastro incompleto - não pode emitir NFS-e)',
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
                tipo_documento: p.tipo_documento,
                cadastroCompleto: p.cadastro_completo || false
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
            responsavelTelefone, responsavelEmail, responsavelParentesco, responsavelEndereco,
            estrangeiro, passaporte, pais, nacionalidade, tipo_documento
        } = req.body;

        // ========== RECALCULAR SE CADASTRO ESTÁ COMPLETO ==========
        // Cadastro completo = Nome + CPF (ou passaporte) + CEP
        let cadastroCompleto = true;
        
        // Verificar documento (CPF ou passaporte)
        if (estrangeiro) {
            if (!passaporte) cadastroCompleto = false;
        } else {
            if (!cpf) cadastroCompleto = false;
        }
        
        // Verificar CEP
        if (!cep) {
            cadastroCompleto = false;
        }

        const result = await pool.query(
            `UPDATE pacientes SET
                nome = COALESCE($1, nome), cpf = $2, rg = $3, data_nascimento = $4, sexo = $5,
                telefone = $6, celular = $7, email = $8, endereco = $9, numero = $10,
                complemento = $11, bairro = $12, cidade = $13, estado = $14, cep = $15,
                convenio = $16, numero_convenio = $17, observacoes = $18,
                menor_idade = $19, responsavel_nome = $20, responsavel_cpf = $21, responsavel_rg = $22,
                responsavel_telefone = $23, responsavel_email = $24, responsavel_parentesco = $25, responsavel_endereco = $26,
                estrangeiro = $27, passaporte = $28, pais = $29, nacionalidade = $30, tipo_documento = $31,
                cadastro_completo = $32,
                atualizado_em = CURRENT_TIMESTAMP
            WHERE id = $33 AND dentista_id = $34 RETURNING *`,
            [
                nome, cpf || null, rg || null, dataNascimento || null, sexo || null,
                telefone || null, celular || null, email || null, endereco || null, numero || null,
                complemento || null, bairro || null, cidade || null, estado || null, cep || null,
                convenio || null, numeroConvenio || null, observacoes || null,
                menorIdade || false, responsavelNome || null, responsavelCpf || null, responsavelRg || null,
                responsavelTelefone || null, responsavelEmail || null, responsavelParentesco || null, responsavelEndereco || null,
                estrangeiro || false, passaporte || null, pais || null, nacionalidade || null, tipo_documento || 'cpf',
                cadastroCompleto,
                parseInt(id), parseInt(req.user.id)
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Paciente não encontrado' });
        }

        const p = result.rows[0];
        res.json({ 
            success: true, 
            message: cadastroCompleto ? 'Paciente atualizado!' : 'Paciente atualizado (cadastro incompleto)',
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
                estrangeiro: p.estrangeiro || false,
                passaporte: p.passaporte,
                pais: p.pais,
                nacionalidade: p.nacionalidade,
                tipo_documento: p.tipo_documento || 'cpf',
                cadastroCompleto: p.cadastro_completo || false
            }
        });
    } catch (error) {
        console.error('Erro atualizar paciente:', error);
        res.status(500).json({ success: false, erro: 'Erro ao atualizar paciente' });
    }
});

// Deletar paciente (soft delete)
app.delete('/api/pacientes/:id', authMiddleware, async (req, res) => {
    try {
        const id = validarId(req.params.id);
        if (!id) {
            return res.status(400).json({ success: false, erro: 'ID inválido' });
        }
        
        const result = await pool.query(
            'UPDATE pacientes SET ativo = false WHERE id = $1 AND dentista_id = $2 RETURNING id',
            [id, parseInt(req.user.id)]
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
        
        // Query usando colunas do banco de produção (name, clinic)
        const result = await pool.query(
            `SELECT a.*, d.name as dentista_nome, d.clinic as clinica_nome
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
                clinicaTelefone: null // Telefone será pego das configurações locais
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
        
        // Buscar agendamento - usando colunas do banco de produção
        const busca = await pool.query(
            `SELECT a.*, d.name as dentista_nome, d.clinic as clinica_nome
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
                    clinicaTelefone: null
                }
            });
        }
        
        // Atualizar status
        const novoStatus = acao === 'confirmar' ? 'confirmado' : 'cancelado';
        await pool.query(
            'UPDATE agendamentos SET status = $1 WHERE id = $2',
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
                clinicaTelefone: null
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
        const { data, inicio, fim, profissional_id } = req.query;
        let query = `SELECT a.*, COALESCE(p.celular, p.telefone) as paciente_telefone 
                     FROM agendamentos a 
                     LEFT JOIN pacientes p ON a.paciente_id = p.id 
                     WHERE a.dentista_id = $1`;
        const params = [parseInt(req.user.id)];
        let paramIndex = 2;

        // Filtrar por profissional específico (coluna da agenda)
        if (profissional_id) {
            query += ` AND a.profissional_id = $${paramIndex}`;
            params.push(parseInt(profissional_id));
            paramIndex++;
        }

        if (data) {
            query += ` AND a.data = $${paramIndex}`;
            params.push(data);
            paramIndex++;
        } else if (inicio && fim) {
            query += ` AND a.data >= $${paramIndex} AND a.data <= $${paramIndex + 1}`;
            params.push(inicio, fim);
            paramIndex += 2;
        }

        query += ' ORDER BY a.data ASC, a.horario ASC';
        const result = await pool.query(query, params);

        const agendamentos = result.rows.map(a => ({
            id: a.id.toString(),
            pacienteId: a.paciente_id ? a.paciente_id.toString() : null,
            paciente_nome: a.paciente_nome,
            paciente_telefone: a.paciente_telefone || null,
            data: a.data,
            hora: a.horario,
            duracao: a.duracao,
            procedimento: a.procedimento,
            valor: a.valor,
            status: a.status,
            encaixe: a.encaixe || false,
            observacoes: a.observacoes,
            codigoConfirmacao: a.codigo_confirmacao,
            rotulo: a.rotulo,
            profissional_id: a.profissional_id,
            criadoEm: a.criado_em
        }));

        res.json({ success: true, agendamentos, total: agendamentos.length });
    } catch (error) {
        console.error('Erro listar agendamentos:', error);
        res.status(500).json({ success: false, erro: 'Erro ao listar agendamentos' });
    }
});

// Buscar agendamentos pendentes de confirmação (para envio em lote)
app.get('/api/agendamentos/pendentes', authMiddleware, async (req, res) => {
    try {
        const { inicio, fim } = req.query;
        
        if (!inicio || !fim) {
            return res.status(400).json({ success: false, erro: 'Período obrigatório (inicio e fim)' });
        }
        
        // Buscar agendamentos pendentes (status = 'agendado') com dados do paciente e profissional
        const result = await pool.query(
            `SELECT a.*, 
                    COALESCE(p.celular, p.telefone) as paciente_telefone,
                    prof.nome as profissional_nome
             FROM agendamentos a
             LEFT JOIN pacientes p ON a.paciente_id = p.id
             LEFT JOIN profissionais prof ON a.profissional_id = prof.id
             WHERE a.dentista_id = $1 
               AND a.data >= $2 
               AND a.data <= $3
               AND (a.status = 'agendado' OR a.status IS NULL)
             ORDER BY a.data ASC, a.horario ASC`,
            [parseInt(req.user.id), inicio, fim]
        );
        
        const agendamentos = result.rows.map(a => ({
            id: a.id.toString(),
            paciente_id: a.paciente_id ? a.paciente_id.toString() : null,
            paciente_nome: a.paciente_nome,
            paciente_telefone: a.paciente_telefone || null,
            data: a.data,
            hora: a.horario,
            duracao: a.duracao,
            procedimento: a.procedimento,
            status: a.status,
            codigo_confirmacao: a.codigo_confirmacao,
            profissional_id: a.profissional_id,
            profissional_nome: a.profissional_nome || 'Profissional'
        }));
        
        res.json({ success: true, agendamentos, total: agendamentos.length });
    } catch (error) {
        console.error('Erro buscar pendentes:', error);
        res.status(500).json({ success: false, erro: 'Erro ao buscar agendamentos pendentes' });
    }
});

// Buscar agendamentos com tel. de recados (pacientes que têm tel_recados preenchido)
app.get('/api/agendamentos/recados', authMiddleware, async (req, res) => {
    try {
        const { inicio, fim } = req.query;
        
        if (!inicio || !fim) {
            return res.status(400).json({ success: false, erro: 'Período obrigatório' });
        }
        
        const result = await pool.query(
            `SELECT a.*, 
                    p.tel_recados,
                    p.nome_recado,
                    prof.nome as profissional_nome
             FROM agendamentos a
             JOIN pacientes p ON a.paciente_id = p.id
             LEFT JOIN profissionais prof ON a.profissional_id = prof.id
             WHERE a.dentista_id = $1 
               AND a.data >= $2 
               AND a.data <= $3
               AND p.tel_recados IS NOT NULL 
               AND p.tel_recados != ''
             ORDER BY a.data ASC, a.horario ASC`,
            [parseInt(req.user.id), inicio, fim]
        );
        
        const agendamentos = result.rows.map(a => ({
            id: a.id.toString(),
            paciente_nome: a.paciente_nome,
            tel_recados: a.tel_recados,
            nome_recado: a.nome_recado,
            data: a.data,
            hora: a.horario,
            procedimento: a.procedimento,
            profissional_nome: a.profissional_nome || 'Profissional'
        }));
        
        res.json({ success: true, agendamentos });
    } catch (error) {
        console.error('Erro buscar recados:', error);
        res.status(500).json({ success: false, erro: 'Erro ao buscar recados' });
    }
});

app.post('/api/agendamentos', authMiddleware, async (req, res) => {
    try {
        const { pacienteId, pacienteNome, data, horario, duracao, procedimento, valor, status, encaixe, observacoes, rotulo, profissional_id, dentista_id } = req.body;

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

        // profissional_id = ID do profissional na agenda (coluna)
        // dentista_id do body = mesmo que profissional_id (compatibilidade)
        const profId = profissional_id || dentista_id || null;

        const result = await pool.query(
            `INSERT INTO agendamentos (dentista_id, paciente_id, paciente_nome, data, horario, duracao, procedimento, valor, status, encaixe, observacoes, codigo_confirmacao, rotulo, profissional_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
            [parseInt(req.user.id), pacienteId ? parseInt(pacienteId) : null, nomePaciente, data, horario, duracao || 60, procedimento, valor, status || 'agendado', encaixe || false, observacoes, codigoConfirmacao, rotulo || null, profId ? parseInt(profId) : null]
        );

        const a = result.rows[0];
        res.status(201).json({
            success: true,
            message: 'Agendamento criado!',
            agendamento: { 
                id: a.id.toString(), 
                paciente_nome: a.paciente_nome, 
                data: a.data, 
                hora: a.horario, 
                procedimento: a.procedimento, 
                status: a.status, 
                encaixe: a.encaixe,
                codigoConfirmacao: a.codigo_confirmacao,
                rotulo: a.rotulo,
                profissional_id: a.profissional_id
            }
        });
    } catch (error) {
        console.error('Erro criar agendamento:', error);
        res.status(500).json({ success: false, erro: 'Erro ao criar agendamento' });
    }
});

// Buscar agendamento por ID
app.get('/api/agendamentos/:id', authMiddleware, async (req, res) => {
    try {
        const id = validarId(req.params.id);
        if (!id) {
            return res.status(400).json({ success: false, erro: 'ID inválido' });
        }
        
        const result = await pool.query(
            `SELECT a.*, COALESCE(p.celular, p.telefone) as paciente_telefone_db
             FROM agendamentos a
             LEFT JOIN pacientes p ON a.paciente_id = p.id
             WHERE a.id = $1 AND a.dentista_id = $2`,
            [id, parseInt(req.user.id)]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Agendamento não encontrado' });
        }

        const a = result.rows[0];
        res.json({
            id: a.id.toString(),
            paciente_id: a.paciente_id ? a.paciente_id.toString() : null,
            paciente_nome: a.paciente_nome,
            paciente_telefone: a.paciente_telefone_db || null,
            data: a.data,
            hora: a.horario,
            duracao: a.duracao,
            procedimento: a.procedimento,
            valor: a.valor,
            status: a.status,
            encaixe: a.encaixe || false,
            observacoes: a.observacoes,
            codigoConfirmacao: a.codigo_confirmacao,
            rotulo: a.rotulo,
            profissional_id: a.profissional_id,
            criadoEm: a.criado_em
        });
    } catch (error) {
        console.error('Erro buscar agendamento:', error);
        res.status(500).json({ success: false, erro: 'Erro ao buscar agendamento' });
    }
});

app.put('/api/agendamentos/:id', authMiddleware, async (req, res) => {
    try {
        const id = validarId(req.params.id);
        if (!id) {
            return res.status(400).json({ success: false, erro: 'ID inválido' });
        }
        
        const { pacienteId, pacienteNome, data, horario, duracao, procedimento, valor, status, encaixe, observacoes } = req.body;

        let nomePaciente = pacienteNome;
        const pacId = validarId(pacienteId);
        if (pacId && !nomePaciente) {
            const pacResult = await pool.query('SELECT nome FROM pacientes WHERE id = $1', [pacId]);
            if (pacResult.rows.length > 0) nomePaciente = pacResult.rows[0].nome;
        }

        const result = await pool.query(
            `UPDATE agendamentos SET paciente_id = $1, paciente_nome = $2, data = COALESCE($3, data), horario = COALESCE($4, horario),
             duracao = COALESCE($5, duracao), procedimento = $6, valor = $7, status = COALESCE($8, status), encaixe = COALESCE($9, encaixe),
             observacoes = $10, atualizado_em = CURRENT_TIMESTAMP WHERE id = $11 AND dentista_id = $12 RETURNING *`,
            [pacId, nomePaciente, data, horario, duracao, procedimento, valor, status, encaixe, observacoes, id, parseInt(req.user.id)]
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
        const id = validarId(req.params.id);
        if (!id) {
            return res.status(400).json({ success: false, erro: 'ID inválido' });
        }
        
        const result = await pool.query(
            'DELETE FROM agendamentos WHERE id = $1 AND dentista_id = $2 RETURNING id',
            [id, parseInt(req.user.id)]
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
        const pacienteId = validarId(req.params.pacienteId);
        if (!pacienteId) {
            return res.status(400).json({ success: false, erro: 'ID de paciente inválido' });
        }
        
        const result = await pool.query(
            `SELECT * FROM prontuarios WHERE paciente_id = $1 AND dentista_id = $2 ORDER BY data DESC`,
            [pacienteId, parseInt(req.user.id)]
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
        const id = validarId(req.params.id);
        if (!id) {
            return res.status(400).json({ success: false, erro: 'ID inválido' });
        }
        
        const { status } = req.body;
        const result = await pool.query(
            'UPDATE financeiro SET status = $1 WHERE id = $2 AND dentista_id = $3 RETURNING *',
            [status, id, parseInt(req.user.id)]
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
        const id = validarId(req.params.id);
        if (!id) {
            return res.status(400).json({ success: false, erro: 'ID inválido' });
        }
        
        const result = await pool.query(
            'DELETE FROM financeiro WHERE id = $1 AND dentista_id = $2 RETURNING id',
            [id, parseInt(req.user.id)]
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

        // ========== VERIFICAR SE PACIENTE TEM CADASTRO COMPLETO ==========
        if (pacienteId) {
            const pacienteResult = await pool.query(
                'SELECT nome, cadastro_completo FROM pacientes WHERE id = $1 AND dentista_id = $2',
                [parseInt(pacienteId), parseInt(req.user.id)]
            );
            
            if (pacienteResult.rows.length === 0) {
                return res.status(404).json({ success: false, erro: 'Paciente não encontrado' });
            }
            
            const paciente = pacienteResult.rows[0];
            if (!paciente.cadastro_completo) {
                return res.status(400).json({ 
                    success: false, 
                    erro: `Para emitir NFS-e para "${paciente.nome}", é necessário completar o cadastro (CPF e endereço)`,
                    cadastroIncompleto: true,
                    pacienteId: pacienteId
                });
            }
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
// ROTAS DE LABORATÓRIOS
// ==============================================================================

// Listar laboratórios
app.get('/api/laboratorios', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT l.*,
                (SELECT COUNT(*) FROM casos_proteticos WHERE laboratorio_id = l.id) as total_casos,
                (SELECT COUNT(*) FROM casos_proteticos WHERE laboratorio_id = l.id AND status = 'finalizado' 
                    AND data_retorno_real <= data_prometida) as entregas_no_prazo
            FROM laboratorios l
            WHERE l.dentista_id = $1 AND l.ativo = true
            ORDER BY l.nome ASC`,
            [parseInt(req.user.id)]
        );

        const laboratorios = result.rows.map(l => ({
            id: l.id.toString(),
            nome: l.nome,
            cnpj: l.cnpj,
            telefone: l.telefone,
            whatsapp: l.whatsapp,
            email: l.email,
            endereco: l.endereco,
            cidade: l.cidade,
            estado: l.estado,
            responsavelTecnico: l.responsavel_tecnico,
            croResponsavel: l.cro_responsavel,
            especialidades: l.especialidades || [],
            totalCasos: parseInt(l.total_casos) || 0,
            entregasNoPrazo: parseInt(l.entregas_no_prazo) || 0,
            percentualNoPrazo: l.total_casos > 0 ? Math.round((l.entregas_no_prazo / l.total_casos) * 100) : 0
        }));

        res.json({ success: true, laboratorios });
    } catch (error) {
        console.error('Erro ao listar laboratórios:', error);
        res.status(500).json({ success: false, erro: 'Erro ao listar laboratórios' });
    }
});

// Criar laboratório
app.post('/api/laboratorios', authMiddleware, async (req, res) => {
    try {
        const { nome, cnpj, telefone, whatsapp, email, endereco, cidade, estado, cep, responsavelTecnico, croResponsavel, especialidades, observacoes } = req.body;

        if (!nome) {
            return res.status(400).json({ success: false, erro: 'Nome é obrigatório' });
        }

        const result = await pool.query(
            `INSERT INTO laboratorios (dentista_id, nome, cnpj, telefone, whatsapp, email, endereco, cidade, estado, cep, responsavel_tecnico, cro_responsavel, especialidades, observacoes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
            [parseInt(req.user.id), nome, cnpj || null, telefone || null, whatsapp || null, email || null, endereco || null, cidade || null, estado || null, cep || null, responsavelTecnico || null, croResponsavel || null, especialidades || [], observacoes || null]
        );

        res.json({ success: true, laboratorio: { id: result.rows[0].id.toString(), nome } });
    } catch (error) {
        console.error('Erro ao criar laboratório:', error);
        res.status(500).json({ success: false, erro: 'Erro ao criar laboratório' });
    }
});

// Atualizar laboratório
app.put('/api/laboratorios/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, cnpj, telefone, whatsapp, email, endereco, cidade, estado, cep, responsavelTecnico, croResponsavel, especialidades, observacoes } = req.body;

        const result = await pool.query(
            `UPDATE laboratorios SET nome = COALESCE($1, nome), cnpj = $2, telefone = $3, whatsapp = $4, email = $5, endereco = $6, cidade = $7, estado = $8, cep = $9, responsavel_tecnico = $10, cro_responsavel = $11, especialidades = $12, observacoes = $13, atualizado_em = CURRENT_TIMESTAMP
             WHERE id = $14 AND dentista_id = $15 RETURNING *`,
            [nome, cnpj || null, telefone || null, whatsapp || null, email || null, endereco || null, cidade || null, estado || null, cep || null, responsavelTecnico || null, croResponsavel || null, especialidades || [], observacoes || null, parseInt(id), parseInt(req.user.id)]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Laboratório não encontrado' });
        }

        res.json({ success: true, message: 'Laboratório atualizado!' });
    } catch (error) {
        console.error('Erro ao atualizar laboratório:', error);
        res.status(500).json({ success: false, erro: 'Erro ao atualizar laboratório' });
    }
});

// Excluir laboratório (soft delete)
app.delete('/api/laboratorios/:id', authMiddleware, async (req, res) => {
    try {
        await pool.query('UPDATE laboratorios SET ativo = false WHERE id = $1 AND dentista_id = $2', [parseInt(req.params.id), parseInt(req.user.id)]);
        res.json({ success: true, message: 'Laboratório removido!' });
    } catch (error) {
        console.error('Erro ao excluir laboratório:', error);
        res.status(500).json({ success: false, erro: 'Erro ao excluir laboratório' });
    }
});

// ==============================================================================
// ROTAS DE PREÇOS DOS LABORATÓRIOS (MÓDULO FINANÇAS)
// ==============================================================================

// Listar preços de um laboratório
app.get('/api/laboratorios/:id/precos', authMiddleware, async (req, res) => {
    try {
        const labId = parseInt(req.params.id);
        
        // Verificar se o laboratório pertence ao dentista
        const labCheck = await pool.query(
            'SELECT id FROM laboratorios WHERE id = $1 AND dentista_id = $2',
            [labId, parseInt(req.user.id)]
        );
        if (labCheck.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Laboratório não encontrado' });
        }

        const result = await pool.query(
            `SELECT * FROM laboratorios_precos 
             WHERE laboratorio_id = $1 AND ativo = true
             ORDER BY material ASC, procedimento ASC`,
            [labId]
        );

        const precos = result.rows.map(p => ({
            id: p.id.toString(),
            material: p.material,
            procedimento: p.procedimento,
            valor: parseFloat(p.valor),
            observacao: p.observacao
        }));

        // Agrupar por material
        const porMaterial = {};
        precos.forEach(p => {
            if (!porMaterial[p.material]) {
                porMaterial[p.material] = [];
            }
            porMaterial[p.material].push(p);
        });

        res.json({ success: true, precos, porMaterial });
    } catch (error) {
        console.error('Erro ao listar preços:', error);
        res.status(500).json({ success: false, erro: 'Erro ao listar preços' });
    }
});

// Adicionar preço ao laboratório
app.post('/api/laboratorios/:id/precos', authMiddleware, async (req, res) => {
    try {
        const labId = parseInt(req.params.id);
        const { material, procedimento, valor, observacao } = req.body;

        if (!material || !procedimento || valor === undefined) {
            return res.status(400).json({ success: false, erro: 'Material, procedimento e valor são obrigatórios' });
        }

        // Verificar se o laboratório pertence ao dentista
        const labCheck = await pool.query(
            'SELECT id FROM laboratorios WHERE id = $1 AND dentista_id = $2',
            [labId, parseInt(req.user.id)]
        );
        if (labCheck.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Laboratório não encontrado' });
        }

        const result = await pool.query(
            `INSERT INTO laboratorios_precos (laboratorio_id, material, procedimento, valor, observacao)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [labId, material.trim(), procedimento.trim(), parseFloat(valor), observacao || null]
        );

        res.json({ 
            success: true, 
            preco: {
                id: result.rows[0].id.toString(),
                material: result.rows[0].material,
                procedimento: result.rows[0].procedimento,
                valor: parseFloat(result.rows[0].valor),
                observacao: result.rows[0].observacao
            }
        });
    } catch (error) {
        console.error('Erro ao adicionar preço:', error);
        res.status(500).json({ success: false, erro: 'Erro ao adicionar preço' });
    }
});

// Adicionar múltiplos preços ao laboratório
app.post('/api/laboratorios/:id/precos/lote', authMiddleware, async (req, res) => {
    try {
        const labId = parseInt(req.params.id);
        const { precos } = req.body;

        if (!precos || !Array.isArray(precos) || precos.length === 0) {
            return res.status(400).json({ success: false, erro: 'Lista de preços é obrigatória' });
        }

        // Verificar se o laboratório pertence ao dentista
        const labCheck = await pool.query(
            'SELECT id FROM laboratorios WHERE id = $1 AND dentista_id = $2',
            [labId, parseInt(req.user.id)]
        );
        if (labCheck.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Laboratório não encontrado' });
        }

        const inseridos = [];
        for (const p of precos) {
            if (p.material && p.procedimento && p.valor !== undefined) {
                const result = await pool.query(
                    `INSERT INTO laboratorios_precos (laboratorio_id, material, procedimento, valor, observacao)
                     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                    [labId, p.material.trim(), p.procedimento.trim(), parseFloat(p.valor), p.observacao || null]
                );
                inseridos.push({
                    id: result.rows[0].id.toString(),
                    material: result.rows[0].material,
                    procedimento: result.rows[0].procedimento,
                    valor: parseFloat(result.rows[0].valor)
                });
            }
        }

        res.json({ success: true, inseridos: inseridos.length, precos: inseridos });
    } catch (error) {
        console.error('Erro ao adicionar preços em lote:', error);
        res.status(500).json({ success: false, erro: 'Erro ao adicionar preços' });
    }
});

// Atualizar preço
app.put('/api/laboratorios-precos/:id', authMiddleware, async (req, res) => {
    try {
        const precoId = parseInt(req.params.id);
        const { material, procedimento, valor, observacao } = req.body;

        // Verificar se o preço pertence a um lab do dentista
        const check = await pool.query(
            `SELECT lp.id FROM laboratorios_precos lp
             JOIN laboratorios l ON l.id = lp.laboratorio_id
             WHERE lp.id = $1 AND l.dentista_id = $2`,
            [precoId, parseInt(req.user.id)]
        );
        if (check.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Preço não encontrado' });
        }

        await pool.query(
            `UPDATE laboratorios_precos SET 
                material = COALESCE($1, material),
                procedimento = COALESCE($2, procedimento),
                valor = COALESCE($3, valor),
                observacao = $4,
                atualizado_em = CURRENT_TIMESTAMP
             WHERE id = $5`,
            [material, procedimento, valor !== undefined ? parseFloat(valor) : null, observacao, precoId]
        );

        res.json({ success: true, message: 'Preço atualizado!' });
    } catch (error) {
        console.error('Erro ao atualizar preço:', error);
        res.status(500).json({ success: false, erro: 'Erro ao atualizar preço' });
    }
});

// Excluir preço (soft delete)
app.delete('/api/laboratorios-precos/:id', authMiddleware, async (req, res) => {
    try {
        const precoId = parseInt(req.params.id);

        // Verificar se o preço pertence a um lab do dentista
        const check = await pool.query(
            `SELECT lp.id FROM laboratorios_precos lp
             JOIN laboratorios l ON l.id = lp.laboratorio_id
             WHERE lp.id = $1 AND l.dentista_id = $2`,
            [precoId, parseInt(req.user.id)]
        );
        if (check.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Preço não encontrado' });
        }

        await pool.query('UPDATE laboratorios_precos SET ativo = false WHERE id = $1', [precoId]);
        res.json({ success: true, message: 'Preço removido!' });
    } catch (error) {
        console.error('Erro ao excluir preço:', error);
        res.status(500).json({ success: false, erro: 'Erro ao excluir preço' });
    }
});

// ==============================================================================
// ROTAS DE FINANÇAS (CASOS FINALIZADOS)
// ==============================================================================

// Listar finanças (casos finalizados com custos)
app.get('/api/financas', authMiddleware, async (req, res) => {
    try {
        const { dataInicio, dataFim, laboratorioId, profissionalId } = req.query;

        let query = `
            SELECT cp.id, cp.codigo, cp.tipo_trabalho, cp.tipo_trabalho_detalhe, cp.dentes, 
                   cp.material, cp.valor_custo, cp.data_finalizado, cp.criado_em,
                   p.nome as paciente_nome,
                   l.id as lab_id, l.nome as laboratorio_nome,
                   prof.id as prof_id, prof.nome as profissional_nome
            FROM casos_proteticos cp
            LEFT JOIN pacientes p ON p.id = cp.paciente_id
            LEFT JOIN laboratorios l ON l.id = cp.laboratorio_id
            LEFT JOIN profissionais prof ON prof.id = cp.profissional_id
            WHERE cp.dentista_id = $1 AND cp.status = 'finalizado'
        `;
        const params = [parseInt(req.user.id)];
        let paramCount = 1;

        // Filtro por data de finalização (convertendo para timezone local)
        if (dataInicio) {
            paramCount++;
            query += ` AND (cp.data_finalizado AT TIME ZONE 'America/Sao_Paulo')::date >= $${paramCount}::date`;
            params.push(dataInicio);
        }
        if (dataFim) {
            paramCount++;
            query += ` AND (cp.data_finalizado AT TIME ZONE 'America/Sao_Paulo')::date <= $${paramCount}::date`;
            params.push(dataFim);
        }

        // Filtro por laboratório
        if (laboratorioId) {
            paramCount++;
            query += ` AND cp.laboratorio_id = $${paramCount}`;
            params.push(parseInt(laboratorioId));
        }

        // Filtro por profissional
        if (profissionalId) {
            paramCount++;
            query += ` AND cp.profissional_id = $${paramCount}`;
            params.push(parseInt(profissionalId));
        }

        query += ' ORDER BY cp.data_finalizado DESC';

        const result = await pool.query(query, params);

        const registros = result.rows.map(r => ({
            id: r.id.toString(),
            codigo: r.codigo,
            tipoTrabalho: r.tipo_trabalho,
            tipoTrabalhoDetalhe: r.tipo_trabalho_detalhe,
            dentes: r.dentes || [],
            qtdDentes: (r.dentes || []).length,
            material: r.material,
            valorCusto: r.valor_custo ? parseFloat(r.valor_custo) : null,
            dataFinalizado: r.data_finalizado,
            criadoEm: r.criado_em,
            pacienteNome: r.paciente_nome,
            laboratorioId: r.lab_id ? r.lab_id.toString() : null,
            laboratorioNome: r.laboratorio_nome,
            profissionalId: r.prof_id ? r.prof_id.toString() : null,
            profissionalNome: r.profissional_nome
        }));

        // Calcular totais
        const total = registros.reduce((sum, r) => sum + (r.valorCusto || 0), 0);
        
        // Totais por laboratório
        const porLaboratorio = {};
        registros.forEach(r => {
            if (r.laboratorioNome) {
                if (!porLaboratorio[r.laboratorioNome]) {
                    porLaboratorio[r.laboratorioNome] = { total: 0, quantidade: 0 };
                }
                porLaboratorio[r.laboratorioNome].total += r.valorCusto || 0;
                porLaboratorio[r.laboratorioNome].quantidade++;
            }
        });

        // Totais por profissional
        const porProfissional = {};
        registros.forEach(r => {
            if (r.profissionalNome) {
                if (!porProfissional[r.profissionalNome]) {
                    porProfissional[r.profissionalNome] = { total: 0, quantidade: 0 };
                }
                porProfissional[r.profissionalNome].total += r.valorCusto || 0;
                porProfissional[r.profissionalNome].quantidade++;
            }
        });

        res.json({ 
            success: true, 
            registros,
            resumo: {
                total,
                quantidade: registros.length,
                porLaboratorio,
                porProfissional
            }
        });
    } catch (error) {
        console.error('Erro ao listar finanças:', error);
        res.status(500).json({ success: false, erro: 'Erro ao listar finanças' });
    }
});

// ==============================================================================
// ROTAS DE CASOS PROTÉTICOS
// ==============================================================================

// Função para gerar código do caso
async function gerarCodigoCaso(dentistaId) {
    const ano = new Date().getFullYear();
    
    // Gerar código aleatório (6 caracteres alfanuméricos)
    function gerarAleatorio() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sem I, O, 0, 1 para evitar confusão
        let codigo = '';
        for (let i = 0; i < 6; i++) {
            codigo += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return `CP-${ano}-${codigo}`;
    }
    
    // Tentar gerar código único
    let tentativas = 0;
    while (tentativas < 10) {
        const codigo = gerarAleatorio();
        const existe = await pool.query(
            'SELECT id FROM casos_proteticos WHERE codigo = $1',
            [codigo]
        );
        if (existe.rows.length === 0) {
            return codigo;
        }
        tentativas++;
    }
    
    // Fallback extremo: usar timestamp
    return `CP-${ano}-${Date.now()}`;
}

// Listar casos
app.get('/api/casos-proteticos', authMiddleware, async (req, res) => {
    try {
        const { status, laboratorio_id, paciente_id, profissional_id, urgencia, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT cp.*, p.nome as paciente_nome, l.nome as laboratorio_nome, l.whatsapp as laboratorio_whatsapp,
                prof.nome as profissional_nome, prof.icone as profissional_icone,
                (SELECT COUNT(*) FROM casos_arquivos WHERE caso_id = cp.id) as total_arquivos,
                (SELECT COUNT(*) FROM casos_mensagens WHERE caso_id = cp.id AND lida = false AND remetente_tipo = 'laboratorio') as mensagens_nao_lidas
            FROM casos_proteticos cp
            LEFT JOIN pacientes p ON p.id = cp.paciente_id
            LEFT JOIN laboratorios l ON l.id = cp.laboratorio_id
            LEFT JOIN profissionais prof ON prof.id = cp.profissional_id
            WHERE cp.dentista_id = $1
        `;
        let params = [parseInt(req.user.id)];
        let paramIndex = 2;

        if (status) { query += ` AND cp.status = $${paramIndex}`; params.push(status); paramIndex++; }
        if (laboratorio_id) { query += ` AND cp.laboratorio_id = $${paramIndex}`; params.push(parseInt(laboratorio_id)); paramIndex++; }
        if (paciente_id) { query += ` AND cp.paciente_id = $${paramIndex}`; params.push(parseInt(paciente_id)); paramIndex++; }
        if (profissional_id) { query += ` AND cp.profissional_id = $${paramIndex}`; params.push(parseInt(profissional_id)); paramIndex++; }
        if (urgencia) { query += ` AND cp.urgencia = $${paramIndex}`; params.push(urgencia); paramIndex++; }

        query += ` ORDER BY cp.criado_em DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(query, params);

        // Stats
        const statsResult = await pool.query(`
            SELECT COUNT(*) as total,
                COUNT(CASE WHEN status NOT IN ('finalizado', 'cancelado') THEN 1 END) as em_andamento,
                COUNT(CASE WHEN status = 'finalizado' THEN 1 END) as finalizados,
                COUNT(CASE WHEN data_prometida < CURRENT_DATE AND status NOT IN ('finalizado', 'cancelado') THEN 1 END) as atrasados,
                COUNT(CASE WHEN urgencia IN ('urgente', 'emergencial') AND status NOT IN ('finalizado', 'cancelado') THEN 1 END) as urgentes
            FROM casos_proteticos WHERE dentista_id = $1
        `, [parseInt(req.user.id)]);

        const casos = result.rows.map(c => ({
            id: c.id.toString(),
            codigo: c.codigo,
            grupoId: c.grupo_id || null,
            pacienteId: c.paciente_id?.toString(),
            pacienteNome: c.paciente_nome,
            laboratorioId: c.laboratorio_id?.toString(),
            laboratorioNome: c.laboratorio_nome,
            laboratorioWhatsapp: c.laboratorio_whatsapp,
            profissionalId: c.profissional_id?.toString(),
            profissionalNome: c.profissional_nome,
            profissionalIcone: c.profissional_icone,
            tipoTrabalho: c.tipo_trabalho,
            tipoTrabalhoDetalhe: c.tipo_trabalho_detalhe,
            tipoPeca: c.tipo_peca,
            dentes: c.dentes || [],
            material: c.material,
            tecnica: c.tecnica,
            corShade: c.cor_shade,
            escalaCor: c.escala_cor,
            urgencia: c.urgencia,
            dataEnvio: c.data_envio,
            dataPrometida: c.data_prometida,
            dataRetornoReal: c.data_retorno_real,
            status: c.status,
            observacoesClinics: c.observacoes_clinicas,
            observacoesTecnicas: c.observacoes_tecnicas,
            urlArquivos: c.url_arquivos,
            valorCombinado: c.valor_combinado,
            valorCusto: c.valor_custo ? parseFloat(c.valor_custo) : null,
            dataFinalizado: c.data_finalizado,
            totalArquivos: parseInt(c.total_arquivos) || 0,
            mensagensNaoLidas: parseInt(c.mensagens_nao_lidas) || 0,
            criadoEm: c.criado_em,
            atualizadoEm: c.atualizado_em
        }));

        res.json({
            success: true,
            casos,
            stats: {
                total: parseInt(statsResult.rows[0].total) || 0,
                emAndamento: parseInt(statsResult.rows[0].em_andamento) || 0,
                finalizados: parseInt(statsResult.rows[0].finalizados) || 0,
                atrasados: parseInt(statsResult.rows[0].atrasados) || 0,
                urgentes: parseInt(statsResult.rows[0].urgentes) || 0
            }
        });
    } catch (error) {
        console.error('Erro ao listar casos:', error);
        res.status(500).json({ success: false, erro: 'Erro ao listar casos' });
    }
});

// Obter caso específico
app.get('/api/casos-proteticos/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const casoResult = await pool.query(`
            SELECT cp.*, p.nome as paciente_nome, COALESCE(p.celular, p.telefone) as paciente_telefone,
                l.nome as laboratorio_nome, l.telefone as laboratorio_telefone, l.whatsapp as laboratorio_whatsapp
            FROM casos_proteticos cp
            LEFT JOIN pacientes p ON p.id = cp.paciente_id
            LEFT JOIN laboratorios l ON l.id = cp.laboratorio_id
            WHERE cp.id = $1 AND cp.dentista_id = $2
        `, [parseInt(id), parseInt(req.user.id)]);

        if (casoResult.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Caso não encontrado' });
        }

        const c = casoResult.rows[0];
        const arquivosResult = await pool.query('SELECT * FROM casos_arquivos WHERE caso_id = $1 ORDER BY criado_em DESC', [parseInt(id)]);
        const historicoResult = await pool.query('SELECT * FROM casos_status_historico WHERE caso_id = $1 ORDER BY criado_em DESC', [parseInt(id)]);
        const mensagensResult = await pool.query('SELECT * FROM casos_mensagens WHERE caso_id = $1 ORDER BY criado_em ASC', [parseInt(id)]);

        res.json({
            success: true,
            caso: {
                id: c.id.toString(),
                codigo: c.codigo,
                pacienteId: c.paciente_id?.toString(),
                pacienteNome: c.paciente_nome,
                laboratorioId: c.laboratorio_id?.toString(),
                laboratorioNome: c.laboratorio_nome,
                laboratorioWhatsapp: c.laboratorio_whatsapp,
                tipoTrabalho: c.tipo_trabalho,
                dentes: c.dentes || [],
                material: c.material,
                tecnica: c.tecnica,
                corShade: c.cor_shade,
                urgencia: c.urgencia,
                dataEnvio: c.data_envio,
                dataPrometida: c.data_prometida,
                status: c.status,
                observacoesClinics: c.observacoes_clinicas,
                valorCombinado: c.valor_combinado,
                criadoEm: c.criado_em
            },
            arquivos: arquivosResult.rows.map(a => ({
                id: a.id.toString(),
                tipoArquivo: a.tipo_arquivo,
                nomeArquivo: a.nome_arquivo,
                urlArquivo: a.url_arquivo,
                versao: a.versao,
                criadoEm: a.criado_em
            })),
            historico: historicoResult.rows.map(h => ({
                id: h.id.toString(),
                statusAnterior: h.status_anterior,
                statusNovo: h.status_novo,
                alteradoPor: h.alterado_por,
                observacao: h.observacao,
                criadoEm: h.criado_em
            })),
            mensagens: mensagensResult.rows.map(m => ({
                id: m.id.toString(),
                remetenteTipo: m.remetente_tipo,
                remetenteNome: m.remetente_nome,
                mensagem: m.mensagem,
                lida: m.lida,
                criadoEm: m.criado_em
            }))
        });
    } catch (error) {
        console.error('Erro ao obter caso:', error);
        res.status(500).json({ success: false, erro: 'Erro ao obter caso' });
    }
});

// Criar caso
app.post('/api/casos-proteticos', authMiddleware, async (req, res) => {
    try {
        const { pacienteId, laboratorioId, profissionalId, tipoTrabalho, tipoTrabalhoDetalhe, tipoPeca, dentes, material, materialDetalhe, tecnica, corShade, escalaCor, urgencia, dataEnvio, dataPrometida, observacoesClinics, observacoesTecnicas, urlArquivos, valorCombinado, valorCusto, grupoId } = req.body;

        if (!pacienteId || !tipoTrabalho) {
            return res.status(400).json({ success: false, erro: 'Paciente e tipo de trabalho são obrigatórios' });
        }

        const codigo = await gerarCodigoCaso(parseInt(req.user.id));

        const result = await pool.query(`
            INSERT INTO casos_proteticos (dentista_id, profissional_id, paciente_id, laboratorio_id, codigo, tipo_trabalho, tipo_trabalho_detalhe, tipo_peca, dentes, material, material_detalhe, tecnica, cor_shade, escala_cor, urgencia, data_envio, data_prometida, observacoes_clinicas, observacoes_tecnicas, url_arquivos, valor_combinado, valor_custo, grupo_id, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, 'criado') RETURNING *
        `, [parseInt(req.user.id), profissionalId ? parseInt(profissionalId) : null, parseInt(pacienteId), laboratorioId ? parseInt(laboratorioId) : null, codigo, tipoTrabalho, tipoTrabalhoDetalhe || null, tipoPeca || 'definitiva', dentes || [], material || null, materialDetalhe || null, tecnica || 'convencional', corShade || null, escalaCor || null, urgencia || 'normal', dataEnvio || null, dataPrometida || null, observacoesClinics || null, observacoesTecnicas || null, urlArquivos || null, valorCombinado || null, valorCusto || null, grupoId || null]);

        // Registrar no histórico
        await pool.query(`INSERT INTO casos_status_historico (caso_id, status_novo, alterado_por, tipo_usuario, observacao) VALUES ($1, 'criado', $2, 'dentista', 'Caso criado')`, [result.rows[0].id, req.user.nome || 'Dentista']);

        res.json({ success: true, caso: { id: result.rows[0].id.toString(), codigo, grupoId: grupoId || null } });
    } catch (error) {
        console.error('Erro ao criar caso:', error);
        res.status(500).json({ success: false, erro: 'Erro ao criar caso' });
    }
});

// Buscar casos protéticos de um paciente específico (para Prontuário)
app.get('/api/pacientes/:pacienteId/casos-proteticos', authMiddleware, async (req, res) => {
    try {
        const { pacienteId } = req.params;
        const { status } = req.query; // opcional: filtrar por status
        
        let query = `
            SELECT cp.*, 
                l.nome as laboratorio_nome,
                prof.nome as profissional_nome
            FROM casos_proteticos cp
            LEFT JOIN laboratorios l ON l.id = cp.laboratorio_id
            LEFT JOIN profissionais prof ON prof.id = cp.profissional_id
            WHERE cp.dentista_id = $1 AND cp.paciente_id = $2
        `;
        let params = [parseInt(req.user.id), parseInt(pacienteId)];
        
        if (status) {
            query += ` AND cp.status = $3`;
            params.push(status);
        }
        
        query += ` ORDER BY cp.criado_em DESC`;
        
        const result = await pool.query(query, params);
        
        const casos = result.rows.map(c => ({
            id: c.id.toString(),
            codigo: c.codigo,
            profissionalNome: c.profissional_nome,
            laboratorioNome: c.laboratorio_nome,
            tipoTrabalho: c.tipo_trabalho,
            tipoTrabalhoDetalhe: c.tipo_trabalho_detalhe,
            dentes: c.dentes || [],
            material: c.material,
            corShade: c.cor_shade,
            urgencia: c.urgencia,
            dataEnvio: c.data_envio,
            dataPrometida: c.data_prometida,
            dataRetornoReal: c.data_retorno_real,
            status: c.status,
            observacoesClinics: c.observacoes_clinicas,
            valorCombinado: c.valor_combinado,
            valorPago: c.valor_pago,
            criadoEm: c.criado_em,
            atualizadoEm: c.atualizado_em
        }));
        
        // Estatísticas
        const stats = {
            total: casos.length,
            finalizados: casos.filter(c => c.status === 'finalizado').length,
            emAndamento: casos.filter(c => c.status !== 'finalizado' && c.status !== 'cancelado').length
        };
        
        res.json({ success: true, casos, stats });
    } catch (error) {
        console.error('Erro ao buscar casos do paciente:', error);
        res.status(500).json({ success: false, erro: 'Erro ao buscar casos' });
    }
});

// Atualizar caso
app.put('/api/casos-proteticos/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { laboratorioId, tipoTrabalho, tipoTrabalhoDetalhe, tipoPeca, dentes, material, materialDetalhe, tecnica, corShade, escalaCor, urgencia, dataEnvio, dataPrometida, dataRetornoReal, observacoesClinics, observacoesTecnicas, urlArquivos, valorCombinado, valorPago } = req.body;

        const result = await pool.query(`
            UPDATE casos_proteticos SET laboratorio_id = $1, tipo_trabalho = COALESCE($2, tipo_trabalho), tipo_trabalho_detalhe = $3, tipo_peca = COALESCE($4, tipo_peca), dentes = $5, material = $6, material_detalhe = $7, tecnica = $8, cor_shade = $9, escala_cor = $10, urgencia = $11, data_envio = $12, data_prometida = $13, data_retorno_real = $14, observacoes_clinicas = $15, observacoes_tecnicas = $16, url_arquivos = $17, valor_combinado = $18, valor_pago = $19, atualizado_em = CURRENT_TIMESTAMP
            WHERE id = $20 AND dentista_id = $21 RETURNING *
        `, [laboratorioId ? parseInt(laboratorioId) : null, tipoTrabalho, tipoTrabalhoDetalhe || null, tipoPeca || null, dentes || [], material || null, materialDetalhe || null, tecnica || 'convencional', corShade || null, escalaCor || null, urgencia || 'normal', dataEnvio || null, dataPrometida || null, dataRetornoReal || null, observacoesClinics || null, observacoesTecnicas || null, urlArquivos || null, valorCombinado || null, valorPago || null, parseInt(id), parseInt(req.user.id)]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Caso não encontrado' });
        }

        res.json({ success: true, message: 'Caso atualizado!' });
    } catch (error) {
        console.error('Erro ao atualizar caso:', error);
        res.status(500).json({ success: false, erro: 'Erro ao atualizar caso' });
    }
});

// Atualizar status do caso
app.put('/api/casos-proteticos/:id/status', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, observacao, valorCusto } = req.body;

        const statusValidos = ['criado', 'aguardando_envio', 'enviado_lab', 'em_design', 'em_producao', 'em_acabamento', 'em_transporte', 'recebido_clinica', 'prova_clinica', 'ajuste_solicitado', 'retrabalho', 'devolvido', 'finalizado', 'cancelado'];

        if (!statusValidos.includes(status)) {
            return res.status(400).json({ success: false, erro: 'Status inválido' });
        }

        const casoAtual = await pool.query('SELECT status FROM casos_proteticos WHERE id = $1 AND dentista_id = $2', [parseInt(id), parseInt(req.user.id)]);
        if (casoAtual.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Caso não encontrado' });
        }

        const statusAnterior = casoAtual.rows[0].status;

        let updateQuery = 'UPDATE casos_proteticos SET status = $1, atualizado_em = CURRENT_TIMESTAMP';
        const params = [status];
        let paramCount = 1;

        // Quando finaliza, gravar data de finalização
        if (status === 'finalizado') {
            updateQuery += ', data_retorno_real = COALESCE(data_retorno_real, CURRENT_DATE)';
            updateQuery += ', data_finalizado = CURRENT_TIMESTAMP';
        }

        // Atualizar custo se informado
        if (valorCusto !== undefined) {
            paramCount++;
            updateQuery += `, valor_custo = $${paramCount}`;
            params.push(parseFloat(valorCusto));
        }

        paramCount++;
        updateQuery += ` WHERE id = $${paramCount}`;
        params.push(parseInt(id));
        
        paramCount++;
        updateQuery += ` AND dentista_id = $${paramCount}`;
        params.push(parseInt(req.user.id));

        await pool.query(updateQuery, params);
        await pool.query(`INSERT INTO casos_status_historico (caso_id, status_anterior, status_novo, alterado_por, tipo_usuario, observacao) VALUES ($1, $2, $3, $4, 'dentista', $5)`, [parseInt(id), statusAnterior, status, req.user.nome || 'Dentista', observacao || null]);

        res.json({ success: true, message: 'Status atualizado!' });
    } catch (error) {
        console.error('Erro ao atualizar status:', error);
        res.status(500).json({ success: false, erro: 'Erro ao atualizar status' });
    }
});

// Atualizar custo do caso
app.put('/api/casos-proteticos/:id/custo', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { valorCusto } = req.body;

        if (valorCusto === undefined) {
            return res.status(400).json({ success: false, erro: 'Valor do custo é obrigatório' });
        }

        const result = await pool.query(
            `UPDATE casos_proteticos SET valor_custo = $1, atualizado_em = CURRENT_TIMESTAMP 
             WHERE id = $2 AND dentista_id = $3 RETURNING *`,
            [parseFloat(valorCusto), parseInt(id), parseInt(req.user.id)]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Caso não encontrado' });
        }

        res.json({ success: true, message: 'Custo atualizado!', valorCusto: parseFloat(valorCusto) });
    } catch (error) {
        console.error('Erro ao atualizar custo:', error);
        res.status(500).json({ success: false, erro: 'Erro ao atualizar custo' });
    }
});

// Cancelar caso
app.delete('/api/casos-proteticos/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query(`UPDATE casos_proteticos SET status = 'cancelado', atualizado_em = CURRENT_TIMESTAMP WHERE id = $1 AND dentista_id = $2`, [parseInt(id), parseInt(req.user.id)]);
        await pool.query(`INSERT INTO casos_status_historico (caso_id, status_novo, alterado_por, tipo_usuario, observacao) VALUES ($1, 'cancelado', $2, 'dentista', 'Caso cancelado')`, [parseInt(id), req.user.nome || 'Dentista']);
        res.json({ success: true, message: 'Caso cancelado!' });
    } catch (error) {
        console.error('Erro ao cancelar caso:', error);
        res.status(500).json({ success: false, erro: 'Erro ao cancelar caso' });
    }
});

// Enviar mensagem no caso
app.post('/api/casos-proteticos/:id/mensagens', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { mensagem } = req.body;

        if (!mensagem) {
            return res.status(400).json({ success: false, erro: 'Mensagem é obrigatória' });
        }

        const casoCheck = await pool.query('SELECT id FROM casos_proteticos WHERE id = $1 AND dentista_id = $2', [parseInt(id), parseInt(req.user.id)]);
        if (casoCheck.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Caso não encontrado' });
        }

        const result = await pool.query(`INSERT INTO casos_mensagens (caso_id, remetente_tipo, remetente_nome, mensagem) VALUES ($1, 'dentista', $2, $3) RETURNING *`, [parseInt(id), req.user.nome || 'Dentista', mensagem]);

        res.json({
            success: true,
            mensagem: {
                id: result.rows[0].id.toString(),
                remetenteTipo: result.rows[0].remetente_tipo,
                remetenteNome: result.rows[0].remetente_nome,
                mensagem: result.rows[0].mensagem,
                criadoEm: result.rows[0].criado_em
            }
        });
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        res.status(500).json({ success: false, erro: 'Erro ao enviar mensagem' });
    }
});

// ==============================================================================
// ROTAS PREFEITURAS NFS-e
// ==============================================================================

// Templates de prefeituras pré-cadastradas (dados técnicos já configurados)
const TEMPLATES_PREFEITURAS = [
    {
        id: 'pomerode-sc',
        cidade: 'Pomerode',
        uf: 'SC',
        codigo_tom: '8273',
        sistema: 'ipm',
        url_webservice: 'https://ws-pomerode.atende.net:7443/?pg=rest&service=WNERestServiceNFSe',
        serie_nfse: '1',
        ambiente: 'producao',
        aliquota_iss: 3.00,
        codigo_servico: '8630504',
        item_lista_servico: '4.11',
        codigo_nbs: '1.1101.30.00',
        situacao_tributaria: '1',
        cst_ibs_cbs: '200',
        class_trib: '200028',
        fin_nfse: '0',
        ind_final: '1',
        c_ind_op: '030102',
        aliquota_ibs_uf: 0.1,
        aliquota_ibs_mun: 0,
        aliquota_cbs: 0.9,
        tipo_retencao: '2',
        aliquota_pis: 0.65,
        aliquota_cofins: 3.00
    },
    {
        id: 'sao-paulo-sp',
        cidade: 'São Paulo',
        uf: 'SP',
        codigo_tom: '7107',
        sistema: 'nfpaulistana',
        url_webservice: 'https://nfe.prefeitura.sp.gov.br/ws/lotenfe.asmx',
        serie_nfse: 'RPS',
        ambiente: 'producao',
        aliquota_iss: 5.00,
        codigo_servico: '05762',
        item_lista_servico: '4.11',
        codigo_nbs: '1.1101.30.00',
        situacao_tributaria: '1',
        cst_ibs_cbs: '200',
        class_trib: '200028',
        fin_nfse: '0',
        ind_final: '1',
        c_ind_op: '030102',
        aliquota_ibs_uf: 0.1,
        aliquota_ibs_mun: 0,
        aliquota_cbs: 0.9,
        tipo_retencao: '2',
        aliquota_pis: 0.65,
        aliquota_cofins: 3.00
    },
    {
        id: 'blumenau-sc',
        cidade: 'Blumenau',
        uf: 'SC',
        codigo_tom: '8059',
        sistema: 'ipm',
        url_webservice: 'https://ws-blumenau.atende.net:7443/?pg=rest&service=WNERestServiceNFSe',
        serie_nfse: '1',
        ambiente: 'producao',
        aliquota_iss: 3.00,
        codigo_servico: '8630504',
        item_lista_servico: '4.11',
        codigo_nbs: '1.1101.30.00',
        situacao_tributaria: '1',
        cst_ibs_cbs: '200',
        class_trib: '200028',
        fin_nfse: '0',
        ind_final: '1',
        c_ind_op: '030102',
        aliquota_ibs_uf: 0.1,
        aliquota_ibs_mun: 0,
        aliquota_cbs: 0.9,
        tipo_retencao: '2',
        aliquota_pis: 0.65,
        aliquota_cofins: 3.00
    },
    {
        id: 'joinville-sc',
        cidade: 'Joinville',
        uf: 'SC',
        codigo_tom: '8179',
        sistema: 'ipm',
        url_webservice: 'https://ws-joinville.atende.net:7443/?pg=rest&service=WNERestServiceNFSe',
        serie_nfse: '1',
        ambiente: 'producao',
        aliquota_iss: 3.00,
        codigo_servico: '8630504',
        item_lista_servico: '4.11',
        codigo_nbs: '1.1101.30.00',
        situacao_tributaria: '1',
        cst_ibs_cbs: '200',
        class_trib: '200028',
        fin_nfse: '0',
        ind_final: '1',
        c_ind_op: '030102',
        aliquota_ibs_uf: 0.1,
        aliquota_ibs_mun: 0,
        aliquota_cbs: 0.9,
        tipo_retencao: '2',
        aliquota_pis: 0.65,
        aliquota_cofins: 3.00
    },
    {
        id: 'florianopolis-sc',
        cidade: 'Florianópolis',
        uf: 'SC',
        codigo_tom: '8105',
        sistema: 'betha',
        url_webservice: 'https://e-gov.betha.com.br/e-nota-contribuinte-ws/nfseWS',
        serie_nfse: '1',
        ambiente: 'producao',
        aliquota_iss: 3.00,
        codigo_servico: '8630504',
        item_lista_servico: '4.11',
        codigo_nbs: '1.1101.30.00',
        situacao_tributaria: '1',
        cst_ibs_cbs: '200',
        class_trib: '200028',
        fin_nfse: '0',
        ind_final: '1',
        c_ind_op: '030102',
        aliquota_ibs_uf: 0.1,
        aliquota_ibs_mun: 0,
        aliquota_cbs: 0.9,
        tipo_retencao: '2',
        aliquota_pis: 0.65,
        aliquota_cofins: 3.00
    },
    {
        id: 'curitiba-pr',
        cidade: 'Curitiba',
        uf: 'PR',
        codigo_tom: '7535',
        sistema: 'curitiba',
        url_webservice: 'https://isscuritiba.curitiba.pr.gov.br/Iss.NfseWebService/nfsews.asmx',
        serie_nfse: '1',
        ambiente: 'producao',
        aliquota_iss: 5.00,
        codigo_servico: '4110',
        item_lista_servico: '4.11',
        codigo_nbs: '1.1101.30.00',
        situacao_tributaria: '1',
        cst_ibs_cbs: '200',
        class_trib: '200028',
        fin_nfse: '0',
        ind_final: '1',
        c_ind_op: '030102',
        aliquota_ibs_uf: 0.1,
        aliquota_ibs_mun: 0,
        aliquota_cbs: 0.9,
        tipo_retencao: '2',
        aliquota_pis: 0.65,
        aliquota_cofins: 3.00
    }
];

// GET - Listar templates de prefeituras disponíveis
app.get('/api/prefeituras/templates', (req, res) => {
    res.json({
        success: true,
        templates: TEMPLATES_PREFEITURAS.map(t => ({
            id: t.id,
            cidade: t.cidade,
            uf: t.uf,
            sistema: t.sistema
        }))
    });
});

// GET - Obter template completo por ID
app.get('/api/prefeituras/templates/:id', (req, res) => {
    const template = TEMPLATES_PREFEITURAS.find(t => t.id === req.params.id);
    if (!template) {
        return res.status(404).json({ success: false, erro: 'Template não encontrado' });
    }
    res.json({ success: true, template });
});

// GET - Listar prefeituras configuradas do dentista
app.get('/api/prefeituras', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, cidade, uf, codigo_tom, sistema, url_webservice, cpf_cnpj_prestador,
                   serie_nfse, ambiente, exige_certificado, aliquota_iss, codigo_servico,
                   item_lista_servico, codigo_nbs, situacao_tributaria, cst_ibs_cbs,
                   class_trib, fin_nfse, ind_final, c_ind_op, aliquota_ibs_uf,
                   aliquota_ibs_mun, aliquota_cbs, reducao_aliquota, redutor_gov,
                   tipo_retencao, aliquota_pis, aliquota_cofins, ativo, criado_em
            FROM config_prefeituras 
            WHERE dentista_id = $1 
            ORDER BY cidade
        `, [req.dentistaId]);
        
        res.json({ success: true, prefeituras: result.rows });
    } catch (error) {
        console.error('Erro ao listar prefeituras:', error);
        res.status(500).json({ success: false, erro: error.message });
    }
});

// GET - Obter prefeitura específica
app.get('/api/prefeituras/:id', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM config_prefeituras 
            WHERE id = $1 AND dentista_id = $2
        `, [req.params.id, req.dentistaId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Prefeitura não encontrada' });
        }
        
        res.json({ success: true, prefeitura: result.rows[0] });
    } catch (error) {
        console.error('Erro ao obter prefeitura:', error);
        res.status(500).json({ success: false, erro: error.message });
    }
});

// POST - Salvar nova prefeitura
app.post('/api/prefeituras', authMiddleware, async (req, res) => {
    try {
        const {
            cidade, uf, codigo_tom, sistema, url_webservice, cpf_cnpj_prestador,
            senha_webservice, serie_nfse, ambiente, exige_certificado,
            aliquota_iss, codigo_servico, item_lista_servico, codigo_trib_nacional, codigo_nbs,
            situacao_tributaria, cst_ibs_cbs, class_trib, fin_nfse, ind_final,
            c_ind_op, aliquota_ibs_uf, aliquota_ibs_mun, aliquota_cbs,
            reducao_aliquota, redutor_gov, tipo_retencao, aliquota_pis, aliquota_cofins
        } = req.body;
        
        if (!cidade || !uf || !url_webservice) {
            return res.status(400).json({ success: false, erro: 'Cidade, UF e URL são obrigatórios' });
        }
        
        const result = await pool.query(`
            INSERT INTO config_prefeituras (
                dentista_id, cidade, uf, codigo_tom, sistema, url_webservice,
                cpf_cnpj_prestador, senha_webservice, serie_nfse, ambiente, exige_certificado,
                aliquota_iss, codigo_servico, item_lista_servico, codigo_trib_nacional, codigo_nbs,
                situacao_tributaria, cst_ibs_cbs, class_trib, fin_nfse, ind_final,
                c_ind_op, aliquota_ibs_uf, aliquota_ibs_mun, aliquota_cbs,
                reducao_aliquota, redutor_gov, tipo_retencao, aliquota_pis, aliquota_cofins
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
            RETURNING id
        `, [
            req.dentistaId, cidade, uf, codigo_tom, sistema || 'ipm', url_webservice,
            cpf_cnpj_prestador, senha_webservice, serie_nfse || '1', ambiente || 'producao',
            exige_certificado || false, aliquota_iss, codigo_servico, item_lista_servico,
            codigo_trib_nacional || '041201', codigo_nbs, situacao_tributaria, cst_ibs_cbs, class_trib, fin_nfse, ind_final,
            c_ind_op, aliquota_ibs_uf, aliquota_ibs_mun, aliquota_cbs,
            reducao_aliquota, redutor_gov, tipo_retencao, aliquota_pis, aliquota_cofins
        ]);
        
        res.json({ success: true, id: result.rows[0].id, mensagem: 'Prefeitura salva com sucesso!' });
    } catch (error) {
        console.error('Erro ao salvar prefeitura:', error);
        res.status(500).json({ success: false, erro: error.message });
    }
});

// PUT - Atualizar prefeitura
app.put('/api/prefeituras/:id', authMiddleware, async (req, res) => {
    try {
        const {
            cidade, uf, codigo_tom, sistema, url_webservice, cpf_cnpj_prestador,
            senha_webservice, serie_nfse, ambiente, exige_certificado,
            aliquota_iss, codigo_servico, item_lista_servico, codigo_trib_nacional, codigo_nbs,
            situacao_tributaria, cst_ibs_cbs, class_trib, fin_nfse, ind_final,
            c_ind_op, aliquota_ibs_uf, aliquota_ibs_mun, aliquota_cbs,
            reducao_aliquota, redutor_gov, tipo_retencao, aliquota_pis, aliquota_cofins
        } = req.body;
        
        // Monta query dinâmica (não atualiza senha se não foi enviada)
        let query = `
            UPDATE config_prefeituras SET
                cidade = $1, uf = $2, codigo_tom = $3, sistema = $4, url_webservice = $5,
                cpf_cnpj_prestador = $6, serie_nfse = $7, ambiente = $8, exige_certificado = $9,
                aliquota_iss = $10, codigo_servico = $11, item_lista_servico = $12, 
                codigo_trib_nacional = $13, codigo_nbs = $14,
                situacao_tributaria = $15, cst_ibs_cbs = $16, class_trib = $17, fin_nfse = $18,
                ind_final = $19, c_ind_op = $20, aliquota_ibs_uf = $21, aliquota_ibs_mun = $22,
                aliquota_cbs = $23, reducao_aliquota = $24, redutor_gov = $25, tipo_retencao = $26,
                aliquota_pis = $27, aliquota_cofins = $28, atualizado_em = CURRENT_TIMESTAMP
        `;
        
        let params = [
            cidade, uf, codigo_tom, sistema, url_webservice, cpf_cnpj_prestador,
            serie_nfse, ambiente, exige_certificado, aliquota_iss, codigo_servico,
            item_lista_servico, codigo_trib_nacional || '041201', codigo_nbs, 
            situacao_tributaria, cst_ibs_cbs, class_trib,
            fin_nfse, ind_final, c_ind_op, aliquota_ibs_uf, aliquota_ibs_mun, aliquota_cbs,
            reducao_aliquota, redutor_gov, tipo_retencao, aliquota_pis, aliquota_cofins
        ];
        
        // Se senha foi enviada, atualiza também
        if (senha_webservice) {
            query += `, senha_webservice = $29 WHERE id = $30 AND dentista_id = $31`;
            params.push(senha_webservice, req.params.id, req.dentistaId);
        } else {
            query += ` WHERE id = $29 AND dentista_id = $30`;
            params.push(req.params.id, req.dentistaId);
        }
        
        const result = await pool.query(query, params);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, erro: 'Prefeitura não encontrada' });
        }
        
        res.json({ success: true, mensagem: 'Prefeitura atualizada!' });
    } catch (error) {
        console.error('Erro ao atualizar prefeitura:', error);
        res.status(500).json({ success: false, erro: error.message });
    }
});

// DELETE - Excluir prefeitura
app.delete('/api/prefeituras/:id', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(`
            DELETE FROM config_prefeituras WHERE id = $1 AND dentista_id = $2
        `, [req.params.id, req.dentistaId]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, erro: 'Prefeitura não encontrada' });
        }
        
        res.json({ success: true, mensagem: 'Prefeitura excluída!' });
    } catch (error) {
        console.error('Erro ao excluir prefeitura:', error);
        res.status(500).json({ success: false, erro: error.message });
    }
});

// ==============================================================================
// TESTE DE CONEXÃO NFS-e (IPM/Atende.Net)
// ==============================================================================

app.post('/api/nfse/testar-conexao', authMiddleware, async (req, res) => {
    const { url_webservice, cpf_cnpj_prestador, senha_webservice } = req.body;
    
    if (!url_webservice || !cpf_cnpj_prestador || !senha_webservice) {
        return res.status(400).json({ 
            sucesso: false, 
            erro: 'URL, CPF/CNPJ e Senha são obrigatórios' 
        });
    }
    
    console.log('[CONN] Testando conexão NFS-e:', url_webservice);
    
    try {
        // Para IPM/Atende.Net, fazemos uma consulta simples de verificação
        const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<ConsultarNfseRpsEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
    <IdentificacaoRps>
        <Numero>0</Numero>
        <Serie>TESTE</Serie>
        <Tipo>1</Tipo>
    </IdentificacaoRps>
    <Prestador>
        <CpfCnpj>
            ${cpf_cnpj_prestador.length === 11 ? `<Cpf>${cpf_cnpj_prestador}</Cpf>` : `<Cnpj>${cpf_cnpj_prestador}</Cnpj>`}
        </CpfCnpj>
    </Prestador>
</ConsultarNfseRpsEnvio>`;
        
        // Determinar se é sistema IPM pelo URL
        const isIPM = url_webservice.includes('atende.net');
        
        if (isIPM) {
            // IPM usa REST com autenticação via headers
            const response = await axios.post(url_webservice, xmlBody, {
                headers: {
                    'Content-Type': 'application/xml',
                    'usuario': cpf_cnpj_prestador,
                    'senha': senha_webservice
                },
                timeout: 15000,
                validateStatus: () => true // Aceita qualquer status para analisar a resposta
            });
            
            const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
            console.log('[RESP] Resposta IPM:', responseText.substring(0, 500));
            
            // Se recebeu resposta XML, conexão está ok (mesmo que seja erro de "RPS não encontrado")
            if (responseText.includes('<?xml') || responseText.includes('<')) {
                // Verificar se é erro de autenticação
                if (responseText.includes('Acesso negado') || responseText.includes('não autorizado') || responseText.includes('Unauthorized') || response.status === 401) {
                    return res.json({
                        sucesso: false,
                        erro: 'Credenciais inválidas. Verifique CPF/CNPJ e senha.',
                        detalhes: responseText.substring(0, 200)
                    });
                }
                
                // Conexão OK - pode ser "RPS não encontrado" mas isso é esperado
                return res.json({
                    sucesso: true,
                    mensagem: 'Conexão estabelecida com sucesso!',
                    prestador: cpf_cnpj_prestador,
                    servidor: 'IPM/Atende.Net',
                    resposta: responseText.substring(0, 200)
                });
            } else {
                return res.json({
                    sucesso: false,
                    erro: 'Resposta inesperada do servidor',
                    detalhes: responseText.substring(0, 200)
                });
            }
        } else {
            // Para outros sistemas (Betha, etc), fazemos um teste básico
            const response = await axios.get(url_webservice, {
                timeout: 10000,
                validateStatus: () => true
            });
            
            if (response.status === 200 || response.status === 405) {
                // 405 = Method Not Allowed é esperado para webservices SOAP
                return res.json({
                    sucesso: true,
                    mensagem: 'Servidor acessível! Configure os demais parâmetros conforme documentação.',
                    prestador: cpf_cnpj_prestador,
                    servidor: 'Detectado'
                });
            } else {
                const responseText = typeof response.data === 'string' ? response.data : '';
                return res.json({
                    sucesso: false,
                    erro: `Servidor retornou status ${response.status}`,
                    detalhes: responseText.substring(0, 200)
                });
            }
        }
        
    } catch (error) {
        console.error('[ERRO] Erro no teste de conexão:', error.message);
        
        let mensagemErro = 'Não foi possível conectar ao servidor.';
        
        if (error.code === 'ENOTFOUND') {
            mensagemErro = 'URL do servidor não encontrada. Verifique o endereço.';
        } else if (error.code === 'ECONNREFUSED') {
            mensagemErro = 'Conexão recusada pelo servidor.';
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
            mensagemErro = 'Tempo limite excedido. Servidor não respondeu.';
        } else if (error.message) {
            mensagemErro = error.message;
        }
        
        res.status(500).json({
            sucesso: false,
            erro: mensagemErro,
            detalhes: error.code || ''
        });
    }
});

// ==============================================================================
// ANAMNESE
// ==============================================================================

// GET - Buscar anamnese do paciente
app.get('/api/anamnese/:pacienteId', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM anamnese WHERE paciente_id = $1',
            [req.params.pacienteId]
        );
        if (result.rows.length > 0) {
            const row = result.rows[0];
            const dados = row.dados || {};
            // Merge odontofobia into dados for frontend compatibility
            dados.odontofobia = row.odontofobia || false;
            res.json({ success: true, anamnese: dados });
        } else {
            res.json({ success: true, anamnese: null });
        }
    } catch (error) {
        console.error('Erro anamnese GET:', error);
        res.status(500).json({ success: false, erro: error.message });
    }
});

// GET - Alertas da anamnese
app.get('/api/anamnese/:pacienteId/alertas', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT dados, odontofobia FROM anamnese WHERE paciente_id = $1',
            [req.params.pacienteId]
        );
        if (result.rows.length > 0) {
            const dados = result.rows[0].dados || {};
            dados.odontofobia = result.rows[0].odontofobia || false;
            res.json({ success: true, alertas: dados });
        } else {
            res.json({ success: true, alertas: null });
        }
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

// POST - Salvar anamnese
app.post('/api/anamnese', authMiddleware, async (req, res) => {
    try {
        const { pacienteId, ...dados } = req.body;
        if (!pacienteId) return res.status(400).json({ success: false, erro: 'pacienteId obrigatório' });
        const odontofobia = dados.odontofobia || false;
        delete dados.odontofobia;
        delete dados.pacienteId;

        const result = await pool.query(`
            INSERT INTO anamnese (paciente_id, dentista_id, dados, odontofobia, atualizado_em)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (paciente_id) DO UPDATE SET dados = $3, odontofobia = $4, atualizado_em = NOW()
            RETURNING id
        `, [pacienteId, req.dentistaId, JSON.stringify(dados), odontofobia]);

        res.json({ success: true, id: result.rows[0].id });
    } catch (error) {
        console.error('Erro anamnese POST:', error);
        res.status(500).json({ success: false, erro: error.message });
    }
});

// ==============================================================================
// ODONTOGRAMA GERAL
// ==============================================================================

app.get('/api/odontograma-geral/:pacienteId', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM odontograma_geral WHERE paciente_id = $1',
            [req.params.pacienteId]
        );
        if (result.rows.length > 0) {
            res.json({ success: true, odontograma: result.rows[0] });
        } else {
            res.json({ success: true, odontograma: null });
        }
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.post('/api/odontograma-geral', authMiddleware, async (req, res) => {
    try {
        const { pacienteId, dados } = req.body;
        if (!pacienteId) return res.status(400).json({ success: false, erro: 'pacienteId obrigatório' });

        const result = await pool.query(`
            INSERT INTO odontograma_geral (paciente_id, dados, atualizado_em)
            VALUES ($1, $2, NOW())
            ON CONFLICT (paciente_id) DO UPDATE SET dados = $2, atualizado_em = NOW()
            RETURNING id
        `, [pacienteId, JSON.stringify(dados)]);

        res.json({ success: true, id: result.rows[0].id });
    } catch (error) {
        console.error('Erro odontograma-geral POST:', error);
        res.status(500).json({ success: false, erro: error.message });
    }
});

// ==============================================================================
// PLANO DE TRATAMENTO
// ==============================================================================

// GET - Buscar plano do paciente
app.get('/api/plano-tratamento/:pacienteId', authMiddleware, async (req, res) => {
    try {
        const plano = await pool.query(
            'SELECT * FROM plano_tratamento WHERE paciente_id = $1 ORDER BY criado_em DESC LIMIT 1',
            [req.params.pacienteId]
        );
        if (plano.rows.length === 0) {
            return res.json({ success: true, plano: null, itens: [] });
        }
        const itens = await pool.query(
            'SELECT * FROM plano_tratamento_itens WHERE plano_id = $1 ORDER BY posicao ASC NULLS LAST, id ASC',
            [plano.rows[0].id]
        );
        res.json({ success: true, plano: plano.rows[0], itens: itens.rows });
    } catch (error) {
        console.error('Erro plano GET:', error);
        res.status(500).json({ success: false, erro: error.message });
    }
});

// POST - Criar plano
app.post('/api/plano-tratamento', authMiddleware, async (req, res) => {
    try {
        const { pacienteId, itens } = req.body;
        if (!pacienteId) return res.status(400).json({ success: false, erro: 'pacienteId obrigatório' });

        const plano = await pool.query(`
            INSERT INTO plano_tratamento (paciente_id, dentista_id) VALUES ($1, $2) RETURNING *
        `, [pacienteId, req.dentistaId]);

        const planoId = plano.rows[0].id;

        if (itens && itens.length > 0) {
            for (let i = 0; i < itens.length; i++) {
                const it = itens[i];
                await pool.query(`
                    INSERT INTO plano_tratamento_itens (plano_id, dente, face, procedimento, posicao, origem)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [planoId, it.dente || null, it.face || null, it.procedimento, it.posicao || i, it.origem || 'manual']);
            }
        }

        const itensResult = await pool.query('SELECT * FROM plano_tratamento_itens WHERE plano_id = $1 ORDER BY posicao', [planoId]);
        res.json({ success: true, plano: plano.rows[0], itens: itensResult.rows });
    } catch (error) {
        console.error('Erro plano POST:', error);
        res.status(500).json({ success: false, erro: error.message });
    }
});

// POST - Adicionar item ao plano
app.post('/api/plano-tratamento/:planoId/itens', authMiddleware, async (req, res) => {
    try {
        const { dente, face, procedimento, posicao, origem } = req.body;
        const result = await pool.query(`
            INSERT INTO plano_tratamento_itens (plano_id, dente, face, procedimento, posicao, origem)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
        `, [req.params.planoId, dente || null, face || null, procedimento, posicao, origem || 'manual']);

        res.json({ success: true, item: result.rows[0] });
    } catch (error) {
        console.error('Erro plano item POST:', error);
        res.status(500).json({ success: false, erro: error.message });
    }
});

// PUT - Reordenar itens do plano
app.put('/api/plano-tratamento/:planoId/reordenar', authMiddleware, async (req, res) => {
    try {
        const { itens } = req.body;
        for (const item of itens) {
            await pool.query(
                'UPDATE plano_tratamento_itens SET posicao = $1 WHERE id = $2 AND plano_id = $3',
                [item.posicao, item.id, req.params.planoId]
            );
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Erro reordenar:', error);
        res.status(500).json({ success: false, erro: error.message });
    }
});

// PUT - Marcar item como realizado
app.put('/api/plano-tratamento/itens/:itemId/realizar', authMiddleware, async (req, res) => {
    try {
        const { realizado } = req.body;
        await pool.query(
            'UPDATE plano_tratamento_itens SET realizado = $1, realizado_em = $2 WHERE id = $3',
            [realizado, realizado ? new Date() : null, req.params.itemId]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Erro realizar item:', error);
        res.status(500).json({ success: false, erro: error.message });
    }
});

// ==============================================================================
// RECEITAS
// ==============================================================================

app.get('/api/receitas/:pacienteId', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM receitas WHERE paciente_id = $1 ORDER BY criado_em DESC',
            [req.params.pacienteId]
        );
        res.json({ success: true, receitas: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.get('/api/receitas/detalhe/:id', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM receitas WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, erro: 'Não encontrada' });
        res.json({ success: true, receita: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.post('/api/receitas', authMiddleware, async (req, res) => {
    try {
        const { pacienteId, medicamento, posologia, observacoes } = req.body;
        if (!pacienteId || !medicamento) return res.status(400).json({ success: false, erro: 'Campos obrigatórios' });

        const result = await pool.query(`
            INSERT INTO receitas (paciente_id, dentista_id, medicamento, posologia, observacoes)
            VALUES ($1, $2, $3, $4, $5) RETURNING *
        `, [pacienteId, req.dentistaId, medicamento, posologia || null, observacoes || null]);

        res.json({ success: true, receita: result.rows[0] });
    } catch (error) {
        console.error('Erro receita POST:', error);
        res.status(500).json({ success: false, erro: error.message });
    }
});

// ==============================================================================
// ATESTADOS
// ==============================================================================

app.get('/api/atestados/:pacienteId', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM atestados WHERE paciente_id = $1 ORDER BY criado_em DESC',
            [req.params.pacienteId]
        );
        res.json({ success: true, atestados: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.get('/api/atestados/detalhe/:id', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM atestados WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, erro: 'Não encontrado' });
        res.json({ success: true, atestado: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.post('/api/atestados', authMiddleware, async (req, res) => {
    try {
        const { pacienteId, tipo, dias, cid, motivo, observacoes } = req.body;
        if (!pacienteId) return res.status(400).json({ success: false, erro: 'pacienteId obrigatório' });

        const result = await pool.query(`
            INSERT INTO atestados (paciente_id, dentista_id, tipo, dias, cid, motivo, observacoes)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
        `, [pacienteId, req.dentistaId, tipo || 'atestado', dias || 1, cid || null, motivo || null, observacoes || null]);

        res.json({ success: true, atestado: result.rows[0] });
    } catch (error) {
        console.error('Erro atestado POST:', error);
        res.status(500).json({ success: false, erro: error.message });
    }
});

// ==============================================================================
// TABELA DE PREÇOS
// ==============================================================================

app.get('/api/tabela-precos', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM tabela_precos WHERE dentista_id = $1 ORDER BY procedimento ASC',
            [req.dentistaId]
        );
        res.json({ success: true, precos: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.post('/api/tabela-precos', authMiddleware, async (req, res) => {
    try {
        const { procedimento, valor } = req.body;
        if (!procedimento) return res.status(400).json({ success: false, erro: 'Procedimento obrigatório' });

        const result = await pool.query(`
            INSERT INTO tabela_precos (dentista_id, procedimento, valor)
            VALUES ($1, $2, $3)
            ON CONFLICT (dentista_id, procedimento) DO UPDATE SET valor = $3
            RETURNING *
        `, [req.dentistaId, procedimento, valor || 0]);

        res.json({ success: true, preco: result.rows[0] });
    } catch (error) {
        console.error('Erro tabela-precos POST:', error);
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.put('/api/tabela-precos/:id', authMiddleware, async (req, res) => {
    try {
        const { procedimento, valor } = req.body;
        const result = await pool.query(
            'UPDATE tabela_precos SET procedimento = COALESCE($1, procedimento), valor = COALESCE($2, valor) WHERE id = $3 AND dentista_id = $4 RETURNING *',
            [procedimento, valor, req.params.id, req.dentistaId]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, erro: 'Não encontrado' });
        res.json({ success: true, preco: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.delete('/api/tabela-precos/:id', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'DELETE FROM tabela_precos WHERE id = $1 AND dentista_id = $2 RETURNING id',
            [req.params.id, req.dentistaId]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, erro: 'Não encontrado' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

// POST - Popular tabela com procedimentos padrão
app.post('/api/tabela-precos/popular-padrao', authMiddleware, async (req, res) => {
    try {
        const padrao = [
            ['Consulta / Avaliação', 150], ['Restauração Simples', 200], ['Restauração Composta', 300],
            ['Tratamento de Canal (Anterior)', 700], ['Tratamento de Canal (Pré-molar)', 850], ['Tratamento de Canal (Molar)', 1200],
            ['Extração Simples', 250], ['Extração de Siso', 600], ['Limpeza / Profilaxia', 180],
            ['Clareamento', 800], ['Coroa Provisória', 150], ['Coroa Definitiva', 1500],
            ['Faceta de Porcelana', 1800], ['Faceta de Resina', 600], ['Implante Unitário', 3500],
            ['Prótese Total', 2500], ['Prótese Parcial Removível', 1500], ['Selante', 100],
            ['Raspagem Periodontal', 250], ['Gengivectomia', 400], ['Cirurgia de Frenectomia', 500],
            ['Radiografia Periapical', 50], ['Radiografia Panorâmica', 120], ['Moldagem', 100],
            ['Aplicação de Flúor', 80]
        ];
        let total = 0;
        for (const [proc, val] of padrao) {
            try {
                await pool.query(`
                    INSERT INTO tabela_precos (dentista_id, procedimento, valor) VALUES ($1, $2, $3)
                    ON CONFLICT (dentista_id, procedimento) DO NOTHING
                `, [req.dentistaId, proc, val]);
                total++;
            } catch(e) {}
        }
        res.json({ success: true, total });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

// ==============================================================================
// ORÇAMENTOS
// ==============================================================================

app.get('/api/orcamentos', authMiddleware, async (req, res) => {
    try {
        const { pacienteId } = req.query;
        let query = `
            SELECT o.*, p.nome as paciente_nome
            FROM orcamentos o
            LEFT JOIN pacientes p ON o.paciente_id = p.id
            WHERE o.dentista_id = $1
        `;
        const params = [req.dentistaId];
        if (pacienteId) {
            query += ' AND o.paciente_id = $2';
            params.push(pacienteId);
        }
        query += ' ORDER BY o.criado_em DESC';
        const result = await pool.query(query, params);
        res.json({ success: true, orcamentos: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.get('/api/orcamentos/:id', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT o.*, p.nome as paciente_nome, p.cpf as paciente_cpf
            FROM orcamentos o
            LEFT JOIN pacientes p ON o.paciente_id = p.id
            WHERE o.id = $1
        `, [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, erro: 'Não encontrado' });
        res.json({ success: true, orcamento: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.post('/api/orcamentos', authMiddleware, async (req, res) => {
    try {
        const { pacienteId, itens, validadeDias, formaPagamento, observacoes, status } = req.body;
        if (!pacienteId || !itens || itens.length === 0) {
            return res.status(400).json({ success: false, erro: 'pacienteId e itens obrigatórios' });
        }
        const total = itens.reduce((s, i) => s + (parseFloat(i.valor) || 0), 0);

        const result = await pool.query(`
            INSERT INTO orcamentos (paciente_id, dentista_id, itens, total, status, validade_dias, forma_pagamento, observacoes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
        `, [pacienteId, req.dentistaId, JSON.stringify(itens), total, status || 'aberto', validadeDias || 30, formaPagamento || null, observacoes || null]);

        res.json({ success: true, orcamentoId: result.rows[0].id });
    } catch (error) {
        console.error('Erro orçamento POST:', error);
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.put('/api/orcamentos/:id', authMiddleware, async (req, res) => {
    try {
        const { status, assinaturaUrl, assinaturaIp } = req.body;
        const updates = [];
        const params = [];
        let idx = 1;

        if (status) { updates.push(`status = $${idx++}`); params.push(status); }
        if (assinaturaUrl) {
            updates.push(`assinatura_url = $${idx++}`); params.push(assinaturaUrl);
            updates.push(`assinatura_ip = $${idx++}`); params.push(assinaturaIp || null);
            updates.push(`assinatura_em = NOW()`);
        }
        updates.push(`atualizado_em = NOW()`);
        params.push(req.params.id);

        const result = await pool.query(
            `UPDATE orcamentos SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
            params
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false });
        res.json({ success: true, orcamento: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

// ==============================================================================
// ORÇAMENTOS PENDENTES (lembrete 90 dias)
// ==============================================================================

app.post('/api/orcamentos-pendentes', authMiddleware, async (req, res) => {
    try {
        const { pacienteId, itens, proximoLembrete } = req.body;
        if (!pacienteId || !itens) return res.status(400).json({ success: false, erro: 'Dados obrigatórios' });

        const result = await pool.query(`
            INSERT INTO orcamentos_pendentes (paciente_id, dentista_id, itens, proximo_lembrete)
            VALUES ($1, $2, $3, $4) RETURNING id
        `, [pacienteId, req.dentistaId, JSON.stringify(itens), proximoLembrete]);

        res.json({ success: true, id: result.rows[0].id });
    } catch (error) {
        console.error('Erro orcamentos-pendentes POST:', error);
        res.status(500).json({ success: false, erro: error.message });
    }
});

// GET - Lembretes para a agenda (orçamentos não autorizados vencidos)
app.get('/api/orcamentos-pendentes/lembretes', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT op.*, p.nome as paciente_nome, p.celular, p.whatsapp
            FROM orcamentos_pendentes op
            JOIN pacientes p ON op.paciente_id = p.id
            WHERE op.dentista_id = $1
              AND op.descartado = false
              AND op.proximo_lembrete <= CURRENT_DATE
            ORDER BY op.proximo_lembrete ASC
        `, [req.dentistaId]);
        res.json({ success: true, lembretes: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

// PUT - Adiar ou descartar lembrete
app.put('/api/orcamentos-pendentes/:id', authMiddleware, async (req, res) => {
    try {
        const { descartado, proximoLembrete } = req.body;
        if (descartado) {
            await pool.query('UPDATE orcamentos_pendentes SET descartado = true WHERE id = $1', [req.params.id]);
        } else if (proximoLembrete) {
            await pool.query('UPDATE orcamentos_pendentes SET proximo_lembrete = $1 WHERE id = $2', [proximoLembrete, req.params.id]);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

// ==============================================================================
// RETORNOS
// ==============================================================================

app.post('/api/retornos', authMiddleware, async (req, res) => {
    try {
        const { pacienteId, dataRetorno, motivo } = req.body;
        if (!pacienteId || !dataRetorno) return res.status(400).json({ success: false, erro: 'Dados obrigatórios' });

        const result = await pool.query(`
            INSERT INTO retornos (paciente_id, dentista_id, data_retorno, motivo)
            VALUES ($1, $2, $3, $4) RETURNING *
        `, [pacienteId, req.dentistaId, dataRetorno, motivo || null]);

        res.json({ success: true, retorno: result.rows[0] });
    } catch (error) {
        console.error('Erro retorno POST:', error);
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.get('/api/retornos', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT r.*, p.nome as paciente_nome
            FROM retornos r
            JOIN pacientes p ON r.paciente_id = p.id
            WHERE r.dentista_id = $1 AND r.status = 'pendente'
            ORDER BY r.data_retorno ASC
        `, [req.dentistaId]);
        res.json({ success: true, retornos: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

// ==============================================================================
// STORAGE (Anexos - simplificado sem cloud, salva referência)
// ==============================================================================

app.get('/api/storage/status', authMiddleware, async (req, res) => {
    res.json({ success: true, connected: true, provider: 'local' });
});

app.post('/api/storage/disconnect', authMiddleware, async (req, res) => {
    res.json({ success: true });
});

app.get('/api/storage/files/:pacienteId', authMiddleware, async (req, res) => {
    // Placeholder - retorna lista vazia por enquanto
    res.json({ success: true, files: [] });
});

app.delete('/api/storage/files/:id', authMiddleware, async (req, res) => {
    res.json({ success: true });
});

// ==============================================================================
// ROTAS UTILITÁRIAS
// ==============================================================================

app.get('/', (req, res) => {
    res.json({
        name: 'Dental Ultra API',
        version: '7.0.0',
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
