# Command line Zello player

This is a command line tool to play audio files on a Zello channel.

It uses [TS Zello](https://github.com/OnkelTem/ts-zello) library.

The tool is currently under development and is not ready for "production".
There are things to do first, see the [TODO](#todo) section below.

## Installation

Install the player:

```
$ npm i -g ts-zello-player
```

## Configuration

Create a json file `credentials.json` in the following format: 

```json
{
    "username": "<User Name>",
    "password": "<Password>",
    "auth_token": "<Auth Token>",
    "channel": "<Channel Name>"
}
```

See [Zello authentication docs](https://github.com/zelloptt/zello-channel-api/blob/master/AUTH.md) 
on how to get the token for your account.

## Quick start

Play a file on the default channel from `credentials.json`:

```
$ ts-zello-player "file.mp3" 
```

Play a YouTube video on another channel:

```
$ ts-zello-player -c ChannelName "https://www.youtube.com/watch?v=0hLnMDJ-gV4"
```

Play a file 
- from 35th second 
- at 0.75 speed
- at 0.5 volume 
- with bitrate of 32 Kbps
- on the channel "ChannelName":

```
$ ts-zello-player -b 32 -t 0.75 -l 0.5 -c ChannelName file.mp3 35
```

For the full list of options see below.

## Usage

```
$ ts-zello-player --help

Usage: ts-zello-player [options] <file> [start]
Usage: ts-zello-player [options] <youtube link> [start]

Positionals:
  target  A target to play, either file path or a YouTube link          [string]
  start   Start playback at                                             [string]

Options:
      --version      Show version number                               [boolean]
  -b, --bitrate      Bitrate in Kbps                      [number] [default: 32]
  -l, --volume       Volume factor                       [number] [default: 0.3]
  -r, --rate         (re)Sampling rate
                    [choices: 8000, 12000, 16000, 24000, 48000] [default: 48000]
  -t, --tempo        Tempo factor                                   [default: 1]
  -f, --frame        Frame size  [choices: 2.5, 5, 10, 20, 40, 60] [default: 20]
      --credentials  Credentials file path[string] [default: "credentials.json"]
  -c, --channel      Zello channel to connect to                        [string]
  -h, --help         Show help                                         [boolean]

Examples:
  ts-zello-player file.mp3                  play file.mp3
  ts-zello-player https://www.youtube.com/  play audio from the YouTube video
  watch?v=0hLnMDJ-gV4

```

## TODO

- [ ] Finish this README
- [ ] Record a short helping screencast 
- [ ] Fetch images from ID3 tags and previews from YouTube videos and post them optionally during playback
- [ ] Add _retry strategy_ selection to the command line options
