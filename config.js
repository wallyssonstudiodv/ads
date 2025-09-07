module.exports = {
    // Configurações do servidor
    server: {
        port: process.env.PORT || 3000,
        jwtSecret: process.env.JWT_SECRET || 'wa_divulgacoes_secret_2025_altere_esta_chave',
        bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 10
    },

    // Configurações do WhatsApp
    whatsapp: {
        browser: ['WA Divulgações', 'Chrome', '1.0.0'],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        retryRequestDelayMs: 1000,
        maxMsgRetryCount: 5,
        qrTimeout: 20000,
        reconnectDelay: 5000,
        printQRInTerminal: true,
        markOnlineOnConnect: true,
        emitOwnEvents: true,
        generateHighQualityLinkPreview: true
    },

    // Configurações de upload
    upload: {
        maxFileSize: 10 * 1024 * 1024, // 10MB
        allowedExtensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        uploadDir: './uploads'
    },

    // Configurações do anti-spam
    antiSpam: {
        enabled: true,
        maxMessagesPerHour: 10,
        cooldownMinutes: 60,
        messageBroadcastDelay: 2000, // 2 segundos entre mensagens
        cleanupInterval: 60 * 60 * 1000 // 1 hora
    },

    // Configurações do agendador
    scheduler: {
        timezone: 'America/Sao_Paulo',
        cleanupInterval: 5 * 60 * 1000 // 5 minutos
    },

    // Configurações do banco de dados
    database: {
        dataDir: './data',
        authDir: './auth',
        backupEnabled: true,
        backupInterval: 24 * 60 * 60 * 1000, // 24 horas
        backupRetention: 30 // dias
    },

    // Configurações de logs
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        file: process.env.LOG_FILE || 'logs/app.log',
        verbose: process.env.VERBOSE_LOGS === 'true'
    },

    // Configurações do Socket.IO
    socket: {
        cors: {
            origin: process.env.SOCKET_CORS_ORIGIN || "*",
            methods: ["GET", "POST"]
        },
        pingTimeout: 60000,
        pingInterval: 25000
    }
};