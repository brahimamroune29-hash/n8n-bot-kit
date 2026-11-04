import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';

const every15 = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Every 15 minutes', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] } } },
  output: [{}]
});

const settingsRows = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Settings',
    parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'name', value: 'bot_settings' }, returnAll: true }
  },
  output: [{ key: 'bot_enabled', value: 'true' }]
});

const dueChats = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Chats due',
    executeOnce: true,
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: { __rl: true, mode: 'name', value: 'bot_chats' },
      filters: { conditions: [{ keyName: 'follow_at', condition: 'lte', keyValue: expr('{{ $now.toISO() }}') }] },
      returnAll: true
    }
  },
  output: [{ chat_id: '999000000001', channel: 'wa', follow_at: '2026-01-01T00:00:00Z', follow_round: 0, opted_out: false, last_customer_at: '2026-01-01T00:00:00Z' }]
});

const pick = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Who gets a follow-up?', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: '@@code/pick-follow-ups.js' } },
  output: [{ chat_id: '999000000001', channel: 'wa', text: 'مرحبا من جديد', next_round: 1, next_at: '2026-01-02T00:00:00Z' }]
});

const hasText = ifElse({
  version: 2.3,
  config: {
    name: 'Something to send?',
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ !!$json.text }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } }
  }
});

const saveFollowUp = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Save follow-up',
    parameters: {
      resource: 'row',
      operation: 'insert',
      dataTableId: { __rl: true, mode: 'name', value: 'bot_messages' },
      columns: { mappingMode: 'defineBelow', value: {
        chat_id: expr('{{ $json.chat_id }}'),
        msg_id: expr('follow-{{ $execution.id }}-{{ $itemIndex }}'),
        role: 'bot',
        text: expr('{{ $json.text }}'),
        guard: 'follow-up'
      } }
    }
  },
  output: [{ id: 1 }]
});

const sendFollowUp = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: {
    name: 'Send follow-up',
    onError: 'continueRegularOutput',
    parameters: {
      mode: 'each',
      source: 'database',
      workflowId: { __rl: true, mode: 'id', value: 'SEND_WORKFLOW_ID' },
      workflowInputs: { mappingMode: 'defineBelow', value: {
        channel: expr("{{ $('Who gets a follow-up?').item.json.channel }}"),
        to: expr("{{ $('Who gets a follow-up?').item.json.chat_id }}"),
        text: expr("{{ $('Who gets a follow-up?').item.json.text }}")
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

const nextFollowUp = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Next follow-up',
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: { __rl: true, mode: 'name', value: 'bot_chats' },
      filters: { conditions: [{ keyName: 'chat_id', condition: 'eq', keyValue: expr("{{ $('Who gets a follow-up?').item.json.chat_id }}") }] },
      columns: { mappingMode: 'defineBelow', value: {
        follow_round: expr("{{ $('Who gets a follow-up?').item.json.next_round }}"),
        follow_at: expr("{{ $('Who gets a follow-up?').item.json.next_at }}")
      } }
    }
  },
  output: [{ id: 1 }]
});

export default workflow('bot-follow-ups', 'bot · follow-ups')
  .add(every15)
  .to(settingsRows)
  .to(dueChats)
  .to(pick)
  .to(hasText
    .onTrue(saveFollowUp.to(sendFollowUp).to(nextFollowUp))
    .onFalse(nextFollowUp));
