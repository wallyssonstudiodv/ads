const cron = require('node-cron');
const moment = require('moment-timezone');

class SchedulerService {
    constructor(db, whatsappService) {
        this.db = db;
        this.whatsappService = whatsappService;
        this.scheduledTasks = new Map();
        this.timezone = 'America/Sao_Paulo';
    }

    initialize() {
        // Reagendar anúncios existentes na inicialização
        this.rescheduleExistingAds();
        console.log('Scheduler Service inicializado');
    }

    rescheduleExistingAds() {
        try {
            const scheduledAds = this.db.getScheduledAds();
            
            for (const ad of scheduledAds) {
                this.scheduleAd(ad);
            }

            console.log(`${scheduledAds.length} anúncios reagendados`);
        } catch (error) {
            console.error('Erro ao reagendar anúncios existentes:', error);
        }
    }

    scheduleAd(ad) {
        try {
            if (!ad.scheduleDate || !ad.scheduleTime) {
                return;
            }

            const scheduleDateTime = moment.tz(
                `${ad.scheduleDate} ${ad.scheduleTime}`, 
                'YYYY-MM-DD HH:mm',
                this.timezone
            );

            if (!scheduleDateTime.isValid()) {
                console.error(`Data/hora inválida para anúncio ${ad.id}`);
                return;
            }

            // Verificar se é uma data futura
            if (scheduleDateTime.isBefore(moment())) {
                console.warn(`Anúncio ${ad.id} agendado para o passado, pulando`);
                return;
            }

            // Cancelar agendamento anterior se existir
            this.cancelScheduledAd(ad.id);

            let cronExpression;
            const minute = scheduleDateTime.minute();
            const hour = scheduleDateTime.hour();
            const dayOfMonth = scheduleDateTime.date();
            const month = scheduleDateTime.month() + 1; // moment usa 0-11, cron usa 1-12

            switch (ad.repeat) {
                case 'daily':
                    cronExpression = `${minute} ${hour} * * *`;
                    break;
                case 'weekly':
                    const dayOfWeek = scheduleDateTime.day();
                    cronExpression = `${minute} ${hour} * * ${dayOfWeek}`;
                    break;
                case 'monthly':
                    cronExpression = `${minute} ${hour} ${dayOfMonth} * *`;
                    break;
                case 'yearly':
                    cronExpression = `${minute} ${hour} ${dayOfMonth} ${month} *`;
                    break;
                default: // 'once'
                    cronExpression = `${minute} ${hour} ${dayOfMonth} ${month} *`;
                    break;
            }

            console.log(`Agendando anúncio ${ad.id} com cron: ${cronExpression}`);

            const task = cron.schedule(cronExpression, async () => {
                await this.executeAd(ad);
                
                // Se for execução única, cancelar o agendamento
                if (ad.repeat === 'once') {
                    this.cancelScheduledAd(ad.id);
                }
            }, {
                scheduled: true,
                timezone: this.timezone
            });

            this.scheduledTasks.set(ad.id, {
                task,
                cronExpression,
                nextExecution: scheduleDateTime.toISOString(),
                repeat: ad.repeat
            });

        } catch (error) {
            console.error(`Erro ao agendar anúncio ${ad.id}:`, error);
        }
    }

    async executeAd(ad) {
        try {
            console.log(`Executando anúncio agendado: ${ad.id}`);

            // Verificar se o usuário está conectado
            if (!this.whatsappService.isUserConnected(ad.userId)) {
                console.warn(`Usuário ${ad.userId} não conectado, pulando execução`);
                
                // Atualizar estatísticas de falha
                this.db.updateAdStats(ad.id, {
                    failed: (ad.stats?.failed || 0) + ad.groups.length,
                    lastSent: new Date().toISOString()
                });
                
                return;
            }

            // Executar o broadcast
            const results = await this.whatsappService.broadcastAd(ad.userId, ad);
            
            // Atualizar estatísticas
            this.db.updateAdStats(ad.id, {
                sent: (ad.stats?.sent || 0) + results.sent,
                failed: (ad.stats?.failed || 0) + results.failed,
                lastSent: new Date().toISOString()
            });

            console.log(`Anúncio ${ad.id} executado: ${results.sent} enviados, ${results.failed} falharam`);

        } catch (error) {
            console.error(`Erro ao executar anúncio ${ad.id}:`, error);
            
            // Atualizar estatísticas de falha
            this.db.updateAdStats(ad.id, {
                failed: (ad.stats?.failed || 0) + ad.groups.length,
                lastSent: new Date().toISOString()
            });
        }
    }

    cancelScheduledAd(adId) {
        const scheduledTask = this.scheduledTasks.get(adId);
        if (scheduledTask) {
            scheduledTask.task.stop();
            scheduledTask.task.destroy();
            this.scheduledTasks.delete(adId);
            console.log(`Agendamento cancelado para anúncio ${adId}`);
        }
    }

    getScheduledAd(adId) {
        return this.scheduledTasks.get(adId);
    }

    getAllScheduledAds() {
        const scheduled = [];
        for (const [adId, taskInfo] of this.scheduledTasks.entries()) {
            const ad = this.db.getAd(adId);
            if (ad) {
                scheduled.push({
                    ad,
                    taskInfo: {
                        cronExpression: taskInfo.cronExpression,
                        nextExecution: taskInfo.nextExecution,
                        repeat: taskInfo.repeat
                    }
                });
            }
        }
        return scheduled;
    }

    updateAdSchedule(ad) {
        // Cancelar agendamento atual
        this.cancelScheduledAd(ad.id);
        
        // Reagendar se necessário
        if (ad.active && ad.scheduleDate && ad.scheduleTime) {
            this.scheduleAd(ad);
        }
    }

    getNextExecutionTime(adId) {
        const scheduledTask = this.scheduledTasks.get(adId);
        if (!scheduledTask) {
            return null;
        }

        const ad = this.db.getAd(adId);
        if (!ad) {
            return null;
        }

        const scheduleDateTime = moment.tz(
            `${ad.scheduleDate} ${ad.scheduleTime}`, 
            'YYYY-MM-DD HH:mm',
            this.timezone
        );

        if (!scheduleDateTime.isValid()) {
            return null;
        }

        const now = moment.tz(this.timezone);
        let nextExecution = scheduleDateTime.clone();

        switch (ad.repeat) {
            case 'daily':
                while (nextExecution.isBefore(now)) {
                    nextExecution.add(1, 'day');
                }
                break;
            case 'weekly':
                while (nextExecution.isBefore(now)) {
                    nextExecution.add(1, 'week');
                }
                break;
            case 'monthly':
                while (nextExecution.isBefore(now)) {
                    nextExecution.add(1, 'month');
                }
                break;
            case 'yearly':
                while (nextExecution.isBefore(now)) {
                    nextExecution.add(1, 'year');
                }
                break;
            default: // 'once'
                if (nextExecution.isBefore(now)) {
                    return null; // Já executado
                }
                break;
        }

        return nextExecution.toISOString();
    }

    // Método para verificar e limpar tarefas órfãs
    cleanupOrphanedTasks() {
        const toDelete = [];
        
        for (const [adId] of this.scheduledTasks.entries()) {
            const ad = this.db.getAd(adId);
            if (!ad || !ad.active || !ad.scheduleDate || !ad.scheduleTime) {
                toDelete.push(adId);
            }
        }

        for (const adId of toDelete) {
            this.cancelScheduledAd(adId);
        }

        if (toDelete.length > 0) {
            console.log(`${toDelete.length} tarefas órfãs removidas`);
        }
    }

    // Método para obter estatísticas do agendador
    getSchedulerStats() {
        const totalScheduled = this.scheduledTasks.size;
        const byRepeatType = {
            once: 0,
            daily: 0,
            weekly: 0,
            monthly: 0,
            yearly: 0
        };

        for (const [adId] of this.scheduledTasks.entries()) {
            const ad = this.db.getAd(adId);
            if (ad && byRepeatType.hasOwnProperty(ad.repeat)) {
                byRepeatType[ad.repeat]++;
            }
        }

        return {
            totalScheduled,
            byRepeatType,
            timezone: this.timezone
        };
    }

    // Método para pausa/retomar todos os agendamentos
    pauseAllSchedules() {
        for (const [adId, taskInfo] of this.scheduledTasks.entries()) {
            taskInfo.task.stop();
        }
        console.log('Todos os agendamentos pausados');
    }

    resumeAllSchedules() {
        for (const [adId, taskInfo] of this.scheduledTasks.entries()) {
            taskInfo.task.start();
        }
        console.log('Todos os agendamentos retomados');
    }

    // Método para validar agendamento
    validateSchedule(scheduleDate, scheduleTime) {
        if (!scheduleDate || !scheduleTime) {
            return { valid: false, error: 'Data e hora são obrigatórias' };
        }

        const scheduleDateTime = moment.tz(
            `${scheduleDate} ${scheduleTime}`, 
            'YYYY-MM-DD HH:mm',
            this.timezone
        );

        if (!scheduleDateTime.isValid()) {
            return { valid: false, error: 'Data/hora inválida' };
        }

        if (scheduleDateTime.isBefore(moment())) {
            return { valid: false, error: 'Não é possível agendar para o passado' };
        }

        return { valid: true };
    }
}

module.exports = SchedulerService;