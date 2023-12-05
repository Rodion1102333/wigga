import TelegramBot from 'node-telegram-bot-api';
import { ChatGPTAPI } from 'chatgpt';
import * as dotenv from 'dotenv';
dotenv.config();

// консоль 
if (!process.env.TELEGRAM_TOKEN) {
  console.log('Пожалуйста, установите TELEGRAM_TOKEN в вашем файле .env.');
  process.exit(1);
}
const telegramToken = process.env.TELEGRAM_TOKEN;


// ChatGPT OpenAI API 
if (!process.env.CHATGPT_TOKEN) {
  console.log('Пожалуйста, установите CHATGPT_TOKEN в вашем файле .env.');
  process.exit(1);
}

const chatgptToken = process.env.CHATGPT_TOKEN;

const idsToProcess = process.env.WHITELISTED_TELEGRAM_IDS || '';
const whitelistedTelegramIds = idsToProcess.split(',').map(id => parseInt(id, 10));

// защита от спама ID
const processingQueueOfUserIds = [];

// отслеживание разговоров 
const conversationIdMap = [];

const getConversationId = (userId) => {
  const foundConversationId = conversationIdMap.find(item => item.userId === userId);

  if (foundConversationId)
    return {
      conversationId: foundConversationId.conversationId,
      parentMessageId: foundConversationId.parentMessageId
    };

  return false;
}

const setConversationId = (userId, conversationId, parentMessageId) => {
  const foundConversationId = conversationIdMap.findIndex(item => item.userId === userId);

  if (foundConversationId >= 0) {
    conversationIdMap[foundConversationId].conversationId = conversationId;
    conversationIdMap[foundConversationId].parentMessageId = parentMessageId;
  } else {
    conversationIdMap.push({
      userId,
      conversationId,
      parentMessageId,
    });
  }
}

// удалить идентификатор беседы с карты на основе идентификатора пользователя
const deleteConversationId = (userId) => {
  const foundConversationId = conversationIdMap.find(item => item.userId === userId);

  if (foundConversationId) {
    conversationIdMap.splice(conversationIdMap.indexOf(foundConversationId), 1);
  }
}

// опрос для получения новых обновлений
const bot = new TelegramBot(telegramToken, { polling: true });

// установка апи ключа
const chatgptApi = new ChatGPTAPI({
  apiKey: chatgptToken
});

// прослушивать все сообщения
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const isUserWhitelisted = whitelistedTelegramIds.includes(msg.from.id);
  bot.on("polling_error", console.log);

  // сброс истории разговора
  if (msg.text === '/reset') {
    deleteConversationId(msg.from.id);
    bot.sendMessage(chatId, 'Сброс разговора. Теперь вы можете начать новый разговор со мной.');
    return;
  }

  if (msg.text === '/start') {
    bot.sendMessage(chatId, "Добро пожаловать, <b>" + msg.chat.first_name + "</b>!\n\ㅤ\n\ Я - <b>WiggasAI</b>, напишите мне любое сообщение/вопрос, на который нужно ответить ↓\n\ㅤ\n\<b>Если у вас возникли трудности как пользоваться ботом</b>, команда: <b>/help</b> поможет вам!", {parse_mode: 'HTML'});
    bot.sendPhoto(chatId, `https://cdn.discordapp.com/attachments/1149344444856938557/1181655389624864848/logoza.ru_1.png?ex=6581d956&is=656f6456&hm=4f46723a0e51dbffb75f19cb&`)
    return;
  }
  
  if (msg.text === '/blabla') {
      bot.sendMessage(chatId, '<b>TEST</b>', {parse_mode: 'HTML'});
      return;
  }

  if (msg.text === '/help') {
    bot.sendMessage(chatId, 'Здравстуйте, <b>' + msg.chat.first_name + "!</b>\n\ㅤ\n\Я - <b>Wiggas AI</b>, текстовая нейросеть, созданная с целью облегчить процесс поиска информации. Я использую нейросетевые архитектуры OpenAI, которые помогают достичь большего процента правильности предсказаний.\n\ㅤ\n\<b>С помощью меня вы можете</b> с <b>легкостью</b> находить информацию, которая вам нужна.\n\ㅤ\n\<b>СПИСОК КОМАНД:</b>\n\ <b>/start</b> - команда для запуска бота.\n\ <b>/help</b> - команда для подробной инструкции пользования ботом.\n\ <b>/reset</b> - команда для сброса диалога со мной (в случае ошибок/багов).\n\<b>СПИСОК КОМАНД БУДЕТ ПОПОЛНЯТЬСЯ.</b>\n\ㅤ\n\<b>Чтобы начать диалог со мной, отправьте мне любое текстовое сообщение ниже ↓</b>", {parse_mode: 'HTML'});
    bot.sendPhoto(chatId, `https://cdn.discordapp.com/attachments/1127786110337155124/1181650415796879411/logoza.ru.png?ex=6581d4b5&is=656f5fb5&hm=bcc92c0b7e1dd18bccefcd8e&`);
    return;
  }

  // получить идентификатор беседы
  const { conversationId, parentMessageId } = getConversationId(msg.from.id);

  const generateResponse = async () => {
    // проверка ожидающей обработки сообщения от ChatGPT
    if (processingQueueOfUserIds.includes(msg.from.id)) {
      bot.sendMessage(chatId, 'ChatGPT все еще обрабатывает ваше последнее сообщение. Пожалуйста, дождитесь ответа, прежде чем отправлять другое сообщение.');
      return;
    }

    processingQueueOfUserIds.push(msg.from.id);

    let chatgptResponded = false;
    let lastTypingStatus = new Date();

    const chatgptOptions = {
      onProgress: (partialResponse) => {
        // отправка пользователю статус ввода текста
        if (chatgptResponded) return

        // запускайть функ. sendChatAction только раз в 4 секунды
        const timeElapsed = new Date() - lastTypingStatus;

        if (timeElapsed >= 4000) {
          bot.sendChatAction(chatId, 'typing');
          lastTypingStatus = new Date();
        }
      },
      ...(conversationId && { conversationId }),
      ...(parentMessageId && { parentMessageId }),
    }

    bot.sendChatAction(chatId, 'typing');

    try {
      const chatgptResponse = await chatgptApi.sendMessage(msg.text, chatgptOptions);
      chatgptResponded = true;

      // обновить идентификатор беседы
      if (!conversationId) {
        setConversationId(msg.from.id, chatgptResponse.conversationId, chatgptResponse.id)
      }

      // отправить сообщение в чат с ответом ChatGPT
      bot.sendMessage(chatId, chatgptResponse.text);
    } catch (error) {
      const errorMessage = `Ошибка API ChatGPT: ${error.statusCode} ${error.statusText}`;
      bot.sendMessage(chatId, errorMessage);
    }

    // удалить пользователя из обработки
    processingQueueOfUserIds.splice(processingQueueOfUserIds.indexOf(msg.from.id), 1);
  }

  generateResponse()
});