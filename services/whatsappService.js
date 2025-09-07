const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason
} = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const path = require('path');
const QRCode = require('qrcode');
const sharp = require('sharp');
const config = require('../config');

class WhatsAppService {
    constructor(io) {
        this.io = io;
        this.connections = new Map(); // Map<userId, { sock, connected }>
        this.qrCodes = new Map();    // Map<userId, qrCodeDataURL>
        this.config = config.whatsapp;
    }

    async initialize() {
        console.log('WhatsApp Service inicializado');
    }

    async connectUser(userId) {
        try {
            if (this.connections.has(userId)) {
                const conn = this.connections.get(userId);
                if (conn.sock && conn.connected) return null;
                this.connections.delete(userId);
            }

            const authDir = path.join(__dirname, '..', 'auth', userId);
            await fs.ensureDir(authDir);
            const { state, saveCreds } = await useMultiFileAuthState(authDir);

            const sock = makeWASocket({
                auth: state,
                printQRInTerminal: this.config.printQRInTerminal,
                browser: this.config.browser,
                connectTimeoutMs: this.config.connectTimeoutMs
            });

            let qrGenerated = false;

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr && !qrGenerated) {
                    qrGenerated = true;
                    const qrString = await QRCode.toDataURL(qr);
                    this.qrCodes.set(userId, qrString);
                    this.io.to(userId).emit('qr-code', qrString);
                }

                if (connection === 'open') {
                    this.connections.set(userId, { sock, connected: true });
                    this.qrCodes.delete(userId);
                    this.io.to(userId).emit('whatsapp-connected');

                    // Atualizar status do usuário no banco
                    try {
                        const DatabaseService = require('./databaseService');
                        const db = new DatabaseService();
                        await db.initialize();
                        const user = db.getUser(userId);
                        if (user) db.updateUser(userId, { ...user, whatsappConnected: true });
                    } catch (dbErr) {
                        console.error('Erro ao atualizar banco:', dbErr);
                    }
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut &&
                                            statusCode !== DisconnectReason.forbidden;

                    this.connections.delete(userId);
                    this.qrCodes.delete(userId);
                    this.io.to(userId).emit('whatsapp-disconnected');

                    try {
                        const DatabaseService = require('./databaseService');
                        const db = new DatabaseService();
                        await db.initialize();
                        const user = db.getUser(userId);
                        if (user) db.updateUser(userId, { ...user, whatsappConnected: false });
                    } catch (dbErr) {
                        console.error('Erro ao atualizar banco:', dbErr);
                    }

                    if (shouldReconnect) {
                        setTimeout(() => this.connectUser(userId), this.config.reconnectDelay);
                    }
                }
            });

            sock.ev.on('creds.update', saveCreds);
            this.connections.set(userId, { sock, connected: false });

            // Retornar QR Code se existir
            return await new Promise(resolve => {
                const timeout = setTimeout(() => {
                    resolve(this.qrCodes.get(userId) || null);
                }, this.config.qrTimeout || 60000);
                if (this.qrCodes.has(userId)) {
                    clearTimeout(timeout);
                    resolve(this.qrCodes.get(userId));
                }
            });

        } catch (error) {
            this.connections.delete(userId);
            this.qrCodes.delete(userId);
            console.error(`Erro ao conectar usuário ${userId}:`, error);
            throw error;
        }
    }

    async disconnectUser(userId) {
        try {
            const conn = this.connections.get(userId);
            if (conn?.sock) {
                await conn.sock.logout();
                this.connections.delete(userId);
                const authDir = path.join(__dirname, '..', 'auth', userId);
                if (await fs.pathExists(authDir)) await fs.remove(authDir);

                const DatabaseService = require('./databaseService');
                const db = new DatabaseService();
                const user = db.getUser(userId);
                if (user) db.updateUser(userId, { ...user, whatsappConnected: false });
            }
        } catch (error) {
            console.error(`Erro ao desconectar usuário ${userId}:`, error);
        }
    }

    isUserConnected(userId) {
        const conn = this.connections.get(userId);
        return conn?.connected && conn.sock?.ws?.readyState === 1;
    }

    async getGroups(userId) {
        const conn = this.connections.get(userId);
        if (!conn || !this.isUserConnected(userId)) throw new Error('WhatsApp não conectado');

        const groups = await conn.sock.groupFetchAllParticipating();
        return Object.values(groups).map(g => ({
            id: g.id,
            name: g.subject || 'Grupo sem nome',
            participants: g.participants?.length || 0
        }));
    }

    async sendAd(userId, ad, groupId) {
        const conn = this.connections.get(userId);
        if (!conn || !this.isUserConnected(userId)) throw new Error('WhatsApp não conectado');

        let message;
        if (ad.image && await fs.pathExists(ad.image)) {
            const buffer = await sharp(ad.image).resize(800, 600, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
            message = { image: buffer, caption: `*${ad.title}*\n\n${ad.message}` };
        } else {
            message = { text: `*${ad.title}*\n\n${ad.message}` };
        }

        try {
            await conn.sock.sendMessage(groupId, message);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async broadcastAd(userId, ad) {
        if (!this.isUserConnected(userId)) throw new Error('WhatsApp não conectado');
        const results = { total: ad.groups.length, sent: 0, failed: 0, errors: [] };

        for (const groupId of ad.groups) {
            const res = await this.sendAd(userId, ad, groupId);
            if (res.success) results.sent++;
            else {
                results.failed++;
                results.errors.push({ groupId, error: res.error });
            }
            await new Promise(r => setTimeout(r, 2000));
        }

        this.io.to(userId).emit('ad-broadcast-result', { adId: ad.id, results });
        return results;
    }

    getAllConnections() {
        return Array.from(this.connections.keys());
    }

    cleanupConnections() {
        const toRemove = [];
        for (const [userId, conn] of this.connections.entries()) {
            if (!conn.sock || conn.sock.ws.readyState !== 1) toRemove.push(userId);
        }
        for (const userId of toRemove) {
            this.connections.delete(userId);
            this.qrCodes.delete(userId);
            this.io.to(userId).emit('whatsapp-disconnected');
        }
        return toRemove.length;
    }
}

module.exports = WhatsAppService;