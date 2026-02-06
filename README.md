# 🦷 Dental Ultra

Sistema de gestão odontológica completo e **GRATUITO**, alternativa ao Simples Dental.

## 🏗️ Arquitetura

| Componente | Tecnologia | Hospedagem |
|-----------|-----------|-----------|
| Frontend | HTML/CSS/JS puro | Hostinger (dentalultra.com.br) |
| Backend | Node.js + Express | Railway |
| Banco | PostgreSQL | Railway |

## 📂 Estrutura

```
dental-ultra/
├── area-dentistas/          ← Upload para Hostinger /area-dentistas/
│   ├── login.html           ← Tela de login/cadastro
│   ├── pacientes.html       ← Gestão de pacientes
│   └── prontuario.html      ← Prontuário eletrônico completo
├── server.js                ← Backend (push para GitHub → Railway auto-deploy)
├── package.json
├── .env.example
├── migration-anamnese-receitas-atestados.sql
├── migration-google-drive.sql
└── GOOGLE-DRIVE-SETUP.md
```

## 🚀 Deploy

### Backend (Railway)
1. Push `server.js` e `package.json` para GitHub
2. Railway detecta e auto-deploia
3. Tabelas são criadas automaticamente no init
4. Configurar variáveis de ambiente (ver `.env.example`)

### Frontend (Hostinger)
1. Upload dos arquivos de `area-dentistas/` para `/area-dentistas/` na Hostinger
2. Testar em janela anônima (Ctrl+Shift+N) para evitar cache

## 📡 API Endpoints

### Autenticação
- `POST /api/auth/register` — Cadastro
- `POST /api/auth/login` — Login
- `GET /api/auth/verify` — Verificar token

### Pacientes
- `GET /api/pacientes` — Listar
- `GET /api/pacientes/:id` — Detalhe
- `POST /api/pacientes` — Criar
- `PUT /api/pacientes/:id` — Atualizar
- `DELETE /api/pacientes/:id` — Excluir

### Prontuário (Evoluções)
- `GET /api/prontuarios/:pacienteId` — Listar evoluções
- `POST /api/prontuarios` — Criar evolução

### Anamnese ✨ NOVO
- `GET /api/anamnese/:pacienteId` — Carregar anamnese
- `GET /api/anamnese/:pacienteId/alertas` — Alertas clínicos
- `POST /api/anamnese` — Salvar/atualizar (UPSERT)

### Receitas ✨ NOVO
- `GET /api/receitas/:pacienteId` — Listar receitas
- `POST /api/receitas` — Criar receita
- `DELETE /api/receitas/:id` — Excluir

### Atestados ✨ NOVO
- `GET /api/atestados/:pacienteId` — Listar atestados
- `POST /api/atestados` — Criar atestado
- `DELETE /api/atestados/:id` — Excluir

### Agendamentos
- `GET /api/agendamentos` — Listar
- `POST /api/agendamentos` — Criar
- `PUT /api/agendamentos/:id` — Atualizar
- `DELETE /api/agendamentos/:id` — Excluir

### Financeiro
- `GET /api/financeiro` — Listar
- `POST /api/financeiro` — Criar
- `PUT /api/financeiro/:id` — Atualizar
- `DELETE /api/financeiro/:id` — Excluir

### Casos Protéticos
- `GET /api/casos-proteticos` — Listar
- `POST /api/casos-proteticos` — Criar
- `PUT /api/casos-proteticos/:id` — Atualizar

### Google Drive (Anexos)
- `GET /api/storage/connect/google` — Iniciar OAuth
- `GET /api/storage/status` — Status da conexão
- `POST /api/storage/upload` — Upload arquivo
- `GET /api/storage/files/:pacienteId` — Listar arquivos
