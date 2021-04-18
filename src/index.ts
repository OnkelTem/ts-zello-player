import zello, {
  Zello,
  DEFAULT_ZELLO_OPTIONS,
  getAudioFileStream,
  getAutoDecodeStream,
  FileStreamOptions,
} from 'ts-zello';
import { existsSync } from 'fs';
import ytdl from 'ytdl-core';
import pino from 'pino';
import { Readable } from 'stream';
import argv from './cli';
import { basename } from 'path';
import NodeID3 from 'node-id3';

const ZELLO_SERVER = 'wss://zello.io/ws';

const pinoLogger = pino({ ...DEFAULT_ZELLO_OPTIONS.logger, level: argv.verbose });

// @see: https://stackoverflow.com/a/3726073/1223483
const youTubeLinkRegEx = /http(?:s?):\/\/(?:www\.)?youtu(?:be\.com\/watch\?v=|\.be\/)([\w\-\_]*)(&(amp;)?‌​[\w\?‌​=]*)?/;

const fileStreamOptions: FileStreamOptions = {
  samplingRate: argv.rate,
  volumeFactor: argv.volume,
  tempoFactor: argv.tempo,
  startAt: argv.start,
};

function makeInfoLineFromTags({ artist, album, year, trackNumber, title }: NodeID3.Tags): string {
  const _ = '\u00A0';
  return [
    artist ? `${artist}` : null,
    album ? `💿${_}${album} ${year ? `${_}(${year})` : ''}` : null,
    trackNumber || title ? `🎵${_}${trackNumber ? `${trackNumber} ` : ''}${title ? `- ${title}` : ''}` : null,
  ]
    .filter((item) => item != null)
    .join('\n');
}

function makeInfoLineFromYouTubeInfo({
  videoDetails: { title, dislikes, likes, ownerChannelName, uploadDate, viewCount },
}: ytdl.videoInfo): string {
  const _ = '\u00A0';
  let viewsFmt: string = viewCount;
  if (viewCount.match(/^\d+$/)) {
    viewsFmt = parseInt(viewCount).toLocaleString();
  }
  const likesFmt = (likes ?? 0).toLocaleString();
  const dislikesFmt = (dislikes ?? 0).toLocaleString();
  return [
    title,
    `👁${_}${viewsFmt}${_}${_}👍${_}${likesFmt}${_}${_}👎${_}${dislikesFmt}`,
    `ⓘ Channel: ${_}${ownerChannelName}${_}${_}⬆${_}${uploadDate}`,
  ]
    .filter((item) => item != null)
    .join('\n');
}

let stream: Readable | undefined = undefined;
let z: Zello;

const cred = argv.credentials!;

// Override channel from the cli
if (argv.channel != null) {
  cred.channel = argv.channel;
}

async function main() {
  let targetInfo: string = '';

  const target = argv.target!;

  if (target.match(youTubeLinkRegEx)) {
    // YouTube Link
    const videoInfo = await ytdl.getBasicInfo(target);
    targetInfo = makeInfoLineFromYouTubeInfo(videoInfo);
    const audio = ytdl(target, { quality: 'highestaudio' });
    stream = getAutoDecodeStream(audio, pinoLogger, fileStreamOptions);
  } else {
    // File
    if (!existsSync(target)) {
      console.error(`File not found: "${target}"`);
      process.exit(2);
    }
    const tags = NodeID3.read(target);
    targetInfo = makeInfoLineFromTags(tags) || '🎵\u00A0' + basename(target);
    stream = getAudioFileStream(target, pinoLogger, fileStreamOptions);
  }

  if (stream == null) {
    console.error("Stream couldn't initialize");
    process.exit(3);
  }

  z = await zello(ZELLO_SERVER, { logger: pinoLogger, name: 'ts-zello-player' });
  try {
    await z.ctl.run(function* ({ macros, commands }) {
      yield macros.login(cred);
      yield commands.sendTextMessage({ text: targetInfo });
      yield macros.sendAudio(stream!, {
        transcode: { samplingRate: argv.rate, frameSize: argv.frame, bitrateKbps: argv.bitrate, channels: 1 },
      });
    });
  } catch (err) {
    console.log(err);
  }
  await z.ctl.close();
}

async function shutdown() {
  if (z && z.ctl.status() === 'OPEN') {
    console.warn('Closing...');
    await stream!.destroy();
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
