const fs = require('fs-extra');
const path = require('path');

class DatabaseService {
    constructor() {
        this.dataDir = path.join(__dirname, '..', 'data');
        this.usersFile = path.join(this.dataDir, 'users.json');
        this.adsFile = path.join(this.dataDir, 'ads.json');
        this.statsFile = path.join(this.dataDir, 'stats.json');
        this.settingsFile = path.join(this.dataDir, 'settings.json');
        
        this.users = [];
        this.ads = [];
        this.stats = {};
        this.settings = {};
    }

    async initialize() {
        try {
            await fs.ensureDir(this.dataDir);
            await this.loadData();
            console.log('Database Service inicializado');
        } catch (error) {
            console.error('Erro ao salvar usuários:', error);
            throw error;
        }
    }

    async saveAds() {
        try {
            await fs.writeJson(this.adsFile, this.ads, { spaces: 2 });
        } catch (error) {
            console.error('Erro ao salvar anúncios:', error);
            throw error;
        }
    }

    async saveStats() {
        try {
            await fs.writeJson(this.statsFile, this.stats, { spaces: 2 });
        } catch (error) {
            console.error('Erro ao salvar estatísticas:', error);
            throw error;
        }
    }

    async saveSettings() {
        try {
            await fs.writeJson(this.settingsFile, this.settings, { spaces: 2 });
        } catch (error) {
            console.error('Erro ao salvar configurações:', error);
            throw error;
        }
    }

    // Métodos de usuários
    createUser(user) {
        this.users.push(user);
        this.saveUsers();
        return user;
    }

    getUser(id) {
        return this.users.find(user => user.id === id);
    }

    getUserByEmail(email) {
        return this.users.find(user => user.email === email);
    }

    updateUser(id, userData) {
        const index = this.users.findIndex(user => user.id === id);
        if (index !== -1) {
            this.users[index] = { ...this.users[index], ...userData };
            this.saveUsers();
            return this.users[index];
        }
        return null;
    }

    deleteUser(id) {
        const index = this.users.findIndex(user => user.id === id);
        if (index !== -1) {
            const deletedUser = this.users.splice(index, 1)[0];
            this.saveUsers();
            return deletedUser;
        }
        return null;
    }

    getAllUsers() {
        return this.users;
    }

    // Métodos de anúncios
    createAd(ad) {
        this.ads.push(ad);
        this.saveAds();
        this.updateUserStats(ad.userId, 'adsCreated');
        return ad;
    }

    getAd(id) {
        return this.ads.find(ad => ad.id === id);
    }

    getUserAds(userId) {
        return this.ads.filter(ad => ad.userId === userId);
    }

    updateAd(id, adData) {
        const index = this.ads.findIndex(ad => ad.id === id);
        if (index !== -1) {
            this.ads[index] = { ...this.ads[index], ...adData };
            this.saveAds();
            return this.ads[index];
        }
        return null;
    }

    deleteAd(id) {
        const index = this.ads.findIndex(ad => ad.id === id);
        if (index !== -1) {
            const deletedAd = this.ads.splice(index, 1)[0];
            this.saveAds();
            return deletedAd;
        }
        return null;
    }

    getAllAds() {
        return this.ads;
    }

    getActiveAds() {
        return this.ads.filter(ad => ad.active === true);
    }

    getScheduledAds() {
        return this.ads.filter(ad => 
            ad.active && 
            ad.scheduleDate && 
            ad.scheduleTime
        );
    }

    // Métodos de estatísticas
    updateAdStats(adId, stats) {
        const ad = this.getAd(adId);
        if (ad) {
            ad.stats = { ...ad.stats, ...stats };
            this.updateAd(adId, ad);
            
            // Atualizar estatísticas globais do usuário
            this.updateUserStats(ad.userId, 'messagesSent', stats.sent || 0);
            this.updateUserStats(ad.userId, 'messagesFailed', stats.failed || 0);
        }
    }

    updateUserStats(userId, type, value = 1) {
        if (!this.stats[userId]) {
            this.stats[userId] = {
                adsCreated: 0,
                messagesSent: 0,
                messagesFailed: 0,
                lastActivity: null,
                dailyStats: {}
            };
        }

        const today = new Date().toISOString().split('T')[0];
        
        if (!this.stats[userId].dailyStats[today]) {
            this.stats[userId].dailyStats[today] = {
                messagesSent: 0,
                messagesFailed: 0,
                adsCreated: 0
            };
        }

        this.stats[userId][type] = (this.stats[userId][type] || 0) + value;
        this.stats[userId].dailyStats[today][type] = (this.stats[userId].dailyStats[today][type] || 0) + value;
        this.stats[userId].lastActivity = new Date().toISOString();

        this.saveStats();
    }

    getUserStats(userId) {
        return this.stats[userId] || {
            adsCreated: 0,
            messagesSent: 0,
            messagesFailed: 0,
            lastActivity: null,
            dailyStats: {}
        };
    }

    getDailyStats(userId, date) {
        const userStats = this.getUserStats(userId);
        return userStats.dailyStats[date] || {
            messagesSent: 0,
            messagesFailed: 0,
            adsCreated: 0
        };
    }

    // Métodos de configurações
    getSettings() {
        return this.settings;
    }

    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.saveSettings();
        return this.settings;
    }

    getAntiSpamSettings() {
        return this.settings.antiSpam || {
            enabled: true,
            maxMessagesPerHour: 10,
            cooldownMinutes: 60
        };
    }

    updateAntiSpamSettings(settings) {
        this.settings.antiSpam = { ...this.settings.antiSpam, ...settings };
        this.saveSettings();
        return this.settings.antiSpam;
    }

    // Métodos de limpeza e manutenção
    cleanupOldStats(daysToKeep = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        const cutoffString = cutoffDate.toISOString().split('T')[0];

        for (const userId in this.stats) {
            if (this.stats[userId].dailyStats) {
                for (const date in this.stats[userId].dailyStats) {
                    if (date < cutoffString) {
                        delete this.stats[userId].dailyStats[date];
                    }
                }
            }
        }

        this.saveStats();
    }

    // Métodos de backup e restore
    async createBackup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupDir = path.join(this.dataDir, 'backups');
            await fs.ensureDir(backupDir);

            const backupData = {
                users: this.users,
                ads: this.ads,
                stats: this.stats,
                settings: this.settings,
                timestamp: new Date().toISOString()
            };

            const backupFile = path.join(backupDir, `backup-${timestamp}.json`);
            await fs.writeJson(backupFile, backupData, { spaces: 2 });

            return backupFile;
        } catch (error) {
            console.error('Erro ao criar backup:', error);
            throw error;
        }
    }

    async restoreBackup(backupFile) {
        try {
            if (!await fs.pathExists(backupFile)) {
                throw new Error('Arquivo de backup não encontrado');
            }

            const backupData = await fs.readJson(backupFile);
            
            this.users = backupData.users || [];
            this.ads = backupData.ads || [];
            this.stats = backupData.stats || {};
            this.settings = backupData.settings || {};

            await this.saveUsers();
            await this.saveAds();
            await this.saveStats();
            await this.saveSettings();

            return true;
        } catch (error) {
            console.error('Erro ao restaurar backup:', error);
            throw error;
        }
    }

    // Métodos de validação
    validateUser(userData) {
        const required = ['username', 'email', 'password'];
        for (const field of required) {
            if (!userData[field]) {
                throw new Error(`Campo obrigatório não fornecido: ${field}`);
            }
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userData.email)) {
            throw new Error('Email inválido');
        }

        if (userData.password.length < 6) {
            throw new Error('Senha deve ter pelo menos 6 caracteres');
        }

        return true;
    }

    validateAd(adData) {
        const required = ['title', 'message'];
        for (const field of required) {
            if (!adData[field]) {
                throw new Error(`Campo obrigatório não fornecido: ${field}`);
            }
        }

        if (adData.title.length > 100) {
            throw new Error('Título não pode ter mais de 100 caracteres');
        }

        if (adData.message.length > 1000) {
            throw new Error('Mensagem não pode ter mais de 1000 caracteres');
        }

        return true;
    }
}

module.exports = DatabaseService;Erro ao inicializar Database Service:', error);
            throw error;
        }
    }

    async loadData() {
        try {
            // Carregar usuários
            if (await fs.pathExists(this.usersFile)) {
                this.users = await fs.readJson(this.usersFile);
            } else {
                this.users = [];
                await this.saveUsers();
            }

            // Carregar anúncios
            if (await fs.pathExists(this.adsFile)) {
                this.ads = await fs.readJson(this.adsFile);
            } else {
                this.ads = [];
                await this.saveAds();
            }

            // Carregar estatísticas
            if (await fs.pathExists(this.statsFile)) {
                this.stats = await fs.readJson(this.statsFile);
            } else {
                this.stats = {};
                await this.saveStats();
            }

            // Carregar configurações
            if (await fs.pathExists(this.settingsFile)) {
                this.settings = await fs.readJson(this.settingsFile);
            } else {
                this.settings = {
                    antiSpam: {
                        enabled: true,
                        maxMessagesPerHour: 10,
                        cooldownMinutes: 60
                    },
                    scheduler: {
                        timezone: 'America/Sao_Paulo'
                    }
                };
                await this.saveSettings();
            }

        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            throw error;
        }
    }

    async saveUsers() {
        try {
            await fs.writeJson(this.usersFile, this.users, { spaces: 2 });
        } catch (error) {
            console.error('