import zello, { Zello, CommandLogonRequest, DEFAULT_ZELLO_OPTIONS, getAudioFileStreamCtl } from 'ts-zello';
import { existsSync, readFileSync } from 'fs';
import pino from 'pino';

const CREDENTIALS_PATH = 'credentials.json';
const ZELLO_SERVER = 'wss://zello.io/ws';

const raw = readFileSync(CREDENTIALS_PATH, 'utf8');
export const cred: CommandLogonRequest = JSON.parse(raw);

const pinoLogger = pino(DEFAULT_ZELLO_OPTIONS.logger);

let z: Zello;

if (process.argv.length < 3) {
  console.error('Missed required parameter: the filename to play');
  process.exit(1);
}
const filename = process.argv[2];

if (!existsSync(filename)) {
  console.error(`File not found: "${filename}"`);
  process.exit(2);
}

const samplingRate = 48000;
const frameSize = 20;
const stream = getAudioFileStreamCtl(filename, pinoLogger, {
  samplingRate,
  volumeFactor: 0.3,
});

async function main() {
  z = await zello(ZELLO_SERVER, { logger: pinoLogger, name: 'ts-zello-player' });
  try {
    await z.ctl.run(function* ({ macros }) {
      yield macros.login(cred);
      yield macros.sendAudio(stream.stream, {
        transcode: { samplingRate, frameSize, bitrateKbps: 32, channels: 1 },
      });
    });
  } catch (err) {
    console.log(err);
  }
}

async function shutdown() {
  if (z && z.ctl.status() === 'OPEN') {
    console.warn('Closing...');
    await stream.close();
    await z.ctl.close();
  }
}

process.on('SIGINT', async function () {
  console.warn('Received SIGINT: Stopped by user');
  await shutdown();
  process.exit();
});

(async () => {
  await main();
})();
