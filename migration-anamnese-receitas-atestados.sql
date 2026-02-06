-- =============================================
-- MIGRATION: Anamnese, Receitas e Atestados
-- Dental Ultra - Rodar no Railway PostgreSQL
-- =============================================

-- 1. ANAMNESE
CREATE TABLE IF NOT EXISTS anamneses (
    id SERIAL PRIMARY KEY,
    dentista_id INTEGER REFERENCES dentistas(id) ON DELETE CASCADE,
    paciente_id INTEGER REFERENCES pacientes(id) ON DELETE CASCADE,
    peso DECIMAL(5,1),
    altura DECIMAL(3,2),
    pressao_arterial VARCHAR(20),
    frequencia_cardiaca INTEGER,
    -- Condições médicas
    diabetes BOOLEAN DEFAULT FALSE,
    hipertensao BOOLEAN DEFAULT FALSE,
    cardiopatia BOOLEAN DEFAULT FALSE,
    hepatite BOOLEAN DEFAULT FALSE,
    hiv BOOLEAN DEFAULT FALSE,
    gestante BOOLEAN DEFAULT FALSE,
    lactante BOOLEAN DEFAULT FALSE,
    epilepsia BOOLEAN DEFAULT FALSE,
    problema_renal BOOLEAN DEFAULT FALSE,
    problema_respiratorio BOOLEAN DEFAULT FALSE,
    problema_sangramento BOOLEAN DEFAULT FALSE,
    problema_cicatrizacao BOOLEAN DEFAULT FALSE,
    cancer BOOLEAN DEFAULT FALSE,
    radioterapia BOOLEAN DEFAULT FALSE,
    quimioterapia BOOLEAN DEFAULT FALSE,
    -- Alergias
    alergia_anestesico BOOLEAN DEFAULT FALSE,
    alergia_antibiotico BOOLEAN DEFAULT FALSE,
    alergia_latex BOOLEAN DEFAULT FALSE,
    alergia_outros BOOLEAN DEFAULT FALSE,
    alergias_descricao TEXT,
    -- Hábitos
    fumante BOOLEAN DEFAULT FALSE,
    etilista BOOLEAN DEFAULT FALSE,
    usa_drogas BOOLEAN DEFAULT FALSE,
    usa_medicamentos BOOLEAN DEFAULT FALSE,
    medicamentos_descricao TEXT,
    -- Cirurgias
    cirurgia_previa BOOLEAN DEFAULT FALSE,
    cirurgias_descricao TEXT,
    -- Observações
    observacoes TEXT,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(dentista_id, paciente_id)
);

-- 2. RECEITAS
CREATE TABLE IF NOT EXISTS receitas (
    id SERIAL PRIMARY KEY,
    dentista_id INTEGER REFERENCES dentistas(id) ON DELETE CASCADE,
    paciente_id INTEGER REFERENCES pacientes(id) ON DELETE CASCADE,
    tipo VARCHAR(20) DEFAULT 'simples',
    medicamentos JSONB NOT NULL DEFAULT '[]',
    observacoes TEXT,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. ATESTADOS
CREATE TABLE IF NOT EXISTS atestados (
    id SERIAL PRIMARY KEY,
    dentista_id INTEGER REFERENCES dentistas(id) ON DELETE CASCADE,
    paciente_id INTEGER REFERENCES pacientes(id) ON DELETE CASCADE,
    tipo VARCHAR(30) DEFAULT 'atestado',
    dias INTEGER DEFAULT 1,
    cid VARCHAR(20),
    horario VARCHAR(50),
    conteudo TEXT,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
