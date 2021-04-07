# Command line Zello player

This is a command line tool to play audio files on a Zello channel.

It uses [TS Zello](https://github.com/OnkelTem/ts-zello) library.

The tool is currently under development and is not ready for "production".
There are things to do first, see the [TODO](#todo) section below.

## Installation (to be)

```
$ npm i -g ts-zello-player
```


## Configuration

The player reads account and channel information from a  `credentials.json` in the current directory, 
so please create one first. You can use `credentials.default.json` as a template.

See [Zello authentication docs](https://github.com/zelloptt/zello-channel-api/blob/master/AUTH.md) 
on how to get the token for your account. 

## Usage

```
$ ts-zello-player "path/to/music/Dream Theater - Pull Me Under.mp3" 
```

## TODO

- [ ] Add command line options: bitrate, sampling rate and (maybe) frame size.
- [ ] Add channel selection in the command line.
- [ ] Add support for YouTube links.
