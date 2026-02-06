# 🗄️ Integração Google Drive - Dental Ultra

## Setup Rápido (15 min)

### 1. Google Cloud Console

1. Acesse: https://console.cloud.google.com
2. Crie um projeto novo (ou use existente): "Dental Ultra"
3. Vá em **APIs & Services** → **Library**
4. Ative: **Google Drive API** e **Google People API** (ou OAuth2 API)
5. Vá em **APIs & Services** → **Credentials**
6. Clique **+ CREATE CREDENTIALS** → **OAuth client ID**
7. Tipo: **Web application**
8. Nome: "Dental Ultra Storage"
9. **Authorized redirect URIs**: adicione:
   ```
   https://SEU-BACKEND.railway.app/api/storage/callback/google
   ```
10. Copie o **Client ID** e **Client Secret**

### 2. Tela de Consentimento OAuth

1. Em **OAuth consent screen**, configure:
   - Tipo: **External**
   - Nome: "Dental Ultra"
   - Email suporte: seu email
   - Scopes: `drive.file`, `userinfo.email`
2. Adicione seu email como **Test User** (enquanto em modo teste)
3. Quando pronto para produção: publique o app

### 3. Variáveis de Ambiente (Railway)

Adicione no Railway Dashboard → Settings → Variables:

```
GOOGLE_CLIENT_ID=123456789.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxx
GOOGLE_REDIRECT_URI=https://SEU-BACKEND.railway.app/api/storage/callback/google
FRONTEND_URL=https://dentalultra.com.br/area-dentistas
```

### 4. Dependências

No terminal do projeto:
```bash
npm install googleapis multer
```

### 5. Deploy

Commit e push — Railway vai fazer o deploy automaticamente.

---

## Como Funciona

### Fluxo do Dentista:
1. Abre aba **Anexos** no prontuário
2. Vê tela com opção "Integrar com Google Drive"
3. Clica → popup do Google pede permissão
4. Autoriza → pasta "Dental Ultra" criada no Drive dele
5. Arrasta arquivos → enviados direto pro Drive do dentista
6. Cada paciente tem uma subpasta automática

### Estrutura no Google Drive:
```
📁 Dental Ultra/
   📁 Paciente_1_Joao_Silva/
      🖼️ rx-panoramica.jpg
      📄 laudo-exame.pdf
   📁 Paciente_2_Maria_Santos/
      🖼️ foto-antes.jpg
      🖼️ foto-depois.jpg
```

### Rotas da API:
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/storage/connect/google` | Inicia OAuth (abre popup Google) |
| GET | `/api/storage/callback/google` | Callback do OAuth |
| GET | `/api/storage/status` | Verifica se está conectado |
| POST | `/api/storage/disconnect` | Desconecta |
| POST | `/api/storage/upload` | Upload de arquivo (multipart) |
| GET | `/api/storage/files/:pacienteId` | Lista arquivos do paciente |
| GET | `/api/storage/download/:id` | Download de arquivo |
| DELETE | `/api/storage/files/:id` | Exclui arquivo |

### Tabelas criadas automaticamente:
- `storage_connections` - Tokens OAuth do dentista
- `paciente_arquivos` - Referências aos arquivos no Drive

---

## Segurança

- Tokens OAuth são salvos no banco e renovados automaticamente
- Cada dentista tem seus próprios tokens (multi-tenant)
- Arquivos ficam NO DRIVE DO DENTISTA (não no servidor)
- Scope `drive.file` = só acessa arquivos criados pelo app
- Backend faz proxy de download (arquivo nunca expõe token)

## Custos

- **Google Drive**: 15GB grátis por conta Google
- **Railway**: zero custo extra (arquivos não ficam no servidor)
- **Bandwidth**: mínimo (upload/download direto via API)
