import { workflow, node, trigger, ifElse, newCredential, expr } from '@n8n/workflow-sdk';

const verifyWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Facebook verification',
    parameters: { httpMethod: 'GET', path: 'facebook-bot', responseMode: 'responseNode', options: {} }
  },
  output: [{ query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'token', 'hub.challenge': '123' } }]
});

const verifyToken = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Verify token setting',
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: { __rl: true, mode: 'name', value: 'bot_settings' },
      filters: { conditions: [{ keyName: 'key', condition: 'eq', keyValue: 'meta_verify_token' }] },
      limit: 1
    }
  },
  output: [{ key: 'meta_verify_token', value: 'token' }]
});

const tokenMatches = ifElse({
  version: 2.3,
  config: {
    name: 'Token matches?',
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr("{{ !!$json.value && $('Facebook verification').item.json.query['hub.mode'] === 'subscribe' && $('Facebook verification').item.json.query['hub.verify_token'] === $json.value }}"), operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } }
  }
});

const answerChallenge = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Answer the challenge',
    parameters: { respondWith: 'text', responseBody: expr("{{ $('Facebook verification').item.json.query['hub.challenge'] }}"), options: { responseCode: 200 } }
  },
  output: [{}]
});

const refuse = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: { name: 'Refuse', parameters: { respondWith: 'text', responseBody: 'forbidden', options: { responseCode: 403 } } },
  output: [{}]
});

const messagesWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Facebook messages',
    parameters: { httpMethod: 'POST', path: 'facebook-bot', responseMode: 'onReceived', options: { rawBody: true } }
  },
  output: [{ headers: { 'x-hub-signature-256': 'sha256=abc' }, body: { object: 'instagram', entry: [] } }]
});

const signBody = node({
  type: 'n8n-nodes-base.crypto',
  version: 2,
  config: {
    name: 'Sign the raw body',
    parameters: { action: 'hmac', type: 'SHA256', binaryData: true, binaryPropertyName: 'data', encoding: 'hex', dataPropertyName: 'signature' },
    credentials: { crypto: newCredential('Meta app secret') }
  },
  output: [{ headers: { 'x-hub-signature-256': 'sha256=abc' }, body: { object: 'instagram', entry: [] }, signature: 'abc' }]
});

const signedByMeta = ifElse({
  version: 2.3,
  config: {
    name: 'Signed by Facebook?',
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr("{{ 'sha256=' + $json.signature === $json.headers['x-hub-signature-256'] }}"), operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } }
  }
});

const stopUnsigned = node({ type: 'n8n-nodes-base.noOp', version: 1, config: { name: 'Stop: not signed by Facebook' }, output: [{}] });

const readMessage = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Read Instagram or Messenger message', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: '@@code/read-facebook.js' } },
  output: [{ channel: 'ig', chat_id: 'ig:111', msg_id: 'm1', from_me: false, kind: 'text', text: 'سلام', name: '', media: {}, media_url: '' }]
});

const toBrain = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: {
    name: 'Hand to the brain',
    parameters: {
      mode: 'each',
      source: 'database',
      workflowId: { __rl: true, mode: 'id', value: 'BRAIN_WORKFLOW_ID' },
      workflowInputs: { mappingMode: 'defineBelow', value: {
        channel: expr('{{ $json.channel }}'),
        chat_id: expr('{{ $json.chat_id }}'),
        msg_id: expr('{{ $json.msg_id }}'),
        from_me: expr('{{ $json.from_me }}'),
        kind: expr('{{ $json.kind }}'),
        text: expr('{{ $json.text }}'),
        name: expr('{{ $json.name }}'),
        media: expr('{{ $json.media }}'),
        media_url: expr('{{ $json.media_url }}')
      }, matchingColumns: [], schema: [
        { id: 'channel', displayName: 'channel', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
        { id: 'chat_id', displayName: 'chat_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
        { id: 'msg_id', displayName: 'msg_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
        { id: 'from_me', displayName: 'from_me', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'boolean' },
        { id: 'kind', displayName: 'kind', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
        { id: 'text', displayName: 'text', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
        { id: 'name', displayName: 'name', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
        { id: 'media', displayName: 'media', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'object' },
        { id: 'media_url', displayName: 'media_url', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }
      ], attemptToConvertTypes: false, convertFieldsToString: false },
      options: { waitForSubWorkflow: false }
    }
  },
  output: [{}]
});

export default workflow('bot-facebook', 'bot · facebook')
  .add(verifyWebhook)
  .to(verifyToken)
  .to(tokenMatches
    .onTrue(answerChallenge)
    .onFalse(refuse))
  .add(messagesWebhook)
  .to(signBody)
  .to(signedByMeta
    .onTrue(readMessage.to(toBrain))
    .onFalse(stopUnsigned));
