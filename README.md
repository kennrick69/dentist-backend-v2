# 🦷 Backend Dentista Pro v2.0

Sistema completo de gerenciamento odontológico com autenticação JWT e persistência de dados.

## 📋 Características

- ✅ Autenticação JWT (JSON Web Token)
- ✅ Registro e login de dentistas
- ✅ CRUD completo de pacientes
- ✅ CRUD completo de agendamentos
- ✅ Banco de dados JSON (facilmente migrável para PostgreSQL)
- ✅ Proteção de rotas autenticadas
- ✅ Senhas criptografadas com bcrypt
- ✅ CORS habilitado
- ✅ Logs de requisições

## 🚀 Instalação

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar variáveis de ambiente
```bash
cp .env.example .env
# Editar .env e configurar JWT_SECRET
```

### 3. Executar
```bash
# Produção
npm start

# Desenvolvimento
npm run dev
```

## 📡 Endpoints da API

### 🔐 Autenticação

#### Registrar Dentista
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "Dr. José Silva",
  "cro": "12345",
  "email": "jose@dentista.com",
  "password": "senha123",
  "clinic": "Clínica Sorriso",
  "specialty": "Ortodontia"
}
```

**Resposta:**
```json
{
  "success": true,
  "dentista": {
    "id": "1706234567890",
    "name": "Dr. José Silva",
    "cro": "12345",
    "email": "jose@dentista.com",
    "clinic": "Clínica Sorriso",
    "specialty": "Ortodontia",
    "subscription": {
      "active": true,
      "plan": "premium"
    }
  },
  "message": "Dentista cadastrado com sucesso!"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "jose@dentista.com",
  "password": "senha123"
}
```

**Resposta:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "dentista": { ... },
  "message": "Login realizado com sucesso!"
}
```

#### Verificar Token
```http
GET /api/auth/verify
Authorization: Bearer {token}
```

### 👥 Pacientes

#### Listar Pacientes
```http
GET /api/pacientes
Authorization: Bearer {token}
```

**Resposta:**
```json
{
  "success": true,
  "pacientes": [
    {
      "id": "1706234567891",
      "dentistaId": "1706234567890",
      "nome": "Maria Santos",
      "cpf": "123.456.789-00",
      "telefone": "(11) 98765-4321",
      "email": "maria@email.com",
      "dataCadastro": "2026-01-25T23:30:00.000Z"
    }
  ],
  "total": 1
}
```

#### Criar Paciente
```http
POST /api/pacientes
Authorization: Bearer {token}
Content-Type: application/json

{
  "nome": "Maria Santos",
  "cpf": "123.456.789-00",
  "telefone": "(11) 98765-4321",
  "email": "maria@email.com",
  "endereco": "Rua A, 123",
  "cidade": "São Paulo",
  "estado": "SP"
}
```

#### Atualizar Paciente
```http
PUT /api/pacientes/{id}
Authorization: Bearer {token}
Content-Type: application/json

{
  "telefone": "(11) 91111-1111"
}
```

#### Deletar Paciente
```http
DELETE /api/pacientes/{id}
Authorization: Bearer {token}
```

### 📅 Agendamentos

#### Listar Agendamentos
```http
GET /api/agendamentos
Authorization: Bearer {token}
```

#### Criar Agendamento
```http
POST /api/agendamentos
Authorization: Bearer {token}
Content-Type: application/json

{
  "pacienteId": "1706234567891",
  "pacienteNome": "Maria Santos",
  "data": "2026-01-26",
  "horario": "14:00",
  "duracao": "30",
  "procedimento": "Limpeza",
  "status": "confirmado",
  "observacoes": "Primeira consulta"
}
```

#### Atualizar Agendamento
```http
PUT /api/agendamentos/{id}
Authorization: Bearer {token}
Content-Type: application/json

{
  "status": "confirmado"
}
```

#### Deletar Agendamento
```http
DELETE /api/agendamentos/{id}
Authorization: Bearer {token}
```

## 🔒 Segurança

### JWT (JSON Web Token)
- Tokens expiram em 7 dias
- Tokens são verificados em todas as rotas protegidas
- JWT_SECRET deve ser alterado em produção

### Senhas
- Criptografadas com bcrypt (10 rounds)
- Nunca retornadas nas respostas da API
- Mínimo de 6 caracteres

### CORS
- Habilitado para todas as origens (ajustar em produção)

## 📁 Estrutura de Dados

### database.json
```json
{
  "dentistas": [
    {
      "id": "...",
      "name": "...",
      "cro": "...",
      "email": "...",
      "password": "hash...",
      "subscription": { ... }
    }
  ],
  "pacientes": [
    {
      "id": "...",
      "dentistaId": "...",
      "nome": "...",
      "cpf": "...",
      ...
    }
  ],
  "agendamentos": [
    {
      "id": "...",
      "dentistaId": "...",
      "pacienteId": "...",
      "data": "...",
      "horario": "...",
      ...
    }
  ],
  "notas": []
}
```

## 🔄 Migração para PostgreSQL

Para migrar para PostgreSQL:

1. Instalar `pg`:
```bash
npm install pg
```

2. Criar schema:
```sql
CREATE TABLE dentistas (...);
CREATE TABLE pacientes (...);
CREATE TABLE agendamentos (...);
```

3. Substituir funções readDB/writeDB por queries SQL

## 🌐 Deploy no Railway

1. Conectar repositório GitHub ao Railway

2. Configurar variáveis de ambiente:
   - `JWT_SECRET`: seu secret seguro
   - `NODE_ENV`: production

3. Deploy automático a cada push!

## 📊 Monitoramento

### Health Check
```http
GET /health
```

### Informações do Sistema
```http
GET /
```

## 🧪 Testando a API

### Com cURL:

```bash
# Registrar
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Dr. Teste",
    "cro": "12345",
    "email": "teste@teste.com",
    "password": "123456"
  }'

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@teste.com",
    "password": "123456"
  }'

# Listar pacientes (use o token do login)
curl http://localhost:3001/api/pacientes \
  -H "Authorization: Bearer SEU_TOKEN_AQUI"
```

### Com Thunder Client / Postman:

1. POST /api/auth/register → Criar conta
2. POST /api/auth/login → Pegar token
3. Usar token no header `Authorization: Bearer {token}`
4. Testar endpoints protegidos

## 📝 TODO

- [ ] Adicionar validação de CPF
- [ ] Implementar paginação
- [ ] Adicionar filtros e busca
- [ ] Migrar para PostgreSQL
- [ ] Adicionar upload de arquivos
- [ ] Implementar sistema de notificações
- [ ] Adicionar logs estruturados
- [ ] Implementar rate limiting
- [ ] Adicionar testes automatizados

## 🐛 Troubleshooting

### Erro: "Token não fornecido"
- Certifique-se de incluir o header `Authorization: Bearer {token}`

### Erro: "Token inválido"
- Token expirado (7 dias) → Fazer login novamente
- JWT_SECRET diferente → Verificar .env

### Erro: "Email já cadastrado"
- Use outro email ou faça login

## 📄 Licença

MIT

## 👨‍💻 Autor

JOs - Sistema de Gestão Odontológica

---

**Versão:** 2.0.0  
**Data:** 25 de Janeiro de 2026
