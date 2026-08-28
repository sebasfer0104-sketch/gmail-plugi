---
name: gmail-connector
description: Connect to Gmail accounts using OAuth 2.0 for secure access. Use when users want to read emails, send messages, manage drafts, or organize emails with labels. Trigger phrases include "connect my Gmail", "check my emails", "send an email", "manage Gmail drafts", "organize my inbox", "Gmail labels".
---

# Gmail Connector

Connect to Gmail via OAuth 2.0 and perform email operations through this plugin's MCP tools.

## How to use

- The first time the user asks for any Gmail operation, the plugin triggers an OAuth flow: it prints a URL, the user opens it, authorizes with their Google account, and the plugin stores the token locally.
- After authorization, all Gmail tools (`gmail_list_recent`, `gmail_get_message`, `gmail_search`, `gmail_send`, `gmail_reply`, `gmail_modify`) work without re-prompting.

## Operational rules

- Do NOT send or reply to emails without the user explicitly confirming the body.
- Do NOT mark emails as read or archive/delete them without the user confirming the action.
- If a tool call fails with 401, the OAuth token has expired or been revoked: tell the user to delete `token.json` and trigger the OAuth flow again.
- If a tool call fails with 429, wait 5 seconds and retry once.
- Use `gmail_search` with Gmail query syntax (`from:`, `subject:`, `is:`, `has:`, `label:`, `after:`, `before:`) for precise retrieval.
