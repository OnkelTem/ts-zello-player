import { samplingRates, frameSizes, CommandLogonRequest, LoggerLevel, loggerLevels } from 'ts-zello';
import yargs from 'yargs';
import findUp from 'find-up';
import { hideBin } from 'yargs/helpers';
import { existsSync, readFileSync } from 'fs';
import { main } from './main';

const configPath = findUp.sync(['.ts-zello-player', '.ts-zello-player.json']);
const config = configPath != null ? JSON.parse(readFileSync(configPath, 'utf8')) : {};

const options = {
  bitrate: {
    alias: 'b',
    default: 48,
    description: 'Bitrate in Kbps',
    number: true,
    min: 4,
    max: 96,
  },
  volume: {
    alias: 'l',
    description: 'Volume factor',
    number: true,
    min: 0.01,
    max: 2,
  },
  rate: {
    alias: 'r',
    default: 48000,
    description: '(re)Sampling rate',
    choices: samplingRates,
  },
  tempo: {
    alias: 't',
    description: 'Tempo factor',
    number: true,
    min: 0.5,
    max: 2,
  },
  frame: {
    alias: 'f',
    default: 20,
    description: 'Frame size',
    choices: frameSizes,
  },
  credentials: {
    default: 'credentials.json',
    description: 'Credentials file path',
    normalize: true,
  },
  channel: {
    alias: 'c',
    description: 'Zello channel to connect to',
    type: 'string',
  },
  preview: {
    alias: 'p',
    default: false,
    description: 'Show recording image preview',
    type: 'boolean',
  },
  info: {
    alias: 'i',
    default: false,
    description: 'Show recording text information',
    type: 'boolean',
  },
  normalize: {
    default: false,
    description: 'Normalize sound with FFmpeg "loudnorm" filter',
    type: 'boolean',
  },
  compress: {
    default: false,
    description: 'Compress sound with FFmpeg "acompressor" filter',
    type: 'boolean',
  },
} as const;
type OptionName = keyof typeof options;

function checkOptionRange(optionName: OptionName, value: number) {
  const option = options[optionName];
  if ('min' in option && 'max' in option) {
    if (value != null && (value > option.max || value < option.min)) {
      throw new Error(`${option.description} (${optionName}) must be between ${option.min} and ${option.max}`);
    }
  }
}

yargs(hideBin(process.argv))
  .options(options)
  .config(config)
  .demandCommand(1)
  .command(
    '$0 <target> [start]',
    'the default command',
    (yargs) =>
      yargs
        .positional('target', {
          describe: 'A target to play, either file path or a YouTube link',
          type: 'string',
        })
        .positional('start', {
          description: 'Start playback at',
          type: 'string',
        })
        .check((argv) => {
          checkOptionRange('bitrate', argv.bitrate);
          if (argv.volume != null) {
            checkOptionRange('volume', argv.volume);
          }
          if (argv.tempo != null) {
            checkOptionRange('tempo', argv.tempo);
          }
          return true;
        })
        .fail(function (msg, err, yargs) {
          console.log(yargs.help());
          console.error('\n\x1b[31m%s\x1b[0m', msg);
          process.exit(1);
        })
        .usage('Usage: $0 [options] <file> [start]')
        .usage('Usage: $0 [options] <youtube link> [start]')
        .example('$0 file.mp3', 'play file.mp3')
        .example('$0 https://www.youtube.com/watch?v=0hLnMDJ-gV4', 'play audio from the YouTube video')
        .count('verbose')
        .alias('v', 'verbose')
        .default('verbose', 0)
        .coerce('credentials', function (arg): CommandLogonRequest {
          if (!existsSync(arg)) {
            throw new Error(`Credentials file not found: ${arg}`);
          }
          const raw = readFileSync(arg, 'utf8');
          return JSON.parse(raw);
        })
        .coerce('verbose', function (arg) {
          return getLoggerLevel(arg);
        }),
    async function (argv) {
      if (argv.credentials != null && argv.target != null) {
        await main({
          bitrateKbps: argv.bitrate,
          volumeFactor: argv.volume,
          samplingRate: argv.rate,
          tempoFactor: argv.tempo,
          frameSize: argv.frame,
          credentials: argv.credentials,
          channel: argv.channel,
          target: argv.target,
          startAt: argv.start,
          logLevel: argv.verbose!,
          normalizer: argv.normalize,
          compressor: argv.compress,
          details: {
            text: argv.info,
            image: argv.preview,
          },
        });
        process.exit(0);
      }
    },
  )
  .help('h')
  .alias('h', 'help').argv;

function getLoggerLevel(count: number): LoggerLevel {
  // Zero amount of `-v` should result to 'info' log level, which corresponds to index = 3
  const index = count + 3;
  if (index > loggerLevels.length - 1) {
    return loggerLevels[loggerLevels.length - 1];
  } else {
    return loggerLevels[index];
  }
}
