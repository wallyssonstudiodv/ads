const moment = require('moment-timezone');

class AntiSpamService {
    constructor(db) {
        this.db = db;
        this.userActivity = new Map();
        this.blockedUsers = new Map();
        this.cleanupInterval = null;
        
        this.initialize();
    }

    initialize() {
        // Limpar dados antigos a cada hora
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldData();
        }, 60 * 60 * 1000); // 1 hora

        console.log('Anti-Spam Service inicializado');
    }

    // Verificar se o usuário pode enviar mensagem
    canSendMessage(userId, groupId) {
        const settings = this.db.getAntiSpamSettings();
        
        if (!settings.enabled) {
            return { allowed: true };
        }

        // Verificar se o usuário está bloqueado temporariamente
        if (this.isUserBlocked(userId)) {
            const blockInfo = this.blockedUsers.get(userId);
            return {
                allowed: false,
                reason: 'blocked',
                unblockTime: blockInfo.unblockTime,
                message: `Você está temporariamente bloqueado por excesso de mensagens. Tente novamente em ${this.getTimeUntilUnblock(userId)}.`
            };
        }

        // Verificar limite de mensagens por hora
        const currentHour = moment().startOf('hour').toISOString();
        const userKey = `${userId}-${currentHour}`;
        
        if (!this.userActivity.has(userKey)) {
            this.userActivity.set(userKey, {
                count: 0,
                groups: new Set(),
                firstMessage: new Date().toISOString()
            });
        }

        const activity = this.userActivity.get(userKey);
        
        // Verificar se excedeu o limite por hora
        if (activity.count >= settings.maxMessagesPerHour) {
            this.blockUser(userId, settings.cooldownMinutes);
            return {
                allowed: false,
                reason: 'rate_limit',
                message: `Limite de ${settings.maxMessagesPerHour} mensagens por hora excedido. Tente novamente em ${settings.cooldownMinutes} minutos.`
            };
        }

        // Verificar se está enviando para o mesmo grupo repetidamente
        if (activity.groups.has(groupId) && activity.count > 0) {
            const timeSinceFirst = moment().diff(moment(activity.firstMessage), 'minutes');
            if (timeSinceFirst < 5) { // Menos de 5 minutos
                return {
                    allowed: false,
                    reason: 'duplicate_group',
                    message: 'Aguarde pelo menos 5 minutos antes de enviar outra mensagem para o mesmo grupo.'
                };
            }
        }

        return { allowed: true };
    }

    // Registrar envio de mensagem
    recordMessageSent(userId, groupId, success = true) {
        const currentHour = moment().startOf('hour').toISOString();
        const userKey = `${userId}-${currentHour}`;
        
        if (!this.userActivity.has(userKey)) {
            this.userActivity.set(userKey, {
                count: 0,
                groups: new Set(),
                firstMessage: new Date().toISOString(),
                successful: 0,
                failed: 0
            });
        }

        const activity = this.userActivity.get(userKey);
        activity.count++;
        activity.groups.add(groupId);
        
        if (success) {
            activity.successful++;
        } else {
            activity.failed++;
        }

        // Salvar estatísticas no banco
        this.updateAntiSpamStats(userId, success);
    }

    // Bloquear usuário temporariamente
    blockUser(userId, minutes) {
        const unblockTime = moment().add(minutes, 'minutes').toDate();
        
        this.blockedUsers.set(userId, {
            blockedAt: new Date(),
            unblockTime,
            reason: 'rate_limit'
        });

        console.log(`Usuário ${userId} bloqueado temporariamente até ${unblockTime}`);
        
        // Registrar bloqueio nas estatísticas
        this.updateAntiSpamStats(userId, false, 'blocked');
    }

    // Verificar se usuário está bloqueado
    isUserBlocked(userId) {
        const blockInfo = this.blockedUsers.get(userId);
        
        if (!blockInfo) {
            return false;
        }

        if (moment().isAfter(moment(blockInfo.unblockTime))) {
            // Desbloqueio automático
            this.blockedUsers.delete(userId);
            console.log(`Usuário ${userId} desbloqueado automaticamente`);
            return false;
        }

        return true;
    }

    // Obter tempo até desbloqueio
    getTimeUntilUnblock(userId) {
        const blockInfo = this.blockedUsers.get(userId);
        
        if (!blockInfo) {
            return 'N/A';
        }

        const timeLeft = moment(blockInfo.unblockTime).diff(moment(), 'minutes');
        
        if (timeLeft <= 0) {
            return 'Agora';
        }

        if (timeLeft < 60) {
            return `${timeLeft} minutos`;
        }

        const hours = Math.floor(timeLeft / 60);
        const minutes = timeLeft % 60;
        
        return `${hours}h ${minutes}min`;
    }

    // Desbloquear usuário manualmente
    unblockUser(userId) {
        if (this.blockedUsers.has(userId)) {
            this.blockedUsers.delete(userId);
            console.log(`Usuário ${userId} desbloqueado manualmente`);
            return true;
        }
        return false;
    }

    // Obter atividade do usuário na hora atual
    getUserActivity(userId) {
        const currentHour = moment().startOf('hour').toISOString();
        const userKey = `${userId}-${currentHour}`;
        
        return this.userActivity.get(userKey) || {
            count: 0,
            groups: new Set(),
            firstMessage: null,
            successful: 0,
            failed: 0
        };
    }

    // Obter usuários bloqueados
    getBlockedUsers() {
        const blocked = [];
        
        for (const [userId, blockInfo] of this.blockedUsers.entries()) {
            const user = this.db.getUser(userId);
            blocked.push({
                userId,
                username: user ? user.username : 'Desconhecido',
                email: user ? user.email : 'N/A',
                blockedAt: blockInfo.blockedAt,
                unblockTime: blockInfo.unblockTime,
                timeLeft: this.getTimeUntilUnblock(userId),
                reason: blockInfo.reason
            });
        }

        return blocked;
    }

    // Limpar dados antigos
    cleanupOldData() {
        const now = moment();
        const cutoffTime = now.subtract(2, 'hours').startOf('hour').toISOString();
        
        // Limpar atividade antiga
        const toDelete = [];
        for (const [key] of this.userActivity.entries()) {
            const hourKey = key.split('-').slice(1).join('-'); // Remove userId
            if (hourKey < cutoffTime) {
                toDelete.push(key);
            }
        }
        
        for (const key of toDelete) {
            this.userActivity.delete(key);
        }

        // Limpar bloqueios expirados
        const expiredBlocks = [];
        for (const [userId, blockInfo] of this.blockedUsers.entries()) {
            if (moment().isAfter(moment(blockInfo.unblockTime))) {
                expiredBlocks.push(userId);
            }
        }

        for (const userId of expiredBlocks) {
            this.blockedUsers.delete(userId);
        }

        if (toDelete.length > 0 || expiredBlocks.length > 0) {
            console.log(`Anti-spam cleanup: ${toDelete.length} atividades antigas e ${expiredBlocks.length} bloqueios expirados removidos`);
        }
    }

    // Atualizar estatísticas de anti-spam
    updateAntiSpamStats(userId, success, action = 'message') {
        const today = new Date().toISOString().split('T')[0];
        const currentHour = new Date().getHours();
        
        let stats = this.db.getUserStats(userId);
        
        if (!stats.antiSpam) {
            stats.antiSpam = {
                totalBlocks: 0,
                totalMessages: 0,
                successfulMessages: 0,
                failedMessages: 0,
                hourlyActivity: {},
                dailyActivity: {}
            };
        }

        if (!stats.antiSpam.dailyActivity[today]) {
            stats.antiSpam.dailyActivity[today] = {
                messages: 0,
                successful: 0,
                failed: 0,
                blocks: 0
            };
        }

        if (!stats.antiSpam.hourlyActivity[currentHour]) {
            stats.antiSpam.hourlyActivity[currentHour] = 0;
        }

        switch (action) {
            case 'message':
                stats.antiSpam.totalMessages++;
                stats.antiSpam.dailyActivity[today].messages++;
                stats.antiSpam.hourlyActivity[currentHour]++;
                
                if (success) {
                    stats.antiSpam.successfulMessages++;
                    stats.antiSpam.dailyActivity[today].successful++;
                } else {
                    stats.antiSpam.failedMessages++;
                    stats.antiSpam.dailyActivity[today].failed++;
                }
                break;
                
            case 'blocked':
                stats.antiSpam.totalBlocks++;
                stats.antiSpam.dailyActivity[today].blocks++;
                break;
        }

        // Atualizar no banco de dados
        this.db.updateUserStats(userId, 'antiSpam', stats.antiSpam);
    }

    // Obter estatísticas gerais do anti-spam
    getAntiSpamStats() {
        const settings = this.db.getAntiSpamSettings();
        const currentActivity = this.userActivity.size;
        const blockedUsers = this.blockedUsers.size;
        
        // Calcular estatísticas por hora
        const hourlyStats = {};
        for (let hour = 0; hour < 24; hour++) {
            hourlyStats[hour] = 0;
        }

        for (const [key, activity] of this.userActivity.entries()) {
            const hour = moment(activity.firstMessage).hour();
            hourlyStats[hour] += activity.count;
        }

        return {
            enabled: settings.enabled,
            maxMessagesPerHour: settings.maxMessagesPerHour,
            cooldownMinutes: settings.cooldownMinutes,
            currentActiveUsers: currentActivity,
            blockedUsers: blockedUsers,
            hourlyDistribution: hourlyStats
        };
    }

    // Configurar limites do anti-spam
    updateSettings(newSettings) {
        const currentSettings = this.db.getAntiSpamSettings();
        const updatedSettings = { ...currentSettings, ...newSettings };
        
        // Validar configurações
        if (updatedSettings.maxMessagesPerHour < 1 || updatedSettings.maxMessagesPerHour > 100) {
            throw new Error('Limite de mensagens por hora deve estar entre 1 e 100');
        }
        
        if (updatedSettings.cooldownMinutes < 1 || updatedSettings.cooldownMinutes > 1440) {
            throw new Error('Tempo de cooldown deve estar entre 1 minuto e 24 horas');
        }

        this.db.updateAntiSpamSettings(updatedSettings);
        
        console.log('Configurações do anti-spam atualizadas:', updatedSettings);
        return updatedSettings;
    }

    // Validar broadcast antes de enviar
    validateBroadcast(userId, groups) {
        const settings = this.db.getAntiSpamSettings();
        
        if (!settings.enabled) {
            return { valid: true };
        }

        // Verificar se usuário está bloqueado
        if (this.isUserBlocked(userId)) {
            return {
                valid: false,
                reason: 'user_blocked',
                message: `Usuário bloqueado temporariamente. Desbloqueio em: ${this.getTimeUntilUnblock(userId)}`
            };
        }

        // Verificar se o número de grupos excede o limite por hora
        const activity = this.getUserActivity(userId);
        const remainingMessages = settings.maxMessagesPerHour - activity.count;
        
        if (groups.length > remainingMessages) {
            return {
                valid: false,
                reason: 'rate_limit',
                message: `Broadcast excede o limite. Você pode enviar para apenas ${remainingMessages} grupos nesta hora.`,
                maxGroups: remainingMessages
            };
        }

        // Verificar grupos duplicados na mesma hora
        const duplicateGroups = groups.filter(groupId => activity.groups.has(groupId));
        
        if (duplicateGroups.length > 0) {
            return {
                valid: false,
                reason: 'duplicate_groups',
                message: `Alguns grupos já receberam mensagens nesta hora: ${duplicateGroups.length} grupos`,
                duplicateGroups
            };
        }

        return { valid: true };
    }

    // Obter relatório detalhado de atividade
    getActivityReport(userId, days = 7) {
        const endDate = moment();
        const startDate = moment().subtract(days, 'days');
        const stats = this.db.getUserStats(userId);
        
        if (!stats.antiSpam || !stats.antiSpam.dailyActivity) {
            return {
                period: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
                data: [],
                summary: {
                    totalMessages: 0,
                    successfulMessages: 0,
                    failedMessages: 0,
                    totalBlocks: 0,
                    averagePerDay: 0
                }
            };
        }

        const report = {
            period: { 
                startDate: startDate.toISOString(), 
                endDate: endDate.toISOString() 
            },
            data: [],
            summary: {
                totalMessages: 0,
                successfulMessages: 0,
                failedMessages: 0,
                totalBlocks: 0,
                averagePerDay: 0
            }
        };

        // Gerar dados diários
        for (let i = 0; i < days; i++) {
            const date = moment().subtract(i, 'days').format('YYYY-MM-DD');
            const dayActivity = stats.antiSpam.dailyActivity[date] || {
                messages: 0,
                successful: 0,
                failed: 0,
                blocks: 0
            };

            report.data.unshift({
                date,
                messages: dayActivity.messages,
                successful: dayActivity.successful,
                failed: dayActivity.failed,
                blocks: dayActivity.blocks,
                successRate: dayActivity.messages > 0 ? 
                    ((dayActivity.successful / dayActivity.messages) * 100).toFixed(1) : 0
            });

            // Atualizar resumo
            report.summary.totalMessages += dayActivity.messages;
            report.summary.successfulMessages += dayActivity.successful;
            report.summary.failedMessages += dayActivity.failed;
            report.summary.totalBlocks += dayActivity.blocks;
        }

        report.summary.averagePerDay = (report.summary.totalMessages / days).toFixed(1);

        return report;
    }

    // Método para emergência - desbloquear todos os usuários
    emergencyUnblockAll() {
        const blockedCount = this.blockedUsers.size;
        this.blockedUsers.clear();
        
        console.log(`Emergência: ${blockedCount} usuários desbloqueados`);
        return blockedCount;
    }

    // Destruir serviço
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        
        this.userActivity.clear();
        this.blockedUsers.clear();
        
        console.log('Anti-Spam Service destruído');
    }
}

module.exports = AntiSpamService;