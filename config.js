// Configurações do Sistema WhatsApp Bot Panel
module.exports = {
    // Configurações do Servidor
    server: {
        port: process.env.PORT || 3000,
        host: process.env.HOST || 'localhost',
        cors: {
            origin: process.env.CORS_ORIGIN || "*",
            methods: ["GET", "POST", "PUT", "DELETE"]
        }
    },

    // Configurações do WhatsApp
    whatsapp: {
        // Tempo limite para gerar QR Code (milissegundos)
        qrTimeout: 60000,
        
        // Intervalo entre tentativas de reconexão (milissegundos)
        reconnectInterval: 5000,
        
        // Número máximo de tentativas de reconexão
        maxReconnectAttempts: 10,
        
        // Delay entre envios para evitar spam (milissegundos)
        sendDelay: 2000,
        
        // Configurações do Baileys
        baileys: {
            version: [2, 2413, 1],
            browser: ['WhatsApp Bot Panel', 'Chrome', '10.15.7'],
            printQRInTerminal: false,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            markOnlineOnConnect: true
        }
    },

    // Configurações de Upload
    upload: {
        // Tamanho máximo de arquivo (bytes)
        maxFileSize: 10 * 1024 * 1024, // 10MB
        
        // Tipos de arquivo permitidos
        allowedMimeTypes: [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp'
        ],
        
        // Pasta de upload
        uploadDir: './uploads',
        
        // Prefixo para nomes de arquivos
        filePrefix: 'ad_'
    },

    // Configurações do Banco de Dados (JSON)
    database: {
        // Pasta onde os dados serão salvos
        dataDir: './panel_data',
        
        // Arquivos de dados
        files: {
            groups: 'groups.json',
            ads: 'ads.json',
            schedules: 'schedules.json',
            history: 'history.json',
            config: 'config.json'
        },
        
        // Configurações de backup
        backup: {
            // Fazer backup automático
            enabled: true,
            
            // Intervalo de backup (milissegundos)
            interval: 60 * 60 * 1000, // 1 hora
            
            // Número máximo de backups
            maxBackups: 24,
            
            // Pasta de backup
            backupDir: './backups'
        }
    },

    // Configurações do Histórico
    history: {
        // Número máximo de entradas no histórico
        maxEntries: 5000,
        
        // Tipos de eventos para registrar
        eventTypes: [
            'connection',
            'disconnection',
            'ad_created',
            'ad_updated',
            'ad_deleted',
            'ad_toggled',
            'schedule_created',
            'schedule_updated',
            'schedule_deleted',
            'schedule_toggled',
            'scheduled_send',
            'manual_send',
            'groups_updated',
            'error'
        ],
        
        // Formato de timestamp
        timestampFormat: 'ISO', // ISO, UTC, LOCAL
        
        // Incluir dados detalhados nos logs
        includeDetails: true
    },

    // Configurações de Agendamento
    scheduler: {
        // Timezone padrão
        timezone: 'America/Sao_Paulo',
        
        // Intervalo de verificação do cron (cron expression)
        cronInterval: '* * * * *', // A cada minuto
        
        // Máximo de agendamentos simultâneos
        maxSchedules: 100,
        
        // Reagendar automaticamente após execução
        autoReschedule: true,
        
        // Dias da semana válidos
        validDays: [
            'sunday', 'monday', 'tuesday', 'wednesday',
            'thursday', 'friday', 'saturday'
        ]
    },

    // Configurações de Segurança
    security: {
        // Rate limiting para API
        rateLimit: {
            windowMs: 15 * 60 * 1000, // 15 minutos
            max: 1000 // máximo de requests por IP
        },
        
        // Validação de entrada
        validation: {
            maxTitleLength: 100,
            maxContentLength: 4096,
            maxScheduleNameLength: 50
        },
        
        // Sanitização de dados
        sanitize: {
            removeHtml: true,
            removeScripts: true,
            maxDepth: 10
        }
    },

    // Configurações de Performance
    performance: {
        // Compressão gzip
        compression: true,
        
        // Cache estático
        staticCache: {
            maxAge: 24 * 60 * 60 * 1000 // 24 horas
        },
        
        // Pool de conexões
        connectionPool: {
            min: 2,
            max: 10,
            acquireTimeoutMillis: 60000,
            idleTimeoutMillis: 30000
        }
    },

    // Configurações de Log
    logging: {
        // Nível de log
        level: process.env.LOG_LEVEL || 'info',
        
        // Logs no console
        console: true,
        
        // Logs em arquivo
        file: {
            enabled: true,
            filename: './logs/bot.log',
            maxSize: '10m',
            maxFiles: 5
        },
        
        // Formato dos logs
        format: 'combined', // combined, common, dev, short, tiny
        
        // Logs de erro separados
        errorLog: './logs/error.log'
    },

    // Configurações da Interface Web
    webInterface: {
        // Título da aplicação
        title: 'WhatsApp Bot Panel',
        
        // Tema padrão
        theme: 'modern',
        
        // Configurações de paginação
        pagination: {
            defaultLimit: 20,
            maxLimit: 100
        },
        
        // Atualização automática
        autoRefresh: {
            enabled: true,
            interval: 30000 // 30 segundos
        },
        
        // Configurações do Socket.IO
        socket: {
            pingTimeout: 60000,
            pingInterval: 25000,
            transports: ['websocket', 'polling']
        }
    },

    // Configurações de Notificações
    notifications: {
        // Notificações no painel web
        web: {
            enabled: true,
            autoHide: true,
            hideTimeout: 5000
        },
        
        // Tipos de notificação
        types: {
            success: { color: '#10b981', icon: 'check-circle' },
            error: { color: '#ef4444', icon: 'exclamation-circle' },
            warning: { color: '#f59e0b', icon: 'exclamation-triangle' },
            info: { color: '#3b82f6', icon: 'info-circle' }
        }
    },

    // Configurações de Desenvolvimento
    development: {
        // Debug mode
        debug: process.env.NODE_ENV === 'development',
        
        // Hot reload
        hotReload: false,
        
        // Mock data para testes
        mockData: false,
        
        // Logs verbosos
        verbose: false
    },

    // Configurações de Produção
    production: {
        // Minificar responses
        minify: true,
        
        // Headers de segurança
        securityHeaders: true,
        
        // Monitoramento
        monitoring: {
            enabled: false,
            endpoint: process.env.MONITORING_ENDPOINT
        },
        
        // SSL/HTTPS
        ssl: {
            enabled: false,
            cert: process.env.SSL_CERT,
            key: process.env.SSL_KEY
        }
    },

    // Configurações de Mensagens Padrão
    messages: {
        // Mensagens do sistema
        system: {
            connecting: 'Conectando ao WhatsApp...',
            connected: 'Bot conectado com sucesso!',
            disconnected: 'Bot desconectado',
            qrGenerated: 'QR Code gerado. Escaneie para conectar.',
            reconnecting: 'Tentando reconectar...',
            error: 'Erro no sistema: {error}'
        },
        
        // Mensagens de validação
        validation: {
            required: 'Campo obrigatório',
            invalid: 'Valor inválido',
            tooLong: 'Valor muito longo',
            tooShort: 'Valor muito curto',
            invalidFormat: 'Formato inválido'
        },
        
        // Mensagens de sucesso
        success: {
            saved: 'Dados salvos com sucesso',
            deleted: 'Item deletado com sucesso',
            sent: 'Mensagem enviada com sucesso',
            updated: 'Dados atualizados com sucesso'
        }
    },

    // Utilitários e Helpers
    utils: {
        // Formato de data padrão
        dateFormat: 'DD/MM/YYYY HH:mm:ss',
        
        // Timeout para operações
        operationTimeout: 30000,
        
        // Retry automático para falhas
        retryConfig: {
            attempts: 3,
            delay: 1000,
            backoff: 2
        },
        
        // Limpeza automática de arquivos temporários
        cleanup: {
            enabled: true,
            interval: 24 * 60 * 60 * 1000, // 24 horas
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dias
        }
    }
};

// Validação de configurações críticas
function validateConfig() {
    const config = module.exports;
    
    // Verificar porta
    if (!config.server.port || config.server.port < 1 || config.server.port > 65535) {
        throw new Error('Porta do servidor inválida');
    }
    
    // Verificar diretórios
    const fs = require('fs');
    const path = require('path');
    
    const dirs = [
        config.upload.uploadDir,
        config.database.dataDir
    ];
    
    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
    
    // Verificar backup se habilitado
    if (config.database.backup.enabled) {
        if (!fs.existsSync(config.database.backup.backupDir)) {
            fs.mkdirSync(config.database.backup.backupDir, { recursive: true });
        }
    }
    
    console.log('✅ Configurações validadas com sucesso');
    return true;
}

// Carregar configurações do ambiente
function loadEnvironmentConfig() {
    const config = module.exports;
    
    // Sobrescrever com variáveis de ambiente se existirem
    if (process.env.WHATSAPP_SEND_DELAY) {
        config.whatsapp.sendDelay = parseInt(process.env.WHATSAPP_SEND_DELAY);
    }
    
    if (process.env.MAX_FILE_SIZE) {
        config.upload.maxFileSize = parseInt(process.env.MAX_FILE_SIZE);
    }
    
    if (process.env.TIMEZONE) {
        config.scheduler.timezone = process.env.TIMEZONE;
    }
    
    if (process.env.MAX_HISTORY_ENTRIES) {
        config.history.maxEntries = parseInt(process.env.MAX_HISTORY_ENTRIES);
    }
    
    console.log('⚙️  Configurações de ambiente carregadas');
}

// Exportar funções utilitárias
module.exports.validateConfig = validateConfig;
module.exports.loadEnvironmentConfig = loadEnvironmentConfig;

// Auto-validar ao carregar
if (require.main !== module) {
    try {
        loadEnvironmentConfig();
        validateConfig();
    } catch (error) {
        console.error('❌ Erro nas configurações:', error.message);
        process.exit(1);
    }
}