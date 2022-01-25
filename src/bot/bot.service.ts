/* eslint-disable @typescript-eslint/no-var-requires */
import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bull';
import { ParsedIrcMessage } from 'src/poorchat/interfaces/poorchat.interface';
import { Poorchat } from 'src/poorchat/poorchat';
import { YoutubeService } from 'src/youtube/youtube.service';
import { CreatedMessage } from './interfaces/bot.interface';
const ora = require('ora');
const chalk = require('chalk');

@Injectable()
export class BotService {
  private readonly client: Poorchat;
  private job: boolean;

  constructor(
    private configService: ConfigService,
    private youtubeService: YoutubeService,
    @InjectQueue('message') private readonly messageQueue: Queue,
  ) {
    this.job = false;
    this.client = new Poorchat({
      websocket: this.configService.get<string>('IRC_WS'),
      irc: this.configService.get<string>('IRC'),
      channel: this.configService.get<string>('IRC_CHANNEL'),
      login: this.configService.get<string>('USER_LOGIN'),
      password: this.configService.get<string>('USER_PASSWORD'),
      cap: [
        'CAP REQ :batch',
        'CAP REQ :cap-notify',
        'CAP REQ :echo-message',
        'CAP REQ :server-time',
        'CAP REQ :msgid',
        'CAP REQ :poorchat.net/blocks',
        'CAP REQ :poorchat.net/clear',
        'CAP REQ :poorchat.net/embed',
        'CAP REQ :poorchat.net/color',
        'CAP REQ :poorchat.net/subscription',
        'CAP REQ :poorchat.net/subscriptiongifter',
        'CAP REQ :multi-prefix',
      ],
      debug: false,
    });
  }

  messageCreator = (IRCMessage: ParsedIrcMessage): CreatedMessage => {
    const messageBody = IRCMessage.params[1];
    const messageChannel = IRCMessage.params[0];
    let subscription = 0;
    let subscriptionBadge = null;
    let subscriptiongifter = 0;
    let week_position = null;

    const author =
      IRCMessage.command === 'PRIVMSG'
        ? IRCMessage.prefix.split('!')[0]
        : 'irc.poorchat.net';

    if (IRCMessage.tags['poorchat.net/subscription']) {
      subscription = JSON.parse(
        IRCMessage.tags['poorchat.net/subscription'].replace(/\\s/g, ''),
      ).months;
      subscriptionBadge = JSON.parse(
        IRCMessage.tags['poorchat.net/subscription'].replace(/\\s/g, ''),
      ).badge;
    }

    if (IRCMessage.tags['poorchat.net/subscriptiongifter']) {
      subscriptiongifter = JSON.parse(
        IRCMessage.tags['poorchat.net/subscriptiongifter'].replace(/\\s/g, ''),
      ).months;
      week_position = JSON.parse(
        IRCMessage.tags['poorchat.net/subscriptiongifter'].replace(/\\s/g, ''),
      ).week_position;
    }

    const messageData = {
      type: IRCMessage.command,
      channel: messageChannel,
      author: author,
      body: messageBody,
      color: IRCMessage.tags['poorchat.net/color'] || '',
      subscription: subscription,
      subscriptionBadge: subscriptionBadge,
      subscriptiongifter: subscriptiongifter,
      week_position: week_position,
    };

    return messageData;
  };

  async messageHandler(IRCmessage: ParsedIrcMessage) {
    const message = this.messageCreator(IRCmessage);
    const link = message.body.trim().split(' ')[0].trim();

    try {
      if (this.youtubeService.validateLink(link)) {
        this.client.pm(message.author, 'Pobieram...');
        const job = await this.messageQueue.add('addSong', {
          link: link,
          message: message,
        });
        if (!this.job) {
          job.queue.on('progress', (_, data) => {
            this.client.pm(data.author, data.message);
          });
          this.job = true;
        }
      } else {
        // Try Other Comands
      }
    } catch (error) {
      console.log(error);
      this.client.pm(message.author, 'Coś poszło nie tak :(');
    }
  }

  async run() {
    await this.client.connect();
    ora(chalk.black.bgYellow('[IRC]: Listening')).start();
    this.client.on('priv', this.messageHandler.bind(this));
  }
}
