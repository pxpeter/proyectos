//Proyecto Modular: Filtrador de Lenguaje en Discord (FOLIO: 103/2021)

//Profesor: Quintanilla Moreno Francisco Javier         2104466

//Integrantes:  García Pérez Pedro                      214290982
//              Martínez Navarro Marcos Omar            207541732
//              Villarreal Padilla Edgar Alejandro      207579454
    

//////////////////////LOGIN//////////////////////

require('dotenv').config();
const fs = require('fs');
const { Readable } = require('stream');
//const config = require('./config.json');
const Discord = require('discord.js');
const vosk = require('vosk');

const bot = new Discord.Client();
//const token = config.token;

const SILENCE_FRAME = Buffer.from([0xF8, 0xFF, 0xFE]);
const idioma = "es";
let majaderias = [];

class Silence extends Readable {
    _read() {
      this.push(SILENCE_FRAME);
      this.destroy();
    }
}

function cargarMajaderias() {
    majaderias = fs.readFileSync('majaderias.txt', 'utf8').toString().split('\r\n');
}

let recs = {
    'en': new vosk.Recognizer({model: new vosk.Model('vosk_models/en'), sampleRate: 48000}),
    'es': new vosk.Recognizer({model: new vosk.Model('vosk_models/es'), sampleRate: 48000}),
}

//bot.login(token);
bot.login(process.env.DISCORD_TOK);

bot.on('ready', () => {
    cargarMajaderias();
    console.log(`Logged in as ${bot.user.tag}!`);
});

bot.on('message', async (mensaje) => {
    try {
        const mensajeContenido = mensaje.content;
        const usuarioCanalVoz = mensaje.member.voice.channel;
        const botCanalVoz = mensaje.guild.me.voice.channel;
        let conexionVoz = {};

        // Previene mensajes privados al bot
        if (!('guild' in mensaje) || !mensaje.guild) return;
        // Comando para activar el bot
        if (mensajeContenido === '-iniciar') {
            if (usuarioCanalVoz) {
                conexionVoz = await conectar(usuarioCanalVoz);
                if (conexionVoz) mensaje.reply(`${bot.user.tag} se ha conectado a ${usuarioCanalVoz}`);
            }
            else mensaje.reply('Error: Por favor unase a un canal de voz primero.');
        }
        // Comando para desactivar el bot
        else if (mensajeContenido === '-terminar') {
            if (!botCanalVoz) mensaje.reply('Error: Nada por hacer.');
            if (botCanalVoz) {
                desconectar(botCanalVoz);
                mensaje.reply("Desconectado.");
            }
        }
    } catch (e) {
        console.error('Error en el bot: ' + e)
        mensaje.reply('Algo no anda bien, intentalo nuevamente.');
    }
});

// Función para inicializar la conexión de voz del bot
async function conectar(usuarioCanalVoz) {
    let conexionVoz = {};
    if(usuarioCanalVoz) {
        conexionVoz = await usuarioCanalVoz.join();
        // Existe un bug en discord que se corrige haciendo que el 
        // bot siempre transmita sonido, en este caso, transmite un frame vacio
        conexionVoz.play(new Silence(), { type: 'opus' });
        // Comenzar la conexión de voz para cada usuario
        escuchar(conexionVoz, usuarioCanalVoz);
    }
    return conexionVoz;
}

// Función que desconecta el bot del canal
async function desconectar(botCanalVoz) {
    if (botCanalVoz) botCanalVoz.leave();
}

// Función que activa las conexiones de voz cuando cualquiera de los usuarios
// comienze a hablar
async function escuchar(conexionVoz, canalVoz) {
    conexionVoz.on('speaking', async (usuario, charla) => {
        // Parámetros para conseguir las conexiones de voz de cada miembro
        const miembros = canalVoz.members;
        const miembro = miembros.get(usuario.id);
        // Buffer que recibe los paquetes de voz de los usuarios
        let bufferVoz = [];
        // En caso de que el bot reproduzca zonido, omitir el resto de la función
        if (charla.bitfield == 0 || usuario.bot) return;
        // Conectar los stream de datos a la conexión de voz
        let streamVoz = conexionVoz.receiver.createStream(usuario, { mode: 'pcm', end: 'silence' });
        // Evento disparado al recibir un paquete de datos
        streamVoz.on('data', (data) => {
            // Guardar el paquete de datos en el buffer
            bufferVoz.push(data);
        });
        // Evento disparado al finalizar de recibir paquetes
        streamVoz.on('end', async () => {
            try {
                // Función para comenzar la censura que recibe 3 parámetros:
                // texto a censurar, miembro autor del texto y la conexión de voz
                censurar(
                    // Función que devuelve en forma de texto lo que el usuario dijo
                    transcribir( convertirAudio( Buffer.concat(bufferVoz) ) ),
                    // Autor de la conexión
                    miembro,
                    // Conexión de voz
                    conexionVoz);
                // Al finalizar, destruir el stream de datos para liberar recursos
                streamVoz.destroy();
            } catch (e) {
                console.log('Error al transcribir audio' + e);
            }
        });
        streamVoz.on('error',  (e) => { 
            console.log('streamVoz: ' + e);
        });
        
    });
}

//Función que convierte los paquetes en el buffer en un formato de audio
function convertirAudio(bufferVoz) {
    try {
        const data = new Int16Array(bufferVoz);
        const ndata = data.filter((el, idx) => idx % 2);
        return Buffer.from(ndata);
    } catch (e) {
        console.log(e)
        console.log('convertir_audio: ' + e)
        throw e;
    }
}

// Función que transcribe el audio en texto
function transcribir(bufferAudio) {
    vosk.setLogLevel(-1);
    recs[idioma].acceptWaveform(bufferAudio);
    let ret = recs[idioma].finalResult();
    let texto = ret['text'];
    return texto;
}

// Función que busca palabras precargadas como majaderias en el texto
function censurar(texto, miembro, conexionVoz) {
    console.log(texto);
    let bandera = false;
    let length = majaderias.length;
    for (let i = 0; i < length; i++) {
        if ( texto.includes(majaderias[i]) ) {
            console.log(majaderias[i]);
            conexionVoz.play( fs.createReadStream('./sonido/alerta.wav'), { volume: 0.2 } );
            mensaje.reply(`${bot.user.tag} a muteado a  ${miembro}`);
            miembro.voice.setMute(true);
            return;
        }
    }
}
