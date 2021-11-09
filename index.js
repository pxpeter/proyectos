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

function necessary_dirs() {
    if (!fs.existsSync('./data/')){
        fs.mkdirSync('./data/');
    }
}
necessary_dirs()

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function convert_audio(input) {
    try {
        const data = new Int16Array(input)
        const ndata = data.filter((el, idx) => idx % 2);
        return Buffer.from(ndata);
    } catch (e) {
        console.log(e)
        console.log('convertir_audio: ' + e)
        throw e;
    }
}

const DISCORD_MSG_LIMIT = 2000;
let token = config.token;

const discordClient = new Discord.Client();

discordClient.on('ready', () => {
    console.log(`Logged in as ${discordClient.user.tag}!`)
})
discordClient.login(token);

const guildMap = new Map();
let voice_Connection;

discordClient.on('message', async (msg) => {
    try {
        if (!('guild' in msg) || !msg.guild) return; // Previene mensajes privados al bot
        if (msg.content == '/join') {
            if (!msg.member.voice.channelID) {
                msg.reply('Error: Por favor unase a un canal de voz primero.') // Mensaje de error por falta de conexion a un canal de voz
            } else {
                let voice_Channel = msg.member.voice.channel;
                await connect(msg, voice_Channel);
            }
        } else if (msg.content == '/leave') {
          if (voice_Channel){
            let voice_Channel = msg.member.voice.channel;
            voice_Channel.leave();
          } 
          if (voice_Connection) voice_Connection.disconnect();
          msg.reply("Desconectado.") //Mensaje de salida del bot
        }
    } catch (e) {
        console.log('discordClient message: ' + e)
        msg.reply('Error#180: Something went wrong, try again or contact the developers if this keeps happening.');
    }
})

const SILENCE_FRAME = Buffer.from([0xF8, 0xFF, 0xFE]);

class Silence extends Readable {
  _read() {
    this.push(SILENCE_FRAME);
    this.destroy();
  }
}

async function connect(msg, voice_Channel) {
    try {
        if (!voice_Channel) return msg.reply("Error: The voice channel does not exist!");
        let textChannel = await discordClient.channels.fetch(msg.channel.id);
        if (!textChannel) return msg.reply("Error: The text channel does not exist!");
        let voice_Connection = await voice_Channel.join();
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
            return
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
    return ret;
}
