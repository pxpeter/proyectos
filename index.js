//////////////////////////////////////////
////////////////  LOGIN  /////////////////
//////////////////////////////////////////
function getCurrentDateString() {
    return (new Date()).toISOString() + ' ::';
};
__originalLog = console.log;
console.log = function () {
    var args = [].slice.call(arguments);
    __originalLog.apply(console.log, [getCurrentDateString()].concat(args));
};
//////////////////////////////////////////

const fs = require('fs');
const util = require('util');
const path = require('path');
const { Readable } = require('stream');

//////////////////////////////////////////
/////////////// VARIABLES ////////////////
//////////////////////////////////////////

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
        // convirtiendo de audio estereo a mono
        const data = new Int16Array(input)
        const ndata = data.filter((el, idx) => idx % 2);
        return Buffer.from(ndata);
    } catch (e) {
        console.log(e)
        console.log('convert_audio: ' + e)
        throw e;
    }
}
//////////////////////////////////////////


//////////////////////////////////////////
///////////// CONFIGURACION //////////////
//////////////////////////////////////////

const SETTINGS_FILE = 'settings.json';

let DISCORD_TOK = null;
let WITAI_TOK = null; 
let SPEECH_METHOD = 'vosk'; // witai, google, vosk (Libreria Principal de Reconocimiento de Voz)

function loadConfig() {
    if (fs.existsSync(SETTINGS_FILE)) {
        const CFG_DATA = JSON.parse( fs.readFileSync(SETTINGS_FILE, 'utf8') );
        DISCORD_TOK = CFG_DATA.DISCORD_TOK;
        WITAI_TOK = CFG_DATA.WITAI_TOK;
        SPEECH_METHOD = CFG_DATA.SPEECH_METHOD;
    }
    DISCORD_TOK = process.env.DISCORD_TOK || DISCORD_TOK;
    WITAI_TOK = process.env.WITAI_TOK || WITAI_TOK;
    SPEECH_METHOD = process.env.SPEECH_METHOD || SPEECH_METHOD;

    if (!['witai', 'google', 'vosk'].includes(SPEECH_METHOD))
        throw 'invalido o faltante SPEECH_METHOD'
    if (!DISCORD_TOK)
        throw 'invalido o faltante DISCORD_TOK'
    if (SPEECH_METHOD === 'witai' && !WITAI_TOK)
        throw 'invalido o faltante WITAI_TOK'
    if (SPEECH_METHOD === 'google' && !fs.existsSync('./gspeech_key.json'))
        throw 'faltante gspeech_key.json'
    
}
loadConfig()

const https = require('https')
function listWitAIApps(cb) {
    const options = {
      hostname: 'api.wit.ai',
      port: 443,
      path: '/apps?offset=0&limit=100',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer '+WITAI_TOK,
      },
    }

    const req = https.request(options, (res) => {
      res.setEncoding('utf8');
      let body = ''
      res.on('data', (chunk) => {
        body += chunk
      });
      res.on('end',function() {
        cb(JSON.parse(body))
      })
    })

    req.on('error', (error) => {
      console.error(error)
      cb(null)
    })
    req.end()
}
function updateWitAIAppLang(appID, lang, cb) {
    const options = {
      hostname: 'api.wit.ai',
      port: 443,
      path: '/apps/' + appID,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer '+WITAI_TOK,
      },
    }
    const data = JSON.stringify({
      lang
    })

    const req = https.request(options, (res) => {
      res.setEncoding('utf8');
      let body = ''
      res.on('data', (chunk) => {
        body += chunk
      });
      res.on('end',function() {
        cb(JSON.parse(body))
      })
    })
    req.on('error', (error) => {
      console.error(error)
      cb(null)
    })
    req.write(data)
    req.end()
}

//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////


const Discord = require('discord.js')
const DISCORD_MSG_LIMIT = 2000;
const discordClient = new Discord.Client()
if (process.env.DEBUG)
    discordClient.on('debug', console.debug);
discordClient.on('ready', () => {
    console.log(`Logged in as ${discordClient.user.tag}!`)
})
discordClient.login(DISCORD_TOK)


///////////////Lista de Comandos///////////////


const PREFIX = '*';
const _CMD_HELP        = PREFIX + 'ayuda';
const _CMD_JOIN        = PREFIX + 'unirse';
const _CMD_LEAVE       = PREFIX + 'salir';
const _CMD_TEST        = PREFIX + 'hola';
const _CMD_LANG        = PREFIX + 'lang';

const guildMap = new Map();


discordClient.on('message', async (msg) => {
    try {
        if (!('guild' in msg) || !msg.guild) return; // Previene mensajes privados al bot
        const mapKey = msg.guild.id;
        if (msg.content.trim().toLowerCase() == _CMD_JOIN) {
            if (!msg.member.voice.channelID) {
                msg.reply('Error: Por favor unase a un canal de voz primero.') // Mensaje de error por falta de conexion a un canal de voz
            } else {
                if (!guildMap.has(mapKey))
                    await connect(msg, mapKey)
                else
                    msg.reply('El bot de Voz ya esta activado') //Mensaje de conexion ya realizada
            }
        } else if (msg.content.trim().toLowerCase() == _CMD_LEAVE) {
            if (guildMap.has(mapKey)) {
                let val = guildMap.get(mapKey);
                if (val.voice_Channel) val.voice_Channel.leave()
                if (val.voice_Connection) val.voice_Connection.disconnect()
                guildMap.delete(mapKey)
                msg.reply("Desconectado.") //Mensaje de salida del bot
            } else {
                msg.reply("El bot de Voz no se encuentra activo.")
            }
        } else if (msg.content.trim().toLowerCase() == _CMD_HELP) {
            msg.reply(getHelpString());
        }
        else if (msg.content.trim().toLowerCase() == _CMD_TEST) {
            msg.reply('prueba exitosa, hola mundo')
        }
        else if (msg.content.split('\n')[0].split(' ')[0].trim().toLowerCase() == _CMD_LANG) {
            if (SPEECH_METHOD === 'witai') {
              const lang = msg.content.replace(_CMD_LANG, '').trim().toLowerCase()
              listWitAIApps(data => {
                if (!data.length)
                  return msg.reply('No se encontro la aplicacion')
                for (const x of data) {
                  updateWitAIAppLang(x.id, lang, data => {
                    if ('success' in data)
                      msg.reply('Exito')
                    else if ('error' in data && data.error !== 'Token de acceso no concuerda')
                      msg.reply('Error: ' + data.error)
                  })
                }
              })
            } else if (SPEECH_METHOD === 'vosk') {
              let val = guildMap.get(mapKey);
              const lang = msg.content.replace(_CMD_LANG, '').trim().toLowerCase()
              val.selected_lang = lang;
            } else {
              msg.reply('Error: esta funcion es solo para Google')
            }
        }
    } catch (e) {
        console.log('discordClient message: ' + e)
        msg.reply('Error: Algo salio mal, intenta de nuevo si este error sigue ocurriendo.');
    }
})

function getHelpString() {
    let out = '**COMMANDS:**\n'
        out += '```'
        out += PREFIX + 'unirse\n';
        out += PREFIX + 'salir\n';
        out += PREFIX + 'lang <code>\n';
        out += '```'
    return out;
}

const SILENCE_FRAME = Buffer.from([0xF8, 0xFF, 0xFE]);

class Silence extends Readable {
  _read() {
    this.push(SILENCE_FRAME);
    this.destroy();
  }
}

async function connect(msg, mapKey) {
    try {
        let voice_Channel = await discordClient.channels.fetch(msg.member.voice.channelID);
        if (!voice_Channel) return msg.reply("Error: El canal de voz no existe");
        let text_Channel = await discordClient.channels.fetch(msg.channel.id);
        if (!text_Channel) return msg.reply("Error: El canal de texto no existe");
        let voice_Connection = await voice_Channel.join();
        voice_Connection.play(new Silence(), { type: 'opus' });
        guildMap.set(mapKey, {
            'text_Channel': text_Channel,
            'voice_Channel': voice_Channel,
            'voice_Connection': voice_Connection,
            'selected_lang': 'en',
            'debug': false,
        });
        speak_impl(voice_Connection, mapKey)
        voice_Connection.on('disconnect', async(e) => {
            if (e) console.log(e);
            guildMap.delete(mapKey);
        })
        msg.reply('connected!')
    } catch (e) {
        console.log('connect: ' + e)
        msg.reply('Error: incapaz de conectarse a tu canal de voz.');
        throw e;
    }
}

const vosk = require('vosk');
let recs = {}
if (SPEECH_METHOD === 'vosk') {
  vosk.setLogLevel(-1);
  // MODELOS DE VOZ: https://alphacephei.com/vosk/models
  recs = {
    'en': new vosk.Recognizer({model: new vosk.Model('vosk_models/en'), sampleRate: 48000}),
    // 'fr': new vosk.Recognizer({model: new vosk.Model('vosk_models/fr'), sampleRate: 48000}),
    // 'es': new vosk.Recognizer({model: new vosk.Model('vosk_models/es'), sampleRate: 48000}),
  }
}


function speak_impl(voice_Connection, mapKey) {
    voice_Connection.on('speaking', async (user, speaking) => {
        if (speaking.bitfield == 0 || user.bot) {
            return
        }
        console.log(`I'm listening to ${user.username}`)
        // this creates a 16-bit signed PCM, stereo 48KHz stream
        // Creacion de voz a 16-bits, 48KHz estereo
        const audioStream = voice_Connection.receiver.createStream(user, { mode: 'pcm' })
        audioStream.on('error',  (e) => { 
            console.log('audioStream: ' + e)
        });
        let buffer = [];
        audioStream.on('data', (data) => {
            buffer.push(data)
        })
        audioStream.on('end', async () => {
            buffer = Buffer.concat(buffer)
            const duration = buffer.length / 48000 / 4;
            console.log("duration: " + duration)

            if (SPEECH_METHOD === 'witai' || SPEECH_METHOD === 'google') {
            if (duration < 1.0 || duration > 19) { // 20 segundos maximos de duracion
                console.log("TOO SHORT / TOO LONG; SKPPING")
                return;
            }
            }

            try {
                let new_buffer = await convert_audio(buffer)
                let out = await transcribe(new_buffer, mapKey);
                if (out != null)
                    process_commands_query(out, mapKey, user);
            } catch (e) {
                console.log('tmpraw rename: ' + e)
            }
        })
    })
}

function process_commands_query(txt, mapKey, user) {
    if (txt && txt.length) {
        let val = guildMap.get(mapKey);
        val.text_Channel.send(user.username + ': ' + txt)
    }
}


//////////////////////////////////////////
//////////////// HABLA ///////////////////
//////////////////////////////////////////

async function transcribe(buffer, mapKey) {
  if (SPEECH_METHOD === 'witai') {
      return transcribe_witai(buffer)
  } else if (SPEECH_METHOD === 'google') {
      return transcribe_gspeech(buffer)
  } else if (SPEECH_METHOD === 'vosk') {
      let val = guildMap.get(mapKey);
      recs[val.selected_lang].acceptWaveform(buffer);
      let ret = recs[val.selected_lang].result().text;
      console.log('vosk:', ret)
      return ret;
  }
}

// WitAI
let witAI_lastcallTS = null;
const witClient = require('node-witai-speech');
async function transcribe_witai(buffer) {
    try {      
        // Asegura no mandar mas de una peticion por segundo
        if (witAI_lastcallTS != null) {
            let now = Math.floor(new Date());    
            while (now - witAI_lastcallTS < 1000) {
                console.log('sleep')
                await sleep(100);
                now = Math.floor(new Date());
            }
        }
    } catch (e) {
        console.log('transcribe_witai 837:' + e)
    }
    try {
        console.log('transcribe_witai')
        const extractSpeechIntent = util.promisify(witClient.extractSpeechIntent);
        var stream = Readable.from(buffer);
        const contenttype = "audio/raw;encoding=signed-integer;bits=16;rate=48k;endian=little"
        const output = await extractSpeechIntent(WITAI_TOK, stream, contenttype)
        witAI_lastcallTS = Math.floor(new Date());
        console.log(output)
        stream.destroy()
        if (output && '_text' in output && output._text.length)
            return output._text
        if (output && 'text' in output && output.text.length)
            return output.text
        return output;
    } catch (e) { console.log('transcribe_witai 851:' + e); console.log(e) }
}

// Google Speech API (API de habla de Google)
// https://cloud.google.com/docs/authentication/production
const gspeech = require('@google-cloud/speech');
const gspeechclient = new gspeech.SpeechClient({
  projectId: 'discordbot',
  keyFilename: 'gspeech_key.json'
});

async function transcribe_gspeech(buffer) {
  try {
      console.log('transcribe_gspeech')
      const bytes = buffer.toString('base64');
      const audio = {
        content: bytes,
      };
      const config = {
        encoding: 'LINEAR16',
        sampleRateHertz: 48000,
        languageCode: 'en-US',  // https://cloud.google.com/speech-to-text/docs/languages
      };
      const request = {
        audio: audio,
        config: config,
      };
      const [response] = await gspeechclient.recognize(request);
      const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');
      console.log(`gspeech: ${transcription}`);
      return transcription;
  } catch (e) { console.log('transcribe_gspeech 368:' + e) }
}

//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////

