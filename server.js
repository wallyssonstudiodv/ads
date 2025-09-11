const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { 
    default: makeWASocket, 
    DisconnectReason, 
    useMultiFileAuthState,
    fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');

class WhatsAppBotPanel {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        
        this.sock = null;
        this.isConnected = false;
        this.qrCode = null;
        
        // Configuração de pastas
        this.dataPath = './panel_data';
        this.authPath = './auth_info';
        this.uploadsPath = './uploads';
        
        this.setupDirectories();
        this.initializeData();
        this.setupMiddlewares();
        this.setupRoutes();
        this.setupSocketHandlers();
        this.startCronJobs();
        
        this.startServer();
    }
    
    setupDirectories() {
        [this.dataPath, this.authPath, this.uploadsPath].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }
    
    initializeData() {
        this.files = {
            groups: path.join(this.dataPath, 'groups.json'),
            ads: path.join(this.dataPath, 'ads.json'),
            schedules: path.join(this.dataPath, 'schedules.json'),
            history: path.join(this.dataPath, 'history.json'),
            config: path.join(this.dataPath, 'config.json')
        };
        
        // Inicializar arquivos se não existirem
        Object.entries(this.files).forEach(([key, file]) => {
            if (!fs.existsSync(file)) {
                let defaultData = {};
                if (key === 'history') defaultData = [];
                if (key === 'config') defaultData = {
                    botActive: false,
                    timezone: 'America/Sao_Paulo'
                };
                fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
            }
        });
        
        this.loadAllData();
    }
    
    loadAllData() {
        try {
            this.groups = JSON.parse(fs.readFileSync(this.files.groups, 'utf8'));
            this.ads = JSON.parse(fs.readFileSync(this.files.ads, 'utf8'));
            this.schedules = JSON.parse(fs.readFileSync(this.files.schedules, 'utf8'));
            this.history = JSON.parse(fs.readFileSync(this.files.history, 'utf8'));
            this.config = JSON.parse(fs.readFileSync(this.files.config, 'utf8'));
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
        }
    }
    
    saveData(type) {
        try {
            const data = this[type];
            fs.writeFileSync(this.files[type], JSON.stringify(data, null, 2));
            this.io.emit('dataUpdated', { type, data });
        } catch (error) {
            console.error(`Erro ao salvar ${type}:`, error);
        }
    }
    
    setupMiddlewares() {
        this.app.use(cors());
        this.app.use(express.json({ limit: '50mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
        this.app.use('/uploads', express.static(this.uploadsPath));
        this.app.use(express.static('public'));
        
        // Configurar multer para upload de imagens
        this.upload = multer({
            storage: multer.diskStorage({
                destination: this.uploadsPath,
                filename: (req, file, cb) => {
                    cb(null, Date.now() + '-' + file.originalname);
                }
            }),
            limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
            fileFilter: (req, file, cb) => {
                if (file.mimetype.startsWith('image/')) {
                    cb(null, true);
                } else {
                    cb(new Error('Apenas imagens são permitidas!'));
                }
            }
        });
    }
    
    setupRoutes() {
        // Rota principal - serve o painel
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });
        
        // API Routes
        
        // Status do bot
        this.app.get('/api/status', (req, res) => {
            res.json({
                connected: this.isConnected,
                qrCode: this.qrCode,
                config: this.config,
                stats: {
                    groups: Object.keys(this.groups).length,
                    ads: Object.keys(this.ads).length,
                    schedules: Object.keys(this.schedules).length,
                    history: this.history.length
                }
            });
        });
        
        // Conectar/Desconectar bot
        this.app.post('/api/connect', (req, res) => {
            if (!this.isConnected) {
                this.initializeWhatsApp();
                res.json({ message: 'Iniciando conexão...' });
            } else {
                res.json({ message: 'Bot já conectado' });
            }
        });
        
        this.app.post('/api/disconnect', (req, res) => {
            if (this.sock) {
                this.sock.end();
                this.isConnected = false;
                this.qrCode = null;
                res.json({ message: 'Bot desconectado' });
                this.io.emit('connectionStatus', { connected: false, qrCode: null });
            } else {
                res.json({ message: 'Bot não estava conectado' });
            }
        });
        
        // Grupos
        this.app.get('/api/groups', (req, res) => {
            res.json(this.groups);
        });
        
        this.app.post('/api/groups/refresh', async (req, res) => {
            if (this.sock && this.isConnected) {
                await this.loadGroups();
                res.json({ message: 'Lista de grupos atualizada', groups: this.groups });
            } else {
                res.status(400).json({ error: 'Bot não conectado' });
            }
        });
        
        this.app.post('/api/groups/:groupId/toggle', (req, res) => {
            const { groupId } = req.params;
            if (this.groups[groupId]) {
                this.groups[groupId].selected = !this.groups[groupId].selected;
                this.saveData('groups');
                res.json({ message: 'Status do grupo atualizado' });
            } else {
                res.status(404).json({ error: 'Grupo não encontrado' });
            }
        });
        
        // Anúncios
        this.app.get('/api/ads', (req, res) => {
            res.json(this.ads);
        });
        
        this.app.post('/api/ads', this.upload.single('image'), (req, res) => {
            try {
                const { type, title, content } = req.body;
                const adId = 'ad_' + Date.now();
                
                const newAd = {
                    id: adId,
                    type,
                    title,
                    content,
                    createdAt: new Date().toISOString(),
                    isActive: true
                };
                
                if (type === 'image' && req.file) {
                    newAd.imagePath = `/uploads/${req.file.filename}`;
                }
                
                this.ads[adId] = newAd;
                this.saveData('ads');
                
                this.addToHistory('ad_created', `Anúncio criado: ${title}`, adId);
                
                res.json({ message: 'Anúncio criado com sucesso', ad: newAd });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        this.app.put('/api/ads/:adId', this.upload.single('image'), (req, res) => {
            const { adId } = req.params;
            if (!this.ads[adId]) {
                return res.status(404).json({ error: 'Anúncio não encontrado' });
            }
            
            try {
                const { type, title, content } = req.body;
                
                this.ads[adId] = {
                    ...this.ads[adId],
                    type,
                    title,
                    content,
                    updatedAt: new Date().toISOString()
                };
                
                if (type === 'image' && req.file) {
                    this.ads[adId].imagePath = `/uploads/${req.file.filename}`;
                }
                
                this.saveData('ads');
                this.addToHistory('ad_updated', `Anúncio atualizado: ${title}`, adId);
                
                res.json({ message: 'Anúncio atualizado com sucesso', ad: this.ads[adId] });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        this.app.delete('/api/ads/:adId', (req, res) => {
            const { adId } = req.params;
            if (this.ads[adId]) {
                const title = this.ads[adId].title;
                delete this.ads[adId];
                this.saveData('ads');
                this.addToHistory('ad_deleted', `Anúncio deletado: ${title}`, adId);
                res.json({ message: 'Anúncio deletado com sucesso' });
            } else {
                res.status(404).json({ error: 'Anúncio não encontrado' });
            }
        });
        
        this.app.post('/api/ads/:adId/toggle', (req, res) => {
            const { adId } = req.params;
            if (this.ads[adId]) {
                this.ads[adId].isActive = !this.ads[adId].isActive;
                this.saveData('ads');
                const status = this.ads[adId].isActive ? 'ativado' : 'desativado';
                this.addToHistory('ad_toggled', `Anúncio ${status}: ${this.ads[adId].title}`, adId);
                res.json({ message: `Anúncio ${status} com sucesso` });
            } else {
                res.status(404).json({ error: 'Anúncio não encontrado' });
            }
        });
        
        // Agendamentos
        this.app.get('/api/schedules', (req, res) => {
            res.json(this.schedules);
        });
        
        this.app.post('/api/schedules', (req, res) => {
            try {
                const { name, adId, days, time, isActive = true } = req.body;
                const scheduleId = 'schedule_' + Date.now();
                
                const newSchedule = {
                    id: scheduleId,
                    name,
                    adId,
                    days,
                    time,
                    isActive,
                    createdAt: new Date().toISOString(),
                    lastRun: null,
                    nextRun: this.calculateNextRun(days, time)
                };
                
                this.schedules[scheduleId] = newSchedule;
                this.saveData('schedules');
                this.addToHistory('schedule_created', `Agendamento criado: ${name}`, scheduleId);
                
                res.json({ message: 'Agendamento criado com sucesso', schedule: newSchedule });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        this.app.put('/api/schedules/:scheduleId', (req, res) => {
            const { scheduleId } = req.params;
            if (!this.schedules[scheduleId]) {
                return res.status(404).json({ error: 'Agendamento não encontrado' });
            }
            
            try {
                const { name, adId, days, time, isActive } = req.body;
                
                this.schedules[scheduleId] = {
                    ...this.schedules[scheduleId],
                    name,
                    adId,
                    days,
                    time,
                    isActive,
                    updatedAt: new Date().toISOString(),
                    nextRun: this.calculateNextRun(days, time)
                };
                
                this.saveData('schedules');
                this.addToHistory('schedule_updated', `Agendamento atualizado: ${name}`, scheduleId);
                
                res.json({ message: 'Agendamento atualizado com sucesso', schedule: this.schedules[scheduleId] });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        this.app.delete('/api/schedules/:scheduleId', (req, res) => {
            const { scheduleId } = req.params;
            if (this.schedules[scheduleId]) {
                const name = this.schedules[scheduleId].name;
                delete this.schedules[scheduleId];
                this.saveData('schedules');
                this.addToHistory('schedule_deleted', `Agendamento deletado: ${name}`, scheduleId);
                res.json({ message: 'Agendamento deletado com sucesso' });
            } else {
                res.status(404).json({ error: 'Agendamento não encontrado' });
            }
        });
        
        this.app.post('/api/schedules/:scheduleId/toggle', (req, res) => {
            const { scheduleId } = req.params;
            if (this.schedules[scheduleId]) {
                this.schedules[scheduleId].isActive = !this.schedules[scheduleId].isActive;
                this.saveData('schedules');
                const status = this.schedules[scheduleId].isActive ? 'ativado' : 'desativado';
                this.addToHistory('schedule_toggled', `Agendamento ${status}: ${this.schedules[scheduleId].name}`, scheduleId);
                res.json({ message: `Agendamento ${status} com sucesso` });
            } else {
                res.status(404).json({ error: 'Agendamento não encontrado' });
            }
        });
        
        // Envio manual
        this.app.post('/api/send-now', async (req, res) => {
            const { adId } = req.body;
            
            if (!this.ads[adId]) {
                return res.status(404).json({ error: 'Anúncio não encontrado' });
            }
            
            if (!this.isConnected) {
                return res.status(400).json({ error: 'Bot não conectado' });
            }
            
            try {
                const result = await this.sendAdToSelectedGroups(adId);
                this.addToHistory('manual_send', `Envio manual do anúncio: ${this.ads[adId].title}`, adId, result);
                res.json({ message: 'Anúncio enviado com sucesso', result });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Histórico
        this.app.get('/api/history', (req, res) => {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + limit;
            
            const paginatedHistory = this.history.slice().reverse().slice(startIndex, endIndex);
            
            res.json({
                history: paginatedHistory,
                pagination: {
                    page,
                    limit,
                    total: this.history.length,
                    totalPages: Math.ceil(this.history.length / limit)
                }
            });
        });
        
        this.app.delete('/api/history', (req, res) => {
            this.history = [];
            this.saveData('history');
            res.json({ message: 'Histórico limpo com sucesso' });
        });
        
        // Configurações
        this.app.get('/api/config', (req, res) => {
            res.json(this.config);
        });
        
        this.app.put('/api/config', (req, res) => {
            this.config = { ...this.config, ...req.body };
            this.saveData('config');
            res.json({ message: 'Configurações atualizadas com sucesso', config: this.config });
        });
    }
    
    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log('Cliente conectado ao painel:', socket.id);
            
            // Enviar status inicial
            socket.emit('connectionStatus', {
                connected: this.isConnected,
                qrCode: this.qrCode
            });
            
            socket.on('disconnect', () => {
                console.log('Cliente desconectado do painel:', socket.id);
            });
        });
    }
    
    async initializeWhatsApp() {
        try {
            const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
            const { version } = await fetchLatestBaileysVersion();
            
            this.sock = makeWASocket({
                version,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false,
                auth: state,
                generateHighQualityLinkPreview: true
            });
            
            this.sock.ev.on('creds.update', saveCreds);
            this.sock.ev.on('connection.update', this.handleConnection.bind(this));
            this.sock.ev.on('groups.upsert', this.handleGroupsUpdate.bind(this));
            
        } catch (error) {
            console.error('Erro ao inicializar WhatsApp:', error);
            this.addToHistory('error', `Erro ao conectar: ${error.message}`);
        }
    }
    
    handleConnection(update) {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            this.qrCode = qr;
            this.io.emit('connectionStatus', { connected: false, qrCode: qr });
            console.log('QR Code gerado');
        }
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            
            console.log('Conexão fechada:', lastDisconnect?.error);
            this.addToHistory('disconnection', `Conexão perdida: ${lastDisconnect?.error?.message}`);
            
            this.isConnected = false;
            this.qrCode = null;
            this.io.emit('connectionStatus', { connected: false, qrCode: null });
            
            if (shouldReconnect) {
                console.log('Tentando reconectar...');
                setTimeout(() => this.initializeWhatsApp(), 5000);
            }
        } else if (connection === 'open') {
            console.log('Bot conectado ao WhatsApp!');
            this.isConnected = true;
            this.qrCode = null;
            this.io.emit('connectionStatus', { connected: true, qrCode: null });
            this.addToHistory('connection', 'Bot conectado com sucesso');
            
            // Carregar grupos automaticamente
            setTimeout(() => this.loadGroups(), 2000);
        }
    }
    
    handleGroupsUpdate(groups) {
        console.log('Grupos atualizados:', groups.length);
        this.loadGroups();
    }
    
    async loadGroups() {
        if (!this.sock || !this.isConnected) return;
        
        try {
            const groups = await this.sock.groupFetchAllParticipating();
            
            Object.values(groups).forEach(group => {
                const groupId = group.id;
                
                // Manter status de seleção se já existir
                const existingSelected = this.groups[groupId]?.selected || false;
                
                this.groups[groupId] = {
                    id: groupId,
                    name: group.subject,
                    participants: group.participants.length,
                    description: group.desc || '',
                    selected: existingSelected,
                    lastUpdated: new Date().toISOString()
                };
            });
            
            this.saveData('groups');
            this.addToHistory('groups_updated', `${Object.keys(groups).length} grupos carregados`);
            
        } catch (error) {
            console.error('Erro ao carregar grupos:', error);
            this.addToHistory('error', `Erro ao carregar grupos: ${error.message}`);
        }
    }
    
    async sendAdToSelectedGroups(adId) {
        const ad = this.ads[adId];
        if (!ad || !ad.isActive) {
            throw new Error('Anúncio não encontrado ou inativo');
        }
        
        const selectedGroups = Object.values(this.groups).filter(g => g.selected);
        if (selectedGroups.length === 0) {
            throw new Error('Nenhum grupo selecionado');
        }
        
        const results = {
            success: 0,
            failed: 0,
            errors: []
        };
        
        for (const group of selectedGroups) {
            try {
                if (ad.type === 'text') {
                    await this.sock.sendMessage(group.id, { text: ad.content });
                } else if (ad.type === 'image' && ad.imagePath) {
                    const imagePath = path.join(__dirname, 'public', ad.imagePath);
                    if (fs.existsSync(imagePath)) {
                        const imageBuffer = fs.readFileSync(imagePath);
                        await this.sock.sendMessage(group.id, {
                            image: imageBuffer,
                            caption: ad.content
                        });
                    } else {
                        throw new Error('Imagem não encontrada');
                    }
                }
                
                results.success++;
                
                // Delay entre envios
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error) {
                console.error(`Erro ao enviar para grupo ${group.name}:`, error);
                results.failed++;
                results.errors.push({
                    group: group.name,
                    error: error.message
                });
            }
        }
        
        return results;
    }
    
    calculateNextRun(days, time) {
        const [hour, minute] = time.split(':').map(Number);
        const now = new Date();
        const today = now.getDay(); // 0 = domingo
        
        // Converter dias da semana
        const dayMap = {
            'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
            'thursday': 4, 'friday': 5, 'saturday': 6
        };
        
        const targetDays = days.map(day => dayMap[day]).sort((a, b) => a - b);
        
        for (let i = 0; i < 7; i++) {
            const checkDate = new Date(now);
            checkDate.setDate(now.getDate() + i);
            checkDate.setHours(hour, minute, 0, 0);
            
            const checkDay = checkDate.getDay();
            
            if (targetDays.includes(checkDay) && checkDate > now) {
                return checkDate.toISOString();
            }
        }
        
        return null;
    }
    
    startCronJobs() {
        // Verificar agendamentos a cada minuto
        cron.schedule('* * * * *', () => {
            this.checkSchedules();
        });
        
        console.log('Cron jobs iniciados');
    }
    
    async checkSchedules() {
        if (!this.isConnected) return;
        
        const now = new Date();
        
        Object.values(this.schedules).forEach(async (schedule) => {
            if (!schedule.isActive) return;
            
            const nextRun = new Date(schedule.nextRun);
            
            if (now >= nextRun) {
                try {
                    const result = await this.sendAdToSelectedGroups(schedule.adId);
                    
                    // Atualizar agendamento
                    schedule.lastRun = now.toISOString();
                    schedule.nextRun = this.calculateNextRun(schedule.days, schedule.time);
                    
                    this.saveData('schedules');
                    this.addToHistory('scheduled_send', `Envio agendado: ${schedule.name}`, schedule.adId, result);
                    
                    console.log(`Agendamento executado: ${schedule.name}`);
                    
                } catch (error) {
                    console.error(`Erro no agendamento ${schedule.name}:`, error);
                    this.addToHistory('error', `Erro no agendamento ${schedule.name}: ${error.message}`, schedule.id);
                }
            }
        });
    }
    
    addToHistory(type, message, relatedId = null, data = null) {
        const entry = {
            id: 'hist_' + Date.now(),
            type,
            message,
            relatedId,
            data,
            timestamp: new Date().toISOString()
        };
        
        this.history.push(entry);
        
        // Manter apenas os últimos 5000 registros
        if (this.history.length > 5000) {
            this.history = this.history.slice(-5000);
        }
        
        this.saveData('history');
        this.io.emit('newHistoryEntry', entry);
    }
    
    startServer() {
        const PORT = process.env.PORT || 3000;
        this.server.listen(PORT, () => {
            console.log(`🚀 Painel WhatsApp rodando em http://localhost:${PORT}`);
            console.log(`📱 Acesse o painel web para gerenciar o bot`);
        });
    }
}

// Inicializar o sistema
const botPanel = new WhatsAppBotPanel();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n⏹️ Encerrando sistema...');
    if (botPanel.sock) {
        botPanel.sock.end();
    }
    process.exit(0);
});

module.exports = WhatsAppBotPanel;