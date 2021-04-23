import fs from 'fs';
import ytdl from 'ytdl-core';
import pino from 'pino';
import { Readable } from 'stream';
import { basename } from 'path';
import NodeID3 from 'node-id3';
import pEvent from 'p-event';
import fetch from 'node-fetch';
import sharp from 'sharp';
import zello, {
  Zello,
  DEFAULT_ZELLO_OPTIONS,
  getAutoDecodeStream,
  FileStreamOptions,
  SamplingRate,
  FrameSize,
  CommandLogonRequest,
  LoggerLevel,
  DataWaitPassThroughStream,
} from 'ts-zello';

const ZELLO_SERVER = 'wss://zello.io/ws';

type MainParams = {
  bitrateKbps: number;
  volumeFactor?: number;
  samplingRate: SamplingRate;
  tempoFactor?: number;
  frameSize: FrameSize;
  credentials: CommandLogonRequest;
  channel?: string;
  target: string;
  startAt?: string;
  logLevel: LoggerLevel;
  normalizer?: boolean;
  compressor?: boolean;
  details: {
    text: boolean;
    image: boolean;
  };
};

export async function main({
  bitrateKbps,
  volumeFactor,
  samplingRate,
  tempoFactor,
  frameSize,
  credentials,
  channel,
  target,
  startAt,
  logLevel,
  normalizer,
  compressor,
  details,
}: MainParams) {
  const pinoLogger = pino({ ...DEFAULT_ZELLO_OPTIONS.logger, level: logLevel });

  // @see: https://stackoverflow.com/a/3726073/1223483
  const youTubeLinkRegEx = /^http(?:s?):\/\/(?:www\.)?(?:music\.)?youtu(?:be\.com\/watch\?v=|\.be\/)([\w\-\_]*)(&(amp;)?‌​[\w\?‌​=]*)?/;

  const urlRegEx = /^http(?:s?):\/\//;

  let stream: Readable | undefined = undefined;
  let z: Zello;

  const cred = credentials!;

  // Override channel from the cli
  if (channel != null) {
    cred.channel = channel;
  }

  const fileStreamOptions: FileStreamOptions = {
    samplingRate,
    volumeFactor,
    tempoFactor,
    normalizer,
    compressor,
  };

  async function start() {
    let image: Buffer;
    let detailsText: string;
    try {
      if (target.match(youTubeLinkRegEx)) {
        // YouTube Link
        pinoLogger.info('YouTube link detected');
        pinoLogger.debug('Requesting YouTube video metadata');

        const videoInfo = await ytdl.getBasicInfo(target);
        if (details.text) {
          detailsText = makeInfoLineFromYouTubeInfo(videoInfo);
        }
        if (details.image) {
          image = await makeYouTubePreview(videoInfo);
        }
        pinoLogger.debug('Requesting YouTube stream');
        // Check to see the length of the video and is offset available.
        // Wait! Maybe it's already there?
        const ytdlOptions: ytdl.downloadOptions = {
          quality: 'highestaudio',
          ...(startAt != null ? { begin: startAt } : null),
        };
        const audio = ytdl(target, ytdlOptions);
        stream = audio.pipe(getAutoDecodeStream(pinoLogger, fileStreamOptions));
      } else if (target.match(urlRegEx)) {
        // Just a link
        pinoLogger.info('URL detected');
        pinoLogger.debug('Requesting URL...');
        const audio = (await fetch(target)).body;
        stream = audio.pipe(getAutoDecodeStream(pinoLogger, fileStreamOptions));
      } else {
        // File
        pinoLogger.info('Local file detected');
        if (!fs.existsSync(target)) {
          throw new Error(`File not found: "${target}"`);
        }
        const tags = NodeID3.read(target);
        if (details.text) {
          detailsText = makeInfoLineFromTags(tags) || '🎵\u00A0' + basename(target);
        }
        if (details.image) {
          if (tags.image != null && typeof tags.image === 'object') {
            image = tags.image.imageBuffer;
          }
        }
        stream = fs.createReadStream(target).pipe(getAutoDecodeStream(pinoLogger, { ...fileStreamOptions, startAt }));
      }
    } catch (err) {
      pinoLogger.error(err, 'ERROR');
      process.exit(2);
    }

    if (stream == null) {
      pinoLogger.error("Stream couldn't initialize");
      process.exit(3);
    }

    // This part is not required (it's not inside sendAudio macro),
    // but it decreases the delay between now-playing info and the audio transmission.
    pinoLogger.info('Waiting for data...');
    stream = stream.pipe(new DataWaitPassThroughStream());
    await pEvent(stream, 'dataIsReady');
    pinoLogger.debug('Data is ready.');

    z = await zello(ZELLO_SERVER, { logger: pinoLogger, name: 'ts-zello-player' });
    try {
      await z.ctl.run(function* ({ macros, commands }) {
        yield macros.login(cred);
        if (image != null) {
          yield macros.sendImage(image);
        }
        if (detailsText != null) {
          yield commands.sendTextMessage({ text: detailsText });
        }
        yield macros.sendAudio(stream!, {
          transcode: { samplingRate, frameSize, bitrateKbps, channels: 1 },
        });
      });
    } catch (err) {
      pinoLogger.error(err, 'ERROR');
    }
    pinoLogger.info('==> Closing socket');
    await z.ctl.close();
    pinoLogger.info('==> Socket is closed');
  }

  async function shutdown() {
    if (z && z.ctl.status() === 'OPEN') {
      pinoLogger.warn('Closing...');
      await stream!.destroy();
      await z.ctl.close();
    }
  }

  process.on('SIGINT', async function () {
    pinoLogger.warn('Received SIGINT: Stopped by user');
    await shutdown();
    process.exit();
  });

  await start();
  pinoLogger.warn('==> end of main function');
}

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

function secondsToTimeFmt(seconds: number) {
  const secReminder = seconds % 60;
  const minutes = (seconds - secReminder) / 60;
  const minutesReminder = minutes % 60;
  const hours = (minutes - minutesReminder) / 60;
  let output: string = '';
  if (hours > 0) {
    output = `${hours.toString().padStart(2, '0')}:`;
  }
  output += `${minutes.toString().padStart(2, '0')}:${secReminder.toString().padStart(2, '0')}`;
  return output;
}

function numberFormat(n: number) {
  if (n > 1000000000) {
    return `${Math.round(n / 1000000000)}B`;
  }
  if (n > 1000000) {
    return `${Math.round(n / 1000000)}M`;
  }
  if (n > 1000) {
    return `${Math.round(n / 1000)}k`;
  }
  return n.toLocaleString();
}

function makeInfoLineFromYouTubeInfo({
  videoDetails: { title, dislikes, likes, ownerChannelName, uploadDate, viewCount, lengthSeconds },
}: ytdl.videoInfo): string {
  const _ = '\u00A0';
  const lengthFmt = secondsToTimeFmt(parseInt(lengthSeconds));
  let viewsFmt: string = viewCount;
  if (viewCount.match(/^\d+$/)) {
    viewsFmt = numberFormat(parseInt(viewCount));
  }
  const likesFmt = numberFormat(likes ?? 0);
  const dislikesFmt = numberFormat(dislikes ?? 0);
  return [
    title,
    `👁${_}${viewsFmt}${_}${_}👍${_}${likesFmt}${_}${_}👎${_}${dislikesFmt}${_}${_}🕒${_}${lengthFmt}`,
    `ⓘ Channel: ${_}${ownerChannelName}${_}${_}⬆${_}${uploadDate}`,
  ]
    .filter((item) => item != null)
    .join('\n');
}

function findThumbnail(thumbnails: ytdl.thumbnail[]): string {
  let maxWidth = 0;
  let maxIndex = 0;
  for (let i = 0; i < thumbnails.length; i++) {
    if (thumbnails[i].width > maxWidth) {
      maxWidth = thumbnails[i].width;
      maxIndex = i;
    }
  }
  return thumbnails[maxIndex].url;
}

async function makeYouTubePreview(videoInfo: ytdl.videoInfo): Promise<Buffer> {
  const {
    videoDetails: { title, dislikes, likes, ownerChannelName, uploadDate, viewCount, lengthSeconds },
  } = videoInfo;
  const lengthFmt = secondsToTimeFmt(parseInt(lengthSeconds));
  let viewsFmt: string = viewCount;
  if (viewCount.match(/^\d+$/)) {
    viewsFmt = numberFormat(parseInt(viewCount));
  }
  const likesFmt = numberFormat(likes ?? 0);
  const dislikesFmt = numberFormat(dislikes ?? 0);

  const thumbnailUrl = findThumbnail(videoInfo.videoDetails.thumbnails);
  let imageData = await (await fetch(thumbnailUrl)).buffer();
  imageData = await sharp(imageData).resize({ width: 800, height: 450 }).toBuffer();

  let svgPageData = fs.readFileSync('dev/drawing-opt.svg', 'utf8');
  svgPageData = svgPageData.replace('#videoTitle', title);
  svgPageData = svgPageData.replace('#channelName', ownerChannelName);
  svgPageData = svgPageData.replace('#viewsCount', viewsFmt);
  svgPageData = svgPageData.replace('#likes', likesFmt);
  svgPageData = svgPageData.replace('#dislikes', dislikesFmt);
  svgPageData = svgPageData.replace('#uploaded', uploadDate);
  const svgPageBuffer = Buffer.from(svgPageData);

  let svgTimeLabelData = fs.readFileSync('dev/time-label-opt.svg', 'utf8');
  svgTimeLabelData = svgTimeLabelData.replace('#time', lengthFmt);
  const svgTimeLabelBuffer = Buffer.from(svgTimeLabelData);

  return await sharp(svgPageBuffer)
    .composite([
      {
        input: imageData,
        left: 110,
        top: 0,
      },
      {
        input: svgTimeLabelBuffer,
        left: 850,
        top: 380,
      },
    ])
    .jpeg()
    .toBuffer();
}
