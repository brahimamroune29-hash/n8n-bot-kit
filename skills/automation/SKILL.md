---
name: automation
description: Build any n8n automation through n8n's built-in MCP server, with the guards that stop it failing silently — webhooks answered at once and authenticated, duplicates skipped, a kill switch, a daily cap, loud errors, named stops — and tested before it goes live. Use when the user asks for an automation, a workflow, a scheduled job, a webhook, or connecting two apps in n8n. For a customer chat bot use the chat-bot skill instead.
---

# Automations in n8n

Build with the n8n MCP tools and follow the order their server instructions give (SDK reference → best practices → `search_nodes` → `get_node_types` → `validate_node_config` → `validate_workflow` → `create_workflow_from_code`). This skill adds what those steps leave out: the guards and the test. If the n8n tools are missing, the MCP server is not connected; the steps are in the chat-bot skill's `references/setup.md`, part 1.

## The question before every node
If this breaks, when does anyone find out, and who? If the answer is "when a customer complains", that is the bug to fix first. The enemy is not the red error, it is the silent green run.

## Working with the user
- Speak their language. At most 3 questions per round, each with a recommended default: what starts it, what it changes and where, what it reads or stores, who hears about a failure.
- Show the plan in 5–10 lines before building.
- Create unpublished. Publish only after their yes.

## Guards
| Guard | How in n8n | Why |
|---|---|---|
| Answer the webhook at once | Webhook `responseMode: 'onReceived'`, or a Respond to Webhook node before any slow work | a slow answer makes the provider resend, and Meta drops the subscription |
| Check the caller | Webhook `authentication: 'headerAuth'` with a credential, or a Crypto node HMAC of the raw body (`options.rawBody: true`) compared with the signature header | a webhook URL is public |
| Skip duplicates | Data table node `rowNotExists` on the event id, then insert the id | every provider resends some events |
| Kill switch | a `settings` table row (`enabled` = `true`) read right after the trigger, then an IF | switching off is one cell; deactivating the workflow loses the events that arrive meanwhile |
| Daily cap | count today's rows of the log table before a costly or sending action | a loop becomes a bill or a spammed customer |
| Loud errors | HTTP nodes `onError: 'continueErrorOutput'` wired to an alert, or an Error Trigger workflow set as `settings.errorWorkflow`; explain both and ask | an error swallowed by `continueRegularOutput` is a silent green run |
| Named stops | every IF/Filter output that ends a run goes to a NoOp named `Stop: <reason>` | the run shows where and why an event stopped |
| Secrets in credentials | `newCredential('Name')`, or the id from `list_credentials` | never in parameters, code or stickies |
| Explicit time zone | workflow setting `timezone`; in code `Intl.DateTimeFormat(..., { timeZone })` | n8n's clock is not the business's clock |

Working examples of each guard are in the chat-bot skill's templates: `whatsapp.ts` (header auth, answer at once), `facebook.ts` (HMAC with the Crypto node), `brain.ts` (`rowNotExists`, settings switch, named stops, side effects in a safe order), `follow-ups.ts` (time zone, quiet hours, one failure does not stop the others), `errors.ts` (an error workflow).

n8n facts that cost hours:
- Code nodes cannot `require('crypto')`; use the Crypto node.
- A node that returns 0 items simply ends that path. Use `alwaysOutputData` only where the empty case has its own branch.
- A node after a node that returns N rows runs N times; use `executeOnce: true` or read the rows with `$('Node').all()` in one Code node.
- A Postgres or Data table node replaces the item with its result; read earlier data with `$('Earlier node').item.json`.
- Branches that fan out from one node run one after the other, top first. When one side effect must survive another's failure, chain them in that order instead of fanning out.
- The MCP server adds data-table rows but cannot read or change them: the user edits cells in n8n, or you read them through a one-off workflow.

## Steps
1. Interview, then the plan.
2. Create the tables the guards need with `create_data_table`.
3. Write the SDK code; `validate_node_config` per node, then `validate_workflow` until it is valid and every warning is explained.
4. `create_workflow_from_code`, then test: `prepare_workflow_pin_data` + `test_workflow`, and one real event when possible. Read the run with `get_workflow_execution`.
5. After the user's yes, `publish_workflow`. Tell them where to see runs and which cell switches it off.
6. After a week, count runs and stops by reason with `search_workflow_executions`; fix the biggest count first.
