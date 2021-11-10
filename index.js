//Proyecto Modular Filtrador de Lenguaje en Discord
//Integrantes:  García Pérez Pedro
//              Villareal Padilla Edgar Alejandro
//              Galager Marcos Alejandro


//////////////////////LOGIN//////////////////////

function getCurrentDateString() {
    return (new Date()).toISOString() + ' ::';
};

__originalLog = console.log;

/*
console.log = function () {
    var args = [].slice.call(arguments);
    __originalLog.apply(console.log, [getCurrentDateString()].concat(args));
};*/

const fs = require('fs');
const util = require('util');
const path = require('path');
const { Readable } = require('stream');
const config = require('./config.json');
const Discord = require('discord.js');
const vosk = require('vosk');


//----Funcion que busca el directorio de datos, si no lo encuentra lo crea
function necessary_dirs() {
    if (!fs.existsSync('./data/')){
        fs.mkdirSync('./data/');
    }
}
necessary_dirs()

/* //Funcion nunca usada
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}*/

//----Funcion de conversion del audio
async function convert_audio(input) {
    try {
        // convirtiendo de audio estereo a mono
        const data = new Int16Array(input)
        const ndata = data.filter((el, idx) => idx % 2);
        return Buffer.from(ndata);
    } catch (e) {
        console.log(e)
        // mensaje a consola para pruebas
        console.log('convertir_audio: ' + e)
        throw e;
    }
}

const DISCORD_MSG_LIMIT = 2000;
let token = config.token;

const bot = new Discord.Client();

bot.on('listo', () => {
    console.log(`Logeado como ${bot.user.tag}!`);
});
bot.login(token);

const guildMap = new Map();
const voice_Connection = {};


//------------------------FUNCION MOVIDA PARA DECLARARSE ANTES DE USARSE
async function desconectar(botCanalVoz) {
    if (botCanalVoz) botCanalVoz.leave();
}


bot.on('mensaje', async (mensaje) => {
    try {
        const mensajeContenido = mensaje.content;
        //const usuarioIdCanal = mensaje.member.voice.channelID;
        const usuarioCanalVoz = mensaje.member.voice.channel;
        const botCanalVoz = mensaje.guild.me.voice.channel;
        //console.log(usuarioCanalVoz.members);
        // Previene mensajes privados al bot
        if (!('guild' in mensaje) || !mensaje.guild) return; 

        //----Condiciones de los comandos del bot----//

        if (mensajeContenido === '-unirse') {
            //----Revisa si el usuario esta conectado a un canal de voz antes de unir el bot a un chat-
            if (usuarioCanalVoz) conexionVoz = await conectar(usuarioCanalVoz);
            else mensaje.reply('Error: Por favor unase a un canal de voz primero.');
        }
        else if (mensajeContenido === '-salir') {
            //----Revisa si el usuario a salido del canal de voz antes de desconectar el bot.
            if (!botCanalVoz) mensaje.reply('Error: Nada por hacer.');
            //if (usuarioCanalVoz) usuarioCanalVoz.leave();
            if (botCanalVoz) {
                desconectar(botCanalVoz);
                mensaje.reply("Desconectado.");
            }
        }
        //else mensaje.reply('Error: Nada por hacer.'); // esta linea da error
    } catch (e) {
        //----Mensajes de error, por mal funcionamiento, o condiciones aleatorias de error
        console.error('Error en el bot: ' + e)
        mensaje.reply('Algo no anda bien, intentalo nuevamente.');
        process.exit();
    }
});


//PENDIENTE
const SILENCE_FRAME = Buffer.from([0xF8, 0xFF, 0xFE]);
class Silence extends Readable {
  _read() {
    this.push(SILENCE_FRAME);
    this.destroy();
  }
}


async function conectar(usuarioCanalVoz) {
    let conexionVozBot = {};
    if(usuarioCanalVoz) {
        conexionVozBot = await usuarioCanalVoz.join();
        conexionVozBot.play(new Silence(), { type: 'opus' });
        //console.log(JSON.toISOString(canalVoz.members)); // da error
        //console.log(usuarioCanalVoz.members);
        escuchar(conexionVozBot, usuarioCanalVoz);
    }
    return conexionVozBot;
}


async function escuchar(conexionVoz, canalVoz) {
    conexionVoz.on('speaking', async (usuario, charla) => {
        let bufferVoz = [];
        let miembros = canalVoz.members;
        let miembro = miembros.get(usuario.id);
        if (charla.bitfield == 0 || usuario.bot) return;
        const streamVoz = conexionVoz.receiver.createStream(usuario, { mode: 'pcm', end: 'silence' });
        streamVoz.on('data', (data) => {
            bufferVoz.push(data);
        });
        streamVoz.on('end', async () => {
            bufferVoz = Buffer.concat(bufferVoz);
            const duracion = bufferVoz.length / 48000 / 4;
            //console.log("duración: " + duracion);
            try {
                let bufferAudio = await convertirAudio(bufferVoz);
                bufferVoz = [];
                let texto = await transcribir(bufferAudio);
                bufferAudio = {};
                console.log(texto);
                if ( texto.includes('mundo') ) {
                    //client.guilds.fetch("server id here").members.fetch("user id here").voice.setMute(true);
                    //miembro.selfMute(true);
                    miembro.voice.setMute(true);
                    console.log('muteado');
                }
                if (texto != null) {} //console.log(texto);
            } catch (e) {
                console.log('Error al transcribir audio' + e);
            }
        });
        streamVoz.on('error',  (e) => { 
            console.log('streamVoz: ' + e);
        });
    });
}

async function convertirAudio(bufferVoz) {
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

async function transcribir(bufferAudio) {
    const idioma = "es";
    vosk.setLogLevel(-1);
    let recs = {
      'en': new vosk.Recognizer({model: new vosk.Model('vosk_models/en'), sampleRate: 48000}),
      'es': new vosk.Recognizer({model: new vosk.Model('vosk_models/es'), sampleRate: 48000}),
   }
    recs[idioma].acceptWaveform(bufferAudio);
    let ret = recs[idioma].finalResult();
    recs[idioma].reset;
    return ret['text'];
}

async function connect(msg, voice_Channel) {
    try {
        if (!voice_Channel) return msg.reply("Error: The voice channel does not exist!");
        let textChannel = await bot.channels.fetch(msg.channel.id);
        if (!textChannel) return msg.reply("Error: The text channel does not exist!");
        voice_Connection = await voice_Channel.join();
        voice_Connection.play(new Silence(), { type: 'opus' });
        speak_impl(voice_Connection, textChannel);
        voice_Connection.on('disconnect', async(e) => {
            if (e) console.log(e);
            textChannel.send("Se ha desconectado el bot");
        });
        msg.reply('connected!');
    } catch (e) {
        console.log('connect: ' + e)
        msg.reply('Error: unable to join your voice channel.');
        throw e;
    }
}

function speak_impl(voice_Connection, textChannel) {
    voice_Connection.on('speaking', async (user, speaking) => {
        if (speaking.bitfield == 0 || user.bot) {
            return;
        }
        console.log(`Escuchando a ${user.username}`);
        // Se crea un stream de datos para transferencia a través de internet
        const audioStream = voice_Connection.receiver.createStream(user, { mode: 'pcm' })
        audioStream.on('error',  (e) => { 
            console.log('audioStream: ' + e)
        });
        let buffer = [];
        audioStream.on('data', (data) => {
            buffer.push(data)
        });
        audioStream.on('end', async () => {
            buffer = Buffer.concat(buffer);
            const duration = buffer.length / 48000 / 4;
            console.log("duración: " + duration);
            try {
                let new_buffer = await convert_audio(buffer)
                let out = await transcribe(new_buffer, textChannel);
                if (out != null)
                    process_commands_query(out, textChannel, user);
            } catch (e) {
                console.log('tmpraw rename: ' + e)
            }
        });
    });
}

function process_commands_query(txt, textChannel, user) {
    if (txt && txt.length) {
        textChannel.send(user.username + ': ' + txt);
    }
}

async function transcribe(buffer) {
    vosk.setLogLevel(-1);
    const idioma = "es";
    let recs = {
      'en': new vosk.Recognizer({model: new vosk.Model('vosk_models/en'), sampleRate: 48000}),
      'es': new vosk.Recognizer({model: new vosk.Model('vosk_models/es'), sampleRate: 48000}),
   }
    recs[idioma].acceptWaveform(buffer);
    //let ret = recs[idioma].finalResult().text;
    let ret = recs[idioma].finalResult().text;
    console.log('vosk:', ret);
    console.log(`${ret}`);
    if( ret.includes('saludo') ) {console.log('Hola a todos perras!!'); }
    return JSON.parse(ret);
}
