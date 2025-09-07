// Script de debug para testar conexões WhatsApp
// Execute: node debug.js

const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const path = require('path');
const QRCode = require('qrcode');

async function testWhatsAppConnection() {
    console.log('🔍 Iniciando teste de conexão WhatsApp...');
    
    try {
        const authDir = path.join(__dirname, 'debug-auth');
        await fs.ensureDir(authDir);
        
        const { state, saveCreds } = await useMultiFileAuthState(authDir);
        
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            browser: ['WA Debug', 'Chrome', '1.0.0'],
            generateHighQualityLinkPreview: true,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000
        });
        
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            console.log('📡 Connection update:', { connection, qr: !!qr });
            
            if (qr) {
                console.log('🔳 QR Code gerado!');
                try {
                    const qrString = await QRCode.toDataURL(qr);
                    console.log('✅ QR Code convertido para base64');
                    
                    // Salvar QR como arquivo para teste
                    await QRCode.toFile('./debug-qr.png', qr);
                    console.log('💾 QR Code salvo como debug-qr.png');
                } catch (qrError) {
                    console.error('❌ Erro ao processar QR Code:', qrError);
                }
            }
            
            if (connection === 'open') {
                console.log('✅ WhatsApp conectado com sucesso!');
                
                // Testar busca de grupos
                try {
                    const groups = await sock.groupFetchAllParticipating();
                    const groupList = Object.values(groups);
                    console.log(`📱 ${groupList.length} grupos encontrados:`);
                    
                    groupList.slice(0, 5).forEach(group => {
                        console.log(`  - ${group.subject} (${group.participants.length} membros)`);
                    });
                    
                } catch (groupError) {
                    console.error('❌ Erro ao buscar grupos:', groupError);
                }
                
                // Desconectar após teste
                setTimeout(async () => {
                    console.log('🔌 Desconectando...');
                    await sock.logout();
                    process.exit(0);
                }, 10000);
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log('❌ Conexão fechada:', {
                    statusCode,
                    reason: Object.keys(DisconnectReason).find(key => 
                        DisconnectReason[key] === statusCode
                    )
                });
                
                if (statusCode !== DisconnectReason.loggedOut) {
                    console.log('🔄 Tentando reconectar em 5 segundos...');
                    setTimeout(() => testWhatsAppConnection(), 5000);
                } else {
                    process.exit(1);
                }
            }
        });
        
        sock.ev.on('creds.update', saveCreds);
        
        // Timeout de segurança
        setTimeout(() => {
            if (sock.ws?.readyState !== 1) {
                console.log('⏰ Timeout - conexão não estabelecida em 60 segundos');
                process.exit(1);
            }
        }, 60000);
        
    } catch (error) {
        console.error('💥 Erro crítico:', error);
        process.exit(1);
    }
}

// Tratamento de sinais
process.on('SIGINT', () => {
    console.log('\n👋 Encerrando teste...');
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('💥 Exceção não capturada:', error);
    process.exit(1);
});

console.log(`
╔══════════════════════════════════════╗
║         🧪 DEBUG WHATSAPP 🧪        ║
║                                      ║
║  Testando conexão Baileys 6.6.0     ║
║  Pressione Ctrl+C para sair          ║
║                                      ║
╚══════════════════════════════════════╝
`);

testWhatsAppConnection();