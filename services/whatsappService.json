const { 
    makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    MessageType,
    generateWAMessageFromContent,
    proto
} = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const path = require('path');
const QRCode = require('qrcode');
const sharp = require('sharp');

class WhatsAppService {
    constructor(io) {
        this.io = io;
        this.connections = new Map();
        this.qrCodes = new Map();
    }

    async initialize() {
        console.log('WhatsApp Service inicializado');
    }

    async connectUser(userId) {
        try {
            if (this.connections.has(userId)) {
                const connection = this.connections.get(userId);
                if (connection.sock && connection.sock.ws.readyState === 1) {
                    return null; // Já conectado
                }
            }

            const authDir = path.join(__dirname, '..', 'auth', userId);
            await fs.ensureDir(authDir);

            const { state, saveCreds } = await useMultiFileAuthState(authDir);

            const sock = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                browser: ['WA Divulgações', 'Chrome', '1.0.0'],
                generateHighQualityLinkPreview: true,
                defaultQueryTimeoutMs: 60000
            });

            let qrGenerated = false;

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr && !qrGenerated) {
                    qrGenerated = true;
                    try {
                        const qrString = await QRCode.toDataURL(qr);
                        this.qrCodes.set(userId, qrString);
                        this.io.to(userId).emit('qr-code', qrString);
                    } catch (error) {
                        console.error('Erro ao gerar QR Code:', error);
                    }
                }

                if (connection === 'open') {
                    console.log(`WhatsApp conectado para usuário ${userId}`);
                    this.connections.set(userId, { sock, connected: true });
                    this.qrCodes.delete(userId);
                    this.io.to(userId).emit('whatsapp-connected');
                    
                    // Atualizar status do usuário no banco
                    const DatabaseService = require('./databaseService');
                    const db = new DatabaseService();
                    const user = db.getUser(userId);
                    if (user) {
                        db.updateUser(userId, { ...user, whatsappConnected: true });
                    }
                }

                if (connection === 'close') {
                    console.log(`WhatsApp desconectado para usuário ${userId}`);
                    const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                    
                    this.connections.delete(userId);
                    this.io.to(userId).emit('whatsapp-disconnected');

                    // Atualizar status do usuário no banco
                    const DatabaseService = require('./databaseService');
                    const db = new DatabaseService();
                    const user = db.getUser(userId);
                    if (user) {
                        db.updateUser(userId, { ...user, whatsappConnected: false });
                    }

                    if (shouldReconnect) {
                        console.log('Reconectando WhatsApp...');
                        setTimeout(() => this.connectUser(userId), 5000);
                    }
                }
            });

            sock.ev.on('creds.update', saveCreds);

            // Aguardar QR Code ser gerado ou conexão estabelecida
            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    resolve(this.qrCodes.get(userId) || null);
                }, 10000);

                sock.ev.on('connection.update', (update) => {
                    if (update.connection === 'open') {
                        clearTimeout(timeout);
                        resolve(null);
                    }
                });

                sock.ev.on('qr', () => {
                    clearTimeout(timeout);
                    resolve(this.qrCodes.get(userId) || null);
                });
            });

        } catch (error) {
            console.error(`Erro ao conectar usuário ${userId}:`, error);
            throw error;
        }
    }

    async disconnectUser(userId) {
        try {
            const connection = this.connections.get(userId);
            if (connection && connection.sock) {
                await connection.sock.logout();
                this.connections.delete(userId);
                
                // Remover arquivos de autenticação
                const authDir = path.join(__dirname, '..', 'auth', userId);
                if (await fs.pathExists(authDir)) {
                    await fs.remove(authDir);
                }
            }

            // Atualizar status do usuário no banco
            const DatabaseService = require('./databaseService');
            const db = new DatabaseService();
            const user = db.getUser(userId);
            if (user) {
                db.updateUser(userId, { ...user, whatsappConnected: false });
            }

        } catch (error) {
            console.error(`Erro ao desconectar usuário ${userId}:`, error);
            throw error;
        }
    }

    async getGroups(userId) {
        try {
            const connection = this.connections.get(userId);
            if (!connection || !connection.sock) {
                throw new Error('WhatsApp não conectado');
            }

            const groups = await connection.sock.groupFetchAllParticipating();
            const groupList = Object.values(groups).map(group => ({
                id: group.id,
                name: group.subject,
                participants: group.participants.length
            }));

            return groupList;
        } catch (error) {
            console.error(`Erro ao buscar grupos do usuário ${userId}:`, error);
            throw error;
        }
    }

    async sendAd(userId, ad, groupId) {
        try {
            const connection = this.connections.get(userId);
            if (!connection || !connection.sock) {
                throw new Error('WhatsApp não conectado');
            }

            let messageContent;

            if (ad.image && await fs.pathExists(ad.image)) {
                // Redimensionar imagem se necessário
                const imageBuffer = await this.processImage(ad.image);
                
                messageContent = {
                    image: imageBuffer,
                    caption: `*${ad.title}*\n\n${ad.message}`
                };
            } else {
                messageContent = {
                    text: `*${ad.title}*\n\n${ad.message}`
                };
            }

            await connection.sock.sendMessage(groupId, messageContent);
            
            return { success: true };
        } catch (error) {
            console.error(`Erro ao enviar anúncio para grupo ${groupId}:`, error);
            return { success: false, error: error.message };
        }
    }

    async processImage(imagePath) {
        try {
            // Redimensionar e otimizar imagem
            const buffer = await sharp(imagePath)
                .resize(800, 600, { 
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .jpeg({ 
                    quality: 80,
                    progressive: true
                })
                .toBuffer();

            return buffer;
        } catch (error) {
            console.error('Erro ao processar imagem:', error);
            // Retornar arquivo original se houver erro no processamento
            return await fs.readFile(imagePath);
        }
    }

    isUserConnected(userId) {
        const connection = this.connections.get(userId);
        return connection && connection.connected && connection.sock && connection.sock.ws.readyState === 1;
    }

    async broadcastAd(userId, ad) {
        if (!this.isUserConnected(userId)) {
            throw new Error('WhatsApp não conectado');
        }

        const results = {
            total: ad.groups.length,
            sent: 0,
            failed: 0,
            errors: []
        };

        for (const groupId of ad.groups) {
            try {
                const result = await this.sendAd(userId, ad, groupId);
                if (result.success) {
                    results.sent++;
                } else {
                    results.failed++;
                    results.errors.push({
                        groupId,
                        error: result.error
                    });
                }

                // Delay entre envios para evitar spam
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (error) {
                results.failed++;
                results.errors.push({
                    groupId,
                    error: error.message
                });
            }
        }

        // Emitir estatísticas em tempo real
        this.io.to(userId).emit('ad-broadcast-result', {
            adId: ad.id,
            results
        });

        return results;
    }

    getUserConnection(userId) {
        return this.connections.get(userId);
    }

    getAllConnections() {
        return Array.from(this.connections.keys());
    }
}

module.exports = WhatsAppService;