const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const moment = require('moment-timezone');

// Importar configurações (se existir, senão usar defaults)
let config;
try {
    config = require('./config');
} catch (error) {
    // Configurações padrão se o arquivo config.js não existir
    config = {
        server: {
            port: process.env.PORT || 3000,
            jwtSecret: 'wa_divulgacoes_secret_2025_altere_esta_chave',
            bcryptRounds: 10
        },
        upload: {
            maxFileSize: 10 * 1024 * 1024, // 10MB
            allowedExtensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
            uploadDir: './uploads'
        },
        socket: {
            cors: { origin: "*", methods: ["GET", "POST"] }
        }
    };
}

const WhatsAppService = require('./services/whatsappService');
const DatabaseService = require('./services/databaseService');
const SchedulerService = require('./services/schedulerService');
const AntiSpamService = require('./services/antiSpamService');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, config.socket);

const JWT_SECRET = config.server.jwtSecret;
const PORT = config.server.port;

// Middlewares
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Configuração do multer para upload de imagens
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(config.upload.uploadDir, req.user.id);
        fs.ensureDirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: config.upload.maxFileSize },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase().slice(1);
        if (config.upload.allowedExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Apenas imagens são permitidas'));
        }
    }
});

// Serviços
const db = new DatabaseService();
const whatsappService = new WhatsAppService(io);
const scheduler = new SchedulerService(db, whatsappService);
const antiSpam = new AntiSpamService(db);

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido' });
        }
        req.user = user;
        next();
    });
};

// Rotas de autenticação
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Dados obrigatórios não fornecidos' });
        }

        const existingUser = db.getUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ error: 'Email já cadastrado' });
        }

        const hashedPassword = await bcrypt.hash(password, config.server.bcryptRounds);
        const userId = uuidv4();
        
        const user = {
            id: userId,
            username,
            email,
            password: hashedPassword,
            createdAt: new Date().toISOString(),
            whatsappConnected: false
        };

        db.createUser(user);
        
        const token = jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: '7d' });
        
        res.json({ 
            message: 'Usuário criado com sucesso',
            token,
            user: { id: userId, username, email }
        });
    } catch (error) {
        console.error('Erro no registro:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = db.getUserByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: '7d' });
        
        res.json({ 
            token,
            user: { 
                id: user.id, 
                username: user.username, 
                email: user.email,
                whatsappConnected: user.whatsappConnected
            }
        });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Rotas do WhatsApp
app.post('/api/whatsapp/connect', authenticateToken, async (req, res) => {
    try {
        console.log(`Tentativa de conexão WhatsApp para usuário ${req.user.id}`);
        
        // Verificar se já está conectado
        if (whatsappService.isUserConnected(req.user.id)) {
            console.log(`Usuário ${req.user.id} já conectado`);
            return res.json({ message: 'WhatsApp já conectado' });
        }

        const qr = await whatsappService.connectUser(req.user.id);
        
        if (qr) {
            console.log(`QR Code gerado para usuário ${req.user.id}`);
            res.json({ qr, message: 'QR Code gerado. Escaneie para conectar.' });
        } else {
            console.log(`WhatsApp conectado para usuário ${req.user.id} sem QR Code`);
            res.json({ message: 'WhatsApp conectado com sucesso' });
        }
    } catch (error) {
        console.error(`Erro ao conectar WhatsApp para usuário ${req.user.id}:`, error);
        res.status(500).json({ error: 'Erro ao conectar WhatsApp' });
    }
});

app.post('/api/whatsapp/disconnect', authenticateToken, async (req, res) => {
    try {
        await whatsappService.disconnectUser(req.user.id);
        res.json({ message: 'WhatsApp desconectado com sucesso' });
    } catch (error) {
        console.error('Erro ao desconectar WhatsApp:', error);
        res.status(500).json({ error: 'Erro ao desconectar WhatsApp' });
    }
});

// Rota para verificar status do WhatsApp
app.get('/api/whatsapp/status', authenticateToken, async (req, res) => {
    try {
        const status = await whatsappService.checkConnectionStatus(req.user.id);
        const isConnected = whatsappService.isUserConnected(req.user.id);
        
        res.json({ 
            connected: isConnected,
            status,
            userId: req.user.id
        });
    } catch (error) {
        console.error('Erro ao verificar status WhatsApp:', error);
        res.status(500).json({ error: 'Erro ao verificar status WhatsApp' });
    }
});

app.get('/api/whatsapp/groups', authenticateToken, async (req, res) => {
    try {
        // Verificar se está realmente conectado antes de buscar grupos
        if (!whatsappService.isUserConnected(req.user.id)) {
            return res.status(400).json({ 
                error: 'WhatsApp não conectado. Conecte primeiro antes de buscar grupos.',
                groups: [] 
            });
        }

        const groups = await whatsappService.getGroups(req.user.id);
        res.json({ groups });
    } catch (error) {
        console.error('Erro ao buscar grupos:', error);
        res.status(500).json({ 
            error: error.message || 'Erro ao buscar grupos',
            groups: []
        });
    }
});

// Rotas de anúncios
app.post('/api/ads', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        const { title, message, groups, scheduleDate, scheduleTime, repeat, active } = req.body;

        if (!title || !message) {
            return res.status(400).json({ error: 'Título e mensagem são obrigatórios' });
        }

        const adId = uuidv4();
        const ad = {
            id: adId,
            userId: req.user.id,
            title,
            message,
            image: req.file ? req.file.path : null,
            groups: JSON.parse(groups || '[]'),
            scheduleDate: scheduleDate || null,
            scheduleTime: scheduleTime || null,
            repeat: repeat || 'once',
            active: active === 'true',
            createdAt: new Date().toISOString(),
            stats: {
                sent: 0,
                failed: 0,
                lastSent: null
            }
        };

        db.createAd(ad);

        if (ad.scheduleDate && ad.scheduleTime && ad.active) {
            scheduler.scheduleAd(ad);
        }

        res.json({ message: 'Anúncio criado com sucesso', ad });
    } catch (error) {
        console.error('Erro ao criar anúncio:', error);
        res.status(500).json({ error: 'Erro ao criar anúncio' });
    }
});

app.get('/api/ads', authenticateToken, (req, res) => {
    try {
        const ads = db.getUserAds(req.user.id);
        res.json({ ads });
    } catch (error) {
        console.error('Erro ao buscar anúncios:', error);
        res.status(500).json({ error: 'Erro ao buscar anúncios' });
    }
});

app.put('/api/ads/:id', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        const { id } = req.params;
        const { title, message, groups, scheduleDate, scheduleTime, repeat, active } = req.body;

        const existingAd = db.getAd(id);
        if (!existingAd || existingAd.userId !== req.user.id) {
            return res.status(404).json({ error: 'Anúncio não encontrado' });
        }

        const updatedAd = {
            ...existingAd,
            title: title || existingAd.title,
            message: message || existingAd.message,
            image: req.file ? req.file.path : existingAd.image,
            groups: groups ? JSON.parse(groups) : existingAd.groups,
            scheduleDate: scheduleDate || existingAd.scheduleDate,
            scheduleTime: scheduleTime || existingAd.scheduleTime,
            repeat: repeat || existingAd.repeat,
            active: active !== undefined ? active === 'true' : existingAd.active,
            updatedAt: new Date().toISOString()
        };

        db.updateAd(id, updatedAd);

        // Reagendar se necessário
        scheduler.cancelScheduledAd(id);
        if (updatedAd.scheduleDate && updatedAd.scheduleTime && updatedAd.active) {
            scheduler.scheduleAd(updatedAd);
        }

        res.json({ message: 'Anúncio atualizado com sucesso', ad: updatedAd });
    } catch (error) {
        console.error('Erro ao atualizar anúncio:', error);
        res.status(500).json({ error: 'Erro ao atualizar anúncio' });
    }
});

app.delete('/api/ads/:id', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;
        
        const ad = db.getAd(id);
        if (!ad || ad.userId !== req.user.id) {
            return res.status(404).json({ error: 'Anúncio não encontrado' });
        }

        scheduler.cancelScheduledAd(id);
        
        if (ad.image && fs.existsSync(ad.image)) {
            fs.removeSync(ad.image);
        }

        db.deleteAd(id);
        
        res.json({ message: 'Anúncio excluído com sucesso' });
    } catch (error) {
        console.error('Erro ao excluir anúncio:', error);
        res.status(500).json({ error: 'Erro ao excluir anúncio' });
    }
});

app.post('/api/ads/:id/toggle', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;
        
        const ad = db.getAd(id);
        if (!ad || ad.userId !== req.user.id) {
            return res.status(404).json({ error: 'Anúncio não encontrado' });
        }

        const updatedAd = { ...ad, active: !ad.active };
        db.updateAd(id, updatedAd);

        scheduler.cancelScheduledAd(id);
        if (updatedAd.scheduleDate && updatedAd.scheduleTime && updatedAd.active) {
            scheduler.scheduleAd(updatedAd);
        }

        res.json({ 
            message: `Anúncio ${updatedAd.active ? 'ativado' : 'pausado'} com sucesso`,
            ad: updatedAd
        });
    } catch (error) {
        console.error('Erro ao alterar status do anúncio:', error);
        res.status(500).json({ error: 'Erro ao alterar status do anúncio' });
    }
});

// Rota de estatísticas
app.get('/api/stats', authenticateToken, (req, res) => {
    try {
        const ads = db.getUserAds(req.user.id);
        const stats = {
            totalAds: ads.length,
            activeAds: ads.filter(ad => ad.active).length,
            totalSent: ads.reduce((sum, ad) => sum + (ad.stats?.sent || 0), 0),
            totalFailed: ads.reduce((sum, ad) => sum + (ad.stats?.failed || 0), 0)
        };
        
        res.json({ stats });
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        res.status(500).json({ error: 'Erro ao buscar estatísticas' });
    }
});

// Rota para servir imagens
app.get('/uploads/:userId/:filename', authenticateToken, (req, res) => {
    try {
        const { userId, filename } = req.params;
        const filepath = path.join(__dirname, 'uploads', userId, filename);
        
        if (req.user.id !== userId) {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        
        if (fs.existsSync(filepath)) {
            res.sendFile(filepath);
        } else {
            res.status(404).json({ error: 'Imagem não encontrada' });
        }
    } catch (error) {
        console.error('Erro ao servir imagem:', error);
        res.status(500).json({ error: 'Erro ao servir imagem' });
    }
});

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO para atualizações em tempo real
io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);
    
    socket.on('join-user', (userId) => {
        socket.join(userId);
        console.log(`Usuário ${userId} entrou na sala`);
    });
    
    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
    });
});

// Inicializar serviços
async function initializeServices() {
    try {
        await db.initialize();
        await whatsappService.initialize();
        scheduler.initialize();
        
        // Limpar conexões órfãs a cada 5 minutos
        setInterval(() => {
            try {
                const cleaned = whatsappService.cleanupConnections();
                if (cleaned > 0) {
                    console.log(`${cleaned} conexões órfãs limpas`);
                }
            } catch (error) {
                console.error('Erro na limpeza de conexões:', error);
            }
        }, 5 * 60 * 1000);
        
        console.log('Todos os serviços inicializados com sucesso');
    } catch (error) {
        console.error('Erro ao inicializar serviços:', error);
        process.exit(1);
    }
}

// Tratamento de erros não capturados
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Recebido SIGINT, desconectando usuários...');
    
    const connectedUsers = whatsappService.getAllConnections();
    Promise.all(connectedUsers.map(userId => whatsappService.disconnectUser(userId)))
        .then(() => {
            console.log('Todos os usuários desconectados');
            process.exit(0);
        })
        .catch(error => {
            console.error('Erro ao desconectar usuários:', error);
            process.exit(1);
        });
});

// Iniciar servidor
initializeServices().then(() => {
    server.listen(PORT, () => {
        console.log(`
╔══════════════════════════════════════╗
║        🚀 WA DIVULGAÇÕES 🚀         ║
║                                      ║
║  Sistema de Disparador de Anúncios   ║
║            WhatsApp                  ║
║                                      ║
║  📡 Servidor: http://localhost:${PORT}  ║
║  📱 WhatsApp: Baileys 6.6.0          ║
║  🔒 Anti-Spam: Ativo                 ║
║  ⏰ Agendador: Ativo                 ║
║                                      ║
║  👨‍💻 Wallysson Studio Dv © 2025      ║
╚══════════════════════════════════════╝
        `);
    });
});

module.exports = app;