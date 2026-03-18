import { Server } from 'socket.io';
import { loadConfig } from './configManager';

// @ts-ignore
import * as tmi from 'tmi.js';

import { EventSubWsListener } from '@twurple/eventsub-ws';
import { ApiClient } from '@twurple/api';
import { StaticAuthProvider } from '@twurple/auth';

let chatClient: any = null;
let eventSubListener: EventSubWsListener | null = null;

export const stopChatMonitor = () => {
  if (chatClient) {
    chatClient.disconnect();
    chatClient = null;
  }
  console.log('Chat monitor stopped');
};

export const connectToEventSub = (io: Server, userId: string, accessToken: string, clientId: string) => {
  if (eventSubListener) {
    eventSubListener.stop();
    eventSubListener = null;
  }

  try {
    const authProvider = new StaticAuthProvider(clientId, accessToken);
    const apiClient = new ApiClient({ authProvider });
    eventSubListener = new EventSubWsListener({ apiClient });

    eventSubListener.onChannelRedemptionAdd(userId, (event) => {
      const config = loadConfig();
      config.triggers.forEach((trigger) => {
        if (trigger.type !== 'points' || !trigger.rewardName) return;
        if (event.rewardTitle.toLowerCase() === trigger.rewardName.toLowerCase()) {
          console.log(`Channel points trigger matched: ${trigger.rewardName} by ${event.userDisplayName}`);
          io.emit('triggerMatched', {
            id: trigger.id,
            effectConfig: trigger.effectConfig,
            駆動方法: trigger.駆動方法,
            そくど: trigger.そくど,
            かず: trigger.かず,
            画像指定: trigger.画像指定,
            回転: trigger.回転,
            蓄積: trigger.蓄積,
            消す時間: trigger.消す時間,
            方向: trigger.方向,
            サイズ倍率: trigger.サイズ倍率,
            username: event.userDisplayName,
            timestamp: new Date().toISOString(),
          });
        }
      });
    });

    eventSubListener.start();
    console.log('EventSub listener started');
  } catch (error) {
    console.error('EventSub connection error:', error);
    io.emit('chatStatus', {
      status: 'error',
      message: `EventSub 接続失敗: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
};

export const disconnectEventSub = () => {
  if (eventSubListener) {
    eventSubListener.stop();
    eventSubListener = null;
    console.log('EventSub disconnected');
  }
};

export const connectToTwitchChat = async (io: Server, channel: string, accessToken?: string) => {
  if (chatClient) {
    chatClient.disconnect();
    chatClient = null;
  }

  try {
    chatClient = new tmi.Client({
      options: { debug: true },
      connection: { reconnect: true, secure: true },
      channels: [channel],
      identity: {
        username: channel,
        password: accessToken ? `oauth:${accessToken}` : undefined,
      },
    });

    chatClient.on('message', (target: string, context: any, msg: string, self: boolean) => {
      if (self) return;
      onChatMessage(io, msg, context['display-name']);
    });

    chatClient.on('connected', (addr: string, port: number) => {
      console.log(`Connected to ${addr}:${port}`);
      io.emit('chatStatus', { status: 'connected', message: 'Twitch チャットに接続しました' });
    });

    chatClient.on('disconnected', (reason: string) => {
      console.log('Disconnected:', reason);
      io.emit('chatStatus', { status: 'disconnected', message: '切断されました' });
    });

    await chatClient.connect();
  } catch (error) {
    console.error('Error connecting to Twitch chat:', error);
    io.emit('chatStatus', { status: 'error', message: 'チャット接続に失敗しました' });
  }
};

export const onChatMessage = (io: Server, message: string, username: string) => {
  const config = loadConfig();

  config.triggers.forEach((trigger) => {
    const triggerType = trigger.type ?? 'keyword';
    if (triggerType !== 'keyword' || !trigger.ワード) return;

    if (message.toLowerCase().includes(trigger.ワード.toLowerCase())) {
      console.log(`Trigger matched: ${trigger.ワード} from ${username}`);

      io.emit('triggerMatched', {
        id: trigger.id,
        effectConfig: trigger.effectConfig,
        駆動方法: trigger.駆動方法,
        そくど: trigger.そくど,
        かず: trigger.かず,
        画像指定: trigger.画像指定,
        回転: trigger.回転,
        蓄積: trigger.蓄積,
        消す時間: trigger.消す時間,
        方向: trigger.方向,
        サイズ倍率: trigger.サイズ倍率,
        username,
        timestamp: new Date().toISOString(),
      });
    }
  });
};
