
# WA Divulgações - Sistema de Disparador de Anúncios WhatsApp

Sistema completo para disparar anúncios com imagem e texto no WhatsApp, com painel multi-usuários, agendamento e anti-spam.

## 🚀 Características

- **Multi-usuários**: Cada usuário tem sua própria conta e pode conectar seu WhatsApp
- **Disparador de Anúncios**: Envio de mensagens com texto e imagem para múltiplos grupos
- **Agendamento Avançado**: Agende envios para datas/horários específicos com repetição
- **Anti-Spam**: Sistema inteligente para evitar banimentos
- **Estatísticas Completas**: Acompanhe todas as movimentações em tempo real
- **Interface Moderna**: Painel responsivo e intuitivo
- **Socket.IO**: Atualizações em tempo real
- **Gerenciamento de Anúncios**: Criar, editar, pausar e excluir anúncios

## 📋 Pré-requisitos

- Node.js (versão 16 ou superior)
- NPM ou Yarn
- Sistema operacional: Windows, Linux ou macOS

## 🔧 Instalação

1. **Clone o repositório**
```bash
git clone <url-do-repositorio>
cd wa-divulgacoes
```

2. **Instale as dependências**
```bash
npm install
```

3. **Execute o projeto**
```bash
# Modo desenvolvimento
npm run dev

# Modo produção
npm start
```

4. **Acesse o sistema**
```
http://localhost:3000
```

## 📁 Estrutura do Projeto

```
wa-divulgacoes/
├── server.js                 # Servidor principal
├── package.json             # Dependências
├── services/                # Serviços do sistema
│   ├── whatsappService.js   # Gerenciamento WhatsApp
│   ├── databaseService.js   # Banco de dados JSON
│   ├── schedulerService.js  # Sistema de agendamento
│   └── antiSpamService.js   # Proteção anti-spam
├── public/                  # Interface web
│   └── index.html          # Painel principal
├── data/                   # Dados em JSON
│   ├── users.json         # Usuários cadastrados
│   ├── ads.json           # Anúncios criados
│   ├── stats.json         # Estatísticas
│   └── settings.json      # Configurações
├── auth/                  # Autenticação WhatsApp
│   └── [userId]/         # Sessões por usuário
└── uploads/              # Imagens dos anúncios
    └── [userId]/        # Imagens por usuário
```

## 🎯 Funcionalidades

### Autenticação
- Registro de novos usuários
- Login seguro com JWT
- Senhas criptografadas com bcrypt

### WhatsApp
- Conexão via QR Code
- Multi-sessões (cada usuário tem sua conexão)
- Detecção automática de grupos
- Reconexão automática

### Anúncios
- **Criar**: Título, mensagem, imagem opcional
- **Editar**: Modificar anúncios existentes
- **Agendar**: Data, hora e tipo de repetição
- **Pausar/Ativar**: Controle de status
- **Excluir**: Remoção completa

### Agendamento
- **Uma vez**: Envio único
- **Diário**: Repetir todos os dias
- **Semanal**: Repetir semanalmente
- **Mensal**: Repetir mensalmente  
- **Anual**: Repetir anualmente

### Anti-Spam
- Limite de mensagens por hora
- Cooldown automático
- Detecção de grupos duplicados
- Bloqueio temporário de usuários
- Estatísticas de envio

### Estatísticas
- Total de anúncios criados
- Anúncios ativos/inativos
- Mensagens enviadas/falhadas
- Atividade por usuário
- Relatórios diários

## 🛠️ API Endpoints

### Autenticação
- `POST /api/register` - Registrar usuário
- `POST /api/login` - Login

### WhatsApp
- `POST /api/whatsapp/connect` - Conectar WhatsApp
- `POST /api/whatsapp/disconnect` - Desconectar
- `GET /api/whatsapp/groups` - Listar grupos

### Anúncios
- `POST /api/ads` - Criar anúncio
- `GET /api/ads` - Listar anúncios
- `PUT /api/ads/:id` - Editar anúncio
- `DELETE /api/ads/:id` - Excluir anúncio
- `POST /api/ads/:id/toggle` - Pausar/Ativar

### Estatísticas
- `GET /api/stats` - Estatísticas do usuário

## ⚙️ Configurações

### Anti-Spam (padrão)
```json
{
  "enabled": true,
  "maxMessagesPerHour": 10,
  "cooldownMinutes": 60
}
```

### Agendador
```json
{
  "timezone": "America/Sao_Paulo"
}
```

## 🔐 Segurança

- **JWT**: Autenticação segura com tokens
- **bcrypt**: Senhas criptografadas
- **Validação**: Dados validados no backend
- **Rate Limiting**: Proteção contra spam
- **Upload Seguro**: Validação de imagens
- **Isolamento**: Dados separados por usuário

## 🚨 Sistema Anti-Banimento

### Medidas Implementadas
1. **Limite de Envios**: Máximo por hora configurável
2. **Intervalo Entre Mensagens**: 2 segundos entre envios
3. **Detecção de Duplicatas**: Evita envios repetidos
4. **Cooldown Automático**: Pausa forçada quando necessário
5. **Monitoramento**: Estatísticas de falhas e sucessos

### Recomendações
- Não exceder 10 mensagens/hora por padrão
- Usar intervalos maiores em grupos grandes
- Monitorar taxa de falhas
- Evitar conteúdo repetitivo

## 📊 Monitoramento

### Logs do Sistema
- Conexões WhatsApp
- Envios de mensagens
- Erros e exceções
- Atividade de usuários

### Estatísticas em Tempo Real
- Status das conexões
- Mensagens enviadas/falhadas
- Usuários ativos
- Performance do sistema

## 🔄 Backup e Recuperação

### Backup Automático
```javascript
// Criar backup
const backupFile = await db.createBackup();

// Restaurar backup
await db.restoreBackup(backupFile);
```

### Dados Salvos
- Usuários e senhas
- Anúncios e configurações
- Estatísticas históricas
- Sessões WhatsApp

## 🎨 Personalização

### Cores do Sistema
```css
:root {
    --primary-color: #25D366;    /* Verde WhatsApp */
    --secondary-color: #128C7E;  /* Verde escuro */
    --accent-color: #075E54;     /* Verde muito escuro */
}
```

### Logo e Branding
- Altere o título em `index.html`
- Substitua ícones conforme necessário
- Personalize cores CSS

## 🚀 Deploy em Produção

### Requisitos
- Servidor Linux/Windows
- Node.js instalado
- PM2 (recomendado)
- Nginx (opcional)

### Comandos
```bash
# Instalar PM2
npm install -g pm2

# Executar em produção
pm2 start server.js --name "wa-divulgacoes"

# Monitorar
pm2 monit

# Logs
pm2 logs wa-divulgacoes
```

### Configuração Nginx
```nginx
server {
    listen 80;
    server_name seu-dominio.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## ❓ Troubleshooting

### Problemas Comuns

**WhatsApp não conecta**
- Verifique se o QR Code está sendo gerado
- Tente limpar a pasta `auth/[userId]`
- Reinicie o servidor

**Mensagens não enviam**
- Verifique conexão WhatsApp
- Confirme se os grupos existem
- Verifique logs de erro

**Interface não carrega**
- Verifique console do navegador
- Confirme se o servidor está rodando
- Teste em outro navegador

### Logs Importantes
```bash
# Ver logs do servidor
npm run dev

# Logs do PM2
pm2 logs wa-divulgacoes

# Logs de erro específicos
tail -f logs/error.log
```

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -am 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

## 📝 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para detalhes.

## 👨‍💻 Desenvolvedor

**Wallysson Studio Dv**
- Sistema desenvolvido em 2025
- Especialista em automação WhatsApp
- Soluções personalizadas para empresas

## ⚠️ Aviso Legal

- Use este sistema de forma responsável
- Respeite os termos de uso do WhatsApp
- Não utilize para spam ou conteúdo inadequado
- O desenvolvedor não se responsabiliza por banimentos
- Teste sempre em ambiente controlado

## 📞 Suporte

Para suporte técnico ou dúvidas:
- Abra uma issue no GitHub
- Entre em contato com Wallysson Studio Dv
- Consulte a documentação completa

---

**Desenvolvido com ❤️ por Wallysson Studio Dv © 2025**