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
const config = require('../config');

class WhatsAppService {
    constructor(io) {
        this.io = io;
        this.connections = new Map();
        this.qrCodes = new Map();
        this.config = config.whatsapp;
    }

    async initialize() {
        console.log('WhatsApp Service inicializado com configurações:', {
            browser: this.config.browser,
            timeout: this.config.connectTimeoutMs
        });
    }

    async connectUser(userId) {
        try {
            // Verificar se já existe uma conexão ativa
            if (this.connections.has(userId)) {
                const connection = this.connections.get(userId);
                if (connection.sock && connection.connected) {
                    console.log(`Usuário ${userId} já conectado`);
                    return null; // Já conectado
                }
                // Limpar conexão antiga se existir
                this.connections.delete(userId);
            }

            const authDir = path.join(__dirname, '..', 'auth', userId);
            await fs.ensureDir(authDir);

            const { state, saveCreds } = await useMultiFileAuthState(authDir);

            const sock = makeWASocket({
                auth: state,
                printQRInTerminal: this.config.printQRInTerminal,
                browser: this.config.browser,
                generateHighQualityLinkPreview: this.config.generateHighQualityLinkPreview,
                defaultQueryTimeoutMs: this.config.defaultQueryTimeoutMs,
                connectTimeoutMs: this.config.connectTimeoutMs,
                keepAliveIntervalMs: this.config.keepAliveIntervalMs,
                retryRequestDelayMs: this.config.retryRequestDelayMs,
                maxMsgRetryCount: this.config.maxMsgRetryCount,
                emitOwnEvents: this.config.emitOwnEvents,
                markOnlineOnConnect: this.config.markOnlineOnConnect
            });

            let qrGenerated = false;
            let connectionPromise;

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr, isOnline, isNewLogin } = update;

                console.log(`Conexão update para ${userId}:`, { connection, isOnline, isNewLogin });

                if (qr && !qrGenerated) {
                    qrGenerated = true;
                    try {
                        const qrString = await QRCode.toDataURL(qr);
                        this.qrCodes.set(userId, qrString);
                        this.io.to(userId).emit('qr-code', qrString);
                        console.log(`QR Code gerado para usuário ${userId}`);
                    } catch (error) {
                        console.error('Erro ao gerar QR Code:', error);
                    }
                }

                if (connection === 'open') {
                    console.log(`WhatsApp conectado para usuário ${userId}`);
                    this.connections.set(userId, { sock, connected: true, userId });
                    this.qrCodes.delete(userId);
                    
                    // Emitir evento de conexão
                    this.io.to(userId).emit('whatsapp-connected');
                    
                    // Atualizar status do usuário no banco
                    try {
                        const DatabaseService = require('./databaseService');
                        const db = new DatabaseService();
                        await db.initialize();
                        const user = db.getUser(userId);
                        if (user) {
                            db.updateUser(userId, { ...user, whatsappConnected: true });
                        }
                    } catch (dbError) {
                        console.error('Erro ao atualizar status no banco:', dbError);
                    }
                }

                if (connection === 'close') {
                    console.log(`WhatsApp desconectado para usuário ${userId}`);
                    
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut && 
                                          statusCode !== DisconnectReason.forbidden;
                    
                    this.connections.delete(userId);
                    this.qrCodes.delete(userId);
                    this.io.to(userId).emit('whatsapp-disconnected');

                    // Atualizar status do usuário no banco
                    try {
                        const DatabaseService = require('./databaseService');
                        const db = new DatabaseService();
                        await db.initialize();
                        const user = db.getUser(userId);
                        if (user) {
                            db.updateUser(userId, { ...user, whatsappConnected: false });
                        }
                    } catch (dbError) {
                        console.error('Erro ao atualizar status no banco:', dbError);
                    }

                    if (shouldReconnect) {
                        console.log(`Reconectando WhatsApp em ${this.config.reconnectDelay / 1000} segundos para usuário ${userId}...`);
                        setTimeout(() => this.connectUser(userId), this.config.reconnectDelay);
                    } else {
                        console.log(`Não reconectando usuário ${userId} - logout ou proibido`);
                    }
                }
            });

            sock.ev.on('creds.update', saveCreds);

            // Tratamento de erros
            sock.ev.on('messages.upsert', () => {
                // Manter conexão ativa
            });

            // Aguardar QR Code ser gerado ou conexão estabelecida
            connectionPromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    const qr = this.qrCodes.get(userId);
                    resolve(qr || null);
                }, this.config.qrTimeout);

                sock.ev.on('connection.update', (update) => {
                    if (update.connection === 'open') {
                        clearTimeout(timeout);
                        resolve(null); // Já conectado, não precisa de QR
                    } else if (update.qr && !qrGenerated) {
                        clearTimeout(timeout);
                        resolve(this.qrCodes.get(userId) || null);
                    }
                });

                // Timeout de segurança
                setTimeout(() => {
                    clearTimeout(timeout);
                    resolve(this.qrCodes.get(userId) || null);
                }, this.config.qrTimeout + 5000);
            });

            return await connectionPromise;

        } catch (error) {
            console.error(`Erro ao conectar usuário ${userId}:`, error);
            
            // Limpar dados em caso de erro
            this.connections.delete(userId);
            this.qrCodes.delete(userId);
            
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

    isUserConnected(userId) {
        const connection = this.connections.get(userId);
        if (!connection) return false;
        
        // Verificar se a conexão existe e está ativa
        return connection.connected === true && 
               connection.sock && 
               connection.sock.ws && 
               connection.sock.ws.readyState === 1;
    }

    async getGroups(userId) {
        try {
            const connection = this.connections.get(userId);
            
            if (!this.isUserConnected(userId) || !connection || !connection.sock) {
                throw new Error('WhatsApp não conectado');
            }

            // Aguardar um pouco para garantir que a conexão está estável
            await new Promise(resolve => setTimeout(resolve, 1000));

            const groups = await connection.sock.groupFetchAllParticipating();
            
            if (!groups) {
                return [];
            }

            const groupList = Object.values(groups).map(group => ({
                id: group.id,
                name: group.subject || 'Grupo sem nome',
                participants: group.participants ? group.participants.length : 0,
                description: group.desc || '',
                owner: group.owner || '',
                creation: group.creation || 0
            })).filter(group => group.id && group.name);

            console.log(`${groupList.length} grupos encontrados para usuário ${userId}`);
            return groupList;

        } catch (error) {
            console.error(`Erro ao buscar grupos do usuário ${userId}:`, error);
            
            // Se o erro for de conexão, tentar reconectar
            if (error.message.includes('não conectado') || error.message.includes('Connection')) {
                const connection = this.connections.get(userId);
                if (connection) {
                    connection.connected = false;
                }
                this.io.to(userId).emit('whatsapp-disconnected');
            }
            
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
        return this.connections.get(userId) || null;
    }

    getAllConnections() {
        return Array.from(this.connections.keys());
    }

    // Método para verificar status da conexão
    async checkConnectionStatus(userId) {
        try {
            const connection = this.connections.get(userId);
            
            if (!connection || !connection.sock) {
                return { connected: false, reason: 'No connection object' };
            }

            if (!connection.sock.ws) {
                return { connected: false, reason: 'No websocket' };
            }

            if (connection.sock.ws.readyState !== 1) {
                return { connected: false, reason: `WebSocket state: ${connection.sock.ws.readyState}` };
            }

            // Tentar fazer uma operação simples para verificar se realmente está conectado
            try {
                await connection.sock.fetchStatus(connection.sock.user.id);
                return { connected: true };
            } catch (statusError) {
                console.error(`Erro ao verificar status para ${userId}:`, statusError);
                return { connected: false, reason: 'Status check failed' };
            }

        } catch (error) {
            console.error(`Erro ao verificar conexão para ${userId}:`, error);
            return { connected: false, reason: error.message };
        }
    }

    // Método para limpar conexões órfãs
    cleanupConnections() {
        const toRemove = [];
        
        for (const [userId, connection] of this.connections.entries()) {
            if (!connection.sock || !connection.sock.ws || connection.sock.ws.readyState !== 1) {
                toRemove.push(userId);
            }
        }

        for (const userId of toRemove) {
            console.log(`Limpando conexão órfã para usuário ${userId}`);
            this.connections.delete(userId);
            this.qrCodes.delete(userId);
            this.io.to(userId).emit('whatsapp-disconnected');
        }

        return toRemove.length;
    }
}

module.exports = WhatsAppService;