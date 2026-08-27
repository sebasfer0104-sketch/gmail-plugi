---
name: gmail-triage
description: Run an inbox triage workflow on Gmail: list unread messages, group by sender or label, summarize, and ask the user what to do with each group (reply, archive, mark as read, leave for later).
---

# Gmail Triage

Reusable workflow to review the inbox and decide what to do with each group of emails.

## When to use

When the user says things like:
- "review my inbox"
- "what do I have unread"
- "triage my emails"
- "clean up my inbox"

## Steps

1. Call `gmail_list_recent` with `unreadOnly: true` and `maxResults: 25`.
2. If there are fewer than 25, call `gmail_search` with `query: "is:unread newer_than:7d"` to fetch the rest of the week.
3. Group the stubs by `from` (domain) and detect threads (same `threadId`).
4. Show the user a short summary: how many unread emails, how many distinct senders, and the top 3-5 most important (by snippet).
5. Ask the user what action to take by group:
   - Reply (call `gmail_get_message` to see the content, then `gmail_reply`)
   - Mark as read (call `gmail_modify` with `markRead: true`)
   - Archive (call `gmail_modify` with `removeLabelIds: ["INBOX"]`)
   - Leave for later (do nothing)
6. Execute the confirmed actions and report the final summary.

## Rules

- Do NOT reply to emails without the user confirming the body of the message.
- Do NOT archive emails from senders the user has not previously marked as "promotions" or "spam".
- If an action fails with 429 (rate limit), wait 5 seconds and retry once.
- If an action fails with 401, the token expired: tell the user to re-authorize.
