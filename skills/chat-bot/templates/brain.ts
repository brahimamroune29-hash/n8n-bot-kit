import { workflow, node, trigger, ifElse, newCredential, expr } from '@n8n/workflow-sdk';

const newMessage = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.2,
  config: {
    name: 'New message',
    parameters: {
      inputSource: 'workflowInputs',
      workflowInputs: { values: [
        { name: 'channel', type: 'string' },
        { name: 'chat_id', type: 'string' },
        { name: 'msg_id', type: 'string' },
        { name: 'from_me', type: 'boolean' },
        { name: 'kind', type: 'string' },
        { name: 'text', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'media', type: 'object' },
        { name: 'media_url', type: 'string' }
      ] }
    }
  },
  output: [{ channel: 'wa', chat_id: '999000000001', msg_id: 'ABC', from_me: false, kind: 'text', text: 'سلام', name: 'أمين', media: {}, media_url: '' }]
});

const notSeen = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Not seen before?',
    parameters: {
      resource: 'row',
      operation: 'rowNotExists',
      dataTableId: { __rl: true, mode: 'name', value: 'bot_messages' },
      filters: { conditions: [{ keyName: 'msg_id', condition: 'eq', keyValue: expr('{{ $json.msg_id }}') }] }
    }
  },
  output: [{ channel: 'wa', chat_id: '999000000001', msg_id: 'ABC', from_me: false, kind: 'text', text: 'سلام', name: 'أمين' }]
});

const settingsRows = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Settings',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'name', value: 'bot_settings' }, returnAll: true }
  },
  output: [{ key: 'bot_enabled', value: 'true' }]
});

const readSettings = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Read settings', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: '@@code/read-settings.js' } },
  output: [{ channel: 'wa', chat_id: '999000000001', msg_id: 'ABC', from_me: false, kind: 'text', text: 'سلام', name: 'أمين', media: {}, media_url: '', settings: { bot_enabled: 'true', human_minutes: '30' } }]
});

const fromShop = ifElse({
  version: 2.3,
  config: {
    name: 'Sent from the shop side?',
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.from_me }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } }
  }
});

const lastBotMessages = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Last bot messages',
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: { __rl: true, mode: 'name', value: 'bot_messages' },
      matchType: 'allConditions',
      filters: { conditions: [
        { keyName: 'chat_id', condition: 'eq', keyValue: expr('{{ $json.chat_id }}') },
        { keyName: 'role', condition: 'eq', keyValue: 'bot' }
      ] },
      limit: 5,
      orderBy: true,
      orderByColumn: 'createdAt',
      orderByDirection: 'DESC'
    }
  },
  output: [{ id: 7, chat_id: '999000000001', role: 'bot', text: 'أهلا' }]
});

const isEcho = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Is it our echo?', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: '@@code/is-echo.js' } },
  output: [{ chat_id: '999000000001', channel: 'wa', msg_id: 'ABC', text: 'سلام', echo: false, settings: { human_minutes: '30' } }]
});

const ownerTyped = ifElse({
  version: 2.3,
  config: {
    name: 'Typed by the owner?',
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ !$json.echo }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } }
  }
});

const saveOwnerMessage = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Save owner message',
    parameters: {
      resource: 'row',
      operation: 'insert',
      dataTableId: { __rl: true, mode: 'name', value: 'bot_messages' },
      columns: { mappingMode: 'defineBelow', value: {
        chat_id: expr('{{ $json.chat_id }}'),
        msg_id: expr('{{ $json.msg_id }}'),
        role: 'owner',
        text: expr('{{ $json.text }}'),
        guard: ''
      } }
    }
  },
  output: [{ id: 1, chat_id: '999000000001' }]
});

const pauseBot = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Pause the bot for this chat',
    parameters: {
      resource: 'row',
      operation: 'upsert',
      dataTableId: { __rl: true, mode: 'name', value: 'bot_chats' },
      filters: { conditions: [{ keyName: 'chat_id', condition: 'eq', keyValue: expr("{{ $('Is it our echo?').item.json.chat_id }}") }] },
      columns: { mappingMode: 'defineBelow', value: {
        chat_id: expr("{{ $('Is it our echo?').item.json.chat_id }}"),
        channel: expr("{{ $('Is it our echo?').item.json.channel }}"),
        human_until: expr("{{ $now.plus(Number($('Is it our echo?').item.json.settings.human_minutes || 30), 'minutes').toISO() }}"),
        follow_at: expr('{{ null }}'),
        summary_shown: false
      } }
    }
  },
  output: [{ id: 1 }]
});

const stopEcho = node({ type: 'n8n-nodes-base.noOp', version: 1, config: { name: 'Stop: echo of our own message' }, output: [{}] });

const isVoice = ifElse({
  version: 2.3,
  config: {
    name: 'Voice note?',
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.kind }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'voice' }], combinator: 'and' } }
  }
});

const isWhatsappVoice = ifElse({
  version: 2.3,
  config: {
    name: 'WhatsApp voice?',
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.channel }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'wa' }], combinator: 'and' } }
  }
});

const decryptVoice = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Decrypt WhatsApp voice',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://www.wasenderapi.com/api/decrypt-media',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBearerAuth',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ data: { messages: $json.media } }) }}'),
      options: { timeout: 20000 }
    },
    credentials: { httpBearerAuth: newCredential('Wasender API') }
  },
  output: [{ success: true, publicUrl: 'https://example.com/voice.ogg' }]
});

const downloadVoice = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Download voice',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: expr("{{ $json.publicUrl || $('Read settings').item.json.media_url }}"),
      options: { timeout: 20000, response: { response: { responseFormat: 'file' } } }
    }
  },
  output: [{}]
});

const transcribe = node({
  type: '@n8n/n8n-nodes-langchain.openAi',
  version: 2.3,
  config: {
    name: 'Transcribe voice',
    onError: 'continueRegularOutput',
    parameters: { resource: 'audio', operation: 'transcribe', binaryPropertyName: 'data', options: {} },
    credentials: { openAiApi: newCredential('OpenAI') }
  },
  output: [{ text: 'شحال العطر؟' }]
});

const voiceText = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Voice as text', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: '@@code/voice-text.js' } },
  output: [{ channel: 'wa', chat_id: '999000000001', msg_id: 'ABC', text: '🎤 شحال العطر؟', guard: '' }]
});

const saveCustomerMessage = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Save customer message',
    parameters: {
      resource: 'row',
      operation: 'insert',
      dataTableId: { __rl: true, mode: 'name', value: 'bot_messages' },
      columns: { mappingMode: 'defineBelow', value: {
        chat_id: expr('{{ $json.chat_id }}'),
        msg_id: expr('{{ $json.msg_id }}'),
        role: 'customer',
        text: expr('{{ $json.text }}'),
        guard: expr("{{ $json.guard || '' }}")
      } }
    }
  },
  output: [{ id: 1, chat_id: '999000000001', msg_id: 'ABC', role: 'customer', text: 'سلام' }]
});

const waitTyping = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: { name: 'Wait for more typing', parameters: { resume: 'timeInterval', amount: 8, unit: 'seconds' } },
  output: [{ id: 1, chat_id: '999000000001', msg_id: 'ABC' }]
});

const latestCustomerMessage = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Latest customer message',
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: { __rl: true, mode: 'name', value: 'bot_messages' },
      matchType: 'allConditions',
      filters: { conditions: [
        { keyName: 'chat_id', condition: 'eq', keyValue: expr("{{ $('Save customer message').item.json.chat_id }}") },
        { keyName: 'role', condition: 'eq', keyValue: 'customer' }
      ] },
      limit: 1,
      orderBy: true,
      orderByColumn: 'createdAt',
      orderByDirection: 'DESC'
    }
  },
  output: [{ id: 1, msg_id: 'ABC' }]
});

const stillLatest = ifElse({
  version: 2.3,
  config: {
    name: 'Still the latest?',
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ String($json.id) }}'), operator: { type: 'string', operation: 'equals' }, rightValue: expr("{{ String($('Save customer message').item.json.id) }}") }], combinator: 'and' } }
  }
});

const stopNewer = node({ type: 'n8n-nodes-base.noOp', version: 1, config: { name: 'Stop: a newer message will answer' }, output: [{}] });

const productRows = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Products',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'name', value: 'bot_products' }, returnAll: true }
  },
  output: [{ name: 'عطر', price: 3500, options: '', in_stock: true, notes: '' }]
});

const chatState = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Chat state',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: { __rl: true, mode: 'name', value: 'bot_chats' },
      filters: { conditions: [{ keyName: 'chat_id', condition: 'eq', keyValue: expr("{{ $('Save customer message').first().json.chat_id }}") }] },
      limit: 1
    }
  },
  output: [{ chat_id: '999000000001', pending_order: '', summary_shown: false }]
});

const historyRows = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'History',
    executeOnce: true,
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: { __rl: true, mode: 'name', value: 'bot_messages' },
      filters: { conditions: [{ keyName: 'chat_id', condition: 'eq', keyValue: expr("{{ $('Save customer message').first().json.chat_id }}") }] },
      limit: 20,
      orderBy: true,
      orderByColumn: 'createdAt',
      orderByDirection: 'DESC'
    }
  },
  output: [{ role: 'customer', text: 'سلام' }]
});

const buildRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Build AI request', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: '@@code/build-request.js' } },
  output: [{ go: true, request: { model: 'anthropic/claude-haiku-5.5', messages: [] } }]
});

const botAnswers = ifElse({
  version: 2.3,
  config: {
    name: 'Bot answers?',
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.go }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } }
  }
});

const stopOff = node({ type: 'n8n-nodes-base.noOp', version: 1, config: { name: 'Stop: bot off, test mode or a human has the chat' }, output: [{}] });

const askAi = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Ask AI',
    onError: 'continueRegularOutput',
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 3000,
    parameters: {
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'openRouterApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($json.request) }}'),
      options: { timeout: 60000 }
    },
    credentials: { openRouterApi: newCredential('OpenRouter') }
  },
  output: [{ choices: [{ message: { content: '{"intent":"chat","reply":"أهلا"}' } }] }]
});

const latestAfterAi = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Latest customer message after AI',
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: { __rl: true, mode: 'name', value: 'bot_messages' },
      matchType: 'allConditions',
      filters: { conditions: [
        { keyName: 'chat_id', condition: 'eq', keyValue: expr("{{ $('Save customer message').first().json.chat_id }}") },
        { keyName: 'role', condition: 'eq', keyValue: 'customer' }
      ] },
      limit: 1,
      orderBy: true,
      orderByColumn: 'createdAt',
      orderByDirection: 'DESC'
    }
  },
  output: [{ id: 1, msg_id: 'ABC' }]
});

const stillLatestAfterAi = ifElse({
  version: 2.3,
  config: {
    name: 'Still the latest after AI?',
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ String($json.id) }}'), operator: { type: 'string', operation: 'equals' }, rightValue: expr("{{ String($('Save customer message').first().json.id) }}") }], combinator: 'and' } }
  }
});

const stopWhileThinking = node({ type: 'n8n-nodes-base.noOp', version: 1, config: { name: 'Stop: the customer wrote again while the AI was thinking' }, output: [{}] });

const applyGuards = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Apply guards', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: '@@code/apply-guards.js' } },
  output: [{ channel: 'wa', chat_id: '999000000001', owner_phone: '999000000009', reply: 'أهلا', guard: '', alert: 'طلب جديد', order: { chat_id: '999000000001', channel: 'wa', customer_name: 'أمين', phone: '0123456789', address: 'وهران', items: 'عطر × 2', total: 7600, status: 'new' }, chat: { chat_id: '999000000001', channel: 'wa', name: '', pending_order: '', summary_shown: false, last_customer_at: '2026-01-01T00:00:00Z', follow_at: '2026-01-01T04:00:00Z', follow_round: 0, opted_out: false, human_until: null } }]
});

const hasOrder = ifElse({
  version: 2.3,
  config: {
    name: 'New order?',
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ !!$json.order }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } }
  }
});

const saveOrder = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Save order',
    parameters: {
      resource: 'row',
      operation: 'insert',
      dataTableId: { __rl: true, mode: 'name', value: 'bot_orders' },
      columns: { mappingMode: 'defineBelow', value: {
        chat_id: expr("{{ $('Apply guards').item.json.order.chat_id }}"),
        channel: expr("{{ $('Apply guards').item.json.order.channel }}"),
        customer_name: expr("{{ $('Apply guards').item.json.order.customer_name }}"),
        phone: expr("{{ $('Apply guards').item.json.order.phone }}"),
        address: expr("{{ $('Apply guards').item.json.order.address }}"),
        items: expr("{{ $('Apply guards').item.json.order.items }}"),
        total: expr("{{ $('Apply guards').item.json.order.total }}"),
        status: 'new'
      } }
    }
  },
  output: [{ id: 1 }]
});

const updateChat = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Update chat',
    parameters: {
      resource: 'row',
      operation: 'upsert',
      dataTableId: { __rl: true, mode: 'name', value: 'bot_chats' },
      filters: { conditions: [{ keyName: 'chat_id', condition: 'eq', keyValue: expr("{{ $('Apply guards').item.json.chat.chat_id }}") }] },
      columns: { mappingMode: 'defineBelow', value: {
        chat_id: expr("{{ $('Apply guards').item.json.chat.chat_id }}"),
        channel: expr("{{ $('Apply guards').item.json.chat.channel }}"),
        name: expr("{{ $('Apply guards').item.json.chat.name }}"),
        human_until: expr("{{ $('Apply guards').item.json.chat.human_until }}"),
        pending_order: expr("{{ $('Apply guards').item.json.chat.pending_order }}"),
        summary_shown: expr("{{ $('Apply guards').item.json.chat.summary_shown }}"),
        last_customer_at: expr("{{ $('Apply guards').item.json.chat.last_customer_at }}"),
        follow_at: expr("{{ $('Apply guards').item.json.chat.follow_at }}"),
        follow_round: expr("{{ $('Apply guards').item.json.chat.follow_round }}"),
        opted_out: expr("{{ $('Apply guards').item.json.chat.opted_out }}")
      } }
    }
  },
  output: [{ id: 1 }]
});

const hasAlert = ifElse({
  version: 2.3,
  config: {
    name: 'Tell the owner?',
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr("{{ !!$('Apply guards').item.json.alert && !!$('Apply guards').item.json.owner_phone }}"), operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } }
  }
});

const saveAlert = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Save alert',
    parameters: {
      resource: 'row',
      operation: 'insert',
      dataTableId: { __rl: true, mode: 'name', value: 'bot_messages' },
      columns: { mappingMode: 'defineBelow', value: {
        chat_id: expr("{{ String($('Apply guards').item.json.owner_phone).replace(/\\D/g, '') }}"),
        msg_id: expr('alert-{{ $execution.id }}'),
        role: 'bot',
        text: expr("{{ $('Apply guards').item.json.alert }}"),
        guard: 'alert'
      } }
    }
  },
  output: [{ id: 3 }]
});

const alertOwner = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: {
    name: 'Alert the owner',
    onError: 'continueRegularOutput',
    parameters: {
      mode: 'each',
      source: 'database',
      workflowId: { __rl: true, mode: 'id', value: 'SEND_WORKFLOW_ID' },
      workflowInputs: { mappingMode: 'defineBelow', value: {
        channel: 'wa',
        to: expr("{{ String($('Apply guards').item.json.owner_phone).replace(/\\D/g, '') }}"),
        text: expr("{{ $('Apply guards').item.json.alert }}")
      }, matchingColumns: [], schema: [
        { id: 'channel', displayName: 'channel', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
        { id: 'to', displayName: 'to', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
        { id: 'text', displayName: 'text', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }
      ], attemptToConvertTypes: false, convertFieldsToString: true },
      options: { waitForSubWorkflow: true }
    }
  },
  output: [{ success: true }]
});

const saveBotReply = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Save bot reply',
    parameters: {
      resource: 'row',
      operation: 'insert',
      dataTableId: { __rl: true, mode: 'name', value: 'bot_messages' },
      columns: { mappingMode: 'defineBelow', value: {
        chat_id: expr("{{ $('Apply guards').item.json.chat_id }}"),
        msg_id: expr('bot-{{ $execution.id }}'),
        role: 'bot',
        text: expr("{{ $('Apply guards').item.json.reply }}"),
        guard: expr("{{ $('Apply guards').item.json.guard }}")
      } }
    }
  },
  output: [{ id: 2 }]
});

const sendReply = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: {
    name: 'Send reply',
    parameters: {
      mode: 'each',
      source: 'database',
      workflowId: { __rl: true, mode: 'id', value: 'SEND_WORKFLOW_ID' },
      workflowInputs: { mappingMode: 'defineBelow', value: {
        channel: expr("{{ $('Apply guards').item.json.channel }}"),
        to: expr("{{ $('Apply guards').item.json.chat_id }}"),
        text: expr("{{ $('Apply guards').item.json.reply }}")
      }, matchingColumns: [], schema: [
        { id: 'channel', displayName: 'channel', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
        { id: 'to', displayName: 'to', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
        { id: 'text', displayName: 'text', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }
      ], attemptToConvertTypes: false, convertFieldsToString: true },
      options: { waitForSubWorkflow: true }
    }
  },
  output: [{ success: true }]
});

export default workflow('bot-brain', 'bot · brain')
  .add(newMessage)
  .to(notSeen)
  .to(settingsRows)
  .to(readSettings)
  .to(fromShop
    .onTrue(lastBotMessages.to(isEcho).to(ownerTyped
      .onTrue(saveOwnerMessage.to(pauseBot))
      .onFalse(stopEcho)))
    .onFalse(isVoice
      .onTrue(isWhatsappVoice
        .onTrue(decryptVoice.to(downloadVoice))
        .onFalse(downloadVoice))
      .onFalse(saveCustomerMessage)))
  .add(downloadVoice)
  .to(transcribe)
  .to(voiceText)
  .to(saveCustomerMessage)
  .to(waitTyping)
  .to(latestCustomerMessage)
  .to(stillLatest
    .onTrue(productRows.to(chatState).to(historyRows).to(buildRequest).to(botAnswers
      .onTrue(askAi.to(latestAfterAi).to(stillLatestAfterAi
        .onTrue(applyGuards)
        .onFalse(stopWhileThinking)))
      .onFalse(stopOff)))
    .onFalse(stopNewer))
  .add(applyGuards)
  .to(hasOrder
    .onTrue(saveOrder.to(updateChat))
    .onFalse(updateChat))
  .add(updateChat)
  .to(hasAlert
    .onTrue(saveAlert.to(alertOwner).to(saveBotReply))
    .onFalse(saveBotReply))
  .add(saveBotReply)
  .to(sendReply);
