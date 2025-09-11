#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

console.log(`
🚀 WhatsApp Bot Panel - Setup Inicial
=====================================

Bem-vindo ao assistente de configuração do seu bot WhatsApp!
Este script irá preparar tudo para você começar.

`);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

class SetupWizard {
    constructor() {
        this.config = {
            server: {
                port: 3000,
                host: 'localhost'
            },
            whatsapp: {
                sendDelay: 2000,
                maxReconnectAttempts: 10
            },
            upload: {
                maxFileSize: 10 * 1024 * 1024
            },
            scheduler: {
                timezone: 'America/Sao_Paulo'
            }
        };
    }

    async run() {
        console.log('📋 Vamos configurar seu bot passo a passo...\n');
        
        try {
            await this.checkRequirements();
            await this.gatherUserInput();
            await this.createDirectories();
            await this.createConfigFiles();
            await this.installDependencies();
            await this.createStartScript();
            await this.showFinalInstructions();
        } catch (error) {
            console.error('❌ Erro durante a configuração:', error.message);
            process.exit(1);
        } finally {
            rl.close();
        }
    }

    async checkRequirements() {
        console.log('🔍 Verificando requisitos do sistema...');
        
        // Verificar Node.js
        try {
            const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
            const majorVersion = parseInt(nodeVersion.substring(1).split('.')[0]);
            
            if (majorVersion < 16) {
                throw new Error(`Node.js 16+ é obrigatório. Versão atual: ${nodeVersion}`);
            }
            
            console.log(`✅ Node.js ${nodeVersion} - OK`);
        } catch (error) {
            throw new Error('Node.js não está instalado ou não está acessível via comando "node"');
        }
        
        // Verificar npm
        try {
            const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
            console.log(`✅ npm ${npmVersion} - OK`);
        } catch (error) {
            throw new Error('npm não está instalado ou não está acessível');
        }
        
        console.log('✅ Todos os requisitos foram atendidos!\n');
    }

    async gatherUserInput() {
        console.log('⚙️  Configurações personalizadas:\n');
        
        // Porta do servidor
        const port = await this.askQuestion(
            `🌐 Porta do servidor web (padrão: ${this.config.server.port}): `
        );
        if (port && !isNaN(port) && port >= 1000 && port <= 65535) {
            this.config.server.port = parseInt(port);
        }
        
        // Delay entre envios
        const delay = await this.askQuestion(
            `⏱️  Delay entre envios em segundos (padrão: ${this.config.whatsapp.sendDelay/1000}): `
        );
        if (delay && !isNaN(delay) && delay >= 1) {
            this.config.whatsapp.sendDelay = parseInt(delay) * 1000;
        }
        
        // Timezone
        const timezone = await this.askQuestion(
            `🌍 Timezone (padrão: ${this.config.scheduler.timezone}): `
        );
        if (timezone && timezone.trim()) {
            this.config.scheduler.timezone = timezone.trim();
        }
        
        // Tamanho máximo de upload
        const maxSize = await this.askQuestion(
            `📁 Tamanho máximo de upload em MB (padrão: ${this.config.upload.maxFileSize/(1024*1024)}): `
        );
        if (maxSize && !isNaN(maxSize) && maxSize >= 1) {
            this.config.upload.maxFileSize = parseInt(maxSize) * 1024 * 1024;
        }
        
        console.log('\n✅ Configurações coletadas!\n');
    }

    async createDirectories() {
        console.log('📁 Criando estrutura de diretórios...');
        
        const directories = [
            './panel_data',
            './auth_info',
            './uploads',
            './logs',
            './backups',
            './public'
        ];
        
        directories.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`  ✅ ${dir}`);
            } else {
                console.log(`  ⚠️  ${dir} (já existe)`);
            }
        });
        
        console.log('✅ Estrutura de diretórios criada!\n');
    }

    async createConfigFiles() {
        console.log('📝 Criando arquivos de configuração...');
        
        // Config principal
        const configPath = './panel_data/config.json';
        if (!fs.existsSync(configPath)) {
            const defaultConfig = {
                botActive: false,
                timezone: this.config.scheduler.timezone,
                server: this.config.server,
                whatsapp: this.config.whatsapp,
                upload: this.config.upload,
                createdAt: new Date().toISOString(),
                version: '1.0.0'
            };
            
            fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
            console.log(`  ✅ ${configPath}`);
        }
        
        // Arquivos vazios iniciais
        const jsonFiles = [
            './panel_data/groups.json',
            './panel_data/ads.json',
            './panel_data/schedules.json'
        ];
        
        jsonFiles.forEach(file => {
            if (!fs.existsSync(file)) {
                fs.writeFileSync(file, '{}');
                console.log(`  ✅ ${file}`);
            }
        });
        
        // Arquivo de histórico
        const historyFile = './panel_data/history.json';
        if (!fs.existsSync(historyFile)) {
            const initialHistory = [{
                id: 'setup_' + Date.now(),
                type: 'system',
                message: 'Sistema configurado e inicializado',
                timestamp: new Date().toISOString(),
                data: {
                    version: '1.0.0',
                    setupCompleted: true
                }
            }];
            fs.writeFileSync(historyFile, JSON.stringify(initialHistory, null, 2));
            console.log(`  ✅ ${historyFile}`);
        }
        
        // .env exemplo
        if (!fs.existsSync('.env.example')) {
            const envExample = `# Configurações de Ambiente - WhatsApp Bot Panel
# Copie este arquivo para .env e modifique conforme necessário

# Servidor
PORT=${this.config.server.port}
HOST=localhost

# WhatsApp
WHATSAPP_SEND_DELAY=${this.config.whatsapp.sendDelay}
MAX_RECONNECT_ATTEMPTS=${this.config.whatsapp.maxReconnectAttempts}

# Upload
MAX_FILE_SIZE=${this.config.upload.maxFileSize}

# Agendamento
TIMEZONE=${this.config.scheduler.timezone}

# Logs
LOG_LEVEL=info

# Desenvolvimento
NODE_ENV=production
`;
            fs.writeFileSync('.env.example', envExample);
            console.log(`  ✅ .env.example`);
        }
        
        console.log('✅ Arquivos de configuração criados!\n');
    }

    async installDependencies() {
        console.log('📦 Instalando dependências...');
        console.log('   (Isso pode demorar alguns minutos)\n');
        
        try {
            console.log('   Executando: npm install');
            execSync('npm install', { stdio: 'inherit' });
            console.log('\n✅ Dependências instaladas com sucesso!\n');
        } catch (error) {
            console.error('❌ Erro ao instalar dependências:', error.message);
            console.log('\n⚠️  Você pode tentar instalar manualmente com: npm install\n');
        }
    }

    async createStartScript() {
        console.log('🚀 Criando scripts de inicialização...');
        
        // Script de start para Windows
        const startBat = `@echo off
echo 🚀 Iniciando WhatsApp Bot Panel...
echo.
echo 📱 Painel web será aberto em: http://localhost:${this.config.server.port}
echo 🛑 Pressione Ctrl+C para parar o bot
echo.
node server.js
pause
`;
        fs.writeFileSync('start.bat', startBat);
        console.log('  ✅ start.bat (Windows)');
        
        // Script de start para Linux/Mac
        const startSh = `#!/bin/bash
echo "🚀 Iniciando WhatsApp Bot Panel..."
echo ""
echo "📱 Painel web será aberto em: http://localhost:${this.config.server.port}"
echo "🛑 Pressione Ctrl+C para parar o bot"
echo ""
node server.js
`;
        fs.writeFileSync('start.sh', startSh);
        
        // Dar permissão de execução no Linux/Mac
        try {
            execSync('chmod +x start.sh');
        } catch (error) {
            // Ignorar erro no Windows
        }
        console.log('  ✅ start.sh (Linux/Mac)');
        
        // Atualizar package.json com scripts úteis
        let packageJson = {};
        try {
            packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        } catch (error) {
            // Criar package.json se não existir
        }
        
        packageJson.scripts = {
            ...packageJson.scripts,
            start: 'node server.js',
            dev: 'nodemon server.js',
            setup: 'node setup.js',
            'reset-auth': 'rm -rf auth_info && echo "Autenticação resetada"',
            'backup-data': 'cp -r panel_data backups/backup_$(date +%Y%m%d_%H%M%S)',
            'clear-logs': 'rm -f logs/*.log && echo "Logs limpos"'
        };
        
        fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
        console.log('  ✅ Scripts adicionados ao package.json');
        
        console.log('✅ Scripts criados!\n');
    }

    async showFinalInstructions() {
        console.log(`
🎉 Configuração Concluída com Sucesso!
======================================

Seu WhatsApp Bot Panel está pronto para usar!

📁 ARQUIVOS CRIADOS:
   ├── server.js          (servidor principal)
   ├── public/index.html  (interface web)
   ├── panel_data/        (dados do sistema)
   ├── auth_info/         (autenticação WhatsApp)
   ├── uploads/           (imagens dos anúncios)
   └── logs/              (arquivos de log)

🚀 COMO INICIAR:

   Opção 1 - Comando NPM:
   npm start

   Opção 2 - Script direto:
   Windows: start.bat
   Linux/Mac: ./start.sh

   Opção 3 - Node direto:
   node server.js

📱 PRÓXIMOS PASSOS:

   1. Execute: npm start
   2. Abra: http://localhost:${this.config.server.port}
   3. Clique em "Conectar" no painel
   4. Escaneie o QR Code com seu WhatsApp
   5. Configure seus grupos e anúncios!

⚙️  CONFIGURAÇÕES:
   • Porta do servidor: ${this.config.server.port}
   • Delay entre envios: ${this.config.whatsapp.sendDelay/1000}s
   • Timezone: ${this.config.scheduler.timezone}
   • Max upload: ${this.config.upload.maxFileSize/(1024*1024)}MB

📋 COMANDOS ÚTEIS:
   npm run dev          (modo desenvolvimento)
   npm run reset-auth   (resetar conexão WhatsApp)
   npm run backup-data  (backup dos dados)
   npm run clear-logs   (limpar logs)

🆘 SUPORTE:
   • Verifique logs em ./logs/
   • Consulte histórico no painel web
   • Documentação completa no README.md

⚠️  IMPORTANTE:
   • Faça backup regular da pasta panel_data/
   • Use com responsabilidade (evite spam)
   • Monitore logs para detectar problemas

🎯 TUDO PRONTO! Execute 'npm start' para começar!

`);

        const startNow = await this.askQuestion('🚀 Deseja iniciar o bot agora? (s/N): ');
        
        if (startNow && startNow.toLowerCase().startsWith('s')) {
            console.log('\n🚀 Iniciando servidor...\n');
            try {
                require('./server.js');
            } catch (error) {
                console.log('⚠️  Execute manualmente: npm start');
            }
        } else {
            console.log('\n✅ Setup finalizado! Execute "npm start" quando estiver pronto.\n');
        }
    }

    askQuestion(question) {
        return new Promise((resolve) => {
            rl.question(question, (answer) => {
                resolve(answer.trim());
            });
        });
    }
}

// Executar setup se chamado diretamente
if (require.main === module) {
    const wizard = new SetupWizard();
    wizard.run().catch(error => {
        console.error('❌ Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = SetupWizard;