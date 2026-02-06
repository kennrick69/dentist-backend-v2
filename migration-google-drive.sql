-- ============================================
-- MIGRAÇÃO: Google Drive Storage Integration
-- Rodar no banco PostgreSQL do Dental Ultra
-- ============================================

-- Tabela de tokens OAuth dos dentistas (1 por clínica)
CREATE TABLE IF NOT EXISTS storage_connections (
    id SERIAL PRIMARY KEY,
    dentista_id INTEGER NOT NULL REFERENCES dentistas(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL DEFAULT 'google_drive', -- 'google_drive' ou 'onedrive'
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expiry TIMESTAMP,
    google_email VARCHAR(255),
    root_folder_id VARCHAR(255), -- ID da pasta "Dental Ultra" no Drive
    connected_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(dentista_id, provider)
);

-- Tabela de arquivos enviados (referência ao Google Drive)
CREATE TABLE IF NOT EXISTS paciente_arquivos (
    id SERIAL PRIMARY KEY,
    paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    dentista_id INTEGER NOT NULL REFERENCES dentistas(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL DEFAULT 'google_drive',
    
    -- Dados do arquivo
    nome VARCHAR(500) NOT NULL,
    tipo VARCHAR(100), -- mime type
    tamanho BIGINT DEFAULT 0, -- bytes
    categoria VARCHAR(50) DEFAULT 'documento', -- radiografia, foto, exame, documento
    
    -- IDs no Google Drive
    drive_file_id VARCHAR(255) NOT NULL, -- ID do arquivo no Drive
    drive_folder_id VARCHAR(255), -- ID da pasta do paciente no Drive
    view_url TEXT, -- Link para visualizar no Drive
    thumbnail_url TEXT, -- Thumbnail do arquivo
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_paciente_arquivos_paciente ON paciente_arquivos(paciente_id);
CREATE INDEX IF NOT EXISTS idx_paciente_arquivos_dentista ON paciente_arquivos(dentista_id);
CREATE INDEX IF NOT EXISTS idx_paciente_arquivos_categoria ON paciente_arquivos(categoria);
CREATE INDEX IF NOT EXISTS idx_storage_connections_dentista ON storage_connections(dentista_id);
